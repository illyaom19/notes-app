export function createContextManagementUi({
  selectElement,
  activeContextOutput,
  newContextButton,
  renameContextButton,
  deleteContextButton,
  importContextWidgetButton,
  onSwitchContext,
  onCreateContext,
  onRenameContext,
  onDeleteContext,
  onImportContextWidgets,
}) {
  const listeners = [];

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

  bind(renameContextButton, "click", () => {
    onRenameContext?.();
  });

  bind(deleteContextButton, "click", () => {
    onDeleteContext?.();
  });

  bind(importContextWidgetButton, "click", () => {
    onImportContextWidgets?.();
  });

  return {
    render(contexts, activeContextId) {
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
        renameContextButton,
        deleteContextButton,
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
