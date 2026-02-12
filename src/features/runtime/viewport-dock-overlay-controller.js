function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createViewportDockOverlayController({
  runtime,
  documentObj = document,
  windowObj = window,
  getViewportRect,
  isPointerOverLibraryLauncher = () => false,
  constants = {},
  onDockCommitted = null,
} = {}) {
  if (!runtime) {
    throw new Error("Viewport dock overlay controller requires a runtime.");
  }
  if (typeof getViewportRect !== "function") {
    throw new Error("Viewport dock overlay controller requires getViewportRect.");
  }

  const EDGE_ZONE_PX = Math.max(1, Number(constants.edgeZonePx) || 48);
  const HOLD_MS = Math.max(0, Number(constants.holdMs) || 220);
  const MARGIN_PX = Math.max(0, Number(constants.marginPx) || 10);
  const META_VERSION = Math.max(1, Number(constants.metaVersion) || 1);
  const EPSILON_WORLD = Number.isFinite(Number(constants.epsilonWorld))
    ? Math.max(0, Number(constants.epsilonWorld))
    : 0.001;
  const WIDTH_RATIO = Number.isFinite(Number(constants.widthRatio))
    ? clamp(Number(constants.widthRatio), 0.1, 0.9)
    : 0.25;
  const HEIGHT_RATIO = Number.isFinite(Number(constants.heightRatio))
    ? clamp(Number(constants.heightRatio), 0.1, 0.9)
    : 0.5;
  const MIN_WIDTH_PX = Math.max(1, Number(constants.minWidthPx) || 120);
  const MIN_HEIGHT_PX = Math.max(1, Number(constants.minHeightPx) || 120);
  const CONTENT_MIN_ZOOM = Number.isFinite(Number(constants.contentMinZoom))
    ? Number(constants.contentMinZoom)
    : 0.4;
  const CONTENT_MAX_ZOOM = Number.isFinite(Number(constants.contentMaxZoom))
    ? Number(constants.contentMaxZoom)
    : 3.5;

  let glowLeft = null;
  let glowRight = null;
  let dragState = null;

  function ensureGlowElements() {
    if (!(documentObj?.body instanceof HTMLElement)) {
      return false;
    }
    if (!(glowLeft instanceof HTMLElement)) {
      glowLeft = documentObj.createElement("div");
      glowLeft.className = "viewport-dock-glow viewport-dock-glow--left";
      glowLeft.hidden = true;
      documentObj.body.append(glowLeft);
    }
    if (!(glowRight instanceof HTMLElement)) {
      glowRight = documentObj.createElement("div");
      glowRight.className = "viewport-dock-glow viewport-dock-glow--right";
      glowRight.hidden = true;
      documentObj.body.append(glowRight);
    }
    return true;
  }

  function syncLayout() {
    if (!ensureGlowElements()) {
      return;
    }
    const rect = getViewportRect();
    if (!rect) {
      return;
    }
    for (const element of [glowLeft, glowRight]) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      element.style.top = `${Math.round(rect.top)}px`;
      element.style.height = `${Math.round(rect.height)}px`;
      element.style.width = `${EDGE_ZONE_PX}px`;
    }
    if (glowLeft instanceof HTMLElement) {
      glowLeft.style.left = `${Math.round(rect.left)}px`;
    }
    if (glowRight instanceof HTMLElement) {
      glowRight.style.left = `${Math.round(rect.right - EDGE_ZONE_PX)}px`;
    }
  }

  function setGlowState({
    active = false,
    overLeft = false,
    overRight = false,
    armedLeft = false,
    armedRight = false,
  } = {}) {
    if (!ensureGlowElements()) {
      return;
    }
    syncLayout();
    for (const element of [glowLeft, glowRight]) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      element.hidden = !active;
      element.dataset.active = active ? "true" : "false";
    }
    if (glowLeft instanceof HTMLElement) {
      glowLeft.dataset.over = overLeft ? "true" : "false";
      glowLeft.dataset.armed = armedLeft ? "true" : "false";
    }
    if (glowRight instanceof HTMLElement) {
      glowRight.dataset.over = overRight ? "true" : "false";
      glowRight.dataset.armed = armedRight ? "true" : "false";
    }
  }

  function clearHoldTimer(state = dragState) {
    if (!state || !Number.isFinite(state.holdTimer)) {
      return;
    }
    windowObj.clearTimeout(state.holdTimer);
    state.holdTimer = null;
  }

  function getDockSideFromPointer(clientX, clientY) {
    const rect = getViewportRect();
    if (!rect) {
      return null;
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }
    if (clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    if (clientX <= rect.left + EDGE_ZONE_PX) {
      return "left";
    }
    if (clientX >= rect.right - EDGE_ZONE_PX) {
      return "right";
    }
    return null;
  }

  function normalizeDockView(viewCandidate) {
    const source = viewCandidate && typeof viewCandidate === "object" ? viewCandidate : {};
    return {
      zoom: clamp(
        Number.isFinite(Number(source.zoom)) ? Number(source.zoom) : 1,
        CONTENT_MIN_ZOOM,
        CONTENT_MAX_ZOOM,
      ),
      offsetXWorld: Number.isFinite(Number(source.offsetXWorld)) ? Number(source.offsetXWorld) : 0,
      offsetYWorld: Number.isFinite(Number(source.offsetYWorld)) ? Number(source.offsetYWorld) : 0,
    };
  }

  function normalizeDockMetadata(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const side = candidate.side === "right" ? "right" : candidate.side === "left" ? "left" : null;
    if (!side) {
      return null;
    }
    const offsetTopPx = Math.max(0, Number(candidate.offsetTopPx) || 0);
    const restoreWidthWorld = Number(candidate.restoreWidthWorld);
    const restoreHeightWorld = Number(candidate.restoreHeightWorld);
    return {
      side,
      offsetTopPx,
      widthRatio: WIDTH_RATIO,
      heightRatio: HEIGHT_RATIO,
      restoreWidthWorld:
        Number.isFinite(restoreWidthWorld) && restoreWidthWorld > 0 ? restoreWidthWorld : null,
      restoreHeightWorld:
        Number.isFinite(restoreHeightWorld) && restoreHeightWorld > 0 ? restoreHeightWorld : null,
      view: normalizeDockView(candidate.view),
      version: META_VERSION,
    };
  }

  function isWidgetDocked(widget) {
    return Boolean(normalizeDockMetadata(widget?.metadata?.viewportDock));
  }

  function applyToWidget(widget, { camera = runtime.camera, viewportRect = getViewportRect() } = {}) {
    if (!widget || !camera || !viewportRect) {
      return false;
    }
    const dock = normalizeDockMetadata(widget.metadata?.viewportDock);
    if (!dock) {
      return false;
    }

    const usableWidth = Math.max(48, viewportRect.width - MARGIN_PX * 2);
    const usableHeight = Math.max(48, viewportRect.height - MARGIN_PX * 2);
    const widthPx = clamp(viewportRect.width * dock.widthRatio, MIN_WIDTH_PX, usableWidth);
    const heightPx = clamp(viewportRect.height * dock.heightRatio, MIN_HEIGHT_PX, usableHeight);
    const yPx = Math.min(
      Math.max(dock.offsetTopPx, MARGIN_PX),
      Math.max(MARGIN_PX, viewportRect.height - heightPx - MARGIN_PX),
    );
    const xPx =
      dock.side === "left"
        ? MARGIN_PX
        : Math.max(MARGIN_PX, viewportRect.width - widthPx - MARGIN_PX);

    const zoom = Math.max(0.25, camera.zoom);
    const nextWorld = camera.screenToWorld(xPx, yPx);
    const nextWidthWorld = widthPx / zoom;
    const nextHeightWorld = heightPx / zoom;

    let changed = false;
    if (
      !Number.isFinite(widget.position?.x) ||
      Math.abs(widget.position.x - nextWorld.x) > EPSILON_WORLD
    ) {
      widget.position.x = nextWorld.x;
      changed = true;
    }
    if (
      !Number.isFinite(widget.position?.y) ||
      Math.abs(widget.position.y - nextWorld.y) > EPSILON_WORLD
    ) {
      widget.position.y = nextWorld.y;
      changed = true;
    }
    if (
      !Number.isFinite(widget.size?.width) ||
      Math.abs(widget.size.width - nextWidthWorld) > EPSILON_WORLD
    ) {
      widget.size.width = nextWidthWorld;
      changed = true;
    }
    if (
      !Number.isFinite(widget.size?.height) ||
      Math.abs(widget.size.height - nextHeightWorld) > EPSILON_WORLD
    ) {
      widget.size.height = nextHeightWorld;
      changed = true;
    }

    const normalizedDock = {
      side: dock.side,
      offsetTopPx: yPx,
      widthRatio: WIDTH_RATIO,
      heightRatio: HEIGHT_RATIO,
      restoreWidthWorld: dock.restoreWidthWorld,
      restoreHeightWorld: dock.restoreHeightWorld,
      view: dock.view,
      version: META_VERSION,
    };
    const existingDock = widget.metadata?.viewportDock;
    if (
      !existingDock ||
      existingDock.side !== normalizedDock.side ||
      Math.abs((Number(existingDock.offsetTopPx) || 0) - normalizedDock.offsetTopPx) > 0.5 ||
      Math.abs((Number(existingDock.widthRatio) || WIDTH_RATIO) - normalizedDock.widthRatio) > 0.001 ||
      Math.abs((Number(existingDock.heightRatio) || HEIGHT_RATIO) - normalizedDock.heightRatio) > 0.001 ||
      Math.abs((Number(existingDock.restoreWidthWorld) || 0) - (Number(normalizedDock.restoreWidthWorld) || 0)) > 0.001 ||
      Math.abs((Number(existingDock.restoreHeightWorld) || 0) - (Number(normalizedDock.restoreHeightWorld) || 0)) > 0.001 ||
      Math.abs((Number(existingDock?.view?.zoom) || 1) - (Number(normalizedDock?.view?.zoom) || 1)) > 0.0001 ||
      Math.abs((Number(existingDock?.view?.offsetXWorld) || 0) - (Number(normalizedDock?.view?.offsetXWorld) || 0)) > 0.001 ||
      Math.abs((Number(existingDock?.view?.offsetYWorld) || 0) - (Number(normalizedDock?.view?.offsetYWorld) || 0)) > 0.001 ||
      Number(existingDock.version) !== META_VERSION
    ) {
      widget.metadata = {
        ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
        viewportDock: normalizedDock,
      };
      changed = true;
    }

    return changed;
  }

  function applyToAllWidgets() {
    const viewportRect = getViewportRect();
    if (!viewportRect) {
      return false;
    }
    const widgets = runtime.listWidgets();
    let changed = false;
    for (const widget of widgets) {
      if (!widget || !isWidgetDocked(widget)) {
        continue;
      }
      if (applyToWidget(widget, { viewportRect })) {
        changed = true;
      }
    }
    return changed;
  }

  function dockWidgetToSide(widget, side, pointerClientY = null) {
    if (!widget || (side !== "left" && side !== "right")) {
      return false;
    }
    const viewportRect = getViewportRect();
    if (!viewportRect) {
      return false;
    }
    const camera = runtime.camera;
    if (!camera) {
      return false;
    }

    const widthPx = clamp(
      viewportRect.width * WIDTH_RATIO,
      MIN_WIDTH_PX,
      Math.max(MIN_WIDTH_PX, viewportRect.width - MARGIN_PX * 2),
    );
    const heightPx = clamp(
      viewportRect.height * HEIGHT_RATIO,
      MIN_HEIGHT_PX,
      Math.max(MIN_HEIGHT_PX, viewportRect.height - MARGIN_PX * 2),
    );

    const currentScreen = camera.worldToScreen(widget.position.x, widget.position.y);
    const fallbackTop = currentScreen.y;
    const requestedTop = Number.isFinite(pointerClientY)
      ? pointerClientY - viewportRect.top - heightPx * 0.5
      : fallbackTop;
    const offsetTopPx = Math.max(
      MARGIN_PX,
      Math.min(requestedTop, viewportRect.height - heightPx - MARGIN_PX),
    );

    const metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
    };
    delete metadata.pinned;
    const existingDock = normalizeDockMetadata(metadata.viewportDock);
    const restoreWidthWorld = existingDock?.restoreWidthWorld ?? Math.max(20, Number(widget.size?.width) || 20);
    const restoreHeightWorld =
      existingDock?.restoreHeightWorld ?? Math.max(20, Number(widget.size?.height) || 20);
    metadata.viewportDock = {
      side,
      offsetTopPx,
      widthRatio: WIDTH_RATIO,
      heightRatio: HEIGHT_RATIO,
      restoreWidthWorld,
      restoreHeightWorld,
      view: existingDock?.view ?? { zoom: 1, offsetXWorld: 0, offsetYWorld: 0 },
      version: META_VERSION,
    };
    widget.metadata = metadata;
    runtime.bringWidgetToFront(widget.id);
    runtime.setFocusedWidgetId(widget.id);
    runtime.setSelectedWidgetId(widget.id);
    return applyToWidget(widget, { viewportRect, camera });
  }

  function clearTracking() {
    if (!dragState) {
      setGlowState({ active: false });
      return;
    }
    clearHoldTimer(dragState);
    dragState = null;
    setGlowState({ active: false });
  }

  function beginTracking(payload) {
    if (!payload || payload.mode !== "move" || !payload.widgetId) {
      clearTracking();
      return;
    }
    const initialSide = isPointerOverLibraryLauncher(payload.clientX, payload.clientY)
      ? null
      : getDockSideFromPointer(payload.clientX, payload.clientY);
    dragState = {
      widgetId: payload.widgetId,
      pointerId: Number.isFinite(payload.pointerId) ? payload.pointerId : null,
      side: initialSide,
      armedSide: null,
      holdTimer: null,
    };
    if (initialSide) {
      dragState.holdTimer = windowObj.setTimeout(() => {
        if (!dragState || dragState.side !== initialSide) {
          return;
        }
        dragState.armedSide = initialSide;
        setGlowState({
          active: true,
          overLeft: initialSide === "left",
          overRight: initialSide === "right",
          armedLeft: initialSide === "left",
          armedRight: initialSide === "right",
        });
      }, HOLD_MS);
    }
    setGlowState({
      active: true,
      overLeft: initialSide === "left",
      overRight: initialSide === "right",
      armedLeft: false,
      armedRight: false,
    });
  }

  function updateTracking(payload) {
    if (!dragState || !payload || payload.phase !== "move") {
      return;
    }
    if (payload.widgetId !== dragState.widgetId) {
      return;
    }
    const nextSide = isPointerOverLibraryLauncher(payload.clientX, payload.clientY)
      ? null
      : getDockSideFromPointer(payload.clientX, payload.clientY);
    if (nextSide !== dragState.side) {
      clearHoldTimer(dragState);
      dragState.side = nextSide;
      dragState.armedSide = null;
      if (nextSide) {
        dragState.holdTimer = windowObj.setTimeout(() => {
          if (!dragState || dragState.side !== nextSide) {
            return;
          }
          dragState.armedSide = nextSide;
          setGlowState({
            active: true,
            overLeft: nextSide === "left",
            overRight: nextSide === "right",
            armedLeft: nextSide === "left",
            armedRight: nextSide === "right",
          });
        }, HOLD_MS);
      }
    }
    setGlowState({
      active: true,
      overLeft: nextSide === "left",
      overRight: nextSide === "right",
      armedLeft: dragState.armedSide === "left",
      armedRight: dragState.armedSide === "right",
    });
  }

  function endTracking(payload) {
    if (!dragState || !payload || payload.phase !== "end") {
      clearTracking();
      return null;
    }
    const state = { ...dragState };
    clearTracking();
    if (payload.widgetId !== state.widgetId) {
      return null;
    }
    if (isPointerOverLibraryLauncher(payload.clientX, payload.clientY)) {
      return null;
    }
    const releaseSide = getDockSideFromPointer(payload.clientX, payload.clientY);
    if (!releaseSide || releaseSide !== state.armedSide) {
      return null;
    }
    return releaseSide;
  }

  function onWidgetDragState(payload) {
    if (!payload || !payload.widgetId) {
      return;
    }
    if (payload.mode !== "move") {
      if (payload.phase === "start" || payload.phase === "end") {
        clearTracking();
      }
      return;
    }
    if (payload.phase === "start") {
      beginTracking(payload);
      return;
    }
    if (payload.phase === "move") {
      updateTracking(payload);
      return;
    }
    if (payload.phase !== "end") {
      return;
    }
    const dockSide = endTracking(payload);
    if (!dockSide) {
      return;
    }
    const widget = runtime.getWidgetById(payload.widgetId);
    if (!widget) {
      return;
    }
    const changed = dockWidgetToSide(widget, dockSide, payload.clientY);
    if (!changed) {
      return;
    }
    if (typeof onDockCommitted === "function") {
      onDockCommitted({ widget, side: dockSide, payload });
    }
  }

  function destroy() {
    clearTracking();
    if (glowLeft instanceof HTMLElement) {
      glowLeft.remove();
    }
    if (glowRight instanceof HTMLElement) {
      glowRight.remove();
    }
    glowLeft = null;
    glowRight = null;
  }

  return {
    syncLayout,
    onWidgetDragState,
    applyToWidget,
    applyToAllWidgets,
    normalizeDockMetadata,
    isWidgetDocked,
    clearTracking,
    destroy,
  };
}
