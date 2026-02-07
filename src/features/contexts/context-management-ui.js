const LONG_PRESS_MS = 520;
const MOVE_THRESHOLD_PX = 10;

export function createContextManagementUi({
  selectElement,
  selectorContainerElement,
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

  bind(newContextButton, "click", () => {
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
    onOpenContextActions?.(contextId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  });

  return {
    render(contexts, activeContextId) {
      activeContextIdState = activeContextId ?? null;
      if (!(selectElement instanceof HTMLSelectElement)) {
        if (activeContextOutput) {
          const active = contexts.find((entry) => entry.id === activeContextId);
          activeContextOutput.textContent = active ? active.name : "none";
        }
        return;
      }

      selectElement.innerHTML = "";
      for (const context of contexts) {
        const option = document.createElement("option");
        option.value = context.id;
        option.textContent = `${context.name} (${context.type})`;
        option.selected = context.id === activeContextId;
        selectElement.appendChild(option);
      }

      const active = contexts.find((entry) => entry.id === activeContextId);
      if (activeContextOutput) {
        activeContextOutput.textContent = active ? active.name : "none";
      }
    },

    setControlsDisabled(nextDisabled) {
      const disabled = Boolean(nextDisabled);
      const controls = [
        selectElement,
        newContextButton,
        selectorContainerElement,
        importContextWidgetButton,
      ];

      for (const control of controls) {
        if (control instanceof HTMLButtonElement || control instanceof HTMLSelectElement) {
          control.disabled = disabled;
        }
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
