function setText(element, value) {
  if (element instanceof HTMLElement) {
    element.textContent = value;
  }
}

function suggestionKindLabel(kind) {
  if (kind === "expanded-area") {
    return "Space";
  }
  if (kind === "reference-popup") {
    return "Reference";
  }
  return "Suggestion";
}

function renderSuggestionRow(suggestion, { ghost = false } = {}) {
  const row = document.createElement("article");
  row.className = "suggestion-row";
  row.dataset.suggestionId = suggestion.id;
  row.dataset.kind = suggestion.kind;

  const title = document.createElement("p");
  title.className = "suggestion-row-title";
  title.textContent = suggestion.label;

  const meta = document.createElement("p");
  meta.className = "suggestion-row-meta";
  meta.textContent = suggestionKindLabel(suggestion.kind);

  const actions = document.createElement("div");
  actions.className = "suggestion-row-actions";

  const focusButton = document.createElement("button");
  focusButton.type = "button";
  focusButton.dataset.action = "focus";
  focusButton.dataset.suggestionId = suggestion.id;
  focusButton.textContent = "Locate";
  actions.append(focusButton);

  if (!ghost) {
    const acceptButton = document.createElement("button");
    acceptButton.type = "button";
    acceptButton.dataset.action = "accept";
    acceptButton.dataset.suggestionId = suggestion.id;
    acceptButton.textContent = "Accept";

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.dataset.action = "dismiss";
    dismissButton.dataset.suggestionId = suggestion.id;
    dismissButton.textContent = "Ghost";

    actions.append(acceptButton, dismissButton);
  } else {
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.dataset.action = "restore";
    restoreButton.dataset.suggestionId = suggestion.id;
    restoreButton.textContent = "Restore";

    const discardButton = document.createElement("button");
    discardButton.type = "button";
    discardButton.dataset.action = "discard";
    discardButton.dataset.suggestionId = suggestion.id;
    discardButton.textContent = "Discard";

    actions.append(restoreButton, discardButton);
  }

  row.append(title, meta, actions);
  return row;
}

export function createSuggestionUiController({
  rootElement,
  proposedListElement,
  ghostListElement,
  activeCountElement,
  ghostCountElement,
  emptyStateElement,
  refreshButton,
  onAccept,
  onDismiss,
  onRestore,
  onDiscard,
  onFocus,
  onRefresh,
}) {
  if (!(rootElement instanceof HTMLElement)) {
    return {
      render: () => {},
      dispose: () => {},
    };
  }

  let suggestionsById = new Map();

  const handleAction = async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-action][data-suggestion-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const suggestionId = button.dataset.suggestionId;
    if (!suggestionId) {
      return;
    }

    const suggestion = suggestionsById.get(suggestionId) ?? null;
    if (!suggestion) {
      return;
    }

    const action = button.dataset.action;
    if (action === "accept") {
      await onAccept?.(suggestion);
      return;
    }

    if (action === "dismiss") {
      await onDismiss?.(suggestion);
      return;
    }

    if (action === "restore") {
      await onRestore?.(suggestion);
      return;
    }

    if (action === "discard") {
      await onDiscard?.(suggestion);
      return;
    }

    if (action === "focus") {
      onFocus?.(suggestion);
    }
  };

  const handleRefresh = () => {
    onRefresh?.();
  };

  rootElement.addEventListener("click", (event) => {
    void handleAction(event);
  });
  refreshButton?.addEventListener("click", handleRefresh);

  return {
    render({ proposed = [], ghosted = [] } = {}) {
      suggestionsById = new Map();
      for (const entry of [...proposed, ...ghosted]) {
        if (entry && typeof entry.id === "string") {
          suggestionsById.set(entry.id, entry);
        }
      }

      if (proposedListElement instanceof HTMLElement) {
        proposedListElement.innerHTML = "";
        for (const entry of proposed) {
          proposedListElement.append(renderSuggestionRow(entry));
        }
      }

      if (ghostListElement instanceof HTMLElement) {
        ghostListElement.innerHTML = "";
        for (const entry of ghosted) {
          ghostListElement.append(renderSuggestionRow(entry, { ghost: true }));
        }
      }

      setText(activeCountElement, String(proposed.length));
      setText(ghostCountElement, String(ghosted.length));

      const hasAny = proposed.length > 0 || ghosted.length > 0;
      if (emptyStateElement instanceof HTMLElement) {
        emptyStateElement.hidden = hasAny;
      }

      rootElement.dataset.hasSuggestions = hasAny ? "true" : "false";
    },

    dispose() {
      refreshButton?.removeEventListener("click", handleRefresh);
    },
  };
}
