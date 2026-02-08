import { createAssetManager } from "../storage/asset-manager.js";
import { readMigratedEnvelope, writeEnvelope } from "../storage/schema-migrations.js";
import { STORAGE_SCHEMA_REGISTRY } from "../storage/schema-registry.js";
import { SUPPORTED_WIDGET_TYPES as SUPPORTED_WIDGET_TYPES_LIST } from "../widget-system/widget-types.js";

const { workspace: WORKSPACE_SCHEMA } = STORAGE_SCHEMA_REGISTRY;
const STORAGE_PREFIX = WORKSPACE_SCHEMA.keyPrefix;
const LEGACY_GRAPH_KEY = "notes-app.graph.widgets.v1";
const WORKSPACE_SCHEMA_VERSION = WORKSPACE_SCHEMA.schemaVersion;
const SUPPORTED_WIDGET_TYPES = new Set(SUPPORTED_WIDGET_TYPES_LIST);

const WORKSPACE_MIGRATIONS = {
  2: (candidate) => candidate,
  3: (candidate) => candidate,
};

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

function normalizeSuggestionKind(value) {
  if (value === "expanded-area" || value === "reference-popup") {
    return value;
  }
  return null;
}

function normalizeSuggestionState(value) {
  if (
    value === "proposed" ||
    value === "accepted" ||
    value === "dismissed" ||
    value === "ghosted" ||
    value === "restored" ||
    value === "discarded"
  ) {
    return value;
  }
  return "proposed";
}

function normalizeSuggestionAnchor(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const x = Number(candidate.x);
  const y = Number(candidate.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x,
    y,
  };
}

function normalizeSuggestions(candidate, contextId) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const deduped = [];
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const scopeParts = String(contextId ?? "").split("::");
  const sectionIdFromScope = scopeParts.length > 1 ? scopeParts[1] : null;

  for (const entry of candidate) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const kind = normalizeSuggestionKind(entry.kind);
    const anchor = normalizeSuggestionAnchor(entry.anchor);
    if (!kind || !anchor) {
      continue;
    }

    const id =
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id.trim()
        : makeId("suggestion");
    const fingerprint =
      typeof entry.fingerprint === "string" && entry.fingerprint.trim()
        ? entry.fingerprint.trim()
        : `${kind}:${anchor.x.toFixed(2)}:${anchor.y.toFixed(2)}`;

    if (seenIds.has(id) || seenFingerprints.has(fingerprint)) {
      continue;
    }
    seenIds.add(id);
    seenFingerprints.add(fingerprint);

    deduped.push({
      id,
      scopeId:
        typeof entry.scopeId === "string" && entry.scopeId.trim()
          ? entry.scopeId.trim()
          : contextId,
      sectionId:
        typeof entry.sectionId === "string" && entry.sectionId.trim()
          ? entry.sectionId.trim()
          : sectionIdFromScope,
      documentId:
        typeof entry.documentId === "string" && entry.documentId.trim()
          ? entry.documentId.trim()
          : null,
      kind,
      label:
        typeof entry.label === "string" && entry.label.trim()
          ? entry.label.trim()
          : "Suggestion",
      fingerprint,
      anchor,
      payload: entry.payload && typeof entry.payload === "object" ? { ...entry.payload } : {},
      state: normalizeSuggestionState(entry.state),
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.trim()
          ? entry.createdAt
          : nowIso(),
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt.trim()
          ? entry.updatedAt
          : nowIso(),
      dismissedAt:
        typeof entry.dismissedAt === "string" && entry.dismissedAt.trim()
          ? entry.dismissedAt
          : null,
      restoredAt:
        typeof entry.restoredAt === "string" && entry.restoredAt.trim()
          ? entry.restoredAt
          : null,
      acceptedAt:
        typeof entry.acceptedAt === "string" && entry.acceptedAt.trim()
          ? entry.acceptedAt
          : null,
      discardedAt:
        typeof entry.discardedAt === "string" && entry.discardedAt.trim()
          ? entry.discardedAt
          : null,
    });
  }

  return deduped;
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

