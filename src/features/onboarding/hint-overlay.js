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

  actionButton?.addEventListener("click", () => {
    if (!currentHintId) {
      return;
    }
    onAction?.(currentHintId);
  });

  dismissButton?.addEventListener("click", () => {
    if (!currentHintId) {
      return;
    }
    onDismiss?.(currentHintId);
  });

  toggleHintsButton?.addEventListener("click", () => {
    onToggleHints?.();
  });

  resetButton?.addEventListener("click", () => {
    onReset?.();
  });

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
  };
}

