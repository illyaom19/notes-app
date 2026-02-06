const STORAGE_KEY = "notes-app.suggestions.v1";

function nowIso() {
  return new Date().toISOString();
}

function makeSuggestion({ contextId, documentId, kind, label, payload }) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `sg-${Date.now()}`,
    contextId,
    documentId: documentId ?? null,
    kind,
    label,
    payload,
    state: "proposed",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function createSuggestionManager() {
  let suggestions = loadState();

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(suggestions));
  }

  function listByContext(contextId) {
    return suggestions.filter((entry) => entry.contextId === contextId);
  }

  function getNextProposed(contextId) {
    return listByContext(contextId).find((entry) => entry.state === "proposed") ?? null;
  }

  return {
    generateWhitespaceSuggestions({ contextId, documentId, pdfWidget }) {
      if (!pdfWidget || typeof pdfWidget.getWhitespaceZones !== "function") {
        return [];
      }

      const zones = pdfWidget.getWhitespaceZones();
      const existingZoneIds = new Set(
        listByContext(contextId)
          .filter((entry) => entry.kind === "whitespace-expand")
          .map((entry) => entry.payload?.zoneId),
      );

      const created = [];
      for (const zone of zones) {
        if (!zone?.id || existingZoneIds.has(zone.id)) {
          continue;
        }
        const suggestion = makeSuggestion({
          contextId,
          documentId,
          kind: "whitespace-expand",
          label: `Expand zone ${zone.id}`,
          payload: {
            pdfWidgetId: pdfWidget.id,
            zoneId: zone.id,
            pageNumber: zone.pageNumber,
          },
        });
        suggestions.push(suggestion);
        created.push(suggestion);
      }

      if (created.length > 0) {
        persist();
      }
      return created;
    },

    listCounts(contextId) {
      const scoped = listByContext(contextId);
      return {
        proposed: scoped.filter((entry) => entry.state === "proposed").length,
        ghosted: scoped.filter((entry) => entry.state === "ghosted").length,
      };
    },

    acceptNext(contextId) {
      const next = getNextProposed(contextId);
      if (!next) {
        return null;
      }
      next.state = "accepted";
      next.updatedAt = nowIso();
      persist();
      return { ...next };
    },

    dismissNext(contextId) {
      const next = getNextProposed(contextId);
      if (!next) {
        return null;
      }
      next.state = "ghosted";
      next.updatedAt = nowIso();
      persist();
      return { ...next };
    },

    restoreLatestGhost(contextId) {
      const scopedGhosts = listByContext(contextId).filter((entry) => entry.state === "ghosted");
      if (scopedGhosts.length < 1) {
        return null;
      }
      const latest = scopedGhosts[scopedGhosts.length - 1];
      latest.state = "proposed";
      latest.updatedAt = nowIso();
      persist();
      return { ...latest };
    },
  };
}
