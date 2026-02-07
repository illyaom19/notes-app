function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function asArray(candidate) {
  return Array.isArray(candidate) ? candidate : [];
}

function safeLabel(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function describeResult(result) {
  if (result?.kind === "group-header") {
    return "";
  }
  const typeLabel = safeLabel(result.typeLabel, "Widget");
  const contextLabel = safeLabel(result.contextLabel);
  if (contextLabel) {
    return `${typeLabel} • ${contextLabel}`;
  }
  return typeLabel;
}

function defaultEmptyMessage(query) {
  if (!safeLabel(query)) {
    return "Type a query to search indexed widget text.";
  }
  return "No matching widgets found.";
}

function isSelectableResult(result) {
  return result?.kind !== "group-header";
}

export function createSearchPanelController({
  panelElement,
  toggleButton,
  onQuery,
  onActivateResult,
  onNavigateResult,
  onOpenChange,
}) {
  if (!(panelElement instanceof HTMLElement)) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      refreshIndex: () => {},
      dispose: () => {},
    };
  }

  const closeButton = panelElement.querySelector("#search-close");
  const queryInput = panelElement.querySelector("#search-query");
  const statusOutput = panelElement.querySelector("#search-status");
  const resultsContainer = panelElement.querySelector("#search-results");
  const prevButton = panelElement.querySelector("#search-prev");
  const nextButton = panelElement.querySelector("#search-next");
  const resultCountOutput = panelElement.querySelector("#search-result-count");

  let open = false;
  let results = [];
  let activeIndex = -1;
  let lastIndexedCount = 0;
  let queryRequestId = 0;

  const setStatus = (message) => {
    if (statusOutput instanceof HTMLElement) {
      statusOutput.textContent = message;
    }
  };

  const setResultCount = (count) => {
    if (resultCountOutput instanceof HTMLOutputElement || resultCountOutput instanceof HTMLElement) {
      resultCountOutput.textContent = `${count} result${count === 1 ? "" : "s"}`;
    }
  };

  const updateOpenState = (nextOpen) => {
    open = Boolean(nextOpen);
    panelElement.hidden = !open;
    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.textContent = open ? "Hide Search" : "Search";
    }
    onOpenChange?.(open);

    if (open && queryInput instanceof HTMLInputElement) {
      queryInput.focus();
      queryInput.select();
    }
  };

  const renderResults = () => {
    if (!(resultsContainer instanceof HTMLElement)) {
      return;
    }

    resultsContainer.replaceChildren();

    if (results.length < 1) {
      const empty = document.createElement("p");
      empty.className = "search-result-meta";
      empty.textContent = defaultEmptyMessage(queryInput instanceof HTMLInputElement ? queryInput.value : "");
      resultsContainer.append(empty);
      return;
    }

    for (let index = 0; index < results.length; index += 1) {
      const entry = results[index];
      if (entry?.kind === "group-header") {
        const heading = document.createElement("p");
        heading.className = "search-group-heading";
        heading.textContent = safeLabel(entry.title, "Group");
        resultsContainer.append(heading);
        continue;
      }

      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-result-item";
      item.dataset.active = index === activeIndex ? "true" : "false";
      item.dataset.resultIndex = String(index);

      const title = document.createElement("span");
      title.className = "search-result-title";
      title.textContent = safeLabel(entry.title, "Untitled");

      const meta = document.createElement("span");
      meta.className = "search-result-meta";
      meta.textContent = describeResult(entry);

      const snippet = document.createElement("span");
      snippet.className = "search-result-snippet";
      snippet.textContent = safeLabel(entry.snippet, "No indexed snippet.");

      item.append(title, meta, snippet);
      resultsContainer.append(item);
    }
  };

  const syncNavigationUi = () => {
    const hasResults = results.length > 0;
    if (prevButton instanceof HTMLButtonElement) {
      prevButton.disabled = !hasResults;
    }
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.disabled = !hasResults;
    }
  };

  const setActiveIndex = (index, { activate = false, viaNavigation = false } = {}) => {
    const selectable = results
      .map((entry, entryIndex) => ({ entry, entryIndex }))
      .filter(({ entry }) => isSelectableResult(entry))
      .map(({ entryIndex }) => entryIndex);

    if (selectable.length < 1) {
      activeIndex = -1;
      renderResults();
      syncNavigationUi();
      return;
    }

    const activeSelectableIndex = selectable.indexOf(activeIndex);
    const base = activeSelectableIndex >= 0 ? activeSelectableIndex : 0;
    const bounded = ((index + base) % selectable.length + selectable.length) % selectable.length;
    activeIndex = selectable[bounded];
    renderResults();
    syncNavigationUi();

    const active = results[activeIndex];
    if (activate && active) {
      void onActivateResult?.(active);
    } else if (viaNavigation && active) {
      void onNavigateResult?.(active);
    }
  };

  const setResults = (nextResults, { query = "", indexedCount = null } = {}) => {
    results = asArray(nextResults);
    activeIndex = results.findIndex((entry) => isSelectableResult(entry));

    if (Number.isFinite(indexedCount)) {
      lastIndexedCount = indexedCount;
    }

    setResultCount(results.length);
    if (!safeLabel(query)) {
      setStatus(`Index ready. ${lastIndexedCount} widget${lastIndexedCount === 1 ? "" : "s"} indexed.`);
    } else if (results.length > 0) {
      setStatus(`Found ${results.length} result${results.length === 1 ? "" : "s"} in ${lastIndexedCount} indexed widget${lastIndexedCount === 1 ? "" : "s"}.`);
    } else {
      setStatus(defaultEmptyMessage(query));
    }

    renderResults();
    syncNavigationUi();
  };

  const runQuery = async () => {
    const query = queryInput instanceof HTMLInputElement ? queryInput.value : "";
    const requestId = ++queryRequestId;

    let payload = null;
    try {
      payload = (await onQuery?.(query)) ?? null;
    } catch (error) {
      if (requestId !== queryRequestId) {
        return;
      }
      setStatus(error?.message ?? "Search failed.");
      return;
    }

    if (requestId !== queryRequestId) {
      return;
    }

    setResults(payload?.results ?? [], {
      query,
      indexedCount: Number.isFinite(payload?.indexedCount) ? payload.indexedCount : lastIndexedCount,
    });
  };

  const refreshIndex = (indexedCount = null) => {
    const query = queryInput instanceof HTMLInputElement ? queryInput.value : "";
    setResults(results, {
      query,
      indexedCount: Number.isFinite(indexedCount) ? indexedCount : lastIndexedCount,
    });
  };

  const onToggleClick = () => updateOpenState(!open);
  const onCloseClick = () => updateOpenState(false);
  const onQueryInput = () => {
    void runQuery();
  };

  const onResultsClick = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const item = target.closest("button[data-result-index]");
    if (!(item instanceof HTMLButtonElement)) {
      return;
    }

    const index = Number.parseInt(item.dataset.resultIndex ?? "", 10);
    if (!Number.isFinite(index)) {
      return;
    }

    if (!isSelectableResult(results[index])) {
      return;
    }

    activeIndex = index;
    renderResults();
    syncNavigationUi();
    setActiveIndex(0, { activate: true });
  };

  const onPrevClick = () => {
    if (results.length < 1) {
      return;
    }
    setActiveIndex(-1, { viaNavigation: true });
  };

  const onNextClick = () => {
    if (results.length < 1) {
      return;
    }
    setActiveIndex(1, { viaNavigation: true });
  };

  const onWindowKeyDown = (event) => {
    const key = event.key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === "f") {
      event.preventDefault();
      updateOpenState(!open);
      return;
    }

    if (!open) {
      return;
    }

    if (key === "escape") {
      event.preventDefault();
      updateOpenState(false);
      return;
    }

    if (key === "enter" && results.length > 0 && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (isTypingTarget(event.target) || queryInput === event.target) {
        setActiveIndex(0, { activate: true });
      }
      return;
    }

    if (!isTypingTarget(event.target) && key === "arrowdown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex(1, { viaNavigation: true });
      return;
    }

    if (!isTypingTarget(event.target) && key === "arrowup" && results.length > 0) {
      event.preventDefault();
      setActiveIndex(-1, { viaNavigation: true });
    }
  };

  toggleButton?.addEventListener("click", onToggleClick);
  closeButton?.addEventListener("click", onCloseClick);
  queryInput?.addEventListener("input", onQueryInput);
  resultsContainer?.addEventListener("click", onResultsClick);
  prevButton?.addEventListener("click", onPrevClick);
  nextButton?.addEventListener("click", onNextClick);
  window.addEventListener("keydown", onWindowKeyDown);

  updateOpenState(false);
  setResults([], { query: "", indexedCount: 0 });

  return {
    open: () => updateOpenState(true),
    close: () => updateOpenState(false),
    toggle: () => updateOpenState(!open),
    isOpen: () => open,
    runQuery: () => runQuery(),
    refreshIndex,
    dispose() {
      toggleButton?.removeEventListener("click", onToggleClick);
      closeButton?.removeEventListener("click", onCloseClick);
      queryInput?.removeEventListener("input", onQueryInput);
      resultsContainer?.removeEventListener("click", onResultsClick);
      prevButton?.removeEventListener("click", onPrevClick);
      nextButton?.removeEventListener("click", onNextClick);
      window.removeEventListener("keydown", onWindowKeyDown);
      updateOpenState(false);
    },
  };
}
