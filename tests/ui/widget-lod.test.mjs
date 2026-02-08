import test from "node:test";
import assert from "node:assert/strict";

import { resolveWidgetLod } from "../../src/features/widget-system/widget-lod.js";

test("widget lod resolves peek for explicit peek mode", () => {
  assert.equal(resolveWidgetLod({ cameraZoom: 2.2, viewMode: "peek" }), "peek");
});

test("widget lod resolves by zoom thresholds", () => {
  assert.equal(resolveWidgetLod({ cameraZoom: 0.45, viewMode: "interactive" }), "peek");
  assert.equal(resolveWidgetLod({ cameraZoom: 0.8, viewMode: "interactive" }), "compact");
  assert.equal(resolveWidgetLod({ cameraZoom: 1, viewMode: "interactive" }), "detail");
  assert.equal(resolveWidgetLod({ cameraZoom: 3.6, viewMode: "interactive" }), "detail");
});
