import test from "node:test";
import assert from "node:assert/strict";

import { createAssetManager } from "../../src/features/storage/asset-manager.js";
import { STORAGE_SCHEMA_REGISTRY } from "../../src/features/storage/schema-registry.js";
import { createMemoryStorage, installBrowserEnv, sleep } from "../helpers/browser-env.mjs";

const { assets: ASSET_SCHEMA } = STORAGE_SCHEMA_REGISTRY;

test("asset manager tracks refs and removes unreferenced payloads", async () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const manager = createAssetManager({ storage, maxBytes: 1024 * 1024, chunkSize: 2 });
    const first = manager.registerAsset({
      type: "image-data-url",
      data: "data:image/png;base64,AAAA",
      ownerId: "ctx-1:widget-1",
    });
    assert.ok(first?.id);

    const catalogAfterInsert = JSON.parse(storage.getItem(ASSET_SCHEMA.catalogKey));
    assert.equal(catalogAfterInsert.data.records.length, 1);
    assert.deepEqual(catalogAfterInsert.data.records[0].refs, ["ctx-1:widget-1"]);

    manager.removeContextReferences("ctx-1");
    manager.scheduleGarbageCollection({ delayMs: 0, enforceBudget: false });
    await sleep(20);

    const catalogAfterCleanup = JSON.parse(storage.getItem(ASSET_SCHEMA.catalogKey));
    assert.equal(catalogAfterCleanup.data.records.length, 0);
    assert.equal(storage.getItem(`${ASSET_SCHEMA.dataPrefix}${first.id}`), null);
  } finally {
    restoreEnv();
  }
});

test("asset manager enforces budget by evicting unreferenced assets first", () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const manager = createAssetManager({ storage, maxBytes: 1024, chunkSize: 2 });
    const oldAsset = manager.registerAsset({
      type: "image-data-url",
      data: "A".repeat(700),
      ownerId: "ctx-a:widget-a",
    });
    assert.ok(oldAsset?.id);

    manager.removeContextReferences("ctx-a");
    const nextAsset = manager.registerAsset({
      type: "image-data-url",
      data: "B".repeat(700),
      ownerId: "ctx-b:widget-b",
    });

    assert.ok(nextAsset?.id);
    assert.equal(manager.loadAssetData(oldAsset.id), null);
    assert.equal(manager.loadAssetData(nextAsset.id), "B".repeat(700));
  } finally {
    restoreEnv();
  }
});

test("asset manager reuses deduplicated payloads", () => {
  const storage = createMemoryStorage();
  const restoreEnv = installBrowserEnv(storage);

  try {
    const manager = createAssetManager({ storage, maxBytes: 1024 * 1024, chunkSize: 2 });
    const one = manager.registerAsset({
      type: "image-data-url",
      data: "data:image/png;base64,BBBB",
      ownerId: "ctx-a:widget-a",
    });
    const two = manager.registerAsset({
      type: "image-data-url",
      data: "data:image/png;base64,BBBB",
      ownerId: "ctx-a:widget-b",
    });

    assert.ok(one?.id);
    assert.equal(two?.id, one.id);
    assert.equal(two?.reused, true);

    const catalog = JSON.parse(storage.getItem(ASSET_SCHEMA.catalogKey));
    assert.equal(catalog.data.records.length, 1);
    assert.deepEqual(catalog.data.records[0].refs.sort(), ["ctx-a:widget-a", "ctx-a:widget-b"]);
  } finally {
    restoreEnv();
  }
});
