import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";

const instantiateButton = document.querySelector("#instantiate-dummy");
const enableInkButton = document.querySelector("#enable-ink");
const undoInkButton = document.querySelector("#undo-ink");
const redoInkButton = document.querySelector("#redo-ink");
const startWorkerButton = document.querySelector("#start-worker");
const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const inkStateOutput = document.querySelector("#ink-state");
const strokeCountOutput = document.querySelector("#stroke-count");
const cameraOutput = document.querySelector("#camera-state");
const workerStateOutput = document.querySelector("#worker-state");
const canvas = document.querySelector("#workspace-canvas");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #workspace-canvas element.");
}

const loadedModules = new Set();
let inkFeature = null;

const registry = new WidgetRegistry();
registry.register("dummy", () => import("./widgets/dummy/index.js"));
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

instantiateButton?.addEventListener("click", async () => {
  instantiateButton.disabled = true;
  instantiateButton.textContent = "Loading...";

  try {
    const widget = await registry.instantiate("dummy", {
      id: globalThis.crypto?.randomUUID?.() ?? `dummy-${Date.now()}`,
      position: { x: -150 + runtime.getWidgetCount() * 40, y: -90 + runtime.getWidgetCount() * 30 },
    });
    runtime.addWidget(widget);
    widgetCountOutput.textContent = String(runtime.getWidgetCount());
  } catch (error) {
    console.error(error);
    window.alert(`Failed to instantiate widget: ${error.message}`);
  } finally {
    instantiateButton.disabled = false;
    instantiateButton.textContent = "Instantiate Dummy Widget";
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
