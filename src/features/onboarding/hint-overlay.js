function setHidden(element, hidden) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.hidden = Boolean(hidden);
}

function setText(element, value) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.textContent = String(value ?? "");
}

export function createHintOverlay({
  rootElement,
  titleElement,
  bodyElement,
  progressElement,
  actionButton,
  dismissButton,
  toggleHintsButton,
  resetButton,
  onAction,
  onDismiss,
  onToggleHints,
  onReset,
} = {}) {
  let currentHintId = null;
  const listeners = [];
  const bind = (target, type, handler) => {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }
    target.addEventListener(type, handler);
    listeners.push(() => {
      target.removeEventListener(type, handler);
    });
  };

  const onActionClick = () => {
    if (!currentHintId) {
      return;
    }
    onAction?.(currentHintId);
  };

  const onDismissClick = () => {
    if (!currentHintId) {
      return;
    }
    onDismiss?.(currentHintId);
  };

  const onToggleHintsClick = () => {
    onToggleHints?.();
  };

  const onResetClick = () => {
    onReset?.();
  };

  bind(actionButton, "click", onActionClick);
  bind(dismissButton, "click", onDismissClick);
  bind(toggleHintsButton, "click", onToggleHintsClick);
  bind(resetButton, "click", onResetClick);

  return {
    show({
      hintId,
      title,
      body,
      actionLabel,
      progressText,
      hintsEnabled,
    }) {
      currentHintId = hintId;
      setHidden(rootElement, false);
      setText(titleElement, title);
      setText(bodyElement, body);
      setText(progressElement, progressText ?? "");
      if (actionButton instanceof HTMLButtonElement) {
        actionButton.textContent = actionLabel;
      }
      if (toggleHintsButton instanceof HTMLButtonElement) {
        toggleHintsButton.textContent = hintsEnabled ? "Disable Hints" : "Enable Hints";
      }
    },

    hide() {
      currentHintId = null;
      setHidden(rootElement, true);
    },

    setHintsEnabled(enabled) {
      if (toggleHintsButton instanceof HTMLButtonElement) {
        toggleHintsButton.textContent = enabled ? "Disable Hints" : "Enable Hints";
      }
    },

    dispose() {
      for (const cleanup of listeners.splice(0, listeners.length)) {
        cleanup();
      }
      currentHintId = null;
      setHidden(rootElement, true);
    },
  };
}
