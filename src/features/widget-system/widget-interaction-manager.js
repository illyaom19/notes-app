import { fillPill, strokeRoundedRect } from "../../core/canvas/rounded.js";

const HEADER_HEIGHT_PX = 34;
const CONTROL_SIZE_PX = 24;
const RESIZE_HANDLE_PX = 24;
const CONTROL_PADDING_PX = 6;

function worldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

function worldSizeForPixels(camera, pixels) {
  return pixels / Math.max(0.25, camera.zoom);
}

function rectContains(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function interactionFlags(widget) {
  if (typeof widget.getInteractionFlags === "function") {
    return widget.getInteractionFlags();
  }

  const source = widget.interactionFlags && typeof widget.interactionFlags === "object"
    ? widget.interactionFlags
    : {};

  return {
    movable: source.movable !== false,
    resizable: source.resizable !== false,
    collapsible: source.collapsible !== false,
  };
}

function widgetBounds(widget) {
  if (typeof widget.getInteractionBounds === "function") {
    const bounds = widget.getInteractionBounds();
    return {
      x: widget.position.x,
      y: widget.position.y,
      width: Math.max(20, bounds.width),
      height: Math.max(20, bounds.height),
    };
  }

  return {
    x: widget.position.x,
    y: widget.position.y,
    width: Math.max(20, widget.size.width),
    height: Math.max(20, widget.size.height),
  };
}

function controlRects(widget, camera) {
  const bounds = widgetBounds(widget);
  const headerHeight = Math.min(bounds.height, worldSizeForPixels(camera, HEADER_HEIGHT_PX));
  const controlSize = Math.min(headerHeight, worldSizeForPixels(camera, CONTROL_SIZE_PX));
  const handleSize = worldSizeForPixels(camera, RESIZE_HANDLE_PX);
  const pad = worldSizeForPixels(camera, CONTROL_PADDING_PX);

  return {
    bounds,
    header: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: headerHeight,
    },
    collapse: {
      x: bounds.x + bounds.width - controlSize - pad,
      y: bounds.y + pad,
      width: controlSize,
      height: controlSize,
    },
    resize: {
      x: bounds.x + bounds.width - handleSize,
      y: bounds.y + bounds.height - handleSize,
      width: handleSize,
      height: handleSize,
    },
  };
}

function mutateWidgetPosition(widget, dx, dy) {
  if (typeof widget.moveBy === "function") {
    widget.moveBy(dx, dy);
    return;
  }

  widget.position.x += dx;
  widget.position.y += dy;
}

