import { createAssetManager } from "../storage/asset-manager.js";

const STORAGE_KEY = "notes-app.notebook.documents.v1";
const DOCUMENT_SCOPE_PREFIX = "doclib";

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

function normalizeInkSnapshot(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      ...entry,
    }));
}

function normalizeSource(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const source = asObject(candidate);
  const title = typeof source.title === "string" && source.title.trim() ? source.title.trim() : "Document";
  const pdfAssetId =
    typeof source.pdfAssetId === "string" && source.pdfAssetId.trim() ? source.pdfAssetId.trim() : null;
  const bytesBase64 =
    typeof source.bytesBase64 === "string" && source.bytesBase64.trim() ? source.bytesBase64.trim() : null;
  if (!pdfAssetId && !bytesBase64 && !(source.pdfBytes instanceof Uint8Array)) {
    return null;
  }

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : makeId("nb-doc"),
    title,
    sourceType:
      typeof source.sourceType === "string" && source.sourceType.trim() ? source.sourceType.trim() : "pdf",
    fileName:
      typeof source.fileName === "string" && source.fileName.trim() ? source.fileName.trim() : `${title}.pdf`,
    pdfAssetId,
    bytesBase64,
    status: source.status === "deleted" ? "deleted" : "active",
    tags: normalizeTags(source.tags),
    inkStrokes: normalizeInkSnapshot(source.inkStrokes),
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
    pdfAssetId: typeof entry.pdfAssetId === "string" && entry.pdfAssetId.trim() ? entry.pdfAssetId : null,
    bytesBase64: entry.bytesBase64,
    status: entry.status,
    tags: [...entry.tags],
    inkStrokes: normalizeInkSnapshot(entry.inkStrokes),
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
  const assetManager = createAssetManager({ storage });

  function notebookScopeId(notebookId) {
    return `${DOCUMENT_SCOPE_PREFIX}/${notebookId}`;
  }

  function notebookDocumentOwnerRef(notebookId, sourceDocumentId) {
    return `${notebookScopeId(notebookId)}:${sourceDocumentId}`;
  }

  function decodeBase64ToBytes(base64) {
    if (typeof base64 !== "string" || !base64) {
      return null;
    }

    try {
      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    } catch (_error) {
      return null;
    }
  }

  function persist(nextState) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return true;
    } catch (error) {
      console.warn("[storage] failed to persist notebook documents.", error);
      return false;
    }
  }

  function syncNotebookAssetReferences(notebookId, notebook) {
    if (!notebook || typeof notebookId !== "string" || !notebookId.trim()) {
      return;
    }

    const refsByAssetId = new Map();
    for (const entry of notebook.documents) {
      if (entry.status === "deleted") {
        continue;
      }
      if (typeof entry.pdfAssetId !== "string" || !entry.pdfAssetId.trim()) {
        continue;
      }

      const existing = refsByAssetId.get(entry.pdfAssetId) ?? new Set();
      existing.add(notebookDocumentOwnerRef(notebookId, entry.id));
      refsByAssetId.set(entry.pdfAssetId, existing);
    }

    try {
      assetManager.replaceContextReferences(notebookScopeId(notebookId), refsByAssetId);
    } catch (error) {
      console.warn("[storage] failed to sync notebook document asset refs.", error);
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
            documents: [],
          },
        },
      };
      if (!persist(nextState)) {
        return null;
      }
      state = nextState;
      syncNotebookAssetReferences(notebookId, state.notebooks[notebookId]);
    }

    return state.notebooks[notebookId];
  }

  return {
    async prepare() {
      if (typeof assetManager.hydratePayloadCache === "function") {
        await assetManager.hydratePayloadCache();
      }
    },

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

    loadDocumentBytes(notebookId, sourceDocumentId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || typeof sourceDocumentId !== "string" || !sourceDocumentId.trim()) {
        return null;
      }

      const found = notebook.documents.find((entry) => entry.id === sourceDocumentId);
      if (!found) {
        return null;
      }

      if (typeof found.pdfAssetId === "string" && found.pdfAssetId.trim()) {
        const bytes = assetManager.loadPdfBytes(found.pdfAssetId);
        if (bytes instanceof Uint8Array && bytes.length > 0) {
          return bytes;
        }
      }

      return decodeBase64ToBytes(found.bytesBase64);
    },

    upsertDocument(notebookId, candidate) {
      const notebook = ensureNotebook(notebookId);
      const normalized = normalizeSource(candidate);
      if (!notebook || !normalized) {
        return null;
      }

      const ownerRef = notebookDocumentOwnerRef(notebookId, normalized.id);
      let resolvedPdfAssetId = normalized.pdfAssetId;
      if (!resolvedPdfAssetId && candidate?.pdfBytes instanceof Uint8Array && candidate.pdfBytes.length > 0) {
        const registered = assetManager.registerPdfBytes(candidate.pdfBytes, {
          ownerId: ownerRef,
          derivedFrom: normalized.id,
        });
        resolvedPdfAssetId = registered?.id ?? null;
      }

      if (!resolvedPdfAssetId && typeof normalized.bytesBase64 === "string" && normalized.bytesBase64) {
        const registered = assetManager.registerAsset({
          type: "pdf-bytes",
          data: normalized.bytesBase64,
          ownerId: ownerRef,
          derivedFrom: normalized.id,
        });
        resolvedPdfAssetId = registered?.id ?? null;
      }

      if (!resolvedPdfAssetId) {
        return null;
      }

      const existingIndex = notebook.documents.findIndex((entry) => entry.id === normalized.id);
      const next = {
        ...normalized,
        pdfAssetId: resolvedPdfAssetId,
        bytesBase64: null,
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

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            documents: nextDocuments,
          },
        },
      };

      if (!persist(nextState)) {
        // Roll back owner refs for any newly registered asset when the notebook state write fails.
        syncNotebookAssetReferences(notebookId, notebook);
        return null;
      }
      state = nextState;
      syncNotebookAssetReferences(notebookId, state.notebooks[notebookId]);
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

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            documents: nextDocuments,
          },
        },
      };

      if (!persist(nextState)) {
        return null;
      }
      state = nextState;
      syncNotebookAssetReferences(notebookId, state.notebooks[notebookId]);
      return cloneSource(updated);
    },

    renameDocument(notebookId, sourceDocumentId, nextTitle) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || typeof sourceDocumentId !== "string" || !sourceDocumentId.trim()) {
        return null;
      }

      const normalizedTitle = typeof nextTitle === "string" ? nextTitle.trim() : "";
      if (!normalizedTitle) {
        return null;
      }

      const existingIndex = notebook.documents.findIndex((entry) => entry.id === sourceDocumentId);
      if (existingIndex < 0) {
        return null;
      }

      const nextDocuments = [...notebook.documents];
      const existing = nextDocuments[existingIndex];
      const updated = {
        ...existing,
        title: normalizedTitle,
        fileName:
          typeof existing.fileName === "string" && existing.fileName.trim()
            ? existing.fileName
            : `${normalizedTitle}.pdf`,
        updatedAt: nowIso(),
      };
      nextDocuments[existingIndex] = updated;

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            documents: nextDocuments,
          },
        },
      };
      if (!persist(nextState)) {
        return null;
      }
      state = nextState;
      syncNotebookAssetReferences(notebookId, state.notebooks[notebookId]);
      return cloneSource(updated);
    },

    deleteDocument(notebookId, sourceDocumentId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || typeof sourceDocumentId !== "string" || !sourceDocumentId.trim()) {
        return false;
      }

      const nextDocuments = notebook.documents.filter((entry) => entry.id !== sourceDocumentId);
      if (nextDocuments.length === notebook.documents.length) {
        return false;
      }

      const nextState = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            documents: nextDocuments,
          },
        },
      };
      if (!persist(nextState)) {
        return false;
      }
      state = nextState;
      syncNotebookAssetReferences(notebookId, state.notebooks[notebookId]);
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
      assetManager.removeContextReferences(notebookScopeId(notebookId));
      return true;
    },
  };
}
