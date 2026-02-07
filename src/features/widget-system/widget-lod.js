const LABEL_ONLY_MAX_ZOOM = 0.55;
const COMPACT_MAX_ZOOM = 0.88;
const LABEL_ONLY_MIN_SCREEN_DIMENSION = 120;
const COMPACT_MIN_SCREEN_DIMENSION = 190;

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveWidgetLod({ cameraZoom, screenWidth, screenHeight }) {
  const zoom = Math.max(0, safeNumber(cameraZoom, 1));
  const minScreenDimension = Math.min(
    Math.max(0, safeNumber(screenWidth)),
    Math.max(0, safeNumber(screenHeight)),
  );

  if (zoom <= LABEL_ONLY_MAX_ZOOM || minScreenDimension <= LABEL_ONLY_MIN_SCREEN_DIMENSION) {
    return "label-only";
  }

  if (zoom <= COMPACT_MAX_ZOOM || minScreenDimension <= COMPACT_MIN_SCREEN_DIMENSION) {
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
  return "Widget";
}
