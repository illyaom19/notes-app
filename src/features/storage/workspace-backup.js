import { flushAssetWrites } from './asset-manager.js';
import { flushWorkspaceWrites, WORKSPACE_DATABASE } from './workspace-database.js';
const MAGIC = 'NOTES-WORKSPACE-1\n';
const JOURNAL = 'notes-app.restore-journal';
export const RESTORE_EVENT_KEY = 'notes-app.restore-event';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_RECORD = 128 * 1024 * 1024;
const isAppKey = (key) => key.startsWith('notes-app.') && key !== JOURNAL && key !== RESTORE_EVENT_KEY;
const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) => x.toString(16).padStart(2, '0')).join('');
const snapshot = () => Object.fromEntries(Object.keys(localStorage).filter(isAppKey).map((key) => [key, localStorage.getItem(key)]));
function replaceSettings(settings) {
  for (const key of Object.keys(localStorage).filter(isAppKey)) if (!(key in settings)) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
}
export function recoverInterruptedRestore() {
  const raw = localStorage.getItem(JOURNAL);
  if (!raw) return;
  const previous = JSON.parse(raw);
  replaceSettings(previous); localStorage.removeItem(JOURNAL);
}
async function openDb(name = 'notes-app-assets', version = 1, storeName = 'payloads') {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function requestValue(db, storeName, method, ...args) {
  return new Promise((resolve, reject) => {
    const writes = method === 'put' || method === 'delete' || method === 'clear';
    const tx = db.transaction(storeName, writes ? 'readwrite' : 'readonly');
    const request = tx.objectStore(storeName)[method](...args);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Asset transaction failed.'));
  });
}
function requireRecordSize(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_RECORD) throw new Error('A backup record exceeds the supported 128 MB limit.');
}
export async function createWorkspaceBackup({ signal, onProgress = () => {} } = {}) {
  await Promise.all([flushAssetWrites(), flushWorkspaceWrites()]);
  const databases = [
    { id: 'assets', db: await openDb(), store: 'payloads' },
    { id: 'workspaces', db: await openDb(WORKSPACE_DATABASE.name, WORKSPACE_DATABASE.version, WORKSPACE_DATABASE.store), store: WORKSPACE_DATABASE.store },
  ];
  try {
    const settings = snapshot();
    const records = [], parts = [];
    const total = (await Promise.all(databases.map(({ db, store }) => requestValue(db, store, 'getAllKeys')))).reduce((sum, keys) => sum + keys.length, 0);
    for (const { id, db, store } of databases) {
      const keys = await requestValue(db, store, 'getAllKeys');
      for (const key of keys) {
        signal?.throwIfAborted();
        const value = await requestValue(db, store, 'get', key);
        if (typeof key !== 'string') throw new Error('Unsupported backup record key.');
        const bytes = encoder.encode(JSON.stringify(value)); requireRecordSize(bytes.length);
        records.push({ database: id, key, size: bytes.length, sha256: await digest(bytes) }); parts.push(new Blob([bytes]));
        onProgress(records.length, total);
      }
    }
    const settingsBytes = encoder.encode(JSON.stringify(settings));
    const manifest = encoder.encode(JSON.stringify({ version: 2, createdAt: new Date().toISOString(), settings, settingsHash: await digest(settingsBytes), records }));
    requireRecordSize(manifest.length);
    return new Blob([MAGIC, String(manifest.length).padStart(12, '0'), '\n', manifest, ...parts], { type: 'application/x-notes-workspace' });
  } finally { databases.forEach(({ db }) => db.close()); }
}
export async function inspectWorkspaceBackup(file, { signal } = {}) {
  const headerLength = MAGIC.length + 13;
  const header = await file.slice(0, headerLength).text();
  if (!header.startsWith(MAGIC) || !/^\d{12}\n$/.test(header.slice(MAGIC.length))) throw new Error('This is not an editable Notes workspace backup.');
  const manifestSize = Number(header.slice(MAGIC.length, -1)); requireRecordSize(manifestSize);
  const manifest = JSON.parse(await file.slice(headerLength, headerLength + manifestSize).text());
  if (![1, 2].includes(manifest.version) || !Array.isArray(manifest.records) || !manifest.settings || typeof manifest.settings !== 'object' || Array.isArray(manifest.settings) || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Unsupported backup version or manifest.');
  if (Object.entries(manifest.settings).some(([key, value]) => !isAppKey(key) || typeof value !== 'string')) throw new Error('Invalid workspace settings.');
  if (await digest(encoder.encode(JSON.stringify(manifest.settings))) !== manifest.settingsHash) throw new Error('Workspace metadata is damaged.');
  let offset = headerLength + manifestSize;
  const ids = new Set();
  for (const record of manifest.records) {
    signal?.throwIfAborted(); requireRecordSize(record.size);
    const database = manifest.version === 1 ? 'assets' : record.database;
    const identity = `${database}:${record.key}`;
    if (!['assets', 'workspaces'].includes(database) || typeof record.key !== 'string' || ids.has(identity)) throw new Error('Invalid or duplicate backup record.');
    ids.add(identity); record.database = database; record.offset = offset;
    const bytes = await file.slice(offset, offset + record.size).arrayBuffer();
    if (bytes.byteLength !== record.size || await digest(bytes) !== record.sha256) throw new Error(`Damaged asset: ${record.key}`);
    offset += record.size;
  }
  if (offset !== file.size) throw new Error('Incomplete or unexpected backup contents.');
  return manifest;
}
export async function restoreWorkspaceBackup(file, { signal, onProgress = () => {} } = {}) {
  const manifest = await inspectWorkspaceBackup(file, { signal });
  const restoreId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  localStorage.setItem(RESTORE_EVENT_KEY, JSON.stringify({
    id: restoreId,
    phase: 'started',
    expiresAt: Date.now() + 5 * 60 * 1000,
  }));
  let db = null;
  let workspaceDb = null;
  const insertedKeys = [];
  let previousWorkspaces = null;
  const decodeRecord = async (record) => {
    const text = decoder.decode(await file.slice(record.offset, record.offset + record.size).arrayBuffer());
    return manifest.version === 1 ? text : JSON.parse(text);
  };
  try {
    db = await openDb();
    workspaceDb = await openDb(WORKSPACE_DATABASE.name, WORKSPACE_DATABASE.version, WORKSPACE_DATABASE.store);
    const workspaceKeys = await requestValue(workspaceDb, WORKSPACE_DATABASE.store, 'getAllKeys');
    const workspaceValues = await requestValue(workspaceDb, WORKSPACE_DATABASE.store, 'getAll');
    previousWorkspaces = workspaceKeys.map((key, index) => [key, workspaceValues[index]]);
    // Stage immutable assets first. Existing assets are preserved for rollback.
    const assetRecords = manifest.records.filter((record) => record.database === 'assets');
    for (let i = 0; i < assetRecords.length; i++) {
      signal?.throwIfAborted();
      const record = assetRecords[i];
      const value = await decodeRecord(record);
      const existing = await requestValue(db, 'payloads', 'get', record.key);
      if (existing !== undefined && existing !== value) throw new Error('Conflicting asset identifier; existing workspace was preserved.');
      if (existing === undefined) {
        await requestValue(db, 'payloads', 'put', value, record.key);
        insertedKeys.push(record.key);
      }
      onProgress(i + 1, manifest.records.length);
    }
    const restoredWorkspaces = manifest.records.filter((record) => record.database === 'workspaces');
    if (manifest.version === 2) {
      await requestValue(workspaceDb, WORKSPACE_DATABASE.store, 'clear');
      for (const record of restoredWorkspaces) {
        signal?.throwIfAborted();
        const value = await decodeRecord(record);
        await requestValue(workspaceDb, WORKSPACE_DATABASE.store, 'put', value, record.key);
      }
    }
    signal?.throwIfAborted();
    const previous = snapshot();
    // Durable rollback journal is read before stores initialize on the next launch.
    localStorage.setItem(JOURNAL, JSON.stringify(previous));
    try { replaceSettings(manifest.settings); localStorage.removeItem(JOURNAL); }
    catch (error) { replaceSettings(previous); localStorage.removeItem(JOURNAL); throw error; }
    try {
      localStorage.setItem(RESTORE_EVENT_KEY, JSON.stringify({ id: restoreId, phase: 'complete' }));
      localStorage.removeItem(RESTORE_EVENT_KEY);
    } catch (_coordinationError) {
      // The archive is committed. Sibling tabs retain their expiry fallback if
      // the completion notification cannot be published under storage pressure.
    }
  } catch (error) {
    // A staged restore must not leak new assets if validation, cancellation, or
    // the settings commit fails. Existing immutable assets are never touched.
    if (db) await Promise.allSettled(insertedKeys.map((key) => requestValue(db, 'payloads', 'delete', key)));
    if (workspaceDb && previousWorkspaces) {
      await requestValue(workspaceDb, WORKSPACE_DATABASE.store, 'clear').catch(() => {});
      await Promise.allSettled(previousWorkspaces.map(([key, value]) => requestValue(workspaceDb, WORKSPACE_DATABASE.store, 'put', value, key)));
    }
    try {
      localStorage.setItem(RESTORE_EVENT_KEY, JSON.stringify({ id: restoreId, phase: 'failed' }));
      localStorage.removeItem(RESTORE_EVENT_KEY);
    } catch (_coordinationError) {
      // Preserve the original restore failure.
    }
    throw error;
  } finally { db?.close(); workspaceDb?.close(); }
}