function normalizeContentType(candidate, fallback = "text") {
  if (candidate === "image" || candidate === "definition") {
    return candidate;
  }
  if (fallback === "image" || fallback === "definition") {
    return fallback;
  }
  return "text";
}

function normalizeCitation(candidate, { snippetType = "text", fallbackSourceTitle = "Source" } = {}) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const sourceTitle =
    typeof candidate.sourceTitle === "string" && candidate.sourceTitle.trim()
      ? candidate.sourceTitle.trim()
      : typeof fallbackSourceTitle === "string" && fallbackSourceTitle.trim()
        ? fallbackSourceTitle.trim()
        : "Source";
  const url =
    typeof candidate.url === "string" && candidate.url.trim() ? candidate.url.trim() : "";
  const attributionText =
    typeof candidate.attributionText === "string" && candidate.attributionText.trim()
      ? candidate.attributionText.trim()
      : sourceTitle;

  const citation = {
    sourceTitle,
    url,
    accessedAt:
      typeof candidate.accessedAt === "string" && candidate.accessedAt.trim()
        ? candidate.accessedAt
        : nowIso(),
    snippetType: normalizeContentType(candidate.snippetType, snippetType),
    attributionText,
  };

  if (typeof candidate.author === "string" && candidate.author.trim()) {
    citation.author = candidate.author.trim();
  }
  if (typeof candidate.publisher === "string" && candidate.publisher.trim()) {
    citation.publisher = candidate.publisher.trim();
  }

  return citation;
}

function normalizeResearchCapture(candidate, contextId) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const contentType = normalizeContentType(candidate.contentType);
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!content) {
    return null;
  }

  const citation = normalizeCitation(candidate.citation, {
    snippetType: contentType,
  });

  if (!citation || !citation.sourceTitle || !citation.url || !citation.attributionText) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : makeId("capture"),
    contextId:
      typeof candidate.contextId === "string" && candidate.contextId.trim()
        ? candidate.contextId
        : contextId,
    contentType,
    content,
    citation,
  };
}

function researchCaptureKey(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return "";
  }

  return [
    candidate.contextId ?? "",
    candidate.contentType ?? "",
    candidate.content ?? "",
    candidate.citation?.url ?? "",
    candidate.citation?.attributionText ?? "",
  ].join("|");
}

function normalizeResearchCaptures(candidate, contextId) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const deduped = [];
  const seenById = new Set();
  const seenByKey = new Set();

  for (const entry of candidate) {
    const normalized = normalizeResearchCapture(entry, contextId);
    if (!normalized) {
      continue;
    }

    if (seenById.has(normalized.id)) {
      continue;
    }

    const key = researchCaptureKey(normalized);
    if (seenByKey.has(key)) {
      continue;
    }

    seenById.add(normalized.id);
    seenByKey.add(key);
    deduped.push(normalized);
  }

  return deduped;
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

function appendAssetRef(refsByAssetId, assetId, ownerRef) {
  if (!(refsByAssetId instanceof Map)) {
    return;
  }
  if (typeof assetId !== "string" || !assetId.trim()) {
    return;
  }
  if (typeof ownerRef !== "string" || !ownerRef.trim()) {
    return;
  }

  const existing = refsByAssetId.get(assetId);
  if (existing instanceof Set) {
    existing.add(ownerRef);
    return;
  }

  refsByAssetId.set(assetId, new Set([ownerRef]));
}

