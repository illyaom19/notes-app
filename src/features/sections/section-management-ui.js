export function createSectionManagementUi({
  tabsElement,
  switchElement,
  activeSectionOutput,
  newSectionButton,
  renameSectionButton,
  deleteSectionButton,
  onSwitchSection,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
}) {
  const listeners = [];

  function bind(target, type, handler) {
    if (!target) {
      return;
    }

    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  bind(switchElement, "change", (event) => {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }

    if (!event.target.value) {
      return;
    }

    onSwitchSection?.(event.target.value);
  });

  bind(newSectionButton, "click", () => {
    onCreateSection?.();
  });

  bind(renameSectionButton, "click", () => {
    onRenameSection?.();
  });

  bind(deleteSectionButton, "click", () => {
    onDeleteSection?.();
  });

  bind(tabsElement, "click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-section-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const sectionId = button.dataset.sectionId;
    if (!sectionId) {
      return;
    }

    onSwitchSection?.(sectionId);
  });

  return {
    render(sections, activeSectionId) {
      const safeSections = Array.isArray(sections) ? sections : [];

      if (tabsElement instanceof HTMLElement) {
        tabsElement.innerHTML = "";
        for (const section of safeSections) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "section-tab";
          button.dataset.sectionId = section.id;
          button.dataset.active = section.id === activeSectionId ? "true" : "false";
          button.textContent = section.name;
          tabsElement.append(button);
        }
      }

      if (switchElement instanceof HTMLSelectElement) {
        switchElement.innerHTML = "";

        if (safeSections.length < 1) {
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "No sections";
          switchElement.append(placeholder);
        } else {
          for (const section of safeSections) {
            const option = document.createElement("option");
            option.value = section.id;
            option.textContent = section.name;
            option.selected = section.id === activeSectionId;
            switchElement.append(option);
          }
        }

        switchElement.disabled = safeSections.length < 1;
      }

      if (activeSectionOutput instanceof HTMLElement) {
        const active = safeSections.find((entry) => entry.id === activeSectionId);
        activeSectionOutput.textContent = active ? active.name : "none";
      }
    },

    setControlsDisabled(nextDisabled) {
      const disabled = Boolean(nextDisabled);
      const controls = [switchElement, newSectionButton, renameSectionButton, deleteSectionButton];
      for (const control of controls) {
        if (control instanceof HTMLSelectElement || control instanceof HTMLButtonElement) {
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
