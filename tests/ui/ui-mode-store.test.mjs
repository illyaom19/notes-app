import test from "node:test";
import assert from "node:assert/strict";

import {
  isProductionMode,
  loadUiModeState,
  normalizeUiModeState,
  saveUiModeState,
  toggleUiMode,
} from "../../src/features/ui/ui-mode-store.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("ui mode defaults to production when no persisted state exists", () => {
  const storage = createMemoryStorage();
  const state = loadUiModeState({ storage, locationSearch: "" });
  assert.equal(state.mode, "production");
  assert.equal(isProductionMode(state), true);
});

test("ui mode honors query parameter overrides", () => {
  const storage = createMemoryStorage({
    "notes-app.ui-mode.v1": JSON.stringify({ mode: "production" }),
  });

  const debugFromUi = loadUiModeState({ storage, locationSearch: "?ui=debug" });
  assert.equal(debugFromUi.mode, "debug");

  const productionFromLegacyDebug = loadUiModeState({ storage, locationSearch: "?debug=false" });
  assert.equal(productionFromLegacyDebug.mode, "production");
});

test("ui mode saves and toggles cleanly", () => {
  const storage = createMemoryStorage();
  const saved = saveUiModeState({ mode: "debug" }, { storage });
  assert.equal(saved.mode, "debug");
  assert.deepEqual(JSON.parse(storage.getItem("notes-app.ui-mode.v1")), { mode: "debug" });

  const toggled = toggleUiMode(saved);
  assert.equal(toggled.mode, "production");
});

test("ui mode normalizer rejects invalid values", () => {
  assert.deepEqual(normalizeUiModeState({ mode: "debug" }), { mode: "debug" });
  assert.deepEqual(normalizeUiModeState({ mode: "unknown" }), { mode: "production" });
});

