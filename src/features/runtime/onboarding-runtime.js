import { createOnboardingStateService } from "../onboarding/onboarding-state-service.js";

export function createOnboardingRuntime({
  runtime,
  runtimeSignals,
  getScopeId,
  isProductionUi,
  loadedModules,
  onLoadedModulesChanged,
  hintElements,
  executeCreationIntent,
  createCreationIntent,
  viewportCenterAnchor,
  ensureSearchFeatures,
} = {}) {
  if (!runtime) {
    throw new Error("Onboarding runtime requires a widget runtime instance.");
  }

  const stateService = createOnboardingStateService();
  const signals = runtimeSignals && typeof runtimeSignals === "object" ? runtimeSignals : {};
  const elements = hintElements && typeof hintElements === "object" ? hintElements : {};

  let overlay = null;
  let refreshTimer = null;
  let visibleHintId = null;

  function resetRuntimeSignals() {
    signals.searchOpened = false;
    signals.peekActivated = false;
    signals.gestureUsed = false;
  }

  function onboardingHintsCatalog() {
    const widgets = runtime.listWidgets();
    const hasPdf = widgets.some((widget) => widget.type === "pdf-document");
    const hasCreatedWidget = widgets.some((widget) => widget.type !== "pdf-document");

    return [
      {
        id: "radial-create",
        title: "Create with a gesture",
        body: "Hold your finger on empty canvas (or right-click). Drag to a labeled option and release, or release in the center then tap an option. Tap outside or press Escape to cancel.",
        actionLabel: "Got It",
        shouldShow: () => !hasCreatedWidget,
        completeWhen: () => hasCreatedWidget,
        onAction: () => {
          signals.gestureUsed = true;
        },
      },
      {
        id: 'library-browse', title: 'Browse your library',
        body: 'Swipe to scroll and tap to preview. Add to section creates an independent copy. Use the dotted handle to drag a copy onto the canvas.',
        actionLabel: 'Got it', shouldShow: () => widgets.length > 0, completeWhen: () => false,
        onAction: () => dismissOnboardingHint('library-browse'),
      },
      {
        id: 'pin-dock', title: 'Pin or dock',
        body: 'Pin keeps a widget in its canvas position. Drag toward a viewport edge to dock it beside your writing. Docked content stays at the screen edge while you navigate.',
        actionLabel: 'Got it', shouldShow: () => widgets.length > 1, completeWhen: () => false,
        onAction: () => dismissOnboardingHint('pin-dock'),
      },
      {
        id: "peek-search-gesture",
        title: "Use Fast Navigation",
        body: "Use Search with Ctrl/Cmd+F and keep navigating with touch gestures. Gesture bindings are enabled by default.",
        actionLabel: "Open Search",
        shouldShow: () => widgets.length > 1,
        completeWhen: () => signals.searchOpened || signals.peekActivated || signals.gestureUsed,
        onAction: async () => {
          if (typeof ensureSearchFeatures !== "function") {
            return;
          }
          const panel = await ensureSearchFeatures();
          panel?.open?.();
          signals.searchOpened = true;
        },
      },
    ];
  }

  async function ensureOverlay() {
    if (overlay) {
      return overlay;
    }

    const module = await import("../onboarding/hint-overlay.js");
    loadedModules?.add?.("onboarding-hints");
    onLoadedModulesChanged?.();

    overlay = module.createHintOverlay({
      rootElement: elements.rootElement,
      titleElement: elements.titleElement,
      bodyElement: elements.bodyElement,
      progressElement: elements.progressElement,
      actionButton: elements.actionButton,
      dismissButton: elements.dismissButton,
      toggleHintsButton: elements.toggleHintsButton,
      resetButton: elements.resetButton,
      onAction: (hintId) => {
        void handleOnboardingAction(hintId);
      },
      onDismiss: (hintId) => {
        dismissOnboardingHint(hintId);
      },
      onToggleHints: () => {
        toggleOnboardingHints();
      },
      onReset: () => {
        resetOnboardingHints();
      },
    });

    return overlay;
  }

  async function refreshOnboardingHints() {
    const scopeId = getScopeId?.();
    if (!scopeId) {
      return;
    }

    const hintOverlay = await ensureOverlay();
    if (!hintOverlay) {
      return;
    }

    const hintsEnabled = stateService.isHintsEnabled(scopeId);
    hintOverlay.setHintsEnabled(hintsEnabled);

    if (!isProductionUi?.() || !hintsEnabled) {
      hintOverlay.hide();
      visibleHintId = null;
      return;
    }

    const hints = onboardingHintsCatalog();
    for (let index = 0; index < hints.length; index += 1) {
      const hint = hints[index];
      const state = stateService.getHintState(scopeId, hint.id);
      if (state?.completionState === "dismissed") {
        continue;
      }

      if (hint.completeWhen()) {
        if (state?.completionState !== "completed") {
          stateService.markCompleted(scopeId, hint.id);
        }
        continue;
      }

      if (!hint.shouldShow()) {
        continue;
      }

      visibleHintId = hint.id;
      hintOverlay.show({
        hintId: hint.id,
        title: hint.title,
        body: hint.body,
        actionLabel: hint.actionLabel,
        progressText: `Hint ${index + 1} of ${hints.length}`,
        hintsEnabled,
      });
      return;
    }

    visibleHintId = null;
    hintOverlay.hide();
  }

  function scheduleOnboardingRefresh(delayMs = 50) {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void refreshOnboardingHints();
    }, delayMs);
  }

  async function handleOnboardingAction(hintId) {
    if (!getScopeId?.()) {
      return;
    }

    const hint = onboardingHintsCatalog().find((entry) => entry.id === hintId);
    if (!hint || typeof hint.onAction !== "function") {
      return;
    }

    try {
      await hint.onAction();
    } catch (error) {
      console.error(error);
    }

    scheduleOnboardingRefresh(30);
  }

  function dismissOnboardingHint(hintId) {
    const scopeId = getScopeId?.();
    if (!scopeId || !hintId) {
      return;
    }
    stateService.markDismissed(scopeId, hintId);
    scheduleOnboardingRefresh(0);
  }

  function toggleOnboardingHints() {
    const scopeId = getScopeId?.();
    if (!scopeId) {
      return;
    }
    const current = stateService.isHintsEnabled(scopeId);
    stateService.setHintsEnabled(scopeId, !current);
    scheduleOnboardingRefresh(0);
  }

  function resetOnboardingHints() {
    const scopeId = getScopeId?.();
    if (!scopeId) {
      return;
    }
    stateService.resetContext(scopeId);
    resetRuntimeSignals();
    scheduleOnboardingRefresh(0);
  }

  function updateOnboardingControlsUi() {
    const scopeId = getScopeId?.();
    if (!scopeId) {
      return;
    }

    const hintsEnabled = stateService.isHintsEnabled(scopeId);
    if (elements.toggleOnboardingHintsButton instanceof HTMLButtonElement) {
      elements.toggleOnboardingHintsButton.textContent = hintsEnabled ? "Disable Hints" : "Enable Hints";
    }
    if (overlay) {
      overlay.setHintsEnabled(hintsEnabled);
    }
  }

  return {
    onboardingHintsCatalog,
    ensureOnboardingOverlay: ensureOverlay,
    refreshOnboardingHints,
    scheduleOnboardingRefresh,
    handleOnboardingAction,
    dismissOnboardingHint,
    toggleOnboardingHints,
    resetOnboardingHints,
    updateOnboardingControlsUi,
    resetRuntimeSignals,
    getVisibleHintId: () => visibleHintId,
  };
}
