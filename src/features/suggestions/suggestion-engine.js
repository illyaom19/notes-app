const KEYWORD_RULES = [
  { keyword: "example", title: "Example", tag: "example" },
  { keyword: "definition", title: "Definition", tag: "definition" },
  { keyword: "theorem", title: "Theorem", tag: "theorem" },
  { keyword: "lemma", title: "Lemma", tag: "lemma" },
  { keyword: "proof", title: "Proof", tag: "proof" },
  { keyword: "corollary", title: "Corollary", tag: "corollary" },
];

const MAX_TOTAL_SUGGESTIONS = 16;
const MAX_KEYWORD_SUGGESTIONS_PER_WIDGET = 4;
const MAX_KEYWORD_PAGES_PER_WIDGET = 10;
const MIN_ZONE_CONFIDENCE = 0.35;
const MIN_ZONE_HEIGHT = 0.045;

function safeText(value) {
  return typeof value === "string" ? value : "";
}

function cleanExcerpt(text, maxLength = 180) {
  const compact = safeText(text).replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(16, maxLength - 3))}...`;
}

function detectKeyword(text) {
  const lowered = safeText(text).toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (lowered.includes(rule.keyword)) {
      return rule;
    }
  }
  return null;
}

function pageRectFor(widget, pageNumber) {
  if (typeof widget.getPageWorldRect === "function") {
    const rect = widget.getPageWorldRect(pageNumber);
    if (rect) {
      return rect;
    }
  }

  const page = Array.isArray(widget.pages)
    ? widget.pages.find((entry) => entry.pageNumber === pageNumber)
    : null;
  if (!page) {
    return null;
  }

  return {
    x: widget.position.x,
    y: widget.position.y + 40 + page.baseWorldY,
    width: widget.size.width,
    height: page.baseWorldHeight,
  };
}

function suggestionId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function createSuggestionEngine() {
  const pageTextCache = new Map();

  function cacheKey(widgetId, pageNumber) {
    return `${widgetId}::${pageNumber}`;
  }

  async function getPageText(widget, pageEntry) {
    const key = cacheKey(widget.id, pageEntry.pageNumber);
    if (pageTextCache.has(key)) {
      return pageTextCache.get(key);
    }

    let text = "";
    try {
      const content = await pageEntry.pageProxy.getTextContent();
      text = Array.isArray(content?.items)
        ? content.items
            .map((item) => safeText(item?.str))
            .filter((entry) => entry)
            .join(" ")
        : "";
    } catch (_error) {
      text = "";
    }

    pageTextCache.set(key, text);
    return text;
  }

  function collectWhitespaceSuggestions(widget) {
    if (typeof widget.getWhitespaceZones !== "function" || typeof widget.getWhitespaceZoneWorldRect !== "function") {
      return [];
    }

    const zones = widget.getWhitespaceZones();
    if (!Array.isArray(zones) || zones.length < 1) {
      return [];
    }

    const suggestions = [];
    for (const zone of zones) {
      if (!zone || zone.linkedWidgetId) {
        continue;
      }

      const normalizedHeight = Number(zone.normalizedHeight);
      if (!Number.isFinite(normalizedHeight) || normalizedHeight < MIN_ZONE_HEIGHT) {
        continue;
      }

      const confidence = Number(zone.confidence);
      if (Number.isFinite(confidence) && confidence < MIN_ZONE_CONFIDENCE) {
        continue;
      }

      const rect = widget.getWhitespaceZoneWorldRect(zone.id);
      if (!rect) {
        continue;
      }

      suggestions.push({
        id: suggestionId("suggestion"),
        documentId:
          typeof widget.metadata?.documentId === "string" && widget.metadata.documentId.trim()
            ? widget.metadata.documentId
            : null,
        kind: "expanded-area",
        label: `Expand whitespace (p${zone.pageNumber})`,
        fingerprint: `zone:${widget.id}:${zone.id}`,
        anchor: {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        },
        payload: {
          sourceWidgetId: widget.id,
          whitespaceZoneId: zone.id,
          pageNumber: zone.pageNumber,
          confidence: Number.isFinite(confidence) ? confidence : null,
        },
      });
    }

    return suggestions;
  }

  async function collectKeywordSuggestions(widget) {
    const pages = Array.isArray(widget.pages) ? widget.pages : [];
    if (pages.length < 1) {
      return [];
    }

    const suggestions = [];
    const maxPages = Math.min(pages.length, MAX_KEYWORD_PAGES_PER_WIDGET);

    for (let index = 0; index < maxPages; index += 1) {
      if (suggestions.length >= MAX_KEYWORD_SUGGESTIONS_PER_WIDGET) {
        break;
      }

      const pageEntry = pages[index];
      if (!pageEntry?.pageProxy) {
        continue;
      }

      const pageText = await getPageText(widget, pageEntry);
      if (!pageText || pageText.trim().length < 3) {
        continue;
      }

      const keywordRule = detectKeyword(pageText);
      if (!keywordRule) {
        continue;
      }

      const rect = pageRectFor(widget, pageEntry.pageNumber);
      if (!rect) {
        continue;
      }

      suggestions.push({
        id: suggestionId("suggestion"),
        documentId:
          typeof widget.metadata?.documentId === "string" && widget.metadata.documentId.trim()
            ? widget.metadata.documentId
            : null,
        kind: "reference-popup",
        label: `${keywordRule.title} snippet (p${pageEntry.pageNumber})`,
        fingerprint: `keyword:${widget.id}:${pageEntry.pageNumber}:${keywordRule.keyword}`,
        anchor: {
          x: rect.x + rect.width * 0.84,
          y: rect.y + Math.min(Math.max(26, rect.height * 0.28), 128),
        },
        payload: {
          sourceWidgetId: widget.id,
          pageNumber: pageEntry.pageNumber,
          keyword: keywordRule.keyword,
          keywordTitle: keywordRule.title,
          keywordTag: keywordRule.tag,
          snippetText: cleanExcerpt(pageText, 190),
          sourceTitle:
            typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
              ? widget.metadata.title.trim()
              : "PDF",
        },
      });
    }

    return suggestions;
  }

  function pruneCache(runtime) {
    const activeWidgetIds = new Set(
      runtime
        .listWidgets()
        .map((widget) => widget?.id)
        .filter((id) => typeof id === "string" && id.trim()),
    );

    for (const key of pageTextCache.keys()) {
      const widgetId = key.split("::")[0];
      if (!activeWidgetIds.has(widgetId)) {
        pageTextCache.delete(key);
      }
    }
  }

  return {
    async collect({ runtime } = {}) {
      if (!runtime || typeof runtime.listWidgets !== "function") {
        return [];
      }

      pruneCache(runtime);

      const widgets = runtime
        .listWidgets()
        .filter((widget) => widget?.type === "pdf-document");
      const collected = [];

      for (const widget of widgets) {
        if (!widget) {
          continue;
        }

        const whitespaceSuggestions = collectWhitespaceSuggestions(widget);
        collected.push(...whitespaceSuggestions);
        if (collected.length >= MAX_TOTAL_SUGGESTIONS) {
          break;
        }

        const keywordSuggestions = await collectKeywordSuggestions(widget);
        collected.push(...keywordSuggestions);
        if (collected.length >= MAX_TOTAL_SUGGESTIONS) {
          break;
        }
      }

      return collected.slice(0, MAX_TOTAL_SUGGESTIONS);
    },

    clearWidgetCache(widgetId) {
      if (typeof widgetId !== "string" || !widgetId.trim()) {
        return;
      }

      for (const key of pageTextCache.keys()) {
        if (key.startsWith(`${widgetId}::`)) {
          pageTextCache.delete(key);
        }
      }
    },

    reset() {
      pageTextCache.clear();
    },
  };
}
