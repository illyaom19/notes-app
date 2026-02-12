import { CanvasRuntime } from "./core/canvas/canvas-runtime.js";
import { WidgetRegistry } from "./core/widgets/widget-registry.js";
import { BackgroundWorkerClient } from "./core/workers/background-worker-client.js";
import { createDocumentManager } from "./features/documents/document-manager.js";
import {
  loadWorldSizeConfig,
  normalizeWorldSizeForType,
  placementMetadata,
  worldSizeFromScreenPixels,
} from "./features/widget-system/world-sizing.js";
import {
  isProductionMode,
  loadUiModeState,
  saveUiModeState,
  toggleUiMode,
} from "./features/ui/ui-mode-store.js";
import { createOnboardingStateService } from "./features/onboarding/onboarding-state-service.js";
import { createWidgetContextMenu } from "./features/widget-system/long-press-menu.js";
import { createWidgetCreationController } from "./features/widget-system/widget-creation-controller.js";
import { createWidgetInteractionManager } from "./features/widget-system/widget-interaction-manager.js";
import { createWidgetRasterManager } from "./features/widget-system/widget-raster-manager.js";
import { createNotebookSectionsStore } from "./features/sections/notebook-sections-store.js";
import { createNotebookLibraryStore } from "./features/notebooks/notebook-library-store.js";
import { createNotebookDocumentLibraryStore } from "./features/notebooks/notebook-document-library-store.js";
import {
  fingerprintDocumentEntry,
  fingerprintNoteEntry,
  fingerprintReferenceEntry,
} from "./features/notebooks/library-fingerprint.js";
import { createSectionManagementUi } from "./features/sections/section-management-ui.js";
import { createSuggestionStore } from "./features/suggestions/suggestion-store.js";
import { createSuggestionEngine } from "./features/suggestions/suggestion-engine.js";
import { createSuggestionUiController } from "./features/suggestions/suggestion-ui-controller.js";
import { createReferenceManagerUi } from "./features/references/reference-manager-ui.js";
import { createSectionMinimapController } from "./features/minimap/section-minimap-controller.js";
import { createInputRoutingController } from "./features/runtime/input-routing-controller.js";
import { createLibraryOverlayController } from "./features/runtime/library-overlay-controller.js";
import { createViewportDockOverlayController } from "./features/runtime/viewport-dock-overlay-controller.js";
import { createWorkspacePersistenceController } from "./features/runtime/workspace-persistence-controller.js";
import { ALLOWED_CREATION_INTENT_TYPES } from "./features/widget-system/widget-types.js";
import { createPdfRasterDocumentFromBytes } from "./widgets/pdf/pdf-rasterizer.js";

const toggleUiModeButton = document.querySelector("#toggle-ui-mode");
const toggleToolsButton = document.querySelector("#toggle-tools");
const controlsPanel = document.querySelector("#controls-panel");
const statusPanel = document.querySelector(".status-panel");
const toggleResearchPanelButton = document.querySelector("#toggle-research-panel");
const toggleSearchPanelButton = document.querySelector("#toggle-search-panel");
const enableInkButton = document.querySelector("#enable-ink");
const toggleInkToolButton = document.querySelector("#toggle-ink-tool");
const inkToolDropdown = document.querySelector("#ink-tool-dropdown");
const inkToolDropdownToggle = document.querySelector("#ink-tool-dropdown-toggle");
const inkToolDropdownMenu = document.querySelector("#ink-tool-dropdown-menu");
const inkStyleDropdown = document.querySelector("#ink-style-dropdown");
const inkStyleDropdownToggle = document.querySelector("#ink-style-dropdown-toggle");
const inkStyleDropdownMenu = document.querySelector("#ink-style-dropdown-menu");
const inkThicknessRange = document.querySelector("#ink-thickness-range");
const inkCursorPill = document.querySelector("#ink-cursor-pill");
const undoInkButton = document.querySelector("#undo-ink");
const redoInkButton = document.querySelector("#redo-ink");
const startWorkerButton = document.querySelector("#start-worker");
const runStressBenchmarkButton = document.querySelector("#run-stress-benchmark");
const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const referenceCountOutput = document.querySelector("#reference-count");
const snipStateOutput = document.querySelector("#snip-state");
const snipModeNotifier = document.querySelector("#snip-mode-notifier");
const snipModeLabel = document.querySelector("#snip-mode-label");
const snipExitButton = document.querySelector("#snip-exit");
const whitespaceStateOutput = document.querySelector("#whitespace-state");
const peekStateOutput = document.querySelector("#peek-state");
const whitespaceZoneCountOutput = document.querySelector("#whitespace-zone-count");
const activeContextOutput = document.querySelector("#active-context");
const activeSectionOutput = document.querySelector("#active-section");
const documentCountOutput = document.querySelector("#document-count");
const inkStateOutput = document.querySelector("#ink-state");
const inkToolOutput = document.querySelector("#ink-tool");
const strokeCountOutput = document.querySelector("#stroke-count");
const gestureStateOutput = document.querySelector("#gesture-state");
const searchIndexCountOutput = document.querySelector("#search-index-count");
const cameraOutput = document.querySelector("#camera-state");
const workerStateOutput = document.querySelector("#worker-state");
const storageUsageProgress = document.querySelector("#storage-usage-progress");
const storageUsageLabel = document.querySelector("#storage-usage-label");
const storageUsageMeter = document.querySelector("#storage-usage-meter");
const perfFpsOutput = document.querySelector("#perf-fps");
const perfFrameMsOutput = document.querySelector("#perf-frame-ms");
const perfRenderedWidgetsOutput = document.querySelector("#perf-rendered-widgets");
const perfRasterizedWidgetsOutput = document.querySelector("#perf-rasterized-widgets");
const perfRasterCacheOutput = document.querySelector("#perf-raster-cache");
const perfRasterQueueOutput = document.querySelector("#perf-raster-queue");
const perfMemoryOutput = document.querySelector("#perf-memory");
const perfBenchmarkOutput = document.querySelector("#perf-benchmark");
const canvas = document.querySelector("#workspace-canvas");
const widgetContextMenu = document.querySelector("#widget-context-menu");
const creationCommandMenu = document.querySelector("#creation-command-menu");
const pdfFileInput = document.querySelector("#pdf-file-input");
const researchPanel = document.querySelector("#research-panel");
const searchPanel = document.querySelector("#search-panel");
const suggestionRail = document.querySelector("#suggestion-rail");
const sectionMinimap = document.querySelector("#section-minimap");
const sectionMinimapCanvas = document.querySelector("#section-minimap-canvas");
const referenceManagerLauncher = document.querySelector("#reference-manager-launcher");
const referenceManagerOverlay = document.querySelector("#reference-manager-overlay");
const referenceManagerPanel = document.querySelector("#reference-manager-panel");
const referenceManagerCloseButton = document.querySelector("#reference-manager-close");
const referenceManagerTabReferences = document.querySelector("#reference-manager-tab-references");
const referenceManagerTabNotes = document.querySelector("#reference-manager-tab-notes");
const referenceManagerTabDocuments = document.querySelector("#reference-manager-tab-documents");
const referenceManagerReferenceList = document.querySelector("#reference-manager-reference-list");
const referenceManagerNoteList = document.querySelector("#reference-manager-note-list");
const referenceManagerDocumentList = document.querySelector("#reference-manager-document-list");
const referenceManagerReferenceCount = document.querySelector("#reference-manager-reference-count");
const referenceManagerNoteCount = document.querySelector("#reference-manager-note-count");
const referenceManagerDocumentCount = document.querySelector("#reference-manager-document-count");
const referencePreviewLayer = document.querySelector("#reference-preview-layer");
const documentTabs = document.querySelector("#document-tabs");
const documentSwitcher = document.querySelector("#document-switcher");
const sectionTabs = document.querySelector("#section-tabs");
const newSectionButton = document.querySelector("#new-section");
const documentSettingsHint = document.querySelector("#document-settings-hint");
const referenceBindingSelect = document.querySelector("#document-reference-bindings");
const formulaBindingSelect = document.querySelector("#document-formula-bindings");
const applyBindingsButton = document.querySelector("#apply-document-bindings");
const focusBindingsButton = document.querySelector("#focus-document-bindings");
const togglePinDocumentButton = document.querySelector("#toggle-pin-document");
const gestureEnabledToggle = document.querySelector("#gesture-enabled");
const gestureDoubleTapToggle = document.querySelector("#gesture-doubletap-enabled");
const gestureBarrelTapToggle = document.querySelector("#gesture-barreltap-enabled");
const gestureDoubleTapBindingSelect = document.querySelector("#gesture-doubletap-binding");
const gestureBarrelTapBindingSelect = document.querySelector("#gesture-barreltap-binding");
const toggleOnboardingHintsButton = document.querySelector("#toggle-onboarding-hints");
const resetOnboardingHintsButton = document.querySelector("#reset-onboarding-hints");
const debugOnlyControls = Array.from(document.querySelectorAll('[data-debug-only="true"]'));
const productionHiddenControls = Array.from(document.querySelectorAll("[data-production-hidden='true']"));
const uiModeStateOutput = document.querySelector("#ui-mode-state");

const contextSelect = document.querySelector("#context-select");
const contextPickerPill = document.querySelector("#context-picker-pill");
const contextDropdownToggle = document.querySelector("#context-dropdown-toggle");
const contextDropdownLabel = document.querySelector("#context-dropdown-label");
const contextDropdownMenu = document.querySelector("#context-dropdown-menu");
const contextDropdownList = document.querySelector("#context-dropdown-list");
const newContextButton = document.querySelector("#new-context");
const importContextWidgetButton = document.querySelector("#import-context-widget");
const onboardingHintRoot = document.querySelector("#onboarding-hint");
const onboardingHintTitle = document.querySelector("#onboarding-hint-title");
const onboardingHintBody = document.querySelector("#onboarding-hint-body");
const onboardingHintProgress = document.querySelector("#onboarding-hint-progress");
const onboardingHintActionButton = document.querySelector("#onboarding-hint-action");
const onboardingHintDismissButton = document.querySelector("#onboarding-hint-dismiss");
const onboardingHintToggleButton = document.querySelector("#onboarding-hint-toggle");
const onboardingHintResetButton = document.querySelector("#onboarding-hint-reset");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #workspace-canvas element.");
}
const canvasViewportContainer = canvas.closest(".canvas-wrap");

const loadedModules = new Set();
let inkFeature = null;
let popupInteractions = null;
let diagramInteractions = null;
let snipTool = null;
let whitespaceManager = null;
let researchPanelController = null;
let searchIndex = null;
let searchPanelController = null;
let penGestureController = null;
let widgetInteractionManager = null;
let widgetCreationController = null;
let widgetRasterManager = null;
let detachDocumentFocusSync = null;
let detachWidgetRemovalSuggestionSync = null;
let toolsPanelOpen = false;
let pendingPdfImportIntent = null;
let uiModeState = { mode: "production" };
let debugModeEnabled = false;
const GESTURE_PREFS_KEY = "notes-app.gesture-prefs.v1";
let gesturePrefs = null;
let lastGestureStatus = {
  supported: false,
  enabled: false,
  lastGesture: "idle",
  lastBinding: "none",
};
let worldSizeConfig = loadWorldSizeConfig();
let inkStateSnapshot = {
  completedStrokes: 0,
  undoDepth: 0,
  redoDepth: 0,
  activePointers: 0,
  activeTool: "pen",
  penColor: "#103f78",
  penThickness: 3,
  enabled: false,
};
let inkStyleMenuCloseTimer = null;
let minimapVisible = false;
let suggestionRailRenderFrame = null;
let suggestionRailRenderQueued = false;
let minimapRenderFrame = null;
let minimapRenderQueued = false;

let contextStore = null;
let contextWorkspaceStore = null;
let contextUiController = null;
let sectionUiController = null;
let sectionsStore = createNotebookSectionsStore();
const notebookLibraryStore = createNotebookLibraryStore();
const notebookDocumentLibraryStore = createNotebookDocumentLibraryStore({
  assetManagerOptions: {
    allowLocalStoragePayloadFallback: false,
  },
});
const suggestionStore = createSuggestionStore();
const suggestionEngine = createSuggestionEngine();
let suggestionUiController = null;
let sectionMinimapController = null;
let referenceManagerUiController = null;
let inputRoutingController = null;
let viewportDockOverlayController = null;
let libraryOverlayController = null;
let workspacePersistenceController = null;
let suggestionAnalysisTimer = null;
let suggestionAnalysisInFlight = false;
let suggestionAnalysisQueued = false;
let storageUsageRefreshTimer = null;
let storageUsageRefreshInFlight = false;
let storageUsageRefreshQueued = false;
let canvasViewportSyncFrame = null;
let perfHudRefreshTimer = null;
let perfFrameHistory = [];
let perfBenchmarkRunning = false;
let lastStorageEstimate = null;
let runtimeReadyForViewportDock = false;

let activeContextId = null;
let activeSectionId = null;
const documentManager = createDocumentManager();
let lastPdfWidgetId = null;
let lastReferenceWidgetId = null;
let lastDocumentUiRenderKey = "";
let researchCaptures = [];

let restoringContext = false;
let widgetHeavySyncTimer = null;
let hasShownWorkspaceStorageWarning = false;
let onboardingStateService = createOnboardingStateService();
let onboardingOverlay = null;
let onboardingRefreshTimer = null;
let onboardingHintVisibleId = null;
const failedLocalStorageKeys = new Set();
const VIEWPORT_DOCK_EDGE_ZONE_PX = 48;
const VIEWPORT_DOCK_HOLD_MS = 220;
const VIEWPORT_DOCK_MARGIN_PX = 10;
const VIEWPORT_DOCK_META_VERSION = 1;
const VIEWPORT_DOCK_EPSILON_WORLD = 0.001;
const VIEWPORT_DOCK_WIDTH_RATIO = 0.25;
const VIEWPORT_DOCK_HEIGHT_RATIO = 0.5;
const VIEWPORT_DOCK_MIN_WIDTH_PX = 120;
const VIEWPORT_DOCK_MIN_HEIGHT_PX = 120;
const VIEWPORT_DOCK_MAX_WIDTH_RATIO = 0.45;
const VIEWPORT_DOCK_MAX_HEIGHT_RATIO = 0.6;
const VIEWPORT_DOCK_CONTENT_MIN_ZOOM = 0.4;
const VIEWPORT_DOCK_CONTENT_MAX_ZOOM = 3.5;
const WIDGET_TRASH_TARGET_SIZE_PX = 56;
const WIDGET_TRASH_TARGET_MARGIN_PX = 14;
const LASSO_NOTE_PADDING_WORLD = 28;
const LASSO_NOTE_MIN_WIDTH_WORLD = 220;
const LASSO_NOTE_MIN_HEIGHT_WORLD = 120;
const onboardingRuntimeSignals = {
  searchOpened: false,
  peekActivated: false,
  gestureUsed: false,
};

function safeLocalStorageSetItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    failedLocalStorageKeys.delete(key);
    return true;
  } catch (error) {
    if (!failedLocalStorageKeys.has(key)) {
      failedLocalStorageKeys.add(key);
      console.warn(`Failed to persist "${key}" in localStorage.`, error);
    }
    return false;
  }
}

function safeLocalStorageGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function triggerWidgetHaptic(type = "soft") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  if (type === "delete") {
    navigator.vibrate([18, 24, 22]);
    return;
  }
  navigator.vibrate(12);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function requestPersistentStorageQuota() {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return;
  }

  try {
    const storage = navigator.storage;
    const alreadyPersisted =
      typeof storage.persisted === "function" ? await storage.persisted() : false;
    if (!alreadyPersisted && typeof storage.persist === "function") {
      await storage.persist();
    }
  } catch (error) {
    console.warn("[storage] failed to request persistent storage.", error);
  }
}

async function prepareStorageBackends() {
  await requestPersistentStorageQuota();
  if (typeof notebookDocumentLibraryStore.prepare === "function") {
    try {
      await notebookDocumentLibraryStore.prepare();
    } catch (error) {
      console.warn("[storage] failed to prepare notebook document storage.", error);
    }
  }
}

function formatMegabytes(bytes) {
  const mb = Math.max(0, Number(bytes) || 0) / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

async function readStorageEstimateSnapshot() {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = Math.max(0, Number(estimate?.usage) || 0);
    const quota = Math.max(0, Number(estimate?.quota) || 0);
    const hasQuota = quota > 0;
    const usageRatio = hasQuota ? usage / quota : 0;
    const snapshot = {
      usage,
      quota,
      hasQuota,
      usageRatio,
      remaining: hasQuota ? Math.max(0, quota - usage) : Number.POSITIVE_INFINITY,
      timestamp: Date.now(),
    };
    lastStorageEstimate = snapshot;
    return snapshot;
  } catch (_error) {
    return null;
  }
}

function requestStorageCleanupNow() {
  if (
    contextWorkspaceStore &&
    typeof contextWorkspaceStore.requestStorageCleanup === "function"
  ) {
    contextWorkspaceStore.requestStorageCleanup({ enforceBudget: false, delayMs: 0 });
  }
  if (
    notebookDocumentLibraryStore &&
    typeof notebookDocumentLibraryStore.requestStorageCleanup === "function"
  ) {
    notebookDocumentLibraryStore.requestStorageCleanup({ enforceBudget: false, delayMs: 0 });
  }
  scheduleStorageUsageRefresh({ delayMs: 40 });
}

async function ensureStorageHeadroomForPdfImport(file) {
  const incomingBytes =
    file && typeof file.size === "number" && Number.isFinite(file.size)
      ? Math.max(0, Math.floor(file.size))
      : 0;
  if (incomingBytes < 1) {
    return true;
  }

  const before = await readStorageEstimateSnapshot();
  if (!before || !before.hasQuota) {
    return true;
  }

  const reserveTarget = Math.max(24 * 1024 * 1024, Math.ceil(incomingBytes * 1.25));
  if (before.remaining >= reserveTarget && before.usageRatio < 0.9) {
    return true;
  }

  requestStorageCleanupNow();
  await new Promise((resolve) => {
    window.setTimeout(resolve, 80);
  });

  const after = (await readStorageEstimateSnapshot()) ?? before;
  if (after.remaining >= reserveTarget && after.usageRatio < 0.92) {
    return true;
  }

  const continueImport = await showConfirmDialog({
    title: "Low Storage Space",
    message: [
      `Importing "${file.name}" may exceed available storage.`,
      `Used: ${formatMegabytes(after.usage)} / ${formatMegabytes(after.quota)} (${formatPercent(after.usageRatio * 100)})`,
      `Needed for safe import: ${formatMegabytes(reserveTarget)} free.`,
      "",
      "Continue anyway?",
    ].join("\n"),
    confirmLabel: "Import Anyway",
    cancelLabel: "Cancel",
    danger: true,
  });
  return continueImport;
}

async function refreshStorageUsageUi() {
  if (
    !(storageUsageProgress instanceof HTMLProgressElement) ||
    !(storageUsageLabel instanceof HTMLOutputElement)
  ) {
    return;
  }

  if (storageUsageRefreshInFlight) {
    storageUsageRefreshQueued = true;
    return;
  }

  storageUsageRefreshInFlight = true;
  try {
    const snapshot = await readStorageEstimateSnapshot();
    if (!snapshot) {
      storageUsageProgress.max = 1;
      storageUsageProgress.value = 0;
      storageUsageLabel.textContent = "Unavailable";
      return;
    }
    storageUsageProgress.max = snapshot.hasQuota ? snapshot.quota : 1;
    storageUsageProgress.value = snapshot.hasQuota ? Math.min(snapshot.usage, snapshot.quota) : 0;
    storageUsageLabel.textContent = snapshot.hasQuota
      ? `${formatMegabytes(snapshot.usage)} / ${formatMegabytes(snapshot.quota)}`
      : `${formatMegabytes(snapshot.usage)} / Unknown`;
  } catch (_error) {
    storageUsageProgress.max = 1;
    storageUsageProgress.value = 0;
    storageUsageLabel.textContent = "Unavailable";
  } finally {
    storageUsageRefreshInFlight = false;
    if (storageUsageRefreshQueued) {
      storageUsageRefreshQueued = false;
      void refreshStorageUsageUi();
    }
  }
}

function scheduleStorageUsageRefresh({ delayMs = 220 } = {}) {
  if (storageUsageRefreshTimer) {
    window.clearTimeout(storageUsageRefreshTimer);
    storageUsageRefreshTimer = null;
  }

  storageUsageRefreshTimer = window.setTimeout(() => {
    storageUsageRefreshTimer = null;
    void refreshStorageUsageUi();
  }, Math.max(0, Number(delayMs) || 0));
}

function formatFrameMs(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "0.0 ms";
  }
  return `${value.toFixed(1)} ms`;
}

function samplePercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length < 1) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, percentile));
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor(ratio * sortedValues.length)),
  );
  return Number(sortedValues[index]) || 0;
}

function refreshPerfHud() {
  if (
    !(perfFpsOutput instanceof HTMLOutputElement) ||
    !(perfFrameMsOutput instanceof HTMLOutputElement) ||
    !(perfRenderedWidgetsOutput instanceof HTMLOutputElement) ||
    !(perfRasterizedWidgetsOutput instanceof HTMLOutputElement) ||
    !(perfRasterCacheOutput instanceof HTMLOutputElement) ||
    !(perfRasterQueueOutput instanceof HTMLOutputElement) ||
    !(perfMemoryOutput instanceof HTMLOutputElement)
  ) {
    return;
  }

  if (perfFrameHistory.length > 180) {
    perfFrameHistory = perfFrameHistory.slice(-180);
  }

  const frameSamples = perfFrameHistory.filter((value) => Number.isFinite(value) && value > 0);
  const avgFrameMs =
    frameSamples.length > 0
      ? frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length
      : 0;
  const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
  perfFpsOutput.textContent = fps.toFixed(1);
  perfFrameMsOutput.textContent = formatFrameMs(avgFrameMs);
  const renderStats =
    runtime && typeof runtime.getRenderStats === "function"
      ? runtime.getRenderStats()
      : null;
  perfRenderedWidgetsOutput.textContent = String(Number(renderStats?.renderedWidgetCount ?? 0));
  perfRasterizedWidgetsOutput.textContent = String(Number(renderStats?.rasterizedWidgetCount ?? 0));

  const rasterStats =
    widgetRasterManager && typeof widgetRasterManager.getStats === "function"
      ? widgetRasterManager.getStats()
      : null;
  perfRasterCacheOutput.textContent = formatMegabytes(rasterStats?.totalBytes ?? 0);
  perfRasterQueueOutput.textContent = String(Number(rasterStats?.queueSize ?? 0));

  const memory =
    typeof performance !== "undefined" && performance && performance.memory
      ? performance.memory
      : null;
  if (memory && Number.isFinite(memory.usedJSHeapSize) && Number.isFinite(memory.jsHeapSizeLimit)) {
    perfMemoryOutput.textContent = `${formatMegabytes(memory.usedJSHeapSize)} / ${formatMegabytes(memory.jsHeapSizeLimit)}`;
  } else {
    perfMemoryOutput.textContent = "n/a";
  }
}

