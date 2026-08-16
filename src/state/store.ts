// The Peruse catalog store (Zustand).
//
// Holds the in-memory catalog and drives the local enrichment pipeline. The
// pipeline runs in stages so the UI fills in progressively:
//   scan → EXIF + reverse-geocode → thumbnail + perceptual hash → (opt) AI tags
// Photo objects are replaced (not mutated) on each stage so memoised tiles
// re-render precisely when their own data changes. Updates are buffered and
// flushed on an animation frame to keep large imports smooth.

import { create } from "zustand";
import type {
  DuplicateGroup,
  GridDensity,
  Photo,
  TabId,
} from "../types";
import {
  pickAndScanDirectory,
  scanFileList,
  toPhoto,
  supportsFsAccess,
} from "../lib/fs/scanner";
import { readBlob } from "../lib/fs/scanner";
import { extractMetadata, normalizeDevice } from "../lib/exif/extract";
import { reverseGeocode } from "../lib/geo/reverseGeocode";
import { decodeBlob } from "../lib/thumbs/decode";
import { dHash } from "../lib/hash/phash";
import { findDuplicates } from "../lib/hash/dedupe";
import { writeSidecar } from "../lib/exif/xmpSidecar";
import { analyzePhoto, encodeQuery, cosine, ensureClip, onLoadStatus, type LoadStatus } from "../lib/ai/vision";
import { literalMatch, looksSemantic } from "../lib/search/query";
import { mapPool } from "../lib/util/misc";

export type ActiveFilter =
  | { kind: "none" }
  | { kind: "device"; value: string }
  | { kind: "theme"; value: string }
  | { kind: "country"; value: string }
  | { kind: "city"; value: string }
  | { kind: "favorites" };

interface Toast {
  id: number;
  text: string;
}

interface PeruseState {
  photos: Photo[];
  ingested: boolean;
  scanning: boolean;
  scanFound: number;
  processed: number;

  activeTab: TabId;
  density: GridDensity;
  query: string;
  semanticScores: Map<string, number> | null;
  activeFilter: ActiveFilter;

  selectedId: string | null;
  lightboxId: string | null;
  inspectorOpen: boolean;

  duplicateGroups: DuplicateGroup[];

  aiStatus: LoadStatus;
  aiRunning: boolean;
  aiProgress: number;

  toasts: Toast[];

  // actions
  importDirectory: () => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<void>;
  setTab: (t: TabId) => void;
  setDensity: (d: GridDensity) => void;
  setQuery: (q: string) => void;
  setFilter: (f: ActiveFilter) => void;
  select: (id: string | null) => void;
  openLightbox: (id: string | null) => void;
  setInspectorOpen: (open: boolean) => void;
  updateIptc: (id: string, patch: Partial<Photo["iptc"]>) => void;
  setRating: (id: string, rating: number) => void;
  saveSidecar: (id: string) => Promise<void>;
  softDelete: (id: string) => void;
  restore: (id: string) => void;
  runAiTagging: () => Promise<void>;
  recomputeDuplicates: () => void;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
}

// --- batched patch buffer -------------------------------------------------
let patchBuffer = new Map<string, Partial<Photo>>();
let flushScheduled = false;

function scheduleFlush(set: SetFn, get: GetFn) {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => {
    flushScheduled = false;
    if (patchBuffer.size === 0) return;
    const patches = patchBuffer;
    patchBuffer = new Map();
    const photos = get().photos.map((p) =>
      patches.has(p.id) ? { ...p, ...patches.get(p.id)! } : p
    );
    set({ photos });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 16);
}

type SetFn = (partial: Partial<PeruseState> | ((s: PeruseState) => Partial<PeruseState>)) => void;
type GetFn = () => PeruseState;

function patchPhoto(set: SetFn, get: GetFn, id: string, patch: Partial<Photo>) {
  patchBuffer.set(id, { ...(patchBuffer.get(id) ?? {}), ...patch });
  scheduleFlush(set, get);
}

/** The photo as it will appear after the buffer flushes: committed state with
 *  any still-pending patch merged on top. Used within the pipeline so a later
 *  stage never reads stale nested data (e.g. EXIF) that hasn't flushed yet. */
function effective(get: GetFn, id: string): Photo | undefined {
  const base = get().photos.find((p) => p.id === id);
  if (!base) return undefined;
  const pending = patchBuffer.get(id);
  return pending ? { ...base, ...pending } : base;
}

let toastSeq = 0;

