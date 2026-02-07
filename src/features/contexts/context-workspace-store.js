import { createAssetManager } from "../storage/asset-manager.js";
import { readEnvelope, SCHEMA_VERSION, wrapEnvelope } from "../storage/schema-storage.js";

const STORAGE_PREFIX = "notes-app.context.workspace.v1.";
const LEGACY_GRAPH_KEY = "notes-app.graph.widgets.v1";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function keyForContext(contextId) {
  return `${STORAGE_PREFIX}${contextId}`;
}

function asPlainObject(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate;
}

function toSafeNumber(candidate, fallback) {
  return Number.isFinite(candidate) ? candidate : fallback;
}

function normalizePosition(candidate) {
  const source = asPlainObject(candidate);
  return {
    x: toSafeNumber(source.x, 0),
    y: toSafeNumber(source.y, 0),
  };
}

function normalizeSize(candidate) {
  const source = asPlainObject(candidate);
  return {
    width: Math.max(20, toSafeNumber(source.width, 240)),
    height: Math.max(20, toSafeNumber(source.height, 160)),
  };
}

function normalizeInteractionFlags(candidate) {
  const source = asPlainObject(candidate);
  return {
    movable: source.movable !== false,
    resizable: source.resizable !== false,
    collapsible: source.collapsible !== false,
  };
}

function normalizeWhitespaceZones(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      return {
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id : `zone-${index + 1}`,
        pageNumber: Math.max(1, Math.floor(toSafeNumber(entry.pageNumber, 1))),
        normalizedY: Math.max(0, Math.min(1, toSafeNumber(entry.normalizedY, 0))),
        normalizedHeight: Math.max(0, Math.min(1, toSafeNumber(entry.normalizedHeight, 0))),
        confidence: Math.max(0, Math.min(1, toSafeNumber(entry.confidence, 0))),
        collapsed: Boolean(entry.collapsed),
        linkedWidgetId:
          typeof entry.linkedWidgetId === "string" && entry.linkedWidgetId.trim()
            ? entry.linkedWidgetId
            : null,
      };
    })
    .filter((entry) => entry && entry.normalizedHeight > 0);
}

