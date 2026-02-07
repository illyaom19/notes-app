const LONG_PRESS_MS = 480;
const MOVE_THRESHOLD_PX = 10;

export function createWidgetContextMenu({
  canvas,
  menuElement,
  runtime,
  onCreateExpanded,
  onWidgetMutated,
}) {
  if (!menuElement) {
    return { dispose: () => {} };
  }

  let longPressTimer = null;
  let pointerStart = null;
  let pendingPointerId = null;
  let activeWidgetId = null;

  const createButton = menuElement.querySelector('[data-action="create-expanded"]');
  const toggleButton = menuElement.querySelector('[data-action="toggle-collapse"]');
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
    activeWidgetId = widget?.id ?? null;

    const canActOnWidget = Boolean(widget);
    if (toggleButton) {
      toggleButton.disabled = !canActOnWidget;
      toggleButton.textContent = widget?.collapsed ? "Expand Widget" : "Collapse Widget";
    }
    if (removeButton) {
      removeButton.disabled = !canActOnWidget;
    }

    const maxX = window.innerWidth - 240;
    const maxY = window.innerHeight - 160;
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

  const startLongPress = (event) => {
    if (event.pointerType === "pen") {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const targetWidget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      screenX: event.clientX,
      screenY: event.clientY,
      widgetId: targetWidget?.id ?? null,
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

    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (moved >= MOVE_THRESHOLD_PX) {
      clearLongPress();
    }
  };

  const endLongPress = (event) => {
    if (pendingPointerId === event.pointerId) {
      clearLongPress();
    }
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
    openMenuAt(event.clientX, event.clientY, widget);
  };

  const handleMenuClick = async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const activeWidget = getActiveWidget();

    if (action === "create-expanded") {
      await onCreateExpanded(activeWidget ?? null);
      closeMenu();
      return;
    }

    if (action === "toggle-collapse" && activeWidget) {
      activeWidget.setCollapsed(!activeWidget.collapsed);
      onWidgetMutated();
      closeMenu();
      return;
    }

    if (action === "remove-widget" && activeWidget) {
      runtime.removeWidgetById(activeWidget.id);
      onWidgetMutated();
      closeMenu();
    }
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

  menuElement.addEventListener("click", (event) => {
    void handleMenuClick(event);
  });
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
