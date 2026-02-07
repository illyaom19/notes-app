import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";
import { createDocumentManager } from "./features/documents/document-manager.js";
import { createWidgetContextMenu } from "./features/widget-system/long-press-menu.js";
import { createWidgetCreationController } from "./features/widget-system/widget-creation-controller.js";
import { createWidgetInteractionManager } from "./features/widget-system/widget-interaction-manager.js";

const importPdfButton = document.querySelector("#import-pdf");
const toggleToolsButton = document.querySelector("#toggle-tools");
const controlsPanel = document.querySelector("#controls-panel");
const detectWhitespaceButton = document.querySelector("#detect-whitespace");
const startSnipButton = document.querySelector("#start-snip");
const instantiateButton = document.querySelector("#instantiate-dummy");
const instantiateExpandedButton = document.querySelector("#instantiate-expanded");
const instantiateGraphButton = document.querySelector("#instantiate-graph");
const enableInkButton = document.querySelector("#enable-ink");
const undoInkButton = document.querySelector("#undo-ink");
const redoInkButton = document.querySelector("#redo-ink");
const startWorkerButton = document.querySelector("#start-worker");
const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const referenceCountOutput = document.querySelector("#reference-count");
const snipStateOutput = document.querySelector("#snip-state");
const whitespaceStateOutput = document.querySelector("#whitespace-state");
const whitespaceZoneCountOutput = document.querySelector("#whitespace-zone-count");
const graphCountOutput = document.querySelector("#graph-count");
const activeContextOutput = document.querySelector("#active-context");
const documentCountOutput = document.querySelector("#document-count");
const inkStateOutput = document.querySelector("#ink-state");
const strokeCountOutput = document.querySelector("#stroke-count");
const cameraOutput = document.querySelector("#camera-state");
const workerStateOutput = document.querySelector("#worker-state");
const canvas = document.querySelector("#workspace-canvas");
const widgetContextMenu = document.querySelector("#widget-context-menu");
const creationCommandMenu = document.querySelector("#creation-command-menu");
const pdfFileInput = document.querySelector("#pdf-file-input");
const documentTabs = document.querySelector("#document-tabs");
const documentSwitcher = document.querySelector("#document-switcher");
const documentSettingsHint = document.querySelector("#document-settings-hint");
const referenceBindingSelect = document.querySelector("#document-reference-bindings");
const formulaBindingSelect = document.querySelector("#document-formula-bindings");
const applyBindingsButton = document.querySelector("#apply-document-bindings");
const focusBindingsButton = document.querySelector("#focus-document-bindings");
const togglePinDocumentButton = document.querySelector("#toggle-pin-document");
const debugOnlyControls = Array.from(document.querySelectorAll('[data-debug-only="true"]'));

const contextSelect = document.querySelector("#context-select");
const newContextButton = document.querySelector("#new-context");
const renameContextButton = document.querySelector("#rename-context");
const deleteContextButton = document.querySelector("#delete-context");
const importContextWidgetButton = document.querySelector("#import-context-widget");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #workspace-canvas element.");
}

const loadedModules = new Set();
let inkFeature = null;
let popupInteractions = null;
let snipTool = null;
let whitespaceManager = null;
let graphInteractions = null;
let widgetInteractionManager = null;
let widgetCreationController = null;
let detachDocumentFocusSync = null;
let toolsPanelOpen = false;
let pendingPdfImportIntent = null;
let debugModeEnabled = false;

let contextStore = null;
let contextWorkspaceStore = null;
let contextUiController = null;

let activeContextId = null;
const documentManager = createDocumentManager();
let lastPdfWidgetId = null;
let lastReferenceWidgetId = null;
let lastDocumentUiRenderKey = "";

let restoringContext = false;
let persistTimer = null;

const registry = new WidgetRegistry();
registry.register("dummy", () => import("./widgets/dummy/index.js"));
registry.register("expanded-area", () => import("./widgets/expanded-area/index.js"));
registry.register("pdf-document", () => import("./widgets/pdf/index.js"));
registry.register("reference-popup", () => import("./widgets/reference-popup/index.js"));
registry.register("graph-widget", () => import("./widgets/graph/index.js"));
registry.onModuleLoaded((type) => {
  loadedModules.add(type);
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }
});

const runtime = new CanvasRuntime({
  canvas,
  onCameraChange: ({ x, y, zoom }) => {
    if (cameraOutput) {
      cameraOutput.textContent = `x=${x.toFixed(1)}, y=${y.toFixed(1)}, zoom=${zoom.toFixed(2)}`;
    }
  },
});

const workerClient = new BackgroundWorkerClient(
  new URL("./core/workers/analysis-worker.js", import.meta.url),
);

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function defaultPlacement(baseX, baseY, stepX, stepY) {
  return {
    x: baseX + runtime.getWidgetCount() * stepX,
    y: baseY + runtime.getWidgetCount() * stepY,
  };
}

const CREATION_TYPES = new Set([
  "dummy",
  "expanded-area",
  "graph-widget",
  "reference-popup",
  "pdf-document",
]);

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function readDebugModeFlag() {
  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get("debug");
  if (debugParam === "1" || debugParam === "true") {
    return true;
  }
  if (debugParam === "0" || debugParam === "false") {
    return false;
  }
  return window.localStorage.getItem("notes-app.debug-controls") === "1";
}

function syncDebugControls() {
  for (const control of debugOnlyControls) {
    if (control instanceof HTMLElement) {
      control.hidden = !debugModeEnabled;
    }
  }
}

function setDebugModeEnabled(nextEnabled) {
  debugModeEnabled = Boolean(nextEnabled);
  window.localStorage.setItem("notes-app.debug-controls", debugModeEnabled ? "1" : "0");
  syncDebugControls();
}

function viewportCenterAnchor() {
  return runtime.camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
}

function normalizeCreationIntent(intent) {
  if (!intent || typeof intent !== "object") {
    return null;
  }

  const type = typeof intent.type === "string" ? intent.type : null;
  if (!type || !CREATION_TYPES.has(type)) {
    return null;
  }

  const hasAnchor = intent.anchor && isFiniteNumber(intent.anchor.x) && isFiniteNumber(intent.anchor.y);
  const contextId =
    typeof intent.contextId === "string" && intent.contextId.trim()
      ? intent.contextId
      : activeContextId ?? null;

  return {
    type,
    anchor: hasAnchor ? { x: intent.anchor.x, y: intent.anchor.y } : null,
    sourceWidgetId:
      typeof intent.sourceWidgetId === "string" && intent.sourceWidgetId.trim()
        ? intent.sourceWidgetId
        : null,
    contextId,
    createdFrom:
      typeof intent.createdFrom === "string" && intent.createdFrom.trim()
        ? intent.createdFrom.trim()
        : "manual",
  };
}

