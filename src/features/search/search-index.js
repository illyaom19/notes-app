function text(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function widgetFields(widget) {
  const fields = [];
  fields.push(text(widget.type));
  fields.push(text(widget.metadata?.title));
  fields.push(text(widget.metadata?.note));
  fields.push(text(widget.metadata?.createdFrom));
  fields.push(text(widget.metadata?.popupMetadata?.title));
  fields.push(text(widget.metadata?.popupMetadata?.sourceDocumentId));
  if (Array.isArray(widget.metadata?.popupMetadata?.tags)) {
    for (const tag of widget.metadata.popupMetadata.tags) {
      fields.push(text(tag));
    }
  }
  return fields.filter(Boolean);
}

export function createSearchIndex({ runtime, getActiveContextId } = {}) {
  const entries = new Map();

  function rebuild() {
    entries.clear();
    const contextId = typeof getActiveContextId === "function" ? getActiveContextId() : null;
    for (const widget of runtime.listWidgets()) {
      entries.set(widget.id, {
        id: `${contextId ?? "none"}:${widget.id}`,
        contextId,
        widgetId: widget.id,
        fields: widgetFields(widget),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  function search(query) {
    const q = text(query);
    if (!q) {
      return [];
    }
    return Array.from(entries.values()).filter((entry) => entry.fields.some((field) => field.includes(q)));
  }

  return { rebuild, search };
}
