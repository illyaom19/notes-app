import test from "node:test";
import assert from "node:assert/strict";

import { createSuggestionStore } from "../../src/features/suggestions/suggestion-store.js";

function sampleSuggestion(overrides = {}) {
  return {
    id: "s-1",
    kind: "expanded-area",
    label: "Expand whitespace",
    fingerprint: "zone:pdf-1:z-1",
    anchor: { x: 20, y: 40 },
    payload: {
      sourceWidgetId: "pdf-1",
      whitespaceZoneId: "z-1",
    },
    ...overrides,
  };
}

test("suggestion store upserts by fingerprint and preserves ghost/accepted states", () => {
  const store = createSuggestionStore();

  store.upsertMany({
    scopeId: "nb::sec",
    sectionId: "sec",
    suggestions: [sampleSuggestion()],
  });

  const first = store.list({ scopeId: "nb::sec", sectionId: "sec" });
  assert.equal(first.length, 1);

  store.transition({
    scopeId: "nb::sec",
    sectionId: "sec",
    suggestionId: "s-1",
    toState: "ghosted",
  });

  store.upsertMany({
    scopeId: "nb::sec",
    sectionId: "sec",
    suggestions: [
      sampleSuggestion({
        id: "s-new",
        label: "Expand whitespace updated",
      }),
    ],
  });

  const afterGhost = store.list({ scopeId: "nb::sec", sectionId: "sec" });
  assert.equal(afterGhost.length, 1);
  assert.equal(afterGhost[0].id, "s-1");
  assert.equal(afterGhost[0].state, "ghosted");

  store.transition({
    scopeId: "nb::sec",
    sectionId: "sec",
    suggestionId: "s-1",
    toState: "accepted",
  });

  store.upsertMany({
    scopeId: "nb::sec",
    sectionId: "sec",
    suggestions: [sampleSuggestion({ id: "s-new-2" })],
  });

  const afterAccepted = store.list({ scopeId: "nb::sec", sectionId: "sec" });
  assert.equal(afterAccepted[0].state, "accepted");
});

test("suggestion store exports persistence payload and prunes invalid anchors", () => {
  const store = createSuggestionStore();
  store.replaceSectionSuggestions({
    scopeId: "nb::sec",
    sectionId: "sec",
    suggestions: [
      sampleSuggestion(),
      sampleSuggestion({
        id: "s-2",
        fingerprint: "bad-anchor",
        anchor: { x: Number.NaN, y: 12 },
      }),
      sampleSuggestion({
        id: "s-3",
        fingerprint: "missing-source",
        payload: { sourceWidgetId: "missing" },
      }),
    ],
  });

  const pruned = store.pruneInvalidAnchors({
    scopeId: "nb::sec",
    sectionId: "sec",
    runtime: {
      getWidgetById(id) {
        return id === "pdf-1" ? { id } : null;
      },
    },
  });

  assert.equal(pruned.removed, 1);

  const persisted = store.toPersistencePayload({ scopeId: "nb::sec", sectionId: "sec" });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, "s-1");
});
