const STORAGE_KEY = "notes-app.ink.strokes.v1";

export function loadPersistedStrokes() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.strokes)) {
      return [];
    }

    return parsed.strokes;
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
