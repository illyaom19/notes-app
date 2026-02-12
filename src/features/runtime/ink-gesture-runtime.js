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
  getInkStateSnapshot,
  currentInkTool,
  updateInkUi,
  updateGestureUi,
  applyGesturePrefs,
  ensureSearchFeatures,
  executeCreationFromLasso,
  onSearchGesture,
  onGestureUsed,
  setInkToggleLabel,
  scheduleOnboardingRefresh,
  inkUiElements,
  gestureUiElements,
} = {}) {
  if (!runtime || !canvas) {
    throw new Error("Ink/gesture runtime requires runtime + canvas.");
  }

  const markLoaded = (name) => {
    loadedModules?.add?.(name);
    onLoadedModulesChanged?.();
  };
  const inkUi = inkUiElements && typeof inkUiElements === "object" ? inkUiElements : {};
  const gestureUi = gestureUiElements && typeof gestureUiElements === "object" ? gestureUiElements : {};
  let inkStyleMenuCloseTimer = null;
  let uiBindingsWired = false;

  function isInkToolDropdownOpen() {
    return (
      inkUi.inkToolDropdownToggle instanceof HTMLButtonElement &&
      inkUi.inkToolDropdownMenu instanceof HTMLElement &&
      inkUi.inkToolDropdownToggle.getAttribute("aria-expanded") === "true" &&
      !inkUi.inkToolDropdownMenu.hidden
    );
  }

  function setInkToolDropdownOpen(nextOpen) {
    if (!(inkUi.inkToolDropdownToggle instanceof HTMLButtonElement) || !(inkUi.inkToolDropdownMenu instanceof HTMLElement)) {
      return false;
    }
    const open = Boolean(nextOpen) && !inkUi.inkToolDropdownToggle.disabled;
    inkUi.inkToolDropdownToggle.setAttribute("aria-expanded", open ? "true" : "false");
    inkUi.inkToolDropdownToggle.dataset.open = open ? "true" : "false";
    inkUi.inkToolDropdownMenu.hidden = !open;
    return open;
  }

  function isInkStyleDropdownOpen() {
    return (
      inkUi.inkStyleDropdownToggle instanceof HTMLButtonElement &&
      inkUi.inkStyleDropdownMenu instanceof HTMLElement &&
      inkUi.inkStyleDropdownToggle.getAttribute("aria-expanded") === "true" &&
      !inkUi.inkStyleDropdownMenu.hidden
    );
  }

  function setInkStyleDropdownOpen(nextOpen) {
    if (
      !(inkUi.inkStyleDropdownToggle instanceof HTMLButtonElement) ||
      !(inkUi.inkStyleDropdownMenu instanceof HTMLElement)
    ) {
      return false;
    }
    const open = Boolean(nextOpen) && !inkUi.inkStyleDropdownToggle.disabled;
    inkUi.inkStyleDropdownToggle.setAttribute("aria-expanded", open ? "true" : "false");
    inkUi.inkStyleDropdownToggle.dataset.open = open ? "true" : "false";
    inkUi.inkStyleDropdownMenu.hidden = !open;
    return open;
  }

  function isWithinInkToolDropdown(target) {
    if (!(target instanceof Node)) {
      return false;
    }
    if (inkUi.inkToolDropdown instanceof HTMLElement && inkUi.inkToolDropdown.contains(target)) {
      return true;
    }
    if (inkUi.inkToolDropdownToggle instanceof HTMLElement && inkUi.inkToolDropdownToggle.contains(target)) {
      return true;
    }
    if (inkUi.inkToolDropdownMenu instanceof HTMLElement && inkUi.inkToolDropdownMenu.contains(target)) {
      return true;
    }
    return false;
  }

  function isWithinInkStyleDropdown(target) {
    if (!(target instanceof Node)) {
      return false;
    }
    if (inkUi.inkStyleDropdown instanceof HTMLElement && inkUi.inkStyleDropdown.contains(target)) {
      return true;
    }
    if (inkUi.inkStyleDropdownToggle instanceof HTMLElement && inkUi.inkStyleDropdownToggle.contains(target)) {
      return true;
    }
    if (inkUi.inkStyleDropdownMenu instanceof HTMLElement && inkUi.inkStyleDropdownMenu.contains(target)) {
      return true;
    }
    return false;
  }

  function scheduleInkStyleMenuClose(delayMs = 90) {
    if (inkStyleMenuCloseTimer) {
      window.clearTimeout(inkStyleMenuCloseTimer);
    }
    inkStyleMenuCloseTimer = window.setTimeout(() => {
      inkStyleMenuCloseTimer = null;
      setInkStyleDropdownOpen(false);
    }, delayMs);
  }

  function cancelInkStyleMenuClose() {
    if (!inkStyleMenuCloseTimer) {
      return;
    }
    window.clearTimeout(inkStyleMenuCloseTimer);
    inkStyleMenuCloseTimer = null;
  }

  function hideInkCursorPill() {
    if (!(inkUi.inkCursorPill instanceof HTMLElement)) {
      return;
    }
    inkUi.inkCursorPill.hidden = true;
  }

  function syncInkCursorPill(event = null) {
    if (!(inkUi.inkCursorPill instanceof HTMLElement)) {
      return;
    }
    const snapshot = getInkStateSnapshot?.() ?? {};
    const tool = normalizeInkTool?.(snapshot.activeTool) ?? "pen";
    const enabled = snapshot.enabled !== false;
    const shouldShow = enabled && (tool === "eraser" || tool === "lasso");
    if (!shouldShow || !event) {
      inkUi.inkCursorPill.hidden = true;
      return;
    }
    const pointerType = event.pointerType ?? "mouse";
    if (pointerType === "touch") {
      inkUi.inkCursorPill.hidden = true;
      return;
    }
    const icon = tool === "eraser" ? "⌫" : "◌";
    inkUi.inkCursorPill.textContent = icon;
    inkUi.inkCursorPill.style.left = `${event.clientX + 14}px`;
    inkUi.inkCursorPill.style.top = `${event.clientY - 14}px`;
    inkUi.inkCursorPill.hidden = false;
  }

  function syncInkToolDropdownUi(activeTool = "pen", enabled = true) {
    if (!(inkUi.inkToolDropdownToggle instanceof HTMLButtonElement) || !(inkUi.inkToolDropdownMenu instanceof HTMLElement)) {
      return;
    }
    const nextTool = normalizeInkTool?.(activeTool) ?? "pen";
    const icon = nextTool === "eraser" ? "⌫" : nextTool === "lasso" ? "◌" : "✎";
    const label = nextTool === "eraser" ? "Eraser" : nextTool === "lasso" ? "Lasso" : "Pen";
    inkUi.inkToolDropdownToggle.textContent = icon;
    inkUi.inkToolDropdownToggle.title = `Ink tool: ${label}`;
    inkUi.inkToolDropdownToggle.setAttribute("aria-label", `Ink tool: ${label}`);
    inkUi.inkToolDropdownToggle.disabled = !getInkFeature?.() || !enabled;
    for (const button of inkUi.inkToolDropdownMenu.querySelectorAll("button[data-ink-tool]")) {
      const target = button instanceof HTMLButtonElement ? button : null;
      if (!target) {
        continue;
      }
      target.dataset.active = (normalizeInkTool?.(target.dataset.inkTool) ?? "pen") === nextTool ? "true" : "false";
    }
    if (inkUi.inkToolDropdownToggle.disabled) {
      setInkToolDropdownOpen(false);
    }
  }

  function syncInkStyleDropdownUi(penColor = "#103f78", penThickness = 3, enabled = true) {
    if (
      !(inkUi.inkStyleDropdownToggle instanceof HTMLButtonElement) ||
      !(inkUi.inkStyleDropdownMenu instanceof HTMLElement)
    ) {
      return;
    }
    const color = normalizeInkColor?.(penColor) ?? "#103f78";
    const thickness = normalizeInkThickness?.(penThickness) ?? 3;
    inkUi.inkStyleDropdownToggle.style.color = color;
    inkUi.inkStyleDropdownToggle.disabled = !getInkFeature?.() || !enabled;
    inkUi.inkStyleDropdownToggle.dataset.open =
      inkUi.inkStyleDropdownToggle.getAttribute("aria-expanded") === "true" ? "true" : "false";

    for (const button of inkUi.inkStyleDropdownMenu.querySelectorAll("button[data-ink-color]")) {
      const target = button instanceof HTMLButtonElement ? button : null;
      if (!target) {
        continue;
      }
      const buttonColor = normalizeInkColor?.(target.dataset.inkColor) ?? "#103f78";
      target.dataset.active = buttonColor === color ? "true" : "false";
    }
    if (inkUi.inkThicknessRange instanceof HTMLInputElement) {
      inkUi.inkThicknessRange.value = String(thickness);
      inkUi.inkThicknessRange.disabled = inkUi.inkStyleDropdownToggle.disabled;
    }
    if (inkUi.inkStyleDropdownToggle.disabled) {
      setInkStyleDropdownOpen(false);
    }
  }

  function wireUiBindings() {
    if (uiBindingsWired) {
      return;
    }
    uiBindingsWired = true;

    gestureUi.gestureEnabledToggle?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const current = getGesturePrefs?.() ?? {};
      applyGesturePrefs?.({
        ...current,
        enabled: target.checked,
      });
    });

    gestureUi.gestureDoubleTapToggle?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const current = getGesturePrefs?.() ?? {};
      applyGesturePrefs?.({
        ...current,
        gestures: {
          ...(current.gestures ?? {}),
          doubleTap: target.checked,
        },
      });
    });

    gestureUi.gestureBarrelTapToggle?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const current = getGesturePrefs?.() ?? {};
      applyGesturePrefs?.({
        ...current,
        gestures: {
          ...(current.gestures ?? {}),
          barrelTap: target.checked,
        },
      });
    });

    gestureUi.gestureDoubleTapBindingSelect?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      const current = getGesturePrefs?.() ?? {};
      applyGesturePrefs?.({
        ...current,
        bindings: {
          ...(current.bindings ?? {}),
          doubleTap: target.value,
        },
      });
    });

    gestureUi.gestureBarrelTapBindingSelect?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      const current = getGesturePrefs?.() ?? {};
      applyGesturePrefs?.({
        ...current,
        bindings: {
          ...(current.bindings ?? {}),
          barrelTap: target.value,
        },
      });
    });

    inkUi.inkToolDropdownToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setInkToolDropdownOpen(!isInkToolDropdownOpen());
    });

    inkUi.inkToolDropdownMenu?.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("button[data-ink-tool]") : null;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const tool = normalizeInkTool?.(target.dataset.inkTool) ?? "pen";
      setInkToolDropdownOpen(false);
      void selectInkTool(tool);
    });

    inkUi.inkStyleDropdownToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelInkStyleMenuClose();
      setInkStyleDropdownOpen(!isInkStyleDropdownOpen());
    });

    inkUi.inkStyleDropdownToggle?.addEventListener("pointerenter", () => {
      cancelInkStyleMenuClose();
      setInkStyleDropdownOpen(true);
    });

    inkUi.inkStyleDropdownToggle?.addEventListener("pointerleave", () => {
      scheduleInkStyleMenuClose(120);
    });

    inkUi.inkStyleDropdownMenu?.addEventListener("pointerenter", () => {
      cancelInkStyleMenuClose();
      setInkStyleDropdownOpen(true);
    });

    inkUi.inkStyleDropdownMenu?.addEventListener("pointerleave", () => {
      scheduleInkStyleMenuClose(120);
    });

    inkUi.inkStyleDropdownMenu?.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("button[data-ink-color]") : null;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      event.preventDefault();
      const color = normalizeInkColor?.(target.dataset.inkColor) ?? "#103f78";
      void updatePenStyle({ color });
    });

    inkUi.inkThicknessRange?.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      void updatePenStyle({ thickness: Number(target.value) });
    });
  }

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
    syncInkToolDropdownUi,
    syncInkStyleDropdownUi,
    isInkToolDropdownOpen,
    setInkToolDropdownOpen,
    isWithinInkToolDropdown,
    isInkStyleDropdownOpen,
    setInkStyleDropdownOpen,
    isWithinInkStyleDropdown,
    scheduleInkStyleMenuClose,
    cancelInkStyleMenuClose,
    hideInkCursorPill,
    syncInkCursorPill,
    wireUiBindings,
  };
}
