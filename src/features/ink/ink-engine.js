import { InkPersistence, loadPersistedStrokes } from "./persistence.js";
import { drawStroke } from "./rendering.js";
import { StrokeStore } from "./stroke-store.js";
import { StrokeRasterCache } from "./stroke-raster-cache.js";

function buildPoint(event, camera) {
  const world = camera.screenToWorld(event.offsetX, event.offsetY);
  return {
    x: world.x,
    y: world.y,
    p: event.pressure || 0.5,
    t: performance.now(),
  };
}

function createStroke(pointerId, point) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `stroke-${pointerId}-${Date.now()}`,
    createdAt: Date.now(),
    baseWidth: 3,
    color: "#103f78",
    tool: "pen",
    points: [point],
  };
}

export class InkEngine {
  constructor({ runtime, onStateChange }) {
    this.runtime = runtime;
    this.onStateChange = onStateChange;
    this.store = new StrokeStore(loadPersistedStrokes());
    this.persistence = new InkPersistence();
    this.cache = new StrokeRasterCache();
    this.activeStrokes = new Map();
    this._detachInput = null;
    this._detachLayer = null;

    this._emitState();
  }

  attach() {
    if (!this._detachInput) {
      this._detachInput = this.runtime.registerInputHandler(this);
    }

    if (!this._detachLayer) {
      this._detachLayer = this.runtime.registerRenderLayer(this);
    }
  }

  detach() {
    if (this._detachInput) {
      this._detachInput();
      this._detachInput = null;
    }

    if (this._detachLayer) {
      this._detachLayer();
      this._detachLayer = null;
    }
  }

  undo() {
    if (this.store.undo()) {
      this._afterStoreMutation();
    }
  }

  redo() {
    if (this.store.redo()) {
      this._afterStoreMutation();
    }
  }

  onPointerDown(event, { camera }) {
    if (event.pointerType !== "pen") {
      return false;
    }

    if (event.button !== 0) {
      return false;
    }

    event.preventDefault();
    const point = buildPoint(event, camera);
    this.activeStrokes.set(event.pointerId, createStroke(event.pointerId, point));
    this._emitState();
    return true;
  }

  onPointerMove(event, { camera }) {
    const stroke = this.activeStrokes.get(event.pointerId);
    if (!stroke) {
      return false;
    }

    event.preventDefault();
    stroke.points.push(buildPoint(event, camera));
    return true;
  }

  onPointerUp(event, { camera }) {
    return this._finishStroke(event, camera);
  }

  onPointerCancel(event, { camera }) {
    return this._finishStroke(event, camera);
  }

  render(ctx, camera, viewport) {
    this.cache.ensure({
      width: viewport.width,
      height: viewport.height,
      dpr: viewport.dpr,
      camera,
      revision: this.store.revision,
      strokes: this.store.getCompletedStrokes(),
    });
    this.cache.drawTo(ctx, viewport.width, viewport.height);

    for (const stroke of this.activeStrokes.values()) {
      drawStroke(ctx, camera, stroke);
    }
  }

  _finishStroke(event, camera) {
    const stroke = this.activeStrokes.get(event.pointerId);
    if (!stroke) {
      return false;
    }

    event.preventDefault();
    stroke.points.push(buildPoint(event, camera));

    if (stroke.points.length === 1) {
      stroke.points.push({ ...stroke.points[0] });
    }

    this.activeStrokes.delete(event.pointerId);
    this.store.commitStroke(stroke);
    this._afterStoreMutation();
    return true;
  }

  _afterStoreMutation() {
    this.persistence.scheduleSave(this.store.serialize());
    this._emitState();
  }

  _emitState() {
    if (typeof this.onStateChange === "function") {
      this.onStateChange({
        completedStrokes: this.store.doneCount,
        undoDepth: this.store.doneCount,
        redoDepth: this.store.undoneCount,
        activePointers: this.activeStrokes.size,
      });
    }
  }
}
