const DEFAULT_PREFS = Object.freeze({
  enabled: true,
  gestures: {
    doubleTap: false,
    barrelTap: true,
  },
  bindings: {
    doubleTap: "none",
    barrelTap: "toggle-ink-tool",
  },
  thresholds: {
    doubleTapMs: 430,
    tapMaxMovePx: 12,
    tapMaxDurationMs: 220,
  },
});

const GESTURE_BINDINGS = new Set([
  "none",
  "toggle-ink-tool",
  "toggle-ink-enabled",
  "toggle-search-panel",
]);

function toSafeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function toSafeNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeBinding(value, fallback) {
  if (typeof value === "string" && GESTURE_BINDINGS.has(value)) {
    return value;
  }
  return fallback;
}

export function normalizeGesturePrefs(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const gestures = source.gestures && typeof source.gestures === "object" ? source.gestures : {};
  const bindings = source.bindings && typeof source.bindings === "object" ? source.bindings : {};
  const thresholds = source.thresholds && typeof source.thresholds === "object" ? source.thresholds : {};

  return {
    enabled: toSafeBoolean(source.enabled, DEFAULT_PREFS.enabled),
    gestures: {
      doubleTap: toSafeBoolean(gestures.doubleTap, DEFAULT_PREFS.gestures.doubleTap),
      barrelTap: toSafeBoolean(gestures.barrelTap, DEFAULT_PREFS.gestures.barrelTap),
    },
    bindings: {
      doubleTap: normalizeBinding(bindings.doubleTap, DEFAULT_PREFS.bindings.doubleTap),
      barrelTap: normalizeBinding(bindings.barrelTap, DEFAULT_PREFS.bindings.barrelTap),
    },
    thresholds: {
      doubleTapMs: toSafeNumber(
        thresholds.doubleTapMs,
        DEFAULT_PREFS.thresholds.doubleTapMs,
        180,
        900,
      ),
      tapMaxMovePx: toSafeNumber(
        thresholds.tapMaxMovePx,
        DEFAULT_PREFS.thresholds.tapMaxMovePx,
        4,
        30,
      ),
      tapMaxDurationMs: toSafeNumber(
        thresholds.tapMaxDurationMs,
        DEFAULT_PREFS.thresholds.tapMaxDurationMs,
        80,
        420,
      ),
    },
  };
}

function supportsPenGestures() {
  return typeof window !== "undefined" && typeof window.PointerEvent === "function";
}

function pointForEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function isBarrelSignal(event) {
  if (event.button !== 0) {
    return true;
  }

  // Pen barrel/eraser buttons can surface as extra bitmasks on some devices.
  if ((event.buttons & 0b10) !== 0 || (event.buttons & 0b100000) !== 0) {
    return true;
  }

  // Galaxy Tab S7+/Samsung Internet can surface barrel taps as a normal tip
  // press with zero pressure. Treat that as barrel intent as well.
  if (event.pointerType === "pen" && event.buttons === 1) {
    const pressure = Number.isFinite(event.pressure) ? event.pressure : null;
    if (pressure !== null && pressure <= 0) {
      return true;
    }
  }

  return false;
}

export function createPenGestureController({ canvas, getPrefs, onAction, onStatusChange }) {
  if (!(canvas instanceof HTMLElement) || !supportsPenGestures()) {
    onStatusChange?.({ supported: false, lastGesture: "unsupported" });
    return {
      dispose: () => {},
      getSupportInfo: () => ({ supported: false }),
    };
  }

  const pointerState = new Map();
  const swallowedPointers = new Set();
  let lastTap = null;

  const emitStatus = (next = {}) => {
    const prefs = normalizeGesturePrefs(getPrefs?.());
    onStatusChange?.({
      supported: true,
      enabled: prefs.enabled,
      lastGesture: next.lastGesture ?? "idle",
      lastBinding: next.lastBinding ?? "none",
      timestamp: Date.now(),
    });
  };

  const invokeGesture = (gestureName, event) => {
    const prefs = normalizeGesturePrefs(getPrefs?.());
    if (!prefs.enabled) {
      return false;
    }

    if (gestureName === "doubleTap" && !prefs.gestures.doubleTap) {
      return false;
    }

    if (gestureName === "barrelTap" && !prefs.gestures.barrelTap) {
      return false;
    }

    const binding = prefs.bindings[gestureName] ?? "none";
    if (binding === "none") {
      emitStatus({ lastGesture: gestureName, lastBinding: "none" });
      return false;
    }

    onAction?.(binding, {
      gesture: gestureName,
      pointerType: event.pointerType,
    });

    emitStatus({ lastGesture: gestureName, lastBinding: binding });
    return true;
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== "pen") {
      return;
    }

    const prefs = normalizeGesturePrefs(getPrefs?.());
    if (!prefs.enabled) {
      return;
    }

    const point = pointForEvent(event, canvas);
    pointerState.set(event.pointerId, {
      downAt: Date.now(),
      start: point,
      last: point,
      moved: false,
    });

    if (isBarrelSignal(event)) {
      if (invokeGesture("barrelTap", event)) {
        swallowedPointers.add(event.pointerId);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    if (
      prefs.gestures.doubleTap &&
      lastTap &&
      Date.now() - lastTap.time <= prefs.thresholds.doubleTapMs &&
      distance(lastTap.point, point) <= prefs.thresholds.tapMaxMovePx * 2
    ) {
      if (invokeGesture("doubleTap", event)) {
        swallowedPointers.add(event.pointerId);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      lastTap = null;
    }
  };

  const onPointerMove = (event) => {
    const state = pointerState.get(event.pointerId);
    if (!state) {
      return;
    }

    const point = pointForEvent(event, canvas);
    state.last = point;
    if (distance(state.start, point) > 3) {
      state.moved = true;
    }

    if (swallowedPointers.has(event.pointerId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const finalizePointer = (event, cancelled = false) => {
    const state = pointerState.get(event.pointerId);
    pointerState.delete(event.pointerId);

    const wasSwallowed = swallowedPointers.has(event.pointerId);
    swallowedPointers.delete(event.pointerId);
    if (wasSwallowed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (cancelled || !state || event.pointerType !== "pen") {
      return;
    }

    const prefs = normalizeGesturePrefs(getPrefs?.());
    if (!prefs.enabled || !prefs.gestures.doubleTap) {
      return;
    }

    const duration = Date.now() - state.downAt;
    const movement = distance(state.start, state.last);
    if (duration <= prefs.thresholds.tapMaxDurationMs && movement <= prefs.thresholds.tapMaxMovePx) {
      lastTap = {
        time: Date.now(),
        point: state.last,
      };
    }
  };

  const onPointerUp = (event) => finalizePointer(event, false);
  const onPointerCancel = (event) => finalizePointer(event, true);

  canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onPointerMove, { capture: true });
  canvas.addEventListener("pointerup", onPointerUp, { capture: true });
  canvas.addEventListener("pointercancel", onPointerCancel, { capture: true });

  emitStatus({ lastGesture: "ready", lastBinding: "none" });

  return {
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.removeEventListener("pointermove", onPointerMove, { capture: true });
      canvas.removeEventListener("pointerup", onPointerUp, { capture: true });
      canvas.removeEventListener("pointercancel", onPointerCancel, { capture: true });
      pointerState.clear();
      swallowedPointers.clear();
      lastTap = null;
    },

    getSupportInfo() {
      return {
        supported: true,
      };
    },
  };
}
