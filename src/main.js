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
import { createNotebookSectionsStore } from "./features/sections/notebook-sections-store.js";
import { createNotebookLibraryStore } from "./features/notebooks/notebook-library-store.js";
import { createNotebookDocumentLibraryStore } from "./features/notebooks/notebook-document-library-store.js";
import { createSectionManagementUi } from "./features/sections/section-management-ui.js";
import { createSuggestionStore } from "./features/suggestions/suggestion-store.js";
import { createSuggestionEngine } from "./features/suggestions/suggestion-engine.js";
import { createSuggestionUiController } from "./features/suggestions/suggestion-ui-controller.js";
import { createReferenceManagerUi } from "./features/references/reference-manager-ui.js";
import { ALLOWED_CREATION_INTENT_TYPES } from "./features/widget-system/widget-types.js";

const toggleUiModeButton = document.querySelector("#toggle-ui-mode");
const toggleToolsButton = document.querySelector("#toggle-tools");
const controlsPanel = document.querySelector("#controls-panel");
const statusPanel = document.querySelector(".status-panel");
const toggleResearchPanelButton = document.querySelector("#toggle-research-panel");
const toggleSearchPanelButton = document.querySelector("#toggle-search-panel");
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
const canvas = document.querySelector("#workspace-canvas");
const widgetContextMenu = document.querySelector("#widget-context-menu");
const creationCommandMenu = document.querySelector("#creation-command-menu");
const pdfFileInput = document.querySelector("#pdf-file-input");
const researchPanel = document.querySelector("#research-panel");
const searchPanel = document.querySelector("#search-panel");
const suggestionRail = document.querySelector("#suggestion-rail");
const referenceManagerLauncher = document.querySelector("#reference-manager-launcher");
const referenceManagerOverlay = document.querySelector("#reference-manager-overlay");
const referenceManagerPanel = document.querySelector("#reference-manager-panel");
const referenceManagerCloseButton = document.querySelector("#reference-manager-close");
const referenceManagerTabReferences = document.querySelector("#reference-manager-tab-references");
const referenceManagerTabDocuments = document.querySelector("#reference-manager-tab-documents");
const referenceManagerReferenceList = document.querySelector("#reference-manager-reference-list");
const referenceManagerDocumentList = document.querySelector("#reference-manager-document-list");
const referenceManagerReferenceCount = document.querySelector("#reference-manager-reference-count");
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
const popupAvoidStylusToggle = document.querySelector("#popup-avoid-stylus");
const popupReducedMotionToggle = document.querySelector("#popup-reduced-motion");
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

const loadedModules = new Set();
let inkFeature = null;
let popupInteractions = null;
let snipTool = null;
let whitespaceManager = null;
let researchPanelController = null;
let searchIndex = null;
let searchPanelController = null;
let penGestureController = null;
let widgetInteractionManager = null;
let widgetCreationController = null;
let detachDocumentFocusSync = null;
let toolsPanelOpen = false;
let pendingPdfImportIntent = null;
let uiModeState = { mode: "production" };
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

let contextStore = null;
let contextWorkspaceStore = null;
let contextUiController = null;
let sectionUiController = null;
let sectionsStore = createNotebookSectionsStore();
const notebookLibraryStore = createNotebookLibraryStore();
const notebookDocumentLibraryStore = createNotebookDocumentLibraryStore();
const suggestionStore = createSuggestionStore();
const suggestionEngine = createSuggestionEngine();
let suggestionUiController = null;
let referenceManagerUiController = null;
let suggestionAnalysisTimer = null;
let suggestionAnalysisInFlight = false;
let suggestionAnalysisQueued = false;

let activeContextId = null;
let activeSectionId = null;
const documentManager = createDocumentManager();
let lastPdfWidgetId = null;
let lastReferenceWidgetId = null;
let lastDocumentUiRenderKey = "";
let researchCaptures = [];

