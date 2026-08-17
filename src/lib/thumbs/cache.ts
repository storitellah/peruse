// Persistent thumbnail cache (IndexedDB).
//
// Once a thumbnail is decoded it's stored here, keyed by path + size + mtime.
// On the next scroll-back — or the next time the app launches on the same
// library — the thumbnail loads straight from disk instead of re-decoding the
// full photo. This is what makes a 100k-photo library feel instant after the
// first pass. Bounded by an LRU cap so it never grows without limit.

import type { Photo } from "../../types";

export interface CachedThumb {
  key: string;
  blob: Blob;
  width: number;
  height: number;
  aspect: number;
  phash: string;
  ts: number;
}

const DB = "peruse-thumbs";
const STORE = "thumbs";
const MAX_ENTRIES = 20000;

export function thumbKey(p: Photo): string {
  return `${p.relPath}|${p.sizeBytes}|${p.lastModified}`;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("ts", "ts");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function getThumb(key: string): Promise<CachedThumb | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedThumb) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let putsSinceEvict = 0;

export async function putThumb(rec: CachedThumb): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
  } catch {
    return;
  }
  // Amortised eviction: only sweep occasionally.
  if (++putsSinceEvict >= 500) {
    putsSinceEvict = 0;
    void evict(db);
  }
}

async function evict(db: IDBDatabase): Promise<void> {
  try {
    const countReq = db.transaction(STORE, "readonly").objectStore(STORE).count();
    const total: number = await new Promise((res) => {
      countReq.onsuccess = () => res(countReq.result);
      countReq.onerror = () => res(0);
    });
    if (total <= MAX_ENTRIES) return;
    let toDelete = total - MAX_ENTRIES;
    const tx = db.transaction(STORE, "readwrite");
    const cursorReq = tx.objectStore(STORE).index("ts").openCursor(); // oldest first
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor && toDelete > 0) {
        cursor.delete();
        toDelete--;
        cursor.continue();
      }
    };
  } catch {
    /* best effort */
  }
}

/** Wipe the entire thumbnail cache (used by a Settings "clear cache" action). */
export async function clearThumbCache(): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
  } catch {
    /* noop */
  }
}
