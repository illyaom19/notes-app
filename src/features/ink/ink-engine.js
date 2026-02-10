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
    anchorMode: "relative",
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
    this._completedLayerCache = new Map();
    this._completedLayerCacheRevision = this.store.revision;
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

  _resolveWidgetBounds(widgetId, camera = this.runtime.camera) {
    if (!widgetId) {
      return null;
    }

    const widget = this.runtime.getWidgetById(widgetId);
    if (!widget) {
      return null;
    }
    if (widget.collapsed) {
      return null;
    }

    if (typeof widget.getInkAnchorBounds === "function") {
      const anchorBounds = widget.getInkAnchorBounds(camera);
      if (
        anchorBounds &&
        Number.isFinite(anchorBounds.x) &&
        Number.isFinite(anchorBounds.y) &&
        Number.isFinite(anchorBounds.width) &&
        Number.isFinite(anchorBounds.height)
      ) {
        return {
          x: anchorBounds.x,
          y: anchorBounds.y,
          width: Math.max(1, anchorBounds.width),
          height: Math.max(1, anchorBounds.height),
        };
      }
    }

    const interactionBounds =
      typeof widget.getInteractionBounds === "function"
        ? widget.getInteractionBounds(camera)
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

  _buildAnchoredLocalPoint(event, camera, bounds) {
    const world = camera.screenToWorld(event.offsetX, event.offsetY);
    return {
      lx: world.x - bounds.x,
      ly: world.y - bounds.y,
      p: event.pressure || 0.5,
      t: performance.now(),
    };
  }

  _buildPointForStroke(event, camera, stroke) {
    if (stroke.layer === "global") {
      return this._buildWorldPoint(event, camera);
    }

    const sourceWidget = stroke.sourceWidgetId ? this.runtime.getWidgetById(stroke.sourceWidgetId) : null;
    if (sourceWidget && sourceWidget.collapsed) {
      return null;
    }
    const bounds = this._resolveWidgetBounds(stroke.sourceWidgetId);
    if (!bounds) {
      return null;
    }
    stroke.anchorBounds = bounds;
    if (stroke.anchorMode === "local") {
      return this._buildAnchoredLocalPoint(event, camera, bounds);
    }
    return this._buildAnchoredPoint(event, camera, bounds);
  }

  _toRenderableStroke(stroke) {
    if (stroke.layer === "global") {
      return stroke;
    }

    const sourceWidget = stroke.sourceWidgetId ? this.runtime.getWidgetById(stroke.sourceWidgetId) : null;
    if (sourceWidget && sourceWidget.collapsed) {
      return null;
    }
    const bounds = this._resolveWidgetBounds(stroke.sourceWidgetId);
    if (!bounds) {
      return null;
    }

    const widget = sourceWidget;
    const isExpandedAreaStroke = Boolean(sourceWidget && sourceWidget.type === "expanded-area");
    const anchorBounds =
      stroke.anchorBounds && typeof stroke.anchorBounds === "object" ? stroke.anchorBounds : bounds;

    return {
      ...stroke,
      points: stroke.points.map((point) => ({
        x:
          stroke.anchorMode === "local"
            ? bounds.x + (Number(point.lx) || 0)
            : isExpandedAreaStroke
              ? bounds.x + Math.max(0, Number(anchorBounds.width) || 0) * clamp(point.u ?? 0, 0, 1)
            : bounds.x + bounds.width * clamp(point.u ?? 0, 0, 1),
        y:
          stroke.anchorMode === "local"
            ? bounds.y + (Number(point.ly) || 0)
            : isExpandedAreaStroke
              ? bounds.y + Math.max(0, Number(anchorBounds.height) || 0) * clamp(point.v ?? 0, 0, 1)
            : bounds.y + bounds.height * clamp(point.v ?? 0, 0, 1),
        p: point.p,
        t: point.t,
      })),
    };
  }

  _isCropAnchoredWidgetStroke(stroke) {
    if (!stroke || stroke.layer !== "widget" || stroke.anchorMode !== "local" || !stroke.sourceWidgetId) {
      return false;
    }
    const widget = this.runtime.getWidgetById(stroke.sourceWidgetId);
    return Boolean(widget && widget.type === "expanded-area" && !widget.collapsed);
  }

  _getCompletedLayerStrokes(layer) {
    const revision = this.store.revision;
    if (revision !== this._completedLayerCacheRevision) {
      this._completedLayerCacheRevision = revision;
      this._completedLayerCache.clear();
    }

    const contextKey = this._activeContextId() ?? "__all__";
    const cacheKey = `${layer}:${contextKey}`;
    const cached = this._completedLayerCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const completed = this.store
      .getCompletedStrokes()
      .filter((stroke) => stroke.layer === layer && this._strokeMatchesActiveContext(stroke));
    this._completedLayerCache.set(cacheKey, completed);
    return completed;
  }

  _buildOcclusionState(camera) {
    const widgets = this.runtime.listWidgets();
    const entries = [];
    const byId = new Map();

    for (let index = 0; index < widgets.length; index += 1) {
      const widget = widgets[index];
      const bounds =
        typeof widget.getInteractionBounds === "function"
          ? widget.getInteractionBounds(camera)
          : { width: widget.size.width, height: widget.size.height };
      if (
        !bounds ||
        !Number.isFinite(bounds.width) ||
        !Number.isFinite(bounds.height) ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        continue;
      }

      const screen = camera.worldToScreen(widget.position.x, widget.position.y);
      const width = Math.max(1, bounds.width * camera.zoom);
      const height = Math.max(1, bounds.height * camera.zoom);
      const entry = {
        id: widget.id,
        index,
        screenX: screen.x,
        screenY: screen.y,
        width,
        height,
        maxX: screen.x + width,
        maxY: screen.y + height,
        occluders: [],
      };
      entries.push(entry);
      byId.set(widget.id, entry);
    }

    // Precompute overlapping higher-z widget rectangles once per layer render.
    for (let sourceIndex = 0; sourceIndex < entries.length; sourceIndex += 1) {
      const source = entries[sourceIndex];
      for (let occluderIndex = sourceIndex + 1; occluderIndex < entries.length; occluderIndex += 1) {
        const occluder = entries[occluderIndex];
        if (
          occluder.screenX >= source.maxX ||
          occluder.screenY >= source.maxY ||
          occluder.maxX <= source.screenX ||
          occluder.maxY <= source.screenY
        ) {
          continue;
        }
        source.occluders.push(occluder);
      }
    }

    return {
      byId,
    };
  }

  _widgetIntersectsVisibleWorld(widgetId, camera, visibleWorld, visibleByWidgetId) {
    if (!visibleWorld || !widgetId) {
      return true;
    }
    if (visibleByWidgetId.has(widgetId)) {
      return visibleByWidgetId.get(widgetId);
    }

    const bounds = this._resolveWidgetBounds(widgetId, camera);
    if (!bounds) {
      visibleByWidgetId.set(widgetId, false);
      return false;
    }

    const visible = !(
      bounds.x + bounds.width < visibleWorld.minX ||
      bounds.x > visibleWorld.maxX ||
      bounds.y + bounds.height < visibleWorld.minY ||
      bounds.y > visibleWorld.maxY
    );
    visibleByWidgetId.set(widgetId, visible);
    return visible;
  }

  _drawStrokeWithOcclusionClip(ctx, camera, stroke, renderable, occlusionState = null) {
    if (
      !stroke ||
      stroke.layer === "global" ||
      typeof stroke.sourceWidgetId !== "string" ||
      !stroke.sourceWidgetId.trim()
    ) {
      drawStroke(ctx, camera, renderable);
      return;
    }

    const sourceEntry = occlusionState?.byId?.get?.(stroke.sourceWidgetId);
    if (!sourceEntry) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(sourceEntry.screenX, sourceEntry.screenY, sourceEntry.width, sourceEntry.height);

    const occluders = sourceEntry.occluders ?? [];
    for (const occluder of occluders) {
      ctx.rect(occluder.screenX, occluder.screenY, occluder.width, occluder.height);
    }

    ctx.clip("evenodd");
    drawStroke(ctx, camera, renderable);
    ctx.restore();
  }

  _drawLayer(ctx, camera, layer) {
    const completed = this._getCompletedLayerStrokes(layer);
    const visibleWorld = this.runtime.getVisibleWorldBounds?.() ?? null;
    const visibleByWidgetId = new Map();
    const occlusionState = layer === "global" ? null : this._buildOcclusionState(camera);

    for (const stroke of completed) {
      if (
        stroke.sourceWidgetId &&
        !this._widgetIntersectsVisibleWorld(stroke.sourceWidgetId, camera, visibleWorld, visibleByWidgetId)
      ) {
        continue;
      }
      const renderable = this._toRenderableStroke(stroke);
      if (!renderable || !Array.isArray(renderable.points) || renderable.points.length < 1) {
        continue;
      }
      if (this._isCropAnchoredWidgetStroke(stroke) || stroke.layer === "pdf" || stroke.layer === "widget") {
        this._drawStrokeWithOcclusionClip(ctx, camera, stroke, renderable, occlusionState);
      } else {
        drawStroke(ctx, camera, renderable);
      }
    }

    for (const stroke of this.activeStrokes.values()) {
      if (stroke.layer !== layer || !this._strokeMatchesActiveContext(stroke)) {
        continue;
      }
      if (
        stroke.sourceWidgetId &&
        !this._widgetIntersectsVisibleWorld(stroke.sourceWidgetId, camera, visibleWorld, visibleByWidgetId)
      ) {
        continue;
      }
      const renderable = this._toRenderableStroke(stroke);
      if (!renderable || !Array.isArray(renderable.points) || renderable.points.length < 1) {
        continue;
      }
      if (this._isCropAnchoredWidgetStroke(stroke) || stroke.layer === "pdf" || stroke.layer === "widget") {
        this._drawStrokeWithOcclusionClip(ctx, camera, stroke, renderable, occlusionState);
      } else {
        drawStroke(ctx, camera, renderable);
      }
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
    const anchorMode = layer === "widget" && targetWidget?.type === "expanded-area" ? "local" : "relative";
    const contextId = this._activeContextId();

    const seedStroke = createStroke(
      event.pointerId,
      { layer, contextId, sourceWidgetId, anchorBounds },
      layer === "global"
        ? this._buildWorldPoint(event, camera)
        : anchorMode === "local"
          ? this._buildAnchoredLocalPoint(event, camera, anchorBounds)
          : this._buildAnchoredPoint(event, camera, anchorBounds),
    );
    seedStroke.anchorMode = anchorMode;
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

  cloneStrokesForWidget({ contextId = null, sourceWidgetId, targetWidgetId = null } = {}) {
    if (typeof sourceWidgetId !== "string" || !sourceWidgetId.trim()) {
      return [];
    }
    const scopedContextId = contextId ?? this._activeContextId();
    const clones = [];
    for (const stroke of this.store.getCompletedStrokes()) {
      if (stroke.sourceWidgetId !== sourceWidgetId) {
        continue;
      }
      if (scopedContextId && stroke.contextId && stroke.contextId !== scopedContextId) {
        continue;
      }
      clones.push({
        ...stroke,
        id: globalThis.crypto?.randomUUID?.() ?? `stroke-clone-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sourceWidgetId: targetWidgetId ?? sourceWidgetId,
        points: Array.isArray(stroke.points) ? stroke.points.map((point) => ({ ...point })) : [],
      });
    }
    return clones;
  }

  commitImportedStrokes(strokes = []) {
    if (!Array.isArray(strokes) || strokes.length < 1) {
      return 0;
    }

    let added = 0;
    for (const stroke of strokes) {
      if (!stroke || typeof stroke !== "object" || !Array.isArray(stroke.points) || stroke.points.length < 1) {
        continue;
      }
      this.store.commitStroke({
        ...stroke,
        id:
          typeof stroke.id === "string" && stroke.id.trim()
            ? stroke.id
            : globalThis.crypto?.randomUUID?.() ?? `stroke-import-${Date.now()}-${added}`,
      });
      added += 1;
    }
    if (added > 0) {
      this._afterStoreMutation();
    }
    return added;
  }

  removeStrokesForWidget(widgetId, { contextId = null } = {}) {
    if (typeof widgetId !== "string" || !widgetId.trim()) {
      return 0;
    }
    const scopedContextId = contextId ?? null;
    const removed = this.store.removeStrokes((stroke) => {
      if (!stroke || stroke.sourceWidgetId !== widgetId) {
        return false;
      }
      if (!scopedContextId) {
        return true;
      }
      return stroke.contextId === scopedContextId;
    });
    if (removed > 0) {
      this._afterStoreMutation();
    }
    return removed;
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
