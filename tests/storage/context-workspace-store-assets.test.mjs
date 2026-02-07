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

function pdfWidget({ id, bytesBase64 }) {
  return {
    id,
    type: "pdf-document",
    position: { x: 12, y: 28 },
    size: { width: 480, height: 680 },
    collapsed: false,
    metadata: { title: "Document" },
    dataPayload: {
      fileName: "document.pdf",
      pdfAssetId: null,
      bytesBase64,
    },
    runtimeState: {
      whitespaceZones: [],
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

test("workspace store persists and hydrates pdf bytes across reloads", () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const store = createContextWorkspaceStore({ storage });
    const contextId = "ctx-pdf-roundtrip";
    const samplePdfBytesBase64 = "JVBERi0xLjQK";

    store.saveWorkspace(
      emptyWorkspace(contextId, [
        pdfWidget({
          id: "pdf-1",
          bytesBase64: samplePdfBytesBase64,
        }),
      ]),
    );

    const firstLoad = store.loadWorkspace(contextId);
    assert.equal(firstLoad.widgets.length, 1);
    assert.equal(firstLoad.widgets[0].type, "pdf-document");

    const hydratedA = store.toWidgetDefinition(firstLoad.widgets[0]);
    assert.equal(hydratedA.type, "pdf-document");
    assert.ok(hydratedA.dataPayload.bytes instanceof Uint8Array);
    assert.ok(hydratedA.dataPayload.bytes.length > 0);

    const reloadedStore = createContextWorkspaceStore({ storage });
    const secondLoad = reloadedStore.loadWorkspace(contextId);
    assert.equal(secondLoad.widgets.length, 1);
    assert.equal(secondLoad.widgets[0].type, "pdf-document");

    const hydratedB = reloadedStore.toWidgetDefinition(secondLoad.widgets[0]);
    assert.ok(hydratedB.dataPayload.bytes instanceof Uint8Array);
    assert.ok(hydratedB.dataPayload.bytes.length > 0);
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

test("workspace load drops unsupported legacy widget types and rewrites storage", () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const store = createContextWorkspaceStore({ storage });
    const contextId = "ctx-prune-legacy";
    const envelope = {
      schemaVersion: WORKSPACE_SCHEMA.schemaVersion,
      data: emptyWorkspace(contextId, [
        {
          id: "legacy-graph-1",
          type: "graph-widget",
          position: { x: 0, y: 0 },
          size: { width: 240, height: 180 },
          collapsed: false,
          metadata: { title: "Legacy Graph" },
          dataPayload: { equation: "sin(x)" },
          runtimeState: {},
        },
        {
          id: "legacy-dummy-1",
          type: "dummy",
          position: { x: 20, y: 20 },
          size: { width: 220, height: 160 },
          collapsed: false,
          metadata: { title: "Legacy Dummy" },
          dataPayload: {},
          runtimeState: {},
        },
        {
          id: "sheet-1",
          type: "expanded-area",
          position: { x: 48, y: 38 },
          size: { width: 320, height: 220 },
          collapsed: false,
          metadata: { title: "Notes" },
          dataPayload: {},
          runtimeState: {},
        },
      ]),
    };
    storage.setItem(workspaceKey(contextId), JSON.stringify(envelope));

    const loaded = store.loadWorkspace(contextId);
    assert.equal(loaded.widgets.length, 1);
    assert.equal(loaded.widgets[0].id, "sheet-1");
    assert.equal(loaded.widgets[0].type, "expanded-area");

    const rewritten = JSON.parse(storage.getItem(workspaceKey(contextId)));
    assert.equal(rewritten.data.widgets.length, 1);
    assert.equal(rewritten.data.widgets[0].id, "sheet-1");
    assert.equal(rewritten.data.widgets[0].type, "expanded-area");
  } finally {
    restoreEnv();
  }
});
