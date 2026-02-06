import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";
import { createContextStore } from "./features/contexts/context-store.js";
import { createDocumentRegistry } from "./features/documents/document-registry.js";
import { createSuggestionManager } from "./features/suggestions/suggestion-manager.js";
import { createWidgetContextMenu } from "./features/widget-system/long-press-menu.js";
import { createUniversalWidgetInteractions } from "./features/widget-system/universal-widget-interactions.js";

const importPdfButton = document.querySelector("#import-pdf");
const toggleToolsButton = document.querySelector("#toggle-tools");
const controlsPanel = document.querySelector("#controls-panel");
const detectWhitespaceButton = document.querySelector("#detect-whitespace");
const generateSuggestionsButton = document.querySelector("#generate-suggestions");
const acceptSuggestionButton = document.querySelector("#accept-suggestion");
const dismissSuggestionButton = document.querySelector("#dismiss-suggestion");
const restoreSuggestionButton = document.querySelector("#restore-suggestion");
const startSnipButton = document.querySelector("#start-snip");
const instantiateButton = document.querySelector("#instantiate-dummy");
const instantiateExpandedButton = document.querySelector("#instantiate-expanded");
const instantiateGraphButton = document.querySelector("#instantiate-graph");
const enableInkButton = document.querySelector("#enable-ink");
const undoInkButton = document.querySelector("#undo-ink");
const redoInkButton = document.querySelector("#redo-ink");
const startWorkerButton = document.querySelector("#start-worker");
const contextSelect = document.querySelector("#context-select");
const newContextButton = document.querySelector("#new-context");
const renameContextButton = document.querySelector("#rename-context");
const deleteContextButton = document.querySelector("#delete-context");
const importContextWidgetButton = document.querySelector("#import-context-widget");
const assignLastReferenceButton = document.querySelector("#assign-last-reference");
const showDocumentReferencesButton = document.querySelector("#show-document-references");
const documentTabs = document.querySelector("#document-tabs");

const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const referenceCountOutput = document.querySelector("#reference-count");
const snipStateOutput = document.querySelector("#snip-state");
const whitespaceStateOutput = document.querySelector("#whitespace-state");
const whitespaceZoneCountOutput = document.querySelector("#whitespace-zone-count");
const graphCountOutput = document.querySelector("#graph-count");
const suggestionCountOutput = document.querySelector("#suggestion-count");
const ghostCountOutput = document.querySelector("#ghost-count");
const activeContextOutput = document.querySelector("#active-context");
const documentCountOutput = document.querySelector("#document-count");
const inkStateOutput = document.querySelector("#ink-state");
const strokeCountOutput = document.querySelector("#stroke-count");
const cameraOutput = document.querySelector("#camera-state");
const workerStateOutput = document.querySelector("#worker-state");

const canvas = document.querySelector("#workspace-canvas");
const widgetContextMenu = document.querySelector("#widget-context-menu");
const pdfFileInput = document.querySelector("#pdf-file-input");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #workspace-canvas element.");
}

const loadedModules = new Set();
let inkFeature = null;
let referenceFeatures = null;
let whitespaceManager = null;
let graphFeatures = null;
let graphPersistence = null;
let toolsPanelOpen = false;

const contextStore = createContextStore();
const documentRegistry = createDocumentRegistry();
const suggestionManager = createSuggestionManager();

let activeContextId = contextStore.getActiveContextId();
const contextWidgetBuckets = new Map();
const lastPdfWidgetIdByContext = new Map();
const lastReferenceWidgetIdByContext = new Map();

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

createUniversalWidgetInteractions({
  runtime,
  onWidgetMutated: () => updateWidgetUi(),
});

const workerClient = new BackgroundWorkerClient(
  new URL("./core/workers/analysis-worker.js", import.meta.url),
);

function ensureContextBucket(contextId) {
  if (!contextWidgetBuckets.has(contextId)) {
    contextWidgetBuckets.set(contextId, []);
  }
}

for (const context of contextStore.list()) {
  ensureContextBucket(context.id);
}
ensureContextBucket(activeContextId);

