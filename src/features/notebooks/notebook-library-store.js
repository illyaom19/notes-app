const STORAGE_KEY = "notes-app.notebook.library.v1";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function asObject(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate;
}

function normalizePopupMetadata(candidate, fallbackTitle = "Reference") {
  const source = asObject(candidate);
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
    tags: Array.isArray(source.tags)
      ? source.tags.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
      : [],
    createdAt:
      typeof source.createdAt === "string" && source.createdAt.trim()
        ? source.createdAt
        : nowIso(),
  };
}

function normalizeReference(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const title =
    typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "Reference";

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : makeId("lib-ref"),
    title,
    sourceLabel:
      typeof candidate.sourceLabel === "string" && candidate.sourceLabel.trim()
        ? candidate.sourceLabel.trim()
        : "Notebook Reference",
    popupMetadata: normalizePopupMetadata(candidate.popupMetadata, title),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
  };
}

function normalizeNotebook(candidate) {
  const source = asObject(candidate);
  const references = [];
  const seen = new Set();

  if (Array.isArray(source.references)) {
    for (const entry of source.references) {
      const normalized = normalizeReference(entry);
      if (!normalized || seen.has(normalized.id)) {
        continue;
      }
      seen.add(normalized.id);
      references.push(normalized);
    }
  }

  return {
    references,
  };
}

function defaultState() {
  return {
    version: 1,
    notebooks: {},
  };
}

function sanitizeState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return defaultState();
  }

  const sourceNotebooks = asObject(candidate.notebooks);
  const notebooks = {};
  for (const [notebookId, notebookData] of Object.entries(sourceNotebooks)) {
    if (typeof notebookId !== "string" || !notebookId.trim()) {
      continue;
    }
    notebooks[notebookId] = normalizeNotebook(notebookData);
  }

  return {
    version: 1,
    notebooks,
  };
}

function cloneReference(entry) {
  return {
    id: entry.id,
    title: entry.title,
    sourceLabel: entry.sourceLabel,
    popupMetadata: {
      ...entry.popupMetadata,
      tags: Array.isArray(entry.popupMetadata?.tags) ? [...entry.popupMetadata.tags] : [],
    },
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }
    return sanitizeState(JSON.parse(raw));
  } catch (_error) {
    return defaultState();
  }
}

export function createNotebookLibraryStore({ storage = window.localStorage } = {}) {
  let state = loadState(storage);

  function persist(nextState) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return true;
    } catch (error) {
      console.warn("[storage] failed to persist notebook library.", error);
      return false;
    }
  }

  function ensureNotebook(notebookId) {
    if (typeof notebookId !== "string" || !notebookId.trim()) {
      return null;
    }

    if (!state.notebooks[notebookId]) {
      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            references: [],
          },
        },
      };
      if (!persist(nextState)) {
        return null;
      }
      state = nextState;
    }

    return state.notebooks[notebookId];
  }

  return {
    listReferences(notebookId) {
      const notebook = ensureNotebook(notebookId);
      return notebook ? notebook.references.map((entry) => cloneReference(entry)) : [];
    },

    getReference(notebookId, referenceId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook) {
        return null;
      }

      const found = notebook.references.find((entry) => entry.id === referenceId);
      return found ? cloneReference(found) : null;
    },

    upsertReference(notebookId, candidate) {
      const notebook = ensureNotebook(notebookId);
      const normalized = normalizeReference(candidate);
      if (!notebook || !normalized) {
        return null;
      }

      const existingIndex = notebook.references.findIndex((entry) => entry.id === normalized.id);
      const updated = {
        ...normalized,
        updatedAt: nowIso(),
      };

      let nextReferences = [];
      if (existingIndex < 0) {
        nextReferences = [updated, ...notebook.references];
      } else {
        nextReferences = [...notebook.references];
        const current = nextReferences[existingIndex];
        updated.createdAt = current.createdAt;
        nextReferences[existingIndex] = updated;
      }

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            references: nextReferences,
          },
        },
      };

      if (!persist(nextState)) {
        return null;
      }
      state = nextState;
      return cloneReference(updated);
    },

    renameReference(notebookId, referenceId, nextTitle) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || typeof referenceId !== "string" || !referenceId.trim()) {
        return null;
      }

      const normalizedTitle = typeof nextTitle === "string" ? nextTitle.trim() : "";
      if (!normalizedTitle) {
        return null;
      }

      const existingIndex = notebook.references.findIndex((entry) => entry.id === referenceId);
      if (existingIndex < 0) {
        return null;
      }

      const nextReferences = [...notebook.references];
      const existing = nextReferences[existingIndex];
      const updated = {
        ...existing,
        title: normalizedTitle,
        popupMetadata: {
          ...existing.popupMetadata,
          title: normalizedTitle,
        },
        updatedAt: nowIso(),
      };
      nextReferences[existingIndex] = updated;

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            references: nextReferences,
          },
        },
      };
      if (!persist(nextState)) {
        return null;
      }
      state = nextState;
      return cloneReference(updated);
    },

    deleteReference(notebookId, referenceId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || typeof referenceId !== "string" || !referenceId.trim()) {
        return false;
      }

      const nextReferences = notebook.references.filter((entry) => entry.id !== referenceId);
      if (nextReferences.length === notebook.references.length) {
        return false;
      }

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            references: nextReferences,
          },
        },
      };
      if (!persist(nextState)) {
        return false;
      }
      state = nextState;
      return true;
    },

    deleteNotebook(notebookId) {
      if (typeof notebookId !== "string" || !notebookId.trim() || !state.notebooks[notebookId]) {
        return false;
      }

      const notebooks = { ...state.notebooks };
      delete notebooks[notebookId];
      const nextState = {
        ...state,
        notebooks,
      };
      if (!persist(nextState)) {
        return false;
      }
      state = nextState;
      return true;
    },
  };
}