function createCreationIntent({ type, anchor, sourceWidgetId, contextId, createdFrom } = {}) {
  return normalizeCreationIntent({
    type,
    anchor,
    sourceWidgetId,
    contextId: contextId ?? activeContextId ?? null,
    createdFrom: createdFrom ?? "manual",
  });
}

function anchorFromSourceWidget(sourceWidgetId) {
  if (!sourceWidgetId) {
    return null;
  }

  const sourceWidget = runtime.getWidgetById(sourceWidgetId);
  if (!sourceWidget) {
    return null;
  }

  const bounds =
    typeof sourceWidget.getInteractionBounds === "function"
      ? sourceWidget.getInteractionBounds()
      : sourceWidget.size;

  return {
    x: sourceWidget.position.x + Math.max(1, bounds.width) / 2,
    y: sourceWidget.position.y + Math.max(1, bounds.height) / 2,
  };
}

function anchorBesideWidget(sourceWidget) {
  if (!sourceWidget) {
    return viewportCenterAnchor();
  }

  const bounds =
    typeof sourceWidget.getInteractionBounds === "function"
      ? sourceWidget.getInteractionBounds()
      : sourceWidget.size;

  return {
    x: sourceWidget.position.x + Math.max(1, bounds.width) + 180,
    y: sourceWidget.position.y + Math.max(1, bounds.height) / 2,
  };
}

function positionFromCreationIntent(intent, size, fallback) {
  const normalized = normalizeCreationIntent(intent);
  const width = Math.max(1, size?.width ?? 280);
  const height = Math.max(1, size?.height ?? 200);

  const anchor =
    normalized?.anchor ?? anchorFromSourceWidget(normalized?.sourceWidgetId) ?? viewportCenterAnchor();
  if (!anchor || !isFiniteNumber(anchor.x) || !isFiniteNumber(anchor.y)) {
    return fallback;
  }

  return {
    x: anchor.x - width / 2,
    y: anchor.y - height / 2,
  };
}

function withCreationProvenance(metadata, intent) {
  const base = metadata && typeof metadata === "object" ? { ...metadata } : {};
  const normalized = normalizeCreationIntent(intent);

  if (!normalized) {
    return base;
  }

  return {
    ...base,
    createdFrom: normalized.createdFrom,
    creationSourceWidgetId: normalized.sourceWidgetId,
    creationContextId: normalized.contextId,
    creationCreatedAt: nowIso(),
  };
}

function clearRuntimeWidgets() {
  for (const widget of runtime.listWidgets()) {
    runtime.removeWidgetById(widget.id);
  }
}

function activeContextRecord() {
  if (!contextStore || !activeContextId) {
    return null;
  }
  return contextStore.getContextById(activeContextId);
}

function updateInkUi(state) {
  if (!inkStateOutput || !strokeCountOutput || !undoInkButton || !redoInkButton) {
    return;
  }

  strokeCountOutput.textContent = String(state.completedStrokes);
  undoInkButton.disabled = state.undoDepth < 1;
  redoInkButton.disabled = state.redoDepth < 1;

  if (state.activePointers > 0) {
    inkStateOutput.textContent = "writing";
    return;
  }

  inkStateOutput.textContent = "active";
}

function updateSnipUi({ armed, dragging }) {
  if (snipStateOutput) {
    if (dragging) {
      snipStateOutput.textContent = "capturing";
    } else if (armed) {
      snipStateOutput.textContent = "armed";
    } else {
      snipStateOutput.textContent = "idle";
    }
  }

  if (startSnipButton) {
    startSnipButton.textContent = armed ? "Stop Snip" : "Start Snip";
  }
}

function syncToolsUi() {
  if (controlsPanel instanceof HTMLElement) {
    controlsPanel.hidden = !toolsPanelOpen;
  }

  if (toggleToolsButton instanceof HTMLButtonElement) {
    toggleToolsButton.textContent = toolsPanelOpen ? "Hide Tools" : "Show Tools";
  }
}

function setWhitespaceState(value) {
  if (whitespaceStateOutput) {
    whitespaceStateOutput.textContent = value;
  }
}

function updateWhitespaceZoneCount() {
  if (!whitespaceZoneCountOutput) {
    return;
  }

  const zoneCount = runtime
    .listWidgets()
    .filter((widget) => widget.type === "pdf-document" && typeof widget.getWhitespaceZones === "function")
    .reduce((total, widget) => total + widget.getWhitespaceZones().length, 0);
  whitespaceZoneCountOutput.textContent = String(zoneCount);
}

function pruneActiveDocuments() {
  const existingWidgetIds = runtime.listWidgets().map((widget) => widget.id);
  documentManager.pruneForWidgets(existingWidgetIds);
}

