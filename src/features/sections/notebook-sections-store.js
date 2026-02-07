const STORAGE_KEY = "notes-app.notebook.sections.v1";
const DEFAULT_SECTION_NAME = "Section 1";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function normalizeSection(candidate, fallbackName = DEFAULT_SECTION_NAME) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : null;
  if (!id) {
    return null;
  }

  const name =
    typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : fallbackName;

  return {
    id,
    name,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
  };
}

function defaultNotebookState() {
  const timestamp = nowIso();
  const section = {
    id: makeId("section"),
    name: DEFAULT_SECTION_NAME,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    sections: [section],
    activeSectionState: {
      activeSectionId: section.id,
      lastOpenedAt: timestamp,
    },
  };
}

function defaultState() {
  return {
    version: 1,
    notebooks: {},
  };
}

function sanitizeNotebookState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return defaultNotebookState();
  }

  const sourceSections = Array.isArray(candidate.sections) ? candidate.sections : [];
  const sections = [];
  const seen = new Set();

  for (let index = 0; index < sourceSections.length; index += 1) {
    const fallbackName = `Section ${index + 1}`;
    const section = normalizeSection(sourceSections[index], fallbackName);
    if (!section || seen.has(section.id)) {
      continue;
    }
    seen.add(section.id);
    sections.push(section);
  }

  if (sections.length < 1) {
    return defaultNotebookState();
  }

  const requested =
    typeof candidate.activeSectionState?.activeSectionId === "string"
      ? candidate.activeSectionState.activeSectionId
      : null;

  const activeSectionId = sections.some((entry) => entry.id === requested) ? requested : sections[0].id;

  return {
    sections,
    activeSectionState: {
      activeSectionId,
      lastOpenedAt:
        typeof candidate.activeSectionState?.lastOpenedAt === "string"
          ? candidate.activeSectionState.lastOpenedAt
          : nowIso(),
    },
  };
}

function sanitizeState(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return defaultState();
  }

  const notebooks = {};
  const sourceNotebooks = candidate.notebooks && typeof candidate.notebooks === "object" ? candidate.notebooks : {};
  for (const [notebookId, notebookState] of Object.entries(sourceNotebooks)) {
    if (typeof notebookId !== "string" || !notebookId.trim()) {
      continue;
    }
    notebooks[notebookId] = sanitizeNotebookState(notebookState);
  }

  return {
    version: 1,
    notebooks,
  };
}

function cloneSection(section) {
  return {
    id: section.id,
    name: section.name,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }

    const parsed = JSON.parse(raw);
    return sanitizeState(parsed);
  } catch (_error) {
    return defaultState();
  }
}

export function createNotebookSectionsStore({ storage = window.localStorage } = {}) {
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
          [notebookId]: defaultNotebookState(),
        },
      };
      persist();
    }

    return state.notebooks[notebookId];
  }

  function setActiveSectionState(notebookId, sectionId) {
    const notebook = ensureNotebook(notebookId);
    if (!notebook) {
      return false;
    }

    if (!notebook.sections.some((entry) => entry.id === sectionId)) {
      return false;
    }

    state = {
      ...state,
      notebooks: {
        ...state.notebooks,
        [notebookId]: {
          ...notebook,
          activeSectionState: {
            activeSectionId: sectionId,
            lastOpenedAt: nowIso(),
          },
        },
      },
    };

    persist();
    return true;
  }

  return {
    ensureNotebook(notebookId) {
      const notebook = ensureNotebook(notebookId);
      return notebook
        ? {
            sections: notebook.sections.map((entry) => cloneSection(entry)),
            activeSectionId: notebook.activeSectionState.activeSectionId,
          }
        : null;
    },

    listSections(notebookId) {
      const notebook = ensureNotebook(notebookId);
      return notebook ? notebook.sections.map((entry) => cloneSection(entry)) : [];
    },

    getActiveSectionId(notebookId) {
      const notebook = ensureNotebook(notebookId);
      return notebook ? notebook.activeSectionState.activeSectionId : null;
    },

    setActiveSection(notebookId, sectionId) {
      return setActiveSectionState(notebookId, sectionId);
    },

    createSection(notebookId, name) {
      const notebook = ensureNotebook(notebookId);
      const cleanName = typeof name === "string" ? name.trim() : "";
      if (!notebook || !cleanName) {
        return null;
      }

      const timestamp = nowIso();
      const section = {
        id: makeId("section"),
        name: cleanName,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            sections: [...notebook.sections, section],
            activeSectionState: {
              activeSectionId: section.id,
              lastOpenedAt: timestamp,
            },
          },
        },
      };

      persist();
      return cloneSection(section);
    },

    renameSection(notebookId, sectionId, nextName) {
      const notebook = ensureNotebook(notebookId);
      const cleanName = typeof nextName === "string" ? nextName.trim() : "";
      if (!notebook || !cleanName) {
        return false;
      }

      let changed = false;
      const sections = notebook.sections.map((entry) => {
        if (entry.id !== sectionId) {
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
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            sections,
          },
        },
      };

      persist();
      return true;
    },

    deleteSection(notebookId, sectionId) {
      const notebook = ensureNotebook(notebookId);
      if (!notebook || notebook.sections.length < 2) {
        return null;
      }

      const sections = notebook.sections.filter((entry) => entry.id !== sectionId);
      if (sections.length === notebook.sections.length) {
        return null;
      }

      const activeSectionId =
        notebook.activeSectionState.activeSectionId === sectionId
          ? sections[0].id
          : notebook.activeSectionState.activeSectionId;

      state = {
        ...state,
        notebooks: {
          ...state.notebooks,
          [notebookId]: {
            ...notebook,
            sections,
            activeSectionState: {
              activeSectionId,
              lastOpenedAt: nowIso(),
            },
          },
        },
      };

      persist();
      return {
        deletedSectionId: sectionId,
        activeSectionId,
      };
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
