import { analyzePdfWhitespaceZones } from "./pdf-whitespace-analyzer.js";

function worldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

export function createWhitespaceManager({ runtime, onZoneToggled }) {
  let hoveredWidgetId = null;
  let hoveredControlId = null;

  const updateHoveredControl = (widget, control) => {
    const nextWidgetId = widget?.id ?? null;
    const nextControlId = control ? `${control.kind}:${control.zoneId}` : null;
    if (hoveredWidgetId === nextWidgetId && hoveredControlId === nextControlId) {
      return;
    }

    if (hoveredWidgetId) {
      const previousWidget = runtime.getWidgetById(hoveredWidgetId);
      previousWidget?.setHoveredWhitespaceControl?.(null);
    }

    hoveredWidgetId = nextWidgetId;
    hoveredControlId = nextControlId;
    widget?.setHoveredWhitespaceControl?.(control);
  };

  const manager = {
    onPointerDown(event, { camera }) {
      if ((event.pointerType === "mouse" || event.pointerType === "pen") && event.button !== 0) {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "pdf-document") {
        return false;
      }

      const point = worldPoint(event, camera);
      const control = widget.getWhitespaceControlAt?.(point.x, point.y) ?? null;
      if (!control?.zoneId) {
        return false;
      }

      const zone = widget.toggleWhitespaceZone(control.zoneId);
      if (!zone) {
        return false;
      }

      updateHoveredControl(widget, control);
      onZoneToggled(widget, zone);
      return true;
    },

    onPointerMove(event, { camera }) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "pdf-document") {
        updateHoveredControl(null, null);
        return false;
      }

      const point = worldPoint(event, camera);
      const control = widget.getWhitespaceControlAt?.(point.x, point.y) ?? null;
      updateHoveredControl(widget, control);
      return false;
    },

    onPointerCancel() {
      updateHoveredControl(null, null);
      return false;
    },
  };

  const detach = runtime.registerInputHandler(manager, { priority: 95 });

  return {
    async analyzeWidget(pdfWidget) {
      if (!pdfWidget || pdfWidget.type !== "pdf-document") {
        return [];
      }
      const zones = await analyzePdfWhitespaceZones(pdfWidget);
      pdfWidget.setWhitespaceZones(zones);
      return zones;
    },

    dispose() {
      updateHoveredControl(null, null);
      detach();
    },
  };
}
