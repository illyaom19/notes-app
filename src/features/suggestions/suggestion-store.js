function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function keyFor(scopeId, sectionId) {
  return `${scopeId ?? ""}::${sectionId ?? ""}`;
}

function normalizeAnchor(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const x = Number(candidate.x);
  const y = Number(candidate.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function normalizeState(value) {
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

function normalizeKind(value) {
  if (value === "expanded-area" || value === "reference-popup") {
    return value;
  }
  return null;
}

function cloneSuggestion(entry) {
  return {
    id: entry.id,
    scopeId: entry.scopeId,
    sectionId: entry.sectionId,
    documentId: entry.documentId,
    kind: entry.kind,
    label: entry.label,
    fingerprint: entry.fingerprint,
    anchor: {
      x: entry.anchor.x,
      y: entry.anchor.y,
    },
    payload: {
      ...entry.payload,
    },
    state: entry.state,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    dismissedAt: entry.dismissedAt,
    restoredAt: entry.restoredAt,
    acceptedAt: entry.acceptedAt,
    discardedAt: entry.discardedAt,
  };
}

function sanitizeSuggestion(candidate, { scopeId, sectionId }) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const kind = normalizeKind(candidate.kind);
  const anchor = normalizeAnchor(candidate.anchor);
  if (!kind || !anchor) {
    return null;
  }

  const label = typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : "Suggestion";
  const fingerprint =
    typeof candidate.fingerprint === "string" && candidate.fingerprint.trim()
      ? candidate.fingerprint.trim()
      : `${kind}:${anchor.x.toFixed(2)}:${anchor.y.toFixed(2)}`;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : makeId("suggestion"),
    scopeId,
    sectionId,
    documentId:
      typeof candidate.documentId === "string" && candidate.documentId.trim()
        ? candidate.documentId.trim()
        : null,
    kind,
    label,
    fingerprint,
    anchor,
    payload: candidate.payload && typeof candidate.payload === "object" ? { ...candidate.payload } : {},
    state: normalizeState(candidate.state),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
    dismissedAt: typeof candidate.dismissedAt === "string" ? candidate.dismissedAt : null,
    restoredAt: typeof candidate.restoredAt === "string" ? candidate.restoredAt : null,
    acceptedAt: typeof candidate.acceptedAt === "string" ? candidate.acceptedAt : null,
    discardedAt: typeof candidate.discardedAt === "string" ? candidate.discardedAt : null,
  };
}

function sortSuggestions(entries) {
  return [...entries].sort((left, right) => {
    const stateRank = (value) => {
      if (value === "proposed") {
        return 0;
      }
      if (value === "restored") {
        return 1;
      }
      if (value === "ghosted") {
        return 2;
      }
      if (value === "accepted") {
        return 3;
      }
      if (value === "discarded") {
        return 4;
      }
      return 5;
    };

    const rankDiff = stateRank(left.state) - stateRank(right.state);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function createSuggestionStore() {
  const entriesByScopeSection = new Map();

  function listRaw(scopeId, sectionId) {
    return entriesByScopeSection.get(keyFor(scopeId, sectionId)) ?? [];
  }

  function writeRaw(scopeId, sectionId, nextEntries) {
    entriesByScopeSection.set(keyFor(scopeId, sectionId), sortSuggestions(nextEntries));
  }

  return {
    replaceSectionSuggestions({ scopeId, sectionId, suggestions = [] }) {
      if (typeof scopeId !== "string" || !scopeId.trim() || typeof sectionId !== "string" || !sectionId.trim()) {
        return [];
      }

      const normalized = suggestions
        .map((entry) => sanitizeSuggestion(entry, { scopeId, sectionId }))
        .filter((entry) => entry !== null);

      const deduped = [];
      const seenById = new Set();
      const seenByFingerprint = new Set();
      for (const entry of normalized) {
        if (seenById.has(entry.id) || seenByFingerprint.has(entry.fingerprint)) {
          continue;
        }
        seenById.add(entry.id);
        seenByFingerprint.add(entry.fingerprint);
        deduped.push(entry);
      }

      writeRaw(scopeId, sectionId, deduped);
      return deduped.map((entry) => cloneSuggestion(entry));
    },

    list({ scopeId, sectionId, states = null } = {}) {
      if (typeof scopeId !== "string" || !scopeId.trim() || typeof sectionId !== "string" || !sectionId.trim()) {
        return [];
      }

      const stateSet = Array.isArray(states) && states.length > 0 ? new Set(states.map((entry) => normalizeState(entry))) : null;
      const entries = listRaw(scopeId, sectionId);
      return entries
        .filter((entry) => !stateSet || stateSet.has(entry.state))
        .map((entry) => cloneSuggestion(entry));
    },

    upsertMany({ scopeId, sectionId, suggestions = [] } = {}) {
      if (typeof scopeId !== "string" || !scopeId.trim() || typeof sectionId !== "string" || !sectionId.trim()) {
        return [];
      }

      const existing = [...listRaw(scopeId, sectionId)];
      const normalized = suggestions
        .map((entry) => sanitizeSuggestion(entry, { scopeId, sectionId }))
        .filter((entry) => entry !== null);

      for (const nextEntry of normalized) {
        const byIdIndex = existing.findIndex((entry) => entry.id === nextEntry.id);
        const byFingerprintIndex = existing.findIndex((entry) => entry.fingerprint === nextEntry.fingerprint);
        const targetIndex = byIdIndex >= 0 ? byIdIndex : byFingerprintIndex;

        if (targetIndex < 0) {
          existing.push(nextEntry);
          continue;
        }

        const current = existing[targetIndex];
        const preserveState = current.state === "ghosted" || current.state === "accepted" || current.state === "discarded";
        existing[targetIndex] = {
          ...current,
          ...nextEntry,
          id: current.id,
          createdAt: current.createdAt,
          state: preserveState ? current.state : nextEntry.state,
          updatedAt: nowIso(),
        };
      }

      writeRaw(scopeId, sectionId, existing);
      return existing.map((entry) => cloneSuggestion(entry));
    },

    transition({ scopeId, sectionId, suggestionId, toState } = {}) {
      if (
        typeof scopeId !== "string" ||
        !scopeId.trim() ||
        typeof sectionId !== "string" ||
        !sectionId.trim() ||
        typeof suggestionId !== "string" ||
        !suggestionId.trim()
      ) {
        return null;
      }

      const nextState = normalizeState(toState);
      const existing = [...listRaw(scopeId, sectionId)];
      const index = existing.findIndex((entry) => entry.id === suggestionId);
      if (index < 0) {
        return null;
      }

      const now = nowIso();
      const current = existing[index];
      const next = {
        ...current,
        state: nextState,
        updatedAt: now,
      };

      if (nextState === "ghosted" || nextState === "dismissed") {
        next.dismissedAt = now;
      }
      if (nextState === "restored") {
        next.restoredAt = now;
      }
      if (nextState === "accepted") {
        next.acceptedAt = now;
      }
      if (nextState === "discarded") {
        next.discardedAt = now;
      }

      existing[index] = next;
      writeRaw(scopeId, sectionId, existing);
      return cloneSuggestion(next);
    },

    pruneInvalidAnchors({ scopeId, sectionId, runtime } = {}) {
      if (typeof scopeId !== "string" || !scopeId.trim() || typeof sectionId !== "string" || !sectionId.trim()) {
        return { removed: 0, kept: 0 };
      }

      const existing = listRaw(scopeId, sectionId);
      const next = [];
      let removed = 0;

      for (const entry of existing) {
        if (!Number.isFinite(entry.anchor?.x) || !Number.isFinite(entry.anchor?.y)) {
          removed += 1;
          continue;
        }

        const sourceWidgetId =
          typeof entry.payload?.sourceWidgetId === "string" && entry.payload.sourceWidgetId.trim()
            ? entry.payload.sourceWidgetId
            : null;
        if (sourceWidgetId && runtime && typeof runtime.getWidgetById === "function" && !runtime.getWidgetById(sourceWidgetId)) {
          removed += 1;
          continue;
        }

        next.push(entry);
      }

      writeRaw(scopeId, sectionId, next);
      return {
        removed,
        kept: next.length,
      };
    },

    toPersistencePayload({ scopeId, sectionId } = {}) {
      if (typeof scopeId !== "string" || !scopeId.trim() || typeof sectionId !== "string" || !sectionId.trim()) {
        return [];
      }

      return listRaw(scopeId, sectionId).map((entry) => cloneSuggestion(entry));
    },
  };
}
