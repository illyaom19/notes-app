const DEFAULT_LIMIT = 80;
const DEFAULT_DEBOUNCE_MS = 180;

const METADATA_SKIP_KEYS = new Set([
  "imageDataUrl",
  "bytes",
  "bytesBase64",
  "pdfBytes",
  "runtimeState",
  "interactionFlags",
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeString(value) {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

function tokenize(query) {
  return normalizeWhitespace(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((entry) => entry.length > 0);
}

function shortTypeLabel(type) {
  const normalized = safeString(type).replace(/-/g, " ");
  if (!normalized) {
    return "Widget";
  }

  return normalized
    .split(" ")
    .map((piece) => `${piece.slice(0, 1).toUpperCase()}${piece.slice(1)}`)
    .join(" ");
}

function pushUnique(list, value, maxLength = 220) {
  const normalized = safeString(value);
  if (!normalized) {
    return;
  }

  const capped = normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
  if (!list.includes(capped)) {
    list.push(capped);
  }
}

function collectObjectStrings(candidate, target, depth = 0) {
  if (depth > 2 || !candidate || typeof candidate !== "object") {
    return;
  }

  if (Array.isArray(candidate)) {
    for (const entry of candidate.slice(0, 20)) {
      collectObjectStrings(entry, target, depth + 1);
    }
    return;
  }

  const entries = Object.entries(candidate);
  for (const [key, value] of entries) {
    if (METADATA_SKIP_KEYS.has(key)) {
      continue;
    }

    if (typeof value === "string") {
      pushUnique(target, value);
      continue;
    }

    if (Array.isArray(value) || (value && typeof value === "object")) {
      collectObjectStrings(value, target, depth + 1);
    }
  }
}

function referencePopupSnippet(widget) {
  const text = safeString(widget.textContent);
  if (text) {
    return text;
  }

  const attribution = safeString(widget.citation?.attributionText);
  if (attribution) {
    return attribution;
  }

  return safeString(widget.sourceLabel);
}

function graphSnippet(widget) {
  const equation = safeString(widget.state?.equation);
  return equation || "Graph";
}

function widgetTitle(widget, typeLabel) {
  const metadataTitle = safeString(widget.metadata?.title);
  if (metadataTitle) {
    return metadataTitle;
  }

  if (widget.type === "reference-popup") {
    const source = safeString(widget.sourceLabel);
    if (source) {
      return source;
    }
  }

  if (widget.type === "pdf-document") {
    const fileName = safeString(widget.fileName);
    if (fileName) {
      return fileName;
    }
  }

  return typeLabel;
}

function extractFields(widget) {
  const typeLabel = shortTypeLabel(widget.type);
  const title = widgetTitle(widget, typeLabel);
  const snippets = [];
  const indexedValues = [];

  pushUnique(indexedValues, title);
  pushUnique(indexedValues, typeLabel);

  if (widget.type === "reference-popup") {
    pushUnique(indexedValues, widget.sourceLabel);
    pushUnique(indexedValues, widget.textContent);
    pushUnique(indexedValues, widget.citation?.sourceTitle);
    pushUnique(indexedValues, widget.citation?.attributionText);
    pushUnique(indexedValues, widget.citation?.url);
    pushUnique(indexedValues, widget.citation?.author);
    pushUnique(indexedValues, widget.citation?.publisher);
    pushUnique(snippets, referencePopupSnippet(widget));
  }

  if (widget.type === "expanded-area") {
    pushUnique(indexedValues, widget.metadata?.note);
    pushUnique(snippets, widget.metadata?.note);
  }

  if (widget.type === "graph-widget") {
    pushUnique(indexedValues, widget.state?.equation);
    pushUnique(snippets, graphSnippet(widget));
  }

  if (widget.type === "pdf-document") {
    pushUnique(indexedValues, widget.fileName);
    pushUnique(indexedValues, widget.metadata?.title);
    pushUnique(snippets, widget.fileName);
  }

  collectObjectStrings(widget.metadata, indexedValues);

  if (snippets.length < 1) {
    const fallbackSnippet = indexedValues.find((entry) => entry !== title && entry !== typeLabel) ?? "";
    if (fallbackSnippet) {
      snippets.push(fallbackSnippet);
    }
  }

  const searchText = indexedValues.join(" | ").toLowerCase();

  return {
    title,
    type: widget.type,
    typeLabel,
    snippet: snippets[0] ?? "",
    searchText,
  };
}

function entryId(contextId, widgetId) {
  return `${contextId ?? "global"}:${widgetId}`;
}

function scoreResult(fields, tokens) {
  if (!fields || !tokens.length) {
    return 0;
  }

  let score = 0;
  const title = fields.title.toLowerCase();
  const snippet = fields.snippet.toLowerCase();
  const haystack = fields.searchText;

  for (const token of tokens) {
    if (!haystack.includes(token)) {
      return 0;
    }

    if (title.includes(token)) {
      score += 12;
    } else if (snippet.includes(token)) {
      score += 8;
    } else {
      score += 4;
    }
  }

  return score;
}

function entrySignature(entry) {
  return JSON.stringify({
    widgetId: entry.widgetId,
    contextId: entry.contextId,
    fields: entry.fields,
  });
}

export function createSearchIndex() {
  const entriesByWidgetId = new Map();
  const signaturesByWidgetId = new Map();
  let reindexTimer = null;
  let onUpdated = null;

  const api = {
    setUpdateListener(listener) {
      onUpdated = typeof listener === "function" ? listener : null;
    },

    getEntryCount(contextId = null) {
      if (!contextId) {
        return entriesByWidgetId.size;
      }

      let total = 0;
      for (const entry of entriesByWidgetId.values()) {
        if (entry.contextId === contextId) {
          total += 1;
        }
      }
      return total;
    },

    reindexNow({ runtime, contextId } = {}) {
      if (!runtime || typeof runtime.listWidgets !== "function") {
        return { totalEntries: entriesByWidgetId.size, changed: 0, removed: 0 };
      }

      const widgets = runtime.listWidgets();
      const visibleWidgetIds = new Set();
      let changed = 0;

      for (const widget of widgets) {
        if (!widget || typeof widget.id !== "string" || !widget.id.trim()) {
          continue;
        }

        visibleWidgetIds.add(widget.id);
        const entry = {
          id: entryId(contextId ?? null, widget.id),
          contextId: contextId ?? null,
          widgetId: widget.id,
          fields: extractFields(widget),
          updatedAt: nowIso(),
        };

        const signature = entrySignature(entry);
        if (signaturesByWidgetId.get(widget.id) === signature) {
          continue;
        }

        entriesByWidgetId.set(widget.id, entry);
        signaturesByWidgetId.set(widget.id, signature);
        changed += 1;
      }

      let removed = 0;
      for (const widgetId of entriesByWidgetId.keys()) {
        if (visibleWidgetIds.has(widgetId)) {
          continue;
        }
        entriesByWidgetId.delete(widgetId);
        signaturesByWidgetId.delete(widgetId);
        removed += 1;
      }

      const stats = {
        totalEntries: entriesByWidgetId.size,
        changed,
        removed,
      };

      if (onUpdated) {
        onUpdated(stats);
      }

      return stats;
    },

    scheduleReindex({ runtime, contextId, delayMs = DEFAULT_DEBOUNCE_MS } = {}) {
      if (reindexTimer) {
        window.clearTimeout(reindexTimer);
      }

      reindexTimer = window.setTimeout(() => {
        reindexTimer = null;
        api.reindexNow({ runtime, contextId });
      }, delayMs);
    },

    query(query, { contextId = null, limit = DEFAULT_LIMIT } = {}) {
      const tokens = tokenize(query);
      if (!tokens.length) {
        return [];
      }

      const matches = [];

      for (const entry of entriesByWidgetId.values()) {
        if (contextId && entry.contextId !== contextId) {
          continue;
        }

        const score = scoreResult(entry.fields, tokens);
        if (score <= 0) {
          continue;
        }

        matches.push({
          id: entry.id,
          contextId: entry.contextId,
          widgetId: entry.widgetId,
          title: entry.fields.title,
          type: entry.fields.type,
          typeLabel: entry.fields.typeLabel,
          snippet: entry.fields.snippet,
          updatedAt: entry.updatedAt,
          score,
        });
      }

      matches.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.updatedAt === b.updatedAt) {
          return a.title.localeCompare(b.title);
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });

      return matches.slice(0, Math.max(1, Math.min(500, Number(limit) || DEFAULT_LIMIT)));
    },

    clear() {
      entriesByWidgetId.clear();
      signaturesByWidgetId.clear();
      if (reindexTimer) {
        window.clearTimeout(reindexTimer);
        reindexTimer = null;
      }
      if (onUpdated) {
        onUpdated({ totalEntries: 0, changed: 0, removed: 0 });
      }
    },
  };

  return api;
}
