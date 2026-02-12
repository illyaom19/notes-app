const DEFAULT_WORLD_SIZE_CONFIG = Object.freeze({
  "expanded-area": {
    width: 420,
    height: 260,
    minWidth: 220,
    minHeight: 120,
    maxWidth: 1200,
    maxHeight: 900,
  },
  "pdf-document": {
    width: 480,
    height: 680,
    minWidth: 280,
    minHeight: 320,
    maxWidth: 1400,
    maxHeight: 2200,
  },
  "reference-popup": {
    width: 280,
    height: 210,
    minWidth: 180,
    minHeight: 120,
    maxWidth: 980,
    maxHeight: 780,
  },
  diagram: {
    width: 520,
    height: 340,
    minWidth: 260,
    minHeight: 180,
    maxWidth: 1400,
    maxHeight: 1000,
  },
});

const STORAGE_KEY = "notes-app.world-size-config.v1";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFinite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeTypeKey(type) {
  return typeof type === "string" && type.trim() ? type.trim() : "reference-popup";
}

function normalizeWorldSizeEntry(candidate, fallback) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const minWidth = Math.max(40, toFinite(source.minWidth, fallback.minWidth));
  const minHeight = Math.max(40, toFinite(source.minHeight, fallback.minHeight));
  const maxWidth = Math.max(minWidth, toFinite(source.maxWidth, fallback.maxWidth));
  const maxHeight = Math.max(minHeight, toFinite(source.maxHeight, fallback.maxHeight));

  return {
    width: clamp(toFinite(source.width, fallback.width), minWidth, maxWidth),
    height: clamp(toFinite(source.height, fallback.height), minHeight, maxHeight),
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  };
}

export function defaultWorldSizeConfig() {
  return {
    "expanded-area": { ...DEFAULT_WORLD_SIZE_CONFIG["expanded-area"] },
    "pdf-document": { ...DEFAULT_WORLD_SIZE_CONFIG["pdf-document"] },
    "reference-popup": { ...DEFAULT_WORLD_SIZE_CONFIG["reference-popup"] },
    diagram: { ...DEFAULT_WORLD_SIZE_CONFIG.diagram },
  };
}

export function normalizeWorldSizeConfig(candidate) {
  const base = defaultWorldSizeConfig();
  const source = candidate && typeof candidate === "object" ? candidate : {};

  for (const type of Object.keys(base)) {
    base[type] = normalizeWorldSizeEntry(source[type], base[type]);
  }

  return base;
}

export function loadWorldSizeConfig({ storage = window.localStorage } = {}) {
  const fallback = defaultWorldSizeConfig();

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return normalizeWorldSizeConfig(parsed);
  } catch (_error) {
    return fallback;
  }
}

export function saveWorldSizeConfig(config, { storage = window.localStorage } = {}) {
  const normalized = normalizeWorldSizeConfig(config);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn("[storage] failed to persist world size config.", error);
  }
  return normalized;
}

export function worldSizeDefaultsForType(config, type) {
  const normalizedType = normalizeTypeKey(type);
  const normalizedConfig = normalizeWorldSizeConfig(config);
  return normalizedConfig[normalizedType] ?? normalizedConfig["reference-popup"];
}

export function normalizeWorldSizeForType(config, type, requestedSize = null) {
  const defaults = worldSizeDefaultsForType(config, type);

  const source = requestedSize && typeof requestedSize === "object" ? requestedSize : {};
  return {
    width: clamp(toFinite(source.width, defaults.width), defaults.minWidth, defaults.maxWidth),
    height: clamp(toFinite(source.height, defaults.height), defaults.minHeight, defaults.maxHeight),
  };
}

export function worldSizeFromScreenPixels(cameraZoom, pixelSize) {
  const zoom = Math.max(0.25, toFinite(cameraZoom, 1));
  const source = pixelSize && typeof pixelSize === "object" ? pixelSize : {};

  return {
    width: Math.max(1, toFinite(source.width, 1) / zoom),
    height: Math.max(1, toFinite(source.height, 1) / zoom),
  };
}

export function placementMetadata({ type, intent, size, position, anchor, zoom } = {}) {
  const normalizedType = normalizeTypeKey(type);
  const normalizedIntent = intent && typeof intent === "object" ? intent : null;

  return {
    placementType: normalizedType,
    sizeMode: "world-units",
    insertedAtZoom: Number.isFinite(zoom) ? Number(zoom.toFixed(4)) : 1,
    worldSize: {
      width: Number.isFinite(size?.width) ? Number(size.width.toFixed(2)) : 0,
      height: Number.isFinite(size?.height) ? Number(size.height.toFixed(2)) : 0,
    },
    worldPosition: {
      x: Number.isFinite(position?.x) ? Number(position.x.toFixed(2)) : 0,
      y: Number.isFinite(position?.y) ? Number(position.y.toFixed(2)) : 0,
    },
    anchor: {
      x: Number.isFinite(anchor?.x) ? Number(anchor.x.toFixed(2)) : null,
      y: Number.isFinite(anchor?.y) ? Number(anchor.y.toFixed(2)) : null,
    },
    createdFrom: normalizedIntent?.createdFrom ?? "manual",
  };
}
