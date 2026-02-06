import { fillPill, strokeRoundedRect } from "../../core/canvas/rounded.js";

const HANDLE_SIZE = 18;
const MIN_SIZE = 120;

function worldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

function contains(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function collapseRect(widget) {
  return {
    x: widget.position.x + 8,
    y: widget.position.y + 8,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  };
}

function resizeRect(widget) {
  return {
    x: widget.position.x + widget.size.width - HANDLE_SIZE,
    y: widget.position.y + widget.size.height - HANDLE_SIZE,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  };
}

function shouldDeferToSpecializedHandler(widget, point) {
  if (!widget) {
    return false;
  }

  if (widget.type === "pdf-document" && typeof widget.getWhitespaceZoneAt === "function") {
    const zoneId = widget.getWhitespaceZoneAt(point.x, point.y);
    if (zoneId) {
      return true;
    }
  }

  if (
    (widget.type === "reference-popup" || widget.type === "graph-widget") &&
    typeof widget.getControlAt === "function"
  ) {
    const control = widget.getControlAt(point.x, point.y);
    if (control) {
      return true;
    }
  }

  return false;
}

export function createUniversalWidgetInteractions({ runtime, onWidgetMutated }) {
  const state = {
    selectedWidgetId: null,
    pointerId: null,
    mode: null,
    lastWorld: null,
  };

  const manager = {
    onPointerDown(event, { camera }) {
      if (event.pointerType === "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      const point = worldPoint(event, camera);
      if (!widget) {
        state.selectedWidgetId = null;
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      state.selectedWidgetId = widget.id;

      if (shouldDeferToSpecializedHandler(widget, point)) {
        return false;
      }

      const collapse = collapseRect(widget);
      if (contains(collapse, point.x, point.y)) {
        widget.setCollapsed(!widget.collapsed);
        onWidgetMutated();
        return true;
      }

      const resize = resizeRect(widget);
      if (contains(resize, point.x, point.y)) {
        state.pointerId = event.pointerId;
        state.mode = "resize";
        state.lastWorld = point;
        return true;
      }

      if (widget.containsWorldPoint(point.x, point.y)) {
        state.pointerId = event.pointerId;
        state.mode = "drag";
        state.lastWorld = point;
        return true;
      }

      return false;
    },

    onPointerMove(event, { camera }) {
      if (state.pointerId !== event.pointerId || !state.mode || !state.selectedWidgetId) {
        return false;
      }

      const widget = runtime.getWidgetById(state.selectedWidgetId);
      if (!widget) {
        return false;
      }

      const point = worldPoint(event, camera);
      const dx = point.x - state.lastWorld.x;
      const dy = point.y - state.lastWorld.y;
      state.lastWorld = point;

      if (state.mode === "drag") {
        if (typeof widget.moveBy === "function") {
          widget.moveBy(dx, dy);
        } else {
          widget.position.x += dx;
          widget.position.y += dy;
        }
      } else if (state.mode === "resize") {
        if (typeof widget.resizeBy === "function") {
          widget.resizeBy(dx, dy);
        } else {
          widget.size.width = Math.max(MIN_SIZE, widget.size.width + dx);
          widget.size.height = Math.max(MIN_SIZE, widget.size.height + dy);
        }
      }

      onWidgetMutated();
      return true;
    },

    onPointerUp(event) {
      if (state.pointerId !== event.pointerId) {
        return false;
      }
      state.pointerId = null;
      state.mode = null;
      state.lastWorld = null;
      return true;
    },

    onPointerCancel(event) {
      return this.onPointerUp(event);
    },

    render(ctx, camera) {
      if (!state.selectedWidgetId) {
        return;
      }
      const widget = runtime.getWidgetById(state.selectedWidgetId);
      if (!widget) {
        return;
      }

      const screen = camera.worldToScreen(widget.position.x, widget.position.y);
      const width = widget.size.width * camera.zoom;
      const height = widget.size.height * camera.zoom;

      strokeRoundedRect(ctx, screen.x - 3, screen.y - 3, width + 6, height + 6, 20, "#3e7da5", 1.2);

      const collapse = collapseRect(widget);
      const collapseScreen = camera.worldToScreen(collapse.x, collapse.y);
      fillPill(
        ctx,
        collapseScreen.x,
        collapseScreen.y,
        collapse.width * camera.zoom,
        collapse.height * camera.zoom,
        "#d9e8f4",
      );
      ctx.fillStyle = "#18374f";
      ctx.font = `${Math.max(9, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(widget.collapsed ? "v" : "^", collapseScreen.x + 5 * camera.zoom, collapseScreen.y + 12 * camera.zoom);

      const resize = resizeRect(widget);
      const resizeScreen = camera.worldToScreen(resize.x, resize.y);
      fillPill(
        ctx,
        resizeScreen.x,
        resizeScreen.y,
        resize.width * camera.zoom,
        resize.height * camera.zoom,
        "#d9e8f4",
      );
      ctx.fillStyle = "#18374f";
      ctx.fillText("<>", resizeScreen.x + 3 * camera.zoom, resizeScreen.y + 12 * camera.zoom);
    },
  };

  const detachInput = runtime.registerInputHandler(manager);
  const detachLayer = runtime.registerRenderLayer(manager);

  return {
    dispose() {
      detachInput();
      detachLayer();
    },
  };
}
