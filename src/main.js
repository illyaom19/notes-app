import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";
import { createWidgetContextMenu } from "./features/widget-system/long-press-menu.js";
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
const pdfFileInput = document.querySelector("#pdf-file-input");

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
let toolsPanelOpen = false;

let contextStore = null;
let contextWorkspaceStore = null;
let contextUiController = null;

let activeContextId = null;
let activeDocuments = [];
let activeDocumentId = null;
let lastPdfWidgetId = null;
let lastReferenceWidgetId = null;

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
  const existingWidgetIds = new Set(runtime.listWidgets().map((widget) => widget.id));

  activeDocuments = activeDocuments
    .filter((entry) => existingWidgetIds.has(entry.widgetId))
    .map((entry) => ({
      ...entry,
      referenceWidgetIds: (entry.referenceWidgetIds ?? []).filter((refId) => existingWidgetIds.has(refId)),
      contextId: activeContextId,
      updatedAt: nowIso(),
    }));

  if (!activeDocuments.some((entry) => entry.id === activeDocumentId)) {
    activeDocumentId = activeDocuments[0]?.id ?? null;
  }
}

function createDocumentEntryForPdf({ title, widgetId }) {
  const createdAt = nowIso();
  const entry = {
    id: makeId("doc"),
    contextId: activeContextId,
    title,
    sourceType: "pdf",
    widgetId,
    referenceWidgetIds: [],
    createdAt,
    updatedAt: createdAt,
  };

  activeDocuments.push(entry);
  activeDocumentId = entry.id;
  return entry;
}

function bindReferenceToActiveDocument(referenceWidgetId) {
  if (!activeDocumentId) {
    return false;
  }

  const target = activeDocuments.find((entry) => entry.id === activeDocumentId);
  if (!target) {
    return false;
  }

  if (!target.referenceWidgetIds.includes(referenceWidgetId)) {
    target.referenceWidgetIds.push(referenceWidgetId);
    target.updatedAt = nowIso();
  }
  return true;
}

