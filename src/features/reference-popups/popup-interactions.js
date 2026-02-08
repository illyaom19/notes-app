function getWorldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

export function createReferencePopupInteractions({ runtime, onPopupMutated }) {
  const manager = {
    onPointerDown(event, { camera }) {
      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "reference-popup") {
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      const world = getWorldPoint(event, camera);
      const control = widget.getControlAt(world.x, world.y, camera);

      if (control === "close") {
        runtime.removeWidgetById(widget.id);
        onPopupMutated();
        return true;
      }

      if (control === "open-source") {
        const sourceUrl = typeof widget.citation?.url === "string" ? widget.citation.url.trim() : "";
        if (sourceUrl) {
          window.open(sourceUrl, "_blank", "noopener,noreferrer");
        }
        return true;
      }

      return false;
    },
  };

  const detach = runtime.registerInputHandler(manager);
  return {
    dispose() {
      detach();
    },
  };
}
