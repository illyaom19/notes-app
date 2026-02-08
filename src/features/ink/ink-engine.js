import { InkPersistence, loadPersistedStrokes } from "./persistence.js";
import { drawStroke } from "./rendering.js";
import { StrokeStore } from "./stroke-store.js";
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createStroke(pointerId, { layer, contextId, sourceWidgetId, anchorBounds }, point) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `stroke-${pointerId}-${Date.now()}`,
    createdAt: Date.now(),
    baseWidth: 3,
    color: "#103f78",
    tool: "pen",
    layer,
    contextId: contextId ?? null,
    sourceWidgetId: sourceWidgetId ?? null,
    anchorBounds: anchorBounds ?? null,
    points: [point],
  };
}

function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }

  const t = clamp(
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );
  const projectedX = from.x + t * dx;
  const projectedY = from.y + t * dy;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

export class InkEngine {
  constructor({ runtime, onStateChange, getActiveContextId }) {
    this.runtime = runtime;
    this.onStateChange = onStateChange;
    this.getActiveContextId = typeof getActiveContextId === "function" ? getActiveContextId : () => null;
    this.store = new StrokeStore(loadPersistedStrokes());
    this.persistence = new InkPersistence();
    this.activeStrokes = new Map();
    this.activeErasers = new Set();
    this.enabled = true;
    this.activeTool = "pen";
    this._detachInput = null;
    this._detachGlobalLayer = null;
    this._detachAttachedLayer = null;
    this._globalRenderLayer = {
      render: (ctx, camera) => this.renderGlobal(ctx, camera),
    };
    this._attachedRenderLayer = {
      render: (ctx, camera) => this.renderAttached(ctx, camera),
    };

    this._emitState();
  }

  attach() {
    if (!this._detachInput) {
      this._detachInput = this.runtime.registerInputHandler(this);
    }

    if (!this._detachGlobalLayer) {
      this._detachGlobalLayer = this.runtime.registerRenderLayer(this._globalRenderLayer, {
        phase: "before-widgets",
      });
    }
    if (!this._detachAttachedLayer) {
      this._detachAttachedLayer = this.runtime.registerRenderLayer(this._attachedRenderLayer, {
        phase: "after-widgets",
      });
    }
  }

