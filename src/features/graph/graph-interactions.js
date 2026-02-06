function worldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

export function createGraphInteractions({ runtime, onGraphMutated }) {
  const dragState = {
    pointerId: null,
    widgetId: null,
    mode: null,
    lastWorld: null,
    dirty: false,
  };

  const manager = {
    onPointerDown(event, { camera }) {
      if (event.pointerType === "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "graph-widget") {
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      const point = worldPoint(event, camera);
      const control = widget.getControlAt(point.x, point.y);

      if (control === "zoom-in") {
        widget.zoom(0.84);
        onGraphMutated(widget);
        return true;
      }

      if (control === "zoom-out") {
        widget.zoom(1.2);
        onGraphMutated(widget);
        return true;
      }

      if (control === "reset") {
        widget.resetView();
        onGraphMutated(widget);
        return true;
      }

      if (control === "move" || control === "resize") {
        // Shared widget interaction manager owns universal move/resize behavior.
        return false;
      }

      if (!control || control !== "pan") {
        return false;
      }

      dragState.pointerId = event.pointerId;
      dragState.widgetId = widget.id;
      dragState.mode = control;
      dragState.lastWorld = point;
      dragState.dirty = false;
      return true;
    },

    onPointerMove(event, { camera }) {
      if (dragState.pointerId !== event.pointerId || !dragState.widgetId) {
        return false;
      }

      const widget = runtime.getWidgetById(dragState.widgetId);
      if (!widget) {
        return false;
      }

      const point = worldPoint(event, camera);
      const dx = point.x - dragState.lastWorld.x;
      const dy = point.y - dragState.lastWorld.y;
      dragState.lastWorld = point;

      if (dragState.mode === "pan") {
        widget.panByWorldDelta(dx, dy);
      }

      dragState.dirty = true;
      return true;
    },

    onPointerUp(event) {
      if (dragState.pointerId !== event.pointerId) {
        return false;
      }

      if (dragState.dirty && dragState.widgetId) {
        const widget = runtime.getWidgetById(dragState.widgetId);
        if (widget) {
          onGraphMutated(widget);
        }
      }

      dragState.pointerId = null;
      dragState.widgetId = null;
      dragState.mode = null;
      dragState.lastWorld = null;
      dragState.dirty = false;
      return true;
    },

    onPointerCancel(event) {
      return this.onPointerUp(event);
    },
  };

  const detach = runtime.registerInputHandler(manager);

  return {
    dispose() {
      detach();
    },
  };
}
