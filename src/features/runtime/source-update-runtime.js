import { sourceVersion, isStaleCopy } from "../notebooks/source-version.js";
export function createSourceUpdateRuntime({ runtime, canvas, notebookLibraryStore, notebookDocumentLibraryStore, getNotebookId, isRestoring, getHistory, snapshotForHistory, workspaceScopeId, makeId, showConfirmDialog, notifyRecovery, onChanged, persist }) {
  let sourceHintTimer = null;
function sourceForWidget(widget) {
  const origin = widget?.metadata?.sourceProvenance;
  if (!origin) return null;
  return origin.kind === 'note' ? notebookLibraryStore.getNote(getNotebookId(), origin.id) : origin.kind === 'reference' ? notebookLibraryStore.getReference(getNotebookId(), origin.id) : notebookDocumentLibraryStore.getDocument(getNotebookId(), origin.id);
}
function schedule() {
  if (sourceHintTimer) return;
  sourceHintTimer = setTimeout(renderSourceHints, 120);
}
function renderSourceHints() {
  sourceHintTimer = null;
  const layer = document.querySelector('#source-hints');
  if (!layer || isRestoring()) return;
  layer.replaceChildren();
  const canvasRect = canvas.getBoundingClientRect();
  for (const widget of runtime.listWidgets()) {
    const source = sourceForWidget(widget);
    if (!isStaleCopy(widget.metadata, source)) continue;
    const point = runtime.camera.worldToScreen(widget.position.x, widget.position.y);
    if (point.x + widget.size.width * runtime.camera.zoom < 0 || point.y + widget.size.height * runtime.camera.zoom < 0 || point.x > canvasRect.width || point.y > canvasRect.height) continue;
    const hint = document.createElement('aside'); hint.className = 'source-hint';
    hint.style.left = `${Math.max(8, Math.min(canvasRect.width - 310, point.x))}px`;
    hint.style.top = `${canvasRect.top + Math.max(8, Math.min(canvasRect.height - 90, point.y))}px`;
    const label = document.createElement('span'); label.textContent = 'A new source version is available'; hint.append(label);
    for (const [text, action] of [['Link', async () => linkSourceCopy(widget)], ['Dismiss', () => { widget.metadata.sourceProvenance.dismissedVersion = sourceVersion(widget.metadata.sourceProvenance.kind, source); onChanged(); }], ['Never for this widget', () => { widget.metadata.sourceProvenance.neverNotify = true; onChanged(); }]]) {
      const button = document.createElement('button'); button.textContent = text; button.onclick = () => Promise.resolve().then(action).catch((error) => notifyRecovery(error.message)); hint.append(button);
    }
    layer.append(hint);
  }
}
async function linkSourceCopy(widget) {
  const source = sourceForWidget(widget); if (!source) return;
  const scope = workspaceScopeId();
  const version = sourceVersion(widget.metadata.sourceProvenance.kind, source);
  const preview = source.textContent || source.metadata?.note || (source.metadata?.diagramDoc?.nodes ?? []).map((node) => node.label).join(' → ') || source.fileName || source.title;
  const confirmed = await showConfirmDialog({ title: `Link to ${source.title}?`, message: `Latest source: ${preview.slice(0, 1200)}\nThis replaces this copy’s contents and attached ink. Its position stays the same. Undo restores your independent version.`, confirmLabel: 'Replace and link' });
  if (!confirmed || scope !== workspaceScopeId() || runtime.getWidgetById(widget.id) !== widget) return;
  if (version !== sourceVersion(widget.metadata.sourceProvenance.kind, sourceForWidget(widget))) { notifyRecovery('The source changed. Open Link again to review the latest version.'); return; }
  getHistory().capture();
  const next = snapshotForHistory();
  const entry = next.widgets.find((item) => item.id === widget.id); if (!entry) return;
  entry.metadata = { ...entry.metadata, title: source.title, independentCopy: false, sourceProvenance: { ...entry.metadata.sourceProvenance, version } };
  const kind = entry.metadata.sourceProvenance.kind;
  if (kind === 'note') { entry.metadata.libraryNoteId = source.id; entry.metadata.note = source.metadata?.note ?? ''; if (widget.type === 'diagram') entry.dataPayload.diagramDoc = source.metadata.diagramDoc; }
  if (kind === 'reference') { entry.metadata.librarySourceId = source.id; entry.dataPayload = { ...entry.dataPayload, ...source, imageAssetId: null }; }
  if (kind === 'document') { entry.metadata.sourceDocumentId = source.id; entry.dataPayload = { ...entry.dataPayload, fileName: source.fileName, pdfAssetId: source.pdfAssetId, pdfRasterAssetId: source.pdfRasterAssetId }; for (const doc of next.documents) if (doc.widgetId === widget.id) { doc.sourceDocumentId = source.id; doc.linkStatus = 'linked'; } }
  next.strokes = next.strokes.filter((stroke) => stroke.sourceWidgetId !== widget.id);
  // Native UV/local stroke coordinates are reused on the replacement widget.
  for (const stroke of source.inkStrokes ?? []) next.strokes.push({ ...structuredClone(stroke), id: makeId('stroke'), contextId: workspaceScopeId(), sourceWidgetId: widget.id });
  await getHistory().replace(next, 'Link source copy');
}


return { schedule };
}