function preferredPdfWidget() {
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

  contextWorkspaceStore.saveFromRuntime({
    contextId: activeContextId,
    runtime,
    documents: activeDocuments,
    activeDocumentId,
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

  if (documentCountOutput) {
    documentCountOutput.textContent = String(activeDocuments.length);
  }

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
      void createReferencePopupFromSnip({ dataUrl, width, height });
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

async function createExpandedAreaWidget(definition = {}) {
  const widget = await registry.instantiate("expanded-area", {
    id: definition.id ?? makeId("expanded"),
    position: definition.position ?? defaultPlacement(-120, -60, 35, 28),
    size: definition.size,
    metadata: definition.metadata,
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  updateWidgetUi();
  return widget;
}

async function createPdfWidgetFromFile(file, definition = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const widget = await registry.instantiate("pdf-document", {
    id: definition.id ?? makeId("pdf"),
    position: definition.position ?? defaultPlacement(-180, -120, 36, 30),
    size: definition.size,
    metadata: {
      title: definition.metadata?.title ?? file.name,
      ...(definition.metadata ?? {}),
    },
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
  widget.metadata.documentId = documentEntry.id;

  updateWidgetUi();
  return widget;
}

async function createReferencePopupFromSnip({ dataUrl, width, height }) {
  await ensureReferencePopupInteractions();

  const widget = await registry.instantiate("reference-popup", {
    id: makeId("ref"),
    position: defaultPlacement(-80, -80, 16, 14),
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
  });

  runtime.addWidget(widget);
  lastReferenceWidgetId = widget.id;
  bindReferenceToActiveDocument(widget.id);

  updateWidgetUi();
  return widget;
}

async function createExpandedFromWhitespaceZone(pdfWidget, zone) {
  const rect = pdfWidget.getWhitespaceZoneWorldRect(zone.id);
  if (!rect) {
    return;
  }

  const linkedWidget = await registry.instantiate("expanded-area", {
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
  });

  runtime.addWidget(linkedWidget);
  pdfWidget.setWhitespaceZoneLinkedWidget(zone.id, linkedWidget.id);
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

async function createGraphWidget(definition = {}) {
  await ensureGraphFeatures();

  const widget = await registry.instantiate("graph-widget", {
    id: definition.id ?? makeId("graph"),
    position: definition.position ?? defaultPlacement(-100, -40, 14, 12),
    size: definition.size,
    metadata: definition.metadata,
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
    activeDocuments = [];
    activeDocumentId = null;
    lastPdfWidgetId = null;
    lastReferenceWidgetId = null;

    const workspace = contextWorkspaceStore.loadWorkspace(activeContextId);
    activeDocuments = workspace.documents;
    activeDocumentId = workspace.activeWorkspaceState.activeDocumentId;
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

function cloneImportedDocument(sourceDocument, idMap) {
  const mappedWidgetId = idMap.get(sourceDocument.widgetId);
  if (!mappedWidgetId) {
    return null;
  }

  const mappedReferences = (sourceDocument.referenceWidgetIds ?? [])
    .map((refId) => idMap.get(refId))
    .filter((entry) => typeof entry === "string");

  const timestamp = nowIso();
  return {
    id: makeId("doc"),
    contextId: activeContextId,
    title: sourceDocument.title,
    sourceType: sourceDocument.sourceType,
    widgetId: mappedWidgetId,
    referenceWidgetIds: Array.from(new Set(mappedReferences)),
    createdAt: timestamp,
    updatedAt: timestamp,
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

  const sourceDocsToCopy = sourceWorkspace.documents.filter((entry) => idMap.has(entry.widgetId));
  for (const sourceDoc of sourceDocsToCopy) {
    const clonedDoc = cloneImportedDocument(sourceDoc, idMap);
    if (!clonedDoc) {
      continue;
    }
    activeDocuments.push(clonedDoc);
    if (!activeDocumentId) {
      activeDocumentId = clonedDoc.id;
    }
  }

  const importedPdfWidgets = importedWidgets.filter((widget) => widget.type === "pdf-document");
  for (const widget of importedPdfWidgets) {
    const hasDocument = activeDocuments.some((entry) => entry.widgetId === widget.id);
    if (!hasDocument) {
      const nextDoc = createDocumentEntryForPdf({
        title: widget.metadata?.title ?? "Imported PDF",
        widgetId: widget.id,
      });
      widget.metadata.documentId = nextDoc.id;
    }
  }

  const importedReferenceWidgets = importedWidgets.filter((widget) => widget.type === "reference-popup");
  for (const widget of importedReferenceWidgets) {
    bindReferenceToActiveDocument(widget.id);
  }

  updateWidgetUi();

  window.alert(`Imported ${importedWidgets.length} widget(s) from "${sourceContext.name}".`);
}

function wireBaseEventHandlers() {
  instantiateButton?.addEventListener("click", async () => {
    instantiateButton.disabled = true;
    instantiateButton.textContent = "Loading...";

    try {
      const widget = await registry.instantiate("dummy", {
        id: makeId("dummy"),
        position: defaultPlacement(-150, -90, 40, 30),
      });
      runtime.addWidget(widget);
      updateWidgetUi();
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
      await createExpandedAreaWidget();
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
      await createGraphWidget();
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
    if (!(pdfFileInput instanceof HTMLInputElement)) {
      return;
    }

    pdfFileInput.value = "";
    pdfFileInput.click();
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
      return;
    }

    importPdfButton.disabled = true;
    importPdfButton.textContent = "Importing...";

    try {
      await createPdfWidgetFromFile(file);
    } catch (error) {
      console.error(error);
      window.alert(`PDF import failed: ${error.message}`);
    } finally {
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

  window.addEventListener("keydown", (event) => {
    if (!inkFeature) {
      return;
    }

    const key = event.key.toLowerCase();
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
    onCreateExpanded: () => createExpandedAreaWidget(),
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
  wireContextMenu();

  updateSnipUi({ armed: false, dragging: false });
  setWhitespaceState("idle");

  toolsPanelOpen = window.localStorage.getItem("notes-app.tools-panel.open") === "1";
  syncToolsUi();

  await setupContextFeatures();
  updateWidgetUi();
}

void bootstrap();
