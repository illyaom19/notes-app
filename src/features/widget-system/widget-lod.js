import { WIDGET_THEME } from "./widget-theme.js";

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveWidgetLod({ cameraZoom, viewMode } = {}) {
  const zoom = Math.max(0, safeNumber(cameraZoom, 1));
  if (viewMode === "peek") {
    return "peek";
  }
  if (zoom < WIDGET_THEME.lod.detailMinZoom) {
    return "compact";
  }
  return "detail";
}

export function widgetTypeTitle(widgetType) {
  if (widgetType === "pdf-document") {
    return "PDF";
  }
  if (widgetType === "reference-popup") {
    return "Snip";
  }
  if (widgetType === "expanded-area") {
    return "Note";
  }
  if (widgetType === "diagram") {
    return "Diagram";
  }
  return "Widget";
}
