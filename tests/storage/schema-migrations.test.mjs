import test from "node:test";
import assert from "node:assert/strict";

import {
  migrateSchema,
  readMigratedEnvelope,
  writeEnvelope,
} from "../../src/features/storage/schema-migrations.js";
import { createMemoryStorage } from "../helpers/browser-env.mjs";

test("migrateSchema applies each registered version step", () => {
  const events = [];
  const result = migrateSchema({
    schemaVersion: 1,
    data: { count: 1 },
    targetSchemaVersion: 3,
    migrations: {
      2: (data) => ({ ...data, count: data.count + 1 }),
      3: (data) => ({ ...data, count: data.count + 2 }),
    },
    onMigrationStep: ({ from, to }) => {
      events.push(`${from}->${to}`);
    },
  });

  assert.equal(result.schemaVersion, 3);
  assert.equal(result.data.count, 4);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.migrationSteps, ["1->2", "2->3"]);
  assert.deepEqual(events, ["1->2", "2->3"]);
});

test("readMigratedEnvelope upgrades legacy payloads and persists envelope", () => {
  const storage = createMemoryStorage({
    "example.key": JSON.stringify({ version: 1, name: "legacy" }),
  });

  const loaded = readMigratedEnvelope({
    storage,
    key: "example.key",
    targetSchemaVersion: 2,
    legacySchemaVersion: 1,
    defaultData: { version: 2, name: "default" },
    migrations: {
      2: (candidate) => ({
        version: 2,
        name: candidate?.name ?? "migrated",
      }),
    },
  });

  assert.equal(loaded.schemaVersion, 2);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.data.name, "legacy");

  const persisted = JSON.parse(storage.getItem("example.key"));
  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.data.version, 2);
  assert.equal(persisted.data.name, "legacy");
});

test("readMigratedEnvelope resets corrupt payloads to defaults", () => {
  const storage = createMemoryStorage({
    "bad.key": "{not-json",
  });

  let handledError = null;
  const loaded = readMigratedEnvelope({
    storage,
    key: "bad.key",
    targetSchemaVersion: 3,
    defaultData: { healthy: true },
    migrations: {
      2: (data) => data,
      3: (data) => data,
    },
    onError: (error) => {
      handledError = error;
    },
  });

  assert.equal(loaded.corrupted, true);
  assert.equal(loaded.schemaVersion, 3);
  assert.deepEqual(loaded.data, { healthy: true });
  assert.ok(handledError instanceof Error);

  const persisted = JSON.parse(storage.getItem("bad.key"));
  assert.equal(persisted.schemaVersion, 3);
  assert.deepEqual(persisted.data, { healthy: true });
});

test("writeEnvelope stores explicit schema envelope", () => {
  const storage = createMemoryStorage();
  writeEnvelope({
    storage,
    key: "schema.key",
    schemaVersion: 5,
    data: { ok: true },
  });

  assert.deepEqual(JSON.parse(storage.getItem("schema.key")), {
    schemaVersion: 5,
    data: { ok: true },
  });
});
