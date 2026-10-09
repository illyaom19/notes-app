import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchIndex } from '../../src/features/search/search-index.js';
test('index retains other sections and separates identical widget ids', () => {
  const index = createSearchIndex();
  const reindex = (scope, title) => index.reindexNow({ contextId: scope, runtime: { listWidgets: () => title ? [{ id: 'same', type: 'expanded-area', metadata: { title } }] : [] } });
  reindex('book::one', 'Algebra'); reindex('book::two', 'Biology');
  assert.equal(index.getEntryCount(), 2); assert.equal(index.query('Algebra')[0].contextId, 'book::one');
  reindex('book::two', null); assert.equal(index.query('Algebra').length, 1);
});
test('full content, diagram labels and PDF body text are searchable without leaking source ids', () => {
  const index = createSearchIndex();
  index.reindexNow({ contextId: 'book::one', runtime: { listWidgets: () => [
    { id: 'n', type: 'expanded-area', metadata: { note: 'x'.repeat(400) + ' mitochondria', creationSourceWidgetId: 'secretidentifier' } },
    { id: 'd', type: 'diagram', diagramDoc: { nodes: [{ label: 'Osmosis' }] } },
    { id: 'p', type: 'pdf-document', metadata: { pdfText: 'Chlorophyll' } },
  ] } });
  assert.equal(index.query('mitochondria').length, 1); assert.equal(index.query('Osmosis').length, 1); assert.equal(index.query('Chlorophyll').length, 1); assert.equal(index.query('secretidentifier').length, 0);
});

test('cached search inputs invalidate after in-place edits and preserve snippet case', () => {
  const index = createSearchIndex();
  const widget = { id: 'cached', type: 'expanded-area', metadata: { title: 'Sample', note: 'Chlorophyll absorbs light' } };
  const options = { runtime: { listWidgets: () => [widget] }, contextId: 'section' };
  assert.equal(index.reindexNow(options).changed, 1);
  assert.equal(index.reindexNow(options).changed, 0);
  assert.match(index.query('chlorophyll')[0].snippet, /Chlorophyll/);
  widget.metadata.note = 'Mitochondria release energy';
  assert.equal(index.reindexNow(options).changed, 1);
  assert.equal(index.query('chlorophyll').length, 0);
  assert.equal(index.query('mitochondria').length, 1);
});
