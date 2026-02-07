const KEY = "notes-app.assets.catalog.v1";

function load(storage) {
  try {
    return JSON.parse(storage.getItem(KEY) ?? "{}") ?? {};
  } catch (_error) {
    return {};
  }
}

export function createAssetManager({ storage = window.localStorage, maxRecords = 500 } = {}) {
  function recalculateFromWidgets(widgets) {
    const catalog = {};

    for (const widget of widgets) {
      if (widget.type === "pdf-document" && typeof widget.id === "string") {
        const id = `pdf:${widget.id}`;
        catalog[id] = {
          id,
          type: "pdf",
          sizeBytes: Number.isFinite(widget.dataPayload?.bytesBase64?.length)
            ? widget.dataPayload.bytesBase64.length
            : 0,
          refs: 1,
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
        };
      }

      if (widget.type === "reference-popup" && typeof widget.dataPayload?.imageDataUrl === "string") {
        const id = `snip:${widget.id}`;
        catalog[id] = {
          id,
          type: "snip",
          sizeBytes: widget.dataPayload.imageDataUrl.length,
          refs: 1,
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
        };
      }
    }

    const bounded = Object.values(catalog)
      .sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt))
      .slice(-maxRecords);

    const output = Object.fromEntries(bounded.map((record) => [record.id, record]));
    storage.setItem(KEY, JSON.stringify(output));
    return output;
  }

  function getCatalog() {
    return load(storage);
  }

  return {
    recalculateFromWidgets,
    getCatalog,
  };
}
