import { analyzePdfWhitespaceZones } from "./pdf-whitespace-analyzer.js";

function worldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

export function createWhitespaceManager({ runtime, onZoneToggled }) {
  const manager = {
    onPointerDown(event, { camera }) {
      if (event.pointerType === "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "pdf-document") {
        return false;
      }

      const point = worldPoint(event, camera);
      const zoneId = widget.getWhitespaceZoneAt(point.x, point.y);
      if (!zoneId) {
        return false;
      }

      const zone = widget.toggleWhitespaceZone(zoneId);
      if (!zone) {
        return false;
      }

      onZoneToggled(widget, zone);
      return true;
    },
  };

  const detach = runtime.registerInputHandler(manager);

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
      detach();
    },
  };
}
