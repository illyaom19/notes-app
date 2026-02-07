import test from "node:test";
import assert from "node:assert/strict";

import { createContextWorkspaceStore } from "../../src/features/contexts/context-workspace-store.js";
import { STORAGE_SCHEMA_REGISTRY } from "../../src/features/storage/schema-registry.js";
import { createMemoryStorage, installBrowserEnv, sleep } from "../helpers/browser-env.mjs";

const { workspace: WORKSPACE_SCHEMA, assets: ASSET_SCHEMA } = STORAGE_SCHEMA_REGISTRY;

function workspaceKey(contextId) {
  return `${WORKSPACE_SCHEMA.keyPrefix}${contextId}`;
}

function emptyWorkspace(contextId, widgets) {
  return {
    contextId,
    widgets,
    researchCaptures: [],
    suggestions: [],
    documents: [],
    documentBindings: [],
    activeWorkspaceState: {
      activeDocumentId: null,
      lastPdfWidgetId: null,
      lastReferenceWidgetId: null,
    },
  };
}

function popupWidget({ id, imageDataUrl }) {
  return {
    id,
    type: "reference-popup",
    position: { x: 10, y: 20 },
    size: { width: 260, height: 200 },
    collapsed: false,
    metadata: { title: "Ref" },
    dataPayload: {
      imageDataUrl,
      textContent: "",
      sourceLabel: "Test",
      contentType: "image",
      citation: {
        sourceTitle: "Test Source",
        url: "https://example.test",
        accessedAt: new Date().toISOString(),
        snippetType: "image",
        attributionText: "Example",
      },
    },
  };
}

test("workspace store keeps widget assets externalized and cleans them on deletion", async () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const store = createContextWorkspaceStore({ storage });
    const contextId = "ctx-main";

    store.saveWorkspace(
      emptyWorkspace(contextId, [
        popupWidget({
          id: "popup-1",
          imageDataUrl: "data:image/png;base64,CCCC",
        }),
      ]),
    );

    const firstLoad = store.loadWorkspace(contextId);
    assert.equal(firstLoad.widgets.length, 1);
    assert.ok(firstLoad.widgets[0].dataPayload.imageAssetId);
    assert.equal(firstLoad.widgets[0].dataPayload.imageDataUrl, null);

    const hydrated = store.toWidgetDefinition(firstLoad.widgets[0]);
    assert.equal(hydrated.type, "reference-popup");
    assert.equal(hydrated.dataPayload.imageDataUrl, "data:image/png;base64,CCCC");

    store.saveWorkspace(emptyWorkspace(contextId, []));
    store.runMaintenance();
    await sleep(35);

    const catalogEnvelope = JSON.parse(storage.getItem(ASSET_SCHEMA.catalogKey));
    assert.equal(catalogEnvelope.data.records.length, 0);
  } finally {
    restoreEnv();
  }
});

test("workspace load repairs stale widget asset ids using inline fallback payloads", () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const store = createContextWorkspaceStore({ storage });
    const contextId = "ctx-repair";

    store.saveWorkspace(
      emptyWorkspace(contextId, [
        popupWidget({
          id: "popup-2",
          imageDataUrl: "data:image/png;base64,DDDD",
        }),
      ]),
    );

    const loaded = store.loadWorkspace(contextId);
    const staleAssetId = loaded.widgets[0].dataPayload.imageAssetId;
    assert.ok(staleAssetId);

    storage.removeItem(`${ASSET_SCHEMA.dataPrefix}${staleAssetId}`);

    const envelope = JSON.parse(storage.getItem(workspaceKey(contextId)));
    envelope.data.widgets[0].dataPayload.imageDataUrl = "data:image/png;base64,DDDD";
    storage.setItem(workspaceKey(contextId), JSON.stringify(envelope));

    const repaired = store.loadWorkspace(contextId);
    const repairedWidget = repaired.widgets[0];

    assert.notEqual(repairedWidget.dataPayload.imageAssetId, staleAssetId);
    assert.equal(repairedWidget.dataPayload.imageDataUrl, null);

    const definition = store.toWidgetDefinition(repairedWidget);
    assert.equal(definition.dataPayload.imageDataUrl, "data:image/png;base64,DDDD");
  } finally {
    restoreEnv();
  }
});

test("workspace store persists section suggestions", () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const store = createContextWorkspaceStore({ storage });
    const contextId = "ctx-suggestions::section-a";

    store.saveWorkspace({
      ...emptyWorkspace(contextId, []),
      suggestions: [
        {
          id: "s-1",
          scopeId: contextId,
          sectionId: "section-a",
          kind: "expanded-area",
          label: "Expand whitespace",
          fingerprint: "zone:pdf-1:z-1",
          anchor: { x: 24, y: 48 },
          payload: {
            sourceWidgetId: "pdf-1",
            whitespaceZoneId: "z-1",
          },
          state: "proposed",
        },
      ],
    });

    const loaded = store.loadWorkspace(contextId);
    assert.equal(Array.isArray(loaded.suggestions), true);
    assert.equal(loaded.suggestions.length, 1);
    assert.equal(loaded.suggestions[0].id, "s-1");
    assert.equal(loaded.suggestions[0].kind, "expanded-area");
  } finally {
    restoreEnv();
  }
});
