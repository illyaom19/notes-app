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
import { createWidgetContextMenu } from "./features/widget-system/long-press-menu.js";
import { createWidgetCreationController } from "./features/widget-system/widget-creation-controller.js";
import { createWidgetInteractionManager } from "./features/widget-system/widget-interaction-manager.js";

const importPdfButton = document.querySelector("#import-pdf");
const toggleToolsButton = document.querySelector("#toggle-tools");
const controlsPanel = document.querySelector("#controls-panel");
const detectWhitespaceButton = document.querySelector("#detect-whitespace");
const startSnipButton = document.querySelector("#start-snip");
const toggleResearchPanelButton = document.querySelector("#toggle-research-panel");
const toggleSearchPanelButton = document.querySelector("#toggle-search-panel");
const holdPeekModeButton = document.querySelector("#hold-peek-mode");
const instantiateButton = document.querySelector("#instantiate-dummy");
const instantiateExpandedButton = document.querySelector("#instantiate-expanded");
const instantiateGraphButton = document.querySelector("#instantiate-graph");
const enableInkButton = document.querySelector("#enable-ink");
const toggleInkToolButton = document.querySelector("#toggle-ink-tool");
const undoInkButton = document.querySelector("#undo-ink");
const redoInkButton = document.querySelector("#redo-ink");
const startWorkerButton = document.querySelector("#start-worker");
const loadedModulesOutput = document.querySelector("#loaded-modules");
const widgetCountOutput = document.querySelector("#widget-count");
const referenceCountOutput = document.querySelector("#reference-count");
const popupBehaviorOutput = document.querySelector("#popup-behavior-state");
const snipStateOutput = document.querySelector("#snip-state");
const whitespaceStateOutput = document.querySelector("#whitespace-state");
const peekStateOutput = document.querySelector("#peek-state");
const whitespaceZoneCountOutput = document.querySelector("#whitespace-zone-count");
const graphCountOutput = document.querySelector("#graph-count");
const activeContextOutput = document.querySelector("#active-context");
const documentCountOutput = document.querySelector("#document-count");
const inkStateOutput = document.querySelector("#ink-state");
const inkToolOutput = document.querySelector("#ink-tool");
const strokeCountOutput = document.querySelector("#stroke-count");
const gestureStateOutput = document.querySelector("#gesture-state");
const searchIndexCountOutput = document.querySelector("#search-index-count");
const cameraOutput = document.querySelector("#camera-state");
const workerStateOutput = document.querySelector("#worker-state");
const canvas = document.querySelector("#workspace-canvas");
const widgetContextMenu = document.querySelector("#widget-context-menu");
const creationCommandMenu = document.querySelector("#creation-command-menu");
const pdfFileInput = document.querySelector("#pdf-file-input");
const researchPanel = document.querySelector("#research-panel");
const searchPanel = document.querySelector("#search-panel");
const documentTabs = document.querySelector("#document-tabs");
const documentSwitcher = document.querySelector("#document-switcher");
const documentSettingsHint = document.querySelector("#document-settings-hint");
const referenceBindingSelect = document.querySelector("#document-reference-bindings");
const formulaBindingSelect = document.querySelector("#document-formula-bindings");
const applyBindingsButton = document.querySelector("#apply-document-bindings");
const focusBindingsButton = document.querySelector("#focus-document-bindings");
const togglePinDocumentButton = document.querySelector("#toggle-pin-document");
const popupAvoidStylusToggle = document.querySelector("#popup-avoid-stylus");
const popupReducedMotionToggle = document.querySelector("#popup-reduced-motion");
const gestureEnabledToggle = document.querySelector("#gesture-enabled");
const gestureDoubleTapToggle = document.querySelector("#gesture-doubletap-enabled");
const gestureBarrelTapToggle = document.querySelector("#gesture-barreltap-enabled");
const gestureDoubleTapBindingSelect = document.querySelector("#gesture-doubletap-binding");
const gestureBarrelTapBindingSelect = document.querySelector("#gesture-barreltap-binding");
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
let researchPanelController = null;
let searchIndex = null;
let searchPanelController = null;
let penGestureController = null;
let widgetInteractionManager = null;
let widgetCreationController = null;
let detachDocumentFocusSync = null;
let toolsPanelOpen = false;
let pendingPdfImportIntent = null;
let debugModeEnabled = false;
const POPUP_BEHAVIOR_PREFS_KEY = "notes-app.popup.behavior.v1";
const GESTURE_PREFS_KEY = "notes-app.gesture-prefs.v1";
const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
let popupBehaviorPrefs = null;
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
  enabled: false,
};
let peekModeActive = false;
let peekModeHoldKeyboard = false;
let peekModeHoldPointer = false;

