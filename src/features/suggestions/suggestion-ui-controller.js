function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const RAIL_TOP_MIN = 8;
const RAIL_BOTTOM_RESERVED = 40;
const RAIL_STACK_GAP = 42;

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
  const row = document.createElement("article");
  row.className = "suggestion-card suggestion-card--active";

  const focusButton = document.createElement("button");
  focusButton.type = "button";
  focusButton.className = "suggestion-card-label";
  focusButton.dataset.action = "focus";
  focusButton.dataset.suggestionId = suggestion.id;
  focusButton.textContent = compactLabel(suggestion);

  const actions = document.createElement("div");
  actions.className = "suggestion-card-actions";

  const acceptButton = document.createElement("button");
  acceptButton.type = "button";
  acceptButton.className = "suggestion-card-action suggestion-card-action--accept";
  acceptButton.dataset.action = "accept";
  acceptButton.dataset.suggestionId = suggestion.id;
  acceptButton.textContent = "✓";

  const ghostButton = document.createElement("button");
  ghostButton.type = "button";
  ghostButton.className = "suggestion-card-action suggestion-card-action--ghost";
  ghostButton.dataset.action = "ghost";
  ghostButton.dataset.suggestionId = suggestion.id;
  ghostButton.textContent = "✕";

  actions.append(acceptButton, ghostButton);
  row.append(focusButton, actions);
  return row;
}

function buildGhostChip(suggestion) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "suggestion-card suggestion-card--ghost";
  button.dataset.action = "restore";
  button.dataset.suggestionId = suggestion.id;

  const dot = document.createElement("span");
  dot.className = "suggestion-card-ghost-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = "•";

  const label = document.createElement("span");
  label.className = "suggestion-card-ghost-label";
  label.textContent = compactLabel(suggestion);

  button.append(dot, label);
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

      rootElement.hidden = false;
      rootElement.dataset.open = "true";
      rootElement.innerHTML = "";

      const railLeft = railLeftForWidget(runtime, focusedWidget);
      const maxTop = Math.max(RAIL_TOP_MIN, window.innerHeight - RAIL_BOTTOM_RESERVED);
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

      const maxVisible = Math.max(1, Math.floor((maxTop - RAIL_TOP_MIN) / RAIL_STACK_GAP) + 1);
      const visibleEntries = entries.slice(0, maxVisible);

      visibleEntries.sort((a, b) => {
        if (a.desiredTop !== b.desiredTop) {
          return a.desiredTop - b.desiredTop;
        }
        return a.rank - b.rank;
      });

      const topPositions = [];
      let previousTop = -Infinity;
      for (const entry of visibleEntries) {
        let top = entry.desiredTop;
        if (Number.isFinite(previousTop)) {
          top = Math.max(top, previousTop + RAIL_STACK_GAP);
        }
        topPositions.push(top);
        previousTop = top;
      }

      const lastIndex = topPositions.length - 1;
      if (lastIndex >= 0) {
        const overflow = topPositions[lastIndex] - maxTop;
        if (overflow > 0) {
          for (let index = 0; index < topPositions.length; index += 1) {
            topPositions[index] = Math.max(RAIL_TOP_MIN, topPositions[index] - overflow);
          }
        }
      }

      for (let index = 1; index < topPositions.length; index += 1) {
        topPositions[index] = Math.max(topPositions[index], topPositions[index - 1] + RAIL_STACK_GAP);
      }

      if (lastIndex >= 0 && topPositions[lastIndex] > maxTop) {
        for (let index = lastIndex; index >= 0; index -= 1) {
          const capped = maxTop - (lastIndex - index) * RAIL_STACK_GAP;
          topPositions[index] = Math.min(topPositions[index], capped);
        }
      }

      for (let index = 0; index < visibleEntries.length; index += 1) {
        const entry = visibleEntries[index];
        const chip = entry.chip;
        chip.classList.add("suggestion-rail-item");
        chip.style.left = `${railLeft}px`;
        chip.style.top = `${clamp(topPositions[index], RAIL_TOP_MIN, maxTop)}px`;
        rootElement.append(chip);
      }
    },

    dispose() {
      rootElement.removeEventListener("click", onRootClick);
    },
  };
}
