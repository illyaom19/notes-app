import test from "node:test";
import assert from "node:assert/strict";

import { createNotebookSectionsStore } from "../../src/features/sections/notebook-sections-store.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("sections store seeds a default section per notebook", () => {
  const storage = createMemoryStorage();
  const store = createNotebookSectionsStore({ storage });

  const seeded = store.ensureNotebook("nb-a");
  assert.ok(seeded);
  assert.equal(seeded.sections.length, 1);
  assert.equal(seeded.sections[0].name, "Section 1");
  assert.equal(store.getActiveSectionId("nb-a"), seeded.sections[0].id);
});

test("sections store creates, renames, and deletes sections", () => {
  const storage = createMemoryStorage();
  const store = createNotebookSectionsStore({ storage });

  store.ensureNotebook("nb-a");
  const created = store.createSection("nb-a", "Lecture 2");
  assert.ok(created);
  assert.equal(store.getActiveSectionId("nb-a"), created.id);

  const renamed = store.renameSection("nb-a", created.id, "Lecture 2B");
  assert.equal(renamed, true);
  assert.equal(store.listSections("nb-a").find((entry) => entry.id === created.id)?.name, "Lecture 2B");

  const deleted = store.deleteSection("nb-a", created.id);
  assert.ok(deleted);
  assert.notEqual(store.getActiveSectionId("nb-a"), created.id);
});

test("sections store isolates notebook section state", () => {
  const storage = createMemoryStorage();
  const store = createNotebookSectionsStore({ storage });

  const a = store.ensureNotebook("nb-a");
  const b = store.ensureNotebook("nb-b");
  assert.ok(a);
  assert.ok(b);
  assert.notEqual(a.sections[0].id, b.sections[0].id);

  const created = store.createSection("nb-b", "Section B2");
  assert.ok(created);
  assert.equal(store.listSections("nb-a").length, 1);
  assert.equal(store.listSections("nb-b").length, 2);
});

test("sections store can remove notebook section state", () => {
  const storage = createMemoryStorage();
  const store = createNotebookSectionsStore({ storage });

  store.ensureNotebook("nb-a");
  assert.equal(store.listSections("nb-a").length, 1);
  assert.equal(store.deleteNotebook("nb-a"), true);
  assert.equal(store.listSections("nb-a").length, 1);
});

test("sections store fails cleanly when persistence is unavailable", () => {
  const baseStorage = createMemoryStorage();
  const storage = {
    ...baseStorage,
    setItem(key, value) {
      if (key === "notes-app.notebook.sections.v1") {
        throw new Error("QuotaExceededError");
      }
      baseStorage.setItem(key, value);
    },
  };
  const store = createNotebookSectionsStore({ storage });

  const created = store.createSection("nb-a", "Will Fail");
  assert.equal(created, null);
  assert.equal(store.listSections("nb-a").length, 0);
});
