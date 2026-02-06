const STORAGE_KEY = "notes-app.contexts.v1";
const DEFAULT_CONTEXT_TYPE = "general";
const DEFAULT_CONTEXT_NAME = "Default Context";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createDefaultContext() {
  const timestamp = nowIso();
  return {
    id: makeId("context"),
    name: DEFAULT_CONTEXT_NAME,
    type: DEFAULT_CONTEXT_TYPE,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDefaultState() {
  const context = createDefaultContext();
  return {
    version: 1,
    contexts: [context],
    activeContextState: {
      activeContextId: context.id,
      lastOpenedAt: nowIso(),
    },
  };
}

function sanitizeContext(candidate, fallbackName) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : null;
  if (!id) {
    return null;
  }

  const name = typeof candidate.name === "string" && candidate.name.trim()
    ? candidate.name.trim()
    : fallbackName;

  return {
    id,
    name,
    type:
      typeof candidate.type === "string" && candidate.type.trim()
        ? candidate.type.trim()
        : DEFAULT_CONTEXT_TYPE,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
  };
}

function sanitizeState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return createDefaultState();
  }

  const rawContexts = Array.isArray(candidate.contexts) ? candidate.contexts : [];
  const seen = new Set();
  const contexts = [];

  for (let index = 0; index < rawContexts.length; index += 1) {
    const fallbackName = `Context ${index + 1}`;
    const nextContext = sanitizeContext(rawContexts[index], fallbackName);
    if (!nextContext || seen.has(nextContext.id)) {
      continue;
    }
    seen.add(nextContext.id);
    contexts.push(nextContext);
  }

  if (contexts.length < 1) {
    return createDefaultState();
  }

  const activeCandidate = candidate.activeContextState;
  const requestedActiveId =
    activeCandidate && typeof activeCandidate.activeContextId === "string"
      ? activeCandidate.activeContextId
      : null;

  const activeContextId = contexts.some((entry) => entry.id === requestedActiveId)
    ? requestedActiveId
    : contexts[0].id;

  return {
    version: 1,
    contexts,
    activeContextState: {
      activeContextId,
      lastOpenedAt:
        activeCandidate && typeof activeCandidate.lastOpenedAt === "string"
          ? activeCandidate.lastOpenedAt
          : nowIso(),
    },
  };
}

function cloneContext(context) {
  return {
    id: context.id,
    name: context.name,
    type: context.type,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
  };
}

function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }
    const parsed = JSON.parse(raw);
    return sanitizeState(parsed);
  } catch (_error) {
    return createDefaultState();
  }
}

export function createContextStore({ storage = window.localStorage } = {}) {
  let state = loadState(storage);

  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setActiveContextState(activeContextId) {
    state = {
      ...state,
      activeContextState: {
        activeContextId,
        lastOpenedAt: nowIso(),
      },
    };
  }

  return {
    list() {
      return state.contexts.map((entry) => cloneContext(entry));
    },

    getActiveContextId() {
      return state.activeContextState.activeContextId;
    },

    getActiveContextState() {
      return {
        activeContextId: state.activeContextState.activeContextId,
        lastOpenedAt: state.activeContextState.lastOpenedAt,
      };
    },

    getContextById(contextId) {
      const found = state.contexts.find((entry) => entry.id === contextId);
      return found ? cloneContext(found) : null;
    },

    setActiveContext(contextId) {
      if (!state.contexts.some((entry) => entry.id === contextId)) {
        return false;
      }
      setActiveContextState(contextId);
      persist();
      return true;
    },

    touchActiveContext() {
      setActiveContextState(state.activeContextState.activeContextId);
      persist();
    },

    createContext(name, type = DEFAULT_CONTEXT_TYPE) {
      const cleanName = typeof name === "string" ? name.trim() : "";
      if (!cleanName) {
        return null;
      }

      const timestamp = nowIso();
      const nextContext = {
        id: makeId("context"),
        name: cleanName,
        type: typeof type === "string" && type.trim() ? type.trim() : DEFAULT_CONTEXT_TYPE,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state = {
        ...state,
        contexts: [...state.contexts, nextContext],
      };
      setActiveContextState(nextContext.id);
      persist();

      return cloneContext(nextContext);
    },

    renameContext(contextId, nextName) {
      const cleanName = typeof nextName === "string" ? nextName.trim() : "";
      if (!cleanName) {
        return false;
      }

      let changed = false;
      const nextContexts = state.contexts.map((entry) => {
        if (entry.id !== contextId) {
          return entry;
        }
        changed = true;
        return {
          ...entry,
          name: cleanName,
          updatedAt: nowIso(),
        };
      });

      if (!changed) {
        return false;
      }

      state = {
        ...state,
        contexts: nextContexts,
      };
      persist();
      return true;
    },

    deleteContext(contextId) {
      if (state.contexts.length < 2) {
        return null;
      }

      const nextContexts = state.contexts.filter((entry) => entry.id !== contextId);
      if (nextContexts.length === state.contexts.length) {
        return null;
      }

      const nextActiveContextId =
        state.activeContextState.activeContextId === contextId
          ? nextContexts[0].id
          : state.activeContextState.activeContextId;

      state = {
        ...state,
        contexts: nextContexts,
      };
      setActiveContextState(nextActiveContextId);
      persist();

      return {
        deletedContextId: contextId,
        activeContextId: nextActiveContextId,
      };
    },
  };
}
