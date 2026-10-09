import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagramWidget } from '../../src/widgets/diagram/diagram-widget.js';
test('Delete without a selected node never clears the diagram', () => {
  const widget = new DiagramWidget({ id: 'diagram' });
  widget.addNode('process', {}); widget.diagramDoc.selectedNodeId = null;
  const before = widget.diagramDoc.nodes.length;
  assert.equal(widget.applyToolbarAction('clear-selection'), false);
  assert.equal(widget.diagramDoc.nodes.length, before);
  widget.diagramDoc.selectedNodeId = widget.diagramDoc.nodes[0].id;
  assert.equal(widget.applyToolbarAction('clear-selection'), true);
  assert.equal(widget.diagramDoc.nodes.length, before - 1);
});
