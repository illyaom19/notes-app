import test from "node:test";
import assert from "node:assert/strict";

import { createNotebookLibraryStore } from "../../src/features/notebooks/notebook-library-store.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("library store upserts and retrieves references", () => {
  const storage = createMemoryStorage();
  const store = createNotebookLibraryStore({ storage });

  const saved = store.upsertReference("nb-a", {
    title: "KVL",
    sourceLabel: "Circuit Notes",
    popupMetadata: {
      type: "formula-sheet",
      tags: ["ee", "circuits"],
    },
  });

  assert.ok(saved);
  const listed = store.listReferences("nb-a");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, "KVL");

  const fetched = store.getReference("nb-a", saved.id);
  assert.ok(fetched);
  assert.equal(fetched.sourceLabel, "Circuit Notes");
  assert.deepEqual(fetched.popupMetadata.tags, ["ee", "circuits"]);
});

test("library store keeps notebook references isolated", () => {
  const storage = createMemoryStorage();
  const store = createNotebookLibraryStore({ storage });

  const aRef = store.upsertReference("nb-a", { title: "Ref A" });
  const bRef = store.upsertReference("nb-b", { title: "Ref B" });

  assert.ok(aRef);
  assert.ok(bRef);
  assert.equal(store.listReferences("nb-a").length, 1);
  assert.equal(store.listReferences("nb-b").length, 1);
  assert.equal(store.listReferences("nb-a")[0].title, "Ref A");
  assert.equal(store.listReferences("nb-b")[0].title, "Ref B");
});

test("library store can delete a notebook library", () => {
  const storage = createMemoryStorage();
  const store = createNotebookLibraryStore({ storage });

  store.upsertReference("nb-a", { title: "Ref A" });
  assert.equal(store.listReferences("nb-a").length, 1);
  assert.equal(store.deleteNotebook("nb-a"), true);
  assert.equal(store.listReferences("nb-a").length, 0);
});

test("library store can rename and delete a specific reference entry", () => {
  const storage = createMemoryStorage();
  const store = createNotebookLibraryStore({ storage });

  const saved = store.upsertReference("nb-a", { title: "Old Title", sourceLabel: "Source" });
  assert.ok(saved);

  const renamed = store.renameReference("nb-a", saved.id, "New Title");
  assert.ok(renamed);
  assert.equal(renamed.title, "New Title");
  assert.equal(renamed.popupMetadata.title, "New Title");

  const removed = store.deleteReference("nb-a", saved.id);
  assert.equal(removed, true);
  assert.equal(store.listReferences("nb-a").length, 0);
});

test("library store returns null/false when persistence fails", () => {
  const baseStorage = createMemoryStorage();
  const storage = {
    ...baseStorage,
    setItem(key, value) {
      if (key === "notes-app.notebook.library.v1") {
        throw new Error("QuotaExceededError");
      }
      baseStorage.setItem(key, value);
    },
  };
  const store = createNotebookLibraryStore({ storage });

  const saved = store.upsertReference("nb-a", { title: "Will Fail" });
  assert.equal(saved, null);
  assert.equal(store.listReferences("nb-a").length, 0);
});
