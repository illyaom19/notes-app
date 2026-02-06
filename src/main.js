import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";

const instantiateButton = document.querySelector("#instantiate-dummy");
const startWorkerButton = document.querySelector("#start-worker");
const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const cameraOutput = document.querySelector("#camera-state");
const workerStateOutput = document.querySelector("#worker-state");
const canvas = document.querySelector("#workspace-canvas");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #workspace-canvas element.");
}

const loadedModules = new Set();

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
