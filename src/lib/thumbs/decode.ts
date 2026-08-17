// Thumbnail decoding — Worker pool with a main-thread fallback.
//
// `decodeThumb` returns a compact JPEG thumbnail blob plus a greyscale buffer
// for perceptual hashing. When the platform supports Workers + OffscreenCanvas
// (Chromium, modern Safari/Firefox), decoding runs in a pool of background
// threads so the UI never janks. Otherwise it falls back to the main thread.

export interface ThumbResult {
  thumbBlob: Blob;
  width: number;
  height: number;
  aspect: number;
  grey: { data: Uint8ClampedArray; w: number; h: number };
}

const THUMB_MAX = 448;
const HASH_W = 9;
const HASH_H = 8;

// --- Worker pool ----------------------------------------------------------

interface Pending {
  resolve: (r: ThumbResult) => void;
  reject: (e: unknown) => void;
}

let pool: Worker[] | null = null;
let idle: Worker[] = [];
const queue: { blob: Blob; p: Pending }[] = [];
const inflight = new Map<Worker, Pending>();
let jobSeq = 0;

function workersSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

function initPool() {
  if (pool) return;
  const n = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
  pool = [];
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL("./decodeWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const p = inflight.get(w);
      inflight.delete(w);
      idle.push(w);
      if (p) {
        const d = e.data;
        if (d.ok) {
          p.resolve({
            thumbBlob: new Blob([d.thumb], { type: "image/jpeg" }),
            width: d.width,
            height: d.height,
            aspect: d.aspect,
            grey: { data: d.grey, w: d.hashW, h: d.hashH },
          });
        } else {
          p.reject(new Error("worker decode failed"));
        }
      }
      dispatch();
    };
    w.onerror = () => {
      const p = inflight.get(w);
      inflight.delete(w);
      idle.push(w);
      p?.reject(new Error("worker error"));
      dispatch();
    };
    pool.push(w);
    idle.push(w);
  }
}

function dispatch() {
  while (idle.length && queue.length) {
    const w = idle.pop()!;
    const job = queue.shift()!;
    inflight.set(w, job.p);
    w.postMessage({ id: ++jobSeq, blob: job.blob });
  }
}

function decodeViaWorker(blob: Blob): Promise<ThumbResult> {
  initPool();
  return new Promise<ThumbResult>((resolve, reject) => {
    queue.push({ blob, p: { resolve, reject } });
    dispatch();
  });
}

// --- Main-thread fallback -------------------------------------------------

async function decodeMainThread(blob: Blob): Promise<ThumbResult> {
  let bitmap: ImageBitmap;
  let w0: number;
  let h0: number;
  try {
    const probe = await createImageBitmap(blob);
    w0 = probe.width;
    h0 = probe.height;
    const scale = Math.min(1, THUMB_MAX / Math.max(w0, h0));
    probe.close?.();
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
      resizeWidth: Math.max(1, Math.round(w0 * scale)),
      resizeHeight: Math.max(1, Math.round(h0 * scale)),
      resizeQuality: "medium",
    });
  } catch {
    bitmap = await createImageBitmap(blob);
    w0 = bitmap.width;
    h0 = bitmap.height;
  }

  const tw = bitmap.width;
  const th = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  const thumbBlob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.8)
  );

  const hc = document.createElement("canvas");
  hc.width = HASH_W;
  hc.height = HASH_H;
  const hctx = hc.getContext("2d", { willReadFrequently: true })!;
  hctx.drawImage(bitmap, 0, 0, HASH_W, HASH_H);
  const img = hctx.getImageData(0, 0, HASH_W, HASH_H);
  const grey = new Uint8ClampedArray(HASH_W * HASH_H);
  for (let i = 0; i < HASH_W * HASH_H; i++) {
    grey[i] = (img.data[i * 4] * 0.299 + img.data[i * 4 + 1] * 0.587 + img.data[i * 4 + 2] * 0.114) | 0;
  }
  bitmap.close?.();

  return { thumbBlob, width: w0, height: h0, aspect: w0 / h0 || 1, grey: { data: grey, w: HASH_W, h: HASH_H } };
}

export function decodeThumb(blob: Blob): Promise<ThumbResult> {
  return workersSupported() ? decodeViaWorker(blob) : decodeMainThread(blob);
}
