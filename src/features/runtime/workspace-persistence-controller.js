export function createWorkspacePersistenceController({
  windowObj = window,
  contextWorkspaceStore,
  contextStore,
  runtime,
  documentManager,
  suggestionStore,
  getScopeId,
  getActiveSectionId,
  getResearchCaptures,
  getLastPdfWidgetId,
  getLastReferenceWidgetId,
  isRestoringContext = () => false,
  onBeforePersist = null,
  onPersistSuccess = null,
  onStoragePressure = null,
} = {}) {
  if (!contextWorkspaceStore) {
    throw new Error("Workspace persistence controller requires contextWorkspaceStore.");
  }
  if (!contextStore) {
    throw new Error("Workspace persistence controller requires contextStore.");
  }
  if (!runtime || !documentManager || !suggestionStore) {
    throw new Error("Workspace persistence controller requires runtime, documentManager and suggestionStore.");
  }
  if (typeof getScopeId !== "function" || typeof getActiveSectionId !== "function") {
    throw new Error("Workspace persistence controller requires scope/section accessors.");
  }

  let persistTimer = null;
  let hasShownStorageWarning = false;

  function persistNow() {
    const scopeId = getScopeId();
    if (!scopeId || isRestoringContext()) {
      return false;
    }

    if (typeof onBeforePersist === "function") {
      onBeforePersist();
    }

    const persisted = documentManager.toPersistencePayload();
    const saved = contextWorkspaceStore.saveFromRuntime({
      contextId: scopeId,
      runtime,
      researchCaptures: typeof getResearchCaptures === "function" ? getResearchCaptures() : [],
      suggestions: suggestionStore.toPersistencePayload({
        scopeId,
        sectionId: getActiveSectionId(),
      }),
      documents: persisted.documents,
      documentBindings: persisted.documentBindings,
      activeDocumentId: persisted.activeDocumentId,
      lastPdfWidgetId: typeof getLastPdfWidgetId === "function" ? getLastPdfWidgetId() : null,
      lastReferenceWidgetId:
        typeof getLastReferenceWidgetId === "function" ? getLastReferenceWidgetId() : null,
    });

    if (saved) {
      hasShownStorageWarning = false;
      contextStore.touchActiveContext();
      onPersistSuccess?.();
      return true;
    }

    if (!hasShownStorageWarning) {
      hasShownStorageWarning = true;
      onStoragePressure?.();
    }
    return false;
  }

  function flushPersist() {
    if (persistTimer) {
      windowObj.clearTimeout(persistTimer);
      persistTimer = null;
    }
    return persistNow();
  }

  function schedulePersist({ delayMs = 220 } = {}) {
    const scopeId = getScopeId();
    if (!scopeId || isRestoringContext()) {
      return;
    }
    if (persistTimer) {
      windowObj.clearTimeout(persistTimer);
    }
    persistTimer = windowObj.setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function destroy() {
    if (persistTimer) {
      windowObj.clearTimeout(persistTimer);
      persistTimer = null;
    }
  }

  return {
    persistNow,
    flushPersist,
    schedulePersist,
    destroy,
  };
}
