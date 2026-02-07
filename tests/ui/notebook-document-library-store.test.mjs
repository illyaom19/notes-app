import test from "node:test";
import assert from "node:assert/strict";

import { createNotebookDocumentLibraryStore } from "../../src/features/notebooks/notebook-document-library-store.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("notebook document library upserts and preserves source records", () => {
  const storage = createMemoryStorage();
  const store = createNotebookDocumentLibraryStore({ storage });

  const created = store.upsertDocument("nb-a", {
    title: "Lecture 1",
    sourceType: "pdf",
    fileName: "lecture-1.pdf",
    bytesBase64: "YWJj",
  });
  assert.ok(created);
  assert.equal(created.title, "Lecture 1");
  assert.equal(created.status, "active");

  const listed = store.listDocuments("nb-a");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const fetched = store.getDocument("nb-a", created.id);
  assert.ok(fetched);
  assert.equal(fetched.fileName, "lecture-1.pdf");

  const updated = store.upsertDocument("nb-a", {
    id: created.id,
    title: "Lecture 1 (Revised)",
    sourceType: "pdf",
    fileName: "lecture-1-revised.pdf",
    bytesBase64: "YWJjZA==",
  });
  assert.ok(updated);
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.title, "Lecture 1 (Revised)");
  assert.equal(updated.fileName, "lecture-1-revised.pdf");
});

test("notebook document library supports soft-delete visibility rules", () => {
  const storage = createMemoryStorage();
  const store = createNotebookDocumentLibraryStore({ storage });

  const created = store.upsertDocument("nb-a", {
    title: "Lecture 2",
    sourceType: "pdf",
    fileName: "lecture-2.pdf",
    bytesBase64: "YWJj",
  });
  assert.ok(created);

  const deleted = store.markDeleted("nb-a", created.id);
  assert.ok(deleted);
  assert.equal(deleted.status, "deleted");

  assert.equal(store.listDocuments("nb-a").length, 0);
  assert.equal(store.listDocuments("nb-a", { includeDeleted: true }).length, 1);
});

test("notebook document library keeps notebooks isolated and removable", () => {
  const storage = createMemoryStorage();
  const store = createNotebookDocumentLibraryStore({ storage });

  store.upsertDocument("nb-a", {
    title: "Notebook A PDF",
    sourceType: "pdf",
    fileName: "a.pdf",
    bytesBase64: "YQ==",
  });
  store.upsertDocument("nb-b", {
    title: "Notebook B PDF",
    sourceType: "pdf",
    fileName: "b.pdf",
    bytesBase64: "Yg==",
  });

  assert.equal(store.listDocuments("nb-a").length, 1);
  assert.equal(store.listDocuments("nb-b").length, 1);
  assert.equal(store.deleteNotebook("nb-a"), true);
  assert.equal(store.listDocuments("nb-a").length, 0);
  assert.equal(store.listDocuments("nb-b").length, 1);
});

test("notebook document library can rename and hard-delete source entries", () => {
  const storage = createMemoryStorage();
  const store = createNotebookDocumentLibraryStore({ storage });

  const created = store.upsertDocument("nb-a", {
    title: "Week 1",
    sourceType: "pdf",
    fileName: "week-1.pdf",
    bytesBase64: "YQ==",
  });
  assert.ok(created);

  const renamed = store.renameDocument("nb-a", created.id, "Week 1 Notes");
  assert.ok(renamed);
  assert.equal(renamed.title, "Week 1 Notes");

  assert.equal(store.deleteDocument("nb-a", created.id), true);
  assert.equal(store.listDocuments("nb-a", { includeDeleted: true }).length, 0);
});
