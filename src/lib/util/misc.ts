// Small, dependency-free helpers used across Peruse.

let idCounter = 0;
/** Stable-ish unique id for a catalog entry within a session. */
export function makeId(seed: string): string {
  idCounter += 1;
  return `${hash32(seed)}-${idCounter.toString(36)}`;
}

/** FNV-1a 32-bit hash, rendered as base36. Cheap and good enough for keys. */
export function hash32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const e = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, e);
  return `${val.toFixed(val >= 100 || e === 0 ? 0 : 1)} ${units[e]}`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDate(epochMs?: number): string {
  if (!epochMs) return "Unknown date";
  const d = new Date(epochMs);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDateTime(epochMs?: number): string {
  if (!epochMs) return "Unknown date";
  const d = new Date(epochMs);
  const hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 || 12;
  return `${formatDate(epochMs)} · ${h12}:${mm} ${ampm}`;
}

export function monthDayLabel(epochMs: number): string {
  const d = new Date(epochMs);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Debounce a function by `ms`. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Run an async mapper over items with bounded concurrency. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    });
  await Promise.all(runners);
  return results;
}

// Still-image formats Peruse catalogs. HEIC/HEIF are the stills of Apple Live
// Photos, so they're accepted here — the paired motion file is a video and is
// rejected via VIDEO_EXTENSIONS below.
export const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "heic", "heif", "webp",
  "tif", "tiff", "avif", "gif", "bmp", "dng",
]);

// Motion formats Peruse never ingests — including the .mov half of a Live Photo.
// Detecting one next to a still is what flags that still as a Live Photo.
export const VIDEO_EXTENSIONS = new Set([
  "mov", "mp4", "m4v", "avi", "mkv", "webm", "hevc",
  "3gp", "3g2", "mpg", "mpeg", "wmv", "flv", "m2ts", "mts",
]);

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}