function schedulePerfHudRefresh({ delayMs = 300 } = {}) {
  if (perfHudRefreshTimer) {
    window.clearTimeout(perfHudRefreshTimer);
    perfHudRefreshTimer = null;
  }
  perfHudRefreshTimer = window.setTimeout(() => {
    perfHudRefreshTimer = null;
    refreshPerfHud();
  }, Math.max(0, Number(delayMs) || 0));
}

async function runStressBenchmark() {
  if (perfBenchmarkRunning) {
    return;
  }
  perfBenchmarkRunning = true;
  if (runStressBenchmarkButton instanceof HTMLButtonElement) {
    runStressBenchmarkButton.disabled = true;
    runStressBenchmarkButton.textContent = "Benchmarking...";
  }
  if (perfBenchmarkOutput instanceof HTMLOutputElement) {
    perfBenchmarkOutput.textContent = "running";
  }

  const samples = [];
  const detachFrame =
    runtime && typeof runtime.registerFrameListener === "function"
      ? runtime.registerFrameListener((stats) => {
          if (Number.isFinite(stats?.frameDtMs) && stats.frameDtMs > 0) {
            samples.push(stats.frameDtMs);
          }
        })
      : () => {};

  try {
    const durationMs = 4200;
    runtime.requestRender({ continuousMs: durationMs + 80 });
    await new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });

    const sorted = samples
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
    const avgFrameMs =
      sorted.length > 0 ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0;
    const p95Ms = samplePercentile(sorted, 0.95);
    const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;

    const result = sorted.length > 0
      ? `${fps.toFixed(1)} fps avg, ${avgFrameMs.toFixed(1)}ms avg, ${p95Ms.toFixed(1)}ms p95`
      : "insufficient samples";
    if (perfBenchmarkOutput instanceof HTMLOutputElement) {
      perfBenchmarkOutput.textContent = result;
    }
    await showNoticeDialog(
      [
        "Stress benchmark complete.",
        `Samples: ${sorted.length}`,
        `Average FPS: ${fps.toFixed(1)}`,
        `Average frame: ${avgFrameMs.toFixed(1)} ms`,
        `P95 frame: ${p95Ms.toFixed(1)} ms`,
      ].join("\n"),
      { title: "Performance Benchmark" },
    );
  } finally {
    detachFrame();
    perfBenchmarkRunning = false;
    if (runStressBenchmarkButton instanceof HTMLButtonElement) {
      runStressBenchmarkButton.disabled = false;
      runStressBenchmarkButton.textContent = "Run Stress Benchmark";
    }
  }
}

function registerPwaServiceWorker() {
  const hostname =
    typeof window !== "undefined" && window.location ? window.location.hostname : "";
  const isLocalDevHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isSecureContext =
    typeof window !== "undefined" && window.location
      ? window.location.protocol === "https:" || isLocalDevHost
      : false;

  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !isSecureContext
  ) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error) => {
        console.warn("[pwa] failed to register service worker.", error);
      });
  });
}

let activeAppDialog = null;

function closeActiveAppDialog() {
  if (activeAppDialog instanceof HTMLDialogElement && activeAppDialog.open) {
    activeAppDialog.close("cancel");
  }
  activeAppDialog = null;
}

function showAppDialog({
  title = "",
  message = "",
  actions = [],
  buildBody = null,
  closeOnCancel = true,
} = {}) {
  return new Promise((resolve) => {
    closeActiveAppDialog();

    const dialog = document.createElement("dialog");
    dialog.className = "app-modal";
    activeAppDialog = dialog;

    const form = document.createElement("form");
    form.method = "dialog";
    form.className = "app-modal__body";

    if (title) {
      const titleElement = document.createElement("h2");
      titleElement.className = "app-modal__title";
      titleElement.textContent = title;
      form.append(titleElement);
    }

    if (message) {
      const messageElement = document.createElement("p");
      messageElement.className = "app-modal__message";
      messageElement.textContent = message;
      form.append(messageElement);
    }

    if (typeof buildBody === "function") {
      buildBody(form);
    }

    const actionsRow = document.createElement("div");
    actionsRow.className = "app-modal__actions";

    const normalizedActions = actions.length > 0
      ? actions
      : [{ id: "ok", label: "OK", variant: "primary" }];

    for (const action of normalizedActions) {
      const button = document.createElement("button");
      button.type = "submit";
      button.className = "app-modal__button";
      if (action.variant === "primary") {
        button.classList.add("app-modal__button--primary");
      } else if (action.variant === "danger") {
        button.classList.add("app-modal__button--danger");
      }
      button.value = action.id;
      button.textContent = action.label;
      actionsRow.append(button);
    }

    form.append(actionsRow);
    dialog.append(form);

    const cleanup = (result = null) => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      dialog.remove();
      if (activeAppDialog === dialog) {
        activeAppDialog = null;
      }
      resolve(result);
    };

    const onCancel = (event) => {
      if (!closeOnCancel) {
        event.preventDefault();
      }
    };

    const onClose = () => {
      cleanup(dialog.returnValue || null);
    };

    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function showNoticeDialog(message, { title = "Notice", buttonLabel = "OK" } = {}) {
  await showAppDialog({
    title,
    message,
    actions: [{ id: "ok", label: buttonLabel, variant: "primary" }],
  });
}

async function showConfirmDialog({
  title = "Confirm",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
} = {}) {
  const result = await showAppDialog({
    title,
    message,
    actions: [
      { id: "cancel", label: cancelLabel },
      { id: "confirm", label: confirmLabel, variant: danger ? "danger" : "primary" },
    ],
  });
  return result === "confirm";
}

async function showTextPromptDialog({
  title = "Enter value",
  message = "",
  label = "Value",
  defaultValue = "",
  placeholder = "",
  confirmLabel = "Save",
} = {}) {
  let input = null;
  const result = await showAppDialog({
    title,
    message,
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "confirm", label: confirmLabel, variant: "primary" },
    ],
    buildBody: (root) => {
      const field = document.createElement("label");
      field.className = "app-modal__field";

      const fieldLabel = document.createElement("span");
      fieldLabel.className = "app-modal__field-label";
      fieldLabel.textContent = label;

      input = document.createElement("input");
      input.type = "text";
      input.className = "app-modal__field-input";
      input.value = defaultValue;
      input.placeholder = placeholder;
      input.autocomplete = "off";

      field.append(fieldLabel, input);
      root.append(field);

      queueMicrotask(() => {
        input?.focus();
        input?.select();
      });
    },
  });

  if (result !== "confirm" || !(input instanceof HTMLInputElement)) {
    return null;
  }
  const value = input.value.trim();
  return value || null;
}

async function showActionDialog({
  title = "",
  message = "",
  actions = [],
  cancelLabel = "Cancel",
} = {}) {
  if (!Array.isArray(actions) || actions.length < 1) {
    return null;
  }
  const normalizedActions = actions.map((action) => ({
    id: action.id,
    label: action.label,
    variant: action.variant ?? "primary",
  }));
  normalizedActions.push({ id: "cancel", label: cancelLabel });

  const result = await showAppDialog({
    title,
    message,
    actions: normalizedActions,
  });
  return result === "cancel" ? null : result;
}

async function showSelectDialog({
  title = "",
  message = "",
  label = "Select an option",
  options = [],
  confirmLabel = "Select",
  defaultOptionId = null,
} = {}) {
  if (!Array.isArray(options) || options.length < 1) {
    return null;
  }

  let select = null;
  const result = await showAppDialog({
    title,
    message,
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "confirm", label: confirmLabel, variant: "primary" },
    ],
    buildBody: (root) => {
      const field = document.createElement("label");
      field.className = "app-modal__field";

      const fieldLabel = document.createElement("span");
      fieldLabel.className = "app-modal__field-label";
      fieldLabel.textContent = label;

      select = document.createElement("select");
      select.className = "app-modal__field-select";

      for (const option of options) {
        const element = document.createElement("option");
        element.value = option.id;
        element.textContent = option.label;
        select.append(element);
      }

      if (typeof defaultOptionId === "string" && defaultOptionId.trim()) {
        select.value = defaultOptionId;
      }

      field.append(fieldLabel, select);
      root.append(field);

      queueMicrotask(() => {
        select?.focus();
      });
    },
  });

  if (result !== "confirm" || !(select instanceof HTMLSelectElement)) {
    return null;
  }

  return options.find((option) => option.id === select.value) ?? null;
}

async function showMultiSelectDialog({
  title = "",
  message = "",
  options = [],
  confirmLabel = "Apply",
} = {}) {
  if (!Array.isArray(options) || options.length < 1) {
    return [];
  }

  const checkedById = new Map(options.map((option) => [option.id, false]));
  const result = await showAppDialog({
    title,
    message,
    actions: [
      { id: "cancel", label: "Cancel" },
      { id: "confirm", label: confirmLabel, variant: "primary" },
    ],
    buildBody: (root) => {
      const list = document.createElement("div");
      list.className = "app-modal__choice-list";

      for (const option of options) {
        const label = document.createElement("label");
        label.className = "app-modal__choice-item";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "app-modal__choice-input";
        input.addEventListener("change", () => {
          checkedById.set(option.id, input.checked);
        });

        const text = document.createElement("span");
        text.className = "app-modal__choice-label";
        text.textContent = option.label;

        label.append(input, text);
        list.append(label);
      }

      root.append(list);
    },
  });

  if (result !== "confirm") {
    return [];
  }

  return options
    .map((option) => option.id)
    .filter((id) => checkedById.get(id) === true);
}

function formatErrorMessage(error, fallback = "Unknown error.") {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

const registry = new WidgetRegistry();
registry.register("expanded-area", () => import("./widgets/expanded-area/index.js"));
registry.register("pdf-document", () => import("./widgets/pdf/index.js"));
registry.register("reference-popup", () => import("./widgets/reference-popup/index.js"));
registry.register("diagram", () => import("./widgets/diagram/index.js"));
registry.onModuleLoaded((type) => {
  loadedModules.add(type);
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }
});

const runtime = new CanvasRuntime({
  canvas,
  onCameraChange: ({ x, y, zoom }) => {
    if (runtimeReadyForViewportDock) {
      applyViewportDockToAllWidgets();
    }
    if (cameraOutput) {
      cameraOutput.textContent = `x=${x.toFixed(1)}, y=${y.toFixed(1)}, zoom=${zoom.toFixed(2)}`;
    }
    renderSuggestionRail();
    renderSectionMinimap();
  },
  onViewModeChange: ({ mode }) => {
    if (peekStateOutput) {
      peekStateOutput.textContent = mode === "peek" ? "legacy-peek" : `minimap:${minimapVisible ? "on" : "off"}`;
    }
  },
  onSelectionChange: () => {
    renderSuggestionRail();
    renderSectionMinimap();
  },
});
runtimeReadyForViewportDock = true;
if (typeof runtime.registerFrameListener === "function") {
  runtime.registerFrameListener((stats) => {
    if (Number.isFinite(stats?.frameDtMs) && stats.frameDtMs > 0) {
      perfFrameHistory.push(stats.frameDtMs);
      if (perfFrameHistory.length > 240) {
        perfFrameHistory.shift();
      }
    }
    if (debugModeEnabled) {
      schedulePerfHudRefresh({ delayMs: 140 });
    }
  });
}

viewportDockOverlayController = createViewportDockOverlayController({
  runtime,
  getViewportRect: () => resolveCanvasViewportRect(),
  isPointerOverLibraryLauncher: (clientX, clientY) => pointerOverLibraryLauncher(clientX, clientY),
  constants: {
    edgeZonePx: VIEWPORT_DOCK_EDGE_ZONE_PX,
    holdMs: VIEWPORT_DOCK_HOLD_MS,
    marginPx: VIEWPORT_DOCK_MARGIN_PX,
    metaVersion: VIEWPORT_DOCK_META_VERSION,
    epsilonWorld: VIEWPORT_DOCK_EPSILON_WORLD,
    widthRatio: VIEWPORT_DOCK_WIDTH_RATIO,
    heightRatio: VIEWPORT_DOCK_HEIGHT_RATIO,
    minWidthPx: VIEWPORT_DOCK_MIN_WIDTH_PX,
    minHeightPx: VIEWPORT_DOCK_MIN_HEIGHT_PX,
    contentMinZoom: VIEWPORT_DOCK_CONTENT_MIN_ZOOM,
    contentMaxZoom: VIEWPORT_DOCK_CONTENT_MAX_ZOOM,
  },
  onDockCommitted: () => {
    triggerWidgetHaptic("soft");
    updateWidgetUi({ coalesceHeavy: true });
  },
});

libraryOverlayController = createLibraryOverlayController({
  runtime,
  getViewportRect: () => resolveCanvasViewportRect(),
  pointerOverLibraryLauncher: (clientX, clientY) => pointerOverLibraryLauncher(clientX, clientY),
  setLibraryDropTargetState: ({ active, over }) => {
    setLibraryDropTargetState({ active, over });
  },
  showLibraryDropFeedback: ({ kind, message }) => {
    showLibraryDropFeedback({ kind, message });
  },
  addWidgetToLibraryFromDrag: async (widget) => addWidgetToNotebookLibraryFromDrag(widget),
  animateWidgetBackToOrigin: async (widget, originPosition) =>
    animateWidgetBackToOrigin(widget, originPosition),
  onDeleteWidget: (widgetId) => {
    runtime.removeWidgetById(widgetId, { reason: "drag-trash-delete" });
    if (runtime.getSelectedWidgetId() === widgetId) {
      runtime.setSelectedWidgetId(null);
    }
    if (runtime.getFocusedWidgetId() === widgetId) {
      runtime.setFocusedWidgetId(null);
    }
  },
  onAfterDropMutation: () => {
    updateWidgetUi({ coalesceHeavy: true });
  },
  triggerDeleteHaptic: () => {
    triggerWidgetHaptic("delete");
  },
  constants: {
    trashTargetSizePx: WIDGET_TRASH_TARGET_SIZE_PX,
    trashTargetMarginPx: WIDGET_TRASH_TARGET_MARGIN_PX,
  },
});

function resolveViewportBottomPx() {
  const visualViewport = window.visualViewport;
  if (
    visualViewport &&
    Number.isFinite(visualViewport.height) &&
    visualViewport.height > 0
  ) {
    const offsetTop = Number.isFinite(visualViewport.offsetTop)
      ? visualViewport.offsetTop
      : 0;
    return offsetTop + visualViewport.height;
  }

  return window.innerHeight;
}

function syncCanvasViewportNow() {
  if (canvasViewportContainer instanceof HTMLElement) {
    const rect = canvasViewportContainer.getBoundingClientRect();
    const viewportBottom = resolveViewportBottomPx();
    const targetHeight = Math.max(1, Math.floor(viewportBottom - rect.top));
    canvasViewportContainer.style.height = `${targetHeight}px`;
    canvasViewportContainer.style.minHeight = `${targetHeight}px`;
  }

  runtime.resizeToViewport();
  const dockedMoved = applyViewportDockToAllWidgets();
  if (dockedMoved) {
    runtime.requestRender({ continuousMs: 80 });
  }
  syncViewportDockGlowLayout();
  syncWidgetTrashDropTargetLayout();
  syncReferenceManagerPlacement();
  renderSectionMinimap();
}

function scheduleCanvasViewportSync() {
  if (canvasViewportSyncFrame !== null) {
    return;
  }

  canvasViewportSyncFrame = window.requestAnimationFrame(() => {
    canvasViewportSyncFrame = null;
    syncCanvasViewportNow();
  });
}

widgetRasterManager = createWidgetRasterManager({
  runtime,
  shouldRasterizeWidget: (widget) => {
    // Keep large PDF surfaces on their native renderer path to avoid heavy snapshot stalls/artifacts.
    return widget?.type !== "pdf-document";
  },
  isWidgetActive: (widget) => {
    if (!inkFeature || typeof inkFeature.isWidgetInkActive !== "function") {
      return false;
    }
    return inkFeature.isWidgetInkActive(widget?.id);
  },
  isInkActive: () => {
    if (!inkFeature || typeof inkFeature.hasActiveInkPointers !== "function") {
      return false;
    }
    return inkFeature.hasActiveInkPointers();
  },
  getWidgetRuntimeRevision: (widget) => {
    if (!inkFeature || typeof inkFeature.getWidgetInkRevision !== "function") {
      return 0;
    }
    return inkFeature.getWidgetInkRevision(widget?.id);
  },
  drawContributors: [
    ({ ctx, camera, widget }) => {
      if (!inkFeature || typeof inkFeature.renderWidgetInkForRaster !== "function") {
        return;
      }
      inkFeature.renderWidgetInkForRaster(ctx, camera, widget.id);
    },
  ],
});
runtime.setWidgetRasterManager(widgetRasterManager);

const workerClient = new BackgroundWorkerClient(
  new URL("./core/workers/analysis-worker.js", import.meta.url),
);

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function decodeBase64ToBytes(base64Value) {
  if (typeof base64Value !== "string" || !base64Value.trim()) {
    return null;
  }

  try {
    const binary = window.atob(base64Value.trim());
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (_error) {
    return null;
  }
}

function workspaceScopeId(notebookId = activeContextId, sectionId = activeSectionId) {
  if (
    typeof notebookId === "string" &&
    notebookId.trim() &&
    typeof sectionId === "string" &&
    sectionId.trim()
  ) {
    return `${notebookId}::${sectionId}`;
  }

  if (typeof notebookId === "string" && notebookId.trim()) {
    return notebookId;
  }

  return null;
}

function parseWorkspaceScopeId(scopeId) {
  if (typeof scopeId !== "string" || !scopeId.trim()) {
    return { notebookId: null, sectionId: null };
  }

  const [notebookId, sectionId] = scopeId.split("::");
  return {
    notebookId: notebookId || null,
    sectionId: sectionId || null,
  };
}

function currentSuggestionScope() {
  const scopeId = workspaceScopeId();
  if (!scopeId) {
    return null;
  }

  const parsed = parseWorkspaceScopeId(scopeId);
  const sectionId = parsed.sectionId ?? activeSectionId ?? null;
  if (!sectionId) {
    return null;
  }

  return {
    scopeId,
    sectionId,
  };
}

function defaultPlacement(baseX, baseY, stepX, stepY) {
  return {
    x: baseX + runtime.getWidgetCount() * stepX,
    y: baseY + runtime.getWidgetCount() * stepY,
  };
}

const CREATION_TYPES = new Set(ALLOWED_CREATION_INTENT_TYPES);

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function isProductionUi() {
  return isProductionMode(uiModeState);
}

function syncDebugControls() {
  for (const control of debugOnlyControls) {
    if (control instanceof HTMLElement) {
      control.hidden = !debugModeEnabled;
    }
  }
}

function syncDocumentSettingsUi() {
  // Doc panel has been removed from the visible app shell.
}

function syncUiModeControls() {
  const productionMode = isProductionUi();

  if (document.body) {
    document.body.dataset.uiMode = productionMode ? "production" : "debug";
  }

  if (statusPanel instanceof HTMLElement) {
    statusPanel.hidden = productionMode;
  }
  if (storageUsageMeter instanceof HTMLElement) {
    storageUsageMeter.hidden = productionMode;
  }

  for (const control of productionHiddenControls) {
    if (control instanceof HTMLElement) {
      control.hidden = productionMode;
    }
  }

  if (toggleUiModeButton instanceof HTMLButtonElement) {
    toggleUiModeButton.textContent = productionMode ? "Mode: Production" : "Mode: Debug";
  }

  if (uiModeStateOutput) {
    uiModeStateOutput.textContent = productionMode ? "production" : "debug";
  }

}

function setUiMode(nextMode, { persist = true } = {}) {
  uiModeState = {
    mode: nextMode === "debug" ? "debug" : "production",
  };
  if (persist) {
    uiModeState = saveUiModeState(uiModeState);
  }

  debugModeEnabled = uiModeState.mode === "debug";

  syncDebugControls();
  syncUiModeControls();
  syncDocumentSettingsUi();
  updateOnboardingControlsUi();
  scheduleCanvasViewportSync();
  if (debugModeEnabled) {
    schedulePerfHudRefresh({ delayMs: 0 });
  }
}

function updateCameraOutputFromState() {
  if (!cameraOutput) {
    return;
  }

  const worldAtCenter = runtime.camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
  cameraOutput.textContent = `x=${worldAtCenter.x.toFixed(1)}, y=${worldAtCenter.y.toFixed(1)}, zoom=${runtime.camera.zoom.toFixed(2)}`;
}

function renderSectionMinimapNow() {
  const visible = sectionMinimapController?.render?.() === true;
  minimapVisible = visible;
  if (peekStateOutput) {
    peekStateOutput.textContent = `minimap:${visible ? "on" : "off"}`;
  }
  return visible;
}

function renderSectionMinimap() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return renderSectionMinimapNow();
  }

  if (minimapRenderFrame !== null) {
    minimapRenderQueued = true;
    return minimapVisible;
  }

  minimapRenderFrame = window.requestAnimationFrame(() => {
    minimapRenderFrame = null;
    renderSectionMinimapNow();
    if (minimapRenderQueued) {
      minimapRenderQueued = false;
      renderSectionMinimap();
    }
  });

  return minimapVisible;
}

function normalizeGesturePrefs(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const gestures = source.gestures && typeof source.gestures === "object" ? source.gestures : {};
  const bindings = source.bindings && typeof source.bindings === "object" ? source.bindings : {};

  const normalizeBinding = (value, fallback) => {
    if (
      value === "none" ||
      value === "toggle-ink-tool" ||
      value === "toggle-ink-enabled" ||
      value === "toggle-search-panel" ||
      value === "select-lasso-tool"
    ) {
      return value;
    }
    return fallback;
  };

  return {
    enabled: source.enabled !== false,
    gestures: {
      doubleTap: gestures.doubleTap === true,
      barrelTap: gestures.barrelTap !== false,
    },
    bindings: {
      doubleTap: normalizeBinding(bindings.doubleTap, "none"),
      barrelTap: normalizeBinding(bindings.barrelTap, "toggle-ink-tool"),
    },
  };
}

function defaultGesturePrefs() {
  return {
    enabled: true,
    gestures: {
      doubleTap: false,
      barrelTap: true,
    },
    bindings: {
      doubleTap: "none",
      barrelTap: "toggle-ink-tool",
    },
  };
}

