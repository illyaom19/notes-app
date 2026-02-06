const STORAGE_KEY = "notes-app.contexts.v1";

function nowIso() {
  return new Date().toISOString();
}

function makeContext(name, type = "general") {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `context-${Date.now()}`,
    name,
    type,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function defaultState() {
  const context = makeContext("Default Context", "general");
  return {
    version: 1,
    activeContextId: context.id,
    contexts: [context],
  };
}

function sanitizeState(candidate) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.contexts) ||
    candidate.contexts.length < 1
  ) {
    return defaultState();
  }

  const contexts = candidate.contexts
    .filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string")
    .map((entry) => ({
      id: entry.id,
      name: entry.name.trim() || "Untitled Context",
      type: typeof entry.type === "string" && entry.type ? entry.type : "general",
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : nowIso(),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : nowIso(),
    }));

  if (contexts.length < 1) {
    return defaultState();
  }

  const hasActive = contexts.some((entry) => entry.id === candidate.activeContextId);
  return {
    version: 1,
    activeContextId: hasActive ? candidate.activeContextId : contexts[0].id,
    contexts,
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }
    return sanitizeState(JSON.parse(raw));
  } catch (_error) {
    return defaultState();
  }
}

export function createContextStore() {
  let state = loadState();

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  return {
    list() {
      return state.contexts.map((entry) => ({ ...entry }));
    },

    getActiveContextId() {
      return state.activeContextId;
    },

    setActiveContextId(contextId) {
      if (!state.contexts.some((entry) => entry.id === contextId)) {
        return false;
      }
      state = {
        ...state,
        activeContextId: contextId,
      };
      persist();
      return true;
    },

    createContext(name, type = "general") {
      const cleanName = String(name || "").trim();
      if (!cleanName) {
        return null;
      }

      const nextContext = makeContext(cleanName, type);
      state = {
        ...state,
        activeContextId: nextContext.id,
        contexts: [...state.contexts, nextContext],
      };
      persist();
      return { ...nextContext };
    },

    renameContext(contextId, nextName) {
      const cleanName = String(nextName || "").trim();
      if (!cleanName) {
        return false;
      }

      const updated = state.contexts.map((entry) => {
        if (entry.id !== contextId) {
          return entry;
        }
        return {
          ...entry,
          name: cleanName,
          updatedAt: nowIso(),
        };
      });

      if (!updated.some((entry) => entry.id === contextId)) {
        return false;
      }

      state = {
        ...state,
        contexts: updated,
      };
      persist();
      return true;
    },

    deleteContext(contextId) {
      if (state.contexts.length < 2) {
        return null;
      }

      const remaining = state.contexts.filter((entry) => entry.id !== contextId);
      if (remaining.length === state.contexts.length) {
        return null;
      }

      const nextActive = state.activeContextId === contextId ? remaining[0].id : state.activeContextId;
      state = {
        ...state,
        activeContextId: nextActive,
        contexts: remaining,
      };
      persist();

      return {
        activeContextId: nextActive,
        deletedContextId: contextId,
      };
    },
  };
}
