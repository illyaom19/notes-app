import { readMigratedEnvelope, writeEnvelope } from "./schema-migrations.js";
import { STORAGE_SCHEMA_REGISTRY } from "./schema-registry.js";

const { assets: ASSET_SCHEMA } = STORAGE_SCHEMA_REGISTRY;
const CATALOG_KEY = ASSET_SCHEMA.catalogKey;
const DATA_PREFIX = ASSET_SCHEMA.dataPrefix;
const SCHEMA_VERSION = ASSET_SCHEMA.schemaVersion;
const DEFAULT_MAX_BYTES = ASSET_SCHEMA.defaultMaxBytes;
const PDF_BYTES_BINARY_PREFIX = "bin:";
const ASSET_DB_NAME = "notes-app-assets";
const ASSET_DB_VERSION = 1;
const ASSET_DB_STORE = "payloads";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function asObject(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate;
}

function normalizeRefs(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const refs = [];
  const seen = new Set();
  for (const value of candidate) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    const ref = value.trim();
    if (seen.has(ref)) {
      continue;
    }
    seen.add(ref);
    refs.push(ref);
  }

  return refs;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}

function encodeBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    return null;
  }

  // Store as binary payload to reduce overhead versus base64.
  let payload = PDF_BYTES_BINARY_PREFIX;
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    payload += String.fromCharCode(...chunk);
  }
  return payload;
}