function createDocumentEntryForPdf({ title, widgetId }) {
  return documentManager.openDocument({
    title,
    widgetId,
    sourceType: "pdf",
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
  const validWidgetIds = runtime.listWidgets().map((widget) => widget.id);
  return documentManager.updateBindings(
    documentId,
    {
      defaultReferenceIds: nextReferenceIds,
      formulaSheetIds: current?.formulaSheetIds ?? [],
    },
    validWidgetIds,
  );
}

function bindFormulaWidgetToDocument(documentId, widgetId) {
  if (!documentId || !widgetId) {
    return false;
  }

  const current = documentManager.getBindings(documentId);
  const nextFormulaIds = [...(current?.formulaSheetIds ?? []), widgetId];
  const validWidgetIds = runtime.listWidgets().map((widget) => widget.id);
  return documentManager.updateBindings(
    documentId,
    {
      defaultReferenceIds: current?.defaultReferenceIds ?? [],
      formulaSheetIds: nextFormulaIds,
    },
    validWidgetIds,
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
      lastPdfWidgetId = widget.id;
    }
  }

  if (focus) {
    focusDocumentWidgets(documentId);
  }

  updateWidgetUi();
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

function widgetDisplayLabel(widget) {
  if (widget.type === "reference-popup") {
    const source = typeof widget.sourceLabel === "string" && widget.sourceLabel.trim() ? widget.sourceLabel : "Ref";
    return `${source} (${widget.id.slice(0, 6)})`;
  }

  if (widget.type === "expanded-area") {
    return `${widget.metadata?.title ?? "Expanded Space"} (${widget.id.slice(0, 6)})`;
  }

  if (widget.type === "graph-widget") {
    return `${widget.metadata?.title ?? "Graph"} (${widget.id.slice(0, 6)})`;
  }

  return `${widget.type} (${widget.id.slice(0, 6)})`;
}

function updateDocumentBindingsUi() {
  const activeDocument = documentManager.getActiveDocument();
  const hasActiveDocument = Boolean(activeDocument);
  const widgets = runtime.listWidgets();
  const validWidgetIds = widgets.map((widget) => widget.id);
  const bindings = hasActiveDocument
    ? documentManager.getBindings(activeDocument.id)
    : { defaultReferenceIds: [], formulaSheetIds: [] };

  if (documentSettingsHint) {
    documentSettingsHint.textContent = hasActiveDocument
      ? `${activeDocument.title} bindings`
      : "Select a document to configure defaults.";
  }

  if (referenceBindingSelect instanceof HTMLSelectElement) {
    referenceBindingSelect.innerHTML = "";
    const refs = widgets.filter((widget) => widget.type === "reference-popup");
    for (const widget of refs) {
      const option = document.createElement("option");
      option.value = widget.id;
      option.textContent = widgetDisplayLabel(widget);
      option.selected = bindings.defaultReferenceIds.includes(widget.id);
      referenceBindingSelect.append(option);
    }
    referenceBindingSelect.disabled = !hasActiveDocument || refs.length < 1;
  }

  if (formulaBindingSelect instanceof HTMLSelectElement) {
    formulaBindingSelect.innerHTML = "";
    const formulas = widgets.filter((widget) =>
      widget.type === "expanded-area" || widget.type === "graph-widget",
    );
    for (const widget of formulas) {
      const option = document.createElement("option");
      option.value = widget.id;
      option.textContent = widgetDisplayLabel(widget);
      option.selected = bindings.formulaSheetIds.includes(widget.id);
      formulaBindingSelect.append(option);
    }
    formulaBindingSelect.disabled = !hasActiveDocument || formulas.length < 1;
  }

  if (applyBindingsButton instanceof HTMLButtonElement) {
    applyBindingsButton.disabled = !hasActiveDocument || validWidgetIds.length < 1;
  }
  if (focusBindingsButton instanceof HTMLButtonElement) {
    focusBindingsButton.disabled = !hasActiveDocument;
  }
  if (togglePinDocumentButton instanceof HTMLButtonElement) {
    togglePinDocumentButton.disabled = !hasActiveDocument;
    togglePinDocumentButton.textContent = hasActiveDocument && activeDocument.pinned ? "Unpin Doc" : "Pin Doc";
  }
}

function updateDocumentSwitcherUi() {
  const documents = documentManager.listDocuments();
  const activeDocument = documentManager.getActiveDocument();
  const widgets = runtime.listWidgets();
  const activeBindings = activeDocument
    ? documentManager.getBindings(activeDocument.id)
    : { defaultReferenceIds: [], formulaSheetIds: [] };

  const renderKey = [
    documents.map((entry) => `${entry.id}:${entry.title}:${entry.pinned ? 1 : 0}`).join("|"),
    activeDocument?.id ?? "",
    widgets
      .filter((widget) => widget.type === "reference-popup")
      .map((widget) => widget.id)
      .join(","),
    widgets
      .filter((widget) => widget.type === "expanded-area" || widget.type === "graph-widget")
      .map((widget) => widget.id)
      .join(","),
    activeBindings.defaultReferenceIds.join(","),
    activeBindings.formulaSheetIds.join(","),
  ].join("||");

  if (documentCountOutput) {
    documentCountOutput.textContent = String(documents.length);
  }

  if (renderKey === lastDocumentUiRenderKey) {
    return;
  }
  lastDocumentUiRenderKey = renderKey;

  if (documentTabs instanceof HTMLElement) {
    documentTabs.innerHTML = "";
    for (const entry of documents) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "document-tab";
      if (entry.id === activeDocument?.id) {
        button.dataset.active = "true";
      }
      if (entry.pinned) {
        button.dataset.pinned = "true";
      }
      button.dataset.documentId = entry.id;
      button.textContent = entry.pinned ? `[P] ${entry.title}` : entry.title;
      documentTabs.append(button);
    }
  }

  if (documentSwitcher instanceof HTMLSelectElement) {
    documentSwitcher.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = documents.length > 0 ? "Switch document..." : "No open documents";
    documentSwitcher.append(placeholder);

    for (const entry of documents) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.pinned ? `[P] ${entry.title}` : entry.title;
      option.selected = entry.id === activeDocument?.id;
      documentSwitcher.append(option);
    }
    documentSwitcher.disabled = documents.length < 1;
  }

  updateDocumentBindingsUi();
}

function preferredPdfWidget() {
  const activeDocument = documentManager.getActiveDocument();
  if (activeDocument) {
    const activeWidget = runtime.getWidgetById(activeDocument.widgetId);
    if (activeWidget?.type === "pdf-document") {
      return activeWidget;
    }
  }

  if (lastPdfWidgetId) {
    const candidate = runtime.getWidgetById(lastPdfWidgetId);
    if (candidate && candidate.type === "pdf-document") {
      return candidate;
    }
  }

  const candidates = runtime.listWidgets().filter((widget) => widget.type === "pdf-document");
  return candidates[candidates.length - 1] ?? null;
}

function updateContextUi() {
  if (!contextStore || !contextUiController) {
    return;
  }
  const contexts = contextStore.list();
  contextUiController.render(contexts, activeContextId);
}

function persistActiveWorkspace() {
  if (!contextWorkspaceStore || !contextStore || !activeContextId || restoringContext) {
    return;
  }

  pruneActiveDocuments();
  syncPdfDocumentMetadata();
  const persisted = documentManager.toPersistencePayload();

  contextWorkspaceStore.saveFromRuntime({
    contextId: activeContextId,
    runtime,
    documents: persisted.documents,
    documentBindings: persisted.documentBindings,
    activeDocumentId: persisted.activeDocumentId,
    lastPdfWidgetId,
    lastReferenceWidgetId,
  });
  contextStore.touchActiveContext();
}

function flushWorkspacePersist() {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistActiveWorkspace();
}

function scheduleWorkspacePersist() {
  if (!contextWorkspaceStore || !contextStore || !activeContextId || restoringContext) {
    return;
  }

  if (persistTimer) {
    window.clearTimeout(persistTimer);
  }

  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    persistActiveWorkspace();
  }, 220);
}

function updateWidgetUi() {
  if (widgetCountOutput) {
    widgetCountOutput.textContent = String(runtime.getWidgetCount());
  }

  if (referenceCountOutput) {
    const referenceCount = runtime.listWidgets().filter((widget) => widget.type === "reference-popup").length;
    referenceCountOutput.textContent = String(referenceCount);
  }

  if (graphCountOutput) {
    const graphCount = runtime.listWidgets().filter((widget) => widget.type === "graph-widget").length;
    graphCountOutput.textContent = String(graphCount);
  }

  pruneActiveDocuments();
  syncPdfDocumentMetadata();
  updateDocumentSwitcherUi();

  updateWhitespaceZoneCount();
  updateContextUi();
  scheduleWorkspacePersist();
}