let contextStore = null;
let contextWorkspaceStore = null;
let contextUiController = null;

let activeContextId = null;
const documentManager = createDocumentManager();
let lastPdfWidgetId = null;
let lastReferenceWidgetId = null;
let lastDocumentUiRenderKey = "";
let researchCaptures = [];

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
  onViewModeChange: ({ mode }) => {
    peekModeActive = mode === "peek";
    if (peekStateOutput) {
      peekStateOutput.textContent = peekModeActive ? "on (LOD)" : "off";
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

function systemPrefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_MEDIA).matches;
}

function normalizePopupBehaviorPrefs(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return {
    avoidStylus: source.avoidStylus !== false,
    motionReduced: source.motionReduced === true,
  };
}

function defaultPopupBehaviorPrefs() {
  return {
    avoidStylus: true,
    motionReduced: systemPrefersReducedMotion(),
  };
}

function loadPopupBehaviorPrefs() {
  const fallback = defaultPopupBehaviorPrefs();

  try {
    const raw = window.localStorage.getItem(POPUP_BEHAVIOR_PREFS_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return normalizePopupBehaviorPrefs({ ...fallback, ...(parsed ?? {}) });
  } catch (_error) {
    return fallback;
  }
}

function savePopupBehaviorPrefs(prefs) {
  window.localStorage.setItem(POPUP_BEHAVIOR_PREFS_KEY, JSON.stringify(normalizePopupBehaviorPrefs(prefs)));
}

function updatePopupBehaviorUi() {
  const prefs = normalizePopupBehaviorPrefs(popupBehaviorPrefs);
  const systemReduced = systemPrefersReducedMotion();
  const effectiveMotionReduced = prefs.motionReduced || systemReduced;

  if (popupAvoidStylusToggle instanceof HTMLInputElement) {
    popupAvoidStylusToggle.checked = prefs.avoidStylus;
  }

  if (popupReducedMotionToggle instanceof HTMLInputElement) {
    popupReducedMotionToggle.checked = effectiveMotionReduced;
    popupReducedMotionToggle.disabled = systemReduced;
    popupReducedMotionToggle.title = systemReduced
      ? "System reduced-motion preference is active."
      : "";
  }

  if (popupBehaviorOutput) {
    popupBehaviorOutput.textContent = `avoid:${prefs.avoidStylus ? "on" : "off"} motion:${effectiveMotionReduced ? "reduced" : "normal"}`;
  }
}

function setPopupBehaviorPrefs(nextPrefs) {
  popupBehaviorPrefs = normalizePopupBehaviorPrefs(nextPrefs);
  savePopupBehaviorPrefs(popupBehaviorPrefs);
  updatePopupBehaviorUi();
}

function updateCameraOutputFromState() {
  if (!cameraOutput) {
    return;
  }

  const worldAtCenter = runtime.camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
  cameraOutput.textContent = `x=${worldAtCenter.x.toFixed(1)}, y=${worldAtCenter.y.toFixed(1)}, zoom=${runtime.camera.zoom.toFixed(2)}`;
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
      value === "toggle-search-panel"
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
  window.localStorage.setItem(GESTURE_PREFS_KEY, JSON.stringify(normalizeGesturePrefs(prefs)));
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

function setPeekMode(nextEnabled, source = "manual") {
  const wantsPeek = Boolean(nextEnabled);
  if (wantsPeek && inkStateSnapshot.activePointers > 0) {
    if (peekStateOutput) {
      peekStateOutput.textContent = "blocked (ink-active)";
    }
    return false;
  }

  runtime.setViewMode(wantsPeek ? "peek" : "interactive");
  peekModeActive = runtime.isPeekMode();
  if (peekStateOutput) {
    peekStateOutput.textContent = peekModeActive ? `on (LOD/${source})` : "off";
  }
  if (holdPeekModeButton instanceof HTMLButtonElement) {
    holdPeekModeButton.textContent = peekModeActive ? "Release Peek" : "Hold Peek";
  }
  return peekModeActive;
}

function updatePeekModeFromHolds(source) {
  const shouldPeek = peekModeHoldKeyboard || peekModeHoldPointer;
  setPeekMode(shouldPeek, source);
}

function viewportCenterAnchor() {
  return runtime.camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
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
        : activeContextId ?? null,
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
  const activeTool = inkStateSnapshot.activeTool === "eraser" ? "eraser" : "pen";
  const enabled = inkStateSnapshot.enabled !== false;

  strokeCountOutput.textContent = String(completed);
  undoInkButton.disabled = undoDepth < 1;
  redoInkButton.disabled = redoDepth < 1;

  if (inkToolOutput) {
    inkToolOutput.textContent = activeTool;
  }

  if (toggleInkToolButton instanceof HTMLButtonElement) {
    toggleInkToolButton.disabled = !inkFeature;
    toggleInkToolButton.textContent = activeTool === "eraser" ? "Ink Tool: Eraser" : "Ink Tool: Pen";
  }

  if (activePointers > 0) {
    inkStateOutput.textContent = activeTool === "eraser" ? "erasing" : "writing";
    if (peekModeActive) {
      setPeekMode(false, "ink-active");
    }
    return;
  }

  inkStateOutput.textContent = inkFeature ? (enabled ? "active" : "paused") : "idle";
  if ((peekModeHoldKeyboard || peekModeHoldPointer) && !peekModeActive) {
    updatePeekModeFromHolds("hold");
  }
}

function currentInkTool() {
  if (!inkFeature || typeof inkFeature.getTool !== "function") {
    return "pen";
  }
  return inkFeature.getTool() === "eraser" ? "eraser" : "pen";
}

function syncSearchIndexUi(indexedCount = null) {
  if (!searchIndexCountOutput) {
    return;
  }

  const count =
    Number.isFinite(indexedCount) && indexedCount >= 0
      ? indexedCount
      : searchIndex
        ? searchIndex.getEntryCount(activeContextId)
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
    researchCaptures,
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
  syncReferencePopupMetadata();
  updateDocumentSwitcherUi();

  updateWhitespaceZoneCount();
  updateContextUi();
  if (searchIndex && activeContextId) {
    searchIndex.scheduleReindex({
      runtime,
      contextId: activeContextId,
    });
  } else {
    syncSearchIndexUi(0);
  }
  scheduleWorkspacePersist();
}

function setContextControlsBusy(nextBusy) {
  if (!contextUiController) {
    return;
  }
  contextUiController.setControlsDisabled(nextBusy);
}

function centerCameraOnWidget(widget) {
  if (!widget) {
    return;
  }

  const bounds =
    typeof widget.getInteractionBounds === "function"
      ? widget.getInteractionBounds()
      : { width: widget.size.width, height: widget.size.height };
  const centerX = widget.position.x + Math.max(1, bounds.width) / 2;
  const centerY = widget.position.y + Math.max(1, bounds.height) / 2;

  runtime.camera.offsetX = canvas.clientWidth / 2 - centerX * runtime.camera.zoom;
  runtime.camera.offsetY = canvas.clientHeight / 2 - centerY * runtime.camera.zoom;
  updateCameraOutputFromState();
}

async function jumpToSearchResult(result) {
  if (!result || typeof result.widgetId !== "string" || !result.widgetId.trim()) {
    return false;
  }

  if (
    typeof result.contextId === "string" &&
    result.contextId.trim() &&
    result.contextId !== activeContextId
  ) {
    await switchContext(result.contextId);
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

  if (activeContextId) {
    searchIndex.reindexNow({ runtime, contextId: activeContextId });
  }

  searchPanelController = panelModule.createSearchPanelController({
    panelElement: searchPanel,
    toggleButton: toggleSearchPanelButton,
    onQuery: async (query) => {
      if (!searchIndex) {
        return { results: [], indexedCount: 0 };
      }

      if (activeContextId) {
        searchIndex.reindexNow({ runtime, contextId: activeContextId });
      }

      const contextLabel = activeContextRecord()?.name ?? "Current Context";
      const results = searchIndex
        .query(query, { contextId: activeContextId, limit: 140 })
        .map((entry) => ({
          ...entry,
          contextLabel,
        }));

      return {
        results,
        indexedCount: searchIndex.getEntryCount(activeContextId),
      };
    },
    onActivateResult: async (result) => {
      await jumpToSearchResult(result);
    },
    onNavigateResult: async (result) => {
      await jumpToSearchResult(result);
    },
  });

  syncSearchIndexUi(searchIndex.getEntryCount(activeContextId));
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
    getActiveContextId: () => activeContextId,
    onStateChange: (state) => updateInkUi(state),
  });

  updateInkUi({
    activeTool: currentInkTool(),
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

  const nextTool = feature.toggleTool();
  updateInkUi({
    activeTool: nextTool,
    enabled: feature.isEnabled?.() !== false,
  });

  return nextTool;
}

async function executeGestureAction(actionName) {
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
    getBehaviorPrefs: () => ({
      ...popupBehaviorPrefs,
      motionReduced:
        normalizePopupBehaviorPrefs(popupBehaviorPrefs).motionReduced || systemPrefersReducedMotion(),
    }),
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
    getActiveContextId: () => activeContextId,
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
  return widget;
}

async function createDummyWidget(definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const placement = resolvePlacementForCreation({
    type: "dummy",
    intent: normalizedIntent,
    requestedSize: definition.size,
    fallbackPlacement: defaultPlacement(-150, -90, 40, 30),
  });
  const finalPosition = definition.position ?? placement.position;
  const finalPlacement = { ...placement, position: finalPosition };
  const widget = await registry.instantiate("dummy", {
    id: definition.id ?? makeId("dummy"),
    position: finalPosition,
    size: placement.size,
    metadata: withCreationProvenance(
      definition.metadata,
      normalizedIntent,
      finalPlacement,
      "dummy",
    ),
    collapsed: definition.collapsed,
  });
  runtime.addWidget(widget);
  updateWidgetUi();
  return widget;
}

async function createPdfWidgetFromFile(file, definition = {}, intent = null) {
  const normalizedIntent = normalizeCreationIntent(intent);
  const placement = resolvePlacementForCreation({
    type: "pdf-document",
    intent: normalizedIntent,
    requestedSize: definition.size,
    fallbackPlacement: defaultPlacement(-180, -120, 36, 30),
  });
  const finalPosition = definition.position ?? placement.position;
  const finalPlacement = { ...placement, position: finalPosition };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const widget = await registry.instantiate("pdf-document", {
    id: definition.id ?? makeId("pdf"),
    position: finalPosition,
    size: placement.size,
    metadata: withCreationProvenance({
      title: definition.metadata?.title ?? file.name,
      ...(definition.metadata ?? {}),
    }, normalizedIntent, finalPlacement, "pdf-document"),
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

  return createReferencePopupWidget({
    intent: normalizedIntent,
    definition: {
      size: {
        width: Math.round(normalizedSnipSize.width),
        height: Math.round(normalizedSnipSize.height),
      },
      metadata: {
        title: "Reference",
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
  const placement = resolvePlacementForCreation({
    type: "graph-widget",
    intent: normalizedIntent,
    requestedSize: definition.size,
    fallbackPlacement: defaultPlacement(-100, -40, 14, 12),
  });
  const finalPosition = definition.position ?? placement.position;
  const finalPlacement = { ...placement, position: finalPosition };

  const widget = await registry.instantiate("graph-widget", {
    id: definition.id ?? makeId("graph"),
    position: finalPosition,
    size: placement.size,
    metadata: withCreationProvenance(
      definition.metadata,
      normalizedIntent,
      finalPlacement,
      "graph-widget",
    ),
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
    researchCaptures = [];
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
    researchCaptures = Array.isArray(workspace.researchCaptures)
      ? workspace.researchCaptures.map((entry) => normalizeResearchCapture(entry)).filter((entry) => entry !== null)
      : [];
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
        contextId: activeContextId,
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
    const activeDocument = documentManager.getActiveDocument();
    if (activeDocument) {
      focusDocumentWidgets(activeDocument.id, { selectPrimary: true });
    }
    if (searchIndex && activeContextId) {
      searchIndex.reindexNow({ runtime, contextId: activeContextId });
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
  if (searchPanelController && typeof searchPanelController.runQuery === "function") {
    void searchPanelController.runQuery();
  }
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
            contextId: activeContextId,
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
        contextId: activeContextId,
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

  window.alert(`Imported ${importedWidgets.length} widget(s) from "${sourceContext.name}".`);
}

function wireBaseEventHandlers() {
  const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_MEDIA);
  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", () => updatePopupBehaviorUi());
  }

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

  const beginPeekHold = () => {
    peekModeHoldPointer = true;
    updatePeekModeFromHolds("button");
  };
  const endPeekHold = () => {
    peekModeHoldPointer = false;
    updatePeekModeFromHolds("button");
  };

  holdPeekModeButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    holdPeekModeButton.setPointerCapture(event.pointerId);
    beginPeekHold();
  });
  holdPeekModeButton?.addEventListener("pointerup", (event) => {
    event.preventDefault();
    if (holdPeekModeButton.hasPointerCapture(event.pointerId)) {
      holdPeekModeButton.releasePointerCapture(event.pointerId);
    }
    endPeekHold();
  });
  holdPeekModeButton?.addEventListener("pointercancel", (event) => {
    event.preventDefault();
    if (holdPeekModeButton.hasPointerCapture(event.pointerId)) {
      holdPeekModeButton.releasePointerCapture(event.pointerId);
    }
    endPeekHold();
  });
  holdPeekModeButton?.addEventListener("pointerleave", () => {
    endPeekHold();
  });

  toggleResearchPanelButton?.addEventListener("click", async () => {
    toggleResearchPanelButton.disabled = true;
    try {
      const panel = await ensureResearchPanel();
      panel.toggle();
    } catch (error) {
      console.error(error);
      window.alert(`Research panel failed: ${error.message}`);
    } finally {
      toggleResearchPanelButton.disabled = false;
    }
  });

  toggleSearchPanelButton?.addEventListener("click", async () => {
    toggleSearchPanelButton.disabled = true;
    try {
      const panel = await ensureSearchFeatures();
      panel.toggle();
    } catch (error) {
      console.error(error);
      window.alert(`Search panel failed: ${error.message}`);
    } finally {
      toggleSearchPanelButton.disabled = false;
    }
  });

  popupAvoidStylusToggle?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    setPopupBehaviorPrefs({
      ...popupBehaviorPrefs,
      avoidStylus: target.checked,
    });
  });

  popupReducedMotionToggle?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    setPopupBehaviorPrefs({
      ...popupBehaviorPrefs,
      motionReduced: target.checked,
    });
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
      window.alert(`Ink initialization failed: ${error.message}`);
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
    if ((key === " " || key === "spacebar") && !isTypingTarget(event.target)) {
      if (!event.repeat) {
        peekModeHoldKeyboard = true;
        updatePeekModeFromHolds("space");
      }
      event.preventDefault();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === "f") {
      event.preventDefault();
      event.stopImmediatePropagation();
      void ensureSearchFeatures()
        .then((panel) => {
          panel.open();
        })
        .catch((error) => {
          console.error(error);
          window.alert(`Search panel failed: ${error.message}`);
        });
      return;
    }

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

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === " " || key === "spacebar") {
      peekModeHoldKeyboard = false;
      updatePeekModeFromHolds("space");
      event.preventDefault();
    }
  });

  window.addEventListener("blur", () => {
    peekModeHoldKeyboard = false;
    peekModeHoldPointer = false;
    updatePeekModeFromHolds("blur");
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
  popupBehaviorPrefs = loadPopupBehaviorPrefs();
  updatePopupBehaviorUi();
  gesturePrefs = loadGesturePrefs();
  updateGestureUi();

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
  setPeekMode(false, "boot");
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
}

void bootstrap();
