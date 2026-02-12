const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE_PX = 22;

function isPrimaryPointer(event) {
  if (event.pointerType === "mouse" || event.pointerType === "pen") {
    return event.button === 0;
  }
  return true;
}

function worldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

function distanceSq(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

export function createDiagramInteractions({ runtime, onDiagramMutated } = {}) {
  const dragState = {
    pointerId: null,
    widgetId: null,
    nodeId: null,
    mode: null,
    lastWorldX: 0,
    lastWorldY: 0,
  };
  const tapState = {
    at: 0,
    widgetId: null,
    nodeId: null,
    screenX: 0,
    screenY: 0,
  };

  function emitMutated(widget, { preview = false } = {}) {
    if (!widget) {
      return;
    }
    if (typeof onDiagramMutated === "function") {
      onDiagramMutated({ widget, preview });
    } else {
      runtime.requestRender({ continuousMs: preview ? 120 : 180 });
    }
  }

  function clearDrag() {
    dragState.pointerId = null;
    dragState.widgetId = null;
    dragState.nodeId = null;
    dragState.mode = null;
    dragState.lastWorldX = 0;
    dragState.lastWorldY = 0;
  }

  const manager = {
    onPointerDown(event, { camera }) {
      if (!isPrimaryPointer(event)) {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "diagram") {
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      runtime.setFocusedWidgetId(widget.id);
      runtime.setSelectedWidgetId(widget.id);

      const world = worldPoint(event, camera);
      const toolbarAction = widget.getToolbarActionAt?.(world.x, world.y, camera);
      if (toolbarAction) {
        const changed = widget.applyToolbarAction?.(toolbarAction, {
          worldX: world.x,
          worldY: world.y,
          camera,
        });
        if (changed) {
          emitMutated(widget, { preview: false });
        }
        return true;
      }

      const node = widget.hitNodeAt?.(world.x, world.y, camera);
      if (node) {
        const now = performance.now();
        const withinDoubleTapWindow = now - tapState.at <= DOUBLE_TAP_MS;
        const withinDoubleTapDistance =
          distanceSq(event.offsetX, event.offsetY, tapState.screenX, tapState.screenY) <=
          DOUBLE_TAP_DISTANCE_PX * DOUBLE_TAP_DISTANCE_PX;
        const isNodeDoubleTap =
          tapState.widgetId === widget.id &&
          tapState.nodeId === node.id &&
          withinDoubleTapWindow &&
          withinDoubleTapDistance;
        tapState.at = now;
        tapState.widgetId = widget.id;
        tapState.nodeId = node.id;
        tapState.screenX = event.offsetX;
        tapState.screenY = event.offsetY;

        if (isNodeDoubleTap) {
          if (typeof onDiagramMutated === "function") {
            onDiagramMutated({
              widget,
              preview: false,
              intent: "rename-node",
              nodeId: node.id,
              currentLabel: node.label ?? "",
            });
          }
          return true;
        }

        if (widget.diagramDoc?.connectMode) {
          const changed = widget.handleConnectTap?.(node.id);
          if (changed) {
            emitMutated(widget, { preview: false });
          }
          return true;
        }

        widget.diagramDoc.selectedNodeId = node.id;
        dragState.pointerId = event.pointerId;
        dragState.widgetId = widget.id;
        dragState.nodeId = node.id;
        dragState.mode = "node-move";
        dragState.lastWorldX = world.x;
        dragState.lastWorldY = world.y;
        if (event.pointerType === "touch") {
          runtime.captureTouchPointer(event.pointerId);
        }
        emitMutated(widget, { preview: true });
        return true;
      }

      if (widget.isPointInBody?.(world.x, world.y, camera)) {
        const now = performance.now();
        const withinDoubleTapWindow = now - tapState.at <= DOUBLE_TAP_MS;
        const withinDoubleTapDistance =
          distanceSq(event.offsetX, event.offsetY, tapState.screenX, tapState.screenY) <=
          DOUBLE_TAP_DISTANCE_PX * DOUBLE_TAP_DISTANCE_PX;
        const isDoubleTap =
          tapState.widgetId === widget.id && withinDoubleTapWindow && withinDoubleTapDistance;

        tapState.at = now;
        tapState.widgetId = widget.id;
        tapState.nodeId = null;
        tapState.screenX = event.offsetX;
        tapState.screenY = event.offsetY;

        if (isDoubleTap) {
          widget.addNode?.("process", { worldX: world.x, worldY: world.y, camera });
          emitMutated(widget, { preview: false });
          return true;
        }

        dragState.pointerId = event.pointerId;
        dragState.widgetId = widget.id;
        dragState.nodeId = null;
        dragState.mode = "viewport-pan";
        dragState.lastWorldX = world.x;
        dragState.lastWorldY = world.y;
        if (event.pointerType === "touch") {
          runtime.captureTouchPointer(event.pointerId);
        }
        emitMutated(widget, { preview: true });
        return true;
      }

      return false;
    },

    onPointerMove(event, { camera }) {
      if (dragState.pointerId !== event.pointerId) {
        return false;
      }
      const widget = runtime.getWidgetById(dragState.widgetId);
      if (!widget || widget.type !== "diagram") {
        clearDrag();
        return false;
      }
      const world = worldPoint(event, camera);
      const dx = world.x - dragState.lastWorldX;
      const dy = world.y - dragState.lastWorldY;
      dragState.lastWorldX = world.x;
      dragState.lastWorldY = world.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001)) {
        return true;
      }
      let moved = false;
      if (dragState.mode === "node-move" && dragState.nodeId) {
        moved = widget.moveNodeBy?.(dragState.nodeId, dx, dy) === true;
      } else if (dragState.mode === "viewport-pan") {
        moved = widget.panViewByWorld?.(dx, dy, camera) === true;
      }
      if (moved) {
        emitMutated(widget, { preview: true });
      }
      return true;
    },

    onWheel(event, { camera }) {
      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "diagram" || widget.collapsed) {
        return false;
      }
      const world = worldPoint(event, camera);
      if (!widget.isPointInBody?.(world.x, world.y, camera)) {
        return false;
      }
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const changed = widget.zoomViewAtWorld?.(world.x, world.y, zoomFactor, camera) === true;
      if (!changed) {
        return false;
      }
      emitMutated(widget, { preview: true });
      return true;
    },

    onPointerUp(event) {
      if (dragState.pointerId !== event.pointerId) {
        return false;
      }
      const widget = runtime.getWidgetById(dragState.widgetId);
      clearDrag();
      if (widget && widget.type === "diagram") {
        emitMutated(widget, { preview: false });
      }
      return true;
    },

    onPointerCancel(event) {
      if (dragState.pointerId !== event.pointerId) {
        return false;
      }
      const widget = runtime.getWidgetById(dragState.widgetId);
      clearDrag();
      if (widget && widget.type === "diagram") {
        emitMutated(widget, { preview: false });
      }
      return true;
    },
  };

  const detach = runtime.registerInputHandler(manager, { priority: 93 });
  return {
    dispose() {
      clearDrag();
      detach();
    },
  };
}
