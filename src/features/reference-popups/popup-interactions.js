function getWorldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

export function createReferencePopupInteractions({ runtime, onPopupMutated }) {
  const state = {
    pointerId: null,
    widgetId: null,
    mode: null,
    lastWorld: null,
  };

  const manager = {
    onPointerDown(event, { camera }) {
      if (event.pointerType === "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "reference-popup") {
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      const world = getWorldPoint(event, camera);
      const control = widget.getControlAt(world.x, world.y);

      if (control === "close") {
        runtime.removeWidgetById(widget.id);
        onPopupMutated();
        return true;
      }

      if (control === "minimize") {
        widget.toggleMinimized();
        onPopupMutated();
        return true;
      }

      if (control === "resize" && !widget.metadata.minimized) {
        state.pointerId = event.pointerId;
        state.widgetId = widget.id;
        state.mode = "resize";
        state.lastWorld = world;
        return true;
      }

      if (control === "drag") {
        state.pointerId = event.pointerId;
        state.widgetId = widget.id;
        state.mode = "drag";
        state.lastWorld = world;
        return true;
      }

      return false;
    },

    onPointerMove(event, { camera }) {
      if (state.pointerId !== event.pointerId || !state.widgetId || !state.mode) {
        return false;
      }

      const widget = runtime.getWidgetById(state.widgetId);
      if (!widget) {
        return false;
      }

      const world = getWorldPoint(event, camera);
      const dx = world.x - state.lastWorld.x;
      const dy = world.y - state.lastWorld.y;
      state.lastWorld = world;

      if (state.mode === "drag") {
        widget.position.x += dx;
        widget.position.y += dy;
      }

      if (state.mode === "resize") {
        widget.resizeFromCorner(dx, dy);
      }

      onPopupMutated();
      return true;
    },

    onPointerUp(event) {
      if (state.pointerId !== event.pointerId) {
        return false;
      }
      state.pointerId = null;
      state.widgetId = null;
      state.mode = null;
      state.lastWorld = null;
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
