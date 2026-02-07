const KEY = "notes-app.gesture.prefs.v1";

function defaults() {
  return {
    enabled: true,
    doubleTapPenAction: "toggle-peek",
  };
}

export function createGestureManager({ onAction } = {}) {
  let prefs = defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      prefs = { ...prefs, ...(JSON.parse(raw) ?? {}) };
    }
  } catch (_error) {
    prefs = defaults();
  }

  let lastPenTapAt = 0;

  function save() {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  }

  function handlePointerDown(event) {
    if (!prefs.enabled || event.pointerType !== "pen") {
      return false;
    }

    const now = performance.now();
    const elapsed = now - lastPenTapAt;
    lastPenTapAt = now;

    if (elapsed > 40 && elapsed < 280 && prefs.doubleTapPenAction && typeof onAction === "function") {
      onAction(prefs.doubleTapPenAction);
    }

    return false;
  }

  return {
    getPrefs: () => ({ ...prefs }),
    setPrefs(nextPrefs) {
      prefs = { ...prefs, ...(nextPrefs ?? {}) };
      save();
    },
    handlePointerDown,
  };
}
