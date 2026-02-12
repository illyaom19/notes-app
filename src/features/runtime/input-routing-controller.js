export function createInputRoutingController({
  windowObj = window,
  documentObj = document,
  canvas,
  isTypingTarget,
  isInkToolDropdownOpen,
  setInkToolDropdownOpen,
  isWithinInkToolDropdown,
  isInkStyleDropdownOpen,
  setInkStyleDropdownOpen,
  isWithinInkStyleDropdown,
  isToolsPanelOpen,
  isTargetInsideToolsUi,
  closeToolsPanel,
  onWindowResize,
  onViewportSyncRequested,
  onInkCursorPointerEvent,
  onInkCursorHide,
} = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Input routing controller requires a canvas element.");
  }
  if (typeof isTypingTarget !== "function") {
    throw new Error("Input routing controller requires isTypingTarget.");
  }

  let attached = false;
  let lastTouchLikeInteractionAt = 0;
  const detachFns = [];

  const markTouchLikeInteraction = () => {
    lastTouchLikeInteractionAt = Date.now();
  };

  const bind = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    detachFns.push(() => {
      target.removeEventListener(type, handler, options);
    });
  };

  const onTouchLikePointerDownCapture = (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      markTouchLikeInteraction();
    }
  };

  const onTouchStartCapture = () => {
    markTouchLikeInteraction();
  };

  const onContextMenuCapture = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isTypingTarget(target)) {
      return;
    }

    const isMouseSecondaryAction = event.button === 2 || event.which === 3;
    const fromTouchInput =
      event.pointerType === "touch" ||
      event.pointerType === "pen" ||
      Boolean(event.sourceCapabilities?.firesTouchEvents);
    const isRecentTouch = Date.now() - lastTouchLikeInteractionAt < 700;
    if (isMouseSecondaryAction && !fromTouchInput) {
      return;
    }
    if (!fromTouchInput && !isRecentTouch) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const onSelectStartCapture = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (isTypingTarget(target)) {
      return;
    }
    event.preventDefault();
  };

  const onWindowPointerDown = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (isInkToolDropdownOpen?.() && !isWithinInkToolDropdown?.(target)) {
      setInkToolDropdownOpen?.(false);
    }
    if (isInkStyleDropdownOpen?.() && !isWithinInkStyleDropdown?.(target)) {
      setInkStyleDropdownOpen?.(false);
    }

    if (isToolsPanelOpen?.()) {
      if (isTargetInsideToolsUi?.(target)) {
        return;
      }
      closeToolsPanel?.();
    }
  };

  const onWindowKeyDown = (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (isInkToolDropdownOpen?.()) {
      setInkToolDropdownOpen?.(false);
    }
    if (isInkStyleDropdownOpen?.()) {
      setInkStyleDropdownOpen?.(false);
    }
  };

  const onResize = () => {
    onWindowResize?.();
    onViewportSyncRequested?.();
  };

  const onOrientationChange = () => {
    onViewportSyncRequested?.();
  };

  const onCanvasPointerMove = (event) => {
    onInkCursorPointerEvent?.(event);
  };
  const onCanvasPointerUp = (event) => {
    onInkCursorPointerEvent?.(event);
  };
  const onCanvasPointerLeave = () => {
    onInkCursorHide?.();
  };
  const onCanvasPointerCancel = () => {
    onInkCursorHide?.();
  };

  function attach() {
    if (attached) {
      return;
    }
    attached = true;

    bind(windowObj, "pointerdown", onTouchLikePointerDownCapture, {
      capture: true,
      passive: true,
    });
    bind(windowObj, "touchstart", onTouchStartCapture, {
      capture: true,
      passive: true,
    });
    bind(windowObj, "contextmenu", onContextMenuCapture, { capture: true });
    bind(documentObj, "selectstart", onSelectStartCapture, { capture: true });
    bind(windowObj, "pointerdown", onWindowPointerDown);
    bind(windowObj, "keydown", onWindowKeyDown);
    bind(windowObj, "resize", onResize);
    bind(windowObj, "orientationchange", onOrientationChange);

    bind(canvas, "pointermove", onCanvasPointerMove, { passive: true });
    bind(canvas, "pointerleave", onCanvasPointerLeave, { passive: true });
    bind(canvas, "pointerup", onCanvasPointerUp, { passive: true });
    bind(canvas, "pointercancel", onCanvasPointerCancel, { passive: true });

    if (windowObj.visualViewport) {
      bind(windowObj.visualViewport, "resize", onViewportSyncRequested, { passive: true });
      bind(windowObj.visualViewport, "scroll", onViewportSyncRequested, { passive: true });
    }
  }

  function detach() {
    if (!attached) {
      return;
    }
    attached = false;
    while (detachFns.length > 0) {
      const off = detachFns.pop();
      try {
        off();
      } catch (_error) {
        // Ignore detach failures during teardown.
      }
    }
  }

  return {
    attach,
    detach,
    isAttached: () => attached,
  };
}
