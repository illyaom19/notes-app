const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE_PX = 24;

function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

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

  let lastTap = null;
  let pendingAnchor = null;
  let pendingSourceWidgetId = null;

  const closeMenu = () => {
    pendingAnchor = null;
    pendingSourceWidgetId = null;
    menuElement.dataset.open = "false";
    menuElement.style.left = "-9999px";
    menuElement.style.top = "-9999px";
  };

  const openMenuAt = ({ screenX, screenY, anchor, sourceWidgetId }) => {
    pendingAnchor = {
      x: anchor.x,
      y: anchor.y,
    };
    pendingSourceWidgetId = sourceWidgetId ?? null;

    const maxX = window.innerWidth - 260;
    const maxY = window.innerHeight - 220;
    const nextX = Math.max(10, Math.min(screenX + 10, maxX));
    const nextY = Math.max(10, Math.min(screenY + 10, maxY));

    menuElement.style.left = `${nextX}px`;
    menuElement.style.top = `${nextY}px`;
    menuElement.dataset.open = "true";
  };

  const inputManager = {
    onPointerDown(event, { camera }) {
      if (event.pointerType === "pen") {
        return false;
      }

      if (event.button !== 0) {
        return false;
      }

      const now = performance.now();
      const currentTap = {
        at: now,
        x: event.clientX,
        y: event.clientY,
      };

      const isSecondTap =
        lastTap &&
        now - lastTap.at <= DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= DOUBLE_TAP_DISTANCE_PX;

      lastTap = currentTap;

      if (!isSecondTap) {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      const anchor = camera.screenToWorld(event.offsetX, event.offsetY);
      openMenuAt({
        screenX: event.clientX,
        screenY: event.clientY,
        anchor,
        sourceWidgetId: widget?.id ?? null,
      });
      return true;
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

    const target = event.target;
    if (target instanceof Node && menuElement.contains(target)) {
      return;
    }

    if (target === canvas) {
      return;
    }

    closeMenu();
  };

  const onWindowKeyDown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
      return;
    }

    if (event.key.toLowerCase() !== "n") {
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    event.preventDefault();
    const widgetId = runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null;
    const anchor = runtime.camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
    openMenuAt({
      screenX: canvas.getBoundingClientRect().left + canvas.clientWidth / 2,
      screenY: canvas.getBoundingClientRect().top + canvas.clientHeight / 2,
      anchor,
      sourceWidgetId: widgetId,
    });
  };

  menuElement.addEventListener("click", onMenuClick);
  window.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("keydown", onWindowKeyDown);
  window.addEventListener("resize", closeMenu);

  closeMenu();

  return {
    dispose() {
      detachInput();
      menuElement.removeEventListener("click", onMenuClick);
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("resize", closeMenu);
      closeMenu();
    },
  };
}
