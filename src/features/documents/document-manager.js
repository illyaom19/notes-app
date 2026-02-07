function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function dedupeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

function sanitizeDocument(entry, contextId) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const id = typeof entry.id === "string" && entry.id.trim() ? entry.id : makeId("doc");
  const widgetId = typeof entry.widgetId === "string" && entry.widgetId.trim() ? entry.widgetId : null;
  if (!widgetId) {
    return null;
  }

  return {
    id,
    contextId,
    title:
      typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : "Document",
    sourceType:
      typeof entry.sourceType === "string" && entry.sourceType.trim() ? entry.sourceType.trim() : "pdf",
    widgetId,
    openedAt: typeof entry.openedAt === "string" ? entry.openedAt : nowIso(),
    pinned: Boolean(entry.pinned),
  };
}

function sanitizeBinding(binding, documentIds, validWidgetIds) {
  if (!binding || typeof binding !== "object") {
    return null;
  }

  const documentId =
    typeof binding.documentId === "string" && binding.documentId.trim() ? binding.documentId : null;
  if (!documentId || !documentIds.has(documentId)) {
    return null;
  }

  const defaultReferenceIds = dedupeStringArray(binding.defaultReferenceIds).filter((widgetId) =>
    validWidgetIds.has(widgetId),
  );
  const formulaSheetIds = dedupeStringArray(binding.formulaSheetIds).filter((widgetId) =>
    validWidgetIds.has(widgetId),
  );

  return {
    documentId,
    defaultReferenceIds,
    formulaSheetIds,
  };
}

function sortDocuments(documents, activeDocumentId) {
  return [...documents].sort((left, right) => {
    if (left.id === activeDocumentId) {
      return -1;
    }
    if (right.id === activeDocumentId) {
      return 1;
    }
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return left.openedAt.localeCompare(right.openedAt);
  });
}

