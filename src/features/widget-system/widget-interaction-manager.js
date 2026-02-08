import { fillPill, strokeRoundedRect } from "../../core/canvas/rounded.js";
import { drawControlGlyph, WIDGET_THEME } from "./widget-theme.js";
import { resolveWidgetLod } from "./widget-lod.js";

const HEADER_HEIGHT_PX = 34;
const CONTROL_SIZE_PX = 24;
const RESIZE_HANDLE_PX = 24;
const CONTROL_PADDING_PX = 6;
const TAP_MOVE_THRESHOLD_PX = 8;

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

export function createWidgetInteractionManager({ runtime, canvas, onWidgetMutated }) {
  const dragState = {
    pointerId: null,
    widgetId: null,
    mode: null,
    lastWorld: null,
  };
  const tapState = {
    pointerId: null,
    widgetId: null,
    startClientX: 0,
    startClientY: 0,
    moved: false,
  };
  const activeTouchPointerIds = new Set();

  function clearDragState() {
    dragState.pointerId = null;
    dragState.widgetId = null;
    dragState.mode = null;
    dragState.lastWorld = null;
  }

  function clearTapState() {
    tapState.pointerId = null;
    tapState.widgetId = null;
    tapState.startClientX = 0;
    tapState.startClientY = 0;
    tapState.moved = false;
  }

  function beginTapCandidate(event, widget) {
    tapState.pointerId = event.pointerId;
    tapState.widgetId = widget.id;
    tapState.startClientX = event.clientX;
    tapState.startClientY = event.clientY;
    tapState.moved = false;
  }

  function maybeInvalidateTapCandidate(event) {
    if (tapState.pointerId !== event.pointerId || !tapState.widgetId || tapState.moved) {
      return;
    }

    const movedDistance = Math.hypot(
      event.clientX - tapState.startClientX,
      event.clientY - tapState.startClientY,
    );
    if (movedDistance >= TAP_MOVE_THRESHOLD_PX) {
      tapState.moved = true;
    }
  }

  const manager = {
    onPointerDown(event, context) {
      if (event.pointerType === "pen") {
        return false;
      }

      if (event.pointerType === "touch") {
        activeTouchPointerIds.add(event.pointerId);
        if (activeTouchPointerIds.size > 1) {
          clearTapState();
        }
      }

      if (event.button !== 0) {
        return false;
      }

      const camera = context.camera;
      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget) {
        clearTapState();
        runtime.setFocusedWidgetId(null);
        runtime.setSelectedWidgetId(null);
        return false;
      }

      // Touch should keep camera pan/pinch control even over widgets; use tap-up
      // selection only and avoid capturing widget drag/resize controls.
      if (event.pointerType === "touch") {
        beginTapCandidate(event, widget);
        return false;
      }

      const flags = interactionFlags(widget);
      const point = worldPoint(event, camera);
      const rects = controlRects(widget, camera);

      if (flags.collapsible && rectContains(rects.collapse, point.x, point.y)) {
        clearTapState();
        runtime.bringWidgetToFront(widget.id);
        runtime.setFocusedWidgetId(widget.id);
        runtime.setSelectedWidgetId(widget.id);
        widget.setCollapsed(!widget.collapsed);
        onWidgetMutated(widget);
        return true;
      }

      if (flags.resizable && rectContains(rects.resize, point.x, point.y)) {
        clearTapState();
        runtime.bringWidgetToFront(widget.id);
        runtime.setFocusedWidgetId(widget.id);
        runtime.setSelectedWidgetId(widget.id);
        dragState.pointerId = event.pointerId;
        dragState.widgetId = widget.id;
        dragState.mode = "resize";
        dragState.lastWorld = point;
        return true;
      }

      if (flags.movable && rectContains(rects.header, point.x, point.y)) {
        clearTapState();
        runtime.bringWidgetToFront(widget.id);
        runtime.setFocusedWidgetId(widget.id);
        runtime.setSelectedWidgetId(widget.id);
        dragState.pointerId = event.pointerId;
        dragState.widgetId = widget.id;
        dragState.mode = "move";
        dragState.lastWorld = point;
        return true;
      }

      beginTapCandidate(event, widget);
      return false;
    },

    onPointerMove(event, context) {
      maybeInvalidateTapCandidate(event);

      if (dragState.pointerId !== event.pointerId || !dragState.widgetId || !dragState.mode) {
        return false;
      }

      const widget = runtime.getWidgetById(dragState.widgetId);
      if (!widget) {
        clearDragState();
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
      if (event.pointerType === "touch") {
        activeTouchPointerIds.delete(event.pointerId);
      }

      if (dragState.pointerId === event.pointerId) {
        clearDragState();
        clearTapState();
        return true;
      }

      if (tapState.pointerId === event.pointerId) {
        const selected = tapState.widgetId ? runtime.getWidgetById(tapState.widgetId) : null;
        const shouldSelect = selected && !tapState.moved;
        clearTapState();
        if (shouldSelect) {
          runtime.bringWidgetToFront(selected.id);
          runtime.setFocusedWidgetId(selected.id);
          runtime.setSelectedWidgetId(selected.id);
        }
      }

      return false;
    },

    onPointerCancel(event) {
      if (event.pointerType === "touch") {
        activeTouchPointerIds.delete(event.pointerId);
      }
      if (dragState.pointerId === event.pointerId) {
        clearDragState();
      }
      if (tapState.pointerId === event.pointerId) {
        clearTapState();
      }
      return false;
    },
  };

  const detachInput = runtime.registerInputHandler(manager);
  const handleRawPointerMove = (event) => {
    maybeInvalidateTapCandidate(event);
  };
  const handleRawPointerEnd = (event) => {
    if (event.pointerType === "touch") {
      activeTouchPointerIds.delete(event.pointerId);
    }
    if (tapState.pointerId === event.pointerId && dragState.pointerId !== event.pointerId) {
      clearTapState();
    }
  };
  if (canvas instanceof HTMLCanvasElement) {
    canvas.addEventListener("pointermove", handleRawPointerMove, { passive: true });
    canvas.addEventListener("pointerup", handleRawPointerEnd, { passive: true });
    canvas.addEventListener("pointercancel", handleRawPointerEnd, { passive: true });
  }

  const overlay = {
    render(ctx, camera, renderContext) {
      const selectedId = runtime.getSelectedWidgetId();
      const focusedId = runtime.getFocusedWidgetId();
      const hoveredId = runtime.getHoveredWidgetId?.() ?? null;
      const lod = renderContext?.lod ?? resolveWidgetLod({
        cameraZoom: camera.zoom,
        viewMode: renderContext?.viewMode,
      });
      const touchPrimary = renderContext?.interaction?.isTouchPrimary === true;
      const targetId = selectedId ?? focusedId ?? (!touchPrimary ? hoveredId : null);
      if (!targetId) {
        return;
      }

      const widget = runtime.getWidgetById(targetId);
      if (!widget) {
        if (selectedId === targetId) {
          runtime.setSelectedWidgetId(null);
        }
        if (focusedId === targetId) {
          runtime.setFocusedWidgetId(null);
        }
        return;
      }

      const flags = interactionFlags(widget);
      const rects = controlRects(widget, camera);
      const screen = camera.worldToScreen(rects.bounds.x, rects.bounds.y);
      const screenW = rects.bounds.width * camera.zoom;
      const screenH = rects.bounds.height * camera.zoom;
      const headerH = Math.max(6, rects.header.height * camera.zoom);
      const selected = selectedId === widget.id || focusedId === widget.id;
      const hovered = hoveredId === widget.id;
      const revealActions = selected || (!touchPrimary && hovered);

      if (selected) {
        strokeRoundedRect(
          ctx,
          screen.x - 1.5,
          screen.y - 1.5,
          screenW + 3,
          screenH + 3,
          14,
          WIDGET_THEME.palette.selectionAccent,
          1.2,
        );
      }

      ctx.save();
      ctx.globalAlpha = selected ? 0.95 : 0.72;
      fillPill(
        ctx,
        screen.x + 6,
        screen.y + 4,
        Math.max(12, screenW - 12),
        Math.max(5, Math.min(13, headerH * 0.28)),
        selected ? WIDGET_THEME.palette.headerAccent : WIDGET_THEME.palette.headerAccentSoft,
      );
      ctx.restore();

      if (lod !== "detail" || !revealActions) {
        return;
      }

      if (flags.collapsible) {
        const collapseScreen = camera.worldToScreen(rects.collapse.x, rects.collapse.y);
        const collapseW = rects.collapse.width * camera.zoom;
        const collapseH = rects.collapse.height * camera.zoom;

        fillPill(ctx, collapseScreen.x, collapseScreen.y, collapseW, collapseH, WIDGET_THEME.palette.controlBg);
        drawControlGlyph(
          ctx,
          widget.collapsed ? "plus" : "minus",
          {
            x: collapseScreen.x,
            y: collapseScreen.y,
            size: Math.min(collapseW, collapseH),
            color: WIDGET_THEME.palette.controlFg,
          },
        );
      }

      if (flags.resizable) {
        const resizeScreen = camera.worldToScreen(rects.resize.x, rects.resize.y);
        const resizeW = rects.resize.width * camera.zoom;
        const resizeH = rects.resize.height * camera.zoom;

        fillPill(ctx, resizeScreen.x, resizeScreen.y, resizeW, resizeH, WIDGET_THEME.palette.controlBgSoft);
        drawControlGlyph(
          ctx,
          "resize",
          {
            x: resizeScreen.x,
            y: resizeScreen.y,
            size: Math.min(resizeW, resizeH),
            color: WIDGET_THEME.palette.controlFg,
          },
        );
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
      if (canvas instanceof HTMLCanvasElement) {
        canvas.removeEventListener("pointermove", handleRawPointerMove);
        canvas.removeEventListener("pointerup", handleRawPointerEnd);
        canvas.removeEventListener("pointercancel", handleRawPointerEnd);
      }
      detachInput();
      detachOverlay();
      window.removeEventListener("keydown", handleKeyDown);
    },
  };
}
