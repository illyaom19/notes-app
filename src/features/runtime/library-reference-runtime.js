import {
  fingerprintDocumentEntry,
  fingerprintNoteEntry,
  fingerprintReferenceEntry,
} from "../notebooks/library-fingerprint.js";

export function createLibraryReferenceRuntime({
  runtime,
  documentManager,
  notebookLibraryStore,
  notebookDocumentLibraryStore,
  getActiveContextId,
  makeId,
  captureWidgetInkSnapshot,
  restoreWidgetInkSnapshot,
  updateWidgetUi,
  flushWorkspacePersist,
  scheduleSuggestionAnalysis,
  syncLinkedNotebookDocumentInstances,
  createReferencePopupWidget,
  createExpandedAreaWidget,
  createDiagramWidget,
  createCreationIntent,
  normalizeCreationIntent,
  viewportCenterAnchor,
  createPdfWidgetFromNotebookSource,
  cloneJsonValue,
  showTextPromptDialog,
  showConfirmDialog,
  showNoticeDialog,
} = {}) {
  if (!runtime || !documentManager || !notebookLibraryStore || !notebookDocumentLibraryStore) {
    throw new Error("Library reference runtime requires runtime + stores.");
  }

  function referenceLibraryEntryFromWidget(widget) {
    if (!widget || widget.type !== "reference-popup") {
      return null;
    }

    const metadata = widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {};
    const popupMetadata =
      metadata.popupMetadata && typeof metadata.popupMetadata === "object" ? metadata.popupMetadata : {};
    const sourceId =
      typeof metadata.librarySourceId === "string" && metadata.librarySourceId.trim()
        ? metadata.librarySourceId
        : null;

    return {
      id: sourceId ?? makeId("lib-ref"),
      title: typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim() : "Reference",
      sourceLabel:
        typeof widget.sourceLabel === "string" && widget.sourceLabel.trim()
          ? widget.sourceLabel.trim()
          : "Notebook Reference",
      popupMetadata: {
        ...popupMetadata,
        title:
          typeof popupMetadata.title === "string" && popupMetadata.title.trim()
            ? popupMetadata.title.trim()
            : typeof metadata.title === "string" && metadata.title.trim()
              ? metadata.title.trim()
              : "Reference",
        tags: Array.isArray(popupMetadata.tags)
          ? popupMetadata.tags.filter((entry) => typeof entry === "string" && entry.trim())
          : [],
      },
      contentType:
        widget.contentType === "image" || widget.contentType === "definition" ? widget.contentType : "text",
      imageDataUrl:
        typeof widget.imageDataUrl === "string" && widget.imageDataUrl.trim() ? widget.imageDataUrl : null,
      textContent: typeof widget.textContent === "string" ? widget.textContent : "",
      citation:
        widget.citation && typeof widget.citation === "object"
          ? {
              ...widget.citation,
            }
          : null,
      researchCaptureId:
        typeof widget.researchCaptureId === "string" && widget.researchCaptureId.trim()
          ? widget.researchCaptureId
          : null,
      inkStrokes: captureWidgetInkSnapshot(widget.id),
    };
  }

  async function saveReferenceWidgetToNotebookLibrary(widget) {
    const activeContextId = getActiveContextId?.();
    if (!widget || widget.type !== "reference-popup" || !activeContextId) {
      return false;
    }

    const entry = referenceLibraryEntryFromWidget(widget);
    if (!entry) {
      return false;
    }

    const saved = notebookLibraryStore.upsertReference(activeContextId, entry);
    if (!saved) {
      return false;
    }

    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      title: saved.title,
      librarySourceId: saved.id,
      popupMetadata: {
        ...saved.popupMetadata,
        title: saved.title,
      },
    };
    return true;
  }

  function noteLibraryEntryFromWidget(widget) {
    if (!widget || widget.type !== "expanded-area") {
      return null;
    }
    const sourceId =
      typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
        ? widget.metadata.libraryNoteId.trim()
        : null;
    const title =
      typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
        ? widget.metadata.title.trim()
        : "Notes";
    const noteBody = typeof widget.metadata?.note === "string" ? widget.metadata.note : "";
    return {
      id: sourceId ?? makeId("lib-note"),
      title,
      metadata: {
        title,
        note: noteBody,
      },
      size: {
        width: widget.size.width,
        height: widget.size.height,
      },
      inkStrokes: captureWidgetInkSnapshot(widget.id),
    };
  }

  function diagramLibraryEntryFromWidget(widget) {
    if (!widget || widget.type !== "diagram") {
      return null;
    }
    const sourceId =
      typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
        ? widget.metadata.libraryNoteId.trim()
        : null;
    const title =
      typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
        ? widget.metadata.title.trim()
        : "Diagram";
    const diagramDoc =
      typeof widget.getDiagramDoc === "function"
        ? widget.getDiagramDoc()
        : cloneJsonValue(widget.diagramDoc, null);

    return {
      id: sourceId ?? makeId("lib-note"),
      title,
      metadata: {
        title,
        note: "",
        widgetType: "diagram",
        ...(diagramDoc && typeof diagramDoc === "object" ? { diagramDoc } : {}),
      },
      size: {
        width: widget.size.width,
        height: widget.size.height,
      },
      inkStrokes: captureWidgetInkSnapshot(widget.id),
    };
  }

  async function saveNoteWidgetToNotebookLibrary(widget) {
    const activeContextId = getActiveContextId?.();
    if (!widget || (widget.type !== "expanded-area" && widget.type !== "diagram") || !activeContextId) {
      return false;
    }

    const entry = widget.type === "diagram" ? diagramLibraryEntryFromWidget(widget) : noteLibraryEntryFromWidget(widget);
    if (!entry) {
      return false;
    }

    const saved = notebookLibraryStore.upsertNote(activeContextId, entry);
    if (!saved) {
      return false;
    }

    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      title: saved.title,
      libraryNoteId: saved.id,
    };
    if (widget.type === "expanded-area") {
      widget.metadata.note = saved.metadata?.note ?? "";
    }
    return true;
  }

  function savePdfWidgetToNotebookLibrary(widget, { forcedSourceId = null } = {}) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !widget || widget.type !== "pdf-document") {
      return null;
    }
    const rasterDocument =
      widget.rasterDocument && typeof widget.rasterDocument === "object" ? widget.rasterDocument : null;
    if (!rasterDocument && !(widget.pdfBytes instanceof Uint8Array)) {
      return null;
    }

    const candidate = {
      title: widget.metadata?.title ?? widget.fileName ?? "Document",
      sourceType: "pdf",
      fileName: widget.fileName ?? "document.pdf",
      rasterDocument,
      pdfBytes: rasterDocument ? null : widget.pdfBytes,
      inkStrokes: captureWidgetInkSnapshot(widget.id),
      status: "active",
      tags: ["pdf"],
    };
    if (typeof forcedSourceId === "string" && forcedSourceId.trim()) {
      candidate.id = forcedSourceId.trim();
    }

    const source = notebookDocumentLibraryStore.upsertDocument(activeContextId, candidate);
    if (!source) {
      return null;
    }

    const owner = documentManager.getDocumentByWidgetId(widget.id);
    if (owner) {
      documentManager.setDocumentSourceState(owner.id, {
        sourceDocumentId: source.id,
        linkStatus: "linked",
        sourceSnapshot: {
          title: source.title,
          sourceType: source.sourceType,
        },
        title: source.title,
        sourceType: source.sourceType,
      });
    }

    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      sourceDocumentId: source.id,
      title: source.title,
    };
    return source;
  }

  function isWidgetDuplicateInNotebookLibrary(widget) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !widget) {
      return false;
    }

    if (widget.type === "reference-popup") {
      const sourceId =
        typeof widget.metadata?.librarySourceId === "string" && widget.metadata.librarySourceId.trim()
          ? widget.metadata.librarySourceId.trim()
          : null;
      if (sourceId && notebookLibraryStore.getReference(activeContextId, sourceId)) {
        return true;
      }

      const candidate = referenceLibraryEntryFromWidget(widget);
      if (!candidate) {
        return false;
      }
      const candidateFingerprint = fingerprintReferenceEntry(candidate);
      const existing = notebookLibraryStore.listReferences(activeContextId);
      return existing.some((entry) => fingerprintReferenceEntry(entry) === candidateFingerprint);
    }

    if (widget.type === "expanded-area" || widget.type === "diagram") {
      const sourceId =
        typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
          ? widget.metadata.libraryNoteId.trim()
          : null;
      if (sourceId && notebookLibraryStore.getNote(activeContextId, sourceId)) {
        return true;
      }

      const candidate = widget.type === "diagram" ? diagramLibraryEntryFromWidget(widget) : noteLibraryEntryFromWidget(widget);
      if (!candidate) {
        return false;
      }
      const candidateFingerprint = fingerprintNoteEntry(candidate);
      const existing = notebookLibraryStore.listNotes(activeContextId);
      return existing.some((entry) => fingerprintNoteEntry(entry) === candidateFingerprint);
    }

    if (widget.type === "pdf-document") {
      const sourceId =
        typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
          ? widget.metadata.sourceDocumentId.trim()
          : null;
      if (sourceId && notebookDocumentLibraryStore.getDocument(activeContextId, sourceId)) {
        return true;
      }
      const rasterDocument =
        widget.rasterDocument && typeof widget.rasterDocument === "object" ? widget.rasterDocument : null;
      if (!rasterDocument && !(widget.pdfBytes instanceof Uint8Array)) {
        return false;
      }

      const candidateFingerprint = fingerprintDocumentEntry(
        {
          sourceDocumentId: null,
          inkStrokes: captureWidgetInkSnapshot(widget.id),
        },
        { pdfBytes: widget.pdfBytes, pdfRasterDocument: rasterDocument },
      );
      const documents = notebookDocumentLibraryStore.listDocuments(activeContextId);
      return documents.some((entry) => {
        const bytes = notebookDocumentLibraryStore.loadDocumentBytes(activeContextId, entry.id);
        const raster = notebookDocumentLibraryStore.loadDocumentRaster(activeContextId, entry.id);
        return fingerprintDocumentEntry(entry, { pdfBytes: bytes, pdfRasterDocument: raster }) === candidateFingerprint;
      });
    }

    return false;
  }

  async function addWidgetToNotebookLibraryFromDrag(widget) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !widget) {
      return { ok: false, reason: "unsupported" };
    }
    if (
      widget.type !== "reference-popup" &&
      widget.type !== "expanded-area" &&
      widget.type !== "diagram" &&
      widget.type !== "pdf-document"
    ) {
      return { ok: false, reason: "unsupported" };
    }

    if (isWidgetDuplicateInNotebookLibrary(widget)) {
      return { ok: false, reason: "duplicate" };
    }

    if (widget.type === "reference-popup") {
      const saved = await saveReferenceWidgetToNotebookLibrary(widget);
      if (!saved) {
        return { ok: false, reason: "failed" };
      }
      updateWidgetUi?.();
      return { ok: true };
    }

    if (widget.type === "expanded-area" || widget.type === "diagram") {
      const saved = await saveNoteWidgetToNotebookLibrary(widget);
      if (!saved) {
        return { ok: false, reason: "failed" };
      }
      updateWidgetUi?.();
      return { ok: true };
    }

    const sourceId =
      typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
        ? widget.metadata.sourceDocumentId.trim()
        : null;
    const saved = savePdfWidgetToNotebookLibrary(widget, { forcedSourceId: sourceId });
    if (!saved) {
      return { ok: false, reason: "failed" };
    }
    updateWidgetUi?.();
    return { ok: true };
  }

  async function toggleWidgetLibraryFromContextMenu(widget) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !widget) {
      return false;
    }

    if (widget.type === "reference-popup") {
      const sourceId =
        typeof widget.metadata?.librarySourceId === "string" && widget.metadata.librarySourceId.trim()
          ? widget.metadata.librarySourceId
          : null;

      if (sourceId) {
        const removed = notebookLibraryStore.deleteReference(activeContextId, sourceId);
        if (removed) {
          widget.metadata = {
            ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
            librarySourceId: null,
          };
          updateWidgetUi?.();
        }
        return removed;
      }

      return saveReferenceWidgetToNotebookLibrary(widget);
    }

    if (widget.type === "pdf-document") {
      const sourceId =
        typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
          ? widget.metadata.sourceDocumentId
          : null;

      if (sourceId) {
        const removed = notebookDocumentLibraryStore.deleteDocument(activeContextId, sourceId);
        if (removed) {
          syncLinkedNotebookDocumentInstances?.({ sourceDocumentId: sourceId });
          updateWidgetUi?.();
        }
        return removed;
      }

      const source = savePdfWidgetToNotebookLibrary(widget);
      if (!source) {
        return false;
      }
      updateWidgetUi?.();
      return true;
    }

    if (widget.type === "expanded-area" || widget.type === "diagram") {
      const sourceId =
        typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
          ? widget.metadata.libraryNoteId
          : null;

      if (sourceId) {
        const removed = notebookLibraryStore.deleteNote(activeContextId, sourceId);
        if (removed) {
          widget.metadata = {
            ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
            libraryNoteId: null,
          };
          updateWidgetUi?.();
        }
        return removed;
      }

      const saved = await saveNoteWidgetToNotebookLibrary(widget);
      if (saved) {
        updateWidgetUi?.();
      }
      return saved;
    }

    return false;
  }

  function syncLinkedLibraryMetadata() {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId) {
      return false;
    }

    let changed = false;

    for (const widget of runtime.listWidgets()) {
      if (!widget || widget.type !== "reference-popup") {
        continue;
      }

      const sourceId =
        typeof widget.metadata?.librarySourceId === "string" && widget.metadata.librarySourceId.trim()
          ? widget.metadata.librarySourceId
          : null;
      if (!sourceId) {
        continue;
      }

      const source = notebookLibraryStore.getReference(activeContextId, sourceId);
      if (!source) {
        continue;
      }

      const currentTitle = typeof widget.metadata?.title === "string" ? widget.metadata.title : "";
      const currentSourceLabel = typeof widget.sourceLabel === "string" ? widget.sourceLabel : "";
      const currentPopupMetadata =
        widget.metadata?.popupMetadata && typeof widget.metadata.popupMetadata === "object"
          ? widget.metadata.popupMetadata
          : {};
      const nextPopupMetadata = {
        ...source.popupMetadata,
        title: source.title,
      };
      const popupChanged =
        (currentPopupMetadata.id ?? null) !== (nextPopupMetadata.id ?? null) ||
        (currentPopupMetadata.type ?? null) !== (nextPopupMetadata.type ?? null) ||
        (currentPopupMetadata.sourceDocumentId ?? null) !== (nextPopupMetadata.sourceDocumentId ?? null) ||
        (currentPopupMetadata.title ?? null) !== (nextPopupMetadata.title ?? null);
      const widgetChanged = currentTitle !== source.title || currentSourceLabel !== source.sourceLabel || popupChanged;
      if (!widgetChanged) {
        continue;
      }

      widget.metadata = {
        ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
        title: source.title,
        librarySourceId: source.id,
        popupMetadata: nextPopupMetadata,
      };
      widget.sourceLabel = source.sourceLabel;
      changed = true;
    }

    for (const widget of runtime.listWidgets()) {
      if (!widget || (widget.type !== "expanded-area" && widget.type !== "diagram")) {
        continue;
      }

      const sourceId =
        typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
          ? widget.metadata.libraryNoteId
          : null;
      if (!sourceId) {
        continue;
      }

      const source = notebookLibraryStore.getNote(activeContextId, sourceId);
      if (!source) {
        continue;
      }

      const sourceNote = source.metadata?.note ?? "";
      const sourceWidgetType = source.metadata?.widgetType === "diagram" ? "diagram" : "expanded-area";
      const currentTitle = typeof widget.metadata?.title === "string" ? widget.metadata.title : "";
      const currentNote = typeof widget.metadata?.note === "string" ? widget.metadata.note : "";
      const sameNotePayload = currentTitle === source.title && currentNote === sourceNote;

      if (widget.type === "diagram") {
        let diagramChanged = false;
        if (sourceWidgetType === "diagram" && source.metadata?.diagramDoc && typeof widget.setDiagramDoc === "function") {
          const currentDiagram = typeof widget.getDiagramDoc === "function" ? widget.getDiagramDoc() : null;
          const nextDiagram = source.metadata.diagramDoc;
          const currentSerialized = JSON.stringify(currentDiagram ?? null);
          const nextSerialized = JSON.stringify(nextDiagram ?? null);
          if (currentSerialized !== nextSerialized) {
            widget.setDiagramDoc(nextDiagram);
            diagramChanged = true;
          }
        }

        if (sameNotePayload && !diagramChanged) {
          continue;
        }

        widget.metadata = {
          ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
          title: source.title,
          libraryNoteId: source.id,
        };
        changed = true;
        continue;
      }

      if (sameNotePayload) {
        continue;
      }

      widget.metadata = {
        ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
        title: source.title,
        note: sourceNote,
        libraryNoteId: source.id,
      };
      changed = true;
    }

    return changed;
  }

  function refreshLinkedWidgets({ sourceDocumentId = null } = {}) {
    const linkedDocsChanged = syncLinkedNotebookDocumentInstances?.({ sourceDocumentId });
    const linkedLibraryChanged = syncLinkedLibraryMetadata();
    if (linkedDocsChanged || linkedLibraryChanged) {
      updateWidgetUi?.();
      scheduleSuggestionAnalysis?.({ immediate: true });
    }
  }

  function syncWidgetsToLibrarySnapshots() {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId) {
      return;
    }

    for (const widget of runtime.listWidgets()) {
      if (!widget) {
        continue;
      }
      if (widget.type === "reference-popup") {
        const sourceId =
          typeof widget.metadata?.librarySourceId === "string" && widget.metadata.librarySourceId.trim()
            ? widget.metadata.librarySourceId
            : null;
        if (!sourceId) {
          continue;
        }
        const entry = referenceLibraryEntryFromWidget(widget);
        if (entry) {
          notebookLibraryStore.upsertReference(activeContextId, {
            ...entry,
            id: sourceId,
          });
        }
        continue;
      }

      if (widget.type === "expanded-area" || widget.type === "diagram") {
        const sourceId =
          typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
            ? widget.metadata.libraryNoteId
            : null;
        if (!sourceId) {
          continue;
        }
        const entry = widget.type === "diagram" ? diagramLibraryEntryFromWidget(widget) : noteLibraryEntryFromWidget(widget);
        if (entry) {
          notebookLibraryStore.upsertNote(activeContextId, {
            ...entry,
            id: sourceId,
          });
        }
      }

      if (widget.type === "pdf-document") {
        const sourceId =
          typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
            ? widget.metadata.sourceDocumentId
            : null;
        const rasterDocument =
          widget.rasterDocument && typeof widget.rasterDocument === "object" ? widget.rasterDocument : null;
        if (!sourceId || (!rasterDocument && (!(widget.pdfBytes instanceof Uint8Array) || widget.pdfBytes.length < 1))) {
          continue;
        }
        notebookDocumentLibraryStore.upsertDocument(activeContextId, {
          id: sourceId,
          title: widget.metadata?.title ?? widget.fileName ?? "Document",
          sourceType: "pdf",
          fileName: widget.fileName ?? "document.pdf",
          rasterDocument,
          pdfBytes: rasterDocument ? null : widget.pdfBytes,
          inkStrokes: captureWidgetInkSnapshot(widget.id),
          status: "active",
          tags: ["pdf"],
        });
      }
    }
  }

  async function createReferencePopupFromLibraryEntry(referenceEntry, { linkStatus = "linked", intent = null } = {}) {
    if (!referenceEntry || typeof referenceEntry !== "object") {
      return null;
    }

    const linked = linkStatus !== "frozen";
    const widget = await createReferencePopupWidget({
      intent: normalizeCreationIntent(intent),
      definition: {
        metadata: {
          title: referenceEntry.title,
          ...(linked ? { librarySourceId: referenceEntry.id } : {}),
          popupMetadata: {
            ...referenceEntry.popupMetadata,
            title: referenceEntry.title,
            tags: Array.from(
              new Set([...(referenceEntry.popupMetadata?.tags ?? []), linked ? "linked" : "frozen"]),
            ),
          },
        },
        dataPayload: {
          sourceLabel: referenceEntry.sourceLabel,
          contentType:
            referenceEntry.contentType === "image" || referenceEntry.contentType === "definition"
              ? referenceEntry.contentType
              : "text",
          imageDataUrl:
            typeof referenceEntry.imageDataUrl === "string" && referenceEntry.imageDataUrl.trim()
              ? referenceEntry.imageDataUrl
              : null,
          textContent: typeof referenceEntry.textContent === "string" ? referenceEntry.textContent : "",
          citation:
            referenceEntry.citation && typeof referenceEntry.citation === "object"
              ? {
                  ...referenceEntry.citation,
                }
              : null,
          researchCaptureId:
            typeof referenceEntry.researchCaptureId === "string" && referenceEntry.researchCaptureId.trim()
              ? referenceEntry.researchCaptureId
              : null,
        },
      },
    });
    if (widget && Array.isArray(referenceEntry.inkStrokes) && referenceEntry.inkStrokes.length > 0) {
      restoreWidgetInkSnapshot(referenceEntry.inkStrokes, widget.id);
      flushWorkspacePersist?.();
    }
    return widget;
  }

  async function createNoteWidgetFromLibraryEntry(noteEntry, intent = null) {
    if (!noteEntry || typeof noteEntry !== "object") {
      return null;
    }
    const isDiagram = noteEntry.metadata?.widgetType === "diagram";
    const widget = isDiagram
      ? await createDiagramWidget(
        {
          metadata: {
            title: noteEntry.title ?? "Diagram",
            libraryNoteId: noteEntry.id ?? null,
          },
          size: noteEntry.size,
          dataPayload: {
            diagramDoc:
              noteEntry.metadata?.diagramDoc && typeof noteEntry.metadata.diagramDoc === "object"
                ? cloneJsonValue(noteEntry.metadata.diagramDoc, null)
                : null,
          },
        },
        normalizeCreationIntent(intent),
      )
      : await createExpandedAreaWidget(
        {
          metadata: {
            title: noteEntry.title ?? "Notes",
            note: typeof noteEntry.metadata?.note === "string" ? noteEntry.metadata.note : "",
            libraryNoteId: noteEntry.id ?? null,
          },
          size: noteEntry.size,
        },
        normalizeCreationIntent(intent),
      );
    if (!widget) {
      return null;
    }
    if (Array.isArray(noteEntry.inkStrokes) && noteEntry.inkStrokes.length > 0) {
      restoreWidgetInkSnapshot(noteEntry.inkStrokes, widget.id);
      flushWorkspacePersist?.();
    }
    return widget;
  }

  async function createPdfWidgetFromLibraryEntry(sourceDocument, { linkStatus = "linked", intent = null } = {}) {
    const normalizedIntent =
      normalizeCreationIntent(intent) ??
      createCreationIntent({
        type: "pdf-document",
        anchor: viewportCenterAnchor(),
        sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
        createdFrom: "manual",
      });

    return createPdfWidgetFromNotebookSource(sourceDocument, normalizedIntent, {
      linkStatus: linkStatus === "frozen" ? "frozen" : "linked",
    });
  }

  async function renameNotebookReferenceFromManager(entry) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !entry) {
      return false;
    }

    const nextTitle = await showTextPromptDialog?.({
      title: "Rename Notebook Reference",
      label: "Reference name",
      defaultValue: entry.title,
      confirmLabel: "Rename",
    });
    if (!nextTitle) {
      return false;
    }

    const renamed = notebookLibraryStore.renameReference(activeContextId, entry.id, nextTitle);
    if (!renamed) {
      return false;
    }

    updateWidgetUi?.();
    return true;
  }

  async function renameNotebookNoteFromManager(entry) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !entry) {
      return false;
    }

    const nextTitle = await showTextPromptDialog?.({
      title: "Rename Notebook Note",
      label: "Note name",
      defaultValue: entry.title,
      confirmLabel: "Rename",
    });
    if (!nextTitle) {
      return false;
    }

    const renamed = notebookLibraryStore.renameNote(activeContextId, entry.id, nextTitle);
    if (!renamed) {
      return false;
    }

    updateWidgetUi?.();
    return true;
  }

  async function deleteNotebookReferenceFromManager(entry) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !entry) {
      return false;
    }

    const confirmed = await showConfirmDialog?.({
      title: "Delete Notebook Reference",
      message: `Delete notebook reference "${entry.title}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) {
      return false;
    }

    const deleted = notebookLibraryStore.deleteReference(activeContextId, entry.id);
    if (!deleted) {
      return false;
    }

    updateWidgetUi?.();
    return true;
  }

  async function deleteNotebookNoteFromManager(entry) {
    const activeContextId = getActiveContextId?.();
    if (!activeContextId || !entry) {
      return false;
    }

    const confirmed = await showConfirmDialog?.({
      title: "Delete Notebook Note",
      message: `Delete notebook note "${entry.title}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) {
      return false;
    }

    const deleted = notebookLibraryStore.deleteNote(activeContextId, entry.id);
    if (!deleted) {
      return false;
    }

    updateWidgetUi?.();
    return true;
  }

  async function showNotebookReferenceInfo(entry) {
    if (!entry) {
      return;
    }
    const lines = [
      `Type: ${entry.contentType === "image" ? "Snip" : "Reference"}`,
      `Title: ${entry.title ?? "Reference"}`,
      `Source: ${entry.sourceLabel ?? "Notebook Reference"}`,
      `Updated: ${entry.updatedAt ?? "unknown"}`,
      `Created: ${entry.createdAt ?? "unknown"}`,
    ];
    await showNoticeDialog?.(lines.join("\n"), { title: "Library Info" });
  }

  async function showNotebookNoteInfo(entry) {
    if (!entry) {
      return;
    }
    const isDiagram = entry.metadata?.widgetType === "diagram";
    const lines = [
      `Type: ${isDiagram ? "Diagram" : "Notes"}`,
      `Title: ${entry.title ?? (isDiagram ? "Diagram" : "Notes")}`,
      `Size: ${Math.round(Number(entry.size?.width) || 0)} x ${Math.round(Number(entry.size?.height) || 0)}`,
      `Updated: ${entry.updatedAt ?? "unknown"}`,
      `Created: ${entry.createdAt ?? "unknown"}`,
    ];
    await showNoticeDialog?.(lines.join("\n"), { title: "Library Info" });
  }

  async function showNotebookDocumentInfo(entry) {
    if (!entry) {
      return;
    }
    const lines = [
      "Type: PDF",
      `Title: ${entry.title ?? "Document"}`,
      `File: ${entry.fileName ?? "document.pdf"}`,
      `Status: ${entry.status ?? "active"}`,
      `Updated: ${entry.updatedAt ?? "unknown"}`,
      `Created: ${entry.createdAt ?? "unknown"}`,
    ];
    await showNoticeDialog?.(lines.join("\n"), { title: "Library Info" });
  }

  return {
    referenceLibraryEntryFromWidget,
    saveReferenceWidgetToNotebookLibrary,
    saveNoteWidgetToNotebookLibrary,
    savePdfWidgetToNotebookLibrary,
    isWidgetDuplicateInNotebookLibrary,
    addWidgetToNotebookLibraryFromDrag,
    toggleWidgetLibraryFromContextMenu,
    syncLinkedLibraryMetadata,
    syncWidgetsToLibrarySnapshots,
    refreshLinkedWidgets,
    createReferencePopupFromLibraryEntry,
    createNoteWidgetFromLibraryEntry,
    createPdfWidgetFromLibraryEntry,
    renameNotebookReferenceFromManager,
    renameNotebookNoteFromManager,
    deleteNotebookReferenceFromManager,
    deleteNotebookNoteFromManager,
    showNotebookReferenceInfo,
    showNotebookNoteInfo,
    showNotebookDocumentInfo,
  };
}