function canonicalizeWidgetAssets({ widget, contextId, assetManager, refsByAssetId }) {
  if (!widget || typeof widget !== "object") {
    return { widget, changed: false };
  }

  const ownerRef = assetManager.ownerRef(contextId, widget.id);
  let changed = false;
  const nextWidget = {
    ...widget,
    dataPayload: {
      ...asPlainObject(widget.dataPayload),
    },
  };

  if (nextWidget.type === "pdf-document") {
    const pdfAssetId =
      typeof nextWidget.dataPayload.pdfAssetId === "string" && nextWidget.dataPayload.pdfAssetId.trim()
        ? nextWidget.dataPayload.pdfAssetId
        : null;
    if (pdfAssetId) {
      const bytesFromAsset = assetManager.loadPdfBytes(pdfAssetId);
      if (bytesFromAsset instanceof Uint8Array && bytesFromAsset.length > 0) {
        appendAssetRef(refsByAssetId, pdfAssetId, ownerRef);
        if (typeof nextWidget.dataPayload.bytesBase64 === "string" && nextWidget.dataPayload.bytesBase64) {
          nextWidget.dataPayload.bytesBase64 = null;
          changed = true;
        }
        return { widget: nextWidget, changed };
      }

      // Asset record was stale; fall back to inline bytes when available.
      nextWidget.dataPayload.pdfAssetId = null;
      changed = true;
    }

    const bytesBase64 =
      typeof nextWidget.dataPayload.bytesBase64 === "string" ? nextWidget.dataPayload.bytesBase64 : null;
    const bytes = decodeBytes(bytesBase64);
    if (!(bytes instanceof Uint8Array)) {
      return { widget: nextWidget, changed };
    }

    const registered = assetManager.registerPdfBytes(bytes, {
      ownerId: ownerRef,
    });
    if (!registered) {
      return { widget: nextWidget, changed };
    }

    nextWidget.dataPayload.pdfAssetId = registered.id;
    nextWidget.dataPayload.bytesBase64 = null;
    appendAssetRef(refsByAssetId, registered.id, ownerRef);
    changed = true;
    return { widget: nextWidget, changed };
  }

  if (nextWidget.type === "reference-popup") {
    const imageAssetId =
      typeof nextWidget.dataPayload.imageAssetId === "string" && nextWidget.dataPayload.imageAssetId.trim()
        ? nextWidget.dataPayload.imageAssetId
        : null;
    if (imageAssetId) {
      const dataUrlFromAsset = assetManager.loadImageDataUrl(imageAssetId);
      if (typeof dataUrlFromAsset === "string" && dataUrlFromAsset.trim()) {
        appendAssetRef(refsByAssetId, imageAssetId, ownerRef);
        if (typeof nextWidget.dataPayload.imageDataUrl === "string" && nextWidget.dataPayload.imageDataUrl) {
          nextWidget.dataPayload.imageDataUrl = null;
          changed = true;
        }
        return { widget: nextWidget, changed };
      }

      // Asset record was stale; fall back to inline image data when available.
      nextWidget.dataPayload.imageAssetId = null;
      changed = true;
    }

    const imageDataUrl =
      typeof nextWidget.dataPayload.imageDataUrl === "string" && nextWidget.dataPayload.imageDataUrl.trim()
        ? nextWidget.dataPayload.imageDataUrl
        : null;
    if (!imageDataUrl) {
      return { widget: nextWidget, changed };
    }

    const registered = assetManager.registerImageDataUrl(imageDataUrl, {
      ownerId: ownerRef,
      derivedFrom:
        typeof nextWidget.dataPayload.researchCaptureId === "string"
          ? nextWidget.dataPayload.researchCaptureId
          : null,
    });
    if (!registered) {
      return { widget: nextWidget, changed };
    }

    nextWidget.dataPayload.imageAssetId = registered.id;
    nextWidget.dataPayload.imageDataUrl = null;
    appendAssetRef(refsByAssetId, registered.id, ownerRef);
    changed = true;
    return { widget: nextWidget, changed };
  }

  return { widget: nextWidget, changed };
}

