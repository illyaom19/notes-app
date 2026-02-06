const STORAGE_KEY = "notes-app.documents.v1";

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    version: 1,
    focusedDocumentId: null,
    documents: [],
    bindings: {},
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaultState();
    }
    return {
      version: 1,
      focusedDocumentId: typeof parsed.focusedDocumentId === "string" ? parsed.focusedDocumentId : null,
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      bindings: parsed.bindings && typeof parsed.bindings === "object" ? parsed.bindings : {},
    };
  } catch (_error) {
    return defaultState();
  }
}

export function createDocumentRegistry() {
  let state = loadState();

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function ensureDocument(documentId) {
    return state.documents.find((entry) => entry.id === documentId) ?? null;
  }

  return {
    listByContext(contextId) {
      return state.documents
        .filter((entry) => entry.contextId === contextId)
        .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)));
    },

    createOrUpdateDocument(definition) {
      const existing = ensureDocument(definition.id);
      const base = {
        id: definition.id ?? globalThis.crypto?.randomUUID?.() ?? `doc-${Date.now()}`,
        contextId: definition.contextId,
        title: definition.title ?? "Untitled PDF",
        sourceType: definition.sourceType ?? "pdf",
        widgetId: definition.widgetId ?? null,
        openedAt: definition.openedAt ?? nowIso(),
        pinned: Boolean(definition.pinned),
      };

      if (!existing) {
        state.documents.push(base);
      } else {
        Object.assign(existing, base, { openedAt: nowIso() });
      }

      state.focusedDocumentId = base.id;
      persist();
      return base;
    },

    focusDocument(documentId) {
      if (!ensureDocument(documentId)) {
        return false;
      }
      state.focusedDocumentId = documentId;
      persist();
      return true;
    },

    getFocusedDocument(contextId) {
      if (!state.focusedDocumentId) {
        return null;
      }
      const focused = ensureDocument(state.focusedDocumentId);
      if (!focused || focused.contextId !== contextId) {
        return null;
      }
      return focused;
    },

    bindReference(documentId, referenceWidgetId) {
      if (!ensureDocument(documentId)) {
        return false;
      }
      const list = Array.isArray(state.bindings[documentId]) ? state.bindings[documentId] : [];
      if (!list.includes(referenceWidgetId)) {
        list.push(referenceWidgetId);
      }
      state.bindings[documentId] = list;
      persist();
      return true;
    },

    getBoundReferences(documentId) {
      const list = state.bindings[documentId];
      return Array.isArray(list) ? [...list] : [];
    },
  };
}
