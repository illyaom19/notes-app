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

function railLeftForWidget(runtime, widget) {
  const bounds =
    typeof widget.getInteractionBounds === "function"
      ? widget.getInteractionBounds()
      : widget.size;

  const worldX = widget.position.x + Math.max(1, bounds.width) + 14;
  const screen = runtime.camera.worldToScreen(worldX, widget.position.y);
  return clamp(screen.x, 8, window.innerWidth - 178);
}

function suggestionWorldY(widget, suggestion, fallbackIndex) {
  if (Number.isFinite(suggestion?.anchor?.y)) {
    return suggestion.anchor.y;
  }
  return widget.position.y + 52 + fallbackIndex * 26;
}

function desiredScreenTop(runtime, widget, suggestion, fallbackIndex) {
  const worldY = suggestionWorldY(widget, suggestion, fallbackIndex);
  const screen = runtime.camera.worldToScreen(widget.position.x, worldY);
  return clamp(screen.y - 12, 8, window.innerHeight - 40);
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
      rootElement.style.left = "0px";
      rootElement.style.top = "0px";

      const railLeft = railLeftForWidget(runtime, focusedWidget);
      const entries = [
        ...proposed.slice(0, 6).map((suggestion, index) => ({
          suggestion,
          chip: buildActiveChip(suggestion),
          rank: index,
          desiredTop: desiredScreenTop(runtime, focusedWidget, suggestion, index),
        })),
        ...ghosted.slice(0, 8).map((suggestion, index) => ({
          suggestion,
          chip: buildGhostChip(suggestion),
          rank: 100 + index,
          desiredTop: desiredScreenTop(runtime, focusedWidget, suggestion, 6 + index),
        })),
      ];

      entries.sort((a, b) => {
        if (a.desiredTop !== b.desiredTop) {
          return a.desiredTop - b.desiredTop;
        }
        return a.rank - b.rank;
      });

      let previousTop = -Infinity;
      for (const entry of entries) {
        const chip = entry.chip;
        chip.classList.add("suggestion-rail-item");
        let top = entry.desiredTop;
        if (Number.isFinite(previousTop)) {
          top = Math.max(top, previousTop + 34);
        }
        top = clamp(top, 8, window.innerHeight - 40);
        chip.style.left = `${railLeft}px`;
        chip.style.top = `${top}px`;
        previousTop = top;
        rootElement.append(chip);
      }
    },

    dispose() {
      rootElement.removeEventListener("click", onRootClick);
    },
  };
}
