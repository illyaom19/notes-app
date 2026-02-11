const LONG_PRESS_MS = 520;
const MOVE_THRESHOLD_PX = 10;

export function createContextManagementUi({
  selectElement,
  selectorContainerElement,
  selectorToggleElement,
  selectorLabelElement,
  selectorMenuElement,
  selectorListElement,
  activeContextOutput,
  newContextButton,
  importContextWidgetButton,
  onSwitchContext,
  onCreateContext,
  onOpenContextActions,
  onImportContextWidgets,
}) {
  const listeners = [];
  let activeContextIdState = null;
  let holdTimer = null;
  let holdState = null;
  let dropdownOpen = false;
  let suppressToggleClick = false;

  function bind(target, type, handler) {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  bind(selectElement, "change", (event) => {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    onSwitchContext?.(event.target.value);
  });

  function setDropdownOpen(nextOpen) {
    const next = Boolean(nextOpen);
    if (dropdownOpen === next) {
      return;
    }
    dropdownOpen = next;
    if (selectorMenuElement instanceof HTMLElement) {
      selectorMenuElement.hidden = !dropdownOpen;
    }
    if (selectorToggleElement instanceof HTMLButtonElement) {
      selectorToggleElement.setAttribute("aria-expanded", dropdownOpen ? "true" : "false");
    }
  }

  function closeDropdown() {
    setDropdownOpen(false);
  }

  bind(selectorToggleElement, "click", (event) => {
    if (!(selectorToggleElement instanceof HTMLButtonElement) || selectorToggleElement.disabled) {
      return;
    }
    if (suppressToggleClick) {
      suppressToggleClick = false;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDropdownOpen(!dropdownOpen);
  });

  bind(selectorListElement, "click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest("button[data-context-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const contextId = button.dataset.contextId;
    if (!contextId) {
      return;
    }
    closeDropdown();
    onSwitchContext?.(contextId);
  });

  bind(window, "pointerdown", (event) => {
    if (!dropdownOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (selectorContainerElement instanceof HTMLElement && selectorContainerElement.contains(target)) {
      return;
    }
    closeDropdown();
  });

  bind(window, "keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") {
      return;
    }
    closeDropdown();
  });

  bind(newContextButton, "click", () => {
    closeDropdown();
    onCreateContext?.();
  });

  bind(importContextWidgetButton, "click", () => {
    onImportContextWidgets?.();
  });

  function clearHoldState() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    holdState = null;
  }

  function currentContextId() {
    if (selectElement instanceof HTMLSelectElement && typeof selectElement.value === "string" && selectElement.value.trim()) {
      return selectElement.value;
    }
    return activeContextIdState;
  }

  bind(selectorContainerElement, "pointerdown", (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (event.pointerType !== "touch" || event.button !== 0) {
      return;
    }

    holdState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      const contextId = currentContextId();
      if (!contextId || !holdState) {
        return;
      }
      onOpenContextActions?.(contextId, {
        clientX: holdState.clientX,
        clientY: holdState.clientY,
      });
      suppressToggleClick = true;
      closeDropdown();
      clearHoldState();
    }, LONG_PRESS_MS);
  });

  bind(selectorContainerElement, "pointermove", (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (!holdState || holdState.pointerId !== event.pointerId) {
      return;
    }

    holdState.clientX = event.clientX;
    holdState.clientY = event.clientY;

    const moved = Math.hypot(event.clientX - holdState.startX, event.clientY - holdState.startY);
    if (moved >= MOVE_THRESHOLD_PX) {
      clearHoldState();
    }
  });

  bind(window, "pointerup", (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (!holdState || holdState.pointerId !== event.pointerId) {
      return;
    }
    clearHoldState();
  });

  bind(window, "pointercancel", (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (!holdState || holdState.pointerId !== event.pointerId) {
      return;
    }
    clearHoldState();
  });

  bind(selectorContainerElement, "contextmenu", (event) => {
    const contextId = currentContextId();
    if (!contextId) {
      return;
    }
    event.preventDefault();
    suppressToggleClick = true;
    closeDropdown();
    onOpenContextActions?.(contextId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  });

  return {
    render(contexts, activeContextId) {
      const safeContexts = Array.isArray(contexts) ? contexts : [];
      activeContextIdState = activeContextId ?? null;

      if (selectElement instanceof HTMLSelectElement) {
        selectElement.innerHTML = "";
        for (const context of safeContexts) {
          const option = document.createElement("option");
          option.value = context.id;
          option.textContent = `${context.name} (${context.type})`;
          option.selected = context.id === activeContextId;
          selectElement.appendChild(option);
        }
      }

      if (selectorListElement instanceof HTMLElement) {
        selectorListElement.innerHTML = "";
        for (const context of safeContexts) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.contextId = context.id;
          button.dataset.active = context.id === activeContextId ? "true" : "false";
          button.textContent = `${context.name} (${context.type})`;
          selectorListElement.appendChild(button);
        }
      }

      const active = safeContexts.find((entry) => entry.id === activeContextId);
      if (selectorLabelElement instanceof HTMLElement) {
        selectorLabelElement.textContent = active ? active.name : "none";
      }
      if (activeContextOutput) {
        activeContextOutput.textContent = active ? active.name : "none";
      }
    },

    setControlsDisabled(nextDisabled) {
      const disabled = Boolean(nextDisabled);
      const controls = [
        selectElement,
        selectorToggleElement,
        newContextButton,
        selectorContainerElement,
        importContextWidgetButton,
      ];

      for (const control of controls) {
        if (control instanceof HTMLButtonElement || control instanceof HTMLSelectElement) {
          control.disabled = disabled;
        }
      }
      if (disabled) {
        closeDropdown();
      }
    },

    dispose() {
      for (const cleanup of listeners) {
        cleanup();
      }
      listeners.length = 0;
    },
  };
}