let restoringContext = false;
let persistTimer = null;
let hasShownWorkspaceStorageWarning = false;
let onboardingStateService = createOnboardingStateService();
let onboardingOverlay = null;
let onboardingRefreshTimer = null;
let onboardingHintVisibleId = null;
const failedLocalStorageKeys = new Set();
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
    renderSuggestionRail();
  },
  onViewModeChange: ({ mode }) => {
    peekModeActive = mode === "peek";
    if (peekStateOutput) {
      peekStateOutput.textContent = peekModeActive ? "on (LOD)" : "off";
    }
    if (peekModeActive) {
      onboardingRuntimeSignals.peekActivated = true;
      scheduleOnboardingRefresh(40);
    }
  },
  onSelectionChange: () => {
    renderSuggestionRail();
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
  safeLocalStorageSetItem(
    POPUP_BEHAVIOR_PREFS_KEY,
    JSON.stringify(normalizePopupBehaviorPrefs(prefs)),
  );
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
  return peekModeActive;
}

function updatePeekModeFromHolds(source) {
  const shouldPeek = peekModeHoldKeyboard;
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
  if (peekModeHoldKeyboard && !peekModeActive) {
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
    toggleToolsButton.textContent = toolsPanelOpen ? "Close Menu" : "Menu";
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

      documentManager.setDocumentSourceState(entry.id, {
        sourceDocumentId: source.id,
        linkStatus: "linked",
        sourceSnapshot: nextSnapshot,
        title: nextTitle,
        sourceType: nextSourceType,
      });

      const widget = runtime.getWidgetById(entry.widgetId);
      if (widget?.type === "pdf-document") {
        widget.metadata = {
          ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
          title: nextTitle,
          sourceDocumentId: source.id,
        };
      }
      changed = true;
      continue;
    }

    if (entry.linkStatus === "linked" && !sourceIsActive) {
      const frozenSnapshot = {
        title: source?.title ?? entry.sourceSnapshot?.title ?? entry.title,
        sourceType: source?.sourceType ?? entry.sourceSnapshot?.sourceType ?? entry.sourceType,
      };
      documentManager.setDocumentSourceState(entry.id, {
        sourceDocumentId: null,
        linkStatus: "frozen",
        sourceSnapshot: frozenSnapshot,
        title: frozenSnapshot.title,
        sourceType: frozenSnapshot.sourceType,
      });

      const widget = runtime.getWidgetById(entry.widgetId);
      if (widget?.type === "pdf-document") {
        widget.metadata = {
          ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
          title: frozenSnapshot.title,
          sourceDocumentId: null,
        };
      }
      changed = true;
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

  if (widget.type === "pdf-document" && widget.pdfBytes instanceof Uint8Array) {
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
      bytes: widget.pdfBytes,
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

  if (widget.type === "expanded-area") {
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
      : widget.type === "reference-popup"
        ? "Reference"
        : "Notes";
  const size = `${Math.round(widget.size.width)} x ${Math.round(widget.size.height)}`;

  const details = [`${kind}`, `Title: ${title}`, `Size: ${size}`];

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

    if (!(widget.pdfBytes instanceof Uint8Array)) {
      return false;
    }

    const source = notebookDocumentLibraryStore.upsertDocument(activeContextId, {
      title: widget.metadata?.title ?? widget.fileName ?? "Document",
      sourceType: "pdf",
      fileName: widget.fileName ?? "document.pdf",
      pdfBytes: widget.pdfBytes,
      status: "active",
      tags: ["pdf"],
    });
    if (!source) {
      return false;
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
    updateWidgetUi();
    return true;
  }

  return false;
}

function syncLinkedLibraryMetadata() {
  if (!activeContextId) {
    return;
  }

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

    widget.metadata = {
      ...(widget.metadata && typeof widget.metadata === "object" ? widget.metadata : {}),
      title: source.title,
      librarySourceId: source.id,
      popupMetadata: {
        ...source.popupMetadata,
        title: source.title,
      },
    };
    widget.sourceLabel = source.sourceLabel;
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
  return createReferencePopupWidget({
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
      },
    },
  });
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

function renderSuggestionRail() {
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

function updateReferenceManagerUi() {
  if (!referenceManagerUiController || !activeContextId) {
    return;
  }

  referenceManagerUiController.render({
    references: notebookLibraryStore.listReferences(activeContextId),
    documents: notebookDocumentLibraryStore.listDocuments(activeContextId),
  });
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
  const scopeId = workspaceScopeId();
  if (!contextWorkspaceStore || !contextStore || !scopeId || restoringContext) {
    return false;
  }

  pruneActiveDocuments();
  syncPdfDocumentMetadata();
  const persisted = documentManager.toPersistencePayload();

  const saved = contextWorkspaceStore.saveFromRuntime({
    contextId: scopeId,
    runtime,
    researchCaptures,
    suggestions: suggestionStore.toPersistencePayload({
      scopeId,
      sectionId: activeSectionId,
    }),
    documents: persisted.documents,
    documentBindings: persisted.documentBindings,
    activeDocumentId: persisted.activeDocumentId,
    lastPdfWidgetId,
    lastReferenceWidgetId,
  });
  if (saved) {
    hasShownWorkspaceStorageWarning = false;
    contextStore.touchActiveContext();
    return true;
  }

  if (!hasShownWorkspaceStorageWarning) {
    hasShownWorkspaceStorageWarning = true;
    void showNoticeDialog("Storage is full. Recent PDF/widget changes may not persist until space is freed.", {
      title: "Storage",
    });
  }
  return false;
}

function flushWorkspacePersist() {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  return persistActiveWorkspace();
}

function scheduleWorkspacePersist() {
  if (!contextWorkspaceStore || !contextStore || !workspaceScopeId() || restoringContext) {
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

  pruneActiveDocuments();
  syncPdfDocumentMetadata();
  syncReferencePopupMetadata();
  syncLinkedLibraryMetadata();
  applyPopupAutoDocking();
  updateDocumentSwitcherUi();

  updateWhitespaceZoneCount();
  updateContextUi();
  updateReferenceManagerUi();
  renderSuggestionRail();
  if (searchIndex && workspaceScopeId()) {
    searchIndex.scheduleReindex({
      runtime,
      contextId: workspaceScopeId(),
    });
  } else {
    syncSearchIndexUi(0);
  }
  updateOnboardingControlsUi();
  scheduleOnboardingRefresh(120);
  scheduleSuggestionAnalysis();
  scheduleWorkspacePersist();
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
      ? widget.getInteractionBounds()
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
  fileName,
  definition = {},
  intent = null,
  sourceDocument = null,
  linkStatus = "frozen",
} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    throw new Error("PDF bytes are unavailable.");
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
      bytes,
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
  let sourceDocument = null;

  if (activeContextId) {
    const candidate = {
      title:
        typeof definition.metadata?.title === "string" && definition.metadata.title.trim()
          ? definition.metadata.title.trim()
          : file.name,
      sourceType: "pdf",
      fileName: file.name,
      pdfBytes: bytes,
      status: "active",
      tags: ["pdf"],
    };
    if (typeof sourceDocumentId === "string" && sourceDocumentId.trim()) {
      candidate.id = sourceDocumentId.trim();
    }
    sourceDocument = notebookDocumentLibraryStore.upsertDocument(activeContextId, candidate);
    if (!sourceDocument) {
      throw new Error("Storage is full. Unable to store this PDF in the notebook library.");
    }
  }

  const widget = await createPdfWidgetFromBytes({
    bytes,
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

  const bytes = activeContextId
    ? notebookDocumentLibraryStore.loadDocumentBytes(activeContextId, sourceDocument.id)
    : decodeBase64ToBytes(sourceDocument.bytesBase64);
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    await showNoticeDialog(`Notebook document "${sourceDocument.title}" is missing PDF bytes.`, {
      title: "PDF Import",
    });
    return null;
  }

  const widget = await createPdfWidgetFromBytes({
    bytes,
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

  return widget;
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
  } else if (zone.linkedWidgetId) {
    runtime.removeWidgetById(zone.linkedWidgetId);
    pdfWidget.setWhitespaceZoneLinkedWidget(zone.id, null);
    updateWidgetUi();
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
  const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_MEDIA);
  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", () => updatePopupBehaviorUi());
  }

  let lastTouchLikeInteractionAt = 0;
  const markTouchLikeInteraction = () => {
    lastTouchLikeInteractionAt = Date.now();
  };

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        markTouchLikeInteraction();
      }
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "touchstart",
    () => {
      markTouchLikeInteraction();
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "contextmenu",
    (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isTypingTarget(target)) {
        return;
      }

      const isMouseSecondaryAction = event.button === 2 || event.which === 3;
      const fromTouchInput =
        event.pointerType === "touch" ||
        event.pointerType === "pen" ||
        Boolean(event.sourceCapabilities?.firesTouchEvents);
      const isRecentTouch = Date.now() - lastTouchLikeInteractionAt < 700;
      if (isMouseSecondaryAction && !fromTouchInput) {
        return;
      }
      if (!fromTouchInput && !isRecentTouch) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );
  document.addEventListener(
    "selectstart",
    (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isTypingTarget(target)) {
        return;
      }
      event.preventDefault();
    },
    { capture: true },
  );

  const closeToolsMenu = () => {
    if (!toolsPanelOpen) {
      return;
    }
    toolsPanelOpen = false;
    safeLocalStorageSetItem("notes-app.tools-panel.open", "0");
    syncToolsUi();
  };

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

  window.addEventListener("pointerdown", (event) => {
    if (!toolsPanelOpen) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (
      (controlsPanel instanceof HTMLElement && controlsPanel.contains(target)) ||
      (toggleToolsButton instanceof HTMLElement && toggleToolsButton.contains(target))
    ) {
      return;
    }

    closeToolsMenu();
  });
  window.addEventListener("resize", () => {
    if (toolsPanelOpen) {
      syncToolsUi();
    }
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
      const fallbackIntent = createCreationIntent({
        type: "pdf-document",
        anchor: viewportCenterAnchor(),
        sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
        createdFrom: "manual",
      });
      const pending = pendingPdfImportIntent;
      await createPdfWidgetFromFile(
        file,
        {},
        pending?.intent ?? fallbackIntent,
        {
          linkStatus: pending?.linkStatus ?? "linked",
          sourceDocumentId: pending?.sourceDocumentId ?? null,
        },
      );
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
    updatePeekModeFromHolds("blur");
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
    }
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
    onShowWidgetInfo: async (widget) => {
      await showNoticeDialog(formatWidgetInfo(widget), { title: "Widget Info" });
    },
    onWidgetMutated: () => updateWidgetUi(),
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
    documentsTabButton: referenceManagerTabDocuments,
    referencesListElement: referenceManagerReferenceList,
    documentsListElement: referenceManagerDocumentList,
    referencesCountElement: referenceManagerReferenceCount,
    documentsCountElement: referenceManagerDocumentCount,
    previewLayerElement: referencePreviewLayer,
    onImportReference: async (entry, { linkStatus = "linked" } = {}) => {
      await createReferencePopupFromLibraryEntry(entry, {
        linkStatus,
        intent: createCreationIntent({
          type: "reference-popup",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      });
      updateWidgetUi();
    },
    onImportDocument: async (entry, { linkStatus = "linked" } = {}) => {
      await createPdfWidgetFromLibraryEntry(entry, {
        linkStatus,
        intent: createCreationIntent({
          type: "pdf-document",
          anchor: viewportCenterAnchor(),
          sourceWidgetId: runtime.getFocusedWidgetId() ?? runtime.getSelectedWidgetId() ?? null,
          createdFrom: "manual",
        }),
      });
      updateWidgetUi();
    },
    onRenameReference: async (entry) => {
      await renameNotebookReferenceFromManager(entry);
    },
    onDeleteReference: async (entry) => {
      await deleteNotebookReferenceFromManager(entry);
    },
    onRenameDocument: async (entry) => {
      await renameNotebookDocumentFromManager(entry);
    },
    onDeleteDocument: async (entry) => {
      await deleteNotebookDocumentFromManager(entry);
    },
  });

  updateReferenceManagerUi();
}

function wireWidgetInteractionManager() {
  if (widgetInteractionManager) {
    return;
  }

  widgetInteractionManager = createWidgetInteractionManager({
    runtime,
    canvas,
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
  sectionsStore.ensureNotebook(activeContextId);
  activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
  documentManager.setContextId(workspaceScopeId());

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
  uiModeState = loadUiModeState();
  setUiMode(uiModeState.mode, { persist: false });

  popupBehaviorPrefs = loadPopupBehaviorPrefs();
  updatePopupBehaviorUi();
  gesturePrefs = loadGesturePrefs();
  updateGestureUi();

  wireBaseEventHandlers();
  wireWidgetInteractionManager();
  wireWidgetCreationController();
  wireDocumentFocusSync();
  wireContextMenu();
  wireSuggestionUi();
  wireReferenceManagerUi();

  updateSnipUi({ armed: false, dragging: false });
  setWhitespaceState("idle");
  toolsPanelOpen = safeLocalStorageGetItem("notes-app.tools-panel.open") === "1";
  syncToolsUi();
  syncUiModeControls();
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
