export async function prepareNotebookSearch({ index, sectionsStore, activeContextId, workspaceScopeId, contextWorkspaceStore, notebookLibraryStore, notebookDocumentLibraryStore }) {
  for (const section of sectionsStore.listSections(activeContextId)) {
    const scope = workspaceScopeId(activeContextId, section.id);
    if (scope === workspaceScopeId()) continue;
    const workspace = contextWorkspaceStore.readSearchWorkspace(scope);
    const widgets = workspace.widgets.map((widget) => ({ ...widget, ...widget.dataPayload, diagramDoc: widget.dataPayload?.diagramDoc }));
    index.reindexNow({ runtime: { listWidgets: () => widgets }, contextId: scope });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const widgets = [
    ...notebookLibraryStore.listNotes(activeContextId).map((entry) => ({ ...entry, id: `note:${entry.id}`, type: entry.metadata?.widgetType ?? 'expanded-area', metadata: { ...entry.metadata, title: entry.title } })),
    ...notebookLibraryStore.listReferences(activeContextId).map((entry) => ({ ...entry, id: `reference:${entry.id}`, type: 'reference-popup', metadata: { title: entry.title, tags: entry.tags } })),
    ...notebookDocumentLibraryStore.listDocuments(activeContextId).map((entry) => ({ ...entry, id: `document:${entry.id}`, type: 'pdf-document', metadata: { title: entry.title, tags: entry.tags, pdfText: (notebookDocumentLibraryStore.loadDocumentRaster(activeContextId, entry.id)?.pages ?? []).map(page => page.text ?? "").join(" ") } })),
  ];
  index.reindexNow({ runtime: { listWidgets: () => widgets }, contextId: `${activeContextId}::library` });
}
