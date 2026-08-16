// Perceptual hashing (dHash) and Hamming distance for duplicate detection.
//
// dHash compares the brightness of each pixel to its right-hand neighbour on a
// 9x8 greyscale downsample, yielding a 64-bit fingerprint. Two photos that look
// alike — the same scene, a burst frame, a re-save — land within a few bits of
// each other regardless of resolution or minor recompression.

export interface Grey {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/** Compute a 64-bit dHash rendered as a 16-char hex string. */
export function dHash(grey: Grey): string {
  const { data, w, h } = grey; // expects w = h + 1
  let bits = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const left = data[y * w + x];
      const right = data[y * w + x + 1];
      bits += left < right ? "1" : "0";
    }
  }
  // Pack 64 bits into 16 hex chars.
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];
}

/** Hamming distance between two 16-char hex hashes (0..64). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += POPCOUNT[xor];
  }
  return dist;
}
