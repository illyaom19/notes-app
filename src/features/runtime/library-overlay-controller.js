export function createLibraryOverlayController({
  runtime,
  documentObj = document,
  getViewportRect,
  pointerOverLibraryLauncher,
  setLibraryDropTargetState,
  showLibraryDropFeedback,
  addWidgetToLibraryFromDrag,
  animateWidgetBackToOrigin,
  onDeleteWidget,
  onAfterDropMutation,
  triggerDeleteHaptic,
  constants = {},
} = {}) {
  if (!runtime) {
    throw new Error("Library overlay controller requires a runtime.");
  }
  if (typeof getViewportRect !== "function") {
    throw new Error("Library overlay controller requires getViewportRect.");
  }
  if (typeof pointerOverLibraryLauncher !== "function") {
    throw new Error("Library overlay controller requires pointerOverLibraryLauncher.");
  }
  if (typeof addWidgetToLibraryFromDrag !== "function") {
    throw new Error("Library overlay controller requires addWidgetToLibraryFromDrag.");
  }
  if (typeof animateWidgetBackToOrigin !== "function") {
    throw new Error("Library overlay controller requires animateWidgetBackToOrigin.");
  }

  const TARGET_SIZE_PX = Math.max(1, Number(constants.trashTargetSizePx) || 56);
  const TARGET_MARGIN_PX = Math.max(0, Number(constants.trashTargetMarginPx) || 14);

  let dragState = null;
  let trashDropTarget = null;

  function ensureTrashDropTargetElement() {
    if (!(documentObj?.body instanceof HTMLElement)) {
      return false;
    }
    if (!(trashDropTarget instanceof HTMLButtonElement)) {
      trashDropTarget = documentObj.createElement("button");
      trashDropTarget.type = "button";
      trashDropTarget.className = "widget-trash-drop-target";
      trashDropTarget.hidden = true;
      trashDropTarget.tabIndex = -1;
      trashDropTarget.setAttribute("aria-hidden", "true");
      trashDropTarget.setAttribute("aria-label", "Drop widget to delete");
      trashDropTarget.textContent = "X";
      documentObj.body.append(trashDropTarget);
    }
    return true;
  }

  function syncLayout() {
    if (!ensureTrashDropTargetElement() || !(trashDropTarget instanceof HTMLElement)) {
      return;
    }
    const rect = getViewportRect();
    if (!rect) {
      return;
    }
    const x = rect.left + (rect.width - TARGET_SIZE_PX) * 0.5;
    const y = rect.bottom - TARGET_SIZE_PX - TARGET_MARGIN_PX;
    trashDropTarget.style.left = `${Math.round(x)}px`;
    trashDropTarget.style.top = `${Math.round(y)}px`;
  }

  function setTrashDropTargetState({ active = false, over = false } = {}) {
    if (!ensureTrashDropTargetElement() || !(trashDropTarget instanceof HTMLElement)) {
      return;
    }
    syncLayout();
    trashDropTarget.hidden = !active;
    trashDropTarget.dataset.active = active ? "true" : "false";
    trashDropTarget.dataset.over = active && over ? "true" : "false";
  }

  function pointerOverTrashTarget(clientX, clientY) {
    if (!(trashDropTarget instanceof HTMLElement)) {
      return false;
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }
    const rect = trashDropTarget.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function setDropTargets({ active = false, overLibrary = false, overTrash = false } = {}) {
    if (typeof setLibraryDropTargetState === "function") {
      setLibraryDropTargetState({ active, over: overLibrary });
    }
    setTrashDropTargetState({ active, over: overTrash });
  }

  function clearDragTracking() {
    dragState = null;
    setDropTargets({ active: false, overLibrary: false, overTrash: false });
  }

  function onWidgetDragState(payload) {
    if (!payload || !payload.widgetId || (payload.mode !== "move" && payload.mode !== "resize")) {
      return;
    }

    if (payload.phase === "start") {
      const draggedWidget = runtime.getWidgetById(payload.widgetId);
      dragState = {
        widgetId: payload.widgetId,
        mode: payload.mode,
        overLibrary: payload.mode === "move" && pointerOverLibraryLauncher(payload.clientX, payload.clientY),
        overTrash: payload.mode === "move" && pointerOverTrashTarget(payload.clientX, payload.clientY),
        originPosition:
          draggedWidget &&
          Number.isFinite(draggedWidget.position?.x) &&
          Number.isFinite(draggedWidget.position?.y)
            ? {
                x: draggedWidget.position.x,
                y: draggedWidget.position.y,
              }
            : null,
      };
      setDropTargets({
        active: payload.mode === "move",
        overLibrary: dragState.overLibrary,
        overTrash: dragState.overTrash,
      });
      return;
    }

    if (!dragState || dragState.widgetId !== payload.widgetId) {
      return;
    }

    if (payload.phase === "move") {
      const overLibrary =
        dragState.mode === "move" && pointerOverLibraryLauncher(payload.clientX, payload.clientY);
      const overTrash =
        dragState.mode === "move" && pointerOverTrashTarget(payload.clientX, payload.clientY);
      dragState.overLibrary = overLibrary;
      dragState.overTrash = overTrash;
      setDropTargets({
        active: dragState.mode === "move",
        overLibrary,
        overTrash,
      });
      return;
    }

    if (payload.phase !== "end") {
      return;
    }

    const snapshot = { ...dragState };
    if (snapshot.mode !== "move") {
      clearDragTracking();
      return;
    }

    const hasPointerLocation = Number.isFinite(payload.clientX) && Number.isFinite(payload.clientY);
    const droppedOverTrash = hasPointerLocation
      ? pointerOverTrashTarget(payload.clientX, payload.clientY)
      : Boolean(snapshot.overTrash);
    const droppedOverLibrary = hasPointerLocation
      ? pointerOverLibraryLauncher(payload.clientX, payload.clientY)
      : Boolean(snapshot.overLibrary);
    clearDragTracking();

    if (droppedOverTrash) {
      if (typeof onDeleteWidget === "function") {
        onDeleteWidget(snapshot.widgetId);
      }
      if (typeof triggerDeleteHaptic === "function") {
        triggerDeleteHaptic();
      }
      if (typeof onAfterDropMutation === "function") {
        onAfterDropMutation();
      }
      return;
    }

    if (!droppedOverLibrary) {
      return;
    }

    const widget = runtime.getWidgetById(snapshot.widgetId);
    if (!widget) {
      return;
    }

    void addWidgetToLibraryFromDrag(widget)
      .then(async (result) => {
        await animateWidgetBackToOrigin(widget, snapshot.originPosition);
        if (typeof onAfterDropMutation === "function") {
          onAfterDropMutation();
        }
        if (result?.ok) {
          showLibraryDropFeedback?.({ kind: "success", message: "Added to Library" });
          return;
        }
        if (result?.reason === "duplicate") {
          showLibraryDropFeedback?.({ kind: "deny", message: "Already in Library" });
          return;
        }
        showLibraryDropFeedback?.({ kind: "deny", message: "Could not add to Library" });
      })
      .catch(async (error) => {
        console.error("Failed to add widget to library from drag.", error);
        await animateWidgetBackToOrigin(widget, snapshot.originPosition);
        if (typeof onAfterDropMutation === "function") {
          onAfterDropMutation();
        }
        showLibraryDropFeedback?.({ kind: "deny", message: "Could not add to Library" });
      });
  }

  function destroy() {
    clearDragTracking();
    if (trashDropTarget instanceof HTMLElement) {
      trashDropTarget.remove();
    }
    trashDropTarget = null;
  }

  return {
    syncLayout,
    onWidgetDragState,
    destroy,
  };
}
