// Catalog backup — compact, local, and optionally encrypted.
//
// Peruse treats your photos as a catalog: the valuable, non-reproducible layer
// is the *metadata* you build up (captions, people, tags, ratings, verified
// locations, AI labels, perceptual hashes), not the pixels — those already live
// safely on disk. So a backup snapshots only that metadata. It never contains
// image data, so it stays tiny (a few KB per thousand photos) and is written as
// a single gzip-compressed `.peruse` file — a format chosen precisely because
// it uses very little space.
//
// Security: backups can be encrypted with a passphrase using AES-256-GCM with a
// PBKDF2-derived key. Everything runs through the Web Crypto API on-device; the
// passphrase is never stored and nothing is ever transmitted.

import type { AiTag, ExifData, Iptc, Photo } from "../../types";

export const CATALOG_VERSION = 1;

export interface PhotoRecord {
  relPath: string;
  name: string;
  ext: string;
  sizeBytes: number;
  lastModified: number;
  isLivePhoto: boolean;
  softDeleted: boolean;
  aspect: number;
  phash?: string;
  exif: ExifData;
  iptc: Iptc;
  aiTags: AiTag[];
}

export interface CatalogSnapshot {
  app: "peruse";
  version: number;
  createdAt: number;
  count: number;
  photos: PhotoRecord[];
}

/** Snapshot the catalog metadata only — no pixels, thumbnails, or embeddings. */
export function serializeCatalog(photos: Photo[]): CatalogSnapshot {
  return {
    app: "peruse",
    version: CATALOG_VERSION,
    createdAt: Date.now(),
    count: photos.length,
    photos: photos.map((p) => ({
      relPath: p.relPath,
      name: p.name,
      ext: p.ext,
      sizeBytes: p.sizeBytes,
      lastModified: p.lastModified,
      isLivePhoto: p.isLivePhoto,
      softDeleted: p.softDeleted,
      aspect: p.aspect,
      phash: p.phash,
      exif: p.exif,
      iptc: p.iptc,
      aiTags: p.aiTags,
    })),
  };
}

// A tight ArrayBuffer copy of a view. Also sidesteps the TS typed-array
// generic (Uint8Array<ArrayBufferLike>) at Web Crypto / Blob boundaries, which
// insist on an ArrayBuffer-backed source.
function toAB(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

// --- gzip via the platform CompressionStream (no dependencies) -------------

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const stream = new Blob([toAB(bytes)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([toAB(bytes)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// --- AES-256-GCM with PBKDF2 -----------------------------------------------

const PBKDF2_ITERS = 210_000;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    toAB(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toAB(salt), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// --- container format: "PRSB1" | flag | [salt|iv] | payload ----------------

const MAGIC = Uint8Array.from([0x50, 0x52, 0x53, 0x42, 0x31]); // "PRSB1"

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Serialise → gzip → (optional) encrypt → framed container bytes. */
export async function packBackup(
  snapshot: CatalogSnapshot,
  passphrase?: string
): Promise<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(snapshot));
  const gz = await gzip(json);

  if (passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: toAB(iv) }, key, toAB(gz))
    );
    return toAB(concat(MAGIC, Uint8Array.of(1), salt, iv, ct));
  }
  return toAB(concat(MAGIC, Uint8Array.of(0), gz));
}

export class BackupError extends Error {}

/** Reverse of packBackup. Throws BackupError on a bad file or wrong passphrase. */
export async function unpackBackup(
  bytes: Uint8Array,
  passphrase?: string
): Promise<CatalogSnapshot> {
  if (bytes.length < 6 || !MAGIC.every((b, i) => bytes[i] === b)) {
    throw new BackupError("Not a Peruse backup file.");
  }
  const flag = bytes[5];
  let gz: Uint8Array;

  if (flag === 1) {
    if (!passphrase) throw new BackupError("This backup is encrypted — a passphrase is required.");
    const salt = bytes.slice(6, 22);
    const iv = bytes.slice(22, 34);
    const ct = bytes.slice(34);
    const key = await deriveKey(passphrase, salt);
    try {
      gz = new Uint8Array(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv: toAB(iv) }, key, toAB(ct))
      );
    } catch {
      throw new BackupError("Incorrect passphrase or corrupted backup.");
    }
  } else {
    gz = bytes.slice(6);
  }

  const json = new TextDecoder().decode(await gunzip(gz));
  const snap = JSON.parse(json) as CatalogSnapshot;
  if (snap.app !== "peruse") throw new BackupError("Unrecognised backup contents.");
  return snap;
}

/** A timestamped backup filename, e.g. peruse-catalog-2026-08-16-2014.peruse */
export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `peruse-catalog-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(
    date.getDate()
  )}-${p(date.getHours())}${p(date.getMinutes())}.peruse`;
}
