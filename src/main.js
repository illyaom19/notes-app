import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";
import { createWidgetContextMenu } from "./features/widget-system/long-press-menu.js";

const importPdfButton = document.querySelector("#import-pdf");
const startSnipButton = document.querySelector("#start-snip");
const instantiateButton = document.querySelector("#instantiate-dummy");
const instantiateExpandedButton = document.querySelector("#instantiate-expanded");
const enableInkButton = document.querySelector("#enable-ink");
const undoInkButton = document.querySelector("#undo-ink");
const redoInkButton = document.querySelector("#redo-ink");
const startWorkerButton = document.querySelector("#start-worker");
const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const referenceCountOutput = document.querySelector("#reference-count");
const snipStateOutput = document.querySelector("#snip-state");
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

const registry = new WidgetRegistry();
registry.register("dummy", () => import("./widgets/dummy/index.js"));
registry.register("expanded-area", () => import("./widgets/expanded-area/index.js"));
registry.register("pdf-document", () => import("./widgets/pdf/index.js"));
registry.register("reference-popup", () => import("./widgets/reference-popup/index.js"));
registry.onModuleLoaded((type) => {
  loadedModules.add(type);
  loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
});

const runtime = new CanvasRuntime({
  canvas,
  onCameraChange: ({ x, y, zoom }) => {
    cameraOutput.textContent = `x=${x.toFixed(1)}, y=${y.toFixed(1)}, zoom=${zoom.toFixed(2)}`;
  },
});

const workerClient = new BackgroundWorkerClient(
  new URL("./core/workers/analysis-worker.js", import.meta.url),
);

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

function updateWidgetUi() {
  widgetCountOutput.textContent = String(runtime.getWidgetCount());
  if (referenceCountOutput) {
    const referenceCount = runtime.listWidgets().filter((widget) => widget.type === "reference-popup").length;
    referenceCountOutput.textContent = String(referenceCount);
  }
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

async function createExpandedAreaWidget() {
  const widget = await registry.instantiate("expanded-area", {
    id: globalThis.crypto?.randomUUID?.() ?? `expanded-${Date.now()}`,
    position: { x: -120 + runtime.getWidgetCount() * 35, y: -60 + runtime.getWidgetCount() * 28 },
  });
  runtime.addWidget(widget);
  updateWidgetUi();
}

async function createPdfWidgetFromFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const widget = await registry.instantiate("pdf-document", {
    id: globalThis.crypto?.randomUUID?.() ?? `pdf-${Date.now()}`,
    position: { x: -180 + runtime.getWidgetCount() * 36, y: -120 + runtime.getWidgetCount() * 30 },
    metadata: {
      title: file.name,
    },
    dataPayload: {
      bytes,
      fileName: file.name,
    },
  });
  runtime.addWidget(widget);
  updateWidgetUi();
}

async function createReferencePopupFromSnip({ dataUrl, width, height }) {
  const widget = await registry.instantiate("reference-popup", {
    id: globalThis.crypto?.randomUUID?.() ?? `ref-${Date.now()}`,
    position: { x: -80 + runtime.getWidgetCount() * 16, y: -80 + runtime.getWidgetCount() * 14 },
    size: {
      width: Math.max(220, Math.min(420, Math.round(width * 0.78))),
      height: Math.max(150, Math.min(360, Math.round(height * 0.78 + 52))),
    },
    metadata: {
      title: "Reference Popup",
    },
    dataPayload: {
      imageDataUrl: dataUrl,
      sourceLabel: "Quick Snip",
    },
  });
  runtime.addWidget(widget);
  updateWidgetUi();
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

instantiateButton?.addEventListener("click", async () => {
  instantiateButton.disabled = true;
  instantiateButton.textContent = "Loading...";

  try {
    const widget = await registry.instantiate("dummy", {
      id: globalThis.crypto?.randomUUID?.() ?? `dummy-${Date.now()}`,
      position: { x: -150 + runtime.getWidgetCount() * 40, y: -90 + runtime.getWidgetCount() * 30 },
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
  workerStateOutput.textContent = "starting";

  try {
    await workerClient.start();
    workerStateOutput.textContent = "ready";
  } catch (error) {
    console.error(error);
    workerStateOutput.textContent = "failed";
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
  onCreateExpanded: () => createExpandedAreaWidget(),
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
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");

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

updateWidgetUi();
updateSnipUi({ armed: false, dragging: false });