export const useStore = create<PeruseState>((set, get) => {
  // Mirror AI model status into the store.
  onLoadStatus((s) => set({ aiStatus: s }));

  async function enrich(photos: Photo[]) {
    // One interleaved pass per photo, thumbnail-first. The previous design
    // decoded no thumbnails until EXIF for the *entire* library had finished,
    // so a big folder showed nothing for a long time. Here each photo opens its
    // file once, paints its thumbnail immediately, then fills in hash + EXIF —
    // so tiles start appearing within the first frames of a scan and the grid
    // fills top-to-bottom as decoding proceeds.
    const concurrency = Math.min(6, Math.max(3, navigator.hardwareConcurrency || 4));
    await mapPool(photos, concurrency, async (p) => {
      let blob: Blob;
      try {
        blob = await readBlob(p);
      } catch {
        patchPhoto(set, get, p.id, { stage: "ready" });
        set((s) => ({ processed: s.processed + 1 }));
        return;
      }

      // Size / mtime are read here (one file open) rather than during the scan.
      const sizeBytes = "size" in blob ? (blob as File).size : p.sizeBytes;
      const lastModified = "lastModified" in blob ? (blob as File).lastModified : p.lastModified;

      // 1) Thumbnail + hash first — this is what the user sees.
      try {
        const dec = await decodeBlob(blob);
        patchPhoto(set, get, p.id, {
          thumbUrl: dec.thumbUrl,
          aspect: dec.aspect,
          phash: dHash(dec.grey),
          sizeBytes,
          lastModified,
          exif: { ...(effective(get, p.id)?.exif ?? {}), width: dec.width, height: dec.height },
          stage: "thumb",
        });
      } catch {
        patchPhoto(set, get, p.id, { sizeBytes, lastModified, stage: "thumb" });
      }

      // 2) EXIF + reverse geocode second — preserves the decoded dimensions.
      try {
        const { exif, iptc } = await extractMetadata(blob, lastModified);
        if (exif.gps) exif.place = reverseGeocode(exif.gps);
        const cur = effective(get, p.id);
        patchPhoto(set, get, p.id, {
          exif: { ...exif, width: cur?.exif?.width ?? exif.width, height: cur?.exif?.height ?? exif.height },
          iptc: { ...p.iptc, ...iptc, people: iptc.people ?? p.iptc.people, tags: iptc.tags ?? p.iptc.tags },
          stage: "ready",
        });
      } catch {
        patchPhoto(set, get, p.id, { stage: "ready" });
      }

      set((s) => ({ processed: s.processed + 1 }));
    });

    get().recomputeDuplicates();
  }

  return {
    photos: [],
    ingested: false,
    scanning: false,
    scanFound: 0,
    processed: 0,

    activeTab: "library",
    density: "medium",
    query: "",
    semanticScores: null,
    activeFilter: { kind: "none" },

    selectedId: null,
    lightboxId: null,
    inspectorOpen: false,

    duplicateGroups: [],

    aiStatus: { phase: "idle" },
    aiRunning: false,
    aiProgress: 0,

    toasts: [],

    async importDirectory() {
      try {
        set({ scanning: true, scanFound: 0 });
        const scanned = await pickAndScanDirectory((n) => set({ scanFound: n }));
        const fresh = scanned.map(toPhoto);
        set((s) => ({
          photos: [...s.photos, ...fresh],
          ingested: true,
          scanning: false,
        }));
        await enrich(fresh);
      } catch (err) {
        set({ scanning: false });
        if (err instanceof DOMException && err.name === "AbortError") return;
        get().toast(err instanceof Error ? err.message : "Import failed");
      }
    },

    async importFiles(files) {
      try {
        set({ scanning: true, scanFound: 0 });
        const scanned = scanFileList(files);
        set({ scanFound: scanned.length });
        const fresh = scanned.map(toPhoto);
        set((s) => ({
          photos: [...s.photos, ...fresh],
          ingested: true,
          scanning: false,
        }));
        await enrich(fresh);
      } catch (err) {
        set({ scanning: false });
        get().toast(err instanceof Error ? err.message : "Import failed");
      }
    },

    setTab: (t) => set({ activeTab: t }),
    setDensity: (d) => set({ density: d }),

    setQuery: (q) => {
      set({ query: q });
      // Semantic re-rank when a model is ready and the query is phrase-like.
      if (!q.trim() || !looksSemantic(q)) {
        set({ semanticScores: null });
        return;
      }
      void (async () => {
        const vec = await encodeQuery(q).catch(() => null);
        if (!vec) {
          set({ semanticScores: null });
          return;
        }
        if (get().query !== q) return; // stale
        const scores = new Map<string, number>();
        for (const p of get().photos) {
          if (p.embedding) scores.set(p.id, cosine(vec, p.embedding));
        }
        set({ semanticScores: scores });
      })();
    },

    setFilter: (f) => set({ activeFilter: f }),
    select: (id) => set({ selectedId: id, inspectorOpen: id ? true : get().inspectorOpen }),
    openLightbox: (id) => set({ lightboxId: id }),
    setInspectorOpen: (open) => set({ inspectorOpen: open }),

    updateIptc: (id, patch) => {
      set((s) => ({
        photos: s.photos.map((p) => (p.id === id ? { ...p, iptc: { ...p.iptc, ...patch } } : p)),
      }));
    },

    setRating: (id, rating) => {
      set((s) => ({
        photos: s.photos.map((p) => (p.id === id ? { ...p, iptc: { ...p.iptc, rating } } : p)),
      }));
    },

    async saveSidecar(id) {
      const photo = get().photos.find((p) => p.id === id);
      if (!photo) return;
      try {
        const res = await writeSidecar(photo);
        get().toast(res.wrote === "inplace" ? `Saved ${res.fileName} in place` : `Downloaded ${res.fileName}`);
      } catch (err) {
        get().toast(err instanceof Error ? err.message : "Could not write sidecar");
      }
    },

    softDelete: (id) => {
      set((s) => ({
        photos: s.photos.map((p) => (p.id === id ? { ...p, softDeleted: true } : p)),
        lightboxId: s.lightboxId === id ? null : s.lightboxId,
      }));
      get().recomputeDuplicates();
      get().toast("Moved to Trash");
    },

    restore: (id) => {
      set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, softDeleted: false } : p)) }));
      get().recomputeDuplicates();
    },

    async runAiTagging() {
      if (get().aiRunning) return;
      set({ aiRunning: true, aiProgress: 0 });
      const clip = await ensureClip();
      if (!clip) {
        set({ aiRunning: false });
        get().toast("On-device vision model unavailable");
        return;
      }
      const targets = get().photos.filter((p) => !p.softDeleted && !p.embedding);
      let done = 0;
      // Sequential: the model is single-session and CPU/GPU bound.
      for (const p of targets) {
        try {
          const res = await analyzePhoto(p);
          if (res) {
            patchPhoto(set, get, p.id, { embedding: res.embedding, aiTags: res.tags, stage: "tagged" });
          }
        } catch {
          /* skip this photo */
        }
        done += 1;
        set({ aiProgress: Math.round((done / targets.length) * 100) });
      }
      set({ aiRunning: false });
      get().toast(`Tagged ${targets.length} photo${targets.length === 1 ? "" : "s"} on-device`);
    },

    recomputeDuplicates: () => {
      set({ duplicateGroups: findDuplicates(get().photos) });
    },

    toast: (text) => {
      const t = { id: ++toastSeq, text };
      set((s) => ({ toasts: [...s.toasts, t] }));
      setTimeout(() => get().dismissToast(t.id), 3200);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

// --- selectors ------------------------------------------------------------

export function deviceLabel(p: Photo): string {
  return normalizeDevice(p.exif.make, p.exif.model);
}

export function canUseFsAccess(): boolean {
  return supportsFsAccess();
}

/** Apply search + sidebar filter, returning the visible, ranked set. */
export function selectVisible(state: PeruseState): Photo[] {
  let list = state.photos.filter((p) => !p.softDeleted);

  const f = state.activeFilter;
  if (f.kind === "device") list = list.filter((p) => deviceLabel(p) === f.value);
  else if (f.kind === "theme") list = list.filter((p) => p.aiTags.some((t) => t.label === f.value));
  else if (f.kind === "country") list = list.filter((p) => p.exif.place?.country === f.value);
  else if (f.kind === "city") list = list.filter((p) => p.exif.place?.city === f.value);
  else if (f.kind === "favorites") list = list.filter((p) => (p.iptc.rating ?? 0) >= 4);

  const q = state.query.trim();
  if (q) list = list.filter((p) => literalMatch(p, q));

  if (state.semanticScores && q) {
    const scores = state.semanticScores;
    const withEmb = list.some((p) => scores.has(p.id));
    if (withEmb) {
      list = [...list].sort((a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1));
      return list;
    }
  }

  // Default: newest first.
  return [...list].sort(
    (a, b) => (b.exif.takenAt ?? b.lastModified) - (a.exif.takenAt ?? a.lastModified)
  );
}
