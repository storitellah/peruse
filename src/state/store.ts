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
import { mapPool, formatBytes } from "../lib/util/misc";
import {
  serializeCatalog,
  packBackup,
  unpackBackup,
  backupFileName,
  BackupError,
} from "../lib/backup/catalog";
import { saveBackupDir, loadBackupDir } from "../lib/backup/handleStore";

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

  // Catalog backup
  backupFrequency: BackupFrequency;
  backupEncrypt: boolean;
  lastBackupAt: number | null;
  backupDirName: string | null;
  backupBusy: boolean;

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
  // backup
  initBackup: () => Promise<void>;
  setBackupFrequency: (f: BackupFrequency) => void;
  setBackupEncrypt: (on: boolean) => void;
  setSessionPassphrase: (p: string) => void;
  chooseBackupFolder: () => Promise<void>;
  backupNow: (passphrase?: string) => Promise<void>;
  restoreBackup: (file: File, passphrase?: string) => Promise<void>;
  maybeAutoBackup: () => Promise<void>;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
}

export type BackupFrequency = "off" | "daily" | "weekly";

// Passphrase is held in memory for the session only — never written to disk,
// never put in the store (so it can't leak via devtools state serialisation).
let sessionPassphrase = "";

const LS = {
  freq: "peruse.backup.frequency",
  enc: "peruse.backup.encrypt",
  last: "peruse.backup.lastAt",
  dir: "peruse.backup.dirName",
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* private mode / disabled storage — settings just won't persist */
  }
}

const FREQ_MS: Record<BackupFrequency, number> = {
  off: Infinity,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

async function ensureDirWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    if (!dir.queryPermission) return true;
    let state = await dir.queryPermission({ mode: "readwrite" });
    if (state !== "granted" && dir.requestPermission) {
      state = await dir.requestPermission({ mode: "readwrite" });
    }
    return state === "granted";
  } catch {
    return false;
  }
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

    backupFrequency: "off",
    backupEncrypt: false,
    lastBackupAt: null,
    backupDirName: null,
    backupBusy: false,

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

    async initBackup() {
      const freq = (lsGet(LS.freq) as BackupFrequency) || "off";
      const enc = lsGet(LS.enc) === "1";
      const lastStr = lsGet(LS.last);
      const dir = await loadBackupDir();
      set({
        backupFrequency: freq === "daily" || freq === "weekly" ? freq : "off",
        backupEncrypt: enc,
        lastBackupAt: lastStr ? Number(lastStr) : null,
        backupDirName: dir?.name ?? lsGet(LS.dir),
      });
    },

    setBackupFrequency: (f) => {
      lsSet(LS.freq, f);
      set({ backupFrequency: f });
      void get().maybeAutoBackup();
    },

    setBackupEncrypt: (on) => {
      lsSet(LS.enc, on ? "1" : "0");
      set({ backupEncrypt: on });
    },

    setSessionPassphrase: (p) => {
      sessionPassphrase = p;
    },

    async chooseBackupFolder() {
      if (!supportsFsAccess() || !window.showDirectoryPicker) {
        get().toast("Folder backups need a Chromium browser or the desktop app");
        return;
      }
      try {
        const dir = await window.showDirectoryPicker({ id: "peruse-backup", mode: "readwrite" });
        await ensureDirWritable(dir);
        await saveBackupDir(dir);
        lsSet(LS.dir, dir.name);
        set({ backupDirName: dir.name });
        get().toast(`Backups will be saved to “${dir.name}”`);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        get().toast("Could not set backup folder");
      }
    },

    async backupNow(passphrase) {
      if (get().backupBusy) return;
      const photos = get().photos;
      if (!photos.length) {
        get().toast("Nothing to back up yet");
        return;
      }
      const pass = get().backupEncrypt ? passphrase ?? sessionPassphrase : undefined;
      if (get().backupEncrypt && !pass) {
        get().toast("Enter a passphrase to encrypt the backup");
        return;
      }
      set({ backupBusy: true });
      try {
        const snapshot = serializeCatalog(photos);
        const bytes = await packBackup(snapshot, pass);
        const fileName = backupFileName();
        const dir = await loadBackupDir();

        if (dir && (await ensureDirWritable(dir))) {
          const handle = await dir.getFileHandle(fileName, { create: true });
          const writable = await handle.createWritable();
          await writable.write(bytes);
          await writable.close();
          get().toast(`Backed up ${snapshot.count} photos → ${fileName} (${formatBytes(bytes.byteLength)})`);
        } else {
          const blob = new Blob([bytes], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          get().toast(`Backup ready (${formatBytes(bytes.byteLength)}) — saved to Downloads`);
        }
        const now = Date.now();
        lsSet(LS.last, String(now));
        set({ lastBackupAt: now });
      } catch (err) {
        get().toast(err instanceof Error ? err.message : "Backup failed");
      } finally {
        set({ backupBusy: false });
      }
    },

    async restoreBackup(file, passphrase) {
      set({ backupBusy: true });
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const snap = await unpackBackup(bytes, passphrase ?? (sessionPassphrase || undefined));
        const byPath = new Map(snap.photos.map((r) => [r.relPath, r]));
        let matched = 0;
        set((s) => ({
          photos: s.photos.map((p) => {
            const r = byPath.get(p.relPath);
            if (!r) return p;
            matched += 1;
            return {
              ...p,
              iptc: { ...p.iptc, ...r.iptc },
              softDeleted: r.softDeleted,
              aiTags: p.aiTags.length ? p.aiTags : r.aiTags,
              phash: p.phash ?? r.phash,
            };
          }),
        }));
        get().recomputeDuplicates();
        get().toast(
          matched
            ? `Restored metadata for ${matched} of ${snap.count} cataloged photos`
            : `Read ${snap.count} records — load the matching folder to re-apply them`
        );
      } catch (err) {
        const msg = err instanceof BackupError ? err.message : "Could not read that backup";
        get().toast(msg);
      } finally {
        set({ backupBusy: false });
      }
    },

    async maybeAutoBackup() {
      const { backupFrequency, backupEncrypt, lastBackupAt, photos } = get();
      if (backupFrequency === "off" || !photos.length) return;
      const due = !lastBackupAt || Date.now() - lastBackupAt >= FREQ_MS[backupFrequency];
      if (!due) return;
      const dir = await loadBackupDir();
      if (!dir) return; // no destination chosen; the Backup panel prompts for one
      if (backupEncrypt && !sessionPassphrase) {
        get().toast("Auto-backup is due — open Backup to enter your passphrase");
        return;
      }
      await get().backupNow();
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
