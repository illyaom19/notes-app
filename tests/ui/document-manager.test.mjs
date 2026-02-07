import test from "node:test";
import assert from "node:assert/strict";

import { createDocumentManager } from "../../src/features/documents/document-manager.js";

test("document manager stores source linkage state on open", () => {
  const manager = createDocumentManager();
  manager.setContextId("nb-a::sec-1");

  const opened = manager.openDocument({
    title: "Lecture 3",
    sourceType: "pdf",
    widgetId: "pdf-widget-1",
    sourceDocumentId: "nb-doc-1",
    linkStatus: "linked",
    sourceSnapshot: {
      title: "Notebook Lecture 3",
      sourceType: "pdf",
    },
  });

  assert.ok(opened);
  assert.equal(opened.sourceDocumentId, "nb-doc-1");
  assert.equal(opened.linkStatus, "linked");
  assert.deepEqual(opened.sourceSnapshot, {
    title: "Notebook Lecture 3",
    sourceType: "pdf",
  });
});

test("document manager can freeze linked documents and list by source", () => {
  const manager = createDocumentManager();
  manager.setContextId("nb-a::sec-2");

  const opened = manager.openDocument({
    title: "Lecture 4",
    sourceType: "pdf",
    widgetId: "pdf-widget-2",
    sourceDocumentId: "nb-doc-2",
    linkStatus: "linked",
    sourceSnapshot: {
      title: "Notebook Lecture 4",
      sourceType: "pdf",
    },
  });
  assert.ok(opened);

  assert.equal(manager.listLinkedDocumentsBySource("nb-doc-2").length, 1);

  assert.equal(
    manager.setDocumentSourceState(opened.id, {
      linkStatus: "frozen",
      sourceSnapshot: {
        title: "Notebook Lecture 4 (Archived)",
        sourceType: "pdf",
      },
      title: "Lecture 4 (Frozen)",
    }),
    true,
  );

  const frozen = manager.getDocumentById(opened.id);
  assert.ok(frozen);
  assert.equal(frozen.linkStatus, "frozen");
  assert.equal(frozen.title, "Lecture 4 (Frozen)");
  assert.deepEqual(frozen.sourceSnapshot, {
    title: "Notebook Lecture 4 (Archived)",
    sourceType: "pdf",
  });
});