function mutateWidgetSize(widget, dx, dy) {
  if (typeof widget.resizeBy === "function") {
    widget.resizeBy(dx, dy);
    return;
  }

  if (typeof widget.resizeFromCorner === "function") {
    widget.resizeFromCorner(dx, dy);
    return;
  }

  widget.size.width = Math.max(120, widget.size.width + dx);
  widget.size.height = Math.max(80, widget.size.height + dy);
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function createWidgetInteractionManager({ runtime, onWidgetMutated }) {
  const dragState = {
    pointerId: null,
    widgetId: null,
    mode: null,
    lastWorld: null,
  };

  const manager = {
    onPointerDown(event, context) {
      if (event.pointerType === "pen") {
        return false;
      }

      if (event.button !== 0) {
        return false;
      }

      const camera = context.camera;
      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget) {
        runtime.setFocusedWidgetId(null);
        runtime.setSelectedWidgetId(null);
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      runtime.setFocusedWidgetId(widget.id);
      runtime.setSelectedWidgetId(widget.id);

      const flags = interactionFlags(widget);
      const point = worldPoint(event, camera);
      const rects = controlRects(widget, camera);

      if (flags.collapsible && rectContains(rects.collapse, point.x, point.y)) {
        widget.setCollapsed(!widget.collapsed);
        onWidgetMutated(widget);
        return true;
      }

      if (flags.resizable && rectContains(rects.resize, point.x, point.y)) {
        dragState.pointerId = event.pointerId;
        dragState.widgetId = widget.id;
        dragState.mode = "resize";
        dragState.lastWorld = point;
        return true;
      }

      if (flags.movable && rectContains(rects.header, point.x, point.y)) {
        dragState.pointerId = event.pointerId;
        dragState.widgetId = widget.id;
        dragState.mode = "move";
        dragState.lastWorld = point;
        return true;
      }

      // Body taps still select/focus the widget, but camera pan/pinch should continue to work.
      return false;
    },

    onPointerMove(event, context) {
      if (dragState.pointerId !== event.pointerId || !dragState.widgetId || !dragState.mode) {
        return false;
      }

      const widget = runtime.getWidgetById(dragState.widgetId);
      if (!widget) {
        dragState.pointerId = null;
        dragState.widgetId = null;
        dragState.mode = null;
        dragState.lastWorld = null;
        return false;
      }

      const point = worldPoint(event, context.camera);
      const dx = point.x - dragState.lastWorld.x;
      const dy = point.y - dragState.lastWorld.y;
      dragState.lastWorld = point;

      if (dragState.mode === "move") {
        mutateWidgetPosition(widget, dx, dy);
      } else if (dragState.mode === "resize") {
        mutateWidgetSize(widget, dx, dy);
      }

      onWidgetMutated(widget);
      return true;
    },

    onPointerUp(event) {
      if (dragState.pointerId !== event.pointerId) {
        return false;
      }

      dragState.pointerId = null;
      dragState.widgetId = null;
      dragState.mode = null;
      dragState.lastWorld = null;
      return true;
    },

    onPointerCancel(event) {
      return this.onPointerUp(event);
    },
  };

  const detachInput = runtime.registerInputHandler(manager);

  const overlay = {
    render(ctx, camera) {
      const selectedId = runtime.getSelectedWidgetId();
      if (!selectedId) {
        return;
      }

      const widget = runtime.getWidgetById(selectedId);
      if (!widget) {
        runtime.setSelectedWidgetId(null);
        return;
      }

      const flags = interactionFlags(widget);
      const rects = controlRects(widget, camera);
      const screen = camera.worldToScreen(rects.bounds.x, rects.bounds.y);
      const screenW = rects.bounds.width * camera.zoom;
      const screenH = rects.bounds.height * camera.zoom;

      strokeRoundedRect(ctx, screen.x - 2, screen.y - 2, screenW + 4, screenH + 4, 14, "#2f7daf", 1.5);

      if (flags.collapsible) {
        const collapseScreen = camera.worldToScreen(rects.collapse.x, rects.collapse.y);
        const collapseW = rects.collapse.width * camera.zoom;
        const collapseH = rects.collapse.height * camera.zoom;

        fillPill(ctx, collapseScreen.x, collapseScreen.y, collapseW, collapseH, "rgba(24, 78, 118, 0.9)");
        ctx.fillStyle = "#f2f8fc";
        ctx.font = `${Math.max(10, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
        ctx.fillText(widget.collapsed ? "+" : "-", collapseScreen.x + 7 * camera.zoom, collapseScreen.y + 15 * camera.zoom);
      }

      if (flags.resizable) {
        const resizeScreen = camera.worldToScreen(rects.resize.x, rects.resize.y);
        const resizeW = rects.resize.width * camera.zoom;
        const resizeH = rects.resize.height * camera.zoom;

        fillPill(ctx, resizeScreen.x, resizeScreen.y, resizeW, resizeH, "rgba(32, 95, 142, 0.9)");
        ctx.fillStyle = "#f0f8fd";
        ctx.font = `${Math.max(9, 10 * camera.zoom)}px IBM Plex Sans, sans-serif`;
        ctx.fillText("[]", resizeScreen.x + 4 * camera.zoom, resizeScreen.y + 14 * camera.zoom);
      }
    },
  };

  const detachOverlay = runtime.registerOverlayLayer(overlay);

  const handleKeyDown = (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    const selectedId = runtime.getSelectedWidgetId();
    if (!selectedId) {
      return;
    }

    const selected = runtime.getWidgetById(selectedId);
    if (!selected) {
      runtime.setSelectedWidgetId(null);
      runtime.setFocusedWidgetId(null);
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "escape") {
      runtime.setSelectedWidgetId(null);
      runtime.setFocusedWidgetId(null);
      return;
    }

    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      runtime.removeWidgetById(selected.id);
      runtime.setSelectedWidgetId(null);
      runtime.setFocusedWidgetId(null);
      onWidgetMutated();
      return;
    }

    if (key === "c") {
      event.preventDefault();
      if (interactionFlags(selected).collapsible) {
        selected.setCollapsed(!selected.collapsed);
        onWidgetMutated(selected);
      }
      return;
    }

    if (key === "]") {
      event.preventDefault();
      runtime.bringWidgetToFront(selected.id);
      runtime.setFocusedWidgetId(selected.id);
      runtime.setSelectedWidgetId(selected.id);
      onWidgetMutated(selected);
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  return {
    dispose() {
      detachInput();
      detachOverlay();
      window.removeEventListener("keydown", handleKeyDown);
    },
  };
}
