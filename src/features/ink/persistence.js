import { readMigratedEnvelope, writeEnvelope } from "../storage/schema-migrations.js";
import { STORAGE_SCHEMA_REGISTRY } from "../storage/schema-registry.js";

const { ink: INK_SCHEMA } = STORAGE_SCHEMA_REGISTRY;
const STORAGE_KEY = INK_SCHEMA.key;
const INK_SCHEMA_VERSION = INK_SCHEMA.schemaVersion;

function normalizeStroke(stroke) {
  if (!stroke || typeof stroke !== "object" || !Array.isArray(stroke.points)) {
    return null;
  }

  return {
    ...stroke,
    layer:
      stroke.layer === "pdf" || stroke.layer === "widget" || stroke.layer === "global"
        ? stroke.layer
        : "global",
    contextId: typeof stroke.contextId === "string" ? stroke.contextId : null,
    sourceWidgetId: typeof stroke.sourceWidgetId === "string" ? stroke.sourceWidgetId : null,
  };
}

function normalizeLegacyPayload(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return {
      version: 2,
      strokes: [],
    };
  }

  if (candidate.version === 1 && Array.isArray(candidate.strokes)) {
    return {
      version: 2,
      strokes: candidate.strokes.map((stroke) => ({
        ...(normalizeStroke(stroke) ?? stroke),
        layer: "global",
        contextId: null,
        sourceWidgetId: null,
      })),
    };
  }

  const strokes = Array.isArray(candidate.strokes)
    ? candidate.strokes.map(normalizeStroke).filter((stroke) => stroke !== null)
    : [];
  return {
    version: 2,
    strokes,
  };
}

export function loadPersistedStrokes({ storage = window.localStorage } = {}) {
  const migrated = readMigratedEnvelope({
    storage,
    key: STORAGE_KEY,
    targetSchemaVersion: INK_SCHEMA_VERSION,
    legacySchemaVersion: 1,
    defaultData: {
      version: 2,
      strokes: [],
    },
    migrations: {
      2: (candidate) => normalizeLegacyPayload(candidate),
    },
    onMigrationStep: ({ from, to }) => {
      console.info(`[storage] migrated ink payload ${from} -> ${to}`);
    },
    onError: (error) => {
      console.warn("[storage] failed to read ink payload, reset to defaults.", error);
    },
  });

  const payload = normalizeLegacyPayload(migrated.data);
  return payload.strokes.map(normalizeStroke).filter((stroke) => stroke !== null);
}

export class InkPersistence {
  constructor({ storage = window.localStorage } = {}) {
    this.storage = storage;
    this._saveTimer = null;
  }

  scheduleSave(serializedPayload, delayMs = 180) {
    if (this._saveTimer) {
      window.clearTimeout(this._saveTimer);
    }

    this._saveTimer = window.setTimeout(() => {
      writeEnvelope({
        storage: this.storage,
        key: STORAGE_KEY,
        schemaVersion: INK_SCHEMA_VERSION,
        data: normalizeLegacyPayload(serializedPayload),
      });
    }, delayMs);
  }
}