export function createDocumentManager() {
  let contextId = null;
  let documents = [];
  let bindingsByDocumentId = new Map();
  let activeDocumentId = null;

  const ensureBinding = (documentId) => {
    if (!bindingsByDocumentId.has(documentId)) {
      bindingsByDocumentId.set(documentId, {
        documentId,
        defaultReferenceIds: [],
        formulaSheetIds: [],
      });
    }
    return bindingsByDocumentId.get(documentId);
  };

  const pruneActiveDocument = () => {
    if (!activeDocumentId || documents.some((entry) => entry.id === activeDocumentId)) {
      return;
    }

    const pinned = documents.find((entry) => entry.pinned);
    activeDocumentId = pinned?.id ?? documents[0]?.id ?? null;
  };

  const setContextId = (nextContextId) => {
    contextId = nextContextId ?? null;
  };

  const reset = ({
    contextId: nextContextId = null,
    documents: nextDocuments = [],
    documentBindings = [],
    activeDocumentId: nextActiveDocumentId = null,
    validWidgetIds = [],
  } = {}) => {
    contextId = nextContextId;
    const validWidgetSet = new Set(validWidgetIds);
    const sanitized = nextDocuments
      .map((entry) => sanitizeDocument(entry, contextId))
      .filter((entry) => entry && validWidgetSet.has(entry.widgetId));

    documents = sanitized;
    const validDocumentIds = new Set(sanitized.map((entry) => entry.id));
    bindingsByDocumentId = new Map();

    for (const binding of documentBindings) {
      const next = sanitizeBinding(binding, validDocumentIds, validWidgetSet);
      if (!next) {
        continue;
      }
      bindingsByDocumentId.set(next.documentId, next);
    }

    // Backward compatibility for legacy `referenceWidgetIds` directly on documents.
    for (const entry of sanitized) {
      if (bindingsByDocumentId.has(entry.id)) {
        continue;
      }

      const legacyReferences = dedupeStringArray(entry.referenceWidgetIds).filter((widgetId) =>
        validWidgetSet.has(widgetId),
      );
      bindingsByDocumentId.set(entry.id, {
        documentId: entry.id,
        defaultReferenceIds: legacyReferences,
        formulaSheetIds: [],
      });
    }

    activeDocumentId = validDocumentIds.has(nextActiveDocumentId)
      ? nextActiveDocumentId
      : sanitized[0]?.id ?? null;
  };

  const openDocument = ({ title, sourceType = "pdf", widgetId, pinned = false } = {}) => {
    if (!widgetId) {
      return null;
    }

    const existing = documents.find((entry) => entry.widgetId === widgetId);
    if (existing) {
      existing.title = title ?? existing.title;
      existing.sourceType = sourceType ?? existing.sourceType;
      existing.pinned = Boolean(existing.pinned || pinned);
      activeDocumentId = existing.id;
      ensureBinding(existing.id);
      return { ...existing };
    }

    const entry = {
      id: makeId("doc"),
      contextId,
      title: typeof title === "string" && title.trim() ? title.trim() : "Document",
      sourceType,
      widgetId,
      openedAt: nowIso(),
      pinned: Boolean(pinned),
    };
    documents.push(entry);
    activeDocumentId = entry.id;
    ensureBinding(entry.id);
    return { ...entry };
  };

  const addImportedDocument = ({ document, binding } = {}) => {
    const normalized = sanitizeDocument(document, contextId);
    if (!normalized) {
      return null;
    }

    documents = documents.filter((entry) => entry.id !== normalized.id && entry.widgetId !== normalized.widgetId);
    documents.push(normalized);
    activeDocumentId = activeDocumentId ?? normalized.id;

    const validWidgetIds = new Set(documents.map((entry) => entry.widgetId));
    const validDocumentIds = new Set(documents.map((entry) => entry.id));
    const normalizedBinding = sanitizeBinding(binding, validDocumentIds, validWidgetIds);

    if (normalizedBinding) {
      bindingsByDocumentId.set(normalized.id, normalizedBinding);
    } else {
      ensureBinding(normalized.id);
    }

    return { ...normalized };
  };

  const ensureDocumentForWidget = ({ widgetId, title, sourceType = "pdf", pinned = false } = {}) => {
    const existing = documents.find((entry) => entry.widgetId === widgetId);
    if (existing) {
      return { ...existing };
    }
    return openDocument({ widgetId, title, sourceType, pinned });
  };

  const pruneForWidgets = (validWidgetIds) => {
    const validSet = new Set(validWidgetIds);
    const nextDocuments = documents.filter((entry) => validSet.has(entry.widgetId));
    const changed = nextDocuments.length !== documents.length;
    documents = nextDocuments;

    const validDocumentIds = new Set(documents.map((entry) => entry.id));
    for (const [documentId, binding] of bindingsByDocumentId.entries()) {
      if (!validDocumentIds.has(documentId)) {
        bindingsByDocumentId.delete(documentId);
        continue;
      }
      binding.defaultReferenceIds = binding.defaultReferenceIds.filter((widgetId) => validSet.has(widgetId));
      binding.formulaSheetIds = binding.formulaSheetIds.filter((widgetId) => validSet.has(widgetId));
    }

    pruneActiveDocument();
    return changed;
  };

  const setActiveDocument = (documentId) => {
    if (!documentId || !documents.some((entry) => entry.id === documentId)) {
      return false;
    }
    activeDocumentId = documentId;
    return true;
  };

  const togglePinned = (documentId) => {
    const target = documents.find((entry) => entry.id === documentId);
    if (!target) {
      return false;
    }
    target.pinned = !target.pinned;
    return true;
  };

  const updateBindings = (documentId, { defaultReferenceIds, formulaSheetIds } = {}, validWidgetIds = []) => {
    const validSet = new Set(validWidgetIds);
    const binding = ensureBinding(documentId);
    if (!binding) {
      return false;
    }

    binding.defaultReferenceIds = dedupeStringArray(defaultReferenceIds).filter((widgetId) =>
      validSet.size > 0 ? validSet.has(widgetId) : true,
    );
    binding.formulaSheetIds = dedupeStringArray(formulaSheetIds).filter((widgetId) =>
      validSet.size > 0 ? validSet.has(widgetId) : true,
    );
    return true;
  };

  const bindReferenceToActive = (referenceWidgetId) => {
    if (!activeDocumentId || !referenceWidgetId) {
      return false;
    }
    const binding = ensureBinding(activeDocumentId);
    if (!binding.defaultReferenceIds.includes(referenceWidgetId)) {
      binding.defaultReferenceIds.push(referenceWidgetId);
    }
    return true;
  };

  const bindFormulaToActive = (widgetId) => {
    if (!activeDocumentId || !widgetId) {
      return false;
    }
    const binding = ensureBinding(activeDocumentId);
    if (!binding.formulaSheetIds.includes(widgetId)) {
      binding.formulaSheetIds.push(widgetId);
    }
    return true;
  };

  const getDocumentById = (documentId) => documents.find((entry) => entry.id === documentId) ?? null;

  const getDocumentByWidgetId = (widgetId) => documents.find((entry) => entry.widgetId === widgetId) ?? null;

  return {
    setContextId,
    reset,
    openDocument,
    addImportedDocument,
    ensureDocumentForWidget,
    pruneForWidgets,
    setActiveDocument,
    togglePinned,
    updateBindings,
    bindReferenceToActive,
    bindFormulaToActive,
    getActiveDocumentId() {
      return activeDocumentId;
    },
    getActiveDocument() {
      return getDocumentById(activeDocumentId);
    },
    getDocumentById,
    getDocumentByWidgetId,
    getBindings(documentId) {
      return { ...(ensureBinding(documentId) ?? null) };
    },
    listDocuments() {
      return sortDocuments(documents, activeDocumentId).map((entry) => ({ ...entry }));
    },
    toPersistencePayload() {
      return {
        documents: documents.map((entry) => ({ ...entry })),
        documentBindings: Array.from(bindingsByDocumentId.values()).map((entry) => ({
          documentId: entry.documentId,
          defaultReferenceIds: [...entry.defaultReferenceIds],
          formulaSheetIds: [...entry.formulaSheetIds],
        })),
        activeDocumentId,
      };
    },
  };
}
