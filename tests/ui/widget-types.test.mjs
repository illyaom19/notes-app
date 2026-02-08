import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_CREATION_INTENT_TYPES,
  SUPPORTED_WIDGET_TYPES,
  USER_CREATION_TYPES,
  isAllowedCreationIntentType,
  isSupportedWidgetType,
} from "../../src/features/widget-system/widget-types.js";

test("widget type policy exports expected supported runtime types", () => {
  assert.deepEqual([...SUPPORTED_WIDGET_TYPES], ["expanded-area", "reference-popup", "pdf-document"]);
  assert.equal(isSupportedWidgetType("pdf-document"), true);
  assert.equal(isSupportedWidgetType("graph-widget"), false);
});

test("creation intent policy keeps manual and internal intents explicit", () => {
  assert.deepEqual([...USER_CREATION_TYPES], ["expanded-area", "snip", "pdf-document"]);
  assert.equal(isAllowedCreationIntentType("library-reference"), true);
  assert.equal(isAllowedCreationIntentType("reference-popup"), true);
  assert.equal(isAllowedCreationIntentType("dummy"), false);
  assert.ok(ALLOWED_CREATION_INTENT_TYPES.includes("snip"));
});
