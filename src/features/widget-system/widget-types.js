export const SUPPORTED_WIDGET_TYPES = Object.freeze([
  "expanded-area",
  "reference-popup",
  "pdf-document",
  "diagram",
]);

export const USER_CREATION_TYPES = Object.freeze([
  "expanded-area",
  "snip",
  "pdf-document",
  "diagram",
]);

export const ALLOWED_CREATION_INTENT_TYPES = Object.freeze([
  ...USER_CREATION_TYPES,
  "reference-popup",
  "library-reference",
]);

export function isSupportedWidgetType(type) {
  return typeof type === "string" && SUPPORTED_WIDGET_TYPES.includes(type);
}

export function isAllowedCreationIntentType(type) {
  return typeof type === "string" && ALLOWED_CREATION_INTENT_TYPES.includes(type);
}
