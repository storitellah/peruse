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
  Theme,
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
import { ensureBorders } from "../lib/geo/borders";
import { decodeThumb } from "../lib/thumbs/decode";
import { getThumb, putThumb, thumbKey } from "../lib/thumbs/cache";
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

  // Appearance / filtering
  theme: Theme;
  hideScreenshots: boolean;
  hideNonCamera: boolean;

  // Duplicate scan
  dupScanning: boolean;
  dupScanProgress: number;

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
  scanDuplicates: () => Promise<void>;
  requestThumb: (id: string) => void;
  // appearance
  initAppearance: () => void;
  setTheme: (t: Theme) => void;
  setHideScreenshots: (on: boolean) => void;
  setHideNonCamera: (on: boolean) => void;
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

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
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

// --- lazy thumbnail decoding ---------------------------------------------
// Thumbnails decode on demand as tiles scroll into view, with a bounded LRU so
// memory stays flat even across a 100k-photo library. Evicted thumbnails are
// re-decoded if they scroll back — cheap, and it keeps the working set small.
const THUMB_CAP = 1800;
const THUMB_CONCURRENCY = 6;
const decodedOrder: string[] = [];
const decodingSet = new Set<string>();
const thumbFailed = new Set<string>();
const thumbQueue: string[] = [];
let activeDecodes = 0;