function decodeBytes(base64Value) {
  if (typeof base64Value !== "string" || !base64Value) {
    return null;
  }

  if (base64Value.startsWith(PDF_BYTES_BINARY_PREFIX)) {
    const binary = base64Value.slice(PDF_BYTES_BINARY_PREFIX.length);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  try {
    const binary = window.atob(base64Value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (_error) {
    return null;
  }
}

function byteSizeOfString(value) {
  return new Blob([value]).size;
}

function defaultCatalog(maxBytes) {
  return {
    maxBytes,
    records: [],
  };
}

function normalizeAssetRecord(candidate) {
  const source = asObject(candidate);
  const id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : null;
  if (!id) {
    return null;
  }

  const type = typeof source.type === "string" && source.type.trim() ? source.type.trim() : "blob";
  const sizeBytes = Number.isFinite(source.sizeBytes) ? Math.max(0, Math.floor(source.sizeBytes)) : 0;

  return {
    id,
    type,
    sizeBytes,
    refs: normalizeRefs(source.refs),
    createdAt: typeof source.createdAt === "string" && source.createdAt.trim() ? source.createdAt : nowIso(),
    lastAccessedAt:
      typeof source.lastAccessedAt === "string" && source.lastAccessedAt.trim()
        ? source.lastAccessedAt
        : nowIso(),
    derivedFrom:
      typeof source.derivedFrom === "string" && source.derivedFrom.trim() ? source.derivedFrom : null,
    hash: typeof source.hash === "string" && source.hash.trim() ? source.hash : null,
  };
}

function normalizeCatalog(candidate, maxBytes) {
  const source = asObject(candidate);
  const fallbackMaxBytes = Math.max(1024, Math.floor(maxBytes));
  const storedMaxBytes = Number.isFinite(source.maxBytes)
    ? Math.max(1024, Math.floor(source.maxBytes))
    : fallbackMaxBytes;
  const normalized = {
    maxBytes: Math.max(storedMaxBytes, fallbackMaxBytes),
    records: [],
  };

  if (!Array.isArray(source.records)) {
    return normalized;
  }

  const seen = new Set();
  for (const entry of source.records) {
    const record = normalizeAssetRecord(entry);
    if (!record || seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    normalized.records.push(record);
  }

  return normalized;
}

export function createAssetManager({
  storage = window.localStorage,
  maxBytes = DEFAULT_MAX_BYTES,
  chunkSize = 24,
} = {}) {
  let gcTimer = null;
  const payloadCache = new Map();
  let payloadsHydrated = false;
  let hydratePromise = null;
  let dbPromise = null;
  let indexedDbUsable = false;

  const migrationState = readMigratedEnvelope({
    storage,
    key: CATALOG_KEY,
    targetSchemaVersion: SCHEMA_VERSION,
    legacySchemaVersion: 1,
    defaultData: defaultCatalog(maxBytes),
    migrations: {
      2: (candidate) => normalizeCatalog(candidate, maxBytes),
    },
    onMigrationStep: ({ from, to }) => {
      console.info(`[storage] migrated asset catalog ${from} -> ${to}`);
    },
    onError: (error) => {
      console.warn("[storage] failed to read asset catalog, reset to defaults.", error);
    },
  });

  let catalog = normalizeCatalog(migrationState.data, maxBytes);

  function dataKey(assetId) {
    return `${DATA_PREFIX}${assetId}`;
  }

  function supportsIndexedDb() {
    return typeof window !== "undefined" && "indexedDB" in window;
  }

  function isDbHandle(candidate) {
    return candidate && typeof candidate.transaction === "function";
  }

  function openAssetDb() {
    if (!supportsIndexedDb()) {
      return Promise.resolve(null);
    }
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve) => {
      const request = window.indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db && !db.objectStoreNames.contains(ASSET_DB_STORE)) {
          db.createObjectStore(ASSET_DB_STORE);
        }
      };
      request.onsuccess = () => {
        resolve(request.result ?? null);
      };
      request.onerror = () => {
        console.warn("[storage] failed to open asset IndexedDB.", request.error);
        resolve(null);
      };
    });

    return dbPromise;
  }

  function loadAllPayloadsFromDb(db) {
    return new Promise((resolve) => {
      if (!isDbHandle(db)) {
        resolve(new Map());
        return;
      }

      const tx = db.transaction(ASSET_DB_STORE, "readonly");
      const store = tx.objectStore(ASSET_DB_STORE);
      const request = store.openCursor();
      const payloads = new Map();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(payloads);
          return;
        }
        if (typeof cursor.key === "string" && typeof cursor.value === "string" && cursor.value.length > 0) {
          payloads.set(cursor.key, cursor.value);
        }
        cursor.continue();
      };

      request.onerror = () => {
        console.warn("[storage] failed to read asset payloads from IndexedDB.", request.error);
        resolve(payloads);
      };
    });
  }

  async function putPayloadToDb(assetId, payload) {
    const db = await openAssetDb();
    if (!isDbHandle(db)) {
      return false;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(ASSET_DB_STORE, "readwrite");
      const store = tx.objectStore(ASSET_DB_STORE);
      store.put(payload, assetId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn(`[storage] failed to persist asset payload ${assetId} in IndexedDB.`, tx.error);
        resolve(false);
      };
      tx.onabort = () => resolve(false);
    });
  }

  async function removePayloadFromDb(assetId) {
    if (!indexedDbUsable) {
      return false;
    }
    const db = await openAssetDb();
    if (!isDbHandle(db)) {
      return false;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(ASSET_DB_STORE, "readwrite");
      const store = tx.objectStore(ASSET_DB_STORE);
      store.delete(assetId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  function persistCatalog() {
    try {
      writeEnvelope({
        storage,
        key: CATALOG_KEY,
        schemaVersion: SCHEMA_VERSION,
        data: catalog,
      });
      return true;
    } catch (error) {
      console.warn("[storage] failed to persist asset catalog.", error);
      return false;
    }
  }

  function findRecord(assetId) {
    return catalog.records.find((entry) => entry.id === assetId) ?? null;
  }

  function recordMapById() {
    return new Map(catalog.records.map((entry) => [entry.id, entry]));
  }

  function getTotalBytes() {
    return catalog.records.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  }

  function removeRecord(assetId) {
    const beforeLength = catalog.records.length;
    catalog.records = catalog.records.filter((entry) => entry.id !== assetId);
    if (catalog.records.length === beforeLength) {
      return false;
    }

    payloadCache.delete(assetId);
    storage.removeItem(dataKey(assetId));
    if (indexedDbUsable) {
      void removePayloadFromDb(assetId);
    }
    return true;
  }

  function removeStaleRecordsSync() {
    if (supportsIndexedDb() && !payloadsHydrated) {
      return false;
    }

    let changed = false;
    const kept = [];

    for (const entry of catalog.records) {
      const payload = payloadCache.get(entry.id) ?? storage.getItem(dataKey(entry.id));
      if (typeof payload !== "string" || payload.length < 1) {
        changed = true;
        continue;
      }
      payloadCache.set(entry.id, payload);
      kept.push(entry);
    }

    if (changed) {
      catalog.records = kept;
    }

    return changed;
  }

  function removeUnreferencedRecordsSync({ enforceBudget = false } = {}) {
    let changed = false;

    const candidates = [...catalog.records]
      .filter((entry) => entry.refs.length < 1)
      .sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt));

    let totalBytes = getTotalBytes();
    const targetBytes = catalog.maxBytes;

    for (const entry of candidates) {
      if (!enforceBudget || totalBytes > targetBytes) {
        const removed = removeRecord(entry.id);
        if (removed) {
          totalBytes -= entry.sizeBytes;
          changed = true;
        }
      }
    }

    return changed;
  }

  function runGcSync({ enforceBudget = true } = {}) {
    const staleChanged = removeStaleRecordsSync();
    const refChanged = removeUnreferencedRecordsSync({ enforceBudget });
    if (staleChanged || refChanged) {
      persistCatalog();
    }
  }

  function scheduleGarbageCollection({ delayMs = 240, enforceBudget = true } = {}) {
    if (gcTimer) {
      window.clearTimeout(gcTimer);
    }

    gcTimer = window.setTimeout(() => {
      gcTimer = null;
      // Chunk large catalogs to keep input responsive.
      const toProcess = [...catalog.records];
      let index = 0;
      let changed = false;

      const processChunk = () => {
        const end = Math.min(index + Math.max(4, chunkSize), toProcess.length);
        const shouldValidatePayloads = !supportsIndexedDb() || payloadsHydrated;
        for (; index < end; index += 1) {
          const entry = toProcess[index];
          if (shouldValidatePayloads) {
            const payload = payloadCache.get(entry.id) ?? storage.getItem(dataKey(entry.id));
            if (typeof payload !== "string" || payload.length < 1) {
              if (removeRecord(entry.id)) {
                changed = true;
              }
            } else {
              payloadCache.set(entry.id, payload);
            }
          }
        }

        if (index < toProcess.length) {
          window.setTimeout(processChunk, 0);
          return;
        }

        const before = getTotalBytes();
        const unrefChanged = removeUnreferencedRecordsSync({ enforceBudget });
        const after = getTotalBytes();
        if (unrefChanged || before !== after || changed) {
          persistCatalog();
        }
      };

      processChunk();
    }, delayMs);
  }

  function ensureCapacity(requiredBytes) {
    const nextSize = getTotalBytes() + requiredBytes;
    if (nextSize <= catalog.maxBytes) {
      return true;
    }

    // When we're about to exceed the budget, purge all currently unreferenced assets first.
    runGcSync({ enforceBudget: false });
    return getTotalBytes() + requiredBytes <= catalog.maxBytes;
  }

  function normalizeOwner(ownerId) {
    return typeof ownerId === "string" && ownerId.trim() ? ownerId.trim() : null;
  }

  function normalizeRefsForRecord(record, refs) {
    record.refs = normalizeRefs(refs);
  }

  function touchRecord(record) {
    record.lastAccessedAt = nowIso();
  }

  function registerAsset({ type, data, ownerId = null, derivedFrom = null }) {
    const normalizedType = typeof type === "string" && type.trim() ? type.trim() : null;
    const payload = typeof data === "string" ? data : null;
    if (!normalizedType || !payload || payload.length < 1) {
      return null;
    }

    const hash = `${normalizedType}:${hashString(payload)}:${payload.length}`;
    const owner = normalizeOwner(ownerId);

    for (const entry of catalog.records) {
      if (entry.hash !== hash || entry.type !== normalizedType) {
        continue;
      }

      const current = payloadCache.get(entry.id) ?? storage.getItem(dataKey(entry.id));
      if (current !== payload) {
        continue;
      }

      payloadCache.set(entry.id, current);
      touchRecord(entry);
      if (owner) {
        normalizeRefsForRecord(entry, [...entry.refs, owner]);
      }
      persistCatalog();

      return {
        id: entry.id,
        type: entry.type,
        sizeBytes: entry.sizeBytes,
        reused: true,
      };
    }

    const sizeBytes = byteSizeOfString(payload);
    if (!ensureCapacity(sizeBytes)) {
      return null;
    }

    const id = makeId("asset");
    payloadCache.set(id, payload);

    if (indexedDbUsable) {
      void putPayloadToDb(id, payload);
      storage.removeItem(dataKey(id));
    } else {
      try {
        storage.setItem(dataKey(id), payload);
      } catch (error) {
        payloadCache.delete(id);
        console.warn("[storage] failed to persist asset payload.", error);
        return null;
      }
    }

    const timestamp = nowIso();
    const record = {
      id,
      type: normalizedType,
      sizeBytes,
      refs: owner ? [owner] : [],
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      derivedFrom:
        typeof derivedFrom === "string" && derivedFrom.trim() ? derivedFrom.trim() : null,
      hash,
    };

    catalog.records.push(record);
    if (!persistCatalog()) {
      catalog.records = catalog.records.filter((entry) => entry.id !== id);
      payloadCache.delete(id);
      storage.removeItem(dataKey(id));
      if (indexedDbUsable) {
        void removePayloadFromDb(id);
      }
      return null;
    }
    scheduleGarbageCollection({ enforceBudget: true });

    return {
      id: record.id,
      type: record.type,
      sizeBytes: record.sizeBytes,
      reused: false,
    };
  }

  function registerPdfBytes(bytes, { ownerId = null, derivedFrom = null } = {}) {
    const base64 = encodeBytes(bytes);
    if (!base64) {
      return null;
    }

    return registerAsset({
      type: "pdf-bytes",
      data: base64,
      ownerId,
      derivedFrom,
    });
  }

  function registerImageDataUrl(dataUrl, { ownerId = null, derivedFrom = null } = {}) {
    if (typeof dataUrl !== "string" || !dataUrl.trim()) {
      return null;
    }

    return registerAsset({
      type: "image-data-url",
      data: dataUrl,
      ownerId,
      derivedFrom,
    });
  }

  function loadAssetData(assetId) {
    const record = findRecord(assetId);
    if (!record) {
      return null;
    }

    let payload = payloadCache.get(assetId) ?? null;
    if (typeof payload !== "string" || payload.length < 1) {
      payload = storage.getItem(dataKey(assetId));
      if (typeof payload === "string" && payload.length > 0) {
        payloadCache.set(assetId, payload);
        if (indexedDbUsable) {
          void putPayloadToDb(assetId, payload);
          storage.removeItem(dataKey(assetId));
        }
      }
    }
    if (typeof payload !== "string" || payload.length < 1) {
      if (supportsIndexedDb() && !payloadsHydrated) {
        return null;
      }
      removeRecord(assetId);
      persistCatalog();
      return null;
    }

    touchRecord(record);
    persistCatalog();
    return payload;
  }

  function loadPdfBytes(assetId) {
    const payload = loadAssetData(assetId);
    if (!payload) {
      return null;
    }

    return decodeBytes(payload);
  }

  function loadImageDataUrl(assetId) {
    const payload = loadAssetData(assetId);
    if (!payload) {
      return null;
    }

    return payload;
  }

  function replaceContextReferences(contextId, refsByAssetId) {
    if (typeof contextId !== "string" || !contextId.trim()) {
      return;
    }

    const prefix = `${contextId}:`;
    const byId = recordMapById();

    for (const record of catalog.records) {
      record.refs = record.refs.filter((ownerRef) => !ownerRef.startsWith(prefix));
    }

    if (refsByAssetId instanceof Map) {
      for (const [assetId, refs] of refsByAssetId.entries()) {
        const record = byId.get(assetId);
        if (!record) {
          continue;
        }

        const nextRefs = [...record.refs];
        const iterable = refs instanceof Set ? Array.from(refs.values()) : Array.isArray(refs) ? refs : [];
        for (const ownerRef of iterable) {
          const owner = normalizeOwner(ownerRef);
          if (!owner) {
            continue;
          }
          nextRefs.push(owner);
        }
        normalizeRefsForRecord(record, nextRefs);
      }
    }

    persistCatalog();
    // Reference updates should eagerly clear unreferenced assets so widget deletion/import rollback
    // does not leave orphan payloads behind.
    scheduleGarbageCollection({ enforceBudget: false });
  }

  function removeContextReferences(contextId) {
    if (typeof contextId !== "string" || !contextId.trim()) {
      return;
    }

    const prefix = `${contextId}:`;
    for (const record of catalog.records) {
      record.refs = record.refs.filter((ownerRef) => !ownerRef.startsWith(prefix));
    }

    persistCatalog();
    scheduleGarbageCollection({ enforceBudget: false });
  }

  function ownerRef(contextId, widgetId) {
    if (typeof contextId !== "string" || !contextId.trim()) {
      return null;
    }
    if (typeof widgetId !== "string" || !widgetId.trim()) {
      return null;
    }
    return `${contextId}:${widgetId}`;
  }

  function snapshot() {
    return {
      maxBytes: catalog.maxBytes,
      totalBytes: getTotalBytes(),
      recordCount: catalog.records.length,
      payloadsHydrated,
      usesIndexedDb: supportsIndexedDb(),
      indexedDbUsable,
    };
  }

  async function hydratePayloadCache() {
    if (payloadsHydrated) {
      return true;
    }
    if (hydratePromise) {
      return hydratePromise;
    }

    hydratePromise = (async () => {
      const db = await openAssetDb();
      indexedDbUsable = isDbHandle(db);
      const dbPayloads = await loadAllPayloadsFromDb(db);
      let changed = false;
      const migratedLocalKeys = [];

      for (const record of [...catalog.records]) {
        let payload = dbPayloads.get(record.id) ?? null;
        if (typeof payload !== "string" || payload.length < 1) {
          const legacyPayload = storage.getItem(dataKey(record.id));
          if (typeof legacyPayload === "string" && legacyPayload.length > 0) {
            payload = legacyPayload;
            if (indexedDbUsable) {
              void putPayloadToDb(record.id, payload);
              migratedLocalKeys.push(dataKey(record.id));
            }
          }
        }

        if (typeof payload !== "string" || payload.length < 1) {
          removeRecord(record.id);
          changed = true;
          continue;
        }

        payloadCache.set(record.id, payload);
      }

      for (const key of migratedLocalKeys) {
        storage.removeItem(key);
      }

      if (changed) {
        persistCatalog();
      }
      payloadsHydrated = true;
      return true;
    })()
      .catch((error) => {
        console.warn("[storage] failed to hydrate asset payload cache.", error);
        indexedDbUsable = false;
        payloadsHydrated = true;
        return false;
      })
      .finally(() => {
        hydratePromise = null;
      });

    return hydratePromise;
  }

  scheduleGarbageCollection({ delayMs: 60, enforceBudget: true });

  return {
    registerAsset,
    registerPdfBytes,
    registerImageDataUrl,
    loadAssetData,
    loadPdfBytes,
    loadImageDataUrl,
    replaceContextReferences,
    removeContextReferences,
    ownerRef,
    scheduleGarbageCollection,
    snapshot,
    hydratePayloadCache,
  };
}