function canonicalizeWorkspaceAssets(workspace, contextId, assetManager) {
  const refsByAssetId = new Map();
  const nextWidgets = [];
  let changed = false;

  for (const widget of workspace.widgets) {
    const result = canonicalizeWidgetAssets({
      widget,
      contextId,
      assetManager,
      refsByAssetId,
    });
    if (result.changed) {
      changed = true;
    }
    nextWidgets.push(result.widget);
  }

  return {
    workspace: changed
      ? {
          ...workspace,
          widgets: nextWidgets,
          updatedAt: nowIso(),
        }
      : workspace,
    refsByAssetId,
    changed,
  };
}

function defaultWorkspace(contextId) {
  return {
    version: 1,
    contextId,
    updatedAt: nowIso(),
    widgets: [],
    researchCaptures: [],
    suggestions: [],
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
  if (!id || !type || !SUPPORTED_WIDGET_TYPES.has(type)) {
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
    widget.dataPayload.pdfAssetId =
      typeof dataPayload.pdfAssetId === "string" && dataPayload.pdfAssetId.trim()
        ? dataPayload.pdfAssetId
        : null;
    widget.dataPayload.bytesBase64 =
      typeof dataPayload.bytesBase64 === "string" ? dataPayload.bytesBase64 : null;

    const runtimeState = asPlainObject(candidate.runtimeState);
    widget.runtimeState.whitespaceZones = normalizeWhitespaceZones(runtimeState.whitespaceZones);
    return widget;
  }

  if (widget.type === "reference-popup") {
    const dataPayload = asPlainObject(candidate.dataPayload);
    widget.dataPayload.imageAssetId =
      typeof dataPayload.imageAssetId === "string" && dataPayload.imageAssetId.trim()
        ? dataPayload.imageAssetId
        : null;
    widget.dataPayload.imageDataUrl =
      typeof dataPayload.imageDataUrl === "string" ? dataPayload.imageDataUrl : null;
    widget.dataPayload.textContent =
      typeof dataPayload.textContent === "string" ? dataPayload.textContent : "";
    widget.dataPayload.sourceLabel =
      typeof dataPayload.sourceLabel === "string" && dataPayload.sourceLabel
        ? dataPayload.sourceLabel
        : "Imported";
    widget.dataPayload.contentType = normalizeContentType(
      dataPayload.contentType,
      widget.dataPayload.imageDataUrl || widget.dataPayload.imageAssetId ? "image" : "text",
    );
    widget.dataPayload.researchCaptureId =
      typeof dataPayload.researchCaptureId === "string" && dataPayload.researchCaptureId.trim()
        ? dataPayload.researchCaptureId
        : null;
    widget.dataPayload.citation = normalizeCitation(dataPayload.citation, {
      snippetType: widget.dataPayload.contentType,
      fallbackSourceTitle: widget.dataPayload.sourceLabel,
    });

    const hasImage = Boolean(widget.dataPayload.imageDataUrl || widget.dataPayload.imageAssetId);
    const hasText = Boolean(widget.dataPayload.textContent.trim());
    if (widget.dataPayload.contentType === "image" && !hasImage && hasText) {
      widget.dataPayload.contentType = "text";
    } else if (widget.dataPayload.contentType !== "image" && !hasText && hasImage) {
      widget.dataPayload.contentType = "image";
    }

    if (widget.dataPayload.citation) {
      widget.dataPayload.citation = normalizeCitation(widget.dataPayload.citation, {
        snippetType: widget.dataPayload.contentType,
        fallbackSourceTitle: widget.dataPayload.sourceLabel,
      });
    }

    widget.metadata.popupMetadata = normalizePopupMetadata(widget.metadata.popupMetadata, widget.metadata.title);
    widget.metadata.title = widget.metadata.popupMetadata.title;
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
    sourceDocumentId:
      typeof candidate.sourceDocumentId === "string" && candidate.sourceDocumentId.trim()
        ? candidate.sourceDocumentId
        : null,
    linkStatus: candidate.linkStatus === "linked" ? "linked" : "frozen",
    sourceSnapshot:
      candidate.sourceSnapshot && typeof candidate.sourceSnapshot === "object"
        ? {
            title:
              typeof candidate.sourceSnapshot.title === "string" && candidate.sourceSnapshot.title.trim()
                ? candidate.sourceSnapshot.title.trim()
                : null,
            sourceType:
              typeof candidate.sourceSnapshot.sourceType === "string" && candidate.sourceSnapshot.sourceType.trim()
                ? candidate.sourceSnapshot.sourceType.trim()
                : null,
          }
        : null,
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
  const researchCaptures = normalizeResearchCaptures(candidate.researchCaptures, contextId);
  const suggestions = normalizeSuggestions(candidate.suggestions, contextId);

  return {
    version: 1,
    contextId,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
    widgets: dedupedWidgets,
    researchCaptures,
    suggestions,
    documents: documents.map((entry) => ({
      id: entry.id,
      contextId: entry.contextId,
      title: entry.title,
      sourceType: entry.sourceType,
      widgetId: entry.widgetId,
      openedAt: entry.openedAt,
      pinned: entry.pinned,
      sourceDocumentId: entry.sourceDocumentId,
      linkStatus: entry.linkStatus,
      sourceSnapshot: entry.sourceSnapshot
        ? {
            title: entry.sourceSnapshot.title,
            sourceType: entry.sourceSnapshot.sourceType,
          }
        : null,
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

function serializeWidget(widget, contextId, { assetManager = null, refsByAssetId = null } = {}) {
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
    const ownerRef = assetManager?.ownerRef?.(contextId, base.id) ?? null;

    base.dataPayload.fileName =
      typeof widget.fileName === "string" && widget.fileName
        ? widget.fileName
        : typeof state.metadata?.title === "string"
          ? state.metadata.title
          : "document.pdf";

    const registeredPdfAsset =
      assetManager && widget.pdfBytes instanceof Uint8Array
        ? assetManager.registerPdfBytes(widget.pdfBytes, { ownerId: ownerRef })
        : null;
    if (registeredPdfAsset) {
      base.dataPayload.pdfAssetId = registeredPdfAsset.id;
      base.dataPayload.bytesBase64 = null;
      appendAssetRef(refsByAssetId, registeredPdfAsset.id, ownerRef);
    } else {
      base.dataPayload.pdfAssetId = null;
      base.dataPayload.bytesBase64 = encodeBytes(widget.pdfBytes);
    }

    if (typeof widget.getWhitespaceZones === "function") {
      base.runtimeState.whitespaceZones = normalizeWhitespaceZones(widget.getWhitespaceZones());
    }

    return sanitizeSerializedWidget(base, contextId);
  }

  if (base.type === "reference-popup") {
    const ownerRef = assetManager?.ownerRef?.(contextId, base.id) ?? null;
    const imageDataUrl = typeof widget.imageDataUrl === "string" ? widget.imageDataUrl : null;
    const registeredImageAsset =
      assetManager && imageDataUrl
        ? assetManager.registerImageDataUrl(imageDataUrl, {
            ownerId: ownerRef,
            derivedFrom:
              typeof widget.researchCaptureId === "string" ? widget.researchCaptureId : null,
          })
        : null;

    base.dataPayload.imageAssetId = registeredImageAsset ? registeredImageAsset.id : null;
    base.dataPayload.imageDataUrl = registeredImageAsset ? null : imageDataUrl;
    base.dataPayload.textContent = typeof widget.textContent === "string" ? widget.textContent : "";
    base.dataPayload.sourceLabel =
      typeof widget.sourceLabel === "string" && widget.sourceLabel ? widget.sourceLabel : "Snip";
    base.dataPayload.contentType = normalizeContentType(
      widget.contentType,
      base.dataPayload.imageDataUrl ? "image" : "text",
    );
    base.dataPayload.researchCaptureId =
      typeof widget.researchCaptureId === "string" && widget.researchCaptureId.trim()
        ? widget.researchCaptureId
        : null;
    base.dataPayload.citation = normalizeCitation(widget.citation, {
      snippetType: base.dataPayload.contentType,
      fallbackSourceTitle: base.dataPayload.sourceLabel,
    });

    if (registeredImageAsset) {
      appendAssetRef(refsByAssetId, registeredImageAsset.id, ownerRef);
    }
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
    sourceDocumentId:
      typeof entry.sourceDocumentId === "string" && entry.sourceDocumentId.trim()
        ? entry.sourceDocumentId
        : null,
    linkStatus: entry.linkStatus === "linked" ? "linked" : "frozen",
    sourceSnapshot:
      entry.sourceSnapshot && typeof entry.sourceSnapshot === "object"
        ? {
            title:
              typeof entry.sourceSnapshot.title === "string" && entry.sourceSnapshot.title.trim()
                ? entry.sourceSnapshot.title.trim()
                : null,
            sourceType:
              typeof entry.sourceSnapshot.sourceType === "string" && entry.sourceSnapshot.sourceType.trim()
                ? entry.sourceSnapshot.sourceType.trim()
                : null,
          }
        : null,
  };
}

function copyDocumentBinding(entry) {
  return {
    documentId: entry.documentId,
    defaultReferenceIds: [...normalizeIdList(entry.defaultReferenceIds)],
    formulaSheetIds: [...normalizeIdList(entry.formulaSheetIds)],
  };
}

function copyResearchCapture(entry, contextId) {
  const normalized = normalizeResearchCapture(entry, contextId);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    citation: { ...normalized.citation },
  };
}

export function createContextWorkspaceStore({ storage = window.localStorage } = {}) {
  const assetManager = createAssetManager({ storage });

  return {
    loadWorkspace(contextId) {
      const key = keyForContext(contextId);
      let workspace = defaultWorkspace(contextId);

      const loaded = readMigratedEnvelope({
        storage,
        key,
        targetSchemaVersion: WORKSPACE_SCHEMA_VERSION,
        legacySchemaVersion: 1,
        defaultData: defaultWorkspace(contextId),
        migrations: WORKSPACE_MIGRATIONS,
        onMigrationStep: ({ from, to }) => {
          console.info(`[storage] migrated workspace ${contextId} ${from} -> ${to}`);
        },
        onError: (error) => {
          console.warn(`[storage] failed to read workspace ${contextId}, reset to defaults.`, error);
        },
      });
      const rawWidgets = Array.isArray(loaded?.data?.widgets) ? loaded.data.widgets : [];
      const hasUnsupportedWidgetTypes = rawWidgets.some((entry) => {
        const type = entry && typeof entry.type === "string" ? entry.type : null;
        return !type || !SUPPORTED_WIDGET_TYPES.has(type);
      });
      workspace = sanitizeWorkspace(loaded.data, contextId);

      try {
        const legacyRaw = storage.getItem(LEGACY_GRAPH_KEY);
        if (legacyRaw) {
          JSON.parse(legacyRaw);
          storage.removeItem(LEGACY_GRAPH_KEY);
        }
      } catch (_error) {
        // Ignore legacy migration errors and continue with sanitized workspace.
      }

      const canonicalized = canonicalizeWorkspaceAssets(workspace, contextId, assetManager);
      workspace = sanitizeWorkspace(canonicalized.workspace, contextId);
      assetManager.replaceContextReferences(contextId, canonicalized.refsByAssetId);
      if (canonicalized.changed || hasUnsupportedWidgetTypes) {
        const saved = this.saveWorkspace(workspace);
        if (!saved) {
          console.warn(`[storage] failed to persist canonicalized workspace ${contextId}.`);
        }
      }

      return {
        ...workspace,
        widgets: workspace.widgets.map((entry) => ({ ...entry })),
        researchCaptures: workspace.researchCaptures
          .map((entry) => copyResearchCapture(entry, contextId))
          .filter((entry) => entry !== null),
        suggestions: workspace.suggestions.map((entry) => ({
          ...entry,
          anchor: { ...entry.anchor },
          payload: { ...entry.payload },
        })),
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

      const canonicalized = canonicalizeWorkspaceAssets(normalized, contextId, assetManager);
      const workspace = sanitizeWorkspace(canonicalized.workspace, contextId);

      try {
        assetManager.replaceContextReferences(contextId, canonicalized.refsByAssetId);
        writeEnvelope({
          storage,
          key: keyForContext(contextId),
          schemaVersion: WORKSPACE_SCHEMA_VERSION,
          data: workspace,
        });
      } catch (error) {
        console.warn(`[storage] failed to persist workspace ${contextId}.`, error);
        return false;
      }

      return true;
    },

    saveFromRuntime({
      contextId,
      runtime,
      researchCaptures = [],
      suggestions = [],
      documents = [],
      documentBindings = [],
      activeDocumentId = null,
      lastPdfWidgetId = null,
      lastReferenceWidgetId = null,
    }) {
      const serializedWidgets = runtime
        .listWidgets()
        .map((widget) => serializeWidget(widget, contextId, { assetManager }))
        .filter((entry) => entry !== null);

      const saved = this.saveWorkspace({
        contextId,
        widgets: serializedWidgets,
        researchCaptures,
        suggestions,
        documents,
        documentBindings,
        activeWorkspaceState: {
          activeDocumentId,
          lastPdfWidgetId,
          lastReferenceWidgetId,
        },
      });

      return saved;
    },

    deleteWorkspace(contextId) {
      storage.removeItem(keyForContext(contextId));
      assetManager.removeContextReferences(contextId);
      assetManager.scheduleGarbageCollection({ delayMs: 120 });
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
        const bytesFromAsset =
          typeof normalized.dataPayload.pdfAssetId === "string"
            ? assetManager.loadPdfBytes(normalized.dataPayload.pdfAssetId)
            : null;
        const bytes = bytesFromAsset ?? decodeBytes(normalized.dataPayload.bytesBase64);
        const hasBytes = bytes instanceof Uint8Array && bytes.length > 0;

        definition.dataPayload = {
          bytes: hasBytes ? bytes : null,
          fileName: normalized.dataPayload.fileName,
          pdfAssetId: normalized.dataPayload.pdfAssetId,
        };
        definition.metadata = {
          ...definition.metadata,
          missingPdfBytes: !hasBytes,
        };
        definition.runtimeState = {
          ...(normalized.runtimeState && typeof normalized.runtimeState === "object"
            ? normalized.runtimeState
            : {}),
          whitespaceZones: normalizeWhitespaceZones(normalized.runtimeState.whitespaceZones),
        };
      }

      if (normalized.type === "reference-popup") {
        const imageDataUrl =
          typeof normalized.dataPayload.imageAssetId === "string"
            ? assetManager.loadImageDataUrl(normalized.dataPayload.imageAssetId)
            : normalized.dataPayload.imageDataUrl;

        definition.dataPayload = {
          imageDataUrl,
          imageAssetId: normalized.dataPayload.imageAssetId,
          textContent: normalized.dataPayload.textContent,
          sourceLabel: normalized.dataPayload.sourceLabel,
          contentType: normalized.dataPayload.contentType,
          citation: normalized.dataPayload.citation ? { ...normalized.dataPayload.citation } : null,
          researchCaptureId: normalized.dataPayload.researchCaptureId,
        };
      }

      return definition;
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

    runMaintenance() {
      assetManager.scheduleGarbageCollection({ delayMs: 20, enforceBudget: false });
      return assetManager.snapshot();
    },
  };
}
