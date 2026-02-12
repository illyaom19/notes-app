export function createDocumentPdfRuntime({
  runtime,
  registry,
  documentManager,
  notebookDocumentLibraryStore,
  getActiveContextId,
  makeId,
  normalizeCreationIntent,
  resolvePlacementForCreation,
  defaultPlacement,
  withCreationProvenance,
  decodeBase64ToBytes,
  showNoticeDialog,
  showSelectDialog,
  showActionDialog,
  flushWorkspacePersist,
  updateWidgetUi,
  updateWhitespaceZoneCount,
  onAnalyzeWhitespaceForPdfWidget,
  onLastPdfWidgetIdChange,
  onResolvePreferredPdfWidget,
  onPruneActiveDocuments,
  requestStorageCleanupNow,
  readStorageEstimateSnapshot,
  formatMegabytes,
  createPdfRasterDocumentFromBytes,
  pdfFileInput,
  setPendingPdfImportIntent,
  syncLinkedNotebookDocumentInstances,
} = {}) {
  if (!runtime || !registry || !documentManager || !notebookDocumentLibraryStore) {
    throw new Error("Document PDF runtime requires runtime, registry, and stores.");
  }

  function listWidgetIds() {
    return runtime.listWidgets().map((widget) => widget.id);
  }

  function createDocumentEntryForPdf({
    title,
    widgetId,
    sourceType = "pdf",
    sourceDocumentId = null,
    linkStatus = "frozen",
    sourceSnapshot = null,
  }) {
    return documentManager.openDocument({
      title,
      widgetId,
      sourceType,
      sourceDocumentId,
      linkStatus,
      sourceSnapshot,
    });
  }

  function bindReferenceToActiveDocument(referenceWidgetId) {
    return documentManager.bindReferenceToActive(referenceWidgetId);
  }

  function bindReferenceToDocument(documentId, referenceWidgetId) {
    if (!documentId || !referenceWidgetId) {
      return false;
    }

    const current = documentManager.getBindings(documentId);
    const nextReferenceIds = [...(current?.defaultReferenceIds ?? []), referenceWidgetId];
    return documentManager.updateBindings(
      documentId,
      {
        defaultReferenceIds: nextReferenceIds,
        formulaSheetIds: current?.formulaSheetIds ?? [],
      },
      listWidgetIds(),
    );
  }

  function bindFormulaWidgetToDocument(documentId, widgetId) {
    if (!documentId || !widgetId) {
      return false;
    }

    const current = documentManager.getBindings(documentId);
    const nextFormulaIds = [...(current?.formulaSheetIds ?? []), widgetId];
    return documentManager.updateBindings(
      documentId,
      {
        defaultReferenceIds: current?.defaultReferenceIds ?? [],
        formulaSheetIds: nextFormulaIds,
      },
      listWidgetIds(),
    );
  }

  function focusDocumentWidgets(documentId, { selectPrimary = true } = {}) {
    const targetDocument = documentManager.getDocumentById(documentId);
    if (!targetDocument) {
      return;
    }

    const bindings = documentManager.getBindings(documentId);
    const relatedWidgetIds = [
      targetDocument.widgetId,
      ...(bindings?.defaultReferenceIds ?? []),
      ...(bindings?.formulaSheetIds ?? []),
    ];

    for (const widgetId of relatedWidgetIds) {
      const widget = runtime.getWidgetById(widgetId);
      if (!widget) {
        continue;
      }
      runtime.bringWidgetToFront(widget.id);
    }

    if (selectPrimary && runtime.getWidgetById(targetDocument.widgetId)) {
      runtime.setFocusedWidgetId(targetDocument.widgetId);
      runtime.setSelectedWidgetId(targetDocument.widgetId);
    }
  }

  function setActiveDocument(documentId, { focus = true } = {}) {
    const changed = documentManager.setActiveDocument(documentId);
    if (!changed) {
      return false;
    }

    const activeDocument = documentManager.getActiveDocument();
    if (activeDocument) {
      const widget = runtime.getWidgetById(activeDocument.widgetId);
      if (widget?.type === "pdf-document") {
        onLastPdfWidgetIdChange?.(widget.id);
      }
    }

    if (focus) {
      focusDocumentWidgets(documentId);
    }

    updateWidgetUi?.();
    return true;
  }

  function syncPdfDocumentMetadata() {
    const documents = documentManager.listDocuments();
    const documentByWidgetId = new Map(documents.map((entry) => [entry.widgetId, entry]));

    for (const widget of runtime.listWidgets()) {
      if (widget.type !== "pdf-document") {
        continue;
      }

      const linked = documentByWidgetId.get(widget.id);
      if (linked) {
        widget.metadata.documentId = linked.id;
        widget.metadata.sourceDocumentId = linked.sourceDocumentId ?? null;
        if (linked.linkStatus === "linked" && typeof linked.title === "string" && linked.title.trim()) {
          widget.metadata.title = linked.title;
        }
        continue;
      }

      const created = createDocumentEntryForPdf({
        title: widget.metadata?.title ?? widget.fileName ?? "Document",
        widgetId: widget.id,
      });
      if (created) {
        widget.metadata.documentId = created.id;
      }
    }
  }

  async function createPdfWidgetFromBytes({
    bytes,
    rasterDocument = null,
    fileName,
    definition = {},
    intent = null,
    sourceDocument = null,
    linkStatus = "frozen",
  } = {}) {
    if (!rasterDocument && (!(bytes instanceof Uint8Array) || bytes.length < 1)) {
      throw new Error("PDF source is unavailable.");
    }

    const normalizedIntent = normalizeCreationIntent(intent);
    const placement = resolvePlacementForCreation({
      type: "pdf-document",
      intent: normalizedIntent,
      requestedSize: definition.size,
      fallbackPlacement: defaultPlacement(-180, -120, 36, 30),
    });
    const finalPosition = definition.position ?? placement.position;
    const finalPlacement = { ...placement, position: finalPosition };
    const source = sourceDocument && typeof sourceDocument === "object" ? sourceDocument : null;
    const resolvedTitle =
      typeof definition.metadata?.title === "string" && definition.metadata.title.trim()
        ? definition.metadata.title.trim()
        : typeof source?.title === "string" && source.title.trim()
          ? source.title.trim()
          : typeof fileName === "string" && fileName.trim()
            ? fileName.trim()
            : "Document";
    const resolvedFileName =
      typeof source?.fileName === "string" && source.fileName.trim()
        ? source.fileName.trim()
        : typeof fileName === "string" && fileName.trim()
          ? fileName.trim()
          : "document.pdf";

    const widget = await registry.instantiate("pdf-document", {
      id: definition.id ?? makeId("pdf"),
      position: finalPosition,
      size: placement.size,
      metadata: withCreationProvenance(
        {
          title: resolvedTitle,
          sourceDocumentId: source?.id ?? null,
          ...(definition.metadata ?? {}),
        },
        normalizedIntent,
        finalPlacement,
        "pdf-document",
      ),
      dataPayload: {
        bytes: bytes instanceof Uint8Array ? bytes : null,
        rasterDocument: rasterDocument && typeof rasterDocument === "object" ? rasterDocument : null,
        fileName: resolvedFileName,
      },
      collapsed: definition.collapsed,
    });

    runtime.addWidget(widget);
    onLastPdfWidgetIdChange?.(widget.id);

    const documentEntry = createDocumentEntryForPdf({
      title: resolvedTitle,
      widgetId: widget.id,
      sourceType: source?.sourceType ?? "pdf",
      sourceDocumentId: source?.id ?? null,
      linkStatus: source ? (linkStatus === "linked" ? "linked" : "frozen") : "frozen",
      sourceSnapshot: source
        ? {
            title: source.title,
            sourceType: source.sourceType,
          }
        : null,
    });
    if (documentEntry) {
      widget.metadata.documentId = documentEntry.id;
      widget.metadata.sourceDocumentId = documentEntry.sourceDocumentId ?? null;
      focusDocumentWidgets(documentEntry.id, { selectPrimary: true });
    }

    const persistedImmediately = flushWorkspacePersist?.();
    if (!persistedImmediately) {
      runtime.removeWidgetById(widget.id);
      if (onResolvePreferredPdfWidget && onLastPdfWidgetIdChange) {
        onLastPdfWidgetIdChange(onResolvePreferredPdfWidget()?.id ?? null);
      }
      onPruneActiveDocuments?.();
      updateWidgetUi?.();
      throw new Error("Storage is full. PDF import was canceled because it could not be persisted.");
    }

    updateWidgetUi?.();
    window.setTimeout(() => {
      void onAnalyzeWhitespaceForPdfWidget?.(widget);
    }, 30);
    return widget;
  }

  async function createPdfWidgetFromFile(
    file,
    definition = {},
    intent = null,
    { linkStatus = "linked", sourceDocumentId = null } = {},
  ) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const rasterDocument = await createPdfRasterDocumentFromBytes(bytes);
    let sourceDocument = null;
    const activeContextId = getActiveContextId?.();

    if (activeContextId) {
      const candidate = {
        title:
          typeof definition.metadata?.title === "string" && definition.metadata.title.trim()
            ? definition.metadata.title.trim()
            : file.name,
        sourceType: "pdf",
        fileName: file.name,
        rasterDocument,
        status: "active",
        tags: ["pdf"],
      };
      if (typeof sourceDocumentId === "string" && sourceDocumentId.trim()) {
        candidate.id = sourceDocumentId.trim();
      }
      sourceDocument = notebookDocumentLibraryStore.upsertDocument(activeContextId, candidate);
      if (!sourceDocument) {
        requestStorageCleanupNow?.();
        const snapshot = await readStorageEstimateSnapshot?.();
        const usageLabel =
          snapshot && snapshot.hasQuota
            ? `${formatMegabytes(snapshot.usage)} / ${formatMegabytes(snapshot.quota)}`
            : "Unknown";
        throw new Error(
          `Storage is full. Unable to store this PDF in the notebook library. Current usage: ${usageLabel}.`,
        );
      }
    }

    const widget = await createPdfWidgetFromBytes({
      bytes: null,
      rasterDocument,
      fileName: file.name,
      definition,
      intent,
      sourceDocument,
      linkStatus,
    });

    if (sourceDocument) {
      syncLinkedNotebookDocumentInstances?.({ sourceDocumentId: sourceDocument.id });
    }

    return widget;
  }

  function listActiveNotebookDocuments() {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId) {
      return [];
    }
    return notebookDocumentLibraryStore.listDocuments(activeContextId);
  }

  async function promptForNotebookSourceDocument() {
    const documents = listActiveNotebookDocuments();
    if (documents.length < 1) {
      return null;
    }

    const selected = await showSelectDialog?.({
      title: "Choose Notebook Document",
      message: "Pick a notebook document to place.",
      label: "Notebook document",
      confirmLabel: "Select",
      options: documents.map((entry) => ({
        id: entry.id,
        label: entry.title,
      })),
    });
    if (!selected) {
      return null;
    }

    return documents.find((entry) => entry.id === selected.id) ?? null;
  }

  async function resolvePdfCreationFlow() {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId) {
      return {
        type: "import-file",
        linkStatus: "frozen",
        sourceDocumentId: null,
        sourceDocument: null,
      };
    }

    const notebookDocuments = listActiveNotebookDocuments();
    if (notebookDocuments.length < 1) {
      return {
        type: "import-file",
        linkStatus: "linked",
        sourceDocumentId: null,
        sourceDocument: null,
      };
    }

    const choice = await showActionDialog?.({
      title: "Add PDF",
      message: "Choose how to add a PDF widget.",
      actions: [
        { id: "import-new", label: "Import New PDF", variant: "primary" },
        { id: "linked", label: "Place Linked Notebook Document", variant: "primary" },
        { id: "frozen", label: "Place Frozen Notebook Document", variant: "primary" },
      ],
    });
    if (!choice) {
      return null;
    }

    if (choice === "import-new") {
      return {
        type: "import-file",
        linkStatus: "linked",
        sourceDocumentId: null,
        sourceDocument: null,
      };
    }

    if (choice === "linked" || choice === "frozen") {
      const sourceDocument = await promptForNotebookSourceDocument();
      if (!sourceDocument) {
        return null;
      }

      return {
        type: "instantiate-source",
        linkStatus: choice === "linked" ? "linked" : "frozen",
        sourceDocumentId: sourceDocument.id,
        sourceDocument,
      };
    }

    return null;
  }

  async function createPdfWidgetFromNotebookSource(sourceDocument, intent = null, { linkStatus = "linked" } = {}) {
    if (!sourceDocument || typeof sourceDocument !== "object") {
      return null;
    }

    const activeContextId = getActiveContextId?.();
    const rasterDocument = activeContextId
      ? notebookDocumentLibraryStore.loadDocumentRaster(activeContextId, sourceDocument.id)
      : null;
    const bytes =
      rasterDocument && typeof rasterDocument === "object"
        ? null
        : activeContextId
          ? notebookDocumentLibraryStore.loadDocumentBytes(activeContextId, sourceDocument.id)
          : decodeBase64ToBytes(sourceDocument.bytesBase64);
    if (!rasterDocument && (!(bytes instanceof Uint8Array) || bytes.length < 1)) {
      await showNoticeDialog?.(`Notebook document "${sourceDocument.title}" is missing import data. Reupload it.`, {
        title: "PDF Import",
      });
      return null;
    }

    const widget = await createPdfWidgetFromBytes({
      bytes,
      rasterDocument,
      fileName: sourceDocument.fileName ?? `${sourceDocument.title}.pdf`,
      definition: {
        metadata: {
          title: sourceDocument.title,
        },
      },
      intent,
      sourceDocument,
      linkStatus,
    });

    if (linkStatus === "linked") {
      syncLinkedNotebookDocumentInstances?.({ sourceDocumentId: sourceDocument.id });
    }

    return widget;
  }

  async function hydrateExistingPdfWidgetFromBytes(
    widget,
    bytes,
    { rasterDocument = null, fileName = null, sourceDocument = null, clearMissingFlag = true } = {},
  ) {
    if (!widget || widget.type !== "pdf-document") {
      return false;
    }
    if (!rasterDocument && (!(bytes instanceof Uint8Array) || bytes.length < 1)) {
      return false;
    }

    const restoredZones = typeof widget.getWhitespaceZones === "function" ? widget.getWhitespaceZones() : [];

    widget.pdfBytes = bytes instanceof Uint8Array ? bytes : null;
    widget.rasterDocument = rasterDocument && typeof rasterDocument === "object" ? rasterDocument : null;
    if (typeof fileName === "string" && fileName.trim()) {
      widget.fileName = fileName.trim();
    }
    if (sourceDocument && typeof sourceDocument === "object") {
      widget.metadata = {
        ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
        sourceDocumentId:
          typeof sourceDocument.id === "string" && sourceDocument.id.trim()
            ? sourceDocument.id
            : widget.metadata?.sourceDocumentId ?? null,
        title:
          typeof sourceDocument.title === "string" && sourceDocument.title.trim()
            ? sourceDocument.title.trim()
            : widget.metadata?.title ?? widget.fileName ?? "Document",
      };
    }
    if (clearMissingFlag) {
      widget.metadata = {
        ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
        missingPdfBytes: false,
      };
    }

    await widget.initialize();
    if (Array.isArray(restoredZones) && restoredZones.length > 0 && typeof widget.setWhitespaceZones === "function") {
      widget.setWhitespaceZones(restoredZones);
    }
    updateWhitespaceZoneCount?.();
    updateWidgetUi?.();
    flushWorkspacePersist?.();
    return true;
  }

  async function tryRestorePdfWidgetFromLinkedDocument(widget) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !widget || widget.type !== "pdf-document") {
      return false;
    }

    const sourceDocumentId =
      typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
        ? widget.metadata.sourceDocumentId.trim()
        : null;
    let sourceDocument = sourceDocumentId
      ? notebookDocumentLibraryStore.getDocument(activeContextId, sourceDocumentId)
      : null;

    if (!sourceDocument || sourceDocument.status === "deleted") {
      const widgetFileName =
        typeof widget.fileName === "string" && widget.fileName.trim() ? widget.fileName.trim() : null;
      const widgetTitle =
        typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
          ? widget.metadata.title.trim()
          : null;
      const candidates = notebookDocumentLibraryStore
        .listDocuments(activeContextId)
        .filter((entry) => entry?.status !== "deleted");
      sourceDocument =
        candidates.find(
          (entry) =>
            widgetFileName &&
            typeof entry.fileName === "string" &&
            entry.fileName.trim() &&
            entry.fileName.trim() === widgetFileName,
        ) ??
        candidates.find(
          (entry) =>
            widgetTitle &&
            typeof entry.title === "string" &&
            entry.title.trim() &&
            entry.title.trim() === widgetTitle,
        ) ??
        null;
    }

    if (!sourceDocument || sourceDocument.status === "deleted") {
      return false;
    }

    const resolvedSourceDocumentId =
      typeof sourceDocument.id === "string" && sourceDocument.id.trim() ? sourceDocument.id.trim() : null;
    if (!resolvedSourceDocumentId) {
      return false;
    }

    const rasterDocument = notebookDocumentLibraryStore.loadDocumentRaster(activeContextId, resolvedSourceDocumentId);
    const bytes = rasterDocument
      ? null
      : notebookDocumentLibraryStore.loadDocumentBytes(activeContextId, resolvedSourceDocumentId);
    if (!rasterDocument && (!(bytes instanceof Uint8Array) || bytes.length < 1)) {
      return false;
    }

    if (sourceDocumentId !== resolvedSourceDocumentId) {
      widget.metadata = {
        ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
        sourceDocumentId: resolvedSourceDocumentId,
      };
    }

    return hydrateExistingPdfWidgetFromBytes(widget, bytes, {
      rasterDocument,
      fileName: sourceDocument.fileName ?? widget.fileName ?? "document.pdf",
      sourceDocument,
    });
  }

  async function reimportMissingPdfForWidget(widgetId, file) {
    const widget = runtime.getWidgetById(widgetId);
    if (!widget || widget.type !== "pdf-document") {
      throw new Error("Target PDF widget no longer exists.");
    }
    if (!(file instanceof File)) {
      throw new Error("No PDF file selected.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const rasterDocument = await createPdfRasterDocumentFromBytes(bytes);
    let sourceDocument = null;
    const sourceDocumentId =
      typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
        ? widget.metadata.sourceDocumentId.trim()
        : null;
    const activeContextId = getActiveContextId?.();

    if (activeContextId && sourceDocumentId) {
      sourceDocument = notebookDocumentLibraryStore.upsertDocument(activeContextId, {
        id: sourceDocumentId,
        title:
          typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
            ? widget.metadata.title.trim()
            : file.name,
        sourceType: "pdf",
        fileName: file.name,
        rasterDocument,
        status: "active",
        tags: ["pdf"],
      });
    }

    const restored = await hydrateExistingPdfWidgetFromBytes(widget, bytes, {
      rasterDocument,
      fileName: file.name,
      sourceDocument,
    });
    if (!restored) {
      throw new Error("Failed to restore PDF widget.");
    }
  }

  async function openPdfPickerForIntent(intent, { linkStatus = "linked", sourceDocumentId = null } = {}) {
    if (!(pdfFileInput instanceof HTMLInputElement)) {
      await showNoticeDialog?.("PDF input is unavailable.", { title: "PDF Import" });
      return false;
    }

    const normalizedIntent = normalizeCreationIntent(intent);
    if (!normalizedIntent || normalizedIntent.type !== "pdf-document") {
      return false;
    }

    setPendingPdfImportIntent?.({
      intent: normalizedIntent,
      linkStatus: linkStatus === "frozen" ? "frozen" : "linked",
      sourceDocumentId:
        typeof sourceDocumentId === "string" && sourceDocumentId.trim() ? sourceDocumentId.trim() : null,
    });
    pdfFileInput.value = "";
    pdfFileInput.click();
    return true;
  }

  async function openPdfPickerForExistingWidget(widget) {
    if (!(pdfFileInput instanceof HTMLInputElement)) {
      await showNoticeDialog?.("PDF input is unavailable.", { title: "PDF Import" });
      return false;
    }
    if (!widget || widget.type !== "pdf-document") {
      return false;
    }

    setPendingPdfImportIntent?.({
      targetWidgetId: widget.id,
      sourceDocumentId:
        typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
          ? widget.metadata.sourceDocumentId.trim()
          : null,
      linkStatus: "linked",
      intent: null,
    });
    pdfFileInput.value = "";
    pdfFileInput.click();
    return true;
  }

  return {
    createDocumentEntryForPdf,
    bindReferenceToActiveDocument,
    bindReferenceToDocument,
    bindFormulaWidgetToDocument,
    focusDocumentWidgets,
    setActiveDocument,
    syncPdfDocumentMetadata,
    createPdfWidgetFromBytes,
    createPdfWidgetFromFile,
    listActiveNotebookDocuments,
    promptForNotebookSourceDocument,
    resolvePdfCreationFlow,
    createPdfWidgetFromNotebookSource,
    hydrateExistingPdfWidgetFromBytes,
    tryRestorePdfWidgetFromLinkedDocument,
    reimportMissingPdfForWidget,
    openPdfPickerForIntent,
    openPdfPickerForExistingWidget,
  };
}