function loadGesturePrefs() {
  const fallback = defaultGesturePrefs();
  try {
    const raw = window.localStorage.getItem(GESTURE_PREFS_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return normalizeGesturePrefs({ ...fallback, ...(parsed ?? {}) });
  } catch (_error) {
    return fallback;
  }
}

function saveGesturePrefs(prefs) {
  safeLocalStorageSetItem(GESTURE_PREFS_KEY, JSON.stringify(normalizeGesturePrefs(prefs)));
}

function updateGestureUi() {
  const prefs = normalizeGesturePrefs(gesturePrefs);
  if (gestureEnabledToggle instanceof HTMLInputElement) {
    gestureEnabledToggle.checked = prefs.enabled;
  }
  if (gestureDoubleTapToggle instanceof HTMLInputElement) {
    gestureDoubleTapToggle.checked = prefs.gestures.doubleTap;
  }
  if (gestureBarrelTapToggle instanceof HTMLInputElement) {
    gestureBarrelTapToggle.checked = prefs.gestures.barrelTap;
  }
  if (gestureDoubleTapBindingSelect instanceof HTMLSelectElement) {
    gestureDoubleTapBindingSelect.value = prefs.bindings.doubleTap;
    gestureDoubleTapBindingSelect.disabled = !prefs.enabled || !prefs.gestures.doubleTap;
  }
  if (gestureBarrelTapBindingSelect instanceof HTMLSelectElement) {
    gestureBarrelTapBindingSelect.value = prefs.bindings.barrelTap;
    gestureBarrelTapBindingSelect.disabled = !prefs.enabled || !prefs.gestures.barrelTap;
  }

  if (gestureStateOutput) {
    if (!lastGestureStatus.supported) {
      gestureStateOutput.textContent = "unsupported";
      return;
    }

    const enabled = prefs.enabled ? "on" : "off";
    const lastGesture = lastGestureStatus.lastGesture ?? "idle";
    const lastBinding = lastGestureStatus.lastBinding ?? "none";
    gestureStateOutput.textContent = `${enabled} ${lastGesture}:${lastBinding}`;
  }
}

function setGesturePrefs(nextPrefs) {
  gesturePrefs = normalizeGesturePrefs(nextPrefs);
  saveGesturePrefs(gesturePrefs);
  updateGestureUi();
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function resolveWorldSize(type, requestedSize = null) {
  return normalizeWorldSizeForType(worldSizeConfig, type, requestedSize);
}

function resolvePlacementForCreation({ type, intent, requestedSize, fallbackPlacement }) {
  const resolvedSize = resolveWorldSize(type, requestedSize);
  const resolvedPosition = positionFromCreationIntent(intent, resolvedSize, fallbackPlacement);
  const normalizedIntent = normalizeCreationIntent(intent);
  const resolvedAnchor =
    normalizedIntent?.anchor ??
    anchorFromSourceWidget(normalizedIntent?.sourceWidgetId) ??
    {
      x: resolvedPosition.x + resolvedSize.width / 2,
      y: resolvedPosition.y + resolvedSize.height / 2,
    };

  return {
    size: resolvedSize,
    position: resolvedPosition,
    anchor: resolvedAnchor,
  };
}

function viewportCenterAnchor() {
  return runtime.camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
}

function anchorFromScreenPoint(screenPoint) {
  if (!screenPoint || !isFiniteNumber(screenPoint.x) || !isFiniteNumber(screenPoint.y)) {
    return viewportCenterAnchor();
  }

  const rect = canvas.getBoundingClientRect();
  const localX = screenPoint.x - rect.left;
  const localY = screenPoint.y - rect.top;
  return runtime.camera.screenToWorld(localX, localY);
}

function cloneJsonValue(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return fallback;
  }
}

function uniqueTags(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const tags = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const tag = value.trim();
    if (seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
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
      : workspaceScopeId();

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
    contextId: contextId ?? workspaceScopeId(),
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
      ? sourceWidget.getInteractionBounds(runtime.camera)
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
      ? sourceWidget.getInteractionBounds(runtime.camera)
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

function withCreationProvenance(metadata, intent, placement = null, widgetType = null) {
  const base = metadata && typeof metadata === "object" ? { ...metadata } : {};
  const normalized = normalizeCreationIntent(intent);

  if (!normalized) {
    if (!placement) {
      return base;
    }

    return {
      ...base,
      placementMetadata: placementMetadata({
        type: widgetType ?? "reference-popup",
        intent: null,
        size: placement.size,
        position: placement.position,
        anchor: placement.anchor,
        zoom: runtime.camera.zoom,
      }),
    };
  }

  const enriched = {
    ...base,
    createdFrom: normalized.createdFrom,
    creationSourceWidgetId: normalized.sourceWidgetId,
    creationContextId: normalized.contextId,
    creationCreatedAt: nowIso(),
  };

  if (!placement) {
    return enriched;
  }

  return {
    ...enriched,
    placementMetadata: placementMetadata({
      type: widgetType ?? normalized.type,
      intent: normalized,
      size: placement.size,
      position: placement.position,
      anchor: placement.anchor,
      zoom: runtime.camera.zoom,
    }),
  };
}

function resolvePopupSourceDocumentId(intent, fallbackDocumentId = null, useActiveFallback = true) {
  const normalized = normalizeCreationIntent(intent);
  if (normalized?.sourceWidgetId) {
    const linked = documentManager.getDocumentByWidgetId(normalized.sourceWidgetId);
    if (linked?.id) {
      return linked.id;
    }
  }

  if (typeof fallbackDocumentId === "string" && fallbackDocumentId.trim()) {
    return fallbackDocumentId;
  }

  if (!useActiveFallback) {
    return null;
  }

  const active = documentManager.getActiveDocument();
  return active?.id ?? null;
}

function buildPopupMetadata({
  metadata,
  intent,
  fallbackTitle = "Reference",
  fallbackType = "reference-popup",
  useActiveDocumentFallback = true,
} = {}) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const normalizedIntent = normalizeCreationIntent(intent);
  const existingPopupMetadata =
    source.popupMetadata && typeof source.popupMetadata === "object" ? source.popupMetadata : {};
  const resolvedTitle =
    typeof source.title === "string" && source.title.trim()
      ? source.title.trim()
      : typeof existingPopupMetadata.title === "string" && existingPopupMetadata.title.trim()
        ? existingPopupMetadata.title.trim()
        : fallbackTitle;

  const sourceDocumentId = resolvePopupSourceDocumentId(
    intent,
    existingPopupMetadata.sourceDocumentId ?? null,
    useActiveDocumentFallback,
  );

  return {
    ...source,
    title: resolvedTitle,
    popupMetadata: {
      id:
        typeof existingPopupMetadata.id === "string" && existingPopupMetadata.id.trim()
          ? existingPopupMetadata.id
          : makeId("popup"),
      title: resolvedTitle,
      type:
        typeof existingPopupMetadata.type === "string" && existingPopupMetadata.type.trim()
          ? existingPopupMetadata.type
          : fallbackType,
      sourceDocumentId,
      tags: uniqueTags(
        Array.isArray(existingPopupMetadata.tags) && existingPopupMetadata.tags.length > 0
          ? existingPopupMetadata.tags
          : normalizedIntent?.createdFrom
            ? [normalizedIntent.createdFrom]
            : [],
      ),
      createdAt:
        typeof existingPopupMetadata.createdAt === "string" && existingPopupMetadata.createdAt.trim()
          ? existingPopupMetadata.createdAt
          : nowIso(),
    },
  };
}

function normalizeCitation(candidate = {}, defaults = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const sourceTitle =
    typeof source.sourceTitle === "string" && source.sourceTitle.trim()
      ? source.sourceTitle.trim()
      : typeof defaults.sourceTitle === "string"
        ? defaults.sourceTitle
        : "Source";
  const url =
    typeof source.url === "string" && source.url.trim()
      ? source.url.trim()
      : typeof defaults.url === "string"
        ? defaults.url
        : "";
  const snippetType =
    source.snippetType === "image" || source.snippetType === "definition"
      ? source.snippetType
      : defaults.snippetType === "image" || defaults.snippetType === "definition"
        ? defaults.snippetType
        : "text";
  const attributionText =
    typeof source.attributionText === "string" && source.attributionText.trim()
      ? source.attributionText.trim()
      : typeof defaults.attributionText === "string"
        ? defaults.attributionText
        : sourceTitle;

  const citation = {
    sourceTitle,
    url,
    accessedAt:
      typeof source.accessedAt === "string" && source.accessedAt.trim() ? source.accessedAt : nowIso(),
    snippetType,
    attributionText,
  };

  if (typeof source.author === "string" && source.author.trim()) {
    citation.author = source.author.trim();
  }
  if (typeof source.publisher === "string" && source.publisher.trim()) {
    citation.publisher = source.publisher.trim();
  }

  return citation;
}

function normalizeResearchCapture(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const contentType =
    candidate.contentType === "image" || candidate.contentType === "definition"
      ? candidate.contentType
      : "text";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!content) {
    return null;
  }

  const citation = normalizeCitation(candidate.citation, {
    snippetType: contentType,
  });
  if (!citation.url || !citation.sourceTitle || !citation.attributionText) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : makeId("capture"),
    contextId:
      typeof candidate.contextId === "string" && candidate.contextId.trim()
        ? candidate.contextId
        : workspaceScopeId(),
    contentType,
    content,
    citation,
  };
}

function researchCaptureKey(capture) {
  return [
    capture.contextId ?? "",
    capture.contentType,
    capture.content,
    capture.citation.url,
    capture.citation.attributionText,
  ].join("|");
}

function upsertResearchCapture(captureCandidate) {
  const normalized = normalizeResearchCapture(captureCandidate);
  if (!normalized) {
    return null;
  }

  const key = researchCaptureKey(normalized);
  const existing = researchCaptures.find((entry) => researchCaptureKey(entry) === key);
  if (existing) {
    return existing;
  }

  researchCaptures.push(normalized);
  return normalized;
}

function getResearchCaptureById(captureId) {
  return researchCaptures.find((entry) => entry.id === captureId) ?? null;
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

function activeSectionRecord() {
  if (!sectionsStore || !activeContextId || !activeSectionId) {
    return null;
  }

  return sectionsStore
    .listSections(activeContextId)
    .find((entry) => entry.id === activeSectionId) ?? null;
}

function onboardingScopeId() {
  if (typeof activeContextId === "string" && activeContextId.trim()) {
    return activeContextId;
  }
  return null;
}

function isScopeInNotebook(scopeId, notebookId) {
  if (typeof scopeId !== "string" || !scopeId.trim() || typeof notebookId !== "string" || !notebookId.trim()) {
    return false;
  }

  if (scopeId === notebookId) {
    return true;
  }

  return scopeId.startsWith(`${notebookId}::`);
}

function updateInkUi(state) {
  if (!inkStateOutput || !strokeCountOutput || !undoInkButton || !redoInkButton) {
    return;
  }

  inkStateSnapshot = {
    ...inkStateSnapshot,
    ...(state && typeof state === "object" ? state : {}),
  };

  const completed = Number.isFinite(inkStateSnapshot.completedStrokes) ? inkStateSnapshot.completedStrokes : 0;
  const undoDepth = Number.isFinite(inkStateSnapshot.undoDepth) ? inkStateSnapshot.undoDepth : 0;
  const redoDepth = Number.isFinite(inkStateSnapshot.redoDepth) ? inkStateSnapshot.redoDepth : 0;
  const activePointers = Number.isFinite(inkStateSnapshot.activePointers) ? inkStateSnapshot.activePointers : 0;
  const activeTool = normalizeInkTool(inkStateSnapshot.activeTool);
  const penColor = normalizeInkColor(inkStateSnapshot.penColor);
  const penThickness = normalizeInkThickness(inkStateSnapshot.penThickness);
  const enabled = inkStateSnapshot.enabled !== false;

  strokeCountOutput.textContent = String(completed);
  undoInkButton.disabled = undoDepth < 1;
  redoInkButton.disabled = redoDepth < 1;

  if (inkToolOutput) {
    inkToolOutput.textContent = activeTool;
  }

  if (toggleInkToolButton instanceof HTMLButtonElement) {
    toggleInkToolButton.disabled = !inkFeature;
    toggleInkToolButton.textContent =
      activeTool === "eraser" ? "Ink Tool: Eraser" : activeTool === "lasso" ? "Ink Tool: Lasso" : "Ink Tool: Pen";
  }
  syncInkToolDropdownUi(activeTool, enabled);
  syncInkStyleDropdownUi(penColor, penThickness, enabled);
  if (activeTool !== "eraser" && activeTool !== "lasso") {
    hideInkCursorPill();
  }

  if (activePointers > 0) {
    if (activeTool === "eraser") {
      inkStateOutput.textContent = "erasing";
    } else if (activeTool === "lasso") {
      inkStateOutput.textContent = "lassoing";
    } else {
      inkStateOutput.textContent = "writing";
    }
    return;
  }

  if (activeContextId) {
    scheduleWidgetHeavySync({ delayMs: 180 });
    updateReferenceManagerUi();
  }

  inkStateOutput.textContent = inkFeature ? (enabled ? "active" : "paused") : "idle";
}

function normalizeInkTool(tool) {
  return tool === "eraser" || tool === "lasso" ? tool : "pen";
}

function currentInkTool() {
  if (!inkFeature || typeof inkFeature.getTool !== "function") {
    return "pen";
  }
  return normalizeInkTool(inkFeature.getTool());
}

function syncInkToolDropdownUi(activeTool = "pen", enabled = true) {
  if (!(inkToolDropdownToggle instanceof HTMLButtonElement) || !(inkToolDropdownMenu instanceof HTMLElement)) {
    return;
  }
  const nextTool = normalizeInkTool(activeTool);
  const icon = nextTool === "eraser" ? "⌫" : nextTool === "lasso" ? "◌" : "✎";
  const label = nextTool === "eraser" ? "Eraser" : nextTool === "lasso" ? "Lasso" : "Pen";
  inkToolDropdownToggle.textContent = icon;
  inkToolDropdownToggle.title = `Ink tool: ${label}`;
  inkToolDropdownToggle.setAttribute("aria-label", `Ink tool: ${label}`);
  inkToolDropdownToggle.disabled = !inkFeature || !enabled;
  for (const button of inkToolDropdownMenu.querySelectorAll("button[data-ink-tool]")) {
    const target = button instanceof HTMLButtonElement ? button : null;
    if (!target) {
      continue;
    }
    target.dataset.active = normalizeInkTool(target.dataset.inkTool) === nextTool ? "true" : "false";
  }
  if (inkToolDropdownToggle.disabled) {
    setInkToolDropdownOpen(false);
  }
}

function normalizeInkColor(value) {
  if (typeof value !== "string") {
    return "#103f78";
  }
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : "#103f78";
}

function normalizeInkThickness(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.max(1, Math.min(12, numeric));
}

function syncInkStyleDropdownUi(penColor = "#103f78", penThickness = 3, enabled = true) {
  if (!(inkStyleDropdownToggle instanceof HTMLButtonElement) || !(inkStyleDropdownMenu instanceof HTMLElement)) {
    return;
  }
  const color = normalizeInkColor(penColor);
  const thickness = normalizeInkThickness(penThickness);
  inkStyleDropdownToggle.style.color = color;
  inkStyleDropdownToggle.disabled = !inkFeature || !enabled;
  inkStyleDropdownToggle.dataset.open =
    inkStyleDropdownToggle.getAttribute("aria-expanded") === "true" ? "true" : "false";

  for (const button of inkStyleDropdownMenu.querySelectorAll("button[data-ink-color]")) {
    const target = button instanceof HTMLButtonElement ? button : null;
    if (!target) {
      continue;
    }
    const buttonColor = normalizeInkColor(target.dataset.inkColor);
    target.dataset.active = buttonColor === color ? "true" : "false";
  }
  if (inkThicknessRange instanceof HTMLInputElement) {
    inkThicknessRange.value = String(thickness);
    inkThicknessRange.disabled = inkStyleDropdownToggle.disabled;
  }
  if (inkStyleDropdownToggle.disabled) {
    setInkStyleDropdownOpen(false);
  }
}

function isInkToolDropdownOpen() {
  return (
    inkToolDropdownToggle instanceof HTMLButtonElement &&
    inkToolDropdownMenu instanceof HTMLElement &&
    inkToolDropdownToggle.getAttribute("aria-expanded") === "true" &&
    !inkToolDropdownMenu.hidden
  );
}

function setInkToolDropdownOpen(nextOpen) {
  if (!(inkToolDropdownToggle instanceof HTMLButtonElement) || !(inkToolDropdownMenu instanceof HTMLElement)) {
    return false;
  }
  const open = Boolean(nextOpen) && !inkToolDropdownToggle.disabled;
  inkToolDropdownToggle.setAttribute("aria-expanded", open ? "true" : "false");
  inkToolDropdownToggle.dataset.open = open ? "true" : "false";
  inkToolDropdownMenu.hidden = !open;
  return open;
}

function isInkStyleDropdownOpen() {
  return (
    inkStyleDropdownToggle instanceof HTMLButtonElement &&
    inkStyleDropdownMenu instanceof HTMLElement &&
    inkStyleDropdownToggle.getAttribute("aria-expanded") === "true" &&
    !inkStyleDropdownMenu.hidden
  );
}

function setInkStyleDropdownOpen(nextOpen) {
  if (!(inkStyleDropdownToggle instanceof HTMLButtonElement) || !(inkStyleDropdownMenu instanceof HTMLElement)) {
    return false;
  }
  const open = Boolean(nextOpen) && !inkStyleDropdownToggle.disabled;
  inkStyleDropdownToggle.setAttribute("aria-expanded", open ? "true" : "false");
  inkStyleDropdownToggle.dataset.open = open ? "true" : "false";
  inkStyleDropdownMenu.hidden = !open;
  return open;
}

function isWithinInkToolDropdown(target) {
  if (!(target instanceof Node)) {
    return false;
  }
  if (inkToolDropdown instanceof HTMLElement && inkToolDropdown.contains(target)) {
    return true;
  }
  if (inkToolDropdownToggle instanceof HTMLElement && inkToolDropdownToggle.contains(target)) {
    return true;
  }
  if (inkToolDropdownMenu instanceof HTMLElement && inkToolDropdownMenu.contains(target)) {
    return true;
  }
  return false;
}

function isWithinInkStyleDropdown(target) {
  if (!(target instanceof Node)) {
    return false;
  }
  if (inkStyleDropdown instanceof HTMLElement && inkStyleDropdown.contains(target)) {
    return true;
  }
  if (inkStyleDropdownToggle instanceof HTMLElement && inkStyleDropdownToggle.contains(target)) {
    return true;
  }
  if (inkStyleDropdownMenu instanceof HTMLElement && inkStyleDropdownMenu.contains(target)) {
    return true;
  }
  return false;
}

function scheduleInkStyleMenuClose(delayMs = 90) {
  if (inkStyleMenuCloseTimer) {
    window.clearTimeout(inkStyleMenuCloseTimer);
  }
  inkStyleMenuCloseTimer = window.setTimeout(() => {
    inkStyleMenuCloseTimer = null;
    setInkStyleDropdownOpen(false);
  }, delayMs);
}

function cancelInkStyleMenuClose() {
  if (!inkStyleMenuCloseTimer) {
    return;
  }
  window.clearTimeout(inkStyleMenuCloseTimer);
  inkStyleMenuCloseTimer = null;
}

function hideInkCursorPill() {
  if (!(inkCursorPill instanceof HTMLElement)) {
    return;
  }
  inkCursorPill.hidden = true;
}

function syncInkCursorPill(event = null) {
  if (!(inkCursorPill instanceof HTMLElement)) {
    return;
  }
  const tool = normalizeInkTool(inkStateSnapshot.activeTool);
  const enabled = inkStateSnapshot.enabled !== false;
  const shouldShow = enabled && (tool === "eraser" || tool === "lasso");
  if (!shouldShow || !event) {
    inkCursorPill.hidden = true;
    return;
  }
  const pointerType = event.pointerType ?? "mouse";
  if (pointerType === "touch") {
    inkCursorPill.hidden = true;
    return;
  }
  const icon = tool === "eraser" ? "⌫" : "◌";
  inkCursorPill.textContent = icon;
  inkCursorPill.style.left = `${event.clientX + 14}px`;
  inkCursorPill.style.top = `${event.clientY - 14}px`;
  inkCursorPill.hidden = false;
}

async function createNoteWidgetFromLassoSelection(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.strokes) || payload.strokes.length < 1) {
    return null;
  }

  const sourceBounds = payload.bounds && typeof payload.bounds === "object" ? payload.bounds : null;
  const bounds =
    sourceBounds &&
    Number.isFinite(sourceBounds.x) &&
    Number.isFinite(sourceBounds.y) &&
    Number.isFinite(sourceBounds.width) &&
    Number.isFinite(sourceBounds.height)
      ? {
          x: sourceBounds.x,
          y: sourceBounds.y,
          width: Math.max(1, sourceBounds.width),
          height: Math.max(1, sourceBounds.height),
        }
      : null;

  const anchor = bounds
    ? {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      }
    : viewportCenterAnchor();

  const widget = await createExpandedAreaWidget(
    {
      metadata: {
        title: "Notes",
      },
      size: bounds
        ? {
            width: Math.max(LASSO_NOTE_MIN_WIDTH_WORLD, bounds.width + LASSO_NOTE_PADDING_WORLD),
            height: Math.max(LASSO_NOTE_MIN_HEIGHT_WORLD, bounds.height + LASSO_NOTE_PADDING_WORLD),
          }
        : undefined,
    },
    createCreationIntent({
      type: "expanded-area",
      anchor,
      sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
      createdFrom: "lasso-selection",
    }),
  );
  if (!widget) {
    return null;
  }

  const committed = restoreWidgetInkSnapshot(payload.strokes, widget.id);
  runtime.bringWidgetToFront(widget.id);
  runtime.setFocusedWidgetId(widget.id);
  runtime.setSelectedWidgetId(widget.id);
  updateWidgetUi({ coalesceHeavy: true });
  if (committed > 0) {
    flushWorkspacePersist();
  }
  return widget;
}

