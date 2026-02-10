import test from "node:test";
import assert from "node:assert/strict";

import {
  fingerprintDocumentEntry,
  fingerprintNoteEntry,
  fingerprintReferenceEntry,
} from "../../src/features/notebooks/library-fingerprint.js";

test("reference fingerprint is stable and content-based", () => {
  const a = fingerprintReferenceEntry({
    id: "ref-a",
    title: "Ref A",
    contentType: "image",
    imageDataUrl: "data:image/png;base64,abc",
    textContent: "",
    citation: { sourceTitle: "Source" },
    inkStrokes: [{ color: "#111", baseWidth: 2, points: [{ u: 0.1, v: 0.2 }] }],
  });
  const b = fingerprintReferenceEntry({
    id: "ref-b",
    title: "Renamed",
    contentType: "image",
    imageDataUrl: "data:image/png;base64,abc",
    textContent: "",
    citation: { sourceTitle: "Source" },
    inkStrokes: [{ color: "#111", baseWidth: 2, points: [{ u: 0.1, v: 0.2 }] }],
  });
  assert.equal(a, b);
});

test("note fingerprint ignores title but reflects note/ink changes", () => {
  const a = fingerprintNoteEntry({
    title: "Title A",
    metadata: { note: "same" },
    inkStrokes: [],
  });
  const b = fingerprintNoteEntry({
    title: "Title B",
    metadata: { note: "same" },
    inkStrokes: [],
  });
  const c = fingerprintNoteEntry({
    title: "Title B",
    metadata: { note: "different" },
    inkStrokes: [],
  });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("document fingerprint prefers source id and otherwise hashes bytes", () => {
  const linkedA = fingerprintDocumentEntry({ id: "doc-1" }, { pdfBytes: new Uint8Array([1, 2, 3]) });
  const linkedB = fingerprintDocumentEntry({ id: "doc-1" }, { pdfBytes: new Uint8Array([9, 9, 9]) });
  const frozenA = fingerprintDocumentEntry({ sourceDocumentId: null }, { pdfBytes: new Uint8Array([1, 2, 3]) });
  const frozenB = fingerprintDocumentEntry({ sourceDocumentId: null }, { pdfBytes: new Uint8Array([1, 2, 4]) });

  assert.equal(linkedA, linkedB);
  assert.notEqual(frozenA, frozenB);
});
