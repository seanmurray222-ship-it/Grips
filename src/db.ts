/* Tiny IndexedDB key-value store. All data stays on the device. */

const DB_NAME = "open-grips";
const STORE = "kv";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database blocked"));
  });
  dbp.catch(() => {
    dbp = null;
  });
  return dbp;
}

export async function getAll(keys: string[]): Promise<Record<string, unknown>> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    const out: Record<string, unknown> = {};
    keys.forEach((k) => {
      const r = st.get(k);
      r.onsuccess = () => {
        out[k] = r.result;
      };
    });
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

/** Write several keys in one transaction, so an import is all-or-nothing. */
export async function putAll(entries: Record<string, unknown>): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    Object.entries(entries).forEach(([k, v]) => st.put(v, k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
