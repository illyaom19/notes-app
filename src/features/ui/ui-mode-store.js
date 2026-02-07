const STORAGE_KEY = "notes-app.ui-mode.v1";
const LEGACY_DEBUG_KEY = "notes-app.debug-controls";

function normalizeMode(value) {
  return value === "debug" ? "debug" : "production";
}

export function normalizeUiModeState(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return {
    mode: normalizeMode(source.mode),
  };
}

export function loadUiModeState({
  storage = window.localStorage,
  locationSearch = window.location.search,
} = {}) {
  const params = new URLSearchParams(locationSearch);
  const uiParam = params.get("ui");
  if (uiParam === "debug" || uiParam === "production") {
    return { mode: uiParam };
  }

  const debugParam = params.get("debug");
  if (debugParam === "1" || debugParam === "true") {
    return { mode: "debug" };
  }
  if (debugParam === "0" || debugParam === "false") {
    return { mode: "production" };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeUiModeState(JSON.parse(raw));
    }
  } catch (_error) {
    // Fall through to legacy/debug defaults.
  }

  // Backward compatibility with previous debug toggle storage.
  if (storage.getItem(LEGACY_DEBUG_KEY) === "1") {
    return { mode: "debug" };
  }

  return { mode: "production" };
}

export function saveUiModeState(state, { storage = window.localStorage } = {}) {
  const normalized = normalizeUiModeState(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function toggleUiMode(state) {
  const normalized = normalizeUiModeState(state);
  return {
    mode: normalized.mode === "debug" ? "production" : "debug",
  };
}

export function isProductionMode(state) {
  return normalizeUiModeState(state).mode !== "debug";
}