  detach() {
    if (this._detachInput) {
      this._detachInput();
      this._detachInput = null;
    }

    if (this._detachGlobalLayer) {
      this._detachGlobalLayer();
      this._detachGlobalLayer = null;
    }
    if (this._detachAttachedLayer) {
      this._detachAttachedLayer();
      this._detachAttachedLayer = null;
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

  getTool() {
    return this.activeTool;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(nextEnabled) {
    this.enabled = nextEnabled !== false;
    this._emitState();
    return this.enabled;
  }

  setTool(nextTool) {
    this.activeTool = nextTool === "eraser" ? "eraser" : "pen";
    this._emitState();
    return this.activeTool;
  }

  toggleTool() {
    return this.setTool(this.activeTool === "pen" ? "eraser" : "pen");
  }

  _activeContextId() {
    return this.getActiveContextId() ?? null;
  }

  _strokeMatchesActiveContext(stroke) {
    const activeContextId = this._activeContextId();
    if (!activeContextId) {
      return true;
    }
    return stroke.contextId === null || stroke.contextId === activeContextId;
  }

  _resolveWidgetBounds(widgetId) {
    if (!widgetId) {
      return null;
    }

    const widget = this.runtime.getWidgetById(widgetId);
    if (!widget) {
      return null;
    }

    const interactionBounds =
      typeof widget.getInteractionBounds === "function"
        ? widget.getInteractionBounds()
        : { width: widget.size.width, height: widget.size.height };

    return {
      x: widget.position.x,
      y: widget.position.y,
      width: Math.max(1, interactionBounds.width),
      height: Math.max(1, interactionBounds.height),
    };
  }

  _buildWorldPoint(event, camera) {
    const world = camera.screenToWorld(event.offsetX, event.offsetY);
    return {
      x: world.x,
      y: world.y,
      p: event.pressure || 0.5,
      t: performance.now(),
    };
  }

  _buildAnchoredPoint(event, camera, bounds) {
    const world = camera.screenToWorld(event.offsetX, event.offsetY);
    return {
      u: clamp((world.x - bounds.x) / bounds.width, 0, 1),
      v: clamp((world.y - bounds.y) / bounds.height, 0, 1),
      p: event.pressure || 0.5,
      t: performance.now(),
    };
  }

  _buildPointForStroke(event, camera, stroke) {
    if (stroke.layer === "global") {
      return this._buildWorldPoint(event, camera);
    }

    const bounds = this._resolveWidgetBounds(stroke.sourceWidgetId) ?? stroke.anchorBounds;
    if (!bounds) {
      return null;
    }
    stroke.anchorBounds = bounds;
    return this._buildAnchoredPoint(event, camera, bounds);
  }

  _toRenderableStroke(stroke) {
    if (stroke.layer === "global") {
      return stroke;
    }

    const bounds = this._resolveWidgetBounds(stroke.sourceWidgetId) ?? stroke.anchorBounds;
    if (!bounds) {
      return null;
    }

    return {
      ...stroke,
      points: stroke.points.map((point) => ({
        x: bounds.x + bounds.width * clamp(point.u ?? 0, 0, 1),
        y: bounds.y + bounds.height * clamp(point.v ?? 0, 0, 1),
        p: point.p,
        t: point.t,
      })),
    };
  }

  _drawLayer(ctx, camera, layer) {
    const completed = this.store
      .getCompletedStrokes()
      .filter((stroke) => stroke.layer === layer && this._strokeMatchesActiveContext(stroke));

    for (const stroke of completed) {
      const renderable = this._toRenderableStroke(stroke);
      if (!renderable || !Array.isArray(renderable.points) || renderable.points.length < 1) {
        continue;
      }
      drawStroke(ctx, camera, renderable);
    }

    for (const stroke of this.activeStrokes.values()) {
      if (stroke.layer !== layer || !this._strokeMatchesActiveContext(stroke)) {
        continue;
      }
      const renderable = this._toRenderableStroke(stroke);
      if (!renderable || !Array.isArray(renderable.points) || renderable.points.length < 1) {
        continue;
      }
      drawStroke(ctx, camera, renderable);
    }
  }

  _eraseAtEvent(event, camera) {
    const world = camera.screenToWorld(event.offsetX, event.offsetY);
    const radiusWorld = 16 / Math.max(0.25, camera.zoom);
    let changed = false;

    const removed = this.store.removeStrokes((stroke) => {
      if (!this._strokeMatchesActiveContext(stroke)) {
        return false;
      }

      const renderable = this._toRenderableStroke(stroke);
      if (!renderable || !Array.isArray(renderable.points) || renderable.points.length < 1) {
        return false;
      }

      const points = renderable.points;
      if (points.length === 1) {
        return Math.hypot(points[0].x - world.x, points[0].y - world.y) <= radiusWorld;
      }

      for (let index = 1; index < points.length; index += 1) {
        const prev = points[index - 1];
        const current = points[index];
        if (distanceToSegment(world, prev, current) <= radiusWorld) {
          return true;
        }
      }

      return false;
    });

    if (removed > 0) {
      changed = true;
      this._afterStoreMutation();
    }

    return changed;
  }

  onPointerDown(event, { camera }) {
    if (event.pointerType !== "pen") {
      return false;
    }

    if (!this.enabled) {
      return false;
    }

    if (event.button !== 0) {
      return false;
    }

    event.preventDefault();
    if (this.activeTool === "eraser") {
      this.activeErasers.add(event.pointerId);
      this._eraseAtEvent(event, camera);
      this._emitState();
      return true;
    }

    const targetWidget = this.runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
    const requestedLayer = !targetWidget ? "global" : targetWidget.type === "pdf-document" ? "pdf" : "widget";
    const requestedWidgetId = requestedLayer === "global" ? null : targetWidget.id;
    const requestedBounds = requestedLayer === "global" ? null : this._resolveWidgetBounds(requestedWidgetId);
    const layer = requestedLayer !== "global" && !requestedBounds ? "global" : requestedLayer;
    const sourceWidgetId = layer === "global" ? null : requestedWidgetId;
    const anchorBounds = layer === "global" ? null : requestedBounds;
    const contextId = this._activeContextId();

    const seedStroke = createStroke(
      event.pointerId,
      { layer, contextId, sourceWidgetId, anchorBounds },
      layer === "global"
        ? this._buildWorldPoint(event, camera)
        : this._buildAnchoredPoint(event, camera, anchorBounds),
    );
    this.activeStrokes.set(event.pointerId, seedStroke);
    this._emitState();
    return true;
  }

  onPointerMove(event, { camera }) {
    if (this.activeErasers.has(event.pointerId)) {
      event.preventDefault();
      this._eraseAtEvent(event, camera);
      return true;
    }

    const stroke = this.activeStrokes.get(event.pointerId);
    if (!stroke) {
      return false;
    }

    event.preventDefault();
    const point = this._buildPointForStroke(event, camera, stroke);
    if (point) {
      stroke.points.push(point);
    }
    return true;
  }

  onPointerUp(event, { camera }) {
    return this._finishStroke(event, camera);
  }

  onPointerCancel(event, { camera }) {
    return this._finishStroke(event, camera);
  }

  renderGlobal(ctx, camera) {
    this._drawLayer(ctx, camera, "global");
  }

  renderAttached(ctx, camera) {
    this._drawLayer(ctx, camera, "pdf");
    this._drawLayer(ctx, camera, "widget");
  }

  _finishStroke(event, camera) {
    if (this.activeErasers.has(event.pointerId)) {
      event.preventDefault();
      this.activeErasers.delete(event.pointerId);
      this._emitState();
      return true;
    }

    const stroke = this.activeStrokes.get(event.pointerId);
    if (!stroke) {
      return false;
    }

    event.preventDefault();
    const point = this._buildPointForStroke(event, camera, stroke);
    if (point) {
      stroke.points.push(point);
    }

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
    const completedStrokes = this.store
      .getCompletedStrokes()
      .filter((stroke) => this._strokeMatchesActiveContext(stroke)).length;

    if (typeof this.onStateChange === "function") {
      this.onStateChange({
        completedStrokes,
        undoDepth: this.store.doneCount,
        redoDepth: this.store.undoneCount,
        activePointers: this.activeStrokes.size + this.activeErasers.size,
        activeTool: this.activeTool,
        enabled: this.enabled,
      });
    }
  }
}
