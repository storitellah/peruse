// Off-main-thread thumbnail decoding.
//
// Decoding a 12–48 MP photo and re-encoding a thumbnail is the single most
// expensive thing Peruse does per image. Doing it on the main thread janks
// scrolling; doing it here in a Worker keeps the UI at 60fps no matter how fast
// you flick through 100k photos. Each job returns a compact JPEG thumbnail plus
// a tiny greyscale buffer reused for perceptual hashing.

const THUMB_MAX = 448; // longest edge of the grid thumbnail
const HASH_W = 9;
const HASH_H = 8;

interface JobMsg {
  id: number;
  blob: Blob;
}

self.onmessage = async (e: MessageEvent<JobMsg>) => {
  const { id, blob } = e.data;
  try {
    const result = await decode(blob);
    (self as unknown as Worker).postMessage(
      { id, ok: true, ...result },
      [result.thumb, result.grey.buffer]
    );
  } catch {
    (self as unknown as Worker).postMessage({ id, ok: false });
  }
};

async function decode(blob: Blob) {
  let bitmap: ImageBitmap;
  let w0: number;
  let h0: number;
  try {
    const probe = await createImageBitmap(blob);
    w0 = probe.width;
    h0 = probe.height;
    const scale = Math.min(1, THUMB_MAX / Math.max(w0, h0));
    probe.close();
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
  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  const thumbBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const thumb = await thumbBlob.arrayBuffer();

  // Greyscale for hashing.
  const hc = new OffscreenCanvas(HASH_W, HASH_H);
  const hctx = hc.getContext("2d")!;
  hctx.drawImage(bitmap, 0, 0, HASH_W, HASH_H);
  const img = hctx.getImageData(0, 0, HASH_W, HASH_H);
  const grey = new Uint8ClampedArray(HASH_W * HASH_H);
  for (let i = 0; i < HASH_W * HASH_H; i++) {
    grey[i] = (img.data[i * 4] * 0.299 + img.data[i * 4 + 1] * 0.587 + img.data[i * 4 + 2] * 0.114) | 0;
  }
  bitmap.close();

  return {
    thumb, // ArrayBuffer (JPEG)
    width: w0,
    height: h0,
    aspect: w0 / h0 || 1,
    grey,
    hashW: HASH_W,
    hashH: HASH_H,
  };
}
