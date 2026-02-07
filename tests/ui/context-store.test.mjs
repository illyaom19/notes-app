import test from "node:test";
import assert from "node:assert/strict";

import { createContextStore } from "../../src/features/contexts/context-store.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("context store persists create/rename/delete flows", () => {
  const storage = createMemoryStorage();
  const store = createContextStore({ storage });

  const created = store.createContext("Notebook A");
  assert.ok(created);
  assert.equal(store.getActiveContextId(), created.id);
  assert.equal(store.renameContext(created.id, "Notebook A1"), true);

  const listed = store.list();
  assert.ok(listed.some((entry) => entry.id === created.id && entry.name === "Notebook A1"));

  const deleted = store.deleteContext(created.id);
  assert.ok(deleted);
  assert.notEqual(store.getActiveContextId(), created.id);
});

test("context store fails cleanly when storage write throws", () => {
  const baseStorage = createMemoryStorage();
  const storage = {
    ...baseStorage,
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  const store = createContextStore({ storage });
  const baseline = store.list();

  const created = store.createContext("Notebook B");
  assert.equal(created, null);
  assert.deepEqual(store.list(), baseline);
});
