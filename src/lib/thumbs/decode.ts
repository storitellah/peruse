// On-device image decoding for thumbnails and analysis.
//
// We decode with the browser's hardware-accelerated `createImageBitmap` and
// downscale onto a canvas. Two outputs come from one decode:
//   - a compact JPEG thumbnail object-URL for the grid, and
//   - a tiny greyscale pixel buffer reused by the perceptual-hash stage.
// The full-resolution pixels are never retained; only the downscaled result.

import type { Photo } from "../../types";
import { readBlob } from "../fs/scanner";

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

export async function decodePhoto(photo: Photo): Promise<DecodeResult> {
  const blob = await readBlob(photo);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    // Some formats (e.g. HEIC) may not decode in every browser. Fall back to a
    // plain decode without orientation handling.
    bitmap = await createImageBitmap(blob);
  }

  const w0 = bitmap.width;
  const h0 = bitmap.height;
  const aspect = w0 / h0 || 1;

  const scale = Math.min(1, THUMB_MAX / Math.max(w0, h0));
  const tw = Math.max(1, Math.round(w0 * scale));
  const th = Math.max(1, Math.round(h0 * scale));

  const { canvas, ctx } = getCanvas(tw, th);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
