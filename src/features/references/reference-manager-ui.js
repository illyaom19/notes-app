import {
  renderNotePreview,
  renderPdfPreview,
  renderReferencePreview,
} from "./reference-preview-renderer.js";

const PREVIEW_BASE_X = 28;
const PREVIEW_BASE_Y = 84;
const PREVIEW_STACK_OFFSET = 28;
const PREVIEW_MIN_WIDTH = 240;
const PREVIEW_MIN_HEIGHT = 152;
const PREVIEW_EDGE_PADDING = 8;
const PREVIEW_SNAP_THRESHOLD = 14;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function safeCountLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rowTemplate({ kind, id, title, subtitle, linkedDefaultLabel }) {
  const showFrozen = kind !== "note";
  return `
    <article class="reference-manager-row" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(id)}">
      <button type="button" class="reference-manager-row-main" data-action="open-preview" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(id)}">
        <span class="reference-manager-row-title">${escapeHtml(title)}</span>
        <span class="reference-manager-row-subtitle">${escapeHtml(subtitle)}</span>
      </button>
      <div class="reference-manager-row-actions">
        <button type="button" data-action="import-linked" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(id)}">${escapeHtml(linkedDefaultLabel)}</button>
        ${
          showFrozen
            ? `<button type="button" data-action="import-frozen" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(id)}">Frozen</button>`
            : ""
        }
        <button type="button" data-action="rename-entry" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(id)}">Rename</button>
        <button type="button" data-action="delete-entry" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(id)}">Delete</button>
      </div>
    </article>
  `;
}

function previewTitle(entry, kind) {
  if (kind === "document") {
    return text(entry.title, "Notebook Document");
  }
  if (kind === "note") {
    return text(entry.title, "Notebook Note");
  }
  return text(entry.title, "Notebook Reference");
}

function makePreviewId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function createReferenceManagerUi({
  launcherButton,
  overlayElement,
  panelElement,
  closeButton,
  referencesTabButton,
  notesTabButton,
  documentsTabButton,
  referencesListElement,
  notesListElement,
  documentsListElement,
  referencesCountElement,
  notesCountElement,
  documentsCountElement,
  previewLayerElement,
  onImportReference,
  onImportNote,
  onImportDocument,
  onRenameReference,
  onDeleteReference,
  onRenameNote,
  onDeleteNote,
  onRenameDocument,
  onDeleteDocument,
  onLoadDocumentBytes,
  canvasElement,
}) {
  if (!(launcherButton instanceof HTMLButtonElement)) {
    return {
      render: () => {},
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      dispose: () => {},
    };
  }

  let overlayOpen = false;
  let activeTab = "references";
  let references = [];
  let notes = [];
  let documents = [];
  const previewCards = new Map();
  const previewState = new Map();
  let dragState = null;
  let lastFocusedBeforeOverlay = null;
  const eventDisposers = [];

  function bind(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }
    target.addEventListener(type, handler, options);
    eventDisposers.push(() => {
      target.removeEventListener(type, handler, options);
    });
  }

  function setTab(nextTab) {
    activeTab = nextTab === "documents" || nextTab === "notes" ? nextTab : "references";

    if (referencesTabButton instanceof HTMLButtonElement) {
      referencesTabButton.dataset.active = activeTab === "references" ? "true" : "false";
    }
    if (notesTabButton instanceof HTMLButtonElement) {
      notesTabButton.dataset.active = activeTab === "notes" ? "true" : "false";
    }
    if (documentsTabButton instanceof HTMLButtonElement) {
      documentsTabButton.dataset.active = activeTab === "documents" ? "true" : "false";
    }
    if (referencesListElement instanceof HTMLElement) {
      referencesListElement.hidden = activeTab !== "references";
    }
    if (notesListElement instanceof HTMLElement) {
      notesListElement.hidden = activeTab !== "notes";
    }
    if (documentsListElement instanceof HTMLElement) {
      documentsListElement.hidden = activeTab !== "documents";
    }
  }

  function setOverlayOpen(nextOpen) {
    const wasOpen = overlayOpen;
    overlayOpen = Boolean(nextOpen);
    if (overlayElement instanceof HTMLElement) {
      overlayElement.hidden = !overlayOpen;
      overlayElement.dataset.open = overlayOpen ? "true" : "false";
      overlayElement.setAttribute("aria-hidden", overlayOpen ? "false" : "true");
    }
    launcherButton.dataset.open = overlayOpen ? "true" : "false";
    launcherButton.setAttribute("aria-expanded", overlayOpen ? "true" : "false");

    if (overlayOpen) {
      const active = document.activeElement;
      lastFocusedBeforeOverlay = active instanceof HTMLElement ? active : null;
      queueMicrotask(() => {
        const focusables = getOverlayFocusables();
        const initialTarget = focusables[0] ?? panelElement;
        if (initialTarget instanceof HTMLElement) {
          initialTarget.focus();
        }
      });
      return;
    }

    if (wasOpen) {
      const restoreTarget =
        lastFocusedBeforeOverlay instanceof HTMLElement &&
        document.contains(lastFocusedBeforeOverlay)
          ? lastFocusedBeforeOverlay
          : launcherButton;
      queueMicrotask(() => {
        restoreTarget.focus();
      });
    }
    lastFocusedBeforeOverlay = null;
  }

  function getOverlayFocusables() {
    if (!(panelElement instanceof HTMLElement)) {
      return [];
    }
    return Array.from(
      panelElement.querySelectorAll(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((entry) => entry instanceof HTMLElement && !entry.hasAttribute("hidden"));
  }

  function findEntry(kind, entryId) {
    if (kind === "document") {
      return documents.find((entry) => entry.id === entryId) ?? null;
    }
    if (kind === "note") {
      return notes.find((entry) => entry.id === entryId) ?? null;
    }
    return references.find((entry) => entry.id === entryId) ?? null;
  }

  function canvasViewportBounds() {
    const rect =
      canvasElement instanceof HTMLElement
        ? canvasElement.getBoundingClientRect()
        : {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
          };
    return {
      minX: rect.left + PREVIEW_EDGE_PADDING,
      maxX: rect.right - PREVIEW_EDGE_PADDING,
      minY: rect.top + PREVIEW_EDGE_PADDING,
      maxY: rect.bottom - PREVIEW_EDGE_PADDING,
    };
  }

  function clampCardPosition(card, left, top) {
    const viewport = canvasViewportBounds();
    return {
      left: clamp(left, viewport.minX, Math.max(viewport.minX, viewport.maxX - card.offsetWidth)),
      top: clamp(top, viewport.minY, Math.max(viewport.minY, viewport.maxY - card.offsetHeight)),
    };
  }

  function snapCardToCanvasEdges(card) {
    const viewport = canvasViewportBounds();
    const minLeft = viewport.minX;
    const maxLeft = Math.max(viewport.minX, viewport.maxX - card.offsetWidth);
    const minTop = viewport.minY;
    const maxTop = Math.max(viewport.minY, viewport.maxY - card.offsetHeight);

    let left = card.offsetLeft;
    let top = card.offsetTop;

    if (Math.abs(left - minLeft) <= PREVIEW_SNAP_THRESHOLD) {
      left = minLeft;
    } else if (Math.abs(left - maxLeft) <= PREVIEW_SNAP_THRESHOLD) {
      left = maxLeft;
    }

    if (Math.abs(top - minTop) <= PREVIEW_SNAP_THRESHOLD) {
      top = minTop;
    } else if (Math.abs(top - maxTop) <= PREVIEW_SNAP_THRESHOLD) {
      top = maxTop;
    }

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function clampAllPreviewCards() {
    for (const card of previewCards.values()) {
      if (!(card instanceof HTMLElement)) {
        continue;
      }
      const next = clampCardPosition(card, card.offsetLeft, card.offsetTop);
      card.style.left = `${next.left}px`;
      card.style.top = `${next.top}px`;
    }
  }

  function closePreview(previewId) {
    const state = previewState.get(previewId);
    if (state?.abortController) {
      state.abortController.abort();
    }
    previewState.delete(previewId);

    const card = previewCards.get(previewId);
    if (!card) {
      return;
    }

    previewCards.delete(previewId);
    card.remove();
  }

  async function renderPreviewContent(previewId, kind, entry) {
    const card = previewCards.get(previewId);
    if (!(card instanceof HTMLElement)) {
      return;
    }

    const content = card.querySelector(".reference-preview-content");
    if (!(content instanceof HTMLElement)) {
      return;
    }

    const current = previewState.get(previewId) ?? {
      collapsed: false,
      abortController: null,
    };
    if (current.collapsed) {
      return;
    }
    if (current.abortController) {
      current.abortController.abort();
    }

    const abortController = new AbortController();
    previewState.set(previewId, {
      collapsed: false,
      abortController,
    });

    if (kind === "note") {
      renderNotePreview(content, entry);
      return;
    }

    if (kind === "document") {
      await renderPdfPreview(content, entry, {
        loadDocumentBytes: onLoadDocumentBytes,
        signal: abortController.signal,
      });
      return;
    }

    renderReferencePreview(content, entry);
  }

  function renderPreviewCard(kind, entry) {
    if (!(previewLayerElement instanceof HTMLElement)) {
      return;
    }

    const previewId = makePreviewId("preview");
    const card = document.createElement("article");
    card.className = "reference-preview-card";
    card.dataset.previewId = previewId;
    card.dataset.kind = kind;
    card.dataset.entryId = entry.id;

    const stackDepth = previewCards.size;
    const viewport = canvasViewportBounds();
    const initialLeft = clamp(
      viewport.minX + PREVIEW_BASE_X + stackDepth * PREVIEW_STACK_OFFSET,
      viewport.minX,
      Math.max(viewport.minX, viewport.maxX - PREVIEW_MIN_WIDTH),
    );
    const initialTop = clamp(
      viewport.minY + PREVIEW_BASE_Y + stackDepth * PREVIEW_STACK_OFFSET,
      viewport.minY,
      Math.max(viewport.minY, viewport.maxY - PREVIEW_MIN_HEIGHT),
    );
    card.style.left = `${initialLeft}px`;
    card.style.top = `${initialTop}px`;

    card.innerHTML = `
      <header class="reference-preview-card-header" data-drag-handle="true">
        <strong>${escapeHtml(previewTitle(entry, kind))}</strong>
        <div class="reference-preview-card-header-actions">
          <button type="button" data-action="preview-add" data-kind="${escapeHtml(kind)}" data-entry-id="${escapeHtml(entry.id)}">Add</button>
          <button type="button" data-action="toggle-preview-collapse" data-preview-id="${previewId}" aria-label="Collapse preview">-</button>
          <button type="button" data-action="close-preview" data-preview-id="${previewId}" aria-label="Close preview">X</button>
        </div>
      </header>
      <div class="reference-preview-card-body" data-preview-body="true">
        <div class="reference-preview-content"></div>
      </div>
    `;

    previewLayerElement.append(card);
    previewCards.set(previewId, card);
    previewState.set(previewId, {
      collapsed: false,
      abortController: null,
    });
    void renderPreviewContent(previewId, kind, entry);
  }

  async function importEntry(kind, entry) {
    if (!entry) {
      return;
    }

    if (kind === "document") {
      await onImportDocument?.(entry);
      return;
    }
    if (kind === "note") {
      await onImportNote?.(entry);
      return;
    }

    await onImportReference?.(entry);
  }

  function togglePreviewCollapsed(previewId) {
    const card = previewCards.get(previewId);
    if (!(card instanceof HTMLElement)) {
      return;
    }

    const body = card.querySelector('[data-preview-body="true"]');
    if (!(body instanceof HTMLElement)) {
      return;
    }

    const state = previewState.get(previewId) ?? {
      collapsed: false,
      abortController: null,
    };
    const nextCollapsed = !state.collapsed;

    if (nextCollapsed && state.abortController) {
      state.abortController.abort();
    }

    previewState.set(previewId, {
      collapsed: nextCollapsed,
      abortController: nextCollapsed ? null : state.abortController,
    });

    body.hidden = nextCollapsed;
    card.dataset.collapsed = nextCollapsed ? "true" : "false";

    const button = card.querySelector(`button[data-action="toggle-preview-collapse"][data-preview-id="${previewId}"]`);
    if (button instanceof HTMLButtonElement) {
      button.textContent = nextCollapsed ? "+" : "-";
      button.setAttribute("aria-label", nextCollapsed ? "Expand preview" : "Collapse preview");
    }

    if (!nextCollapsed) {
      const kind = card.dataset.kind === "document" ? "document" : card.dataset.kind === "note" ? "note" : "reference";
      const entryId = card.dataset.entryId;
      const entry = entryId ? findEntry(kind, entryId) : null;
      if (entry) {
        void renderPreviewContent(previewId, kind, entry);
      }
    }
  }

  async function handleListAction(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-action][data-kind][data-entry-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const action = button.dataset.action;
    const kind =
      button.dataset.kind === "document" ? "document" : button.dataset.kind === "note" ? "note" : "reference";
    const entryId = button.dataset.entryId;
    if (!entryId) {
      return;
    }

    const entry = findEntry(kind, entryId);
    if (!entry) {
      return;
    }

    if (action === "open-preview") {
      renderPreviewCard(kind, entry);
      return;
    }

    if (action === "import-linked") {
      await importEntry(kind, entry);
      return;
    }

    if (action === "import-frozen") {
      await importEntry(kind, entry);
      return;
    }

    if (action === "rename-entry") {
      if (kind === "document") {
        await onRenameDocument?.(entry);
      } else if (kind === "note") {
        await onRenameNote?.(entry);
      } else {
        await onRenameReference?.(entry);
      }
      return;
    }

    if (action === "delete-entry") {
      if (kind === "document") {
        await onDeleteDocument?.(entry);
      } else if (kind === "note") {
        await onDeleteNote?.(entry);
      } else {
        await onDeleteReference?.(entry);
      }
    }
  }

  async function handlePreviewAction(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const closeButtonCandidate = target.closest("button[data-action='close-preview'][data-preview-id]");
    if (closeButtonCandidate instanceof HTMLButtonElement) {
      const previewId = closeButtonCandidate.dataset.previewId;
      if (previewId) {
        closePreview(previewId);
      }
      return;
    }

    const collapseButtonCandidate = target.closest("button[data-action='toggle-preview-collapse'][data-preview-id]");
    if (collapseButtonCandidate instanceof HTMLButtonElement) {
      const previewId = collapseButtonCandidate.dataset.previewId;
      if (previewId) {
        togglePreviewCollapsed(previewId);
      }
      return;
    }

    const actionButton = target.closest("button[data-action][data-kind][data-entry-id]");
    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    const action = actionButton.dataset.action;
    if (action !== "preview-add") {
      return;
    }

    const kind =
      actionButton.dataset.kind === "document"
        ? "document"
        : actionButton.dataset.kind === "note"
          ? "note"
          : "reference";
    const entryId = actionButton.dataset.entryId;
    if (!entryId) {
      return;
    }

    const entry = findEntry(kind, entryId);
    if (!entry) {
      return;
    }

    await importEntry(kind, entry);
  }

  function startPreviewDrag(event) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest("button")) {
      return;
    }

    const header = target.closest("[data-drag-handle='true']");
    if (!(header instanceof HTMLElement)) {
      return;
    }

    const card = header.closest(".reference-preview-card");
    if (!(card instanceof HTMLElement)) {
      return;
    }

    dragState = {
      card,
      pointerId: event.pointerId,
      offsetX: event.clientX - card.offsetLeft,
      offsetY: event.clientY - card.offsetTop,
    };

    if (card.setPointerCapture) {
      card.setPointerCapture(event.pointerId);
    }
  }

  function movePreviewDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const card = dragState.card;
    const nextPosition = clampCardPosition(card, event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);

    card.style.left = `${nextPosition.left}px`;
    card.style.top = `${nextPosition.top}px`;
  }

  function endPreviewDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.card.releasePointerCapture && dragState.card.hasPointerCapture(event.pointerId)) {
      dragState.card.releasePointerCapture(event.pointerId);
    }
    snapCardToCanvasEdges(dragState.card);
    dragState = null;
  }

  function closeOnBackdrop(event) {
    if (!overlayOpen || !(overlayElement instanceof HTMLElement)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (panelElement instanceof HTMLElement && panelElement.contains(target)) {
      return;
    }

    if (overlayElement.contains(target)) {
      setOverlayOpen(false);
    }
  }

  const onLauncherClick = () => {
    setOverlayOpen(!overlayOpen);
  };

  const onCloseClick = () => {
    setOverlayOpen(false);
  };

  const onReferencesTabClick = () => {
    setTab("references");
  };

  const onDocumentsTabClick = () => {
    setTab("documents");
  };

  const onNotesTabClick = () => {
    setTab("notes");
  };

  const onReferencesListClick = (event) => {
    void handleListAction(event);
  };

  const onDocumentsListClick = (event) => {
    void handleListAction(event);
  };

  const onNotesListClick = (event) => {
    void handleListAction(event);
  };

  const onPreviewLayerClick = (event) => {
    void handlePreviewAction(event);
  };

  const onWindowKeyDown = (event) => {
    if (overlayOpen && event.key === "Tab") {
      const focusables = getOverlayFocusables();
      if (focusables.length > 0) {
        const active = document.activeElement;
        const currentIndex = focusables.findIndex((entry) => entry === active);
        const nextIndex = event.shiftKey
          ? currentIndex <= 0
            ? focusables.length - 1
            : currentIndex - 1
          : currentIndex >= focusables.length - 1
            ? 0
            : currentIndex + 1;
        event.preventDefault();
        event.stopPropagation();
        focusables[nextIndex]?.focus();
        return;
      }
    }

    if (event.key === "Escape") {
      if (overlayOpen) {
        event.preventDefault();
        event.stopPropagation();
        setOverlayOpen(false);
        return;
      }

      const previewIds = Array.from(previewCards.keys());
      const lastPreviewId = previewIds[previewIds.length - 1] ?? null;
      if (lastPreviewId) {
        closePreview(lastPreviewId);
      }
    }
  };

  const onWindowResize = () => {
    clampAllPreviewCards();
  };

  function wireStaticEvents() {
    bind(launcherButton, "click", onLauncherClick);
    bind(closeButton, "click", onCloseClick);
    bind(overlayElement, "pointerdown", closeOnBackdrop);
    bind(referencesTabButton, "click", onReferencesTabClick);
    bind(notesTabButton, "click", onNotesTabClick);
    bind(documentsTabButton, "click", onDocumentsTabClick);
    bind(referencesListElement, "click", onReferencesListClick);
    bind(notesListElement, "click", onNotesListClick);
    bind(documentsListElement, "click", onDocumentsListClick);
    bind(previewLayerElement, "click", onPreviewLayerClick);
    bind(previewLayerElement, "pointerdown", startPreviewDrag);
    bind(previewLayerElement, "pointermove", movePreviewDrag);
    bind(previewLayerElement, "pointerup", endPreviewDrag);
    bind(previewLayerElement, "pointercancel", endPreviewDrag);
    bind(window, "keydown", onWindowKeyDown);
    bind(window, "resize", onWindowResize, { passive: true });
  }

  wireStaticEvents();
  setOverlayOpen(false);
  setTab("references");

  return {
    render({ references: nextReferences = [], notes: nextNotes = [], documents: nextDocuments = [] } = {}) {
      references = asArray(nextReferences);
      notes = asArray(nextNotes);
      documents = asArray(nextDocuments);

      if (referencesCountElement instanceof HTMLElement) {
        referencesCountElement.textContent = safeCountLabel(references.length, "reference", "references");
      }

      if (documentsCountElement instanceof HTMLElement) {
        documentsCountElement.textContent = safeCountLabel(documents.length, "document", "documents");
      }
      if (notesCountElement instanceof HTMLElement) {
        notesCountElement.textContent = safeCountLabel(notes.length, "note", "notes");
      }

      if (referencesListElement instanceof HTMLElement) {
        if (references.length < 1) {
          referencesListElement.innerHTML = "<p class='reference-manager-empty'>No notebook references yet.</p>";
        } else {
          referencesListElement.innerHTML = references
            .map((entry) =>
              rowTemplate({
                kind: "reference",
                id: entry.id,
                title: text(entry.title, "Reference"),
                subtitle: text(entry.sourceLabel, "Notebook Reference"),
                linkedDefaultLabel: "Linked",
              }),
            )
            .join("");
        }
      }

      if (documentsListElement instanceof HTMLElement) {
        if (documents.length < 1) {
          documentsListElement.innerHTML = "<p class='reference-manager-empty'>No notebook documents yet.</p>";
        } else {
          documentsListElement.innerHTML = documents
            .map((entry) =>
              rowTemplate({
                kind: "document",
                id: entry.id,
                title: text(entry.title, "Document"),
                subtitle: text(entry.fileName, "document.pdf"),
                linkedDefaultLabel: "Place Linked",
              }),
            )
            .join("");
        }
      }

      if (notesListElement instanceof HTMLElement) {
        if (notes.length < 1) {
          notesListElement.innerHTML = "<p class='reference-manager-empty'>No notebook notes yet.</p>";
        } else {
          notesListElement.innerHTML = notes
            .map((entry) =>
              rowTemplate({
                kind: "note",
                id: entry.id,
                title: text(entry.title, "Notes"),
                subtitle: text(entry.metadata?.note, "Notebook Note"),
                linkedDefaultLabel: "Place",
              }),
            )
            .join("");
        }
      }
    },

    open({ tab = "references" } = {}) {
      setTab(tab);
      setOverlayOpen(true);
    },

    close() {
      setOverlayOpen(false);
    },

    toggle({ tab = null } = {}) {
      if (tab) {
        setTab(tab);
      }
      setOverlayOpen(!overlayOpen);
    },

    isOpen() {
      return overlayOpen;
    },

    dispose() {
      for (const previewId of previewCards.keys()) {
        closePreview(previewId);
      }
      for (const disposeEvent of eventDisposers.splice(0, eventDisposers.length)) {
        disposeEvent();
      }
    },
  };
}