function syncSearchIndexUi(indexedCount = null) {
  if (!searchIndexCountOutput) {
    return;
  }

  const count =
    Number.isFinite(indexedCount) && indexedCount >= 0
      ? indexedCount
      : searchIndex
        ? searchIndex.getEntryCount(workspaceScopeId())
        : 0;
  searchIndexCountOutput.textContent = String(count);

  if (searchPanelController && typeof searchPanelController.refreshIndex === "function") {
    searchPanelController.refreshIndex(count);
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

  if (snipModeNotifier instanceof HTMLElement) {
    snipModeNotifier.hidden = !armed;
  }
  if (snipModeLabel instanceof HTMLElement) {
    snipModeLabel.textContent = dragging ? "Snip mode: capturing..." : "Snip mode: drag to capture area";
  }
}

function syncToolsUi() {
  if (controlsPanel instanceof HTMLElement) {
    controlsPanel.hidden = !toolsPanelOpen;
    controlsPanel.dataset.open = toolsPanelOpen ? "true" : "false";
    controlsPanel.setAttribute("aria-label", "Menu");
    if (toolsPanelOpen && toggleToolsButton instanceof HTMLButtonElement) {
      const trigger = toggleToolsButton.getBoundingClientRect();
      const panelWidth = Math.min(430, window.innerWidth - 12);
      const left = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, trigger.right - panelWidth));
      const top = Math.max(8, trigger.bottom + 8);
      controlsPanel.style.left = `${left}px`;
      controlsPanel.style.top = `${top}px`;
      controlsPanel.style.right = "auto";
    }
  }

  if (toggleToolsButton instanceof HTMLButtonElement) {
    toggleToolsButton.setAttribute("aria-label", toolsPanelOpen ? "Close menu" : "Open menu");
    toggleToolsButton.title = toolsPanelOpen ? "Close menu" : "Open menu";
    toggleToolsButton.dataset.open = toolsPanelOpen ? "true" : "false";
  }
}

function onboardingHintsCatalog() {
  const widgets = runtime.listWidgets();
  const hasPdf = widgets.some((widget) => widget.type === "pdf-document");
  const hasCreatedWidget = widgets.some((widget) => widget.type !== "pdf-document");

  return [
    {
      id: "import-pdf",
      title: "Start With A PDF",
      body: "Import your source document into this section to start writing immediately.",
      actionLabel: "Import PDF",
      shouldShow: () => !hasPdf,
      completeWhen: () => hasPdf,
      onAction: () => {
        void executeCreationIntent(
          createCreationIntent({
            type: "pdf-document",
            anchor: viewportCenterAnchor(),
            sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
            createdFrom: "manual",
          }),
        );
      },
    },
    {
      id: "radial-create",
      title: "Use Hold Radial Create",
      body: "Touch-and-hold with your finger on the canvas, then drag to a radial option and release to create.",
      actionLabel: "Got It",
      shouldShow: () => hasPdf && !hasCreatedWidget,
      completeWhen: () => hasCreatedWidget,
      onAction: () => {
        onboardingRuntimeSignals.gestureUsed = true;
      },
    },
    {
      id: "peek-search-gesture",
      title: "Use Fast Navigation",
      body: "Use Search with Ctrl/Cmd+F and keep navigating with touch gestures. Gesture bindings are enabled by default.",
      actionLabel: "Open Search",
      shouldShow: () => widgets.length > 1,
      completeWhen: () =>
        onboardingRuntimeSignals.searchOpened ||
        onboardingRuntimeSignals.peekActivated ||
        onboardingRuntimeSignals.gestureUsed,
      onAction: async () => {
        const panel = await ensureSearchFeatures();
        panel.open();
        onboardingRuntimeSignals.searchOpened = true;
      },
    },
  ];
}

async function ensureOnboardingOverlay() {
  if (onboardingOverlay) {
    return onboardingOverlay;
  }

  const module = await import("./features/onboarding/hint-overlay.js");
  loadedModules.add("onboarding-hints");
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }

  onboardingOverlay = module.createHintOverlay({
    rootElement: onboardingHintRoot,
    titleElement: onboardingHintTitle,
    bodyElement: onboardingHintBody,
    progressElement: onboardingHintProgress,
    actionButton: onboardingHintActionButton,
    dismissButton: onboardingHintDismissButton,
    toggleHintsButton: onboardingHintToggleButton,
    resetButton: onboardingHintResetButton,
    onAction: (hintId) => {
      void handleOnboardingAction(hintId);
    },
    onDismiss: (hintId) => {
      dismissOnboardingHint(hintId);
    },
    onToggleHints: () => {
      toggleOnboardingHints();
    },
    onReset: () => {
      resetOnboardingHints();
    },
  });

  return onboardingOverlay;
}

async function refreshOnboardingHints() {
  const scopeId = onboardingScopeId();
  if (!scopeId) {
    return;
  }

  const overlay = await ensureOnboardingOverlay();
  if (!overlay) {
    return;
  }

  const hintsEnabled = onboardingStateService.isHintsEnabled(scopeId);
  overlay.setHintsEnabled(hintsEnabled);

  if (!isProductionUi() || !hintsEnabled) {
    overlay.hide();
    onboardingHintVisibleId = null;
    return;
  }

  const hints = onboardingHintsCatalog();
  for (let index = 0; index < hints.length; index += 1) {
    const hint = hints[index];
    const state = onboardingStateService.getHintState(scopeId, hint.id);
    if (state?.completionState === "dismissed") {
      continue;
    }

    if (hint.completeWhen()) {
      if (state?.completionState !== "completed") {
        onboardingStateService.markCompleted(scopeId, hint.id);
      }
      continue;
    }

    if (!hint.shouldShow()) {
      continue;
    }

    onboardingHintVisibleId = hint.id;
    overlay.show({
      hintId: hint.id,
      title: hint.title,
      body: hint.body,
      actionLabel: hint.actionLabel,
      progressText: `Hint ${index + 1} of ${hints.length}`,
      hintsEnabled,
    });
    return;
  }

  onboardingHintVisibleId = null;
  overlay.hide();
}

function scheduleOnboardingRefresh(delayMs = 50) {
  if (onboardingRefreshTimer) {
    window.clearTimeout(onboardingRefreshTimer);
  }

  onboardingRefreshTimer = window.setTimeout(() => {
    onboardingRefreshTimer = null;
    void refreshOnboardingHints();
  }, delayMs);
}

async function handleOnboardingAction(hintId) {
  if (!onboardingScopeId()) {
    return;
  }

  const hint = onboardingHintsCatalog().find((entry) => entry.id === hintId);
  if (!hint || typeof hint.onAction !== "function") {
    return;
  }

  try {
    await hint.onAction();
  } catch (error) {
    console.error(error);
  }

  scheduleOnboardingRefresh(30);
}

function dismissOnboardingHint(hintId) {
  const scopeId = onboardingScopeId();
  if (!scopeId || !hintId) {
    return;
  }
  onboardingStateService.markDismissed(scopeId, hintId);
  scheduleOnboardingRefresh(0);
}

function toggleOnboardingHints() {
  const scopeId = onboardingScopeId();
  if (!scopeId) {
    return;
  }
  const current = onboardingStateService.isHintsEnabled(scopeId);
  onboardingStateService.setHintsEnabled(scopeId, !current);
  scheduleOnboardingRefresh(0);
}

function resetOnboardingHints() {
  const scopeId = onboardingScopeId();
  if (!scopeId) {
    return;
  }
  onboardingStateService.resetContext(scopeId);
  onboardingRuntimeSignals.searchOpened = false;
  onboardingRuntimeSignals.peekActivated = false;
  onboardingRuntimeSignals.gestureUsed = false;
  scheduleOnboardingRefresh(0);
}

function updateOnboardingControlsUi() {
  const scopeId = onboardingScopeId();
  if (!scopeId) {
    return;
  }

  const hintsEnabled = onboardingStateService.isHintsEnabled(scopeId);
  if (toggleOnboardingHintsButton instanceof HTMLButtonElement) {
    toggleOnboardingHintsButton.textContent = hintsEnabled ? "Disable Hints" : "Enable Hints";
  }
  if (onboardingOverlay) {
    onboardingOverlay.setHintsEnabled(hintsEnabled);
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

function syncLinkedNotebookDocumentInstances({ sourceDocumentId = null } = {}) {
  if (!activeContextId) {
    return false;
  }

  const notebookSources = notebookDocumentLibraryStore.listDocuments(activeContextId, { includeDeleted: true });
  const sourceById = new Map(notebookSources.map((entry) => [entry.id, entry]));
  const documents = documentManager.listDocuments();
  let changed = false;

  for (const entry of documents) {
    const linkedSourceId = entry.sourceDocumentId;
    if (!linkedSourceId) {
      continue;
    }
    if (sourceDocumentId && linkedSourceId !== sourceDocumentId) {
      continue;
    }

    const source = sourceById.get(linkedSourceId);
    const sourceIsActive = Boolean(source && source.status !== "deleted");
    const shouldRemainLinked = entry.linkStatus === "linked" && sourceIsActive;

    if (shouldRemainLinked) {
      const nextTitle = source.title;
      const nextSourceType = source.sourceType;
      const nextSnapshot = {
        title: source.title,
        sourceType: source.sourceType,
      };
      const previousSnapshot = entry.sourceSnapshot ?? null;
      const stateChanged =
        (entry.sourceDocumentId ?? null) !== source.id ||
        entry.linkStatus !== "linked" ||
        entry.title !== nextTitle ||
        entry.sourceType !== nextSourceType ||
        (previousSnapshot?.title ?? null) !== (nextSnapshot.title ?? null) ||
        (previousSnapshot?.sourceType ?? null) !== (nextSnapshot.sourceType ?? null);
      if (stateChanged) {
        documentManager.setDocumentSourceState(entry.id, {
          sourceDocumentId: source.id,
          linkStatus: "linked",
          sourceSnapshot: nextSnapshot,
          title: nextTitle,
          sourceType: nextSourceType,
        });
      }

      const widget = runtime.getWidgetById(entry.widgetId);
      if (widget?.type === "pdf-document") {
        const widgetTitle = typeof widget.metadata?.title === "string" ? widget.metadata.title : "";
        const widgetSourceDocumentId =
          typeof widget.metadata?.sourceDocumentId === "string" ? widget.metadata.sourceDocumentId : null;
        const widgetChanged = widgetTitle !== nextTitle || widgetSourceDocumentId !== source.id;
        if (widgetChanged) {
          widget.metadata = {
            ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
            title: nextTitle,
            sourceDocumentId: source.id,
          };
        }
        changed = changed || stateChanged || widgetChanged;
      } else {
        changed = changed || stateChanged;
      }
      continue;
    }

    if (entry.linkStatus === "linked" && !sourceIsActive) {
      const frozenSnapshot = {
        title: source?.title ?? entry.sourceSnapshot?.title ?? entry.title,
        sourceType: source?.sourceType ?? entry.sourceSnapshot?.sourceType ?? entry.sourceType,
      };
      const previousSnapshot = entry.sourceSnapshot ?? null;
      const stateChanged =
        (entry.sourceDocumentId ?? null) !== null ||
        entry.linkStatus !== "frozen" ||
        entry.title !== frozenSnapshot.title ||
        entry.sourceType !== frozenSnapshot.sourceType ||
        (previousSnapshot?.title ?? null) !== (frozenSnapshot.title ?? null) ||
        (previousSnapshot?.sourceType ?? null) !== (frozenSnapshot.sourceType ?? null);
      if (stateChanged) {
        documentManager.setDocumentSourceState(entry.id, {
          sourceDocumentId: null,
          linkStatus: "frozen",
          sourceSnapshot: frozenSnapshot,
          title: frozenSnapshot.title,
          sourceType: frozenSnapshot.sourceType,
        });
      }

      const widget = runtime.getWidgetById(entry.widgetId);
      if (widget?.type === "pdf-document") {
        const widgetTitle = typeof widget.metadata?.title === "string" ? widget.metadata.title : "";
        const widgetSourceDocumentId =
          typeof widget.metadata?.sourceDocumentId === "string" ? widget.metadata.sourceDocumentId : null;
        const widgetChanged = widgetTitle !== frozenSnapshot.title || widgetSourceDocumentId !== null;
        if (widgetChanged) {
          widget.metadata = {
            ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
            title: frozenSnapshot.title,
            sourceDocumentId: null,
          };
        }
        changed = changed || stateChanged || widgetChanged;
      } else {
        changed = changed || stateChanged;
      }
    }
  }

  return changed;
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

function syncReferencePopupMetadata() {
  for (const widget of runtime.listWidgets()) {
    if (!widget || widget.type !== "reference-popup") {
      continue;
    }

    const currentMetadata = widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {};
    const currentPopupMetadata =
      currentMetadata.popupMetadata && typeof currentMetadata.popupMetadata === "object"
        ? currentMetadata.popupMetadata
        : null;

    if (
      currentPopupMetadata &&
      typeof currentPopupMetadata.id === "string" &&
      currentPopupMetadata.id.trim() &&
      typeof currentPopupMetadata.type === "string" &&
      currentPopupMetadata.type.trim() &&
      Array.isArray(currentPopupMetadata.tags)
    ) {
      continue;
    }

    widget.metadata = buildPopupMetadata({
      metadata: currentMetadata,
      fallbackTitle: currentMetadata.title ?? "Reference",
      useActiveDocumentFallback: false,
    });
  }
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

function captureWidgetInkSnapshot(widgetId) {
  if (!inkFeature || typeof inkFeature.cloneStrokesForWidget !== "function" || !widgetId) {
    return [];
  }
  return inkFeature.cloneStrokesForWidget({
    contextId: workspaceScopeId(),
    sourceWidgetId: widgetId,
    targetWidgetId: widgetId,
  });
}

function restoreWidgetInkSnapshot(strokes, widgetId) {
  if (
    !inkFeature ||
    typeof inkFeature.commitImportedStrokes !== "function" ||
    !Array.isArray(strokes) ||
    strokes.length < 1 ||
    !widgetId
  ) {
    return 0;
  }
  const contextId = workspaceScopeId();
  const remapped = strokes.map((stroke) => ({
    ...stroke,
    id: makeId("stroke"),
    contextId,
    sourceWidgetId: widgetId,
    points: Array.isArray(stroke.points) ? stroke.points.map((point) => ({ ...point })) : [],
  }));
  return inkFeature.commitImportedStrokes(remapped);
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
  if (!widget || (widget.type !== "expanded-area" && widget.type !== "diagram") || !activeContextId) {
    return false;
  }

  const entry =
    widget.type === "diagram"
      ? diagramLibraryEntryFromWidget(widget)
      : noteLibraryEntryFromWidget(widget);
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

async function copyWidgetFromContextMenu(widget) {
  if (!widget) {
    return false;
  }

  const baseAnchor = anchorBesideWidget(widget);

  if (widget.type === "expanded-area") {
    await createExpandedAreaWidget(
      {
        metadata: {
          title: widget.metadata?.title ?? "Notes",
          note: widget.metadata?.note ?? "",
        },
      },
      createCreationIntent({
        type: "expanded-area",
        anchor: baseAnchor,
        sourceWidgetId: widget.id,
        createdFrom: "manual",
      }),
    );
    return true;
  }

  if (widget.type === "diagram") {
    await createDiagramWidget(
      {
        metadata: {
          title: widget.metadata?.title ?? "Diagram",
          libraryNoteId: widget.metadata?.libraryNoteId ?? null,
        },
        dataPayload: {
          diagramDoc:
            typeof widget.getDiagramDoc === "function"
              ? widget.getDiagramDoc()
              : cloneJsonValue(widget.diagramDoc, null),
        },
      },
      createCreationIntent({
        type: "diagram",
        anchor: baseAnchor,
        sourceWidgetId: widget.id,
        createdFrom: "manual",
      }),
    );
    return true;
  }

  if (widget.type === "reference-popup") {
    await createReferencePopupWidget({
      definition: {
        metadata: {
          title: widget.metadata?.title ?? "Reference",
          librarySourceId: widget.metadata?.librarySourceId ?? null,
          popupMetadata: {
            ...(widget.metadata?.popupMetadata ?? {}),
            title: widget.metadata?.title ?? "Reference",
          },
        },
        dataPayload: {
          imageDataUrl: widget.imageDataUrl ?? null,
          textContent: widget.textContent ?? "",
          sourceLabel: widget.sourceLabel ?? "Reference",
          contentType: widget.contentType ?? "text",
          citation: widget.citation ?? null,
          researchCaptureId: widget.researchCaptureId ?? null,
        },
      },
      intent: createCreationIntent({
        type: "reference-popup",
        anchor: baseAnchor,
        sourceWidgetId: widget.id,
        createdFrom: "manual",
      }),
    });
    return true;
  }

  if (widget.type === "pdf-document") {
    const rasterDocument = widget.rasterDocument && typeof widget.rasterDocument === "object" ? widget.rasterDocument : null;
    if (!rasterDocument && !(widget.pdfBytes instanceof Uint8Array)) {
      return false;
    }
    const sourceDocumentId =
      typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
        ? widget.metadata.sourceDocumentId
        : null;
    const sourceDocument = sourceDocumentId && activeContextId
      ? notebookDocumentLibraryStore.getDocument(activeContextId, sourceDocumentId)
      : null;

    if (sourceDocument && sourceDocument.status !== "deleted") {
      await createPdfWidgetFromLibraryEntry(sourceDocument, {
        linkStatus: "linked",
        intent: createCreationIntent({
          type: "pdf-document",
          anchor: baseAnchor,
          sourceWidgetId: widget.id,
          createdFrom: "manual",
        }),
      });
      return true;
    }

    await createPdfWidgetFromBytes({
      bytes: rasterDocument ? null : widget.pdfBytes,
      rasterDocument,
      fileName: widget.fileName ?? "document.pdf",
      definition: {
        metadata: {
          title: widget.metadata?.title ?? "Document",
        },
      },
      intent: createCreationIntent({
        type: "pdf-document",
        anchor: baseAnchor,
        sourceWidgetId: widget.id,
        createdFrom: "manual",
      }),
      sourceDocument: null,
      linkStatus: "frozen",
    });
    return true;
  }

  return false;
}

async function renameWidgetFromContextMenu(widget) {
  if (!widget) {
    return false;
  }

  const currentTitle =
    typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
      ? widget.metadata.title.trim()
      : widget.type === "expanded-area"
        ? "Notes"
        : widget.type === "diagram"
          ? "Diagram"
        : widget.type === "reference-popup"
          ? "Reference"
          : "Document";
  const nextTitle = await showTextPromptDialog({
    title: "Rename Widget",
    label: "Widget name",
    defaultValue: currentTitle,
    confirmLabel: "Rename",
  });
  if (!nextTitle) {
    return false;
  }

  const normalizedTitle = nextTitle.trim();
  if (widget.type === "reference-popup") {
    const sourceId =
      typeof widget.metadata?.librarySourceId === "string" && widget.metadata.librarySourceId.trim()
        ? widget.metadata.librarySourceId
        : null;
    if (activeContextId && sourceId) {
      notebookLibraryStore.renameReference(activeContextId, sourceId, normalizedTitle);
    }

    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      title: normalizedTitle,
      popupMetadata: {
        ...(widget.metadata?.popupMetadata ?? {}),
        title: normalizedTitle,
      },
    };
    updateWidgetUi();
    return true;
  }

  if (widget.type === "expanded-area" || widget.type === "diagram") {
    const sourceId =
      typeof widget.metadata?.libraryNoteId === "string" && widget.metadata.libraryNoteId.trim()
        ? widget.metadata.libraryNoteId
        : null;
    if (activeContextId && sourceId) {
      notebookLibraryStore.renameNote(activeContextId, sourceId, normalizedTitle);
    }
    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      title: normalizedTitle,
    };
    updateWidgetUi();
    return true;
  }

  if (widget.type === "pdf-document") {
    const sourceId =
      typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
        ? widget.metadata.sourceDocumentId
        : null;
    if (activeContextId && sourceId) {
      notebookDocumentLibraryStore.renameDocument(activeContextId, sourceId, normalizedTitle);
      syncLinkedNotebookDocumentInstances({ sourceDocumentId: sourceId });
      updateWidgetUi();
      return true;
    }

    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      title: normalizedTitle,
    };
    const doc = documentManager.getDocumentByWidgetId(widget.id);
    if (doc) {
      documentManager.setDocumentSourceState(doc.id, { title: normalizedTitle });
    }
    updateWidgetUi();
    return true;
  }

  return false;
}

function formatWidgetInfo(widget) {
  if (!widget) {
    return "No widget selected.";
  }

  const title =
    typeof widget.metadata?.title === "string" && widget.metadata.title.trim()
      ? widget.metadata.title.trim()
      : "Untitled";
  const kind =
    widget.type === "pdf-document"
      ? "Document"
      : widget.type === "diagram"
        ? "Diagram"
      : widget.type === "reference-popup"
        ? "Reference"
        : "Notes";
  const size = `${Math.round(widget.size.width)} x ${Math.round(widget.size.height)}`;

  const details = [`${kind}`, `Title: ${title}`, `Size: ${size}`];
  details.push(`Pinned: ${widget.metadata?.pinned ? "Yes" : "No"}`);

  if (widget.type === "reference-popup") {
    const source = typeof widget.sourceLabel === "string" && widget.sourceLabel.trim() ? widget.sourceLabel.trim() : "Unknown";
    details.push(`Source: ${source}`);
  }

  if (widget.type === "pdf-document") {
    const pageCount = Number.isFinite(widget.pageCount) ? widget.pageCount : 0;
    if (pageCount > 0) {
      details.push(`Pages: ${pageCount}`);
    }
  }

  return details.join("\n");
}

function toggleWidgetPinFromContextMenu(widget) {
  if (!widget) {
    return false;
  }
  if (isWidgetViewportDocked(widget)) {
    return false;
  }

  widget.metadata = {
    ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
    pinned: !Boolean(widget.metadata?.pinned),
  };
  updateWidgetUi();
  return true;
}

function resolveCanvasViewportRect() {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width < 1 || rect.height < 1) {
    return null;
  }
  return rect;
}

function syncViewportDockGlowLayout() {
  viewportDockOverlayController?.syncLayout();
}

function normalizeViewportDockMetadata(candidate) {
  return viewportDockOverlayController?.normalizeDockMetadata(candidate) ?? null;
}

function isWidgetViewportDocked(widget) {
  return Boolean(viewportDockOverlayController?.isWidgetDocked(widget));
}

function applyViewportDockToWidget(widget, { camera = runtime.camera, viewportRect = resolveCanvasViewportRect() } = {}) {
  return viewportDockOverlayController?.applyToWidget(widget, { camera, viewportRect }) ?? false;
}

function applyViewportDockToAllWidgets() {
  return viewportDockOverlayController?.applyToAllWidgets() ?? false;
}

function handleWidgetDragStateForViewportDock(payload) {
  viewportDockOverlayController?.onWidgetDragState(payload);
}

function setLibraryDropTargetState({ active = false, over = false } = {}) {
  if (referenceManagerUiController && typeof referenceManagerUiController.setDropTargetState === "function") {
    referenceManagerUiController.setDropTargetState({ active, over });
    return;
  }
  if (!(referenceManagerLauncher instanceof HTMLElement)) {
    return;
  }
  referenceManagerLauncher.dataset.dropActive = active ? "true" : "false";
  referenceManagerLauncher.dataset.dropOver = active && over ? "true" : "false";
}

function syncWidgetTrashDropTargetLayout() {
  libraryOverlayController?.syncLayout();
}

function showLibraryDropFeedback({ kind = "deny", message = "" } = {}) {
  if (referenceManagerUiController && typeof referenceManagerUiController.showDropFeedback === "function") {
    referenceManagerUiController.showDropFeedback({ kind, message });
    return;
  }

  if (!(referenceManagerLauncher instanceof HTMLElement)) {
    return;
  }
  referenceManagerLauncher.dataset.dropFeedback = kind === "success" ? "success" : "deny";
  window.setTimeout(() => {
    if (referenceManagerLauncher.dataset.dropFeedback === (kind === "success" ? "success" : "deny")) {
      referenceManagerLauncher.dataset.dropFeedback = "none";
    }
  }, 420);
}

function pointerOverLibraryLauncher(clientX, clientY) {
  if (!(referenceManagerLauncher instanceof HTMLElement)) {
    return false;
  }
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return false;
  }
  const rect = referenceManagerLauncher.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function animateWidgetBackToOrigin(widget, originPosition, { durationMs = 220 } = {}) {
  if (
    !widget ||
    !originPosition ||
    !Number.isFinite(originPosition.x) ||
    !Number.isFinite(originPosition.y)
  ) {
    return Promise.resolve(false);
  }

  const targetWidgetId = typeof widget.id === "string" ? widget.id : null;
  const fromX = Number(widget.position?.x);
  const fromY = Number(widget.position?.y);
  const toX = originPosition.x;
  const toY = originPosition.y;
  if (!Number.isFinite(fromX) || !Number.isFinite(fromY)) {
    return Promise.resolve(false);
  }

  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.hypot(dx, dy) < 0.01) {
    widget.position.x = toX;
    widget.position.y = toY;
    runtime.requestRender({ continuousMs: 80 });
    return Promise.resolve(false);
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const total = Math.max(80, Number(durationMs) || 220);
  let startAt = 0;

  return new Promise((resolve) => {
    const frame = (timestamp) => {
      if (!startAt) {
        startAt = timestamp;
      }
      const elapsed = timestamp - startAt;
      const t = Math.max(0, Math.min(1, elapsed / total));
      const eased = easeOutCubic(t);

      const liveWidget = targetWidgetId ? runtime.getWidgetById(targetWidgetId) : widget;
      if (!liveWidget) {
        resolve(false);
        return;
      }

      liveWidget.position.x = fromX + dx * eased;
      liveWidget.position.y = fromY + dy * eased;
      runtime.requestRender({ continuousMs: 80 });

      if (t < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      liveWidget.position.x = toX;
      liveWidget.position.y = toY;
      runtime.requestRender({ continuousMs: 120 });
      resolve(true);
    };

    window.requestAnimationFrame(frame);
  });
}

function savePdfWidgetToNotebookLibrary(widget, { forcedSourceId = null } = {}) {
  if (!activeContextId || !widget || widget.type !== "pdf-document") {
    return null;
  }
  const rasterDocument = widget.rasterDocument && typeof widget.rasterDocument === "object" ? widget.rasterDocument : null;
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

    const candidate =
      widget.type === "diagram"
        ? diagramLibraryEntryFromWidget(widget)
        : noteLibraryEntryFromWidget(widget);
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
    const rasterDocument = widget.rasterDocument && typeof widget.rasterDocument === "object" ? widget.rasterDocument : null;
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
    updateWidgetUi();
    return { ok: true };
  }

  if (widget.type === "expanded-area" || widget.type === "diagram") {
    const saved = await saveNoteWidgetToNotebookLibrary(widget);
    if (!saved) {
      return { ok: false, reason: "failed" };
    }
    updateWidgetUi();
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
  updateWidgetUi();
  return { ok: true };
}

function handleWidgetDragStateForLibrary(payload) {
  handleWidgetDragStateForViewportDock(payload);
  libraryOverlayController?.onWidgetDragState(payload);
}

async function toggleWidgetLibraryFromContextMenu(widget) {
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
        updateWidgetUi();
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
        syncLinkedNotebookDocumentInstances({ sourceDocumentId: sourceId });
        updateWidgetUi();
      }
      return removed;
    }

    const source = savePdfWidgetToNotebookLibrary(widget);
    if (!source) {
      return false;
    }
    updateWidgetUi();
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
        updateWidgetUi();
      }
      return removed;
    }

    const saved = await saveNoteWidgetToNotebookLibrary(widget);
    if (saved) {
      updateWidgetUi();
    }
    return saved;
  }

  return false;
}

