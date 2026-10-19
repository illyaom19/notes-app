const DB_NAME = "notes-app-workspaces";
const DB_VERSION = 1;
const STORE_NAME = "workspaces";

const pendingWrites = new Set();
const failedWrites = new Map();
const writeChains = new Map();
let activeDatabase = null;

function reportFailure(error) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent("notes-app-storage-error", {
    detail: { backend: "IndexedDB", operation: "workspace save", name: error?.name ?? "Error", message: error?.message ?? String(error) },
  }));
}

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB || typeof indexedDB.open !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(null);
  });
}

function transactionRequest(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = operation(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request?.error ?? new Error("Workspace database transaction failed."));
  });
}

function trackWrite(key, write) {
  const previous = writeChains.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(write)
    .then(() => failedWrites.delete(key))
    .catch((error) => { failedWrites.set(key, { write, error }); reportFailure(error); })
    .finally(() => {
      pendingWrites.delete(pending);
      if (writeChains.get(key) === pending) writeChains.delete(key);
    });
  writeChains.set(key, pending);
  pendingWrites.add(pending);
}

export async function flushWorkspaceWrites() {
  for (const [key, entry] of failedWrites) trackWrite(key, entry.write);
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
  if (failedWrites.size) {
    const error = failedWrites.values().next().value?.error;
    throw error ?? new Error("Some workspace changes could not be saved.");
  }
}

export function workspaceWritesHealthy() {
  return failedWrites.size === 0;
}

export function abandonWorkspaceWriteFailures() {
  failedWrites.clear();
}

export async function createWorkspaceDatabase({ indexedDB = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDB);
  if (!db) return null;
  const cache = new Map();
  try {
    const keys = await transactionRequest(db, "readonly", (store) => store.getAllKeys());
    const values = await transactionRequest(db, "readonly", (store) => store.getAll());
    keys.forEach((key, index) => { if (typeof key === "string") cache.set(key, values[index]); });
  } catch (error) {
    console.warn("[storage] failed to hydrate workspace IndexedDB.", error);
    db.close();
    return null;
  }
  const workspaceDatabase = {
    cache,
    put(key, value) {
      cache.set(key, value);
      trackWrite(key, () => transactionRequest(db, "readwrite", (store) => store.put(value, key)));
    },
    delete(key) {
      cache.delete(key);
      trackWrite(key, () => transactionRequest(db, "readwrite", (store) => store.delete(key)));
    },
  };
  activeDatabase = workspaceDatabase;
  return workspaceDatabase;
}

export function updateActiveWorkspaceRecord(key, update) {
  if (!activeDatabase || typeof key !== "string" || typeof update !== "function") return false;
  const current = activeDatabase.cache.get(key);
  if (current === undefined) return false;
  const next = update(structuredClone(current));
  if (next === undefined) return false;
  activeDatabase.put(key, next);
  return true;
}

export async function inspectWorkspaceStorage({ indexedDB = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDB);
  if (!db) return { available: false, count: 0, bytes: 0, records: [] };
  try {
    const keys = await transactionRequest(db, "readonly", (store) => store.getAllKeys());
    const values = await transactionRequest(db, "readonly", (store) => store.getAll());
    const records = keys.map((key, index) => [key, values[index]]).filter(([key]) => typeof key === "string");
    return {
      available: true,
      count: records.length,
      bytes: records.reduce((sum, [, value]) => sum + new Blob([JSON.stringify(value)]).size, 0),
      records,
    };
  } finally {
    db.close();
  }
}

export const WORKSPACE_DATABASE = Object.freeze({ name: DB_NAME, version: DB_VERSION, store: STORE_NAME });
