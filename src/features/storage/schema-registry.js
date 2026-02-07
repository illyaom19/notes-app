export const STORAGE_SCHEMA_REGISTRY = Object.freeze({
  workspace: Object.freeze({
    keyPrefix: "notes-app.context.workspace.v1.",
    schemaVersion: 3,
  }),
  ink: Object.freeze({
    key: "notes-app.ink.strokes.v1",
    schemaVersion: 2,
  }),
  assets: Object.freeze({
    catalogKey: "notes-app.assets.catalog.v1",
    dataPrefix: "notes-app.assets.data.v1.",
    schemaVersion: 2,
    defaultMaxBytes: 64 * 1024 * 1024,
  }),
});
