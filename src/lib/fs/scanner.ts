// Local, in-place directory scanning.
//
// Two ingestion paths, both fully local:
//   1. File System Access API (Chromium, Edge) — gives us live handles so we
//      can re-read pixels lazily and write XMP sidecars back in place.
//   2. <input type="file" webkitdirectory> fallback (Safari, Firefox) — gives
//      us File objects; read-only, sidecars are offered as downloads.
//
// Peruse never uploads, never copies the originals into its own storage. It
// only walks the tree the user explicitly granted.

import type { Photo } from "../../types";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, baseName, extOf, makeId } from "../util/misc";

export interface ScannedFile {
  name: string;
  relPath: string;
  ext: string;
  sizeBytes: number;
  lastModified: number;
  isLivePhoto: boolean;
  handle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
  file?: File;
}

export function supportsFsAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Prompt for a directory and walk it recursively (FS Access API path). */
export async function pickAndScanDirectory(
  onProgress?: (found: number) => void
): Promise<ScannedFile[]> {
  if (!supportsFsAccess()) throw new Error("File System Access API unavailable");
  const root = await window.showDirectoryPicker!({ id: "peruse-library", mode: "readwrite" });
  const out: ScannedFile[] = [];
  await walk(root, "", out, onProgress);
  return out;
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: ScannedFile[],
  onProgress?: (found: number) => void
): Promise<void> {
  // Collect this directory's entries first so we can spot Live Photo pairs
  // (a still + a sibling motion file sharing the same base name). We do NOT
  // call getFile() here — opening every file just to read its size makes
  // scanning a large library crawl. Size/mtime are read once, later, when the
  // file is actually decoded.
  const images: { name: string; handle: FileSystemFileHandle }[] = [];
  const videoStems = new Set<string>();
  const subdirs: FileSystemDirectoryHandle[] = [];

  for await (const entry of dir.values()) {
    if (entry.kind === "directory") {
      if (entry.name.startsWith(".")) continue; // hidden / cache dirs
      subdirs.push(entry as FileSystemDirectoryHandle);
      continue;
    }
    const ext = extOf(entry.name);
    if (VIDEO_EXTENSIONS.has(ext)) {
      videoStems.add(baseName(entry.name).toLowerCase());
      continue; // videos are never ingested
    }
    if (IMAGE_EXTENSIONS.has(ext)) {
      images.push({ name: entry.name, handle: entry as FileSystemFileHandle });
    }
  }

  for (const img of images) {
    out.push({
      name: img.name,
      relPath: `${prefix}${img.name}`,
      ext: extOf(img.name),
      sizeBytes: 0,
      lastModified: 0,
      isLivePhoto: videoStems.has(baseName(img.name).toLowerCase()),
      handle: img.handle,
      dirHandle: dir,
    });
    onProgress?.(out.length);
  }

  for (const sub of subdirs) {
    await walk(sub, `${prefix}${sub.name}/`, out, onProgress);
  }
}

/** Convert a fallback <input webkitdirectory> FileList into ScannedFiles. */
export function scanFileList(files: FileList | File[]): ScannedFile[] {
  const arr = Array.from(files);
  const relOf = (f: File) =>
    (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

  // Index motion files by "<dir>/<stem>" so we can pair Live Photos.
  const videoKeys = new Set<string>();
  const dirOf = (rel: string) => rel.slice(0, rel.lastIndexOf("/") + 1);
  for (const f of arr) {
    if (VIDEO_EXTENSIONS.has(extOf(f.name))) {
      const rel = relOf(f);
      videoKeys.add(dirOf(rel) + baseName(f.name).toLowerCase());
    }
  }

  const out: ScannedFile[] = [];
  for (const file of arr) {
    const ext = extOf(file.name);
    if (!IMAGE_EXTENSIONS.has(ext)) continue; // rejects video and everything else
    const relPath = relOf(file);
    out.push({
      name: file.name,
      relPath,
      ext,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      isLivePhoto: videoKeys.has(dirOf(relPath) + baseName(file.name).toLowerCase()),
      file,
    });
  }
  return out;
}

/** Build a fresh Photo record from a scanned file, before enrichment. */
export function toPhoto(sf: ScannedFile): Photo {
  return {
    id: makeId(sf.relPath + sf.sizeBytes + sf.lastModified),
    name: sf.name,
    relPath: sf.relPath,
    ext: sf.ext,
    sizeBytes: sf.sizeBytes,
    lastModified: sf.lastModified,
    isLivePhoto: sf.isLivePhoto,
    handle: sf.handle,
    dirHandle: sf.dirHandle,
    file: sf.file,
    exif: {},
    iptc: { people: [], tags: [] },
    aiTags: [],
    aspect: 1,
    stage: "queued",
    softDeleted: false,
  };
}

/** Re-open the underlying bytes for a photo regardless of ingestion path. */
export async function readBlob(photo: Photo): Promise<Blob> {
  if (photo.file) return photo.file;
  if (photo.handle) return photo.handle.getFile();
  throw new Error(`No readable source for ${photo.name}`);
}
