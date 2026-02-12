function hashStringStable(value) {
  const input = typeof value === "string" ? value : String(value ?? "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function hashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return "0";
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function hashRasterDocument(rasterDocument) {
  if (!rasterDocument || typeof rasterDocument !== "object" || !Array.isArray(rasterDocument.pages)) {
    return "0";
  }
  let hash = 0x811c9dc5;
  for (const page of rasterDocument.pages) {
    const levels = Array.isArray(page?.levels) ? page.levels : [];
    const prefix = `${Number(page?.pageNumber) || 0}:${Number(page?.width) || 0}:${Number(page?.height) || 0}:${levels.length}`;
    for (let index = 0; index < prefix.length; index += 1) {
      hash ^= prefix.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    for (const level of levels) {
      const descriptor = `${Number(level?.width) || 0}:${Number(level?.height) || 0}:${
        typeof level?.dataUrl === "string" ? level.dataUrl.length : 0
      }`;
      for (let index = 0; index < descriptor.length; index += 1) {
        hash ^= descriptor.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return (hash >>> 0).toString(16);
}

function normalizeNumber(value, precision = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(precision));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const sorted = {};
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

function normalizeInk(strokes) {
  if (!Array.isArray(strokes)) {
    return [];
  }
  return strokes
    .filter((stroke) => stroke && typeof stroke === "object")
    .map((stroke) => ({
      color: typeof stroke.color === "string" ? stroke.color : "",
      baseWidth: normalizeNumber(stroke.baseWidth, 3),
      anchorMode: typeof stroke.anchorMode === "string" ? stroke.anchorMode : "uv",
      anchorBounds: {
        width: normalizeNumber(stroke.anchorBounds?.width, 3),
        height: normalizeNumber(stroke.anchorBounds?.height, 3),
      },
      points: Array.isArray(stroke.points)
        ? stroke.points
            .filter((point) => point && typeof point === "object")
            .map((point) => ({
              u: normalizeNumber(point.u, 5),
              v: normalizeNumber(point.v, 5),
              lx: normalizeNumber(point.lx, 3),
              ly: normalizeNumber(point.ly, 3),
              p: normalizeNumber(point.p, 4),
            }))
        : [],
    }));
}

function hashPayload(payload) {
  const serialized = JSON.stringify(canonicalize(payload));
  return `${hashStringStable(serialized)}:${serialized.length}`;
}

export function fingerprintReferenceEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return "reference:invalid";
  }
  const payload = {
    kind: "reference",
    contentType: entry.contentType === "image" ? "image" : "text",
    imageDataUrl: typeof entry.imageDataUrl === "string" ? entry.imageDataUrl : "",
    textContent: typeof entry.textContent === "string" ? entry.textContent : "",
    citation: entry.citation && typeof entry.citation === "object" ? entry.citation : null,
    ink: normalizeInk(entry.inkStrokes),
  };
  return `reference:${hashPayload(payload)}`;
}

export function fingerprintNoteEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return "note:invalid";
  }
  const widgetType =
    entry.metadata?.widgetType === "diagram" || entry.widgetType === "diagram"
      ? "diagram"
      : "note";
  const payload = {
    kind: widgetType,
    note:
      typeof entry.metadata?.note === "string"
        ? entry.metadata.note
        : typeof entry.note === "string"
          ? entry.note
          : "",
    diagramDoc:
      widgetType === "diagram" && entry.metadata?.diagramDoc && typeof entry.metadata.diagramDoc === "object"
        ? entry.metadata.diagramDoc
        : null,
    ink: normalizeInk(entry.inkStrokes),
  };
  return `${widgetType}:${hashPayload(payload)}`;
}

export function fingerprintDocumentEntry(entry, { pdfBytes = null, pdfRasterDocument = null } = {}) {
  if (!entry || typeof entry !== "object") {
    return "document:invalid";
  }

  const sourceId =
    typeof entry.id === "string" && entry.id.trim()
      ? entry.id.trim()
      : typeof entry.sourceDocumentId === "string" && entry.sourceDocumentId.trim()
        ? entry.sourceDocumentId.trim()
        : null;
  if (sourceId) {
    return `document:source:${sourceId}`;
  }

  const payload = {
    kind: "document",
    bytesHash: hashBytes(pdfBytes),
    bytesLength: pdfBytes instanceof Uint8Array ? pdfBytes.length : 0,
    rasterHash: hashRasterDocument(pdfRasterDocument),
    ink: normalizeInk(entry.inkStrokes),
  };
  return `document:${hashPayload(payload)}`;
}
