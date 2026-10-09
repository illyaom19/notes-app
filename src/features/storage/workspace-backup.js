import { flushAssetWrites } from './asset-manager.js';
const MAGIC = 'NOTES-WORKSPACE-1\n';
const JOURNAL = 'notes-app.restore-journal';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_RECORD = 128 * 1024 * 1024;
const isAppKey = (key) => key.startsWith('notes-app.') && key !== JOURNAL;
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
async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('notes-app-assets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('payloads');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function requestValue(db, method, ...args) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('payloads', method === 'put' ? 'readwrite' : 'readonly');
    const request = tx.objectStore('payloads')[method](...args);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Asset transaction failed.'));
  });
}
function requireRecordSize(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_RECORD) throw new Error('A backup record exceeds the supported 128 MB limit.');
}
export async function createWorkspaceBackup({ signal, onProgress = () => {} } = {}) {
  await flushAssetWrites();
  const db = await openDb();
  try {
    const settings = snapshot();
    const keys = await requestValue(db, 'getAllKeys');
    const records = [], parts = [];
    for (const key of keys) {
      signal?.throwIfAborted();
      const value = await requestValue(db, 'get', key);
      if (typeof key !== 'string' || typeof value !== 'string') throw new Error('Unsupported asset record.');
      const bytes = encoder.encode(value); requireRecordSize(bytes.length);
      records.push({ key, size: bytes.length, sha256: await digest(bytes) }); parts.push(new Blob([bytes]));
      onProgress(records.length, keys.length);
    }
    const settingsBytes = encoder.encode(JSON.stringify(settings));
    const manifest = encoder.encode(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), settings, settingsHash: await digest(settingsBytes), records }));
    requireRecordSize(manifest.length);
    return new Blob([MAGIC, String(manifest.length).padStart(12, '0'), '\n', manifest, ...parts], { type: 'application/x-notes-workspace' });
  } finally { db.close(); }
}
export async function inspectWorkspaceBackup(file, { signal } = {}) {
  const headerLength = MAGIC.length + 13;
  const header = await file.slice(0, headerLength).text();
  if (!header.startsWith(MAGIC) || !/^\d{12}\n$/.test(header.slice(MAGIC.length))) throw new Error('This is not an editable Notes workspace backup.');
  const manifestSize = Number(header.slice(MAGIC.length, -1)); requireRecordSize(manifestSize);
  const manifest = JSON.parse(await file.slice(headerLength, headerLength + manifestSize).text());
  if (manifest.version !== 1 || !Array.isArray(manifest.records) || !manifest.settings || typeof manifest.settings !== 'object' || Array.isArray(manifest.settings) || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('Unsupported backup version or manifest.');
  if (Object.entries(manifest.settings).some(([key, value]) => !isAppKey(key) || typeof value !== 'string')) throw new Error('Invalid workspace settings.');
  if (await digest(encoder.encode(JSON.stringify(manifest.settings))) !== manifest.settingsHash) throw new Error('Workspace metadata is damaged.');
  let offset = headerLength + manifestSize;
  const ids = new Set();
  for (const record of manifest.records) {
    signal?.throwIfAborted(); requireRecordSize(record.size);
    if (typeof record.key !== 'string' || ids.has(record.key)) throw new Error('Invalid or duplicate asset identifier.');
    ids.add(record.key); record.offset = offset;
    const bytes = await file.slice(offset, offset + record.size).arrayBuffer();
    if (bytes.byteLength !== record.size || await digest(bytes) !== record.sha256) throw new Error(`Damaged asset: ${record.key}`);
    offset += record.size;
  }
  if (offset !== file.size) throw new Error('Incomplete or unexpected backup contents.');
  return manifest;
}
export async function restoreWorkspaceBackup(file, { signal, onProgress = () => {} } = {}) {
  const manifest = await inspectWorkspaceBackup(file, { signal });
  const db = await openDb();
  try {
    // Stage immutable assets first. Existing assets are preserved for rollback.
    for (let i = 0; i < manifest.records.length; i++) {
      signal?.throwIfAborted();
      const record = manifest.records[i];
      const value = decoder.decode(await file.slice(record.offset, record.offset + record.size).arrayBuffer());
      const existing = await requestValue(db, 'get', record.key);
      if (existing !== undefined && existing !== value) throw new Error('Conflicting asset identifier; existing workspace was preserved.');
      if (existing === undefined) await requestValue(db, 'put', value, record.key);
      onProgress(i + 1, manifest.records.length);
    }
    signal?.throwIfAborted();
    const previous = snapshot();
    // Durable rollback journal is read before stores initialize on the next launch.
    localStorage.setItem(JOURNAL, JSON.stringify(previous));
    try { replaceSettings(manifest.settings); localStorage.removeItem(JOURNAL); }
    catch (error) { replaceSettings(previous); localStorage.removeItem(JOURNAL); throw error; }
  } finally { db.close(); }
}
