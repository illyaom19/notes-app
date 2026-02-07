function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compactLabel(suggestion) {
  const base = typeof suggestion?.label === "string" ? suggestion.label.trim() : "";
  if (!base) {
    return "Suggestion";
  }
  return base.length > 36 ? `${base.slice(0, 33)}...` : base;
}

function railPositionForWidget(runtime, widget) {
  const bounds =
    typeof widget.getInteractionBounds === "function"
      ? widget.getInteractionBounds()
      : widget.size;

  const worldX = widget.position.x + Math.max(1, bounds.width) + 14;
  const worldY = widget.position.y + 52;
  const screen = runtime.camera.worldToScreen(worldX, worldY);

  return {
    left: clamp(screen.x, 8, window.innerWidth - 178),
    top: clamp(screen.y, 8, window.innerHeight - 150),
  };
}

function buildActiveChip(suggestion) {
  const row = document.createElement("div");
  row.className = "suggestion-chip suggestion-chip--active";

  const focusButton = document.createElement("button");
  focusButton.type = "button";
  focusButton.className = "suggestion-chip-label";
  focusButton.dataset.action = "focus";
  focusButton.dataset.suggestionId = suggestion.id;
  focusButton.textContent = compactLabel(suggestion);

  const acceptButton = document.createElement("button");
  acceptButton.type = "button";
  acceptButton.className = "suggestion-chip-action suggestion-chip-action--accept";
  acceptButton.dataset.action = "accept";
  acceptButton.dataset.suggestionId = suggestion.id;
  acceptButton.textContent = "✓";

  const ghostButton = document.createElement("button");
  ghostButton.type = "button";
  ghostButton.className = "suggestion-chip-action suggestion-chip-action--ghost";
  ghostButton.dataset.action = "ghost";
  ghostButton.dataset.suggestionId = suggestion.id;
  ghostButton.textContent = "✕";

  row.append(focusButton, acceptButton, ghostButton);
  return row;
}

function buildGhostChip(suggestion) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "suggestion-chip suggestion-chip--ghost";
  button.dataset.action = "restore";
  button.dataset.suggestionId = suggestion.id;
  button.textContent = `○ ${compactLabel(suggestion)}`;
  return button;
}

export function createSuggestionUiController({
  rootElement,
  runtime,
  onAccept,
  onGhost,
  onRestore,
  onFocus,
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

    const button = target.closest("[data-action][data-suggestion-id]");
    if (!(button instanceof HTMLElement)) {
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

    if (action === "ghost") {
      await onGhost?.(suggestion);
      return;
    }

    if (action === "restore") {
      await onRestore?.(suggestion);
      return;
    }

    if (action === "focus") {
      onFocus?.(suggestion);
    }
  };

  const onRootClick = (event) => {
    void handleAction(event);
  };
  rootElement.addEventListener("click", onRootClick);

  return {
    render({ focusedPdfWidgetId = null, proposed = [], ghosted = [] } = {}) {
      suggestionsById = new Map();
      for (const entry of [...proposed, ...ghosted]) {
        if (entry && typeof entry.id === "string") {
          suggestionsById.set(entry.id, entry);
        }
      }

      const hasAny = proposed.length > 0 || ghosted.length > 0;
      const focusedWidget =
        typeof focusedPdfWidgetId === "string" && focusedPdfWidgetId.trim()
          ? runtime.getWidgetById(focusedPdfWidgetId)
          : null;

      if (!hasAny || !focusedWidget || focusedWidget.type !== "pdf-document") {
        rootElement.hidden = true;
        rootElement.dataset.open = "false";
        rootElement.innerHTML = "";
        return;
      }

      const position = railPositionForWidget(runtime, focusedWidget);
      rootElement.style.left = `${position.left}px`;
      rootElement.style.top = `${position.top}px`;
      rootElement.hidden = false;
      rootElement.dataset.open = "true";
      rootElement.innerHTML = "";

      const stack = document.createElement("div");
      stack.className = "suggestion-rail-stack";

      for (const suggestion of proposed.slice(0, 6)) {
        stack.append(buildActiveChip(suggestion));
      }
      for (const suggestion of ghosted.slice(0, 8)) {
        stack.append(buildGhostChip(suggestion));
      }

      rootElement.append(stack);
    },

    dispose() {
      rootElement.removeEventListener("click", onRootClick);
    },
  };
}