function normalizeIdList(candidate, validIds) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const value of candidate) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    if (validIds && !validIds.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizePopupMetadata(candidate, fallbackTitle) {
  const source = asPlainObject(candidate);
  const title =
    typeof source.title === "string" && source.title.trim()
      ? source.title.trim()
      : typeof fallbackTitle === "string" && fallbackTitle.trim()
        ? fallbackTitle.trim()
        : "Reference";

  return {
    id:
      typeof source.id === "string" && source.id.trim()
        ? source.id
        : globalThis.crypto?.randomUUID?.() ?? `popup-${Date.now()}`,
    title,
    type:
      typeof source.type === "string" && source.type.trim()
        ? source.type.trim()
        : "reference-popup",
    sourceDocumentId:
      typeof source.sourceDocumentId === "string" && source.sourceDocumentId.trim()
        ? source.sourceDocumentId
        : null,
    tags: normalizeIdList(source.tags),
    createdAt:
      typeof source.createdAt === "string" && source.createdAt.trim()
        ? source.createdAt
        : nowIso(),
  };
}

function encodeBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    return null;
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function decodeBytes(base64Value) {
  if (typeof base64Value !== "string" || !base64Value) {
    return null;
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

function defaultWorkspace(contextId) {
  return {
    version: 1,
    contextId,
    updatedAt: nowIso(),
    widgets: [],
    documents: [],
    documentBindings: [],
    activeWorkspaceState: {
      activeDocumentId: null,
      lastPdfWidgetId: null,
      lastReferenceWidgetId: null,
    },
  };
}

function sanitizeSerializedWidget(candidate, contextId) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : null;
  const type = typeof candidate.type === "string" && candidate.type.trim() ? candidate.type : null;
  if (!id || !type) {
    return null;
  }

  const widget = {
    id,
    type,
    contextId,
    position: normalizePosition(candidate.position),
    size: normalizeSize(candidate.size),
    collapsed: Boolean(candidate.collapsed),
    metadata: { ...asPlainObject(candidate.metadata) },
    interactionFlags: normalizeInteractionFlags(candidate.interactionFlags),
    dataPayload: {},
    runtimeState: {},
  };

  if (widget.type === "pdf-document") {
    const dataPayload = asPlainObject(candidate.dataPayload);
    widget.dataPayload.fileName =
      typeof dataPayload.fileName === "string" && dataPayload.fileName
        ? dataPayload.fileName
        : "document.pdf";
    widget.dataPayload.bytesBase64 =
      typeof dataPayload.bytesBase64 === "string" ? dataPayload.bytesBase64 : null;

    const runtimeState = asPlainObject(candidate.runtimeState);
    widget.runtimeState.whitespaceZones = normalizeWhitespaceZones(runtimeState.whitespaceZones);
    return widget;
  }

  if (widget.type === "reference-popup") {
    const dataPayload = asPlainObject(candidate.dataPayload);
    widget.dataPayload.imageDataUrl =
      typeof dataPayload.imageDataUrl === "string" ? dataPayload.imageDataUrl : null;
    widget.dataPayload.sourceLabel =
      typeof dataPayload.sourceLabel === "string" && dataPayload.sourceLabel
        ? dataPayload.sourceLabel
        : "Imported";
    widget.metadata.popupMetadata = normalizePopupMetadata(widget.metadata.popupMetadata, widget.metadata.title);
    widget.metadata.title = widget.metadata.popupMetadata.title;
    return widget;
  }

  if (widget.type === "graph-widget") {
    const dataPayload = asPlainObject(candidate.dataPayload);
    widget.dataPayload.equation =
      typeof dataPayload.equation === "string" && dataPayload.equation
        ? dataPayload.equation
        : "sin(x)";

    const view = asPlainObject(dataPayload.view);
    widget.dataPayload.view = {
      minX: toSafeNumber(view.minX, -10),
      maxX: toSafeNumber(view.maxX, 10),
      minY: toSafeNumber(view.minY, -6),
      maxY: toSafeNumber(view.maxY, 6),
    };
    return widget;
  }

  return widget;
}

function sanitizeDocumentEntry(candidate, contextId, validWidgetIds) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const widgetId =
    typeof candidate.widgetId === "string" && candidate.widgetId.trim() ? candidate.widgetId : null;
  if (!widgetId || !validWidgetIds.has(widgetId)) {
    return null;
  }

  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : makeId("doc");

  return {
    id,
    contextId,
    title:
      typeof candidate.title === "string" && candidate.title.trim()
        ? candidate.title.trim()
        : "Document",
    sourceType:
      typeof candidate.sourceType === "string" && candidate.sourceType.trim()
        ? candidate.sourceType.trim()
        : "pdf",
    widgetId,
    openedAt:
      typeof candidate.openedAt === "string"
        ? candidate.openedAt
        : typeof candidate.createdAt === "string"
          ? candidate.createdAt
          : nowIso(),
    pinned: Boolean(candidate.pinned),
    // Keep for migration only, not part of the Sprint 12 canonical document entry.
    referenceWidgetIds: normalizeIdList(candidate.referenceWidgetIds, validWidgetIds),
  };
}

function sanitizeDocumentBindingEntry(candidate, validDocumentIds, validWidgetIds) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const documentId =
    typeof candidate.documentId === "string" && candidate.documentId.trim() ? candidate.documentId : null;
  if (!documentId || !validDocumentIds.has(documentId)) {
    return null;
  }

  return {
    documentId,
    defaultReferenceIds: normalizeIdList(candidate.defaultReferenceIds, validWidgetIds),
    formulaSheetIds: normalizeIdList(candidate.formulaSheetIds, validWidgetIds),
  };
}

