// On-device image decoding for thumbnails and analysis.
//
// We decode with the browser's hardware-accelerated `createImageBitmap` and
// downscale onto a canvas. Two outputs come from one decode:
//   - a compact JPEG thumbnail object-URL for the grid, and
//   - a tiny greyscale pixel buffer reused by the perceptual-hash stage.
// The full-resolution pixels are never retained; only the downscaled result.

export interface DecodeResult {
  thumbUrl: string;
  width: number;
  height: number;
  aspect: number;
  /** Greyscale luminance at a fixed small size, for perceptual hashing. */
  grey: { data: Uint8ClampedArray; w: number; h: number };
}

const THUMB_MAX = 512; // longest edge of the grid thumbnail
const HASH_W = 9; // dHash needs (N+1) x N samples
const HASH_H = 8;

function getCanvas(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  return { canvas, ctx };
}

async function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.82
    );
  });
}

export async function decodeBlob(blob: Blob): Promise<DecodeResult> {
  // Ask the decoder to downscale during decode: for a 12 MP phone photo this
  // produces a ~512 px bitmap directly instead of rasterising the full frame
  // and shrinking it afterwards — dramatically less work and memory per image,
  // which is what makes thumbnails appear quickly.
  let bitmap: ImageBitmap;
  const opts: ImageBitmapOptions = {
    imageOrientation: "from-image",
    resizeWidth: THUMB_MAX,
    resizeHeight: THUMB_MAX,
    resizeQuality: "medium",
  };
  try {
    // Probe true dimensions cheaply first so we can preserve aspect ratio.
    const probe = await createImageBitmap(blob);
    const w0 = probe.width;
    const h0 = probe.height;
    const scale = Math.min(1, THUMB_MAX / Math.max(w0, h0));
    opts.resizeWidth = Math.max(1, Math.round(w0 * scale));
    opts.resizeHeight = Math.max(1, Math.round(h0 * scale));
    probe.close?.();
    bitmap = await createImageBitmap(blob, opts);
    return await rasterise(bitmap, w0, h0);
  } catch {
    // Some formats (e.g. HEIC) may not decode in every browser; last-ditch try.
    bitmap = await createImageBitmap(blob);
    return await rasterise(bitmap, bitmap.width, bitmap.height);
  }
}

async function rasterise(bitmap: ImageBitmap, w0: number, h0: number): Promise<DecodeResult> {
  const aspect = w0 / h0 || 1;
  const tw = bitmap.width;
  const th = bitmap.height;

  const { canvas, ctx } = getCanvas(tw, th);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(bitmap, 0, 0, tw, th);
  const thumbBlob = await toBlob(canvas);
  const thumbUrl = URL.createObjectURL(thumbBlob);

  // Greyscale downsample for hashing, reusing the same bitmap.
  const { ctx: hctx } = getCanvas(HASH_W, HASH_H);
  hctx.drawImage(bitmap, 0, 0, HASH_W, HASH_H);
  const img = hctx.getImageData(0, 0, HASH_W, HASH_H);
  const grey = new Uint8ClampedArray(HASH_W * HASH_H);
  for (let i = 0; i < HASH_W * HASH_H; i++) {
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    grey[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  }

  bitmap.close?.();

  return { thumbUrl, width: w0, height: h0, aspect, grey: { data: grey, w: HASH_W, h: HASH_H } };
}
