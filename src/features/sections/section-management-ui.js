const LONG_PRESS_MS = 520;
const MOVE_THRESHOLD_PX = 10;

export function createSectionManagementUi({
  tabsElement,
  activeSectionOutput,
  newSectionButton,
  onSwitchSection,
  onCreateSection,
  onOpenSectionActions,
}) {
  const listeners = [];
  let holdTimer = null;
  let holdState = null;
  let suppressedSectionId = null;

  function bind(target, type, handler) {
    if (!target) {
      return;
    }

    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  bind(newSectionButton, "click", () => {
    onCreateSection?.();
  });

  function clearHoldState() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    holdState = null;
  }

  function resolveSectionButton(target) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    const button = target.closest("button[data-section-id]");
    return button instanceof HTMLButtonElement ? button : null;
  }

  bind(tabsElement, "pointerdown", (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (event.pointerType !== "touch" || event.button !== 0) {
      return;
    }

    const button = resolveSectionButton(event.target);
    if (!button) {
      return;
    }

    holdState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sectionId: button.dataset.sectionId ?? null,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      if (!holdState || !holdState.sectionId) {
        return;
      }
      suppressedSectionId = holdState.sectionId;
      onOpenSectionActions?.(holdState.sectionId, {
        clientX: holdState.clientX,
        clientY: holdState.clientY,
      });
      clearHoldState();
    }, LONG_PRESS_MS);
  });

  bind(tabsElement, "pointermove", (event) => {
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

  bind(tabsElement, "contextmenu", (event) => {
    const button = resolveSectionButton(event.target);
    if (!button) {
      return;
    }

    const sectionId = button.dataset.sectionId;
    if (!sectionId) {
      return;
    }

    event.preventDefault();
    suppressedSectionId = sectionId;
    onOpenSectionActions?.(sectionId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
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

    if (suppressedSectionId && suppressedSectionId === sectionId) {
      suppressedSectionId = null;
      return;
    }

    onSwitchSection?.(sectionId);
  });

  bind(tabsElement, "keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !(tabsElement instanceof HTMLElement)) {
      return;
    }

    const buttons = Array.from(tabsElement.querySelectorAll("button[data-section-id]"))
      .filter((entry) => entry instanceof HTMLButtonElement);
    if (buttons.length < 1) {
      return;
    }

    const activeElement = document.activeElement;
    const currentIndex = buttons.findIndex((entry) => entry === activeElement);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex = currentIndex;
    const key = event.key;
    if (key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (key === "Home") {
      nextIndex = 0;
    } else if (key === "End") {
      nextIndex = buttons.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const target = buttons[nextIndex];
    target.focus();
    const sectionId = target.dataset.sectionId;
    if (sectionId) {
      onSwitchSection?.(sectionId);
    }
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
          button.setAttribute("role", "tab");
          button.setAttribute("aria-selected", section.id === activeSectionId ? "true" : "false");
          button.setAttribute("tabindex", section.id === activeSectionId ? "0" : "-1");
          button.textContent = section.name;
          tabsElement.append(button);
        }
      }

      if (activeSectionOutput instanceof HTMLElement) {
        const active = safeSections.find((entry) => entry.id === activeSectionId);
        activeSectionOutput.textContent = active ? active.name : "none";
      }
    },

    setControlsDisabled(nextDisabled) {
      const disabled = Boolean(nextDisabled);
      const controls = [newSectionButton];
      for (const control of controls) {
        if (control instanceof HTMLButtonElement) {
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