function sanitizeWorkspace(candidate, contextId) {
  const fallback = defaultWorkspace(contextId);
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  const widgets = Array.isArray(candidate.widgets)
    ? candidate.widgets
        .map((entry) => sanitizeSerializedWidget(entry, contextId))
        .filter((entry) => entry !== null)
    : [];

  const dedupedWidgets = [];
  const seenWidgetIds = new Set();
  for (const widget of widgets) {
    if (seenWidgetIds.has(widget.id)) {
      continue;
    }
    seenWidgetIds.add(widget.id);
    dedupedWidgets.push(widget);
  }

  const validWidgetIds = new Set(dedupedWidgets.map((entry) => entry.id));

  const documents = Array.isArray(candidate.documents)
    ? candidate.documents
        .map((entry) => sanitizeDocumentEntry(entry, contextId, validWidgetIds))
        .filter((entry) => entry !== null)
    : [];
  const validDocumentIds = new Set(documents.map((entry) => entry.id));

  const explicitBindings = Array.isArray(candidate.documentBindings)
    ? candidate.documentBindings
        .map((entry) => sanitizeDocumentBindingEntry(entry, validDocumentIds, validWidgetIds))
        .filter((entry) => entry !== null)
    : [];

  const bindingsByDocumentId = new Map(explicitBindings.map((entry) => [entry.documentId, entry]));
  for (const document of documents) {
    if (bindingsByDocumentId.has(document.id)) {
      continue;
    }

    // Backward compatibility for legacy schema where references were on document entries.
    bindingsByDocumentId.set(document.id, {
      documentId: document.id,
      defaultReferenceIds: [...document.referenceWidgetIds],
      formulaSheetIds: [],
    });
  }

  const documentBindings = Array.from(bindingsByDocumentId.values());

  const activeWorkspaceState = asPlainObject(candidate.activeWorkspaceState);

  return {
    version: 1,
    contextId,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
    widgets: dedupedWidgets,
    documents: documents.map((entry) => ({
      id: entry.id,
      contextId: entry.contextId,
      title: entry.title,
      sourceType: entry.sourceType,
      widgetId: entry.widgetId,
      openedAt: entry.openedAt,
      pinned: entry.pinned,
    })),
    documentBindings,
    activeWorkspaceState: {
      activeDocumentId:
        typeof activeWorkspaceState.activeDocumentId === "string" &&
        documents.some((entry) => entry.id === activeWorkspaceState.activeDocumentId)
          ? activeWorkspaceState.activeDocumentId
          : documents[0]?.id ?? null,
      lastPdfWidgetId:
        typeof activeWorkspaceState.lastPdfWidgetId === "string"
          ? activeWorkspaceState.lastPdfWidgetId
          : null,
      lastReferenceWidgetId:
        typeof activeWorkspaceState.lastReferenceWidgetId === "string"
          ? activeWorkspaceState.lastReferenceWidgetId
          : null,
    },
  };
}

function sanitizeLegacyGraphs(candidate, contextId) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((entry) => {
      if (!entry || typeof entry !== "object" || entry.type !== "graph-widget") {
        return null;
      }

      return sanitizeSerializedWidget(
        {
          id: entry.id,
          type: "graph-widget",
          position: entry.position,
          size: entry.size,
          collapsed: entry.collapsed,
          metadata: entry.metadata,
          dataPayload: entry.dataPayload,
        },
        contextId,
      );
    })
    .filter((entry) => entry !== null);
}

function serializeWidget(widget, contextId) {
  if (!widget || typeof widget !== "object") {
    return null;
  }

  const fallbackState = {
    id: widget.id,
    type: widget.type,
    position: widget.position,
    size: widget.size,
    metadata: widget.metadata,
    collapsed: widget.collapsed,
  };

  const state = typeof widget.toSerializableState === "function" ? widget.toSerializableState() : fallbackState;

  const base = {
    id: state.id,
    type: state.type,
    contextId,
    position: normalizePosition(state.position),
    size: normalizeSize(state.size),
    collapsed: Boolean(state.collapsed),
    metadata: { ...asPlainObject(state.metadata) },
    interactionFlags: normalizeInteractionFlags(state.interactionFlags),
    dataPayload: {},
    runtimeState: {},
  };

  if (base.type === "pdf-document") {
    base.dataPayload.fileName =
      typeof widget.fileName === "string" && widget.fileName
        ? widget.fileName
        : typeof state.metadata?.title === "string"
          ? state.metadata.title
          : "document.pdf";

    base.dataPayload.bytesBase64 = encodeBytes(widget.pdfBytes);

    if (typeof widget.getWhitespaceZones === "function") {
      base.runtimeState.whitespaceZones = normalizeWhitespaceZones(widget.getWhitespaceZones());
    }

    return sanitizeSerializedWidget(base, contextId);
  }

  if (base.type === "reference-popup") {
    base.dataPayload.imageDataUrl = typeof widget.imageDataUrl === "string" ? widget.imageDataUrl : null;
    base.dataPayload.sourceLabel =
      typeof widget.sourceLabel === "string" && widget.sourceLabel ? widget.sourceLabel : "Snip";
    return sanitizeSerializedWidget(base, contextId);
  }

  if (base.type === "graph-widget") {
    base.dataPayload = { ...asPlainObject(state.dataPayload) };
    return sanitizeSerializedWidget(base, contextId);
  }

  return sanitizeSerializedWidget(base, contextId);
}