export const useStore = create<PeruseState>((set, get) => {
  // Mirror AI model status into the store.
  onLoadStatus((s) => set({ aiStatus: s }));

  async function enrich(photos: Photo[]) {
    // EXIF-first enrichment. This pass reads only file headers (fast, high
    // concurrency) — never full pixels — so it scales to 100k+ photos. It fills
    // in date, device, dimensions (→ aspect ratio for layout), precise country,
    // and camera/screenshot classification. Thumbnails are NOT decoded here;
    // they decode lazily on-view (see requestThumb) so nothing blocks and memory
    // stays bounded no matter how large the library is.
    if (photos.some((p) => p.exif.gps)) void ensureBorders(); // warm the geocoder
    const concurrency = Math.min(12, Math.max(4, (navigator.hardwareConcurrency || 4) * 2));
    await mapPool(photos, concurrency, async (p) => {
      let blob: Blob;
      try {
        blob = await readBlob(p);
      } catch {
        patchPhoto(set, get, p.id, { stage: "ready", isCameraPhoto: !p.isScreenshot });
        set((s) => ({ processed: s.processed + 1 }));
        return;
      }
      const sizeBytes = "size" in blob ? (blob as File).size : p.sizeBytes;
      const lastModified = "lastModified" in blob ? (blob as File).lastModified : p.lastModified;

      try {
        const { exif, iptc } = await extractMetadata(blob, lastModified);
        if (exif.gps) exif.place = await reverseGeocode(exif.gps);
        // A real camera photo has camera make/model and isn't a screenshot.
        const isCameraPhoto = !p.isScreenshot && !!(exif.make || exif.model);
        const aspect = exif.width && exif.height ? exif.width / exif.height : p.aspect;
        patchPhoto(set, get, p.id, {
          exif,
          iptc: { ...p.iptc, ...iptc, people: iptc.people ?? p.iptc.people, tags: iptc.tags ?? p.iptc.tags },
          aspect,
          sizeBytes,
          lastModified,
          isCameraPhoto,
          stage: "ready",
        });
      } catch {
        patchPhoto(set, get, p.id, { sizeBytes, lastModified, isCameraPhoto: !p.isScreenshot, stage: "ready" });
      }

      set((s) => ({ processed: s.processed + 1 }));
    });
  }

  function applyThumb(p: Photo, url: string, width: number, height: number, aspect: number, phash: string) {
    const cur = effective(get, p.id);
    patchPhoto(set, get, p.id, {
      thumbUrl: url,
      aspect: cur?.exif?.width && cur?.exif?.height ? cur.aspect : aspect,
      phash: p.phash ?? phash,
      exif: {
        ...(cur?.exif ?? {}),
        width: cur?.exif?.width ?? width,
        height: cur?.exif?.height ?? height,
      },
    });
    decodedOrder.push(p.id);
    while (decodedOrder.length > THUMB_CAP) {
      const old = decodedOrder.shift()!;
      if (old === p.id) continue;
      const op = get().photos.find((x) => x.id === old);
      if (op?.thumbUrl) {
        try {
          URL.revokeObjectURL(op.thumbUrl);
        } catch {
          /* already revoked */
        }
        patchPhoto(set, get, old, { thumbUrl: undefined });
      }
    }
  }

  async function decodeOne(p: Photo) {
    const key = thumbKey(p);

    // 1) Persistent cache — instant, no decode. This is what makes re-scrolls
    //    and app relaunches feel immediate.
    const cached = await getThumb(key);
    if (cached) {
      applyThumb(p, URL.createObjectURL(cached.blob), cached.width, cached.height, cached.aspect, cached.phash);
      return;
    }

    // 2) Decode off the main thread (Worker pool), then cache for next time.
    let blob: Blob;
    try {
      blob = await readBlob(p);
    } catch {
      thumbFailed.add(p.id);
      return;
    }
    try {
      const dec = await decodeThumb(blob);
      const phash = dHash(dec.grey);
      applyThumb(p, URL.createObjectURL(dec.thumbBlob), dec.width, dec.height, dec.aspect, phash);
      void putThumb({
        key,
        blob: dec.thumbBlob,
        width: dec.width,
        height: dec.height,
        aspect: dec.aspect,
        phash,
        ts: Date.now(),
      });
    } catch {
      thumbFailed.add(p.id); // e.g. a RAW/HEIC the browser can't decode
    }
  }

  function pumpThumbs() {
    while (activeDecodes < THUMB_CONCURRENCY && thumbQueue.length) {
      const id = thumbQueue.shift()!;
      if (decodingSet.has(id) || thumbFailed.has(id)) continue;
      const p = get().photos.find((x) => x.id === id);
      if (!p || p.softDeleted || p.thumbUrl) continue;
      decodingSet.add(id);
      activeDecodes += 1;
      void decodeOne(p).finally(() => {
        activeDecodes -= 1;
        decodingSet.delete(id);
        pumpThumbs();
      });
    }
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

    theme: "system",
    hideScreenshots: false,
    hideNonCamera: false,

    dupScanning: false,
    dupScanProgress: 0,

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

    requestThumb: (id) => {
      const p = get().photos.find((x) => x.id === id);
      if (!p || p.softDeleted || p.thumbUrl || decodingSet.has(id) || thumbFailed.has(id)) return;
      // LIFO: the most recently requested tiles are the ones on screen right
      // now, so decode those first when the user scrolls fast.
      const at = thumbQueue.indexOf(id);
      if (at !== -1) thumbQueue.splice(at, 1);
      thumbQueue.unshift(id);
      if (thumbQueue.length > 600) thumbQueue.length = 600; // drop stale off-screen requests
      pumpThumbs();
    },

    async scanDuplicates() {
      if (get().dupScanning) return;
      const targets = get().photos.filter((p) => !p.softDeleted && !p.phash);
      if (!targets.length) {
        get().recomputeDuplicates();
        return;
      }
      set({ dupScanning: true, dupScanProgress: 0 });
      let done = 0;
      // Decode small + hash only (thumbnail is a bonus if it fits the cache).
      await mapPool(targets, THUMB_CONCURRENCY, async (p) => {
        try {
          const key = thumbKey(p);
          // Reuse a cached hash/thumbnail if we already have one — no re-decode.
          const cached = await getThumb(key);
          if (cached?.phash) {
            patchPhoto(set, get, p.id, { phash: cached.phash });
          } else {
            const blob = await readBlob(p);
            const dec = await decodeThumb(blob);
            const phash = dHash(dec.grey);
            patchPhoto(set, get, p.id, { phash });
            // Warm the cache so viewing these later is instant.
            void putThumb({
              key,
              blob: dec.thumbBlob,
              width: dec.width,
              height: dec.height,
              aspect: dec.aspect,
              phash,
              ts: Date.now(),
            });
          }
        } catch {
          /* undecodable — skip */
        }
        done += 1;
        if (done % 50 === 0 || done === targets.length) {
          set({ dupScanProgress: Math.round((done / targets.length) * 100) });
        }
      });
      set({ dupScanning: false });
      get().recomputeDuplicates();
      get().toast(`Scanned ${targets.length} photos for duplicates`);
    },

    initAppearance: () => {
      const t = (lsGet("peruse.theme") as Theme) || "system";
      const hs = lsGet("peruse.hideScreenshots") === "1";
      const hnc = lsGet("peruse.hideNonCamera") === "1";
      applyTheme(t);
      set({ theme: t, hideScreenshots: hs, hideNonCamera: hnc });
    },
    setTheme: (t) => {
      lsSet("peruse.theme", t);
      applyTheme(t);
      set({ theme: t });
    },
    setHideScreenshots: (on) => {
      lsSet("peruse.hideScreenshots", on ? "1" : "0");
      set({ hideScreenshots: on });
    },
    setHideNonCamera: (on) => {
      lsSet("peruse.hideNonCamera", on ? "1" : "0");
      set({ hideNonCamera: on });
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

  // Screenshots / non-camera images: hidden when the user opts in. `isCameraPhoto`
  // is undefined until EXIF is read, so we only exclude once we're sure.
  if (state.hideScreenshots) list = list.filter((p) => !p.isScreenshot);
  if (state.hideNonCamera) list = list.filter((p) => p.isCameraPhoto !== false);

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
