const HOLD_TO_OPEN_MS = 420;
const MOVE_THRESHOLD_PX = 8;

export function createWidgetCreationController({
  runtime,
  canvas,
  menuElement,
  onCreateIntent,
  getActiveContextId,
}) {
  if (!menuElement) {
    return { dispose: () => {} };
  }

  let holdTimer = null;
  let pointerState = null;
  const activeTouchPointerIds = new Set();
  let menuPointerId = null;
  let pendingAnchor = null;
  let pendingSourceWidgetId = null;
  let activeCreateType = null;
  let lastPointerDown = {
    pointerType: null,
    pointerId: null,
    button: null,
    at: 0,
  };

  function clearHoldTimer() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function cancelPendingHoldForPointer(pointerId) {
    if (!pointerState || pointerState.pointerId !== pointerId) {
      return;
    }
    clearHoldTimer();
    pointerState = null;
  }

  function closeMenu() {
    clearHoldTimer();
    menuPointerId = null;
    pointerState = null;
    pendingAnchor = null;
    pendingSourceWidgetId = null;
    activeCreateType = null;
    menuElement.dataset.open = "false";
    menuElement.style.left = "-9999px";
    menuElement.style.top = "-9999px";

    for (const button of menuElement.querySelectorAll("button[data-create-type]")) {
      if (button instanceof HTMLButtonElement) {
        button.dataset.active = "false";
      }
    }
  }

  function buttonAtClientPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const button = element.closest("button[data-create-type]");
    return button instanceof HTMLButtonElement ? button : null;
  }

  function setActiveButton(button) {
    const nextType = button?.dataset.createType ?? null;
    activeCreateType = nextType;

    for (const entry of menuElement.querySelectorAll("button[data-create-type]")) {
      if (!(entry instanceof HTMLButtonElement)) {
        continue;
      }

      entry.dataset.active = entry === button ? "true" : "false";
    }
  }

  function openMenuAt({ clientX, clientY, anchor, sourceWidgetId, pointerId }) {
    pendingAnchor = {
      x: anchor.x,
      y: anchor.y,
    };
    pendingSourceWidgetId = sourceWidgetId ?? null;
    menuPointerId = pointerId;

    menuElement.dataset.mode = "radial";
    menuElement.dataset.open = "true";

    // Keep menu centered around hold point, then clamp inside viewport.
    const diameter = 248;
    const nextX = Math.max(12, Math.min(clientX - diameter / 2, window.innerWidth - diameter - 12));
    const nextY = Math.max(12, Math.min(clientY - diameter / 2, window.innerHeight - diameter - 12));
    menuElement.style.left = `${nextX}px`;
    menuElement.style.top = `${nextY}px`;
  }

  function openFromPointer(event, camera) {
    if (!pointerState) {
      return;
    }

    if (typeof runtime.captureTouchPointer === "function") {
      runtime.captureTouchPointer(event.pointerId);
    }

    const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
    const anchor = camera.screenToWorld(event.offsetX, event.offsetY);

    openMenuAt({
      clientX: event.clientX,
      clientY: event.clientY,
      anchor,
      sourceWidgetId: widget?.id ?? null,
      pointerId: event.pointerId,
    });

    setActiveButton(buttonAtClientPoint(event.clientX, event.clientY));
  }

  function openFromContextMenu(event, camera) {
    const rect = canvas.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const widget = runtime.pickWidgetAtScreenPoint(offsetX, offsetY);
    const anchor = camera.screenToWorld(offsetX, offsetY);

    openMenuAt({
      clientX: event.clientX,
      clientY: event.clientY,
      anchor,
      sourceWidgetId: widget?.id ?? null,
      pointerId: null,
    });
    setActiveButton(buttonAtClientPoint(event.clientX, event.clientY));
  }

  const inputManager = {
    onPointerDown(event, { camera }) {
      lastPointerDown = {
        pointerType: event.pointerType ?? null,
        pointerId: event.pointerId ?? null,
        button: typeof event.button === "number" ? event.button : null,
        at: Date.now(),
      };

      if (event.pointerType !== "touch") {
        return false;
      }

      activeTouchPointerIds.add(event.pointerId);
      if (activeTouchPointerIds.size > 1) {
        clearHoldTimer();
        pointerState = null;
        if (menuElement.dataset.open === "true") {
          closeMenu();
        }
        return false;
      }

      if (menuElement.dataset.open === "true") {
        return true;
      }

      pointerState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        camera,
      };

      clearHoldTimer();
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        if (!pointerState || pointerState.pointerId !== event.pointerId) {
          return;
        }
        openFromPointer(event, camera);
      }, HOLD_TO_OPEN_MS);

      return false;
    },

    onPointerMove(event) {
      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return false;
      }

      pointerState.lastClientX = event.clientX;
      pointerState.lastClientY = event.clientY;

      const moved = Math.hypot(
        pointerState.lastClientX - pointerState.startClientX,
        pointerState.lastClientY - pointerState.startClientY,
      );

      if (menuElement.dataset.open === "true") {
        setActiveButton(buttonAtClientPoint(event.clientX, event.clientY));
        return true;
      }

      if (moved >= MOVE_THRESHOLD_PX) {
        cancelPendingHoldForPointer(event.pointerId);
      }

      return false;
    },

    onPointerUp(event) {
      if (event.pointerType === "touch") {
        activeTouchPointerIds.delete(event.pointerId);
      }

      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return false;
      }

      clearHoldTimer();

      if (menuElement.dataset.open === "true") {
        const button = buttonAtClientPoint(event.clientX, event.clientY);
        const type = button?.dataset.createType ?? activeCreateType;

        if (type && pendingAnchor) {
          onCreateIntent?.({
            type,
            anchor: { ...pendingAnchor },
            sourceWidgetId: pendingSourceWidgetId,
            contextId: getActiveContextId?.() ?? null,
            createdFrom: "manual",
          });
        }

        closeMenu();
        return true;
      }

      pointerState = null;
      return false;
    },

    onPointerCancel(event) {
      if (event.pointerType === "touch") {
        activeTouchPointerIds.delete(event.pointerId);
      }

      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return false;
      }

      closeMenu();
      return false;
    },
  };

  const detachInput = runtime.registerInputHandler(inputManager);

  const onMenuClick = (event) => {
    const button = event.target.closest("button[data-create-type]");
    if (!button || !pendingAnchor) {
      return;
    }

    const type = button.dataset.createType;
    if (!type) {
      return;
    }

    onCreateIntent?.({
      type,
      anchor: { ...pendingAnchor },
      sourceWidgetId: pendingSourceWidgetId,
      contextId: getActiveContextId?.() ?? null,
      createdFrom: "manual",
    });

    closeMenu();
  };

  const onWindowPointerDown = (event) => {
    if (menuElement.dataset.open !== "true") {
      return;
    }

    if (menuPointerId === event.pointerId) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && menuElement.contains(target)) {
      return;
    }

    closeMenu();
  };

  // Touch pointers used for camera pan/pinch are handled directly by runtime and
  // do not pass through onPointerMove handlers. Watch raw moves so hold-open only
  // triggers when the touch point truly stays stationary.
  const onCanvasPointerMove = (event) => {
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    if (event.pointerType !== "touch") {
      return;
    }

    const moved = Math.hypot(
      event.clientX - pointerState.startClientX,
      event.clientY - pointerState.startClientY,
    );
    if (moved >= MOVE_THRESHOLD_PX) {
      cancelPendingHoldForPointer(event.pointerId);
    }
  };

  const onCanvasPointerEnd = (event) => {
    if (event.pointerType !== "touch") {
      return;
    }
    cancelPendingHoldForPointer(event.pointerId);
  };

  const onWindowKeyDown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  };

  const onCanvasContextMenu = (event) => {
    const pointerType = event.pointerType ?? null;
    const fromMousePointer = pointerType === "mouse";
    const recentMouseRightClick =
      Date.now() - lastPointerDown.at < 700 &&
      lastPointerDown.pointerType === "mouse" &&
      lastPointerDown.button === 2;

    if (!fromMousePointer && !recentMouseRightClick) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    closeMenu();
    openFromContextMenu(event, runtime.camera);
  };

  menuElement.addEventListener("click", onMenuClick);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);
  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
  canvas.addEventListener("pointerup", onCanvasPointerEnd, { passive: true });
  canvas.addEventListener("pointercancel", onCanvasPointerEnd, { passive: true });
  window.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("keydown", onWindowKeyDown);
  window.addEventListener("resize", closeMenu);

  closeMenu();

  return {
    dispose() {
      detachInput();
      menuElement.removeEventListener("click", onMenuClick);
      canvas.removeEventListener("contextmenu", onCanvasContextMenu);
      canvas.removeEventListener("pointermove", onCanvasPointerMove);
      canvas.removeEventListener("pointerup", onCanvasPointerEnd);
      canvas.removeEventListener("pointercancel", onCanvasPointerEnd);
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("resize", closeMenu);
      closeMenu();
    },
  };
}