function activeContextRecord() {
  return contextStore.list().find((entry) => entry.id === activeContextId) ?? null;
}

function syncActiveBucket() {
  ensureContextBucket(activeContextId);
  contextWidgetBuckets.set(activeContextId, runtime.listWidgets());
}

function clearRuntimeWidgets() {
  const ids = runtime.listWidgets().map((widget) => widget.id);
  for (const id of ids) {
    runtime.removeWidgetById(id);
  }
}

function setWhitespaceState(value) {
  if (whitespaceStateOutput) {
    whitespaceStateOutput.textContent = value;
  }
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

function updateSuggestionUi() {
  const counts = suggestionManager.listCounts(activeContextId);
  if (suggestionCountOutput) {
    suggestionCountOutput.textContent = String(counts.proposed);
  }
  if (ghostCountOutput) {
    ghostCountOutput.textContent = String(counts.ghosted);
  }
}

function findDocumentIdForWidget(widgetId) {
  const docs = documentRegistry.listByContext(activeContextId);
  const doc = docs.find((entry) => entry.widgetId === widgetId);
  return doc?.id ?? null;
}

function renderDocumentTabs() {
  const docs = documentRegistry.listByContext(activeContextId);
  if (documentCountOutput) {
    documentCountOutput.textContent = String(docs.length);
  }

  if (!(documentTabs instanceof HTMLElement)) {
    return;
  }

  documentTabs.innerHTML = "";
  const focused = documentRegistry.getFocusedDocument(activeContextId);
  for (const doc of docs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "document-tab";
    button.dataset.active = focused?.id === doc.id ? "true" : "false";
    button.textContent = doc.title;
    button.addEventListener("click", () => {
      focusDocument(doc.id);
    });
    documentTabs.appendChild(button);
  }
}

function updateContextUi() {
  const contexts = contextStore.list();
  const active = activeContextRecord();

  if (activeContextOutput) {
    activeContextOutput.textContent = active ? active.name : "none";
  }

  if (!(contextSelect instanceof HTMLSelectElement)) {
    return;
  }

  contextSelect.innerHTML = "";
  for (const context of contexts) {
    const option = document.createElement("option");
    option.value = context.id;
    option.textContent = context.name;
    option.selected = context.id === activeContextId;
    contextSelect.appendChild(option);
  }
}

function updateWidgetUi() {
  syncActiveBucket();

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

  updateWhitespaceZoneCount();
  updateSuggestionUi();
  updateContextUi();
  renderDocumentTabs();

  if (graphPersistence) {
    graphPersistence.saveFromRuntime(runtime);
  }
}

function preferredPdfWidget() {
  const preferredId = lastPdfWidgetIdByContext.get(activeContextId);
  if (preferredId) {
    const preferred = runtime.getWidgetById(preferredId);
    if (preferred && preferred.type === "pdf-document") {
      return preferred;
    }
  }

  const pdfWidgets = runtime.listWidgets().filter((widget) => widget.type === "pdf-document");
  return pdfWidgets[pdfWidgets.length - 1] ?? null;
}

async function switchContext(nextContextId) {
  if (!nextContextId || nextContextId === activeContextId) {
    return;
  }
  if (!contextStore.setActiveContextId(nextContextId)) {
    return;
  }

  syncActiveBucket();
  clearRuntimeWidgets();

  activeContextId = nextContextId;
  ensureContextBucket(activeContextId);

  const widgets = contextWidgetBuckets.get(activeContextId) ?? [];
  for (const widget of widgets) {
    runtime.addWidget(widget);
  }

  const pdf = preferredPdfWidget();
  if (pdf) {
    lastPdfWidgetIdByContext.set(activeContextId, pdf.id);
  }

  updateWidgetUi();
}

function defaultPlacement(baseX, baseY, stepX, stepY) {
  return {
    x: baseX + runtime.getWidgetCount() * stepX,
    y: baseY + runtime.getWidgetCount() * stepY,
  };
}

async function createExpandedAreaWidget(definition = {}) {
  const widget = await registry.instantiate("expanded-area", {
    id: globalThis.crypto?.randomUUID?.() ?? `expanded-${Date.now()}`,
    position: definition.position ?? defaultPlacement(-120, -60, 35, 28),
    size: definition.size,
    metadata: definition.metadata,
  });
  runtime.addWidget(widget);
  updateWidgetUi();
  return widget;
}

function createDocumentEntryForPdf({ title, widgetId }) {
  return documentRegistry.createOrUpdateDocument({
    id: globalThis.crypto?.randomUUID?.() ?? `doc-${Date.now()}`,
    contextId: activeContextId,
    title,
    sourceType: "pdf",
    widgetId,
    openedAt: new Date().toISOString(),
  });
}

async function createPdfWidgetFromFile(file, definition = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const widget = await registry.instantiate("pdf-document", {
    id: definition.id ?? globalThis.crypto?.randomUUID?.() ?? `pdf-${Date.now()}`,
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
  });

  runtime.addWidget(widget);
  lastPdfWidgetIdByContext.set(activeContextId, widget.id);

  const doc = createDocumentEntryForPdf({ title: file.name, widgetId: widget.id });
  widget.metadata.documentId = doc.id;

  updateWidgetUi();
  return widget;
}

function focusedDocument() {
  return documentRegistry.getFocusedDocument(activeContextId);
}

function bindReferenceToFocusedDocument(referenceWidgetId) {
  const focused = focusedDocument();
  if (!focused) {
    return false;
  }
  return documentRegistry.bindReference(focused.id, referenceWidgetId);
}

async function createReferencePopupFromSnip({ dataUrl, width, height }) {
  const widget = await registry.instantiate("reference-popup", {
    id: globalThis.crypto?.randomUUID?.() ?? `ref-${Date.now()}`,
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
  lastReferenceWidgetIdByContext.set(activeContextId, widget.id);
  bindReferenceToFocusedDocument(widget.id);
  updateWidgetUi();
  return widget;
}

async function ensureReferenceFeatures() {
  if (referenceFeatures) {
    return referenceFeatures;
  }

  const [snipModule, popupModule] = await Promise.all([
    import("./features/reference-popups/snip-tool.js"),
    import("./features/reference-popups/popup-interactions.js"),
  ]);

  const popupInteractions = popupModule.createReferencePopupInteractions({
    runtime,
    onPopupMutated: () => updateWidgetUi(),
  });

  const snipTool = snipModule.createSnipTool({
    runtime,
    onSnipReady: ({ dataUrl, width, height }) => {
      void createReferencePopupFromSnip({ dataUrl, width, height });
    },
    onStateChange: (state) => updateSnipUi(state),
  });

  referenceFeatures = {
    popupInteractions,
    snipTool,
  };
  return referenceFeatures;
}

async function createExpandedFromWhitespaceZone(pdfWidget, zone) {
  const rect = pdfWidget.getWhitespaceZoneWorldRect(zone.id);
  if (!rect) {
    return;
  }

  const linkedWidget = await registry.instantiate("expanded-area", {
    id: globalThis.crypto?.randomUUID?.() ?? `space-${Date.now()}`,
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
  if (graphFeatures && graphPersistence) {
    return { ...graphFeatures, persistence: graphPersistence };
  }

  const [interactionsModule, persistenceModule] = await Promise.all([
    import("./features/graph/graph-interactions.js"),
    import("./features/graph/graph-persistence.js"),
  ]);

  graphPersistence = persistenceModule.createGraphPersistence();
  const interactions = interactionsModule.createGraphInteractions({
    runtime,
    onGraphMutated: () => {
      updateWidgetUi();
      graphPersistence.saveFromRuntime(runtime);
    },
  });

  graphFeatures = { interactions };
  return { ...graphFeatures, persistence: graphPersistence };
}

async function createGraphWidget(definition = {}) {
  await ensureGraphFeatures();
  const widget = await registry.instantiate("graph-widget", {
    id: definition.id ?? globalThis.crypto?.randomUUID?.() ?? `graph-${Date.now()}`,
    position: definition.position ?? defaultPlacement(-100, -40, 14, 12),
    size: definition.size,
    metadata: definition.metadata,
    dataPayload: definition.dataPayload,
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  updateWidgetUi();
  graphPersistence.saveFromRuntime(runtime);
  return widget;
}

async function restorePersistedGraphs() {
  const hasPersistedGraphs = Boolean(window.localStorage.getItem("notes-app.graph.widgets.v1"));
  if (!hasPersistedGraphs) {
    return;
  }

  const { persistence } = await ensureGraphFeatures();
  const definitions = persistence.loadDefinitions();
  if (definitions.length < 1) {
    return;
  }

  for (const definition of definitions) {
    if (runtime.getWidgetById(definition.id)) {
      continue;
    }
    const widget = await registry.instantiate("graph-widget", {
      ...definition,
      dataPayload: definition.dataPayload ?? {},
    });
    runtime.addWidget(widget);
  }

  updateWidgetUi();
  persistence.saveFromRuntime(runtime);
}

function focusDocument(documentId) {
  if (!documentRegistry.focusDocument(documentId)) {
    return;
  }

  const docs = documentRegistry.listByContext(activeContextId);
  const target = docs.find((entry) => entry.id === documentId);
  if (target?.widgetId) {
    const widget = runtime.getWidgetById(target.widgetId);
    if (widget) {
      runtime.bringWidgetToFront(widget.id);
    }
  }
  updateWidgetUi();
}

function cloneWidgetDefinition(widget) {
  if (!widget) {
    return null;
  }

  const id = globalThis.crypto?.randomUUID?.() ?? `clone-${Date.now()}`;
  const position = {
    x: widget.position.x + 24,
    y: widget.position.y + 24,
  };

  if (widget.type === "dummy" || widget.type === "expanded-area") {
    return {
      type: widget.type,
      id,
      position,
      size: { ...widget.size },
      metadata: { ...widget.metadata },
      collapsed: widget.collapsed,
    };
  }

  if (widget.type === "graph-widget") {
    const state = widget.toSerializableState();
    return {
      type: "graph-widget",
      id,
      position,
      size: { ...state.size },
      metadata: { ...state.metadata },
      dataPayload: { ...(state.dataPayload ?? {}) },
      collapsed: state.collapsed,
    };
  }

  if (widget.type === "reference-popup") {
    return {
      type: "reference-popup",
      id,
      position,
      size: { ...widget.size },
      metadata: { ...widget.metadata },
      dataPayload: {
        imageDataUrl: widget.imageDataUrl,
        sourceLabel: widget.sourceLabel ?? "Imported",
      },
      collapsed: widget.collapsed,
    };
  }

  if (widget.type === "pdf-document") {
    if (!(widget.pdfBytes instanceof Uint8Array)) {
      return null;
    }

    return {
      type: "pdf-document",
      id,
      position,
      size: { ...widget.size },
      metadata: { ...widget.metadata },
      dataPayload: {
        bytes: new Uint8Array(widget.pdfBytes),
        fileName: widget.fileName ?? widget.metadata?.title ?? "imported.pdf",
      },
      collapsed: widget.collapsed,
    };
  }

  return null;
}

async function importWidgetFromAnotherContext() {
  const contexts = contextStore.list().filter((entry) => entry.id !== activeContextId);
  if (contexts.length < 1) {
    window.alert("No other contexts available.");
    return;
  }

  const sourceLabel = contexts.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n");
  const contextPick = window.prompt(`Pick source context:\n${sourceLabel}`, "1");
  const contextIndex = Number.parseInt(contextPick ?? "", 10) - 1;
  if (!Number.isFinite(contextIndex) || contextIndex < 0 || contextIndex >= contexts.length) {
    return;
  }

  const sourceContext = contexts[contextIndex];
  const sourceWidgets = contextWidgetBuckets.get(sourceContext.id) ?? [];
  if (sourceWidgets.length < 1) {
    window.alert("Source context has no widgets to import.");
    return;
  }

  const widgetLabel = sourceWidgets
    .map((widget, index) => `${index + 1}. ${widget.type} (${widget.metadata?.title ?? widget.id})`)
    .join("\n");
  const widgetPick = window.prompt(`Pick widget to import:\n${widgetLabel}`, "1");
  const widgetIndex = Number.parseInt(widgetPick ?? "", 10) - 1;
  if (!Number.isFinite(widgetIndex) || widgetIndex < 0 || widgetIndex >= sourceWidgets.length) {
    return;
  }

  const sourceWidget = sourceWidgets[widgetIndex];
  const definition = cloneWidgetDefinition(sourceWidget);
  if (!definition) {
    window.alert("Selected widget cannot be imported.");
    return;
  }

  const imported = await registry.instantiate(definition.type, definition);
  runtime.addWidget(imported);

  if (imported.type === "pdf-document") {
    lastPdfWidgetIdByContext.set(activeContextId, imported.id);
    const doc = createDocumentEntryForPdf({
      title: imported.metadata?.title ?? "Imported PDF",
      widgetId: imported.id,
    });
    imported.metadata.documentId = doc.id;
  }

  if (imported.type === "reference-popup") {
    lastReferenceWidgetIdByContext.set(activeContextId, imported.id);
  }

  updateWidgetUi();
}

async function applySuggestion(suggestion) {
  if (!suggestion) {
    return false;
  }

  if (suggestion.kind === "whitespace-expand") {
    const payload = suggestion.payload ?? {};
    const pdfWidget = runtime.getWidgetById(payload.pdfWidgetId) ?? preferredPdfWidget();
    if (!pdfWidget || pdfWidget.type !== "pdf-document") {
      return false;
    }

    const zones = pdfWidget.getWhitespaceZones();
    const zone = zones.find((entry) => entry.id === payload.zoneId);
    if (!zone) {
      return false;
    }

    if (!zone.collapsed) {
      const toggled = pdfWidget.toggleWhitespaceZone(zone.id);
      if (toggled) {
        await handleWhitespaceZoneToggle(pdfWidget, toggled);
      }
    }
    return true;
  }

  return false;
}

instantiateButton?.addEventListener("click", async () => {
  instantiateButton.disabled = true;
  instantiateButton.textContent = "Loading...";

  try {
    const widget = await registry.instantiate("dummy", {
      id: globalThis.crypto?.randomUUID?.() ?? `dummy-${Date.now()}`,
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
    const features = await ensureReferenceFeatures();
    if (features.snipTool.isArmed()) {
      features.snipTool.disarm();
    } else {
      features.snipTool.arm();
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
  } catch (error) {
    console.error(error);
    setWhitespaceState("failed");
    window.alert(`Whitespace analysis failed: ${error.message}`);
  } finally {
    detectWhitespaceButton.disabled = false;
    detectWhitespaceButton.textContent = "Detect Whitespace";
  }
});

generateSuggestionsButton?.addEventListener("click", async () => {
  if (!(generateSuggestionsButton instanceof HTMLButtonElement)) {
    return;
  }

  const pdfWidget = preferredPdfWidget();
  if (!pdfWidget) {
    window.alert("Import a PDF first.");
    return;
  }

  generateSuggestionsButton.disabled = true;
  generateSuggestionsButton.textContent = "Generating...";
  try {
    const manager = await ensureWhitespaceManager();
    await manager.analyzeWidget(pdfWidget);
    const created = suggestionManager.generateWhitespaceSuggestions({
      contextId: activeContextId,
      documentId: findDocumentIdForWidget(pdfWidget.id),
      pdfWidget,
    });
    updateSuggestionUi();
    if (created.length < 1) {
      window.alert("No new suggestions were generated.");
    }
  } catch (error) {
    console.error(error);
    window.alert(`Suggestion generation failed: ${error.message}`);
  } finally {
    generateSuggestionsButton.disabled = false;
    generateSuggestionsButton.textContent = "Generate Suggestions";
  }
});

acceptSuggestionButton?.addEventListener("click", async () => {
  const accepted = suggestionManager.acceptNext(activeContextId);
  if (!accepted) {
    window.alert("No proposed suggestions.");
    return;
  }

  const applied = await applySuggestion(accepted);
  if (!applied) {
    window.alert("Suggestion accepted, but no matching target was found.");
  }
  updateWidgetUi();
});

dismissSuggestionButton?.addEventListener("click", () => {
  const dismissed = suggestionManager.dismissNext(activeContextId);
  if (!dismissed) {
    window.alert("No proposed suggestions.");
    return;
  }
  updateSuggestionUi();
});

restoreSuggestionButton?.addEventListener("click", () => {
  const restored = suggestionManager.restoreLatestGhost(activeContextId);
  if (!restored) {
    window.alert("No ghost suggestions.");
    return;
  }
  updateSuggestionUi();
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

createWidgetContextMenu({
  canvas,
  menuElement: widgetContextMenu,
  runtime,
  onCreateWidgetAt: async (type, anchorWorld) => {
    const position = anchorWorld ? { x: anchorWorld.x, y: anchorWorld.y } : undefined;
    if (type === "expanded-area") {
      await createExpandedAreaWidget({ position });
      return;
    }
    if (type === "graph-widget") {
      await createGraphWidget({ position });
    }
  },
  onWidgetMutated: () => updateWidgetUi(),
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

contextSelect?.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLSelectElement)) {
    return;
  }
  void switchContext(event.target.value);
});

newContextButton?.addEventListener("click", () => {
  const name = window.prompt("Context name:", "New Context");
  if (!name) {
    return;
  }
  const created = contextStore.createContext(name, "general");
  if (!created) {
    return;
  }
  ensureContextBucket(created.id);
  void switchContext(created.id);
});

renameContextButton?.addEventListener("click", () => {
  const active = activeContextRecord();
  if (!active) {
    return;
  }
  const nextName = window.prompt("Rename context:", active.name);
  if (!nextName) {
    return;
  }
  if (contextStore.renameContext(active.id, nextName)) {
    updateContextUi();
  }
});

deleteContextButton?.addEventListener("click", () => {
  const active = activeContextRecord();
  if (!active) {
    return;
  }

  const confirmed = window.confirm(`Delete context \"${active.name}\"?`);
  if (!confirmed) {
    return;
  }

  const result = contextStore.deleteContext(active.id);
  if (!result) {
    window.alert("At least one context must remain.");
    return;
  }

  contextWidgetBuckets.delete(result.deletedContextId);
  void switchContext(result.activeContextId);
});

importContextWidgetButton?.addEventListener("click", () => {
  void importWidgetFromAnotherContext();
});

assignLastReferenceButton?.addEventListener("click", () => {
  const refId = lastReferenceWidgetIdByContext.get(activeContextId);
  const focused = focusedDocument();
  if (!refId || !focused) {
    window.alert("Need a focused document and a recent reference popup.");
    return;
  }

  if (documentRegistry.bindReference(focused.id, refId)) {
    updateWidgetUi();
  }
});

showDocumentReferencesButton?.addEventListener("click", () => {
  const focused = focusedDocument();
  if (!focused) {
    window.alert("No focused document.");
    return;
  }

  const referenceIds = documentRegistry.getBoundReferences(focused.id);
  if (referenceIds.length < 1) {
    window.alert("No references bound to this document.");
    return;
  }

  for (const refId of referenceIds) {
    const widget = runtime.getWidgetById(refId);
    if (!widget) {
      continue;
    }
    runtime.bringWidgetToFront(widget.id);
    if (widget.type === "reference-popup" && widget.metadata?.minimized) {
      widget.setMinimized(false);
    }
  }
  updateWidgetUi();
});

updateSnipUi({ armed: false, dragging: false });
setWhitespaceState("idle");

toolsPanelOpen = window.localStorage.getItem("notes-app.tools-panel.open") === "1";
syncToolsUi();
updateContextUi();
updateWidgetUi();

void restorePersistedGraphs();
