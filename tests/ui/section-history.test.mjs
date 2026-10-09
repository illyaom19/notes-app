import test from 'node:test';
import assert from 'node:assert/strict';
import { createSectionHistory, RETENTION_MS } from '../../src/features/history/section-history.js';
const state = () => ({ widgets: [{ id: 'note', type: 'expanded-area', position: { x: 0, y: 0 } }], strokes: [], documents: [], documentBindings: [] });
test('mixed edits undo and redo in order across serialization', () => {
  const a = state(), h = createSectionHistory({ state: a });
  const b = structuredClone(a); b.strokes.push({ id: 'ink', points: [1, 2] }); h.capture(b);
  const c = structuredClone(b); c.widgets[0].position.x = 50; h.capture(c);
  const restored = createSectionHistory({ state: c, saved: h.serialize() });
  let undo = restored.prepare('undo'); assert.deepEqual(undo.state, b); restored.commit('undo', undo);
  undo = restored.prepare('undo'); assert.deepEqual(undo.state, a); restored.commit('undo', undo);
  const redo = restored.prepare('redo'); assert.deepEqual(redo.state, b); restored.commit('redo', redo);
  const branch = structuredClone(b); branch.widgets[0].position.y = 25; restored.capture(branch);
  assert.equal(restored.redoDepth, 0);
});
test('bin survives reload, expires after 30 days, and keeps attached ink', () => {
  let clock = 1000; const a = state(); a.strokes = [{ id: 'ink', sourceWidgetId: 'note' }];
  const h = createSectionHistory({ state: a, now: () => clock });
  h.capture({ ...a, widgets: [], strokes: [] });
  const restored = createSectionHistory({ state: h.state, saved: h.serialize(), now: () => clock });
  assert.deepEqual(restored.prepareRestore(restored.listDeleted()[0].id), a);
  clock += RETENTION_MS; assert.equal(restored.listDeleted().length, 0);
  assert.equal(restored.undoDepth, 1);
});
test('history stays bounded and other sections do not share an undo stack', () => {
  const a = state(), h = createSectionHistory({ state: a, maxActions: 2 });
  for (let i = 1; i <= 4; i++) { a.widgets[0].position.x = i; h.capture(a); }
  assert.equal(h.undoDepth, 2); assert.equal(createSectionHistory({ state: state() }).undoDepth, 0);
});
test('restoring already-present content fails without partial application', () => {
  const a = state(), h = createSectionHistory({ state: a }); h.capture({ ...a, widgets: [] });
  const id = h.listDeleted()[0].id; h.capture(a);
  assert.throws(() => h.prepareRestore(id), /Nothing was undone/);
});
test('erased ink is recoverable from Recently Deleted', () => {
  const a = state(); a.strokes = [{ id: 'ink', points: [] }];
  const h = createSectionHistory({ state: a }); h.capture({ ...a, strokes: [] });
  assert.equal(h.listDeleted()[0].label, 'Ink'); assert.deepEqual(h.prepareRestore(h.listDeleted()[0].id), a);
});
