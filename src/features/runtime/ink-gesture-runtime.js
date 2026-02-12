export function createInkGestureRuntime({
  runtime,
  canvas,
  workspaceScopeId,
  loadedModules,
  onLoadedModulesChanged,
  getInkFeature,
  setInkFeature,
  getPenGestureController,
  setPenGestureController,
  getGesturePrefs,
  setGesturePrefs,
  getLastGestureStatus,
  setLastGestureStatus,
  defaultGesturePrefs,
  normalizeGesturePrefs,
  normalizeInkTool,
  normalizeInkColor,
  normalizeInkThickness,
  currentInkTool,
  updateInkUi,
  updateGestureUi,
  ensureSearchFeatures,
  executeCreationFromLasso,
  onSearchGesture,
  onGestureUsed,
  setInkToggleLabel,
  scheduleOnboardingRefresh,
} = {}) {
  if (!runtime || !canvas) {
    throw new Error("Ink/gesture runtime requires runtime + canvas.");
  }

  const markLoaded = (name) => {
    loadedModules?.add?.(name);
    onLoadedModulesChanged?.();
  };

  async function ensureInkFeature() {
    const existing = getInkFeature?.();
    if (existing) {
      return existing;
    }

    const inkModule = await import("../ink/index.js");
    markLoaded("ink");

    const feature = inkModule.createInkFeature({
      runtime,
      getActiveContextId: () => workspaceScopeId?.(),
      onStateChange: (state) => updateInkUi?.(state),
      onCreateNoteFromLasso: (payload) => {
        executeCreationFromLasso?.(payload);
      },
    });
    setInkFeature?.(feature);
    runtime.bumpWidgetRasterEpoch();

    updateInkUi?.({
      activeTool: currentInkTool?.(),
      ...(typeof feature.getPenStyle === "function" ? feature.getPenStyle() : {}),
      enabled: true,
    });
    setInkToggleLabel?.(true);

    return feature;
  }

  function setInkEnabled(nextEnabled) {
    const feature = getInkFeature?.();
    if (!feature || typeof feature.setEnabled !== "function") {
      return false;
    }

    const enabled = feature.setEnabled(nextEnabled);
    updateInkUi?.({
      activeTool: currentInkTool?.(),
      ...(typeof feature.getPenStyle === "function" ? feature.getPenStyle() : {}),
      enabled,
    });
    setInkToggleLabel?.(enabled);
    return enabled;
  }

  async function toggleInkEnabled() {
    const feature = await ensureInkFeature();
    if (!feature || typeof feature.isEnabled !== "function") {
      return false;
    }
    const next = !feature.isEnabled();
    setInkEnabled(next);
    return next;
  }

  async function toggleInkTool() {
    const feature = await ensureInkFeature();
    if (!feature || typeof feature.toggleTool !== "function") {
      return "pen";
    }

    const nextTool = normalizeInkTool?.(feature.toggleTool()) ?? "pen";
    updateInkUi?.({
      activeTool: nextTool,
      ...(typeof feature.getPenStyle === "function" ? feature.getPenStyle() : {}),
      enabled: feature.isEnabled?.() !== false,
    });
    return nextTool;
  }

  async function selectInkTool(nextTool) {
    const feature = await ensureInkFeature();
    if (!feature || typeof feature.setTool !== "function") {
      return "pen";
    }
    const normalized = normalizeInkTool?.(nextTool) ?? "pen";
    const selected = normalizeInkTool?.(feature.setTool(normalized)) ?? "pen";
    updateInkUi?.({
      activeTool: selected,
      ...(typeof feature.getPenStyle === "function" ? feature.getPenStyle() : {}),
      enabled: feature.isEnabled?.() !== false,
    });
    return selected;
  }

  async function updatePenStyle({ color = null, thickness = null } = {}) {
    const feature = await ensureInkFeature();
    if (!feature) {
      return { penColor: "#103f78", penThickness: 3 };
    }

    if (typeof color === "string" && typeof feature.setPenColor === "function") {
      feature.setPenColor(normalizeInkColor?.(color) ?? color);
    }
    if (thickness !== null && typeof feature.setPenThickness === "function") {
      feature.setPenThickness(normalizeInkThickness?.(thickness) ?? thickness);
    }

    const style =
      typeof feature.getPenStyle === "function"
        ? feature.getPenStyle()
        : {
            penColor: normalizeInkColor?.(color) ?? "#103f78",
            penThickness: normalizeInkThickness?.(thickness) ?? 3,
          };
    updateInkUi?.({
      penColor: style.penColor,
      penThickness: style.penThickness,
      activeTool: currentInkTool?.(),
      enabled: feature.isEnabled?.() !== false,
    });
    return style;
  }

  async function executeGestureAction(actionName) {
    if (actionName === "select-lasso-tool") {
      await selectInkTool("lasso");
      return;
    }

    if (actionName === "toggle-ink-tool") {
      await toggleInkTool();
      return;
    }

    if (actionName === "toggle-ink-enabled") {
      await toggleInkEnabled();
      return;
    }

    if (actionName === "toggle-search-panel") {
      const panel = await ensureSearchFeatures?.();
      panel?.toggle?.();
      onSearchGesture?.();
      scheduleOnboardingRefresh?.(40);
    }
  }

  async function ensureGestureFeatures() {
    const existing = getPenGestureController?.();
    if (existing) {
      return existing;
    }

    const gestureModule = await import("../gestures/pen-gestures.js");
    markLoaded("pen-gestures");

    const normalizedPrefs = normalizeGesturePrefs?.(getGesturePrefs?.() ?? defaultGesturePrefs?.()) ?? {};
    setGesturePrefs?.(normalizedPrefs);
    updateGestureUi?.();

    const controller = gestureModule.createPenGestureController({
      canvas,
      getPrefs: () => getGesturePrefs?.(),
      onAction: (binding) => {
        void executeGestureAction(binding);
      },
      onStatusChange: (status) => {
        const merged = {
          ...(getLastGestureStatus?.() ?? {}),
          ...(status ?? {}),
        };
        setLastGestureStatus?.(merged);
        if (merged.lastGesture && merged.lastGesture !== "idle") {
          onGestureUsed?.();
          scheduleOnboardingRefresh?.(60);
        }
        updateGestureUi?.();
      },
    });

    setPenGestureController?.(controller);
    return controller;
  }

  return {
    ensureInkFeature,
    setInkEnabled,
    toggleInkEnabled,
    toggleInkTool,
    selectInkTool,
    updatePenStyle,
    executeGestureAction,
    ensureGestureFeatures,
  };
}
