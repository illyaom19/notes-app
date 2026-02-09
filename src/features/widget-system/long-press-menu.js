const LONG_PRESS_MS = 520;
const MOVE_THRESHOLD_PX = 10;

function isLibraryEligible(widget) {
  if (!widget) {
    return false;
  }
  return widget.type === "reference-popup" || widget.type === "pdf-document" || widget.type === "expanded-area";
}

function isWidgetInLibrary(widget) {
  if (!widget) {
    return false;
  }

  if (widget.type === "reference-popup") {
    return typeof widget.metadata?.librarySourceId === "string" && widget.metadata.librarySourceId.trim();
  }

  if (widget.type === "pdf-document") {
    return typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim();
  }

  if (widget.type === "expanded-area") {
    return typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim();
  }

  return false;
}

function isWidgetPinned(widget) {
  return Boolean(widget?.metadata?.pinned);
}

export function createWidgetContextMenu({
  canvas,
  menuElement,
  runtime,
  onCopyWidget,
  onRenameWidget,
  onToggleLibrary,
  onTogglePin,
  onShowWidgetInfo,
  onWidgetMutated,
}) {
  if (!menuElement) {
    return { dispose: () => {} };
  }

  let longPressTimer = null;
  let pointerStart = null;
  let pendingPointerId = null;
  let activeWidgetId = null;
  const activeTouchIds = new Set();
  let lastPointerDown = {
    pointerType: null,
    pointerId: null,
    button: null,
    at: 0,
  };

  const copyButton = menuElement.querySelector('[data-action="copy-widget"]');
  const renameButton = menuElement.querySelector('[data-action="rename-widget"]');
  const libraryButton = menuElement.querySelector('[data-action="toggle-library"]');
  const pinButton = menuElement.querySelector('[data-action="toggle-pin"]');
  const infoButton = menuElement.querySelector('[data-action="widget-info"]');
  const removeButton = menuElement.querySelector('[data-action="remove-widget"]');

  const closeMenu = () => {
    activeWidgetId = null;
    menuElement.dataset.open = "false";
    menuElement.style.left = "-9999px";
    menuElement.style.top = "-9999px";
  };

  const getActiveWidget = () => {
    if (!activeWidgetId) {
      return null;
    }
    return runtime.getWidgetById(activeWidgetId);
  };

  const openMenuAt = (screenX, screenY, widget) => {
    if (!widget) {
      closeMenu();
      return;
    }

    activeWidgetId = widget.id;

    const canActOnWidget = true;
    const canLibrary = isLibraryEligible(widget);
    const inLibrary = canLibrary && isWidgetInLibrary(widget);
    const pinned = isWidgetPinned(widget);

    if (copyButton) {
      copyButton.disabled = !canActOnWidget;
    }
    if (renameButton) {
      renameButton.disabled = !canActOnWidget;
    }
    if (libraryButton) {
      libraryButton.disabled = !canLibrary;
      libraryButton.textContent = inLibrary ? "Remove From Library" : "Add To Library";
    }
    if (pinButton) {
      pinButton.disabled = !canActOnWidget;
      pinButton.textContent = pinned ? "Unpin" : "Pin";
    }
    if (infoButton) {
      infoButton.disabled = !canActOnWidget;
    }
    if (removeButton) {
      removeButton.disabled = !canActOnWidget;
    }

    const maxX = window.innerWidth - 280;
    const maxY = window.innerHeight - 220;
    const nextX = Math.max(8, Math.min(screenX + 8, maxX));
    const nextY = Math.max(8, Math.min(screenY + 8, maxY));

    menuElement.style.left = `${nextX}px`;
    menuElement.style.top = `${nextY}px`;
    menuElement.dataset.open = "true";
  };

  const clearLongPress = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    pointerStart = null;
    pendingPointerId = null;
  };

  const focusedOrSelectedWidget = () => {
    const widgetId = runtime.getFocusedWidgetId?.() ?? runtime.getSelectedWidgetId?.() ?? null;
    return widgetId ? runtime.getWidgetById(widgetId) : null;
  };

  const startLongPress = (event) => {
    lastPointerDown = {
      pointerType: event.pointerType ?? null,
      pointerId: event.pointerId ?? null,
      button: typeof event.button === "number" ? event.button : null,
      at: Date.now(),
    };

    if (event.pointerType !== "touch" || event.button !== 0) {
      return;
    }

    activeTouchIds.add(event.pointerId);
    if (activeTouchIds.size > 1) {
      clearLongPress();
      return;
    }

    const targetWidget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
    if (!targetWidget) {
      clearLongPress();
      return;
    }

    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      screenX: event.clientX,
      screenY: event.clientY,
      widgetId: targetWidget.id,
    };
    pendingPointerId = event.pointerId;

    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      const widget = pointerStart?.widgetId
        ? runtime.getWidgetById(pointerStart.widgetId)
        : null;
      openMenuAt(pointerStart.screenX, pointerStart.screenY, widget);
    }, LONG_PRESS_MS);
  };

  const maybeCancelLongPress = (event) => {
    if (!pointerStart || pendingPointerId !== event.pointerId) {
      return;
    }

    if (event.pointerType === "touch" && activeTouchIds.size > 1) {
      clearLongPress();
      return;
    }

    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (moved >= MOVE_THRESHOLD_PX) {
      clearLongPress();
    }
  };

  const endLongPress = (event) => {
    if (event.pointerType === "touch") {
      activeTouchIds.delete(event.pointerId);
    }

    if (pendingPointerId === event.pointerId) {
      clearLongPress();
    }
  };

  const handleContextMenu = (event) => {
    const hasScreenPoint =
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY) &&
      (event.clientX !== 0 || event.clientY !== 0);
    const recentMouseRightClick =
      Date.now() - lastPointerDown.at < 700 &&
      lastPointerDown.pointerType === "mouse" &&
      lastPointerDown.button === 2;

    // Prevent native OS context menus on touch/pen long press.
    event.preventDefault();
    if (!recentMouseRightClick && hasScreenPoint) {
      return;
    }

    let widget = null;
    let openX = event.clientX;
    let openY = event.clientY;

    if (recentMouseRightClick) {
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      widget = runtime.pickWidgetAtScreenPoint(offsetX, offsetY);
    } else {
      widget = focusedOrSelectedWidget();
      if (widget) {
        const bounds =
          typeof widget.getInteractionBounds === "function"
            ? widget.getInteractionBounds(runtime.camera)
            : widget.size;
        const center = runtime.camera.worldToScreen(
          widget.position.x + Math.max(1, bounds.width) / 2,
          widget.position.y + Math.max(1, bounds.height) / 2,
        );
        openX = center.x;
        openY = center.y;
      }
    }

    if (!widget) {
      closeMenu();
      return;
    }

    openMenuAt(openX, openY, widget);
  };

  const handleMenuClick = async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const activeWidget = getActiveWidget();

    if (action === "copy-widget" && activeWidget) {
      await onCopyWidget?.(activeWidget);
      closeMenu();
      return;
    }

    if (action === "rename-widget" && activeWidget) {
      await onRenameWidget?.(activeWidget);
      closeMenu();
      return;
    }

    if (action === "toggle-library" && activeWidget) {
      await onToggleLibrary?.(activeWidget);
      closeMenu();
      return;
    }

    if (action === "toggle-pin" && activeWidget) {
      await onTogglePin?.(activeWidget);
      closeMenu();
      return;
    }

    if (action === "widget-info" && activeWidget) {
      await onShowWidgetInfo?.(activeWidget);
      closeMenu();
      return;
    }

    if (action === "remove-widget" && activeWidget) {
      runtime.removeWidgetById(activeWidget.id, { reason: "user-delete" });
      onWidgetMutated?.();
      closeMenu();
    }
  };

  const onMenuClick = (event) => {
    void handleMenuClick(event);
  };

  const closeIfOutside = (event) => {
    if (menuElement.dataset.open !== "true") {
      return;
    }

    const target = event.target;
    if (target instanceof Node && menuElement.contains(target)) {
      return;
    }
    closeMenu();
  };

  menuElement.addEventListener("click", onMenuClick);
  canvas.addEventListener("pointerdown", startLongPress);
  canvas.addEventListener("pointermove", maybeCancelLongPress);
  canvas.addEventListener("pointerup", endLongPress);
  canvas.addEventListener("pointercancel", endLongPress);
  canvas.addEventListener("contextmenu", handleContextMenu);
  window.addEventListener("pointerdown", closeIfOutside);
  window.addEventListener("resize", closeMenu);

  closeMenu();

  return {
    dispose() {
      clearLongPress();
      closeMenu();
      menuElement.removeEventListener("click", onMenuClick);
      canvas.removeEventListener("pointerdown", startLongPress);
      canvas.removeEventListener("pointermove", maybeCancelLongPress);
      canvas.removeEventListener("pointerup", endLongPress);
      canvas.removeEventListener("pointercancel", endLongPress);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("pointerdown", closeIfOutside);
      window.removeEventListener("resize", closeMenu);
    },
  };
}
