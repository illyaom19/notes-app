import test from "node:test";
import assert from "node:assert/strict";

import { createNotebookDocumentLibraryStore } from "../../src/features/notebooks/notebook-document-library-store.js";
import { STORAGE_SCHEMA_REGISTRY } from "../../src/features/storage/schema-registry.js";
import { createMemoryStorage, installBrowserEnv } from "../helpers/browser-env.mjs";

function createStore() {
  const storage = createMemoryStorage();
  const restore = installBrowserEnv(storage);
  const store = createNotebookDocumentLibraryStore({ storage });
  return { store, restore };
}

test("notebook document library upserts and preserves source records", () => {
  const { store, restore } = createStore();
  try {
    const created = store.upsertDocument("nb-a", {
      title: "Lecture 1",
      sourceType: "pdf",
      fileName: "lecture-1.pdf",
      bytesBase64: "YWJj",
    });
    assert.ok(created);
    assert.equal(created.title, "Lecture 1");
    assert.equal(created.status, "active");
    assert.equal(typeof created.pdfAssetId, "string");
    assert.equal(created.bytesBase64, null);

    const listed = store.listDocuments("nb-a");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);

    const fetched = store.getDocument("nb-a", created.id);
    assert.ok(fetched);
    assert.equal(fetched.fileName, "lecture-1.pdf");
    const fetchedBytes = store.loadDocumentBytes("nb-a", created.id);
    assert.ok(fetchedBytes instanceof Uint8Array);
    assert.deepEqual(Array.from(fetchedBytes), [97, 98, 99]);

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
    const updatedBytes = store.loadDocumentBytes("nb-a", created.id);
    assert.ok(updatedBytes instanceof Uint8Array);
    assert.deepEqual(Array.from(updatedBytes), [97, 98, 99, 100]);
  } finally {
    restore();
  }
});

test("document library rolls back asset refs when document persistence fails", () => {
  const baseStorage = createMemoryStorage();
  const storage = {
    ...baseStorage,
    setItem(key, value) {
      if (key === "notes-app.notebook.documents.v1") {
        throw new Error("QuotaExceededError");
      }
      baseStorage.setItem(key, value);
    },
  };
  const restore = installBrowserEnv(storage);

  try {
    const store = createNotebookDocumentLibraryStore({ storage });
    const created = store.upsertDocument("nb-fail", {
      title: "Too Big",
      sourceType: "pdf",
      fileName: "too-big.pdf",
      bytesBase64: "YWJj",
    });
    assert.equal(created, null);

    const catalogRaw = storage.getItem(STORAGE_SCHEMA_REGISTRY.assets.catalogKey);
    const catalog = catalogRaw ? JSON.parse(catalogRaw) : { data: { records: [] } };
    const leakedRefs = (catalog.data?.records ?? [])
      .flatMap((entry) => (Array.isArray(entry.refs) ? entry.refs : []))
      .filter((ref) => typeof ref === "string" && ref.startsWith("doclib/nb-fail:"));
    assert.equal(leakedRefs.length, 0);
  } finally {
    restore();
  }
});

test("notebook document library supports soft-delete visibility rules", () => {
  const { store, restore } = createStore();
  try {
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
  } finally {
    restore();
  }
});

test("notebook document library keeps notebooks isolated and removable", () => {
  const { store, restore } = createStore();
  try {
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
  } finally {
    restore();
  }
});

test("notebook document library can rename and hard-delete source entries", () => {
  const { store, restore } = createStore();
  try {
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
  } finally {
    restore();
  }
});
