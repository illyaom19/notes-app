const STORAGE_KEY = "notes-app.ink.strokes.v1";

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

export function loadPersistedStrokes() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    if (parsed.version === 2 && Array.isArray(parsed.strokes)) {
      return parsed.strokes.map(normalizeStroke).filter((stroke) => stroke !== null);
    }

    // Backward compatibility for legacy global-only strokes.
    if (parsed.version === 1 && Array.isArray(parsed.strokes)) {
      return parsed.strokes.map((stroke) => ({
        ...(normalizeStroke(stroke) ?? stroke),
        layer: "global",
        contextId: null,
        sourceWidgetId: null,
      }));
    }

    if (!Array.isArray(parsed.strokes)) {
      return [];
    }

    return parsed.strokes.map(normalizeStroke).filter((stroke) => stroke !== null);
  } catch (_error) {
    return [];
  }
}

export class InkPersistence {
  constructor() {
    this._saveTimer = null;
  }

  scheduleSave(serializedPayload, delayMs = 180) {
    if (this._saveTimer) {
      window.clearTimeout(this._saveTimer);
    }

    this._saveTimer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedPayload));
    }, delayMs);
  }
}
