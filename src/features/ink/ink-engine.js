import { InkPersistence, loadPersistedStrokes } from "./persistence.js";
import { drawStroke } from "./rendering.js";
import { StrokeStore } from "./stroke-store.js";

const STROKE_INTERPOLATION_STEP_PX = 4;
const STROKE_INTERPOLATION_MAX_POINTS = 10;

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
    this._widgetInkRevisionCache = new Map();
    this._widgetInkRevisionCacheRevision = this.store.revision;
    this._widgetInkRevisionCacheContextId = this._activeContextId();
    this._occlusionStateCache = null;
    this._occlusionStateCacheKey = null;
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
      this._detachInput = this.runtime.registerInputHandler(this, { priority: 89 });
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
    const timestamp = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    return {
      x: world.x,
      y: world.y,
      p: event.pressure || 0.5,
      t: timestamp,
    };
  }

  _buildAnchoredPoint(event, camera, bounds) {
    const world = camera.screenToWorld(event.offsetX, event.offsetY);
    const timestamp = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    return {
      u: clamp((world.x - bounds.x) / bounds.width, 0, 1),
      v: clamp((world.y - bounds.y) / bounds.height, 0, 1),
      p: event.pressure || 0.5,
      t: timestamp,
    };
  }

  _buildAnchoredLocalPoint(event, camera, bounds) {
    const world = camera.screenToWorld(event.offsetX, event.offsetY);
    const timestamp = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    return {
      lx: world.x - bounds.x,
      ly: world.y - bounds.y,
      p: event.pressure || 0.5,
      t: timestamp,
    };
  }

  _sampleToEvent(sample, fallbackEvent) {
    if (!sample || typeof sample !== "object") {
      return fallbackEvent;
    }
    const canvasRect = this.runtime?.canvas?.getBoundingClientRect?.();
    const hasCanvasRect =
      canvasRect &&
      Number.isFinite(canvasRect.left) &&
      Number.isFinite(canvasRect.top);
    const offsetX = Number.isFinite(sample.offsetX)
      ? sample.offsetX
      : hasCanvasRect && Number.isFinite(sample.clientX)
        ? sample.clientX - canvasRect.left
        : fallbackEvent.offsetX;
    const offsetY = Number.isFinite(sample.offsetY)
      ? sample.offsetY
      : hasCanvasRect && Number.isFinite(sample.clientY)
        ? sample.clientY - canvasRect.top
        : fallbackEvent.offsetY;
    const pressure = Number.isFinite(sample.pressure) ? sample.pressure : fallbackEvent.pressure;
    const timeStamp = Number.isFinite(sample.timeStamp) ? sample.timeStamp : fallbackEvent.timeStamp;
    return {
      ...fallbackEvent,
      offsetX,
      offsetY,
      pressure,
      timeStamp,
    };
  }

  _collectPointerSamples(event) {
    if (event && typeof event.getCoalescedEvents === "function") {
      const samples = event.getCoalescedEvents();
      if (Array.isArray(samples) && samples.length > 0) {
        return samples;
      }
    }
    return [event];
  }

  _pointEquals(stroke, left, right) {
    if (!left || !right) {
      return false;
    }
    if (stroke.layer === "global") {
      return Math.abs((left.x ?? 0) - (right.x ?? 0)) < 0.0001 && Math.abs((left.y ?? 0) - (right.y ?? 0)) < 0.0001;
    }
    if (stroke.anchorMode === "local") {
      return (
        Math.abs((left.lx ?? 0) - (right.lx ?? 0)) < 0.0001 &&
        Math.abs((left.ly ?? 0) - (right.ly ?? 0)) < 0.0001
      );
    }
    return Math.abs((left.u ?? 0) - (right.u ?? 0)) < 0.000001 && Math.abs((left.v ?? 0) - (right.v ?? 0)) < 0.000001;
  }

  _strokePointToWorld(stroke, point, camera) {
    if (!stroke || !point) {
      return null;
    }
    if (stroke.layer === "global") {
      return {
        x: Number(point.x),
        y: Number(point.y),
      };
    }
    const bounds = stroke.anchorBounds ?? this._resolveWidgetBounds(stroke.sourceWidgetId, camera);
    if (!bounds) {
      return null;
    }
    if (stroke.anchorMode === "local") {
      return {
        x: bounds.x + (Number(point.lx) || 0),
        y: bounds.y + (Number(point.ly) || 0),
      };
    }
    return {
      x: bounds.x + bounds.width * clamp(point.u ?? 0, 0, 1),
      y: bounds.y + bounds.height * clamp(point.v ?? 0, 0, 1),
    };
  }

  _lerpStrokePoint(stroke, from, to, t) {
    const pressure = (Number(from.p) || 0.5) + ((Number(to.p) || 0.5) - (Number(from.p) || 0.5)) * t;
    const time = (Number(from.t) || 0) + ((Number(to.t) || 0) - (Number(from.t) || 0)) * t;
    if (stroke.layer === "global") {
      return {
        x: (Number(from.x) || 0) + ((Number(to.x) || 0) - (Number(from.x) || 0)) * t,
        y: (Number(from.y) || 0) + ((Number(to.y) || 0) - (Number(from.y) || 0)) * t,
        p: pressure,
        t: time,
      };
    }
    if (stroke.anchorMode === "local") {
      return {
        lx: (Number(from.lx) || 0) + ((Number(to.lx) || 0) - (Number(from.lx) || 0)) * t,
        ly: (Number(from.ly) || 0) + ((Number(to.ly) || 0) - (Number(from.ly) || 0)) * t,
        p: pressure,
        t: time,
      };
    }
    return {
      u: clamp((Number(from.u) || 0) + ((Number(to.u) || 0) - (Number(from.u) || 0)) * t, 0, 1),
      v: clamp((Number(from.v) || 0) + ((Number(to.v) || 0) - (Number(from.v) || 0)) * t, 0, 1),
      p: pressure,
      t: time,
    };
  }

  _appendPointWithInterpolation(stroke, point, camera) {
    if (!stroke || !point) {
      return;
    }
    const points = stroke.points;
    const previous = points.length > 0 ? points[points.length - 1] : null;
    if (!previous) {
      points.push(point);
      return;
    }
    if (this._pointEquals(stroke, previous, point)) {
      return;
    }

    const previousWorld = this._strokePointToWorld(stroke, previous, camera);
    const pointWorld = this._strokePointToWorld(stroke, point, camera);
    if (!previousWorld || !pointWorld) {
      points.push(point);
      return;
    }

    const from = camera.worldToScreen(previousWorld.x, previousWorld.y);
    const to = camera.worldToScreen(pointWorld.x, pointWorld.y);
    const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
    const interpolationCount = clamp(
      Math.floor(distancePx / STROKE_INTERPOLATION_STEP_PX) - 1,
      0,
      STROKE_INTERPOLATION_MAX_POINTS,
    );

    if (interpolationCount > 0) {
      for (let index = 0; index < interpolationCount; index += 1) {
        const t = (index + 1) / (interpolationCount + 1);
        points.push(this._lerpStrokePoint(stroke, previous, point, t));
      }
    }
    points.push(point);
  }

  _appendSamplesForEvent(stroke, event, camera) {
    const samples = this._collectPointerSamples(event);
    let appended = 0;
    for (const sample of samples) {
      const normalized = this._sampleToEvent(sample, event);
      const point = this._buildPointForStroke(normalized, camera, stroke);
      if (!point) {
        continue;
      }
      const previousLength = stroke.points.length;
      this._appendPointWithInterpolation(stroke, point, camera);
      if (stroke.points.length > previousLength) {
        appended += stroke.points.length - previousLength;
      }
    }
    return appended;
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

  _getWidgetInkRevisionMap() {
    const revision = this.store.revision;
    const contextId = this._activeContextId();
    if (
      revision !== this._widgetInkRevisionCacheRevision ||
      contextId !== this._widgetInkRevisionCacheContextId
    ) {
      this._widgetInkRevisionCacheRevision = revision;
      this._widgetInkRevisionCacheContextId = contextId;
      this._widgetInkRevisionCache.clear();
      for (const stroke of this.store.getCompletedStrokes()) {
        if (!this._strokeMatchesActiveContext(stroke)) {
          continue;
        }
        if (stroke.layer !== "pdf" && stroke.layer !== "widget") {
          continue;
        }
        const widgetId = typeof stroke.sourceWidgetId === "string" ? stroke.sourceWidgetId.trim() : "";
        if (!widgetId) {
          continue;
        }
        const existing = this._widgetInkRevisionCache.get(widgetId) ?? 0;
        const points = Array.isArray(stroke.points) ? stroke.points.length : 0;
        this._widgetInkRevisionCache.set(widgetId, (existing + 1 + points) >>> 0);
      }
    }
    return this._widgetInkRevisionCache;
  }

  getWidgetInkRevision(widgetId) {
    const key = typeof widgetId === "string" ? widgetId.trim() : "";
    if (!key) {
      return 0;
    }
    const map = this._getWidgetInkRevisionMap();
    return map.get(key) ?? 0;
  }

  isWidgetInkActive(widgetId) {
    const key = typeof widgetId === "string" ? widgetId.trim() : "";
    if (!key) {
      return false;
    }
    if (this.activeErasers.size > 0) {
      return true;
    }
    for (const stroke of this.activeStrokes.values()) {
      if (stroke?.sourceWidgetId === key) {
        return true;
      }
    }
    return false;
  }

  hasActiveInkPointers() {
    return this.activeStrokes.size > 0 || this.activeErasers.size > 0;
  }

  _buildOcclusionState(camera, visibleWorld = null) {
    const widgets = this.runtime.listWidgets();
    const entries = [];
    const byId = new Map();
    const viewport = {
      width: Math.max(1, this.runtime?.canvas?.clientWidth || 1),
      height: Math.max(1, this.runtime?.canvas?.clientHeight || 1),
    };

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
      const worldMinX = widget.position.x;
      const worldMinY = widget.position.y;
      const worldMaxX = worldMinX + bounds.width;
      const worldMaxY = worldMinY + bounds.height;
      if (
        visibleWorld &&
        (worldMaxX < visibleWorld.minX ||
          worldMinX > visibleWorld.maxX ||
          worldMaxY < visibleWorld.minY ||
          worldMinY > visibleWorld.maxY)
      ) {
        continue;
      }

      const screen = camera.worldToScreen(widget.position.x, widget.position.y);
      const width = Math.max(1, bounds.width * camera.zoom);
      const height = Math.max(1, bounds.height * camera.zoom);
      const maxX = screen.x + width;
      const maxY = screen.y + height;
      if (maxX < 0 || maxY < 0 || screen.x > viewport.width || screen.y > viewport.height) {
        continue;
      }
      const entry = {
        id: widget.id,
        index,
        screenX: screen.x,
        screenY: screen.y,
        width,
        height,
        maxX,
        maxY,
        minCellX: 0,
        maxCellX: 0,
        minCellY: 0,
        maxCellY: 0,
        occluders: [],
      };
      entries.push(entry);
      byId.set(widget.id, entry);
    }

    const cacheKey = [
      camera.zoom.toFixed(4),
      entries
        .map(
          (entry) =>
            `${entry.id}:${entry.index}:${entry.screenX.toFixed(2)}:${entry.screenY.toFixed(2)}:${entry.width.toFixed(2)}:${entry.height.toFixed(2)}`,
        )
        .join("|"),
    ].join("::");
    if (this._occlusionStateCacheKey === cacheKey && this._occlusionStateCache) {
      return this._occlusionStateCache;
    }

    const cellSizePx = 220;
    const cells = new Map();

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];
      entry.minCellX = Math.floor(entry.screenX / cellSizePx);
      entry.maxCellX = Math.floor(entry.maxX / cellSizePx);
      entry.minCellY = Math.floor(entry.screenY / cellSizePx);
      entry.maxCellY = Math.floor(entry.maxY / cellSizePx);
      for (let cy = entry.minCellY; cy <= entry.maxCellY; cy += 1) {
        for (let cx = entry.minCellX; cx <= entry.maxCellX; cx += 1) {
          const key = `${cx}:${cy}`;
          const list = cells.get(key) ?? [];
          list.push(entryIndex);
          cells.set(key, list);
        }
      }
    }

    for (let sourceIndex = 0; sourceIndex < entries.length; sourceIndex += 1) {
      const source = entries[sourceIndex];
      const candidateIndexes = new Set();
      for (let cy = source.minCellY; cy <= source.maxCellY; cy += 1) {
        for (let cx = source.minCellX; cx <= source.maxCellX; cx += 1) {
          const bucket = cells.get(`${cx}:${cy}`);
          if (!bucket) {
            continue;
          }
          for (const candidateIndex of bucket) {
            if (candidateIndex > sourceIndex) {
              candidateIndexes.add(candidateIndex);
            }
          }
        }
      }

      for (const occluderIndex of candidateIndexes) {
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

    const state = {
      byId,
    };
    this._occlusionStateCacheKey = cacheKey;
    this._occlusionStateCache = state;
    return state;
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
    const occlusionState = layer === "global" ? null : this._buildOcclusionState(camera, visibleWorld);

    for (const stroke of completed) {
      if (
        stroke.sourceWidgetId &&
        typeof this.runtime.isWidgetRasterizedInFrame === "function" &&
        this.runtime.isWidgetRasterizedInFrame(stroke.sourceWidgetId)
      ) {
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
    this._appendSamplesForEvent(stroke, event, camera);
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

  renderWidgetInkForRaster(ctx, camera, widgetId) {
    if (!ctx || !camera || typeof widgetId !== "string" || !widgetId.trim()) {
      return 0;
    }
    let drawCount = 0;
    for (const stroke of this.store.getCompletedStrokes()) {
      if (!this._strokeMatchesActiveContext(stroke)) {
        continue;
      }
      if (stroke.sourceWidgetId !== widgetId) {
        continue;
      }
      if (stroke.layer !== "pdf" && stroke.layer !== "widget") {
        continue;
      }
      const renderable = this._toRenderableStroke(stroke);
      if (!renderable || !Array.isArray(renderable.points) || renderable.points.length < 1) {
        continue;
      }
      drawStroke(ctx, camera, renderable);
      drawCount += 1;
    }
    return drawCount;
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
    this._appendSamplesForEvent(stroke, event, camera);

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
