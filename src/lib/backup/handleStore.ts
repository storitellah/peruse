// Persist the chosen auto-backup destination across sessions.
//
// FileSystemDirectoryHandle objects are structured-cloneable, so they can be
// stored in IndexedDB and re-used on the next launch (subject to the browser
// re-confirming permission). This keeps a single handle under a fixed key.

const DB = "peruse";
const STORE = "handles";
const KEY = "backupDir";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveBackupDir(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore("readwrite", (s) => s.put(handle, KEY));
}

export async function loadBackupDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await withStore<FileSystemDirectoryHandle>("readonly", (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function clearBackupDir(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}