function copyDocument(entry, contextId) {
  return {
    id: entry.id,
    contextId,
    title: entry.title,
    sourceType: entry.sourceType,
    widgetId: entry.widgetId,
    openedAt: entry.openedAt,
    pinned: Boolean(entry.pinned),
  };
}

function copyDocumentBinding(entry) {
  return {
    documentId: entry.documentId,
    defaultReferenceIds: [...normalizeIdList(entry.defaultReferenceIds)],
    formulaSheetIds: [...normalizeIdList(entry.formulaSheetIds)],
  };
}

export function createContextWorkspaceStore({ storage = window.localStorage } = {}) {
  const assetManager = createAssetManager({ storage });

  return {
    loadWorkspace(contextId) {
      const key = keyForContext(contextId);
      let workspace = defaultWorkspace(contextId);

      try {
        const raw = storage.getItem(key);
        const envelope = readEnvelope(raw);
        if (envelope?.data) {
          workspace = sanitizeWorkspace(envelope.data, contextId);
          if (envelope.schemaVersion < SCHEMA_VERSION) {
            storage.setItem(key, JSON.stringify(wrapEnvelope(workspace)));
          }
        }
      } catch (_error) {
        workspace = defaultWorkspace(contextId);
      }

      try {
        const legacyRaw = storage.getItem(LEGACY_GRAPH_KEY);
        if (legacyRaw) {
          const parsedLegacy = JSON.parse(legacyRaw);
          const legacyWidgets = sanitizeLegacyGraphs(parsedLegacy, contextId);
          const existingIds = new Set(workspace.widgets.map((entry) => entry.id));
          const additions = legacyWidgets.filter((entry) => !existingIds.has(entry.id));
          if (additions.length > 0) {
            workspace = {
              ...workspace,
              widgets: [...workspace.widgets, ...additions],
              updatedAt: nowIso(),
            };
            this.saveWorkspace(workspace);
          }
          storage.removeItem(LEGACY_GRAPH_KEY);
        }
      } catch (_error) {
        // Ignore legacy migration errors and continue with sanitized workspace.
      }

      return {
        ...workspace,
        widgets: workspace.widgets.map((entry) => ({ ...entry })),
        documents: workspace.documents.map((entry) => copyDocument(entry, contextId)),
        documentBindings: workspace.documentBindings.map((entry) => copyDocumentBinding(entry)),
        activeWorkspaceState: {
          activeDocumentId: workspace.activeWorkspaceState.activeDocumentId,
          lastPdfWidgetId: workspace.activeWorkspaceState.lastPdfWidgetId,
          lastReferenceWidgetId: workspace.activeWorkspaceState.lastReferenceWidgetId,
        },
      };
    },

    saveWorkspace(workspaceCandidate) {
      const contextId =
        workspaceCandidate && typeof workspaceCandidate.contextId === "string"
          ? workspaceCandidate.contextId
          : null;
      if (!contextId) {
        return false;
      }

      const normalized = sanitizeWorkspace(
        {
          ...workspaceCandidate,
          updatedAt: nowIso(),
        },
        contextId,
      );

      storage.setItem(keyForContext(contextId), JSON.stringify(wrapEnvelope(normalized)));
      return true;
    },

    saveFromRuntime({
      contextId,
      runtime,
      documents = [],
      documentBindings = [],
      activeDocumentId = null,
      lastPdfWidgetId = null,
      lastReferenceWidgetId = null,
    }) {
      const serializedWidgets = runtime
        .listWidgets()
        .map((widget) => serializeWidget(widget, contextId))
        .filter((entry) => entry !== null);

      assetManager.recalculateFromWidgets(serializedWidgets);

      return this.saveWorkspace({
        contextId,
        widgets: serializedWidgets,
        documents,
        documentBindings,
        activeWorkspaceState: {
          activeDocumentId,
          lastPdfWidgetId,
          lastReferenceWidgetId,
        },
      });
    },

    deleteWorkspace(contextId) {
      storage.removeItem(keyForContext(contextId));
    },

    toWidgetDefinition(serializedWidget) {
      const normalized = sanitizeSerializedWidget(serializedWidget, serializedWidget.contextId);
      if (!normalized) {
        return null;
      }

      const definition = {
        id: normalized.id,
        type: normalized.type,
        position: { ...normalized.position },
        size: { ...normalized.size },
        metadata: { ...normalized.metadata },
        interactionFlags: normalizeInteractionFlags(normalized.interactionFlags),
        collapsed: normalized.collapsed,
      };

      if (normalized.type === "pdf-document") {
        const bytes = decodeBytes(normalized.dataPayload.bytesBase64);
        if (!(bytes instanceof Uint8Array)) {
          return null;
        }

        definition.dataPayload = {
          bytes,
          fileName: normalized.dataPayload.fileName,
        };
        definition.runtimeState = {
          whitespaceZones: normalizeWhitespaceZones(normalized.runtimeState.whitespaceZones),
        };
      }

      if (normalized.type === "reference-popup") {
        definition.dataPayload = {
          imageDataUrl: normalized.dataPayload.imageDataUrl,
          sourceLabel: normalized.dataPayload.sourceLabel,
        };
      }

      if (normalized.type === "graph-widget") {
        definition.dataPayload = {
          equation: normalized.dataPayload.equation,
          view: { ...normalized.dataPayload.view },
        };
      }

      return definition;
    },

    getAssetCatalog() {
      return assetManager.getCatalog();
    },

    cloneForImport(serializedWidget, targetContextId) {
      const normalized = sanitizeSerializedWidget(serializedWidget, targetContextId);
      if (!normalized) {
        return null;
      }

      const clone = {
        ...normalized,
        id: makeId("widget"),
        contextId: targetContextId,
        position: {
          x: normalized.position.x + 28,
          y: normalized.position.y + 22,
        },
        metadata: {
          ...normalized.metadata,
        },
        interactionFlags: normalizeInteractionFlags(normalized.interactionFlags),
        dataPayload: {
          ...normalized.dataPayload,
        },
        runtimeState: {
          ...normalized.runtimeState,
        },
      };

      if (typeof clone.metadata.documentId === "string") {
        delete clone.metadata.documentId;
      }

      clone.metadata.createdFrom = "imported";
      clone.metadata.creationContextId = targetContextId;
      clone.metadata.creationCreatedAt = nowIso();

      if (clone.type === "reference-popup") {
        const existingPopupMetadata =
          clone.metadata.popupMetadata && typeof clone.metadata.popupMetadata === "object"
            ? clone.metadata.popupMetadata
            : {};

        clone.metadata.popupMetadata = {
          ...existingPopupMetadata,
          sourceDocumentId: null,
          tags: Array.isArray(existingPopupMetadata.tags)
            ? Array.from(new Set([...existingPopupMetadata.tags, "imported"]))
            : ["imported"],
        };
      }

      if (clone.type === "pdf-document") {
        clone.runtimeState = {
          whitespaceZones: normalizeWhitespaceZones(clone.runtimeState.whitespaceZones).map((zone) => ({
            ...zone,
            linkedWidgetId: null,
          })),
        };
      }

      return clone;
    },
  };
}