function syncLinkedLibraryMetadata() {
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
  const linkedDocsChanged = syncLinkedNotebookDocumentInstances({ sourceDocumentId });
  const linkedLibraryChanged = syncLinkedLibraryMetadata();
  if (linkedDocsChanged || linkedLibraryChanged) {
    updateWidgetUi();
    scheduleSuggestionAnalysis({ immediate: true });
  }
}

function syncWidgetsToLibrarySnapshots() {
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
      const entry =
        widget.type === "diagram"
          ? diagramLibraryEntryFromWidget(widget)
          : noteLibraryEntryFromWidget(widget);
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

function applyPopupAutoDocking() {
  const popups = runtime.listWidgets().filter((widget) => widget?.type === "reference-popup");
  if (popups.length <= 3) {
    return;
  }

  const viewportTopLeft = runtime.camera.screenToWorld(0, 0);
  const viewportBottomRight = runtime.camera.screenToWorld(canvas.clientWidth, canvas.clientHeight);
  const minX = Math.min(viewportTopLeft.x, viewportBottomRight.x);
  const maxX = Math.max(viewportTopLeft.x, viewportBottomRight.x);
  const minY = Math.min(viewportTopLeft.y, viewportBottomRight.y);

  const dockX = maxX - 220;
  const dockY = minY + 24;
  const dockSpacing = 54;

  const overflow = popups.slice(3);
  for (let index = 0; index < overflow.length; index += 1) {
    const popup = overflow[index];
    const targetX = Math.max(minX + 24, dockX);
    const targetY = dockY + index * dockSpacing;

    if (typeof popup.setMinimized === "function") {
      popup.setMinimized(true);
    } else {
      popup.metadata = {
        ...(popup.metadata && typeof popup.metadata === "object" ? popup.metadata : {}),
        minimized: true,
      };
    }

    popup.position.x = targetX;
    popup.position.y = targetY;
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
    flushWorkspacePersist();
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
    flushWorkspacePersist();
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
  if (!activeContextId || !entry) {
    return false;
  }

  const nextTitle = await showTextPromptDialog({
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

  updateWidgetUi();
  return true;
}

async function renameNotebookNoteFromManager(entry) {
  if (!activeContextId || !entry) {
    return false;
  }

  const nextTitle = await showTextPromptDialog({
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

  updateWidgetUi();
  return true;
}

async function deleteNotebookReferenceFromManager(entry) {
  if (!activeContextId || !entry) {
    return false;
  }

  const confirmed = await showConfirmDialog({
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

  updateWidgetUi();
  return true;
}

async function deleteNotebookNoteFromManager(entry) {
  if (!activeContextId || !entry) {
    return false;
  }

  const confirmed = await showConfirmDialog({
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

  updateWidgetUi();
  return true;
}

async function renameNotebookDocumentFromManager(entry) {
  if (!activeContextId || !entry) {
    return false;
  }

  const nextTitle = await showTextPromptDialog({
    title: "Rename Notebook Document",
    label: "Document name",
    defaultValue: entry.title,
    confirmLabel: "Rename",
  });
  if (!nextTitle) {
    return false;
  }

  const renamed = notebookDocumentLibraryStore.renameDocument(activeContextId, entry.id, nextTitle);
  if (!renamed) {
    return false;
  }

  syncLinkedNotebookDocumentInstances({ sourceDocumentId: entry.id });
  updateWidgetUi();
  return true;
}

async function deleteNotebookDocumentFromManager(entry) {
  if (!activeContextId || !entry) {
    return false;
  }

  const confirmed = await showConfirmDialog({
    title: "Delete Notebook Document",
    message: `Delete notebook document "${entry.title}" from library?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!confirmed) {
    return false;
  }

  const deleted = notebookDocumentLibraryStore.deleteDocument(activeContextId, entry.id);
  if (!deleted) {
    return false;
  }

  syncLinkedNotebookDocumentInstances({ sourceDocumentId: entry.id });
  updateWidgetUi();
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
  await showNoticeDialog(lines.join("\n"), { title: "Library Info" });
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
  await showNoticeDialog(lines.join("\n"), { title: "Library Info" });
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
  await showNoticeDialog(lines.join("\n"), { title: "Library Info" });
}

async function createReferencePopupFromNotebookLibrary(intent) {
  if (!activeContextId) {
    return false;
  }

  const references = notebookLibraryStore.listReferences(activeContextId);
  if (references.length < 1) {
    await showNoticeDialog("Notebook library is empty. Save a reference first.", {
      title: "Notebook Library",
    });
    return false;
  }

  if (referenceManagerUiController) {
    referenceManagerUiController.open({ tab: "references" });
    return true;
  }

  const selected = await showSelectDialog({
    title: "Import Notebook Reference",
    message: "Choose a reference to place on the canvas.",
    label: "Notebook reference",
    confirmLabel: "Import",
    options: references.map((entry) => ({
      id: entry.id,
      label: entry.title,
    })),
  });
  if (!selected) {
    return false;
  }

  const source = references.find((entry) => entry.id === selected.id);
  if (!source) {
    return false;
  }
  await createReferencePopupFromLibraryEntry(source, {
    linkStatus: "linked",
    intent: normalizeCreationIntent(intent),
  });
  return true;
}

function widgetDisplayLabel(widget) {
  if (widget.type === "reference-popup") {
    const source = typeof widget.sourceLabel === "string" && widget.sourceLabel.trim() ? widget.sourceLabel : "Reference";
    return source;
  }

  if (widget.type === "expanded-area") {
    return widget.metadata?.title ?? "Notes";
  }
  if (widget.type === "diagram") {
    return widget.metadata?.title ?? "Diagram";
  }

  return widget.metadata?.title ?? "Document";
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
    const formulas = widgets.filter((widget) => widget.type === "expanded-area");
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
      .filter((widget) => widget.type === "expanded-area")
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

function focusedPdfWidgetForSuggestions() {
  const focusedId = runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId();
  if (!focusedId) {
    return null;
  }

  const widget = runtime.getWidgetById(focusedId);
  if (!widget || widget.type !== "pdf-document") {
    return null;
  }

  return widget;
}

function updateContextUi() {
  if (contextStore && contextUiController) {
    const contexts = contextStore.list();
    contextUiController.render(contexts, activeContextId);
  }

  if (sectionsStore && sectionUiController && activeContextId) {
    const sections = sectionsStore.listSections(activeContextId);
    sectionUiController.render(sections, activeSectionId);
  } else if (activeSectionOutput instanceof HTMLElement) {
    activeSectionOutput.textContent = "none";
  }
}

function renderSuggestionRailNow() {
  const scope = currentSuggestionScope();
  if (!scope || !suggestionUiController) {
    suggestionUiController?.render({ focusedPdfWidgetId: null, proposed: [], ghosted: [] });
    return;
  }

  const focusedPdf = focusedPdfWidgetForSuggestions();
  if (!focusedPdf) {
    suggestionUiController.render({ focusedPdfWidgetId: null, proposed: [], ghosted: [] });
    return;
  }

  const proposed = suggestionStore.list({
    scopeId: scope.scopeId,
    sectionId: scope.sectionId,
    states: ["proposed", "restored"],
  }).filter((entry) => entry.kind === "reference-popup" && entry.payload?.sourceWidgetId === focusedPdf.id);
  const ghosted = suggestionStore.list({
    scopeId: scope.scopeId,
    sectionId: scope.sectionId,
    states: ["ghosted"],
  }).filter((entry) => entry.kind === "reference-popup" && entry.payload?.sourceWidgetId === focusedPdf.id);

  suggestionUiController.render({
    focusedPdfWidgetId: focusedPdf.id,
    proposed,
    ghosted,
  });
}

function renderSuggestionRail({ immediate = false } = {}) {
  if (immediate || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    if (suggestionRailRenderFrame !== null) {
      window.cancelAnimationFrame(suggestionRailRenderFrame);
      suggestionRailRenderFrame = null;
      suggestionRailRenderQueued = false;
    }
    renderSuggestionRailNow();
    return;
  }

  if (suggestionRailRenderFrame !== null) {
    suggestionRailRenderQueued = true;
    return;
  }

  suggestionRailRenderFrame = window.requestAnimationFrame(() => {
    suggestionRailRenderFrame = null;
    renderSuggestionRailNow();
    if (suggestionRailRenderQueued) {
      suggestionRailRenderQueued = false;
      renderSuggestionRail();
    }
  });
}

function updateReferenceManagerUi() {
  if (!referenceManagerUiController || !activeContextId) {
    return;
  }

  referenceManagerUiController.render({
    references: notebookLibraryStore.listReferences(activeContextId),
    notes: notebookLibraryStore.listNotes(activeContextId),
    documents: notebookDocumentLibraryStore.listDocuments(activeContextId),
  });
}

function syncReferenceManagerPlacement() {
  if (!referenceManagerUiController || typeof referenceManagerUiController.syncPlacement !== "function") {
    return;
  }
  referenceManagerUiController.syncPlacement();
}

async function runSuggestionAnalysis() {
  const scope = currentSuggestionScope();
  if (!scope || restoringContext) {
    return;
  }

  if (suggestionAnalysisInFlight) {
    suggestionAnalysisQueued = true;
    return;
  }

  suggestionAnalysisInFlight = true;
  suggestionAnalysisQueued = false;

  try {
    const generated = await suggestionEngine.collect({ runtime });
    suggestionStore.upsertMany({
      scopeId: scope.scopeId,
      sectionId: scope.sectionId,
      suggestions: generated,
    });
    suggestionStore.pruneInvalidAnchors({
      scopeId: scope.scopeId,
      sectionId: scope.sectionId,
      runtime,
    });
    renderSuggestionRail();
    scheduleWorkspacePersist();
  } catch (error) {
    console.error("Suggestion analysis failed:", error);
  } finally {
    suggestionAnalysisInFlight = false;
    if (suggestionAnalysisQueued) {
      suggestionAnalysisQueued = false;
      void runSuggestionAnalysis();
    }
  }
}

function scheduleSuggestionAnalysis({ immediate = false } = {}) {
  if (suggestionAnalysisTimer) {
    window.clearTimeout(suggestionAnalysisTimer);
    suggestionAnalysisTimer = null;
  }

  if (!currentSuggestionScope() || restoringContext) {
    return;
  }

  suggestionAnalysisTimer = window.setTimeout(
    () => {
      suggestionAnalysisTimer = null;
      void runSuggestionAnalysis();
    },
    immediate ? 0 : 220,
  );
}

function persistActiveWorkspace() {
  return workspacePersistenceController?.persistNow?.() ?? false;
}

function flushWorkspacePersist() {
  return workspacePersistenceController?.flushPersist?.() ?? false;
}

function scheduleWorkspacePersist() {
  workspacePersistenceController?.schedulePersist?.({ delayMs: 220 });
}

function runWidgetHeavySync() {
  pruneActiveDocuments();
  syncPdfDocumentMetadata();
  syncReferencePopupMetadata();
  syncWidgetsToLibrarySnapshots();
  syncLinkedLibraryMetadata();
  applyPopupAutoDocking();
  updateDocumentSwitcherUi();
  updateReferenceManagerUi();
  scheduleOnboardingRefresh(120);
  scheduleSuggestionAnalysis();
  scheduleWorkspacePersist();
  scheduleStorageUsageRefresh();
  if (debugModeEnabled) {
    schedulePerfHudRefresh({ delayMs: 160 });
  }
}

function scheduleWidgetHeavySync({ delayMs = 140 } = {}) {
  if (widgetHeavySyncTimer) {
    window.clearTimeout(widgetHeavySyncTimer);
  }
  widgetHeavySyncTimer = window.setTimeout(() => {
    widgetHeavySyncTimer = null;
    runWidgetHeavySync();
  }, Math.max(0, Number(delayMs) || 0));
}

function updateWidgetUi({ deferHeavy = false, coalesceHeavy = false } = {}) {
  const dockedMoved = applyViewportDockToAllWidgets();
  if (dockedMoved) {
    runtime.requestRender({ continuousMs: 80 });
  }

  if (widgetCountOutput) {
    widgetCountOutput.textContent = String(runtime.getWidgetCount());
  }

  if (referenceCountOutput) {
    const referenceCount = runtime.listWidgets().filter((widget) => widget.type === "reference-popup").length;
    referenceCountOutput.textContent = String(referenceCount);
  }

  updateWhitespaceZoneCount();
  updateContextUi();
  syncReferenceManagerPlacement();
  syncViewportDockGlowLayout();
  renderSuggestionRail();
  renderSectionMinimap();
  if (searchIndex && workspaceScopeId()) {
    searchIndex.scheduleReindex({
      runtime,
      contextId: workspaceScopeId(),
    });
  } else {
    syncSearchIndexUi(0);
  }
  updateOnboardingControlsUi();

  if (deferHeavy) {
    return;
  }
  if (coalesceHeavy) {
    scheduleWidgetHeavySync();
  } else {
    runWidgetHeavySync();
  }
}

function setContextControlsBusy(nextBusy) {
  if (contextUiController) {
    contextUiController.setControlsDisabled(nextBusy);
  }
  if (sectionUiController) {
    sectionUiController.setControlsDisabled(nextBusy);
  }
}

function centerCameraOnWidget(widget) {
  if (!widget) {
    return;
  }

  const bounds =
    typeof widget.getInteractionBounds === "function"
      ? widget.getInteractionBounds(runtime.camera)
      : { width: widget.size.width, height: widget.size.height };
  const centerX = widget.position.x + Math.max(1, bounds.width) / 2;
  const centerY = widget.position.y + Math.max(1, bounds.height) / 2;

  runtime.camera.offsetX = canvas.clientWidth / 2 - centerX * runtime.camera.zoom;
  runtime.camera.offsetY = canvas.clientHeight / 2 - centerY * runtime.camera.zoom;
  updateCameraOutputFromState();
}

function centerCameraOnWorldPoint(point) {
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    return;
  }

  runtime.camera.offsetX = canvas.clientWidth / 2 - point.x * runtime.camera.zoom;
  runtime.camera.offsetY = canvas.clientHeight / 2 - point.y * runtime.camera.zoom;
  updateCameraOutputFromState();
}

function transitionSuggestionState(suggestion, toState) {
  const scope = currentSuggestionScope();
  if (!scope || !suggestion || typeof suggestion.id !== "string") {
    return null;
  }

  const updated = suggestionStore.transition({
    scopeId: scope.scopeId,
    sectionId: scope.sectionId,
    suggestionId: suggestion.id,
    toState,
  });
  renderSuggestionRail();
  scheduleWorkspacePersist();
  return updated;
}

function restoreSuggestionForRemovedWidget({ widget, reason } = {}) {
  if (reason !== "user-delete") {
    return;
  }
  if (!widget || widget.type !== "reference-popup") {
    return;
  }

  const suggestionId =
    typeof widget.metadata?.suggestionId === "string" && widget.metadata.suggestionId.trim()
      ? widget.metadata.suggestionId.trim()
      : null;
  if (!suggestionId) {
    return;
  }

  const scope = currentSuggestionScope();
  if (!scope) {
    return;
  }

  const existing = suggestionStore
    .list({
      scopeId: scope.scopeId,
      sectionId: scope.sectionId,
    })
    .find((entry) => entry.id === suggestionId);
  if (!existing || existing.state !== "accepted") {
    return;
  }

  suggestionStore.transition({
    scopeId: scope.scopeId,
    sectionId: scope.sectionId,
    suggestionId,
    toState: "ghosted",
  });
  renderSuggestionRail();
  scheduleWorkspacePersist();
}

function focusSuggestion(suggestion) {
  if (!suggestion) {
    return;
  }

  const sourceWidgetId =
    typeof suggestion.payload?.sourceWidgetId === "string" && suggestion.payload.sourceWidgetId.trim()
      ? suggestion.payload.sourceWidgetId
      : null;
  if (sourceWidgetId) {
    const source = runtime.getWidgetById(sourceWidgetId);
    if (source) {
      centerCameraOnWidget(source);
      runtime.bringWidgetToFront(source.id);
      runtime.setSelectedWidgetId(source.id);
      runtime.setFocusedWidgetId(source.id);
      return;
    }
  }

  if (suggestion.anchor) {
    centerCameraOnWorldPoint(suggestion.anchor);
  }
}

async function acceptSuggestion(suggestion) {
  if (!suggestion || typeof suggestion.kind !== "string") {
    return false;
  }

  const sourceWidgetId =
    typeof suggestion.payload?.sourceWidgetId === "string" && suggestion.payload.sourceWidgetId.trim()
      ? suggestion.payload.sourceWidgetId
      : null;

  if (suggestion.kind === "expanded-area") {
    const sourceWidget = sourceWidgetId ? runtime.getWidgetById(sourceWidgetId) : null;
    const whitespaceZoneId =
      typeof suggestion.payload?.whitespaceZoneId === "string" && suggestion.payload.whitespaceZoneId.trim()
        ? suggestion.payload.whitespaceZoneId
        : null;

    if (sourceWidget?.type === "pdf-document" && whitespaceZoneId) {
      const zone = sourceWidget
        .getWhitespaceZones()
        .find((entry) => entry.id === whitespaceZoneId);
      if (zone && !zone.linkedWidgetId) {
        await createExpandedFromWhitespaceZone(sourceWidget, zone);
      } else {
        await createExpandedAreaWidget(
          {},
          createCreationIntent({
            type: "expanded-area",
            anchor: suggestion.anchor ?? viewportCenterAnchor(),
            sourceWidgetId: sourceWidget.id,
            createdFrom: "suggestion-accepted",
          }),
        );
      }
    } else {
      await createExpandedAreaWidget(
        {},
        createCreationIntent({
          type: "expanded-area",
          anchor: suggestion.anchor ?? viewportCenterAnchor(),
          sourceWidgetId,
          createdFrom: "suggestion-accepted",
        }),
      );
    }

    transitionSuggestionState(suggestion, "accepted");
    scheduleSuggestionAnalysis({ immediate: true });
    return true;
  }

  if (suggestion.kind === "reference-popup") {
    const keywordTitle =
      typeof suggestion.payload?.keywordTitle === "string" && suggestion.payload.keywordTitle.trim()
        ? suggestion.payload.keywordTitle.trim()
        : "Reference";
    const sourceTitle =
      typeof suggestion.payload?.sourceTitle === "string" && suggestion.payload.sourceTitle.trim()
        ? suggestion.payload.sourceTitle.trim()
        : "PDF";
    const snippetText =
      typeof suggestion.payload?.snippetText === "string" && suggestion.payload.snippetText.trim()
        ? suggestion.payload.snippetText.trim()
        : `${keywordTitle} appears in ${sourceTitle}.`;

    await createReferencePopupWidget({
      intent: createCreationIntent({
        type: "reference-popup",
        anchor: suggestion.anchor ?? viewportCenterAnchor(),
        sourceWidgetId,
        createdFrom: "suggestion-accepted",
      }),
      definition: {
        metadata: {
          title: `${keywordTitle} Reference`,
          suggestionId: suggestion.id,
          popupMetadata: {
            type: "reference-popup",
            tags: ["suggested", typeof suggestion.payload?.keywordTag === "string" ? suggestion.payload.keywordTag : "keyword"],
          },
        },
        dataPayload: {
          sourceLabel: sourceTitle,
          textContent: snippetText,
          contentType: "definition",
          citation: null,
          researchCaptureId: null,
        },
      },
    });

    transitionSuggestionState(suggestion, "accepted");
    scheduleSuggestionAnalysis({ immediate: true });
    return true;
  }

  return false;
}

async function jumpToSearchResult(result) {
  if (!result || typeof result.widgetId !== "string" || !result.widgetId.trim()) {
    return false;
  }

  if (typeof result.contextId === "string" && result.contextId.trim()) {
    const scope = parseWorkspaceScopeId(result.contextId);
    if (scope.notebookId && scope.notebookId !== activeContextId) {
      await switchContext(scope.notebookId);
    }
    if (scope.sectionId && scope.sectionId !== activeSectionId) {
      await switchSection(scope.sectionId);
    }
  }

  const widget = runtime.getWidgetById(result.widgetId);
  if (!widget) {
    return false;
  }

  runtime.bringWidgetToFront(widget.id);
  runtime.setFocusedWidgetId(widget.id);
  runtime.setSelectedWidgetId(widget.id);
  centerCameraOnWidget(widget);
  updateWidgetUi();
  return true;
}

async function ensureSearchFeatures() {
  if (searchPanelController && searchIndex) {
    return searchPanelController;
  }

  const [indexModule, panelModule] = await Promise.all([
    import("./features/search/search-index.js"),
    import("./features/search/search-panel.js"),
  ]);
  loadedModules.add("search-index");
  loadedModules.add("search-panel");
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }

  if (!searchIndex) {
    searchIndex = indexModule.createSearchIndex();
    searchIndex.setUpdateListener((stats) => {
      syncSearchIndexUi(stats.totalEntries);
    });
  }

  if (workspaceScopeId()) {
    searchIndex.reindexNow({ runtime, contextId: workspaceScopeId() });
  }

  searchPanelController = panelModule.createSearchPanelController({
    panelElement: searchPanel,
    toggleButton: toggleSearchPanelButton,
    onQuery: async (query) => {
      if (!searchIndex) {
        return { results: [], indexedCount: 0 };
      }

      const scopeId = workspaceScopeId();
      if (scopeId) {
        searchIndex.reindexNow({ runtime, contextId: scopeId });
      }

      const notebookName = activeContextRecord()?.name ?? "Notebook";
      const sectionName = activeSectionRecord()?.name ?? "Section";

      const sectionResults = scopeId
        ? searchIndex
            .query(query, { contextId: scopeId, limit: 80 })
            .map((entry) => ({
              ...entry,
              contextLabel: `${notebookName} / ${sectionName}`,
              scopeGroup: "section",
            }))
        : [];

      const notebookResults = searchIndex
        .query(query, { contextId: null, limit: 260 })
        .filter((entry) => entry.contextId !== scopeId && isScopeInNotebook(entry.contextId, activeContextId))
        .slice(0, 80)
        .map((entry) => {
          const parsed = parseWorkspaceScopeId(entry.contextId);
          const sectionLabel =
            parsed.sectionId && sectionsStore && parsed.notebookId
              ? sectionsStore
                  .listSections(parsed.notebookId)
                  .find((item) => item.id === parsed.sectionId)?.name ?? "Section"
              : "Notebook";
          return {
            ...entry,
            contextLabel: `${notebookName} / ${sectionLabel}`,
            scopeGroup: "notebook",
          };
        });

      const results = [];
      if (sectionResults.length > 0) {
        results.push({
          id: "group-current-section",
          kind: "group-header",
          title: "Current Section",
          typeLabel: "",
          snippet: "",
        });
        results.push(...sectionResults);
      }
      if (notebookResults.length > 0) {
        results.push({
          id: "group-notebook",
          kind: "group-header",
          title: "Other Notebook Sections",
          typeLabel: "",
          snippet: "",
        });
        results.push(...notebookResults);
      }

      return {
        results,
        indexedCount: searchIndex
          .snapshotEntries()
          .filter((entry) => isScopeInNotebook(entry.contextId, activeContextId)).length,
      };
    },
    onActivateResult: async (result) => {
      await jumpToSearchResult(result);
    },
    onNavigateResult: async (result) => {
      await jumpToSearchResult(result);
    },
  });

  syncSearchIndexUi(searchIndex.getEntryCount(workspaceScopeId()));
  return searchPanelController;
}

async function ensureInkFeature() {
  if (inkFeature) {
    return inkFeature;
  }

  const inkModule = await import("./features/ink/index.js");
  loadedModules.add("ink");
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }

  inkFeature = inkModule.createInkFeature({
    runtime,
    getActiveContextId: () => workspaceScopeId(),
    onStateChange: (state) => updateInkUi(state),
    onCreateNoteFromLasso: (payload) => createNoteWidgetFromLassoSelection(payload),
  });
  runtime.bumpWidgetRasterEpoch();

  updateInkUi({
    activeTool: currentInkTool(),
    ...(typeof inkFeature.getPenStyle === "function" ? inkFeature.getPenStyle() : {}),
    enabled: true,
  });

  if (enableInkButton instanceof HTMLButtonElement) {
    enableInkButton.textContent = "Ink Enabled";
  }

  return inkFeature;
}

function setInkEnabled(nextEnabled) {
  if (!inkFeature || typeof inkFeature.setEnabled !== "function") {
    return false;
  }

  const enabled = inkFeature.setEnabled(nextEnabled);
  updateInkUi({
    activeTool: currentInkTool(),
    ...(typeof inkFeature.getPenStyle === "function" ? inkFeature.getPenStyle() : {}),
    enabled,
  });

  if (enableInkButton instanceof HTMLButtonElement) {
    enableInkButton.textContent = enabled ? "Ink Enabled" : "Enable Ink";
  }

  return enabled;
}

async function toggleInkEnabled() {
  const feature = await ensureInkFeature();
  if (!feature || typeof feature.isEnabled !== "function") {
    return false;
  }
  const next = !feature.isEnabled();
  setInkEnabled(next);
  return next;
}

async function toggleInkTool() {
  const feature = await ensureInkFeature();
  if (!feature || typeof feature.toggleTool !== "function") {
    return "pen";
  }

  const nextTool = normalizeInkTool(feature.toggleTool());
  updateInkUi({
    activeTool: nextTool,
    ...(typeof feature.getPenStyle === "function" ? feature.getPenStyle() : {}),
    enabled: feature.isEnabled?.() !== false,
  });

  return nextTool;
}

async function selectInkTool(nextTool) {
  const feature = await ensureInkFeature();
  if (!feature || typeof feature.setTool !== "function") {
    return "pen";
  }
  const normalized = normalizeInkTool(nextTool);
  const selected = normalizeInkTool(feature.setTool(normalized));
  updateInkUi({
    activeTool: selected,
    ...(typeof feature.getPenStyle === "function" ? feature.getPenStyle() : {}),
    enabled: feature.isEnabled?.() !== false,
  });
  return selected;
}

async function updatePenStyle({ color = null, thickness = null } = {}) {
  const feature = await ensureInkFeature();
  if (!feature) {
    return { penColor: "#103f78", penThickness: 3 };
  }

  if (typeof color === "string" && typeof feature.setPenColor === "function") {
    feature.setPenColor(normalizeInkColor(color));
  }
  if (thickness !== null && typeof feature.setPenThickness === "function") {
    feature.setPenThickness(normalizeInkThickness(thickness));
  }

  const style =
    typeof feature.getPenStyle === "function"
      ? feature.getPenStyle()
      : { penColor: normalizeInkColor(color), penThickness: normalizeInkThickness(thickness) };
  updateInkUi({
    penColor: style.penColor,
    penThickness: style.penThickness,
    activeTool: currentInkTool(),
    enabled: feature.isEnabled?.() !== false,
  });
  return style;
}

async function executeGestureAction(actionName) {
  if (actionName === "select-lasso-tool") {
    await selectInkTool("lasso");
    return;
  }

  if (actionName === "toggle-ink-tool") {
    await toggleInkTool();
    return;
  }

  if (actionName === "toggle-ink-enabled") {
    await toggleInkEnabled();
    return;
  }

  if (actionName === "toggle-search-panel") {
    const panel = await ensureSearchFeatures();
    panel.toggle();
    onboardingRuntimeSignals.searchOpened = true;
    scheduleOnboardingRefresh(40);
  }
}

async function ensureGestureFeatures() {
  if (penGestureController) {
    return penGestureController;
  }

  const gestureModule = await import("./features/gestures/pen-gestures.js");
  loadedModules.add("pen-gestures");
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }

  gesturePrefs = normalizeGesturePrefs(gesturePrefs ?? defaultGesturePrefs());
  updateGestureUi();

  penGestureController = gestureModule.createPenGestureController({
    canvas,
    getPrefs: () => gesturePrefs,
    onAction: (binding) => {
      void executeGestureAction(binding);
    },
    onStatusChange: (status) => {
      lastGestureStatus = {
        ...lastGestureStatus,
        ...(status ?? {}),
      };
      if (lastGestureStatus.lastGesture && lastGestureStatus.lastGesture !== "idle") {
        onboardingRuntimeSignals.gestureUsed = true;
        scheduleOnboardingRefresh(60);
      }
      updateGestureUi();
    },
  });

  return penGestureController;
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

async function ensureDiagramInteractions() {
  if (diagramInteractions) {
    return diagramInteractions;
  }

  const diagramModule = await import("./features/diagram/diagram-interactions.js");
  diagramInteractions = diagramModule.createDiagramInteractions({
    runtime,
    onDiagramMutated: async ({
      widget = null,
      preview = false,
      intent = "",
      nodeId = null,
      currentLabel = "",
    } = {}) => {
      if (intent === "rename-node" && widget?.type === "diagram" && typeof nodeId === "string" && nodeId.trim()) {
        const renamed = await showTextPromptDialog({
          title: "Rename Node",
          label: "Node name",
          defaultValue: typeof currentLabel === "string" && currentLabel.trim() ? currentLabel.trim() : "Node",
          confirmLabel: "Rename",
        });
        if (renamed && widget.renameNode?.(nodeId, renamed)) {
          updateWidgetUi({ coalesceHeavy: true });
        }
        return;
      }
      if (preview) {
        runtime.requestRender({ continuousMs: 120 });
        return;
      }
      updateWidgetUi({ coalesceHeavy: true });
    },
  });
  return diagramInteractions;
}

async function ensureSnipTool() {
  if (snipTool) {
    return snipTool;
  }

  await ensureReferencePopupInteractions();
  const snipModule = await import("./features/reference-popups/snip-tool.js");

  snipTool = snipModule.createSnipTool({
    runtime,
    onSnipReady: ({ dataUrl, width, height, rect }) => {
      const hasRect =
        rect &&
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height);
      const centerX = hasRect ? rect.x + rect.width / 2 : canvas.clientWidth / 2;
      const centerY = hasRect ? rect.y + rect.height / 2 : canvas.clientHeight / 2;
      const anchor = runtime.camera.screenToWorld(centerX, centerY);
      const sourceWidget = runtime.pickWidgetAtScreenPoint(centerX, centerY);

      void createReferencePopupFromSnip({
        dataUrl,
        width,
        height,
        intent: createCreationIntent({
          type: "reference-popup",
          anchor,
          sourceWidgetId: sourceWidget?.id ?? runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
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

async function createReferencePopupFromResearchCapture(capture, intent = null) {
  const normalizedCapture = normalizeResearchCapture(capture);
  if (!normalizedCapture) {
    throw new Error("Invalid research capture payload.");
  }

  const persistedCapture = upsertResearchCapture(normalizedCapture);
  if (!persistedCapture) {
    throw new Error("Research capture is incomplete.");
  }

  const citation = persistedCapture.citation;
  const hasImage = persistedCapture.contentType === "image";

  return createReferencePopupWidget({
    intent:
      normalizeCreationIntent(intent) ??
      createCreationIntent({
        type: "reference-popup",
        anchor: viewportCenterAnchor(),
        sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
        createdFrom: "manual",
      }),
    definition: {
      size: hasImage ? { width: 360, height: 280 } : { width: 360, height: 260 },
      metadata: {
        title: citation.attributionText,
        popupMetadata: {
          type: persistedCapture.contentType === "definition" ? "definition-citation" : "research-citation",
          tags: ["research", persistedCapture.contentType],
          sourceDocumentId: resolvePopupSourceDocumentId(intent),
        },
      },
      dataPayload: {
        imageDataUrl: hasImage ? persistedCapture.content : null,
        sourceLabel: citation.sourceTitle,
        contentType: persistedCapture.contentType,
        textContent: hasImage ? "" : persistedCapture.content,
        citation,
        researchCaptureId: persistedCapture.id,
      },
    },
  });
}

async function ensureResearchPanel() {
  if (researchPanelController) {
    return researchPanelController;
  }

  const researchModule = await import("./features/research/research-panel.js");
  loadedModules.add("research-panel");
  if (loadedModulesOutput) {
    loadedModulesOutput.textContent = Array.from(loadedModules).join(", ");
  }

  researchPanelController = researchModule.createResearchPanelController({
    panelElement: researchPanel,
    toggleButton: toggleResearchPanelButton,
    getActiveContextId: () => workspaceScopeId(),
    getActiveSourceWidgetId: () => runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
    onCapture: async (capture) => {
      const intent = createCreationIntent({
        type: "reference-popup",
        anchor: viewportCenterAnchor(),
        sourceWidgetId: capture.sourceWidgetId ?? runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
        createdFrom: "manual",
      });
      await createReferencePopupFromResearchCapture(capture, intent);
    },
  });

  return researchPanelController;
}

async function createDiagramWidget(definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const placement = resolvePlacementForCreation({
    type: "diagram",
    intent: normalizedIntent,
    requestedSize: definition.size,
    fallbackPlacement: defaultPlacement(-170, -110, 34, 28),
  });
  const finalPosition = definition.position ?? placement.position;
  const finalPlacement = { ...placement, position: finalPosition };

  await ensureDiagramInteractions();

  const widget = await registry.instantiate("diagram", {
    id: definition.id ?? makeId("diagram"),
    position: finalPosition,
    size: placement.size,
    metadata: withCreationProvenance(
      {
        title: definition.metadata?.title ?? "Diagram",
        ...(definition.metadata ?? {}),
      },
      normalizedIntent,
      finalPlacement,
      "diagram",
    ),
    dataPayload: {
      diagramDoc:
        definition.dataPayload?.diagramDoc && typeof definition.dataPayload.diagramDoc === "object"
          ? cloneJsonValue(definition.dataPayload.diagramDoc, null)
          : null,
    },
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  updateWidgetUi();
  flushWorkspacePersist();
  return widget;
}

async function createExpandedAreaWidget(definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const placement = resolvePlacementForCreation({
    type: "expanded-area",
    intent: normalizedIntent,
    requestedSize: definition.size,
    fallbackPlacement: defaultPlacement(-120, -60, 35, 28),
  });
  const finalPosition = definition.position ?? placement.position;
  const finalPlacement = { ...placement, position: finalPosition };
  const widget = await registry.instantiate("expanded-area", {
    id: definition.id ?? makeId("expanded"),
    position: finalPosition,
    size: placement.size,
    metadata: withCreationProvenance(
      definition.metadata,
      normalizedIntent,
      finalPlacement,
      "expanded-area",
    ),
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  updateWidgetUi();
  flushWorkspacePersist();
  return widget;
}

async function analyzeWhitespaceForPdfWidget(pdfWidget) {
  if (!pdfWidget || pdfWidget.type !== "pdf-document" || typeof pdfWidget.getWhitespaceZones !== "function") {
    return;
  }

  const existingZones = pdfWidget.getWhitespaceZones();
  if (Array.isArray(existingZones) && existingZones.length > 0) {
    updateWhitespaceZoneCount();
    return;
  }

  setWhitespaceState("analyzing");
  try {
    const manager = await ensureWhitespaceManager();
    const zones = await manager.analyzeWidget(pdfWidget);
    setWhitespaceState(zones.length > 0 ? "ready" : "none");
    updateWhitespaceZoneCount();
    updateWidgetUi();
  } catch (error) {
    console.error("Automatic whitespace analysis failed:", error);
    setWhitespaceState("failed");
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
  const source =
    sourceDocument && typeof sourceDocument === "object"
      ? sourceDocument
      : null;
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
    metadata: withCreationProvenance({
      title: resolvedTitle,
      sourceDocumentId: source?.id ?? null,
      ...(definition.metadata ?? {}),
    }, normalizedIntent, finalPlacement, "pdf-document"),
    dataPayload: {
      bytes: bytes instanceof Uint8Array ? bytes : null,
      rasterDocument: rasterDocument && typeof rasterDocument === "object" ? rasterDocument : null,
      fileName: resolvedFileName,
    },
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  lastPdfWidgetId = widget.id;

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

  const persistedImmediately = flushWorkspacePersist();
  if (!persistedImmediately) {
    runtime.removeWidgetById(widget.id);
    if (lastPdfWidgetId === widget.id) {
      lastPdfWidgetId = preferredPdfWidget()?.id ?? null;
    }
    pruneActiveDocuments();
    updateWidgetUi();
    throw new Error("Storage is full. PDF import was canceled because it could not be persisted.");
  }

  updateWidgetUi();
  window.setTimeout(() => {
    void analyzeWhitespaceForPdfWidget(widget);
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
      requestStorageCleanupNow();
      const snapshot = await readStorageEstimateSnapshot();
      const usageLabel =
        snapshot && snapshot.hasQuota
          ? `${formatMegabytes(snapshot.usage)} / ${formatMegabytes(snapshot.quota)}`
          : "Unknown";
      throw new Error(`Storage is full. Unable to store this PDF in the notebook library. Current usage: ${usageLabel}.`);
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
    syncLinkedNotebookDocumentInstances({ sourceDocumentId: sourceDocument.id });
  }

  return widget;
}

async function createReferencePopupWidget({ definition = {}, intent = null } = {}) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const placement = resolvePlacementForCreation({
    type: "reference-popup",
    intent: normalizedIntent,
    requestedSize: definition.size,
    fallbackPlacement: defaultPlacement(-80, -80, 16, 14),
  });
  const finalPosition = definition.position ?? placement.position;
  const finalPlacement = { ...placement, position: finalPosition };

  await ensureReferencePopupInteractions();

  const widget = await registry.instantiate("reference-popup", {
    id: definition.id ?? makeId("ref"),
    position: finalPosition,
    size: placement.size,
    metadata: withCreationProvenance(
      buildPopupMetadata({
        metadata: {
          title: definition.metadata?.title ?? "Reference",
          ...(definition.metadata ?? {}),
        },
        intent: normalizedIntent,
        fallbackTitle: definition.metadata?.title ?? "Reference",
      }),
      normalizedIntent,
      finalPlacement,
      "reference-popup",
    ),
    dataPayload: {
      imageDataUrl: definition.dataPayload?.imageDataUrl ?? null,
      textContent: definition.dataPayload?.textContent ?? "",
      sourceLabel: definition.dataPayload?.sourceLabel ?? "Manual",
      contentType: definition.dataPayload?.contentType ?? "text",
      citation: definition.dataPayload?.citation ?? null,
      researchCaptureId: definition.dataPayload?.researchCaptureId ?? null,
    },
    collapsed: definition.collapsed,
  });

  runtime.addWidget(widget);
  widget.metadata = buildPopupMetadata({
    metadata: widget.metadata,
    intent: normalizedIntent,
    fallbackTitle: widget.metadata?.title ?? "Reference",
  });
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
  flushWorkspacePersist();
  return widget;
}

async function createReferencePopupFromSnip({ dataUrl, width, height, intent = null }) {
  const normalizedIntent = normalizeCreationIntent(intent);
  await ensureReferencePopupInteractions();
  const worldFromPixels = worldSizeFromScreenPixels(runtime.camera.zoom, { width, height });
  const normalizedSnipSize = resolveWorldSize("reference-popup", {
    width: worldFromPixels.width * 0.78,
    height: worldFromPixels.height * 0.78 + 52,
  });

  const widget = await createReferencePopupWidget({
    intent: normalizedIntent,
    definition: {
      size: {
        width: Math.round(normalizedSnipSize.width),
        height: Math.round(normalizedSnipSize.height),
      },
      metadata: {
        title: "Reference",
        snipDimensions: {
          widthPx: Math.max(1, Math.round(width)),
          heightPx: Math.max(1, Math.round(height)),
        },
        popupMetadata: {
          tags: ["snip"],
        },
      },
      dataPayload: {
        imageDataUrl: dataUrl,
        contentType: "image",
        textContent: "",
        citation: null,
        researchCaptureId: null,
        sourceLabel: "Quick Snip",
      },
    },
  });
  if (widget) {
    await saveReferenceWidgetToNotebookLibrary(widget);
    updateWidgetUi();
  }
  return widget;
}

function listActiveNotebookDocuments() {
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

  const selected = await showSelectDialog({
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

  const choice = await showActionDialog({
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
    await showNoticeDialog(`Notebook document "${sourceDocument.title}" is missing import data. Reupload it.`, {
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
    syncLinkedNotebookDocumentInstances({ sourceDocumentId: sourceDocument.id });
  }

  if (widget && Array.isArray(sourceDocument.inkStrokes) && sourceDocument.inkStrokes.length > 0) {
    restoreWidgetInkSnapshot(sourceDocument.inkStrokes, widget.id);
    flushWorkspacePersist();
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

  const restoredZones =
    typeof widget.getWhitespaceZones === "function"
      ? widget.getWhitespaceZones()
      : [];

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
  updateWhitespaceZoneCount();
  updateWidgetUi();
  flushWorkspacePersist();
  return true;
}

async function tryRestorePdfWidgetFromLinkedDocument(widget) {
  if (!activeContextId || !widget || widget.type !== "pdf-document") {
    return false;
  }

  const sourceDocumentId =
    typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
      ? widget.metadata.sourceDocumentId.trim()
      : null;
  let sourceDocument =
    sourceDocumentId ? notebookDocumentLibraryStore.getDocument(activeContextId, sourceDocumentId) : null;

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
    await showNoticeDialog("PDF input is unavailable.", { title: "PDF Import" });
    return false;
  }

  const normalizedIntent = normalizeCreationIntent(intent);
  if (!normalizedIntent || normalizedIntent.type !== "pdf-document") {
    return false;
  }

  pendingPdfImportIntent = {
    intent: normalizedIntent,
    linkStatus: linkStatus === "frozen" ? "frozen" : "linked",
    sourceDocumentId:
      typeof sourceDocumentId === "string" && sourceDocumentId.trim()
        ? sourceDocumentId.trim()
        : null,
  };
  pdfFileInput.value = "";
  pdfFileInput.click();
  return true;
}

async function openPdfPickerForExistingWidget(widget) {
  if (!(pdfFileInput instanceof HTMLInputElement)) {
    await showNoticeDialog("PDF input is unavailable.", { title: "PDF Import" });
    return false;
  }
  if (!widget || widget.type !== "pdf-document") {
    return false;
  }

  pendingPdfImportIntent = {
    targetWidgetId: widget.id,
    sourceDocumentId:
      typeof widget.metadata?.sourceDocumentId === "string" && widget.metadata.sourceDocumentId.trim()
        ? widget.metadata.sourceDocumentId.trim()
        : null,
    linkStatus: "linked",
    intent: null,
  };
  pdfFileInput.value = "";
  pdfFileInput.click();
  return true;
}

async function executeCreationIntent(intent) {
  const normalizedIntent = normalizeCreationIntent(intent);
  if (!normalizedIntent) {
    await showNoticeDialog("Unsupported widget type.", { title: "Widget Creation" });
    return false;
  }

  if (normalizedIntent.type === "snip") {
    const tool = await ensureSnipTool();
    if (!tool || typeof tool.arm !== "function") {
      return false;
    }
    tool.arm();
    return true;
  }

  if (normalizedIntent.type === "pdf-document") {
    const flow = await resolvePdfCreationFlow();
    if (!flow) {
      return false;
    }

    if (flow.type === "instantiate-source") {
      const created = await createPdfWidgetFromNotebookSource(flow.sourceDocument, normalizedIntent, {
        linkStatus: flow.linkStatus,
      });
      return Boolean(created);
    }

    return openPdfPickerForIntent(normalizedIntent, {
      linkStatus: flow.linkStatus,
      sourceDocumentId: flow.sourceDocumentId,
    });
  }

  if (normalizedIntent.type === "expanded-area") {
    await createExpandedAreaWidget({}, normalizedIntent);
    return true;
  }

  if (normalizedIntent.type === "diagram") {
    await createDiagramWidget({}, normalizedIntent);
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

  if (normalizedIntent.type === "library-reference") {
    return createReferencePopupFromNotebookLibrary(normalizedIntent);
  }

  await showNoticeDialog(`Unsupported widget type: ${normalizedIntent.type}`, {
    title: "Widget Creation",
  });
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
        title: "Notes",
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
  }
}

async function restoreWorkspaceForActiveContext() {
  const scopeId = workspaceScopeId();
  if (!contextWorkspaceStore || !scopeId) {
    return;
  }

  restoringContext = true;
  setContextControlsBusy(true);
  if (suggestionAnalysisTimer) {
    window.clearTimeout(suggestionAnalysisTimer);
    suggestionAnalysisTimer = null;
  }
  suggestionAnalysisQueued = false;

  try {
    clearRuntimeWidgets();
    documentManager.reset({
      contextId: scopeId,
      documents: [],
      documentBindings: [],
      activeDocumentId: null,
      validWidgetIds: [],
    });
    researchCaptures = [];
    lastPdfWidgetId = null;
    lastReferenceWidgetId = null;
    const suggestionScope = currentSuggestionScope();
    if (suggestionScope) {
      suggestionStore.replaceSectionSuggestions({
        scopeId: suggestionScope.scopeId,
        sectionId: suggestionScope.sectionId,
        suggestions: [],
      });
      renderSuggestionRail();
    }

    let workspace = contextWorkspaceStore.loadWorkspace(scopeId);
    if (
      activeContextId &&
      activeSectionId &&
      workspace.widgets.length < 1 &&
      workspace.documents.length < 1 &&
      workspace.researchCaptures.length < 1
    ) {
      const legacyWorkspace = contextWorkspaceStore.loadWorkspace(activeContextId);
      if (
        legacyWorkspace.widgets.length > 0 ||
        legacyWorkspace.documents.length > 0 ||
        legacyWorkspace.researchCaptures.length > 0
      ) {
        workspace = {
          ...legacyWorkspace,
          contextId: scopeId,
        };

        const migrated = contextWorkspaceStore.saveWorkspace(workspace);
        if (!migrated && !hasShownWorkspaceStorageWarning) {
          hasShownWorkspaceStorageWarning = true;
          void showNoticeDialog("Storage is full. Recent PDF/widget changes may not persist until space is freed.", {
            title: "Storage",
          });
        }
      }
    }

    documentManager.reset({
      contextId: scopeId,
      documents: workspace.documents,
      documentBindings: workspace.documentBindings,
      activeDocumentId: workspace.activeWorkspaceState.activeDocumentId,
      validWidgetIds: workspace.widgets.map((entry) => entry.id),
    });
    researchCaptures = Array.isArray(workspace.researchCaptures)
      ? workspace.researchCaptures.map((entry) => normalizeResearchCapture(entry)).filter((entry) => entry !== null)
      : [];
    if (suggestionScope) {
      suggestionStore.replaceSectionSuggestions({
        scopeId: suggestionScope.scopeId,
        sectionId: suggestionScope.sectionId,
        suggestions: Array.isArray(workspace.suggestions) ? workspace.suggestions : [],
      });
      renderSuggestionRail();
    }
    lastPdfWidgetId = workspace.activeWorkspaceState.lastPdfWidgetId;
    lastReferenceWidgetId = workspace.activeWorkspaceState.lastReferenceWidgetId;

    const widgetTypes = new Set(workspace.widgets.map((entry) => entry.type));
    const hasStoredWhitespaceZones = workspace.widgets.some(
      (entry) =>
        entry.type === "pdf-document" &&
        Array.isArray(entry.runtimeState?.whitespaceZones) &&
        entry.runtimeState.whitespaceZones.length > 0,
    );

    if (widgetTypes.has("reference-popup")) {
      await ensureReferencePopupInteractions();
    }
    if (widgetTypes.has("diagram")) {
      await ensureDiagramInteractions();
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

        if (widget.type === "pdf-document" && widget.loadError) {
          await tryRestorePdfWidgetFromLinkedDocument(widget);
        }

        runtime.addWidget(widget);
      } catch (error) {
        console.error(`Failed to restore widget ${serializedWidget.id}:`, error);
      }
    }

    for (const widget of runtime.listWidgets()) {
      if (!widget || widget.type !== "reference-popup") {
        continue;
      }

      const contentType =
        widget.contentType === "image" || widget.contentType === "definition" ? widget.contentType : "text";
      const content =
        contentType === "image"
          ? typeof widget.imageDataUrl === "string"
            ? widget.imageDataUrl
            : ""
          : typeof widget.textContent === "string"
            ? widget.textContent
            : "";

      if (!content) {
        continue;
      }

      const normalized = upsertResearchCapture({
        id:
          typeof widget.researchCaptureId === "string" && widget.researchCaptureId.trim()
            ? widget.researchCaptureId
            : makeId("capture"),
        contextId: scopeId,
        contentType,
        content,
        citation: widget.citation,
      });

      if (normalized) {
        widget.researchCaptureId = normalized.id;
      }
    }

    pruneActiveDocuments();
    syncPdfDocumentMetadata();
    syncLinkedNotebookDocumentInstances();
    const activeDocument = documentManager.getActiveDocument();
    if (activeDocument) {
      focusDocumentWidgets(activeDocument.id, { selectPrimary: true });
    }
    if (searchIndex && scopeId) {
      searchIndex.reindexNow({ runtime, contextId: scopeId });
    }
    updateWidgetUi();
    scheduleSuggestionAnalysis({ immediate: true });
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
  sectionsStore.ensureNotebook(activeContextId);
  activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
  onboardingRuntimeSignals.searchOpened = false;
  onboardingRuntimeSignals.peekActivated = false;
  onboardingRuntimeSignals.gestureUsed = false;
  documentManager.setContextId(workspaceScopeId());
  updateContextUi();
  await restoreWorkspaceForActiveContext();
  refreshLinkedWidgets();
  updateOnboardingControlsUi();
  scheduleOnboardingRefresh(0);
  if (searchPanelController && typeof searchPanelController.runQuery === "function") {
    void searchPanelController.runQuery();
  }
}

async function switchSection(nextSectionId) {
  if (
    !sectionsStore ||
    !activeContextId ||
    !nextSectionId ||
    nextSectionId === activeSectionId
  ) {
    return;
  }

  flushWorkspacePersist();
  if (!sectionsStore.setActiveSection(activeContextId, nextSectionId)) {
    return;
  }

  activeSectionId = nextSectionId;
  onboardingRuntimeSignals.searchOpened = false;
  onboardingRuntimeSignals.peekActivated = false;
  onboardingRuntimeSignals.gestureUsed = false;
  documentManager.setContextId(workspaceScopeId());
  updateContextUi();
  await restoreWorkspaceForActiveContext();
  refreshLinkedWidgets();
  updateOnboardingControlsUi();
  scheduleOnboardingRefresh(0);
  if (searchPanelController && typeof searchPanelController.runQuery === "function") {
    void searchPanelController.runQuery();
  }
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
      contextId: workspaceScopeId(),
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
  if (!contextStore || !contextWorkspaceStore || !activeContextId || !workspaceScopeId()) {
    return;
  }

  const candidates = contextStore.list().filter((entry) => entry.id !== activeContextId);
  if (candidates.length < 1) {
    await showNoticeDialog("No other notebooks exist yet.", { title: "Import Widgets" });
    return;
  }

  const selectedContext = await showSelectDialog({
    title: "Import Widgets",
    message: "Choose the source notebook.",
    label: "Notebook",
    confirmLabel: "Continue",
    options: candidates.map((entry) => ({
      id: entry.id,
      label: entry.name,
    })),
  });
  if (!selectedContext) {
    return;
  }

  const sourceContext = candidates.find((entry) => entry.id === selectedContext.id);
  if (!sourceContext) {
    return;
  }
  const sourceSections = sectionsStore.listSections(sourceContext.id);
  if (sourceSections.length < 1) {
    await showNoticeDialog("Source notebook has no sections.", { title: "Import Widgets" });
    return;
  }

  const selectedSection = await showSelectDialog({
    title: "Import Widgets",
    message: `Notebook "${sourceContext.name}" selected. Choose a section.`,
    label: "Section",
    confirmLabel: "Continue",
    options: sourceSections.map((entry) => ({
      id: entry.id,
      label: entry.name,
    })),
  });
  if (!selectedSection) {
    return;
  }

  const sourceSection = sourceSections.find((entry) => entry.id === selectedSection.id);
  if (!sourceSection) {
    return;
  }
  const sourceScopeId = workspaceScopeId(sourceContext.id, sourceSection.id);
  const sourceWorkspace = contextWorkspaceStore.loadWorkspace(sourceScopeId);
  if (sourceWorkspace.widgets.length < 1) {
    await showNoticeDialog("Source notebook section has no widgets to import.", {
      title: "Import Widgets",
    });
    return;
  }

  const selectedWidgetIds = await showMultiSelectDialog({
    title: "Import Widgets",
    message: "Select one or more widgets to import.",
    confirmLabel: "Import",
    options: sourceWorkspace.widgets.map((entry) => ({
      id: entry.id,
      label: `${entry.type} - ${widgetTitle(entry)}`,
    })),
  });
  if (selectedWidgetIds.length < 1) {
    return;
  }

  const selectedWidgets = sourceWorkspace.widgets.filter((entry) => selectedWidgetIds.includes(entry.id));
  const selectedTypes = new Set(selectedWidgets.map((entry) => entry.type));

  if (selectedTypes.has("reference-popup")) {
    await ensureReferencePopupInteractions();
  }
  if (selectedTypes.has("diagram")) {
    await ensureDiagramInteractions();
  }

  const idMap = new Map();
  const importedWidgets = [];
  const targetScopeId = workspaceScopeId();

  for (const sourceWidget of selectedWidgets) {
    const cloned = contextWorkspaceStore.cloneForImport(sourceWidget, targetScopeId);
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
  const sourceCaptureById = new Map(
    (sourceWorkspace.researchCaptures ?? []).map((entry) => [entry.id, entry]),
  );
  const captureIdMap = new Map();
  for (const widget of importedReferenceWidgets) {
    if (typeof widget.researchCaptureId === "string" && widget.researchCaptureId.trim()) {
      const sourceCapture = sourceCaptureById.get(widget.researchCaptureId);
      if (sourceCapture) {
        let mappedCaptureId = captureIdMap.get(sourceCapture.id) ?? null;
        if (!mappedCaptureId) {
          const importedCapture = upsertResearchCapture({
            ...sourceCapture,
            id: makeId("capture"),
            contextId: targetScopeId,
          });
          if (importedCapture) {
            mappedCaptureId = importedCapture.id;
            captureIdMap.set(sourceCapture.id, importedCapture.id);
          }
        }

        if (mappedCaptureId) {
          const importedCapture = getResearchCaptureById(mappedCaptureId);
          widget.researchCaptureId = mappedCaptureId;
          if (importedCapture) {
            widget.contentType = importedCapture.contentType;
            widget.citation = { ...importedCapture.citation };
            if (importedCapture.contentType === "image") {
              widget.imageDataUrl = importedCapture.content;
              widget.textContent = "";
            } else {
              widget.textContent = importedCapture.content;
            }
            if (importedCapture.citation.sourceTitle) {
              widget.sourceLabel = importedCapture.citation.sourceTitle;
            }
          }
        }
      }
    }

    if (!widget.researchCaptureId && widget.citation) {
      const contentType =
        widget.contentType === "image" || widget.contentType === "definition" ? widget.contentType : "text";
      const content =
        contentType === "image"
          ? typeof widget.imageDataUrl === "string"
            ? widget.imageDataUrl
            : ""
          : typeof widget.textContent === "string"
            ? widget.textContent
            : "";
      const importedCapture = upsertResearchCapture({
        id: makeId("capture"),
        contextId: targetScopeId,
        contentType,
        content,
        citation: widget.citation,
      });
      if (importedCapture) {
        widget.researchCaptureId = importedCapture.id;
      }
    }

    bindReferenceToActiveDocument(widget.id);
  }

  const activeDocument = documentManager.getActiveDocument();
  if (activeDocument) {
    focusDocumentWidgets(activeDocument.id, { selectPrimary: false });
  }

  updateWidgetUi();

  await showNoticeDialog(
    `Imported ${importedWidgets.length} widget(s) from "${sourceContext.name}" / "${sourceSection.name}".`,
    { title: "Import Widgets" },
  );
}

function wireBaseEventHandlers() {
  const closeToolsMenu = () => {
    if (!toolsPanelOpen) {
      return;
    }
    toolsPanelOpen = false;
    safeLocalStorageSetItem("notes-app.tools-panel.open", "0");
    syncToolsUi();
  };

  if (!inputRoutingController) {
    inputRoutingController = createInputRoutingController({
      canvas,
      isTypingTarget: (target) => isTypingTarget(target),
      isInkToolDropdownOpen: () => isInkToolDropdownOpen(),
      setInkToolDropdownOpen: (nextOpen) => setInkToolDropdownOpen(nextOpen),
      isWithinInkToolDropdown: (target) => isWithinInkToolDropdown(target),
      isInkStyleDropdownOpen: () => isInkStyleDropdownOpen(),
      setInkStyleDropdownOpen: (nextOpen) => setInkStyleDropdownOpen(nextOpen),
      isWithinInkStyleDropdown: (target) => isWithinInkStyleDropdown(target),
      isToolsPanelOpen: () => toolsPanelOpen,
      isTargetInsideToolsUi: (target) =>
        (controlsPanel instanceof HTMLElement && controlsPanel.contains(target)) ||
        (toggleToolsButton instanceof HTMLElement && toggleToolsButton.contains(target)),
      closeToolsPanel: () => closeToolsMenu(),
      onWindowResize: () => {
        if (toolsPanelOpen) {
          syncToolsUi();
        }
      },
      onViewportSyncRequested: () => {
        scheduleCanvasViewportSync();
      },
      onInkCursorPointerEvent: (event) => {
        syncInkCursorPill(event);
      },
      onInkCursorHide: () => {
        hideInkCursorPill();
      },
    });
  }
  inputRoutingController.attach();

  toggleToolsButton?.addEventListener("click", () => {
    toolsPanelOpen = !toolsPanelOpen;
    safeLocalStorageSetItem("notes-app.tools-panel.open", toolsPanelOpen ? "1" : "0");
    syncToolsUi();
  });
  snipExitButton?.addEventListener("click", () => {
    if (!snipTool || typeof snipTool.disarm !== "function") {
      return;
    }
    snipTool.disarm();
  });

  toggleUiModeButton?.addEventListener("click", () => {
    const next = toggleUiMode(uiModeState);
    setUiMode(next.mode);
    scheduleOnboardingRefresh(0);
  });

  toggleOnboardingHintsButton?.addEventListener("click", () => {
    toggleOnboardingHints();
  });

  resetOnboardingHintsButton?.addEventListener("click", () => {
    resetOnboardingHints();
  });

  toggleResearchPanelButton?.addEventListener("click", async () => {
    toggleResearchPanelButton.disabled = true;
    try {
      const panel = await ensureResearchPanel();
      panel.toggle();
    } catch (error) {
      console.error(error);
      await showNoticeDialog(`Research panel failed: ${formatErrorMessage(error)}`, {
        title: "Research",
      });
    } finally {
      toggleResearchPanelButton.disabled = false;
    }
  });

  toggleSearchPanelButton?.addEventListener("click", async () => {
    toggleSearchPanelButton.disabled = true;
    try {
      const panel = await ensureSearchFeatures();
      panel.toggle();
      onboardingRuntimeSignals.searchOpened = true;
      scheduleOnboardingRefresh(40);
    } catch (error) {
      console.error(error);
      await showNoticeDialog(`Search panel failed: ${formatErrorMessage(error)}`, {
        title: "Search",
      });
    } finally {
      toggleSearchPanelButton.disabled = false;
    }
  });

  gestureEnabledToggle?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    setGesturePrefs({
      ...gesturePrefs,
      enabled: target.checked,
    });
  });

  gestureDoubleTapToggle?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    setGesturePrefs({
      ...gesturePrefs,
      gestures: {
        ...(gesturePrefs?.gestures ?? {}),
        doubleTap: target.checked,
      },
    });
  });

  gestureBarrelTapToggle?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    setGesturePrefs({
      ...gesturePrefs,
      gestures: {
        ...(gesturePrefs?.gestures ?? {}),
        barrelTap: target.checked,
      },
    });
  });

  gestureDoubleTapBindingSelect?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    setGesturePrefs({
      ...gesturePrefs,
      bindings: {
        ...(gesturePrefs?.bindings ?? {}),
        doubleTap: target.value,
      },
    });
  });

  gestureBarrelTapBindingSelect?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    setGesturePrefs({
      ...gesturePrefs,
      bindings: {
        ...(gesturePrefs?.bindings ?? {}),
        barrelTap: target.value,
      },
    });
  });

  pdfFileInput?.addEventListener("change", async (event) => {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      pendingPdfImportIntent = null;
      return;
    }

    try {
      const canImport = await ensureStorageHeadroomForPdfImport(file);
      if (!canImport) {
        pendingPdfImportIntent = null;
        event.target.value = "";
        return;
      }

      const pending = pendingPdfImportIntent;
      if (pending?.targetWidgetId) {
        await reimportMissingPdfForWidget(pending.targetWidgetId, file);
      } else {
        const fallbackIntent = createCreationIntent({
          type: "pdf-document",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        });
        await createPdfWidgetFromFile(
          file,
          {},
          pending?.intent ?? fallbackIntent,
          {
            linkStatus: pending?.linkStatus ?? "linked",
            sourceDocumentId: pending?.sourceDocumentId ?? null,
          },
        );
      }
    } catch (error) {
      console.error(error);
      await showNoticeDialog(`PDF import failed: ${formatErrorMessage(error)}`, {
        title: "PDF Import",
      });
    } finally {
      pendingPdfImportIntent = null;
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
      await showNoticeDialog(`Worker startup failed: ${formatErrorMessage(error)}`, {
        title: "Worker",
      });
    } finally {
      startWorkerButton.disabled = false;
      startWorkerButton.textContent = "Start Worker";
    }
  });

  runStressBenchmarkButton?.addEventListener("click", () => {
    void runStressBenchmark().catch((error) => {
      console.error(error);
      if (perfBenchmarkOutput instanceof HTMLOutputElement) {
        perfBenchmarkOutput.textContent = "failed";
      }
    });
  });

  enableInkButton?.addEventListener("click", async () => {
    enableInkButton.disabled = true;
    const wasInitialized = Boolean(inkFeature);
    if (!wasInitialized) {
      enableInkButton.textContent = "Loading...";
    }

    try {
      if (!inkFeature) {
        await ensureInkFeature();
        setInkEnabled(true);
      } else {
        setInkEnabled(true);
      }
    } catch (error) {
      console.error(error);
      if (inkStateOutput) {
        inkStateOutput.textContent = "failed";
      }
      await showNoticeDialog(`Ink initialization failed: ${formatErrorMessage(error)}`, {
        title: "Ink",
      });
    } finally {
      enableInkButton.disabled = false;
      if (enableInkButton instanceof HTMLButtonElement && !inkFeature) {
        enableInkButton.textContent = "Enable Ink";
      }
    }
  });

  toggleInkToolButton?.addEventListener("click", () => {
    void toggleInkTool();
  });
  inkToolDropdownToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setInkToolDropdownOpen(!isInkToolDropdownOpen());
  });
  inkToolDropdownMenu?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("button[data-ink-tool]") : null;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const tool = normalizeInkTool(target.dataset.inkTool);
    setInkToolDropdownOpen(false);
    void selectInkTool(tool);
  });
  inkStyleDropdownToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelInkStyleMenuClose();
    setInkStyleDropdownOpen(!isInkStyleDropdownOpen());
  });
  inkStyleDropdownToggle?.addEventListener("pointerenter", () => {
    cancelInkStyleMenuClose();
    setInkStyleDropdownOpen(true);
  });
  inkStyleDropdownToggle?.addEventListener("pointerleave", () => {
    scheduleInkStyleMenuClose(120);
  });
  inkStyleDropdownMenu?.addEventListener("pointerenter", () => {
    cancelInkStyleMenuClose();
    setInkStyleDropdownOpen(true);
  });
  inkStyleDropdownMenu?.addEventListener("pointerleave", () => {
    scheduleInkStyleMenuClose(120);
  });
  inkStyleDropdownMenu?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("button[data-ink-color]") : null;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    event.preventDefault();
    const color = normalizeInkColor(target.dataset.inkColor);
    void updatePenStyle({ color });
  });
  inkThicknessRange?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    void updatePenStyle({ thickness: Number(target.value) });
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
    if (referenceManagerUiController?.isOpen?.()) {
      return;
    }

    if (key === "escape" && toolsPanelOpen) {
      toolsPanelOpen = false;
      safeLocalStorageSetItem("notes-app.tools-panel.open", "0");
      syncToolsUi();
    }

    if ((event.ctrlKey || event.metaKey) && key === "f") {
      event.preventDefault();
      event.stopImmediatePropagation();
      void ensureSearchFeatures()
        .then((panel) => {
          panel.open();
          onboardingRuntimeSignals.searchOpened = true;
          scheduleOnboardingRefresh(40);
        })
        .catch((error) => {
          console.error(error);
          void showNoticeDialog(`Search panel failed: ${formatErrorMessage(error)}`, {
            title: "Search",
          });
        });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (key === "d" || key === "u")) {
      event.preventDefault();
      const next = toggleUiMode(uiModeState);
      setUiMode(next.mode);
      scheduleOnboardingRefresh(0);
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
  window.addEventListener("pagehide", () => {
    flushWorkspacePersist();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushWorkspacePersist();
      return;
    }
    refreshLinkedWidgets();
  });
  window.addEventListener("focus", () => {
    refreshLinkedWidgets();
  });
}

function wireContextMenu() {
  createWidgetContextMenu({
    canvas,
    menuElement: widgetContextMenu,
    runtime,
    onCopyWidget: (widget) => copyWidgetFromContextMenu(widget),
    onRenameWidget: (widget) => renameWidgetFromContextMenu(widget),
    onToggleLibrary: (widget) => toggleWidgetLibraryFromContextMenu(widget),
    onTogglePin: (widget) => toggleWidgetPinFromContextMenu(widget),
    onShowWidgetInfo: async (widget) => {
      await showNoticeDialog(formatWidgetInfo(widget), { title: "Widget Info" });
    },
    onWidgetMutated: () => updateWidgetUi({ coalesceHeavy: true }),
  });
}

function wireSuggestionUi() {
  if (suggestionUiController) {
    return;
  }

  suggestionUiController = createSuggestionUiController({
    rootElement: suggestionRail,
    runtime,
    onAccept: async (suggestion) => {
      await acceptSuggestion(suggestion);
    },
    onGhost: (suggestion) => {
      transitionSuggestionState(suggestion, "ghosted");
    },
    onRestore: (suggestion) => {
      transitionSuggestionState(suggestion, "restored");
    },
    onFocus: (suggestion) => {
      focusSuggestion(suggestion);
    },
  });

  renderSuggestionRail();
}

function wireSectionMinimap() {
  if (sectionMinimapController) {
    return;
  }

  sectionMinimapController = createSectionMinimapController({
    runtime,
    rootElement: sectionMinimap,
    canvasElement: sectionMinimapCanvas,
    onFocusFromMinimap: () => {
      onboardingRuntimeSignals.peekActivated = true;
      scheduleOnboardingRefresh(40);
    },
  });

  renderSectionMinimap();
}

function wireReferenceManagerUi() {
  if (referenceManagerUiController) {
    return;
  }

  referenceManagerUiController = createReferenceManagerUi({
    launcherButton: referenceManagerLauncher,
    overlayElement: referenceManagerOverlay,
    panelElement: referenceManagerPanel,
    closeButton: referenceManagerCloseButton,
    referencesTabButton: referenceManagerTabReferences,
    notesTabButton: referenceManagerTabNotes,
    documentsTabButton: referenceManagerTabDocuments,
    referencesListElement: referenceManagerReferenceList,
    notesListElement: referenceManagerNoteList,
    documentsListElement: referenceManagerDocumentList,
    referencesCountElement: referenceManagerReferenceCount,
    notesCountElement: referenceManagerNoteCount,
    documentsCountElement: referenceManagerDocumentCount,
    previewLayerElement: referencePreviewLayer,
    onImportReference: async (entry, { screenPoint = null } = {}) => {
      const widget = await createReferencePopupFromLibraryEntry(entry, {
        linkStatus: "linked",
        intent: createCreationIntent({
          type: "reference-popup",
          anchor: screenPoint ? anchorFromScreenPoint(screenPoint) : viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      });
      if (!widget) {
        return { imported: false };
      }
      updateWidgetUi();
      return { imported: true, widgetId: widget.id };
    },
    onImportDocument: async (entry, { screenPoint = null } = {}) => {
      const widget = await createPdfWidgetFromLibraryEntry(entry, {
        linkStatus: "linked",
        intent: createCreationIntent({
          type: "pdf-document",
          anchor: screenPoint ? anchorFromScreenPoint(screenPoint) : viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      });
      if (!widget) {
        return { imported: false };
      }
      updateWidgetUi();
      return { imported: true, widgetId: widget.id };
    },
    onImportNote: async (entry, { screenPoint = null } = {}) => {
      const widget = await createNoteWidgetFromLibraryEntry(
        entry,
        createCreationIntent({
          type: "expanded-area",
          anchor: screenPoint ? anchorFromScreenPoint(screenPoint) : viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      );
      if (!widget) {
        return { imported: false };
      }
      updateWidgetUi();
      return { imported: true, widgetId: widget.id };
    },
    onBeginSpawnDrag: ({ widgetId, pointerId, pointerType, clientX, clientY }) =>
      widgetInteractionManager?.beginExternalMoveDrag?.({
        widgetId,
        pointerId,
        pointerType,
        clientX,
        clientY,
      }) === true,
    onMoveSpawnDrag: ({ pointerId, pointerType, clientX, clientY }) =>
      widgetInteractionManager?.moveExternalDrag?.({
        pointerId,
        pointerType,
        clientX,
        clientY,
      }) === true,
    onEndSpawnDrag: ({ pointerId, pointerType, clientX, clientY }) =>
      widgetInteractionManager?.endExternalDrag?.({
        pointerId,
        pointerType,
        clientX,
        clientY,
      }) === true,
    onRenameReference: async (entry) => {
      await renameNotebookReferenceFromManager(entry);
    },
    onRenameNote: async (entry) => {
      await renameNotebookNoteFromManager(entry);
    },
    onDeleteReference: async (entry) => {
      await deleteNotebookReferenceFromManager(entry);
    },
    onDeleteNote: async (entry) => {
      await deleteNotebookNoteFromManager(entry);
    },
    onRenameDocument: async (entry) => {
      await renameNotebookDocumentFromManager(entry);
    },
    onDeleteDocument: async (entry) => {
      await deleteNotebookDocumentFromManager(entry);
    },
    onShowReferenceInfo: async (entry) => {
      await showNotebookReferenceInfo(entry);
    },
    onShowNoteInfo: async (entry) => {
      await showNotebookNoteInfo(entry);
    },
    onShowDocumentInfo: async (entry) => {
      await showNotebookDocumentInfo(entry);
    },
    onTouchReference: async (entry) => {
      if (!activeContextId || !entry) {
        return;
      }
      notebookLibraryStore.touchReference(activeContextId, entry.id);
      updateReferenceManagerUi();
    },
    onTouchNote: async (entry) => {
      if (!activeContextId || !entry) {
        return;
      }
      notebookLibraryStore.touchNote(activeContextId, entry.id);
      updateReferenceManagerUi();
    },
    onTouchDocument: async (entry) => {
      if (!activeContextId || !entry) {
        return;
      }
      notebookDocumentLibraryStore.touchDocument(activeContextId, entry.id);
      updateReferenceManagerUi();
    },
    onLoadDocumentBytes: (entry) => {
      if (!activeContextId || !entry || typeof entry.id !== "string") {
        return null;
      }
      return notebookDocumentLibraryStore.loadDocumentBytes(activeContextId, entry.id);
    },
    onLoadDocumentRaster: (entry) => {
      if (!activeContextId || !entry || typeof entry.id !== "string") {
        return null;
      }
      return notebookDocumentLibraryStore.loadDocumentRaster(activeContextId, entry.id);
    },
    canvasElement: canvas,
  });

  updateReferenceManagerUi();
  syncReferenceManagerPlacement();
}

function wireWidgetInteractionManager() {
  if (widgetInteractionManager) {
    return;
  }

  widgetInteractionManager = createWidgetInteractionManager({
    runtime,
    canvas,
    onWidgetPreviewMutated: () => updateWidgetUi({ deferHeavy: true }),
    onWidgetCommitMutated: () => updateWidgetUi({ coalesceHeavy: true }),
    onWidgetUndocked: () => triggerWidgetHaptic("soft"),
    onWidgetDragStateChange: (payload) => {
      handleWidgetDragStateForLibrary(payload);
    },
    onWidgetTap: ({ widget }) => {
      if (!widget || widget.type !== "pdf-document" || !widget.loadError) {
        return;
      }
      void openPdfPickerForExistingWidget(widget).catch((error) => {
        console.error(error);
      });
    },
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
    getActiveContextId: () => workspaceScopeId(),
    onCreateIntent: (intent) => {
      void executeCreationIntent(intent).catch((error) => {
        console.error(error);
        void showNoticeDialog(`Widget creation failed: ${formatErrorMessage(error)}`, {
          title: "Widget Creation",
        });
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

function wireWidgetRemovalSuggestionSync() {
  if (detachWidgetRemovalSuggestionSync) {
    return;
  }

  detachWidgetRemovalSuggestionSync = runtime.registerWidgetRemovedListener((payload) => {
    if (payload?.widget?.id && inkFeature && typeof inkFeature.removeStrokesForWidget === "function") {
      inkFeature.removeStrokesForWidget(payload.widget.id, {
        contextId: workspaceScopeId(),
      });
    }
    restoreSuggestionForRemovedWidget(payload);
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
  contextWorkspaceStore = contextWorkspaceModule.createContextWorkspaceStore({
    assetManagerOptions: {
      allowLocalStoragePayloadFallback: false,
    },
    allowInlinePdfBase64Fallback: false,
  });
  if (typeof contextWorkspaceStore.prepare === "function") {
    await contextWorkspaceStore.prepare();
  }
  activeContextId = contextStore.getActiveContextId();
  sectionsStore.ensureNotebook(activeContextId);
  activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
  documentManager.setContextId(workspaceScopeId());

  workspacePersistenceController = createWorkspacePersistenceController({
    contextWorkspaceStore,
    contextStore,
    runtime,
    documentManager,
    suggestionStore,
    getScopeId: () => workspaceScopeId(),
    getActiveSectionId: () => activeSectionId,
    getResearchCaptures: () => researchCaptures,
    getLastPdfWidgetId: () => lastPdfWidgetId,
    getLastReferenceWidgetId: () => lastReferenceWidgetId,
    isRestoringContext: () => restoringContext,
    onBeforePersist: () => {
      pruneActiveDocuments();
      syncPdfDocumentMetadata();
    },
    onStoragePressure: () => {
      requestStorageCleanupNow();
      const usageLabel =
        lastStorageEstimate && lastStorageEstimate.hasQuota
          ? `${formatMegabytes(lastStorageEstimate.usage)} / ${formatMegabytes(lastStorageEstimate.quota)}`
          : "Unknown";
      void showNoticeDialog(
        `Storage is full. Recent PDF/widget changes may not persist until space is freed.\nCurrent usage: ${usageLabel}\nTip: delete unused library PDFs/snips, then retry.`,
        { title: "Storage" },
      );
    },
  });

  const createContextHandler = async () => {
    const name = await showTextPromptDialog({
      title: "Create Notebook",
      label: "Notebook name",
      defaultValue: "New Notebook",
      confirmLabel: "Create",
    });
    if (!name) {
      return;
    }

    flushWorkspacePersist();

    const created = contextStore.createContext(name, "notebook");
    if (!created) {
      await showNoticeDialog("Notebook name cannot be empty.", { title: "Notebook" });
      return;
    }

    activeContextId = created.id;
    sectionsStore.ensureNotebook(activeContextId);
    activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
    onboardingRuntimeSignals.searchOpened = false;
    onboardingRuntimeSignals.peekActivated = false;
    onboardingRuntimeSignals.gestureUsed = false;
    documentManager.setContextId(workspaceScopeId());
    updateContextUi();
    await restoreWorkspaceForActiveContext();
    updateOnboardingControlsUi();
    scheduleOnboardingRefresh(0);
  };

  const renameContextHandler = async (contextId = activeContextId) => {
    if (!contextStore || !contextId) {
      return;
    }

    const target = contextStore.getContextById(contextId);
    if (!target) {
      return;
    }

    const nextName = await showTextPromptDialog({
      title: "Rename Notebook",
      label: "Notebook name",
      defaultValue: target.name,
      confirmLabel: "Rename",
    });
    if (!nextName) {
      return;
    }

    const renamed = contextStore.renameContext(target.id, nextName);
    if (!renamed) {
      await showNoticeDialog("Notebook name cannot be empty.", { title: "Notebook" });
      return;
    }

    updateContextUi();
    scheduleWorkspacePersist();
  };

  const deleteContextHandler = async (contextId = activeContextId) => {
    if (!contextStore || !contextWorkspaceStore || !contextId) {
      return;
    }

    const target = contextStore.getContextById(contextId);
    if (!target) {
      return;
    }

    const confirmed = await showConfirmDialog({
      title: "Delete Notebook",
      message: `Delete notebook "${target.name}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    flushWorkspacePersist();
    const targetSections = sectionsStore.listSections(target.id);
    const deletingActiveContext = target.id === activeContextId;

    const result = contextStore.deleteContext(target.id);
    if (!result) {
      await showNoticeDialog("At least one notebook must remain.", { title: "Notebook" });
      return;
    }

    for (const section of targetSections) {
      contextWorkspaceStore.deleteWorkspace(workspaceScopeId(result.deletedContextId, section.id));
    }
    sectionsStore.deleteNotebook(result.deletedContextId);
    notebookLibraryStore.deleteNotebook(result.deletedContextId);
    notebookDocumentLibraryStore.deleteNotebook(result.deletedContextId);

    if (deletingActiveContext) {
      activeContextId = result.activeContextId;
      sectionsStore.ensureNotebook(activeContextId);
      activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
      onboardingRuntimeSignals.searchOpened = false;
      onboardingRuntimeSignals.peekActivated = false;
      onboardingRuntimeSignals.gestureUsed = false;
      documentManager.setContextId(workspaceScopeId());
      updateContextUi();
      await restoreWorkspaceForActiveContext();
      updateOnboardingControlsUi();
      scheduleOnboardingRefresh(0);
      return;
    }

    updateContextUi();
    scheduleWorkspacePersist();
  };

  const createSectionHandler = async () => {
    if (!activeContextId) {
      return;
    }

    const defaultName = `Section ${sectionsStore.listSections(activeContextId).length + 1}`;
    const name = await showTextPromptDialog({
      title: "Create Section",
      label: "Section name",
      defaultValue: defaultName,
      confirmLabel: "Create",
    });
    if (!name) {
      return;
    }

    flushWorkspacePersist();
    const created = sectionsStore.createSection(activeContextId, name);
    if (!created) {
      await showNoticeDialog("Section name cannot be empty.", { title: "Section" });
      return;
    }

    activeSectionId = created.id;
    onboardingRuntimeSignals.searchOpened = false;
    onboardingRuntimeSignals.peekActivated = false;
    onboardingRuntimeSignals.gestureUsed = false;
    documentManager.setContextId(workspaceScopeId());
    updateContextUi();
    await restoreWorkspaceForActiveContext();
    updateOnboardingControlsUi();
    scheduleOnboardingRefresh(0);
  };

  const renameSectionHandler = async (sectionId = activeSectionId) => {
    if (!activeContextId || !sectionId) {
      return;
    }

    const section = sectionsStore.listSections(activeContextId).find((entry) => entry.id === sectionId);
    if (!section) {
      return;
    }

    const nextName = await showTextPromptDialog({
      title: "Rename Section",
      label: "Section name",
      defaultValue: section.name,
      confirmLabel: "Rename",
    });
    if (!nextName) {
      return;
    }

    const renamed = sectionsStore.renameSection(activeContextId, section.id, nextName);
    if (!renamed) {
      await showNoticeDialog("Section name cannot be empty.", { title: "Section" });
      return;
    }

    updateContextUi();
  };

  const deleteSectionHandler = async (sectionId = activeSectionId) => {
    if (!activeContextId || !sectionId || !contextWorkspaceStore) {
      return;
    }

    const section = sectionsStore.listSections(activeContextId).find((entry) => entry.id === sectionId);
    if (!section) {
      return;
    }

    const confirmed = await showConfirmDialog({
      title: "Delete Section",
      message: `Delete section "${section.name}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    flushWorkspacePersist();
    const deletingActiveSection = section.id === activeSectionId;
    const result = sectionsStore.deleteSection(activeContextId, section.id);
    if (!result) {
      await showNoticeDialog("At least one section must remain.", { title: "Section" });
      return;
    }

    contextWorkspaceStore.deleteWorkspace(workspaceScopeId(activeContextId, result.deletedSectionId));
    if (deletingActiveSection) {
      activeSectionId = result.activeSectionId;
      onboardingRuntimeSignals.searchOpened = false;
      onboardingRuntimeSignals.peekActivated = false;
      onboardingRuntimeSignals.gestureUsed = false;
      documentManager.setContextId(workspaceScopeId());
      updateContextUi();
      await restoreWorkspaceForActiveContext();
      updateOnboardingControlsUi();
      scheduleOnboardingRefresh(0);
      return;
    }

    updateContextUi();
    scheduleWorkspacePersist();
  };

  const openContextActions = async (contextId) => {
    if (!contextStore) {
      return;
    }

    const target = contextStore.getContextById(contextId);
    if (!target) {
      return;
    }

    const action = await showActionDialog({
      title: `Notebook: ${target.name}`,
      message: "Choose an action.",
      actions: [
        { id: "rename", label: "Rename Notebook", variant: "primary" },
        { id: "delete", label: "Delete Notebook", variant: "danger" },
      ],
    });
    if (!action) {
      return;
    }

    if (action === "rename") {
      await renameContextHandler(target.id);
      return;
    }

    if (action === "delete") {
      await deleteContextHandler(target.id);
    }
  };

  const openSectionActions = async (sectionId) => {
    if (!activeContextId) {
      return;
    }

    const target = sectionsStore.listSections(activeContextId).find((entry) => entry.id === sectionId);
    if (!target) {
      return;
    }

    const action = await showActionDialog({
      title: `Section: ${target.name}`,
      message: "Choose an action.",
      actions: [
        { id: "rename", label: "Rename Section", variant: "primary" },
        { id: "delete", label: "Delete Section", variant: "danger" },
      ],
    });
    if (!action) {
      return;
    }

    if (action === "rename") {
      await renameSectionHandler(target.id);
      return;
    }

    if (action === "delete") {
      await deleteSectionHandler(target.id);
    }
  };

  contextUiController = contextUiModule.createContextManagementUi({
    selectElement: contextSelect,
    selectorContainerElement: contextPickerPill,
    selectorToggleElement: contextDropdownToggle,
    selectorLabelElement: contextDropdownLabel,
    selectorMenuElement: contextDropdownMenu,
    selectorListElement: contextDropdownList,
    activeContextOutput,
    newContextButton,
    importContextWidgetButton,
    onSwitchContext: (nextContextId) => {
      void switchContext(nextContextId);
    },
    onCreateContext: () => {
      void createContextHandler();
    },
    onOpenContextActions: (contextId) => {
      void openContextActions(contextId);
    },
    onImportContextWidgets: () => {
      void importWidgetsFromAnotherContext();
    },
  });

  sectionUiController = createSectionManagementUi({
    tabsElement: sectionTabs,
    activeSectionOutput,
    newSectionButton,
    onSwitchSection: (nextSectionId) => {
      void switchSection(nextSectionId);
    },
    onCreateSection: () => {
      void createSectionHandler();
    },
    onOpenSectionActions: (sectionId) => {
      void openSectionActions(sectionId);
    },
  });

  updateContextUi();
  await restoreWorkspaceForActiveContext();
}

async function bootstrap() {
  registerPwaServiceWorker();
  await prepareStorageBackends();

  uiModeState = loadUiModeState();
  setUiMode(uiModeState.mode, { persist: false });

  gesturePrefs = loadGesturePrefs();
  updateGestureUi();

  wireBaseEventHandlers();
  wireWidgetInteractionManager();
  wireWidgetCreationController();
  wireDocumentFocusSync();
  wireContextMenu();
  wireSuggestionUi();
  wireWidgetRemovalSuggestionSync();
  wireSectionMinimap();
  wireReferenceManagerUi();
  scheduleCanvasViewportSync();

  updateSnipUi({ armed: false, dragging: false });
  setWhitespaceState("idle");
  toolsPanelOpen = safeLocalStorageGetItem("notes-app.tools-panel.open") === "1";
  syncToolsUi();
  syncUiModeControls();
  scheduleStorageUsageRefresh({ delayMs: 0 });
  schedulePerfHudRefresh({ delayMs: 0 });
  renderSectionMinimap();
  updateInkUi({
    completedStrokes: 0,
    undoDepth: 0,
    redoDepth: 0,
    activePointers: 0,
    activeTool: "pen",
    enabled: false,
  });
  syncSearchIndexUi(0);

  await setupContextFeatures();
  try {
    await ensureInkFeature();
    setInkEnabled(true);
  } catch (error) {
    console.error(error);
    if (inkStateOutput) {
      inkStateOutput.textContent = "failed";
    }
  }
  try {
    await ensureGestureFeatures();
  } catch (error) {
    console.error(error);
    lastGestureStatus = {
      supported: false,
      enabled: false,
      lastGesture: "failed",
      lastBinding: "none",
    };
    updateGestureUi();
  }
  updateWidgetUi();
  updateOnboardingControlsUi();
  scheduleOnboardingRefresh(0);
}

void bootstrap();
