export function createKnowledgeRuntime({
  runtime,
  suggestionStore,
  suggestionEngine,
  workspaceScopeId,
  parseWorkspaceScopeId,
  getActiveSectionId,
  getActiveContextId,
  activeContextRecord,
  activeSectionRecord,
  isScopeInNotebook,
  getSectionsStore,
  getSuggestionUiController,
  getRestoringContext,
  scheduleWorkspacePersist,
  updateWidgetUi,
  createCreationIntent,
  viewportCenterAnchor,
  createExpandedAreaWidget,
  createExpandedFromWhitespaceZone,
  createReferencePopupWidget,
  centerCameraOnWidget,
  centerCameraOnWorldPoint,
  switchContext,
  switchSection,
  onSearchIndexSyncCount,
  loadedModules,
  onLoadedModulesChanged,
  getSearchPanelController,
  setSearchPanelController,
  getSearchIndex,
  setSearchIndex,
  searchPanelElement,
  searchToggleButtonElement,
  getResearchPanelController,
  setResearchPanelController,
  researchPanelElement,
  researchToggleButtonElement,
  createReferencePopupFromResearchCapture,
} = {}) {
  if (!runtime || !suggestionStore || !suggestionEngine) {
    throw new Error("Knowledge runtime requires runtime + suggestion services.");
  }

  let suggestionRailRenderFrame = null;
  let suggestionRailRenderQueued = false;
  let suggestionAnalysisTimer = null;
  let suggestionAnalysisInFlight = false;
  let suggestionAnalysisQueued = false;

  function currentSuggestionScope() {
    const scopeId = workspaceScopeId?.();
    if (!scopeId) {
      return null;
    }

    const parsed = parseWorkspaceScopeId?.(scopeId) ?? {};
    const sectionId = parsed.sectionId ?? getActiveSectionId?.() ?? null;
    if (!sectionId) {
      return null;
    }

    return {
      scopeId,
      sectionId,
    };
  }

  function renderSuggestionRailNow() {
    const scope = currentSuggestionScope();
    const suggestionUiController = getSuggestionUiController?.();
    if (!scope || !suggestionUiController) {
      suggestionUiController?.render({ focusedPdfWidgetId: null, proposed: [], ghosted: [] });
      return;
    }

    const focusedId = runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId();
    const focusedWidget = focusedId ? runtime.getWidgetById(focusedId) : null;
    const focusedPdf =
      focusedWidget && focusedWidget.type === "pdf-document"
        ? focusedWidget
        : null;
    if (!focusedPdf) {
      suggestionUiController.render({ focusedPdfWidgetId: null, proposed: [], ghosted: [] });
      return;
    }

    const proposed = suggestionStore
      .list({
        scopeId: scope.scopeId,
        sectionId: scope.sectionId,
        states: ["proposed", "restored"],
      })
      .filter((entry) => entry.kind === "reference-popup" && entry.payload?.sourceWidgetId === focusedPdf.id);
    const ghosted = suggestionStore
      .list({
        scopeId: scope.scopeId,
        sectionId: scope.sectionId,
        states: ["ghosted"],
      })
      .filter((entry) => entry.kind === "reference-popup" && entry.payload?.sourceWidgetId === focusedPdf.id);

    suggestionUiController.render({
      focusedPdfWidgetId: focusedPdf.id,
      proposed,
      ghosted,
    });
  }

  function renderSuggestionRail({ immediate = false } = {}) {
    if (immediate || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      if (suggestionRailRenderFrame !== null) {
        window.cancelAnimationFrame(suggestionRailRenderFrame);
        suggestionRailRenderFrame = null;
        suggestionRailRenderQueued = false;
      }
      renderSuggestionRailNow();
      return;
    }

    if (suggestionRailRenderFrame !== null) {
      suggestionRailRenderQueued = true;
      return;
    }

    suggestionRailRenderFrame = window.requestAnimationFrame(() => {
      suggestionRailRenderFrame = null;
      renderSuggestionRailNow();
      if (suggestionRailRenderQueued) {
        suggestionRailRenderQueued = false;
        renderSuggestionRail();
      }
    });
  }

  async function runSuggestionAnalysis() {
    const scope = currentSuggestionScope();
    if (!scope || getRestoringContext?.()) {
      return;
    }

    if (suggestionAnalysisInFlight) {
      suggestionAnalysisQueued = true;
      return;
    }

    suggestionAnalysisInFlight = true;
    suggestionAnalysisQueued = false;

    try {
      const generated = await suggestionEngine.collect({ runtime });
      suggestionStore.upsertMany({
        scopeId: scope.scopeId,
        sectionId: scope.sectionId,
        suggestions: generated,
      });
      suggestionStore.pruneInvalidAnchors({
        scopeId: scope.scopeId,
        sectionId: scope.sectionId,
        runtime,
      });
      renderSuggestionRail();
      scheduleWorkspacePersist?.();
    } catch (error) {
      console.error("Suggestion analysis failed:", error);
    } finally {
      suggestionAnalysisInFlight = false;
      if (suggestionAnalysisQueued) {
        suggestionAnalysisQueued = false;
        void runSuggestionAnalysis();
      }
    }
  }

  function scheduleSuggestionAnalysis({ immediate = false } = {}) {
    if (suggestionAnalysisTimer) {
      window.clearTimeout(suggestionAnalysisTimer);
      suggestionAnalysisTimer = null;
    }

    if (!currentSuggestionScope() || getRestoringContext?.()) {
      return;
    }

    suggestionAnalysisTimer = window.setTimeout(
      () => {
        suggestionAnalysisTimer = null;
        void runSuggestionAnalysis();
      },
      immediate ? 0 : 220,
    );
  }

  function resetSuggestionScheduling() {
    if (suggestionAnalysisTimer) {
      window.clearTimeout(suggestionAnalysisTimer);
      suggestionAnalysisTimer = null;
    }
    suggestionAnalysisQueued = false;
    suggestionAnalysisInFlight = false;
  }

  function transitionSuggestionState(suggestion, toState) {
    const scope = currentSuggestionScope();
    if (!scope || !suggestion || typeof suggestion.id !== "string") {
      return null;
    }

    const updated = suggestionStore.transition({
      scopeId: scope.scopeId,
      sectionId: scope.sectionId,
      suggestionId: suggestion.id,
      toState,
    });
    renderSuggestionRail();
    scheduleWorkspacePersist?.();
    return updated;
  }

  function restoreSuggestionForRemovedWidget({ widget, reason } = {}) {
    if (reason !== "user-delete") {
      return;
    }
    if (!widget || widget.type !== "reference-popup") {
      return;
    }

    const suggestionId =
      typeof widget.metadata?.suggestionId === "string" && widget.metadata.suggestionId.trim()
        ? widget.metadata.suggestionId.trim()
        : null;
    if (!suggestionId) {
      return;
    }

    const scope = currentSuggestionScope();
    if (!scope) {
      return;
    }

    const existing = suggestionStore
      .list({
        scopeId: scope.scopeId,
        sectionId: scope.sectionId,
      })
      .find((entry) => entry.id === suggestionId);
    if (!existing || existing.state !== "accepted") {
      return;
    }

    suggestionStore.transition({
      scopeId: scope.scopeId,
      sectionId: scope.sectionId,
      suggestionId,
      toState: "ghosted",
    });
    renderSuggestionRail();
    scheduleWorkspacePersist?.();
  }

  function focusSuggestion(suggestion) {
    if (!suggestion) {
      return;
    }

    const sourceWidgetId =
      typeof suggestion.payload?.sourceWidgetId === "string" && suggestion.payload.sourceWidgetId.trim()
        ? suggestion.payload.sourceWidgetId
        : null;
    if (sourceWidgetId) {
      const source = runtime.getWidgetById(sourceWidgetId);
      if (source) {
        centerCameraOnWidget?.(source);
        runtime.bringWidgetToFront(source.id);
        runtime.setSelectedWidgetId(source.id);
        runtime.setFocusedWidgetId(source.id);
        return;
      }
    }

    if (suggestion.anchor) {
      centerCameraOnWorldPoint?.(suggestion.anchor);
    }
  }

  async function acceptSuggestion(suggestion) {
    if (!suggestion || typeof suggestion.kind !== "string") {
      return false;
    }

    const sourceWidgetId =
      typeof suggestion.payload?.sourceWidgetId === "string" && suggestion.payload.sourceWidgetId.trim()
        ? suggestion.payload.sourceWidgetId
        : null;

    if (suggestion.kind === "expanded-area") {
      const sourceWidget = sourceWidgetId ? runtime.getWidgetById(sourceWidgetId) : null;
      const whitespaceZoneId =
        typeof suggestion.payload?.whitespaceZoneId === "string" && suggestion.payload.whitespaceZoneId.trim()
          ? suggestion.payload.whitespaceZoneId
          : null;

      if (sourceWidget?.type === "pdf-document" && whitespaceZoneId) {
        const zone = sourceWidget
          .getWhitespaceZones()
          .find((entry) => entry.id === whitespaceZoneId);
        if (zone && !zone.linkedWidgetId) {
          await createExpandedFromWhitespaceZone?.(sourceWidget, zone);
        } else {
          await createExpandedAreaWidget?.(
            {},
            createCreationIntent?.({
              type: "expanded-area",
              anchor: suggestion.anchor ?? viewportCenterAnchor?.(),
              sourceWidgetId: sourceWidget.id,
              createdFrom: "suggestion-accepted",
            }),
          );
        }
      } else {
        await createExpandedAreaWidget?.(
          {},
          createCreationIntent?.({
            type: "expanded-area",
            anchor: suggestion.anchor ?? viewportCenterAnchor?.(),
            sourceWidgetId,
            createdFrom: "suggestion-accepted",
          }),
        );
      }

      transitionSuggestionState(suggestion, "accepted");
      scheduleSuggestionAnalysis({ immediate: true });
      return true;
    }

    if (suggestion.kind === "reference-popup") {
      const keywordTitle =
        typeof suggestion.payload?.keywordTitle === "string" && suggestion.payload.keywordTitle.trim()
          ? suggestion.payload.keywordTitle.trim()
          : "Reference";
      const sourceTitle =
        typeof suggestion.payload?.sourceTitle === "string" && suggestion.payload.sourceTitle.trim()
          ? suggestion.payload.sourceTitle.trim()
          : "PDF";
      const snippetText =
        typeof suggestion.payload?.snippetText === "string" && suggestion.payload.snippetText.trim()
          ? suggestion.payload.snippetText.trim()
          : `${keywordTitle} appears in ${sourceTitle}.`;

      await createReferencePopupWidget?.({
        intent: createCreationIntent?.({
          type: "reference-popup",
          anchor: suggestion.anchor ?? viewportCenterAnchor?.(),
          sourceWidgetId,
          createdFrom: "suggestion-accepted",
        }),
        definition: {
          metadata: {
            title: `${keywordTitle} Reference`,
            suggestionId: suggestion.id,
            popupMetadata: {
              type: "reference-popup",
              tags: [
                "suggested",
                typeof suggestion.payload?.keywordTag === "string" ? suggestion.payload.keywordTag : "keyword",
              ],
            },
          },
          dataPayload: {
            sourceLabel: sourceTitle,
            textContent: snippetText,
            contentType: "definition",
            citation: null,
            researchCaptureId: null,
          },
        },
      });

      transitionSuggestionState(suggestion, "accepted");
      scheduleSuggestionAnalysis({ immediate: true });
      return true;
    }

    return false;
  }

  async function jumpToSearchResult(result) {
    if (!result || typeof result.widgetId !== "string" || !result.widgetId.trim()) {
      return false;
    }

    if (typeof result.contextId === "string" && result.contextId.trim()) {
      const scope = parseWorkspaceScopeId?.(result.contextId) ?? {};
      if (scope.notebookId && scope.notebookId !== getActiveContextId?.()) {
        await switchContext?.(scope.notebookId);
      }
      if (scope.sectionId && scope.sectionId !== getActiveSectionId?.()) {
        await switchSection?.(scope.sectionId);
      }
    }

    const widget = runtime.getWidgetById(result.widgetId);
    if (!widget) {
      return false;
    }

    runtime.bringWidgetToFront(widget.id);
    runtime.setFocusedWidgetId(widget.id);
    runtime.setSelectedWidgetId(widget.id);
    centerCameraOnWidget?.(widget);
    updateWidgetUi?.();
    return true;
  }

  async function ensureSearchFeatures() {
    const existingController = getSearchPanelController?.();
    const existingIndex = getSearchIndex?.();
    if (existingController && existingIndex) {
      return existingController;
    }

    const [indexModule, panelModule] = await Promise.all([
      import("../search/search-index.js"),
      import("../search/search-panel.js"),
    ]);
    loadedModules?.add("search-index");
    loadedModules?.add("search-panel");
    onLoadedModulesChanged?.();

    let searchIndex = getSearchIndex?.();
    if (!searchIndex) {
      searchIndex = indexModule.createSearchIndex();
      searchIndex.setUpdateListener((stats) => {
        onSearchIndexSyncCount?.(stats.totalEntries);
      });
      setSearchIndex?.(searchIndex);
    }

    const scopeId = workspaceScopeId?.();
    if (scopeId) {
      searchIndex.reindexNow({ runtime, contextId: scopeId });
    }

    const controller = panelModule.createSearchPanelController({
      panelElement: searchPanelElement,
      toggleButton: searchToggleButtonElement,
      onQuery: async (query) => {
        const liveIndex = getSearchIndex?.();
        if (!liveIndex) {
          return { results: [], indexedCount: 0 };
        }

        const activeScopeId = workspaceScopeId?.();
        if (activeScopeId) {
          liveIndex.reindexNow({ runtime, contextId: activeScopeId });
        }

        const notebookName = activeContextRecord?.()?.name ?? "Notebook";
        const sectionName = activeSectionRecord?.()?.name ?? "Section";

        const sectionResults = activeScopeId
          ? liveIndex.query(query, { contextId: activeScopeId, limit: 80 }).map((entry) => ({
              ...entry,
              contextLabel: `${notebookName} / ${sectionName}`,
              scopeGroup: "section",
            }))
          : [];

        const notebookResults = liveIndex
          .query(query, { contextId: null, limit: 260 })
          .filter((entry) => entry.contextId !== activeScopeId && isScopeInNotebook?.(entry.contextId, getActiveContextId?.()))
          .slice(0, 80)
          .map((entry) => {
            const parsed = parseWorkspaceScopeId?.(entry.contextId) ?? {};
            const sectionsStore = getSectionsStore?.();
            const sectionLabel =
              parsed.sectionId && sectionsStore && parsed.notebookId
                ? sectionsStore.listSections(parsed.notebookId).find((item) => item.id === parsed.sectionId)?.name ?? "Section"
                : "Notebook";
            return {
              ...entry,
              contextLabel: `${notebookName} / ${sectionLabel}`,
              scopeGroup: "notebook",
            };
          });

        const results = [];
        if (sectionResults.length > 0) {
          results.push({
            id: "group-current-section",
            kind: "group-header",
            title: "Current Section",
            typeLabel: "",
            snippet: "",
          });
          results.push(...sectionResults);
        }
        if (notebookResults.length > 0) {
          results.push({
            id: "group-notebook",
            kind: "group-header",
            title: "Other Notebook Sections",
            typeLabel: "",
            snippet: "",
          });
          results.push(...notebookResults);
        }

        return {
          results,
          indexedCount: liveIndex
            .snapshotEntries()
            .filter((entry) => isScopeInNotebook?.(entry.contextId, getActiveContextId?.())).length,
        };
      },
      onActivateResult: async (result) => {
        await jumpToSearchResult(result);
      },
      onNavigateResult: async (result) => {
        await jumpToSearchResult(result);
      },
    });

    setSearchPanelController?.(controller);
    onSearchIndexSyncCount?.(searchIndex.getEntryCount(workspaceScopeId?.()));
    return controller;
  }

  async function ensureResearchPanel() {
    const existing = getResearchPanelController?.();
    if (existing) {
      return existing;
    }

    const researchModule = await import("../research/research-panel.js");
    loadedModules?.add("research-panel");
    onLoadedModulesChanged?.();

    const controller = researchModule.createResearchPanelController({
      panelElement: researchPanelElement,
      toggleButton: researchToggleButtonElement,
      getActiveContextId: () => workspaceScopeId?.(),
      getActiveSourceWidgetId: () => runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
      onCapture: async (capture) => {
        const intent = createCreationIntent?.({
          type: "reference-popup",
          anchor: viewportCenterAnchor?.(),
          sourceWidgetId: capture.sourceWidgetId ?? runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        });
        await createReferencePopupFromResearchCapture?.(capture, intent);
      },
    });

    setResearchPanelController?.(controller);
    return controller;
  }

  return {
    currentSuggestionScope,
    renderSuggestionRail,
    runSuggestionAnalysis,
    scheduleSuggestionAnalysis,
    resetSuggestionScheduling,
    transitionSuggestionState,
    restoreSuggestionForRemovedWidget,
    focusSuggestion,
    acceptSuggestion,
    jumpToSearchResult,
    ensureSearchFeatures,
    ensureResearchPanel,
  };
}