function setContextControlsBusy(nextBusy) {
  if (!contextUiController) {
    return;
  }
  contextUiController.setControlsDisabled(nextBusy);
}

async function ensureReferencePopupInteractions() {
  if (popupInteractions) {
    return popupInteractions;
  }

  const popupModule = await import("./features/reference-popups/popup-interactions.js");
  popupInteractions = popupModule.createReferencePopupInteractions({
    runtime,
    onPopupMutated: () => updateWidgetUi(),
  });

  return popupInteractions;
}

async function ensureSnipTool() {
  if (snipTool) {
    return snipTool;
  }

  await ensureReferencePopupInteractions();
  const snipModule = await import("./features/reference-popups/snip-tool.js");

  snipTool = snipModule.createSnipTool({
    runtime,
    onSnipReady: ({ dataUrl, width, height }) => {
      void createReferencePopupFromSnip({
        dataUrl,
        width,
        height,
        intent: createCreationIntent({
          type: "reference-popup",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      });
    },
    onStateChange: (state) => updateSnipUi(state),
  });

  return snipTool;
}

async function ensureWhitespaceManager() {
  if (whitespaceManager) {
    return whitespaceManager;
  }

  const whitespaceModule = await import("./features/whitespace/whitespace-manager.js");
  whitespaceManager = whitespaceModule.createWhitespaceManager({
    runtime,
    onZoneToggled: (pdfWidget, zone) => {
      void handleWhitespaceZoneToggle(pdfWidget, zone);
      updateWhitespaceZoneCount();
    },
  });

  return whitespaceManager;
}

async function ensureGraphFeatures() {
  if (graphInteractions) {
    return graphInteractions;
  }

  const graphModule = await import("./features/graph/graph-interactions.js");
  const manager = graphModule.createGraphInteractions({
    runtime,
    onGraphMutated: () => updateWidgetUi(),
  });

  graphInteractions = manager;
  return graphInteractions;
}

async function createExpandedAreaWidget(definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const requestedSize = definition.size ?? { width: 420, height: 260 };
  const widget = await registry.instantiate("expanded-area", {
    id: definition.id ?? makeId("expanded"),
    position:
      definition.position ??
      positionFromCreationIntent(
        normalizedIntent,
        requestedSize,
        defaultPlacement(-120, -60, 35, 28),
      ),
    size: definition.size,
    metadata: withCreationProvenance(definition.metadata, normalizedIntent),
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  updateWidgetUi();
  return widget;
}

async function createDummyWidget(definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const requestedSize = definition.size ?? { width: 300, height: 180 };
  const widget = await registry.instantiate("dummy", {
    id: definition.id ?? makeId("dummy"),
    position:
      definition.position ??
      positionFromCreationIntent(
        normalizedIntent,
        requestedSize,
        defaultPlacement(-150, -90, 40, 30),
      ),
    size: definition.size,
    metadata: withCreationProvenance(definition.metadata, normalizedIntent),
    collapsed: definition.collapsed,
  });
  runtime.addWidget(widget);
  updateWidgetUi();
  return widget;
}

async function createPdfWidgetFromFile(file, definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const requestedSize = definition.size ?? { width: 480, height: 680 };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const widget = await registry.instantiate("pdf-document", {
    id: definition.id ?? makeId("pdf"),
    position:
      definition.position ??
      positionFromCreationIntent(
        normalizedIntent,
        requestedSize,
        defaultPlacement(-180, -120, 36, 30),
      ),
    size: definition.size,
    metadata: withCreationProvenance({
      title: definition.metadata?.title ?? file.name,
      ...(definition.metadata ?? {}),
    }, normalizedIntent),
    dataPayload: {
      bytes,
      fileName: file.name,
    },
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  lastPdfWidgetId = widget.id;

  const documentEntry = createDocumentEntryForPdf({
    title: widget.metadata?.title ?? file.name,
    widgetId: widget.id,
  });
  if (documentEntry) {
    widget.metadata.documentId = documentEntry.id;
    focusDocumentWidgets(documentEntry.id, { selectPrimary: true });
  }

  updateWidgetUi();
  return widget;
}

async function createReferencePopupWidget({ definition = {}, intent = null } = {}) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const requestedSize = definition.size ?? { width: 280, height: 210 };

  await ensureReferencePopupInteractions();

  const widget = await registry.instantiate("reference-popup", {
    id: definition.id ?? makeId("ref"),
    position:
      definition.position ??
      positionFromCreationIntent(
        normalizedIntent,
        requestedSize,
        defaultPlacement(-80, -80, 16, 14),
      ),
    size: definition.size,
    metadata: withCreationProvenance(
      {
        title: definition.metadata?.title ?? "Reference",
        ...(definition.metadata ?? {}),
      },
      normalizedIntent,
    ),
    dataPayload: {
      imageDataUrl: definition.dataPayload?.imageDataUrl ?? null,
      sourceLabel: definition.dataPayload?.sourceLabel ?? "Manual",
    },
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  lastReferenceWidgetId = widget.id;

  const sourceDocument = normalizedIntent?.sourceWidgetId
    ? documentManager.getDocumentByWidgetId(normalizedIntent.sourceWidgetId)
    : null;
  if (sourceDocument) {
    bindReferenceToDocument(sourceDocument.id, widget.id);
  } else {
    bindReferenceToActiveDocument(widget.id);
  }

  updateWidgetUi();
  return widget;
}

async function createReferencePopupFromSnip({ dataUrl, width, height, intent = null }) {
  const normalizedIntent = normalizeCreationIntent(intent);
  await ensureReferencePopupInteractions();

  return createReferencePopupWidget({
    intent: normalizedIntent,
    definition: {
      size: {
        width: Math.max(220, Math.min(420, Math.round(width * 0.78))),
        height: Math.max(150, Math.min(360, Math.round(height * 0.78 + 52))),
      },
      metadata: {
        title: "Reference",
      },
      dataPayload: {
        imageDataUrl: dataUrl,
        sourceLabel: "Quick Snip",
      },
    },
  });
}

function openPdfPickerForIntent(intent) {
  if (!(pdfFileInput instanceof HTMLInputElement)) {
    window.alert("PDF input is unavailable.");
    return false;
  }

  const normalizedIntent = normalizeCreationIntent(intent);
  if (!normalizedIntent || normalizedIntent.type !== "pdf-document") {
    return false;
  }

  pendingPdfImportIntent = normalizedIntent;
  pdfFileInput.value = "";
  pdfFileInput.click();
  return true;
}

async function executeCreationIntent(intent) {
  const normalizedIntent = normalizeCreationIntent(intent);
  if (!normalizedIntent) {
    window.alert("Unsupported widget type.");
    return false;
  }

  if (normalizedIntent.type === "pdf-document") {
    return openPdfPickerForIntent(normalizedIntent);
  }

  if (normalizedIntent.type === "dummy") {
    await createDummyWidget({}, normalizedIntent);
    return true;
  }

  if (normalizedIntent.type === "expanded-area") {
    await createExpandedAreaWidget({}, normalizedIntent);
    return true;
  }

  if (normalizedIntent.type === "graph-widget") {
    await createGraphWidget({}, normalizedIntent);
    return true;
  }

  if (normalizedIntent.type === "reference-popup") {
    await createReferencePopupWidget({
      intent: normalizedIntent,
      definition: {
        metadata: {
          title: "Reference",
        },
        dataPayload: {
          imageDataUrl: null,
          sourceLabel: "Manual",
        },
      },
    });
    return true;
  }

  window.alert(`Unsupported widget type: ${normalizedIntent.type}`);
  return false;
}

async function createExpandedFromWhitespaceZone(pdfWidget, zone) {
  const rect = pdfWidget.getWhitespaceZoneWorldRect(zone.id);
  if (!rect) {
    return;
  }

  const linkedWidget = await createExpandedAreaWidget(
    {
      id: makeId("space"),
      position: {
        x: rect.x + rect.width + 22,
        y: rect.y,
      },
      size: {
        width: 300,
        height: Math.max(120, Math.min(320, rect.height)),
      },
      metadata: {
        title: "Expanded Space",
        note: `Linked to ${pdfWidget.metadata.title} (${zone.id})`,
      },
    },
    createCreationIntent({
      type: "expanded-area",
      anchor: {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      },
      sourceWidgetId: pdfWidget.id,
      createdFrom: "suggestion-accepted",
    }),
  );

  pdfWidget.setWhitespaceZoneLinkedWidget(zone.id, linkedWidget.id);
  const ownerDocument = documentManager.getDocumentByWidgetId(pdfWidget.id);
  if (ownerDocument) {
    bindFormulaWidgetToDocument(ownerDocument.id, linkedWidget.id);
  } else {
    documentManager.bindFormulaToActive(linkedWidget.id);
  }
  updateWidgetUi();
}

async function handleWhitespaceZoneToggle(pdfWidget, zone) {
  if (zone.collapsed) {
    if (!zone.linkedWidgetId) {
      await createExpandedFromWhitespaceZone(pdfWidget, zone);
    }
  } else if (zone.linkedWidgetId) {
    runtime.removeWidgetById(zone.linkedWidgetId);
    pdfWidget.setWhitespaceZoneLinkedWidget(zone.id, null);
    updateWidgetUi();
  }
}

async function createGraphWidget(definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  await ensureGraphFeatures();
  const requestedSize = definition.size ?? { width: 420, height: 280 };

  const widget = await registry.instantiate("graph-widget", {
    id: definition.id ?? makeId("graph"),
    position:
      definition.position ??
      positionFromCreationIntent(
        normalizedIntent,
        requestedSize,
        defaultPlacement(-100, -40, 14, 12),
      ),
    size: definition.size,
    metadata: withCreationProvenance(definition.metadata, normalizedIntent),
    dataPayload: definition.dataPayload,
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  updateWidgetUi();
  return widget;
}

async function restoreWorkspaceForActiveContext() {
  if (!contextWorkspaceStore || !activeContextId) {
    return;
  }

  restoringContext = true;
  setContextControlsBusy(true);

  try {
    clearRuntimeWidgets();
    documentManager.reset({
      contextId: activeContextId,
      documents: [],
      documentBindings: [],
      activeDocumentId: null,
      validWidgetIds: [],
    });
    lastPdfWidgetId = null;
    lastReferenceWidgetId = null;

    const workspace = contextWorkspaceStore.loadWorkspace(activeContextId);
    documentManager.reset({
      contextId: activeContextId,
      documents: workspace.documents,
      documentBindings: workspace.documentBindings,
      activeDocumentId: workspace.activeWorkspaceState.activeDocumentId,
      validWidgetIds: workspace.widgets.map((entry) => entry.id),
    });
    lastPdfWidgetId = workspace.activeWorkspaceState.lastPdfWidgetId;
    lastReferenceWidgetId = workspace.activeWorkspaceState.lastReferenceWidgetId;

    const widgetTypes = new Set(workspace.widgets.map((entry) => entry.type));
    const hasStoredWhitespaceZones = workspace.widgets.some(
      (entry) =>
        entry.type === "pdf-document" &&
        Array.isArray(entry.runtimeState?.whitespaceZones) &&
        entry.runtimeState.whitespaceZones.length > 0,
    );

    if (widgetTypes.has("graph-widget")) {
      await ensureGraphFeatures();
    }
    if (widgetTypes.has("reference-popup")) {
      await ensureReferencePopupInteractions();
    }
    if (hasStoredWhitespaceZones) {
      await ensureWhitespaceManager();
    }

    for (const serializedWidget of workspace.widgets) {
      const definition = contextWorkspaceStore.toWidgetDefinition(serializedWidget);
      if (!definition) {
        continue;
      }

      try {
        const widget = await registry.instantiate(definition.type, definition);

        if (
          widget.type === "pdf-document" &&
          Array.isArray(definition.runtimeState?.whitespaceZones) &&
          typeof widget.setWhitespaceZones === "function"
        ) {
          widget.setWhitespaceZones(definition.runtimeState.whitespaceZones);
        }

        runtime.addWidget(widget);
      } catch (error) {
        console.error(`Failed to restore widget ${serializedWidget.id}:`, error);
      }
    }

    pruneActiveDocuments();
    syncPdfDocumentMetadata();
    const activeDocument = documentManager.getActiveDocument();
    if (activeDocument) {
      focusDocumentWidgets(activeDocument.id, { selectPrimary: true });
    }
    updateWidgetUi();
  } finally {
    setContextControlsBusy(false);
    restoringContext = false;
  }
}

async function switchContext(nextContextId) {
  if (!contextStore || !nextContextId || nextContextId === activeContextId) {
    return;
  }

  flushWorkspacePersist();

  if (!contextStore.setActiveContext(nextContextId)) {
    return;
  }

  activeContextId = nextContextId;
  documentManager.setContextId(activeContextId);
  updateContextUi();
  await restoreWorkspaceForActiveContext();
}

function parseSelectionInput(input, maxCount) {
  const pieces = String(input ?? "")
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry));

  const picked = new Set();
  for (const value of pieces) {
    if (value < 1 || value > maxCount) {
      continue;
    }
    picked.add(value - 1);
  }

  return Array.from(picked).sort((a, b) => a - b);
}

function selectedMultiValueIds(selectElement) {
  if (!(selectElement instanceof HTMLSelectElement)) {
    return [];
  }

  return Array.from(selectElement.selectedOptions)
    .map((option) => option.value)
    .filter((value) => typeof value === "string" && value.trim());
}

function widgetTitle(serializedWidget) {
  const title = serializedWidget.metadata?.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }

  if (serializedWidget.type === "pdf-document") {
    return serializedWidget.dataPayload?.fileName ?? "PDF";
  }

  if (serializedWidget.type === "reference-popup") {
    return serializedWidget.dataPayload?.sourceLabel ?? "Reference";
  }

  return serializedWidget.type;
}

function cloneImportedDocument(sourceDocument, sourceBinding, idMap) {
  const mappedWidgetId = idMap.get(sourceDocument.widgetId);
  if (!mappedWidgetId) {
    return null;
  }

  const mappedReferences = (sourceBinding?.defaultReferenceIds ?? sourceDocument.referenceWidgetIds ?? [])
    .map((refId) => idMap.get(refId))
    .filter((entry) => typeof entry === "string");
  const mappedFormulaSheets = (sourceBinding?.formulaSheetIds ?? [])
    .map((widgetId) => idMap.get(widgetId))
    .filter((entry) => typeof entry === "string");

  return {
    document: {
      id: makeId("doc"),
      contextId: activeContextId,
      title: sourceDocument.title,
      sourceType: sourceDocument.sourceType,
      widgetId: mappedWidgetId,
      openedAt: nowIso(),
      pinned: Boolean(sourceDocument.pinned),
    },
    binding: {
      documentId: null,
      defaultReferenceIds: Array.from(new Set(mappedReferences)),
      formulaSheetIds: Array.from(new Set(mappedFormulaSheets)),
    },
  };
}

async function importWidgetsFromAnotherContext() {
  if (!contextStore || !contextWorkspaceStore || !activeContextId) {
    return;
  }

  const candidates = contextStore.list().filter((entry) => entry.id !== activeContextId);
  if (candidates.length < 1) {
    window.alert("No other contexts exist yet.");
    return;
  }

  const contextPrompt = candidates.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n");
  const contextChoice = window.prompt(`Choose source context:\n${contextPrompt}`, "1");
  const contextIndex = Number.parseInt(contextChoice ?? "", 10) - 1;
  if (!Number.isFinite(contextIndex) || contextIndex < 0 || contextIndex >= candidates.length) {
    return;
  }

  const sourceContext = candidates[contextIndex];
  const sourceWorkspace = contextWorkspaceStore.loadWorkspace(sourceContext.id);
  if (sourceWorkspace.widgets.length < 1) {
    window.alert("Source context has no widgets to import.");
    return;
  }

  const widgetPrompt = sourceWorkspace.widgets
    .map((entry, index) => `${index + 1}. ${entry.type} - ${widgetTitle(entry)}`)
    .join("\n");

  const widgetChoice = window.prompt(
    `Choose widget numbers to import (comma separated):\n${widgetPrompt}`,
    "1",
  );

  const pickedIndexes = parseSelectionInput(widgetChoice, sourceWorkspace.widgets.length);
  if (pickedIndexes.length < 1) {
    return;
  }

  const selectedWidgets = pickedIndexes.map((index) => sourceWorkspace.widgets[index]);
  const selectedTypes = new Set(selectedWidgets.map((entry) => entry.type));

  if (selectedTypes.has("graph-widget")) {
    await ensureGraphFeatures();
  }
  if (selectedTypes.has("reference-popup")) {
    await ensureReferencePopupInteractions();
  }

  const idMap = new Map();
  const importedWidgets = [];

  for (const sourceWidget of selectedWidgets) {
    const cloned = contextWorkspaceStore.cloneForImport(sourceWidget, activeContextId);
    if (!cloned) {
      continue;
    }

    const definition = contextWorkspaceStore.toWidgetDefinition(cloned);
    if (!definition) {
      continue;
    }

    const widget = await registry.instantiate(definition.type, definition);
    if (
      widget.type === "pdf-document" &&
      Array.isArray(definition.runtimeState?.whitespaceZones) &&
      typeof widget.setWhitespaceZones === "function"
    ) {
      widget.setWhitespaceZones(definition.runtimeState.whitespaceZones);
    }

    runtime.addWidget(widget);
    importedWidgets.push(widget);
    idMap.set(sourceWidget.id, widget.id);

    if (widget.type === "pdf-document") {
      lastPdfWidgetId = widget.id;
    }
    if (widget.type === "reference-popup") {
      lastReferenceWidgetId = widget.id;
    }
  }

  const sourceBindingsByDocumentId = new Map(
    (sourceWorkspace.documentBindings ?? []).map((entry) => [entry.documentId, entry]),
  );
  const sourceDocsToCopy = sourceWorkspace.documents.filter((entry) => idMap.has(entry.widgetId));
  for (const sourceDoc of sourceDocsToCopy) {
    const cloned = cloneImportedDocument(sourceDoc, sourceBindingsByDocumentId.get(sourceDoc.id), idMap);
    if (!cloned) {
      continue;
    }

    const imported = documentManager.addImportedDocument({
      document: cloned.document,
      binding: {
        ...cloned.binding,
        documentId: cloned.document.id,
      },
    });

    if (!documentManager.getActiveDocumentId() && imported) {
      documentManager.setActiveDocument(imported.id);
    }
  }

  const importedPdfWidgets = importedWidgets.filter((widget) => widget.type === "pdf-document");
  for (const widget of importedPdfWidgets) {
    const doc = documentManager.ensureDocumentForWidget({
      widgetId: widget.id,
      title: widget.metadata?.title ?? "Imported PDF",
      sourceType: "pdf",
    });
    if (doc) {
      widget.metadata.documentId = doc.id;
    }
  }

  const importedReferenceWidgets = importedWidgets.filter((widget) => widget.type === "reference-popup");
  for (const widget of importedReferenceWidgets) {
    bindReferenceToActiveDocument(widget.id);
  }

  const activeDocument = documentManager.getActiveDocument();
  if (activeDocument) {
    focusDocumentWidgets(activeDocument.id, { selectPrimary: false });
  }

  updateWidgetUi();

  window.alert(`Imported ${importedWidgets.length} widget(s) from "${sourceContext.name}".`);
}

function wireBaseEventHandlers() {
  instantiateButton?.addEventListener("click", async () => {
    instantiateButton.disabled = true;
    instantiateButton.textContent = "Loading...";

    try {
      await executeCreationIntent(
        createCreationIntent({
          type: "dummy",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      );
    } catch (error) {
      console.error(error);
      window.alert(`Failed to instantiate widget: ${error.message}`);
    } finally {
      instantiateButton.disabled = false;
      instantiateButton.textContent = "Instantiate Dummy Widget";
    }
  });

  instantiateExpandedButton?.addEventListener("click", async () => {
    instantiateExpandedButton.disabled = true;
    instantiateExpandedButton.textContent = "Loading...";

    try {
      await executeCreationIntent(
        createCreationIntent({
          type: "expanded-area",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      );
    } catch (error) {
      console.error(error);
      window.alert(`Failed to instantiate expanded widget: ${error.message}`);
    } finally {
      instantiateExpandedButton.disabled = false;
      instantiateExpandedButton.textContent = "Instantiate Expanded-Area Widget";
    }
  });

  startSnipButton?.addEventListener("click", async () => {
    startSnipButton.disabled = true;
    try {
      const tool = await ensureSnipTool();
      if (tool.isArmed()) {
        tool.disarm();
      } else {
        tool.arm();
      }
    } catch (error) {
      console.error(error);
      window.alert(`Snip tool failed: ${error.message}`);
    } finally {
      startSnipButton.disabled = false;
    }
  });

  instantiateGraphButton?.addEventListener("click", async () => {
    instantiateGraphButton.disabled = true;
    instantiateGraphButton.textContent = "Loading...";

    try {
      await executeCreationIntent(
        createCreationIntent({
          type: "graph-widget",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      );
    } catch (error) {
      console.error(error);
      window.alert(`Graph widget failed: ${error.message}`);
    } finally {
      instantiateGraphButton.disabled = false;
      instantiateGraphButton.textContent = "Instantiate Graph Widget";
    }
  });

  toggleToolsButton?.addEventListener("click", () => {
    toolsPanelOpen = !toolsPanelOpen;
    window.localStorage.setItem("notes-app.tools-panel.open", toolsPanelOpen ? "1" : "0");
    syncToolsUi();
  });

  detectWhitespaceButton?.addEventListener("click", async () => {
    if (!(detectWhitespaceButton instanceof HTMLButtonElement)) {
      return;
    }

    const pdfWidget = preferredPdfWidget();
    if (!pdfWidget) {
      window.alert("Import a PDF before detecting whitespace.");
      return;
    }

    detectWhitespaceButton.disabled = true;
    detectWhitespaceButton.textContent = "Analyzing...";
    setWhitespaceState("analyzing");

    try {
      const manager = await ensureWhitespaceManager();
      const zones = await manager.analyzeWidget(pdfWidget);
      setWhitespaceState(zones.length > 0 ? "ready" : "none");
      updateWhitespaceZoneCount();
      updateWidgetUi();
    } catch (error) {
      console.error(error);
      setWhitespaceState("failed");
      window.alert(`Whitespace analysis failed: ${error.message}`);
    } finally {
      detectWhitespaceButton.disabled = false;
      detectWhitespaceButton.textContent = "Detect Whitespace";
    }
  });

  importPdfButton?.addEventListener("click", () => {
    void executeCreationIntent(
      createCreationIntent({
        type: "pdf-document",
        anchor: viewportCenterAnchor(),
        sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
        createdFrom: "manual",
      }),
    );
  });

  pdfFileInput?.addEventListener("change", async (event) => {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    if (!(importPdfButton instanceof HTMLButtonElement)) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      pendingPdfImportIntent = null;
      return;
    }

    importPdfButton.disabled = true;
    importPdfButton.textContent = "Importing...";

    try {
      const fallbackIntent = createCreationIntent({
        type: "pdf-document",
        anchor: viewportCenterAnchor(),
        sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
        createdFrom: "manual",
      });
      await createPdfWidgetFromFile(file, {}, pendingPdfImportIntent ?? fallbackIntent);
    } catch (error) {
      console.error(error);
      window.alert(`PDF import failed: ${error.message}`);
    } finally {
      pendingPdfImportIntent = null;
      importPdfButton.disabled = false;
      importPdfButton.textContent = "Import PDF";
      event.target.value = "";
    }
  });

  startWorkerButton?.addEventListener("click", async () => {
    startWorkerButton.disabled = true;
    startWorkerButton.textContent = "Starting...";

    if (workerStateOutput) {
      workerStateOutput.textContent = "starting";
    }

    try {
      await workerClient.start();
      if (workerStateOutput) {
        workerStateOutput.textContent = "ready";
      }
    } catch (error) {
      console.error(error);
      if (workerStateOutput) {
        workerStateOutput.textContent = "failed";
      }
      window.alert(`Worker startup failed: ${error.message}`);
    } finally {
      startWorkerButton.disabled = false;
      startWorkerButton.textContent = "Start Worker";
    }
  });

  enableInkButton?.addEventListener("click", async () => {
    if (inkFeature) {
      return;
    }

    enableInkButton.disabled = true;
    enableInkButton.textContent = "Loading...";

    try {
      const inkModule = await import("./features/ink/index.js");
      loadedModules.add("ink");
      if (loadedModulesOutput) {
        loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
      }

      inkFeature = inkModule.createInkFeature({
        runtime,
        getActiveContextId: () => activeContextId,
        onStateChange: (state) => updateInkUi(state),
      });

      if (inkStateOutput) {
        inkStateOutput.textContent = "active";
      }

      enableInkButton.textContent = "Ink Enabled";
    } catch (error) {
      console.error(error);
      enableInkButton.disabled = false;
      enableInkButton.textContent = "Enable Ink";
      if (inkStateOutput) {
        inkStateOutput.textContent = "failed";
      }
      window.alert(`Ink initialization failed: ${error.message}`);
    }
  });

  undoInkButton?.addEventListener("click", () => {
    inkFeature?.undo();
  });

  redoInkButton?.addEventListener("click", () => {
    inkFeature?.redo();
  });

  documentTabs?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-document-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const documentId = button.dataset.documentId;
    if (!documentId) {
      return;
    }

    setActiveDocument(documentId, { focus: true });
  });

  documentSwitcher?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (!target.value) {
      return;
    }

    setActiveDocument(target.value, { focus: true });
  });

  applyBindingsButton?.addEventListener("click", () => {
    const activeDocument = documentManager.getActiveDocument();
    if (!activeDocument) {
      return;
    }

    const allWidgetIds = runtime.listWidgets().map((widget) => widget.id);
    const defaultReferenceIds = selectedMultiValueIds(referenceBindingSelect);
    const formulaSheetIds = selectedMultiValueIds(formulaBindingSelect);

    documentManager.updateBindings(
      activeDocument.id,
      { defaultReferenceIds, formulaSheetIds },
      allWidgetIds,
    );
    focusDocumentWidgets(activeDocument.id, { selectPrimary: true });
    updateWidgetUi();
  });

  focusBindingsButton?.addEventListener("click", () => {
    const activeDocument = documentManager.getActiveDocument();
    if (!activeDocument) {
      return;
    }
    focusDocumentWidgets(activeDocument.id, { selectPrimary: true });
    updateWidgetUi();
  });

  togglePinDocumentButton?.addEventListener("click", () => {
    const activeDocument = documentManager.getActiveDocument();
    if (!activeDocument) {
      return;
    }

    documentManager.togglePinned(activeDocument.id);
    updateWidgetUi();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "d") {
      event.preventDefault();
      setDebugModeEnabled(!debugModeEnabled);
      return;
    }

    if (!inkFeature) {
      return;
    }

    const metaOrCtrl = event.ctrlKey || event.metaKey;
    if (!metaOrCtrl) {
      return;
    }

    if (key === "z" && event.shiftKey) {
      event.preventDefault();
      inkFeature.redo();
      return;
    }

    if (key === "z") {
      event.preventDefault();
      inkFeature.undo();
      return;
    }

    if (key === "y") {
      event.preventDefault();
      inkFeature.redo();
    }
  });

  window.addEventListener("beforeunload", () => {
    flushWorkspacePersist();
  });
}

function wireContextMenu() {
  createWidgetContextMenu({
    canvas,
    menuElement: widgetContextMenu,
    runtime,
    onCreateExpanded: (sourceWidget) =>
      executeCreationIntent(
        createCreationIntent({
          type: "expanded-area",
          anchor: anchorBesideWidget(sourceWidget ?? null),
          sourceWidgetId: sourceWidget?.id ?? null,
          createdFrom: "manual",
        }),
      ),
    onWidgetMutated: () => updateWidgetUi(),
  });
}

function wireWidgetInteractionManager() {
  if (widgetInteractionManager) {
    return;
  }

  widgetInteractionManager = createWidgetInteractionManager({
    runtime,
    onWidgetMutated: () => updateWidgetUi(),
  });
}

function wireWidgetCreationController() {
  if (widgetCreationController) {
    return;
  }

  widgetCreationController = createWidgetCreationController({
    runtime,
    canvas,
    menuElement: creationCommandMenu,
    getActiveContextId: () => activeContextId,
    onCreateIntent: (intent) => {
      void executeCreationIntent(intent).catch((error) => {
        console.error(error);
        window.alert(`Widget creation failed: ${error.message}`);
      });
    },
  });
}

function wireDocumentFocusSync() {
  if (detachDocumentFocusSync) {
    return;
  }

  detachDocumentFocusSync = runtime.registerInputHandler({
    onPointerDown(event) {
      if (event.pointerType === "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget) {
        return false;
      }

      const document = documentManager.getDocumentByWidgetId(widget.id);
      if (!document || document.id === documentManager.getActiveDocumentId()) {
        return false;
      }

      documentManager.setActiveDocument(document.id);
      updateWidgetUi();
      return false;
    },
  });
}

async function setupContextFeatures() {
  const [
    contextStoreModule,
    contextWorkspaceModule,
    contextUiModule,
  ] = await Promise.all([
    import("./features/contexts/context-store.js"),
    import("./features/contexts/context-workspace-store.js"),
    import("./features/contexts/context-management-ui.js"),
  ]);

  contextStore = contextStoreModule.createContextStore();
  contextWorkspaceStore = contextWorkspaceModule.createContextWorkspaceStore();
  activeContextId = contextStore.getActiveContextId();
  documentManager.setContextId(activeContextId);

  const createContextHandler = async () => {
    const name = window.prompt("Context name:", "New Context");
    if (!name) {
      return;
    }

    flushWorkspacePersist();

    const created = contextStore.createContext(name, "general");
    if (!created) {
      window.alert("Context name cannot be empty.");
      return;
    }

    activeContextId = created.id;
    documentManager.setContextId(activeContextId);
    updateContextUi();
    await restoreWorkspaceForActiveContext();
  };

  const renameContextHandler = () => {
    const active = activeContextRecord();
    if (!active) {
      return;
    }

    const nextName = window.prompt("Rename context:", active.name);
    if (!nextName) {
      return;
    }

    const renamed = contextStore.renameContext(active.id, nextName);
    if (!renamed) {
      window.alert("Context name cannot be empty.");
      return;
    }

    updateContextUi();
    scheduleWorkspacePersist();
  };

  const deleteContextHandler = async () => {
    const active = activeContextRecord();
    if (!active) {
      return;
    }

    const confirmed = window.confirm(`Delete context "${active.name}"?`);
    if (!confirmed) {
      return;
    }

    flushWorkspacePersist();

    const result = contextStore.deleteContext(active.id);
    if (!result) {
      window.alert("At least one context must remain.");
      return;
    }

    contextWorkspaceStore.deleteWorkspace(result.deletedContextId);
    activeContextId = result.activeContextId;
    documentManager.setContextId(activeContextId);
    updateContextUi();
    await restoreWorkspaceForActiveContext();
  };

  contextUiController = contextUiModule.createContextManagementUi({
    selectElement: contextSelect,
    activeContextOutput,
    newContextButton,
    renameContextButton,
    deleteContextButton,
    importContextWidgetButton,
    onSwitchContext: (nextContextId) => {
      void switchContext(nextContextId);
    },
    onCreateContext: () => {
      void createContextHandler();
    },
    onRenameContext: renameContextHandler,
    onDeleteContext: () => {
      void deleteContextHandler();
    },
    onImportContextWidgets: () => {
      void importWidgetsFromAnotherContext();
    },
  });

  updateContextUi();
  await restoreWorkspaceForActiveContext();
}

async function bootstrap() {
  wireBaseEventHandlers();
  wireWidgetInteractionManager();
  wireWidgetCreationController();
  wireDocumentFocusSync();
  wireContextMenu();

  updateSnipUi({ armed: false, dragging: false });
  setWhitespaceState("idle");
  debugModeEnabled = readDebugModeFlag();
  syncDebugControls();

  toolsPanelOpen = window.localStorage.getItem("notes-app.tools-panel.open") === "1";
  syncToolsUi();

  await setupContextFeatures();
  updateWidgetUi();
}

void bootstrap();
