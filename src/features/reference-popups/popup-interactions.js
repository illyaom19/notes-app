function getWorldPoint(event, camera) {
  return camera.screenToWorld(event.offsetX, event.offsetY);
}

const AVOIDANCE_THROTTLE_MS = 45;
const AVOIDANCE_RADIUS_PX = 130;
const AVOIDANCE_STEP_PX = 14;
const VIEWPORT_MARGIN_PX = 24;

function worldFromPixels(camera, pixels) {
  return pixels / Math.max(0.25, camera.zoom);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function popupBounds(widget) {
  return {
    x: widget.position.x,
    y: widget.position.y,
    width: Math.max(1, widget.size.width),
    height: Math.max(1, typeof widget.displayHeight === "number" ? widget.displayHeight : widget.size.height),
  };
}

function visibilityBounds(camera, canvas) {
  const worldA = camera.screenToWorld(0, 0);
  const worldB = camera.screenToWorld(canvas.clientWidth, canvas.clientHeight);
  return {
    minX: Math.min(worldA.x, worldB.x),
    maxX: Math.max(worldA.x, worldB.x),
    minY: Math.min(worldA.y, worldB.y),
    maxY: Math.max(worldA.y, worldB.y),
  };
}

function normalizeBehaviorPrefs(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return {
    avoidStylus: source.avoidStylus !== false,
    motionReduced: source.motionReduced === true,
  };
}

export function createReferencePopupInteractions({ runtime, onPopupMutated, getBehaviorPrefs }) {
  let lastAvoidanceAt = 0;

  const manager = {
    onPointerDown(event, { camera }) {
      if (event.pointerType === "pen") {
        return false;
      }

      const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (!widget || widget.type !== "reference-popup") {
        return false;
      }

      runtime.bringWidgetToFront(widget.id);
      const world = getWorldPoint(event, camera);
      const control = widget.getControlAt(world.x, world.y);

      if (control === "close") {
        runtime.removeWidgetById(widget.id);
        onPopupMutated();
        return true;
      }

      if (control === "minimize") {
        widget.toggleMinimized();
        onPopupMutated();
        return true;
      }

      return false;
    },

    onPointerMove(event, { camera, canvas }) {
      if (event.pointerType !== "pen") {
        return false;
      }

      // Avoidance should respond to hover/proximity, not while actively drawing.
      if (event.buttons !== 0) {
        return false;
      }

      const prefs = normalizeBehaviorPrefs(getBehaviorPrefs?.());
      if (!prefs.avoidStylus || prefs.motionReduced) {
        return false;
      }

      const now = performance.now();
      if (now - lastAvoidanceAt < AVOIDANCE_THROTTLE_MS) {
        return false;
      }
      lastAvoidanceAt = now;

      const pointer = getWorldPoint(event, camera);
      const visible = visibilityBounds(camera, canvas);
      const marginWorld = worldFromPixels(camera, VIEWPORT_MARGIN_PX);
      const radiusWorld = worldFromPixels(camera, AVOIDANCE_RADIUS_PX);
      const maxStepWorld = worldFromPixels(camera, AVOIDANCE_STEP_PX);

      let movedAny = false;

      for (const widget of runtime.listWidgets()) {
        if (!widget || widget.type !== "reference-popup") {
          continue;
        }

        const bounds = popupBounds(widget);
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const vx = centerX - pointer.x;
        const vy = centerY - pointer.y;
        const distance = Math.hypot(vx, vy);

        if (!Number.isFinite(distance) || distance <= 0 || distance > radiusWorld) {
          continue;
        }

        const influence = 1 - distance / radiusWorld;
        const step = Math.max(0, maxStepWorld * influence);
        if (step <= 0) {
          continue;
        }

        const ux = vx / distance;
        const uy = vy / distance;

        const minX = visible.minX + marginWorld;
        const maxX = visible.maxX - bounds.width - marginWorld;
        const minY = visible.minY + marginWorld;
        const maxY = visible.maxY - bounds.height - marginWorld;

        const nextX = clamp(widget.position.x + ux * step, minX, maxX);
        const nextY = clamp(widget.position.y + uy * step, minY, maxY);

        if (
          Math.abs(nextX - widget.position.x) < 0.02 &&
          Math.abs(nextY - widget.position.y) < 0.02
        ) {
          continue;
        }

        widget.position.x = nextX;
        widget.position.y = nextY;
        movedAny = true;
      }

      if (movedAny) {
        onPopupMutated();
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
