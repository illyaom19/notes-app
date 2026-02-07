const STORAGE_KEY = "notes-app.onboarding.state.v1";
const DEFAULT_PROFILE_ID = "local-default";
const DEFAULT_COMPLETION_STATE = "pending";

function nowIso() {
  return new Date().toISOString();
}

function asObject(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate;
}

function normalizeCompletionState(value) {
  if (value === "completed" || value === "dismissed") {
    return value;
  }
  return DEFAULT_COMPLETION_STATE;
}

function normalizeEntry(candidate) {
  const source = asObject(candidate);
  const hintId =
    typeof source.hintId === "string" && source.hintId.trim() ? source.hintId.trim() : null;
  if (!hintId) {
    return null;
  }

  return {
    hintId,
    dismissedAt:
      typeof source.dismissedAt === "string" && source.dismissedAt.trim() ? source.dismissedAt : null,
    completionState: normalizeCompletionState(source.completionState),
  };
}

function normalizeContextState(candidate) {
  const source = asObject(candidate);
  const seen = new Set();
  const entries = [];
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];

  for (const rawEntry of rawEntries) {
    const entry = normalizeEntry(rawEntry);
    if (!entry || seen.has(entry.hintId)) {
      continue;
    }
    seen.add(entry.hintId);
    entries.push(entry);
  }

  return {
    hintsEnabled: source.hintsEnabled !== false,
    entries,
  };
}

function normalizeProfileState(candidate) {
  const source = asObject(candidate);
  const contextsSource = asObject(source.contexts);
  const contexts = {};

  for (const [contextId, contextState] of Object.entries(contextsSource)) {
    if (typeof contextId !== "string" || !contextId.trim()) {
      continue;
    }
    contexts[contextId] = normalizeContextState(contextState);
  }

  return {
    contexts,
  };
}

function normalizeState(candidate) {
  const source = asObject(candidate);
  const profilesSource = asObject(source.profiles);
  const profiles = {};

  for (const [profileId, profileState] of Object.entries(profilesSource)) {
    if (typeof profileId !== "string" || !profileId.trim()) {
      continue;
    }
    profiles[profileId] = normalizeProfileState(profileState);
  }

  return {
    version: 1,
    profiles,
  };
}

function cloneEntry(entry) {
  return {
    hintId: entry.hintId,
    dismissedAt: entry.dismissedAt,
    completionState: entry.completionState,
  };
}

export function createOnboardingStateService({
  storage = window.localStorage,
  profileId = DEFAULT_PROFILE_ID,
} = {}) {
  let state = normalizeState(null);

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      state = normalizeState(JSON.parse(raw));
    }
  } catch (_error) {
    state = normalizeState(null);
  }

  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeContextId(contextId) {
    return typeof contextId === "string" && contextId.trim() ? contextId.trim() : null;
  }

  function profileState() {
    const key =
      typeof profileId === "string" && profileId.trim() ? profileId.trim() : DEFAULT_PROFILE_ID;
    if (!state.profiles[key]) {
      state.profiles[key] = normalizeProfileState(null);
    }
    return state.profiles[key];
  }

  function contextState(contextId, { create = true } = {}) {
    const normalizedContextId = normalizeContextId(contextId);
    if (!normalizedContextId) {
      return null;
    }

    const profile = profileState();
    if (!profile.contexts[normalizedContextId] && create) {
      profile.contexts[normalizedContextId] = normalizeContextState(null);
    }

    return profile.contexts[normalizedContextId] ?? null;
  }

  function upsertHint(contextId, hintId) {
    const context = contextState(contextId);
    if (!context) {
      return null;
    }

    const normalizedHintId =
      typeof hintId === "string" && hintId.trim() ? hintId.trim() : null;
    if (!normalizedHintId) {
      return null;
    }

    const existing = context.entries.find((entry) => entry.hintId === normalizedHintId);
    if (existing) {
      return existing;
    }

    const next = {
      hintId: normalizedHintId,
      dismissedAt: null,
      completionState: DEFAULT_COMPLETION_STATE,
    };
    context.entries.push(next);
    return next;
  }

  return {
    getProfileId() {
      return typeof profileId === "string" && profileId.trim() ? profileId.trim() : DEFAULT_PROFILE_ID;
    },

    isHintsEnabled(contextId) {
      return contextState(contextId, { create: false })?.hintsEnabled !== false;
    },

    setHintsEnabled(contextId, enabled) {
      const context = contextState(contextId);
      if (!context) {
        return false;
      }
      context.hintsEnabled = enabled !== false;
      persist();
      return true;
    },

    listHintStates(contextId) {
      const context = contextState(contextId, { create: false });
      if (!context) {
        return [];
      }
      return context.entries.map(cloneEntry);
    },

    getHintState(contextId, hintId) {
      const context = contextState(contextId, { create: false });
      if (!context) {
        return null;
      }

      const normalizedHintId =
        typeof hintId === "string" && hintId.trim() ? hintId.trim() : null;
      if (!normalizedHintId) {
        return null;
      }

      const found = context.entries.find((entry) => entry.hintId === normalizedHintId);
      return found ? cloneEntry(found) : null;
    },

    markDismissed(contextId, hintId) {
      const entry = upsertHint(contextId, hintId);
      if (!entry) {
        return false;
      }
      entry.completionState = "dismissed";
      entry.dismissedAt = nowIso();
      persist();
      return true;
    },

    markCompleted(contextId, hintId) {
      const entry = upsertHint(contextId, hintId);
      if (!entry) {
        return false;
      }
      entry.completionState = "completed";
      if (!entry.dismissedAt) {
        entry.dismissedAt = nowIso();
      }
      persist();
      return true;
    },

    resetContext(contextId) {
      const context = contextState(contextId);
      if (!context) {
        return false;
      }
      context.hintsEnabled = true;
      context.entries = [];
      persist();
      return true;
    },
  };
}

