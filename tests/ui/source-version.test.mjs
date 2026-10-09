import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleCopy, sourceProvenance, sourceVersion } from '../../src/features/notebooks/source-version.js';
import { ExpandedAreaWidget } from '../../src/widgets/expanded-area/expanded-area-widget.js';
test('independent copies preserve provenance and dismissed revisions across reconstruction', () => {
  const source = { id: 'source', title: 'Notes', metadata: { note: 'one' } };
  const metadata = { independentCopy: true, sourceProvenance: sourceProvenance('note', source) };
  const widget = new ExpandedAreaWidget({ id: 'copy', metadata });
  assert.equal(isStaleCopy(widget.metadata, source), false);
  const next = { ...source, metadata: { note: 'two' } }; assert.equal(isStaleCopy(widget.metadata, next), true);
  widget.metadata.sourceProvenance.dismissedVersion = sourceVersion('note', next);
  assert.equal(isStaleCopy(new ExpandedAreaWidget(widget.toSerializableState()).metadata, next), false);
  const newer = { ...next, title: 'New title' }; assert.equal(isStaleCopy(widget.metadata, newer), true);
  widget.metadata.sourceProvenance.neverNotify = true; assert.equal(isStaleCopy(widget.metadata, newer), false);
  assert.equal(isStaleCopy(widget.metadata, null), false);
});
