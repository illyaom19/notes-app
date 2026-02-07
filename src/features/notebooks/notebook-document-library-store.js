const STORAGE_KEY = "notes-app.notebook.documents.v1";

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

function normalizeTags(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const tags = [];
  const seen = new Set();
  for (const entry of candidate) {
    if (typeof entry !== "string" || !entry.trim()) {
      continue;
    }
    const tag = entry.trim();
    if (seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function normalizeSource(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const source = asObject(candidate);
  const title = typeof source.title === "string" && source.title.trim() ? source.title.trim() : "Document";
  const bytesBase64 =
    typeof source.bytesBase64 === "string" && source.bytesBase64.trim() ? source.bytesBase64.trim() : null;
  if (!bytesBase64) {
    return null;
  }

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : makeId("nb-doc"),
    title,
    sourceType:
      typeof source.sourceType === "string" && source.sourceType.trim() ? source.sourceType.trim() : "pdf",
    fileName:
      typeof source.fileName === "string" && source.fileName.trim() ? source.fileName.trim() : `${title}.pdf`,
    bytesBase64,
    status: source.status === "deleted" ? "deleted" : "active",
    tags: normalizeTags(source.tags),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : nowIso(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : nowIso(),
  };
}

function normalizeNotebook(candidate) {
  const source = asObject(candidate);
  const documents = [];
  const seen = new Set();

  if (Array.isArray(source.documents)) {
    for (const entry of source.documents) {
      const normalized = normalizeSource(entry);
      if (!normalized || seen.has(normalized.id)) {
        continue;
      }
      seen.add(normalized.id);
      documents.push(normalized);
    }
  }

  return {
    documents,
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

  const notebooks = {};
  const sourceNotebooks = asObject(candidate.notebooks);
  for (const [notebookId, notebookValue] of Object.entries(sourceNotebooks)) {
    if (typeof notebookId !== "string" || !notebookId.trim()) {
      continue;
    }
    notebooks[notebookId] = normalizeNotebook(notebookValue);
  }

  return {
    version: 1,
    notebooks,
  };
}

function cloneSource(entry) {
  return {
    id: entry.id,
    title: entry.title,
    sourceType: entry.sourceType,
    fileName: entry.fileName,
    bytesBase64: entry.bytesBase64,
    status: entry.status,
    tags: [...entry.tags],
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

export function createNotebookDocumentLibraryStore({ storage = window.localStorage } = {}) {
  let state = loadState(storage);

  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function ensureNotebook(notebookId) {
    if (typeof notebookId !== "string" || !notebookId.trim()) {
      return null;
    }

    if (!state.notebooks[notebookId]) {
      state = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            documents: [],
          },
        },
      };
      persist();
    }

    return state.notebooks[notebookId];
  }

  return {
    listDocuments(notebookId, { includeDeleted = false } = {}) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook) {
        return [];
      }

      return notebook.documents
        .filter((entry) => includeDeleted || entry.status !== "deleted")
        .map((entry) => cloneSource(entry));
    },

    getDocument(notebookId, sourceDocumentId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook) {
        return null;
      }

      const found = notebook.documents.find((entry) => entry.id === sourceDocumentId);
      return found ? cloneSource(found) : null;
    },

    upsertDocument(notebookId, candidate) {
      const notebook = ensureNotebook(notebookId);
      const normalized = normalizeSource(candidate);
      if (!notebook || !normalized) {
        return null;
      }

      const existingIndex = notebook.documents.findIndex((entry) => entry.id === normalized.id);
      const next = {
        ...normalized,
        updatedAt: nowIso(),
      };

      let nextDocuments = [];
      if (existingIndex < 0) {
        nextDocuments = [next, ...notebook.documents];
      } else {
        nextDocuments = [...notebook.documents];
        next.createdAt = nextDocuments[existingIndex].createdAt;
        nextDocuments[existingIndex] = next;
      }

      state = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            documents: nextDocuments,
          },
        },
      };

      persist();
      return cloneSource(next);
    },

    markDeleted(notebookId, sourceDocumentId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || typeof sourceDocumentId !== "string" || !sourceDocumentId.trim()) {
        return null;
      }

      const existingIndex = notebook.documents.findIndex((entry) => entry.id === sourceDocumentId);
      if (existingIndex < 0) {
        return null;
      }

      const nextDocuments = [...notebook.documents];
      const updated = {
        ...nextDocuments[existingIndex],
        status: "deleted",
        updatedAt: nowIso(),
      };
      nextDocuments[existingIndex] = updated;

      state = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            documents: nextDocuments,
          },
        },
      };

      persist();
      return cloneSource(updated);
    },

    deleteNotebook(notebookId) {
      if (typeof notebookId !== "string" || !notebookId.trim() || !state.notebooks[notebookId]) {
        return false;
      }

      const notebooks = { ...state.notebooks };
      delete notebooks[notebookId];
      state = {
        ...state,
        notebooks,
      };
      persist();
      return true;
    },
  };
}
