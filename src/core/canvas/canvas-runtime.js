import { Camera2D } from "./camera.js";
import { resolveWidgetLod } from "../../features/widget-system/widget-lod.js";
import { WIDGET_THEME } from "../../features/widget-system/widget-theme.js";

export class CanvasRuntime {
  constructor({ canvas, onCameraChange, onViewModeChange, onSelectionChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = new Camera2D();
    this.widgets = [];
    this.onCameraChange = onCameraChange;
    this.onViewModeChange = onViewModeChange;
    this.onSelectionChange = onSelectionChange;
    this._lastFrameAt = performance.now();
    this._dragging = false;
    this._lastPointer = { x: 0, y: 0 };
    this._touchPointers = new Map();
    this._touchGesture = null;
    this._touchInteractionPointers = new Set();
    this._touchIgnoredPointers = new Set();
    this._touchControllerOwner = null;
    this._inputHandlers = [];
    this._inputHandlerSeq = 0;
    this._sortedInputHandlers = [];
    this._inputHandlersDirty = false;
    this._renderLayersBeforeWidgets = [];
    this._renderLayersAfterWidgets = [];
    this._overlayLayers = [];
    this._widgetRemovedListeners = new Set();
    this._selectedWidgetId = null;
    this._focusedWidgetId = null;
    this._hoverWidgetId = null;
    this._lastPointerType = "mouse";
    this._viewMode = "interactive";
    this._widgetTransformState = null;
    this._widgetRasterManager = null;
    this._widgetRasterEpoch = 0;
    this._rasterizedWidgetIds = new Set();

    if (!this.ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }

    this._bindEvents();
    this.resizeToViewport();
    requestAnimationFrame((now) => this._frame(now));
  }

  resizeToViewport() {
    this._resizeToViewport();
    this._emitCamera();
  }

  addWidget(widget) {
    widget.mount({
      requestRender: () => {
        // Render loop stays active for camera and widget interaction responsiveness.
      },
    });
    this.widgets.push(widget);
  }

  removeWidgetById(widgetId, { reason = null } = {}) {
    const targetIndex = this.widgets.findIndex((widget) => widget.id === widgetId);
    if (targetIndex < 0) {
      return false;
    }

    const [removed] = this.widgets.splice(targetIndex, 1);
    removed.unmount();

    const previousSelectedId = this._selectedWidgetId;
    const previousFocusedId = this._focusedWidgetId;
    if (this._selectedWidgetId === widgetId) {
      this._selectedWidgetId = null;
    }
    if (this._focusedWidgetId === widgetId) {
      this._focusedWidgetId = null;
    }
    if (previousSelectedId !== this._selectedWidgetId || previousFocusedId !== this._focusedWidgetId) {
      this._emitSelectionChange();
    }

    for (const listener of this._widgetRemovedListeners) {
      try {
        listener({
          widget: removed,
          reason,
        });
      } catch (error) {
        console.error("Widget removal listener failed.", error);
      }
    }
    return true;
  }

  getWidgetById(widgetId) {
    return this.widgets.find((widget) => widget.id === widgetId) ?? null;
  }

  listWidgets() {
    return [...this.widgets];
  }

  bringWidgetToFront(widgetId) {
    const targetIndex = this.widgets.findIndex((widget) => widget.id === widgetId);
    if (targetIndex < 0) {
      return false;
    }

    const [target] = this.widgets.splice(targetIndex, 1);
    this.widgets.push(target);
    return true;
  }

  pickWidgetAtScreenPoint(screenX, screenY) {
    const world = this.camera.screenToWorld(screenX, screenY);
    return this.pickWidgetAtWorldPoint(world.x, world.y);
  }

  pickWidgetAtWorldPoint(worldX, worldY) {
    for (let index = this.widgets.length - 1; index >= 0; index -= 1) {
      const widget = this.widgets[index];
      if (widget.containsWorldPoint(worldX, worldY, this.camera)) {
        return widget;
      }
    }
    return null;
  }

  getWidgetCount() {
    return this.widgets.length;
  }

  getWidgetWorldRect(widgetOrId) {
    const widget = typeof widgetOrId === "string" ? this.getWidgetById(widgetOrId) : widgetOrId;
    return this._widgetWorldRect(widget);
  }

  getSectionWorldBounds() {
    return this._computeSectionWorldBounds();
  }

  getVisibleWorldBounds() {
    return this._visibleWorldBounds(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  focusWidget(widgetId, { fitRatio = 0.75, worldPoint = null } = {}) {
    const widget = this.getWidgetById(widgetId);
    if (!widget) {
      return false;
    }

    const focusRect = this._contentWorldRectForWidget(widget, worldPoint);
    this._fitWorldRectToViewport(focusRect, fitRatio);
    this.bringWidgetToFront(widget.id);
    this.setFocusedWidgetId(widget.id);
    this.setSelectedWidgetId(widget.id);
    this._emitCamera();
    return true;
  }

  focusWidgetAtWorldPoint(worldX, worldY, { fitRatio = 0.75 } = {}) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
      return false;
    }

    const widget = this.pickWidgetAtWorldPoint(worldX, worldY);
    if (!widget) {
      return false;
    }

    return this.focusWidget(widget.id, {
      fitRatio,
      worldPoint: { x: worldX, y: worldY },
    });
  }

  registerInputHandler(handler, { priority = 0 } = {}) {
    const entry = {
      handler,
      priority: Number.isFinite(priority) ? priority : 0,
      sequence: this._inputHandlerSeq += 1,
    };
    this._inputHandlers.push(entry);
    this._inputHandlersDirty = true;
    return () => {
      this._inputHandlers = this._inputHandlers.filter((candidate) => candidate !== entry);
      this._inputHandlersDirty = true;
    };
  }

  registerRenderLayer(layer, { phase = "after-widgets" } = {}) {
    const target = phase === "before-widgets" ? this._renderLayersBeforeWidgets : this._renderLayersAfterWidgets;
    target.push(layer);
    return () => {
      this._renderLayersBeforeWidgets = this._renderLayersBeforeWidgets.filter((entry) => entry !== layer);
      this._renderLayersAfterWidgets = this._renderLayersAfterWidgets.filter((entry) => entry !== layer);
    };
  }

  registerOverlayLayer(layer) {
    this._overlayLayers.push(layer);
    return () => {
      this._overlayLayers = this._overlayLayers.filter((entry) => entry !== layer);
    };
  }

  setWidgetRasterManager(manager) {
    this._widgetRasterManager = manager ?? null;
  }

  getWidgetRasterEpoch() {
    return this._widgetRasterEpoch;
  }

  bumpWidgetRasterEpoch() {
    this._widgetRasterEpoch += 1;
    return this._widgetRasterEpoch;
  }

  isWidgetRasterizedInFrame(widgetId) {
    if (typeof widgetId !== "string" || !widgetId.trim()) {
      return false;
    }
    return this._rasterizedWidgetIds.has(widgetId);
  }

  registerWidgetRemovedListener(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this._widgetRemovedListeners.add(listener);
    return () => {
      this._widgetRemovedListeners.delete(listener);
    };
  }

  captureTouchPointer(pointerId) {
    if (!this._touchPointers.has(pointerId)) {
      return false;
    }

    this._touchPointers.delete(pointerId);
    if (this._touchPointers.size > 0) {
      for (const activePointerId of this._touchPointers.keys()) {
        this._touchIgnoredPointers.add(activePointerId);
      }
      this._touchPointers.clear();
    }
    this._touchInteractionPointers.add(pointerId);
    this._touchGesture = null;
    this._reconcileTouchControllerOwner();
    return true;
  }

  setSelectedWidgetId(widgetId) {
    const nextSelectedId = !widgetId || !this.getWidgetById(widgetId) ? null : widgetId;
    if (nextSelectedId) {
      this.bringWidgetToFront(nextSelectedId);
    }
    if (nextSelectedId === this._selectedWidgetId) {
      return;
    }
    this._selectedWidgetId = nextSelectedId;
    this._emitSelectionChange();
  }

  getSelectedWidgetId() {
    return this._selectedWidgetId;
  }

  setFocusedWidgetId(widgetId) {
    const nextFocusedId = !widgetId || !this.getWidgetById(widgetId) ? null : widgetId;
    if (nextFocusedId === this._focusedWidgetId) {
      return;
    }
    this._focusedWidgetId = nextFocusedId;
    this._emitSelectionChange();
  }

  getFocusedWidgetId() {
    return this._focusedWidgetId;
  }

  getHoveredWidgetId() {
    return this._hoverWidgetId;
  }

  getLastPointerType() {
    return this._lastPointerType;
  }

  getViewMode() {
    return this._viewMode;
  }

  isPeekMode() {
    return this._viewMode === "peek";
  }

  setViewMode(nextMode) {
    const mode = nextMode === "peek" ? "peek" : "interactive";
    if (mode === this._viewMode) {
      return this._viewMode;
    }

    this._viewMode = mode;
    if (mode === "peek") {
      this._fitUsedWorldToViewport(0.92);
      this._dragging = false;
      this._touchPointers.clear();
      this._touchGesture = null;
      this._touchInteractionPointers.clear();
      this._touchIgnoredPointers.clear();
      this._touchControllerOwner = null;
    }
    if (typeof this.onViewModeChange === "function") {
      this.onViewModeChange({
        mode: this._viewMode,
      });
    }
    this._emitCamera();
    return this._viewMode;
  }

  setWidgetTransformState(widgetId = null, mode = null) {
    const normalizedWidgetId =
      typeof widgetId === "string" && widgetId.trim() ? widgetId.trim() : null;
    const normalizedMode =
      normalizedWidgetId && (mode === "move" || mode === "resize") ? mode : null;
    if (!normalizedWidgetId || !normalizedMode) {
      this._widgetTransformState = null;
      return;
    }
    this._widgetTransformState = {
      widgetId: normalizedWidgetId,
      mode: normalizedMode,
    };
  }

  getWidgetTransformState() {
    return this._widgetTransformState ? { ...this._widgetTransformState } : null;
  }

  _widgetWorldRect(widget) {
    if (!widget) {
      return null;
    }
    const bounds = typeof widget.getInteractionBounds === "function"
      ? widget.getInteractionBounds(this.camera)
      : widget.size;
    const width = Math.max(1, bounds?.width ?? 1);
    const height = Math.max(1, bounds?.height ?? 1);
    return {
      x: widget.position.x,
      y: widget.position.y,
      width,
      height,
    };
  }

  _contentWorldRectForWidget(widget, worldPoint = null) {
    if (!widget) {
      return null;
    }

    if (widget.type === "pdf-document" && typeof widget.getPageWorldRect === "function") {
      const point =
        worldPoint && Number.isFinite(worldPoint.x) && Number.isFinite(worldPoint.y)
          ? worldPoint
          : null;
      const pageCount = Number.isFinite(widget.pageCount) ? widget.pageCount : 0;
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const pageRect = widget.getPageWorldRect(pageNumber);
        if (!pageRect) {
          continue;
        }
        if (
          point &&
          point.x >= pageRect.x &&
          point.x <= pageRect.x + pageRect.width &&
          point.y >= pageRect.y &&
          point.y <= pageRect.y + pageRect.height
        ) {
          return pageRect;
        }
      }
    }

    return this._widgetWorldRect(widget);
  }

  _contentWorldRectForWidgetAtPoint(widget, offsetX, offsetY) {
    if (!widget) {
      return null;
    }
    const point = this.camera.screenToWorld(offsetX, offsetY);
    return this._contentWorldRectForWidget(widget, point);
  }

  _fitWorldRectToViewport(rect, fillRatio = 0.75) {
    if (!rect) {
      return;
    }
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const viewportWidth = Math.max(1, this.canvas.clientWidth);
    const viewportHeight = Math.max(1, this.canvas.clientHeight);
    const fit = Math.min((viewportWidth * fillRatio) / width, (viewportHeight * fillRatio) / height);
    const zoom = Math.max(0.25, Math.min(4, fit));

    this.camera.zoom = zoom;
    const centerX = rect.x + width / 2;
    const centerY = rect.y + height / 2;
    this.camera.offsetX = viewportWidth / 2 - centerX * zoom;
    this.camera.offsetY = viewportHeight / 2 - centerY * zoom;
  }

  _fitUsedWorldToViewport(fillRatio = 0.92) {
    const bounds = this._computeSectionWorldBounds();
    if (!bounds) {
      return;
    }

    this._fitWorldRectToViewport(bounds, fillRatio);
  }

  _computeSectionWorldBounds() {
    if (!Array.isArray(this.widgets) || this.widgets.length < 1) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const widget of this.widgets) {
      const rect = this._widgetWorldRect(widget);
      if (!rect) {
        continue;
      }
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.resizeToViewport());

    this.canvas.addEventListener("pointerdown", (event) => {
      this._lastPointerType = event.pointerType || this._lastPointerType;

      if (event.pointerType === "touch") {
        const canDispatchToInteraction = this._touchControllerOwner !== "camera";

        if (canDispatchToInteraction && this._dispatchPointer("onPointerDown", event)) {
          event.preventDefault();
          this._touchInteractionPointers.add(event.pointerId);
          this._reconcileTouchControllerOwner();
          this.canvas.setPointerCapture(event.pointerId);
          return;
        }

        if (this._touchControllerOwner === "interaction") {
          event.preventDefault();
          this._touchIgnoredPointers.add(event.pointerId);
          this._reconcileTouchControllerOwner();
          this.canvas.setPointerCapture(event.pointerId);
          return;
        }

        event.preventDefault();
        this._touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this._reconcileTouchControllerOwner();
        this.canvas.setPointerCapture(event.pointerId);
        if (this._touchPointers.size >= 2) {
          this._touchGesture = this._computeTouchMetrics();
        }
        return;
      }

      if (this._dispatchPointer("onPointerDown", event)) {
        this.canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (event.pointerType === "pen") {
        return;
      }

      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      this._dragging = true;
      this._lastPointer = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      this._lastPointerType = event.pointerType || this._lastPointerType;

      if (event.pointerType === "touch" && this._touchInteractionPointers.has(event.pointerId)) {
        event.preventDefault();
        this._dispatchPointer("onPointerMove", event);
        return;
      }

      if (event.pointerType === "touch" && this._touchIgnoredPointers.has(event.pointerId)) {
        event.preventDefault();
        return;
      }

      if (event.pointerType === "touch" && this._touchPointers.has(event.pointerId)) {
        event.preventDefault();
        const previous = this._touchPointers.get(event.pointerId);
        this._touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (this._touchPointers.size >= 2) {
          const metrics = this._computeTouchMetrics();
          if (this._touchGesture) {
            if (this._touchGesture.distance > 0 && metrics.distance > 0) {
              const zoomFactor = metrics.distance / this._touchGesture.distance;
              this.camera.zoomAt(metrics.center.x, metrics.center.y, zoomFactor);
              this._emitCamera();
            }

            this.camera.panBy(
              metrics.center.x - this._touchGesture.center.x,
              metrics.center.y - this._touchGesture.center.y,
            );
            this._emitCamera();
          }
          this._touchGesture = metrics;
          return;
        }

        this._touchGesture = null;
        if (previous) {
          this.camera.panBy(event.clientX - previous.x, event.clientY - previous.y);
          this._emitCamera();
        }
        return;
      }

      const hoveredWidget = this.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      this._hoverWidgetId = hoveredWidget?.id ?? null;

      if (this._dispatchPointer("onPointerMove", event)) {
        return;
      }

      if (!this._dragging) {
        return;
      }

      const dx = event.clientX - this._lastPointer.x;
      const dy = event.clientY - this._lastPointer.y;
      this._lastPointer = { x: event.clientX, y: event.clientY };
      this.camera.panBy(dx, dy);
      this._emitCamera();
    });

    this.canvas.addEventListener("pointerleave", () => {
      this._hoverWidgetId = null;
    });

    const stopDragging = (event) => {
      this._lastPointerType = event.pointerType || this._lastPointerType;
      if (event.pointerType === "touch" && this._touchInteractionPointers.has(event.pointerId)) {
        event.preventDefault();
        this._dispatchPointer("onPointerUp", event);
        this._touchInteractionPointers.delete(event.pointerId);
        this._reconcileTouchControllerOwner();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (event.pointerType === "touch" && this._touchIgnoredPointers.has(event.pointerId)) {
        this._touchIgnoredPointers.delete(event.pointerId);
        this._reconcileTouchControllerOwner();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (event.pointerType === "touch" && this._touchPointers.has(event.pointerId)) {
        this._dispatchPointer("onPointerUp", event);
        this._touchPointers.delete(event.pointerId);
        if (this._touchPointers.size < 2) {
          this._touchGesture = null;
        }
        this._reconcileTouchControllerOwner();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (this._dispatchPointer("onPointerUp", event)) {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (!this._dragging) {
        return;
      }
      this._dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener("pointerup", stopDragging);
    this.canvas.addEventListener("pointercancel", (event) => {
      this._lastPointerType = event.pointerType || this._lastPointerType;
      if (event.pointerType === "touch" && this._touchInteractionPointers.has(event.pointerId)) {
        event.preventDefault();
        this._dispatchPointer("onPointerCancel", event);
        this._touchInteractionPointers.delete(event.pointerId);
        this._reconcileTouchControllerOwner();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (event.pointerType === "touch" && this._touchIgnoredPointers.has(event.pointerId)) {
        this._touchIgnoredPointers.delete(event.pointerId);
        this._reconcileTouchControllerOwner();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (event.pointerType === "touch" && this._touchPointers.has(event.pointerId)) {
        this._dispatchPointer("onPointerCancel", event);
        this._touchPointers.delete(event.pointerId);
        if (this._touchPointers.size < 2) {
          this._touchGesture = null;
        }
        this._reconcileTouchControllerOwner();
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (this._dispatchPointer("onPointerCancel", event)) {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }
      stopDragging(event);
    });

    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this._lastPointerType = "mouse";
        const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
        this.camera.zoomAt(event.offsetX, event.offsetY, zoomFactor);
        this._emitCamera();
      },
      { passive: false },
    );
  }

  _resizeToViewport() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.camera.offsetX === 0 && this.camera.offsetY === 0) {
      this.camera.setCenteredViewport(width, height);
      this._emitCamera();
    }
  }

  _emitCamera() {
    if (typeof this.onCameraChange === "function") {
      const worldAtCenter = this.camera.screenToWorld(
        this.canvas.clientWidth / 2,
        this.canvas.clientHeight / 2,
      );
      this.onCameraChange({
        x: worldAtCenter.x,
        y: worldAtCenter.y,
        zoom: this.camera.zoom,
      });
    }
  }

  _emitSelectionChange() {
    if (typeof this.onSelectionChange !== "function") {
      return;
    }

    this.onSelectionChange({
      selectedWidgetId: this._selectedWidgetId,
      focusedWidgetId: this._focusedWidgetId,
    });
  }

  _dispatchPointer(handlerName, event) {
    if (this._inputHandlersDirty) {
      this._sortedInputHandlers = [...this._inputHandlers].sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return right.sequence - left.sequence;
      });
      this._inputHandlersDirty = false;
    }

    for (const entry of this._sortedInputHandlers) {
      const handler = entry.handler;
      if (typeof handler[handlerName] !== "function") {
        continue;
      }

      if (this._viewMode === "peek" && handler.allowInPeek !== true) {
        continue;
      }

      const handled = handler[handlerName](event, {
        camera: this.camera,
        canvas: this.canvas,
        viewMode: this._viewMode,
      });
      if (handled) {
        return true;
      }
    }
    return false;
  }

  _frame(now) {
    const dt = now - this._lastFrameAt;
    this._lastFrameAt = now;

    this._render(dt);
    requestAnimationFrame((nextNow) => this._frame(nextNow));
  }

  _render(dt) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const lod = resolveWidgetLod({
      cameraZoom: this.camera.zoom,
      viewMode: this._viewMode,
    });
    const renderContext = {
      width,
      height,
      canvas: this.canvas,
      dpr: window.devicePixelRatio || 1,
      viewMode: this._viewMode,
      lod,
      zoom: this.camera.zoom,
      interaction: {
        selectedWidgetId: this._selectedWidgetId,
        focusedWidgetId: this._focusedWidgetId,
        hoverWidgetId: this._hoverWidgetId,
        isTouchPrimary: this._lastPointerType === "touch",
        transformingWidgetId: this._widgetTransformState?.widgetId ?? null,
        transformingWidgetMode: this._widgetTransformState?.mode ?? null,
      },
      theme: WIDGET_THEME,
    };
    const visibleWorld = this._visibleWorldBounds(width, height);
    this._rasterizedWidgetIds.clear();

    this.ctx.clearRect(0, 0, width, height);
    this._drawGrid(width, height, visibleWorld);

    for (const layer of this._renderLayersBeforeWidgets) {
      if (typeof layer.update === "function") {
        layer.update(dt);
      }
      if (typeof layer.render === "function") {
        layer.render(this.ctx, this.camera, renderContext);
      }
    }

    for (const widget of this.widgets) {
      if (!this._isWidgetVisible(widget, visibleWorld)) {
        continue;
      }

      widget.update(dt);
      const drawWidgetVector = (targetCtx, targetCamera, targetRenderContext) => {
        if (widget.collapsed && typeof widget.renderSnapshot === "function") {
          widget.renderSnapshot(targetCtx, targetCamera, targetRenderContext);
          return;
        }
        widget.render(targetCtx, targetCamera, targetRenderContext);
      };
      if (this._widgetRasterManager && typeof this._widgetRasterManager.renderWidget === "function") {
        const usedRaster = this._widgetRasterManager.renderWidget({
          ctx: this.ctx,
          camera: this.camera,
          widget,
          renderContext,
          drawVector: drawWidgetVector,
        });
        if (usedRaster) {
          this._rasterizedWidgetIds.add(widget.id);
        } else {
          this._rasterizedWidgetIds.delete(widget.id);
        }
      } else {
        this._rasterizedWidgetIds.delete(widget.id);
        drawWidgetVector(this.ctx, this.camera, renderContext);
      }
    }

    for (const layer of this._renderLayersAfterWidgets) {
      if (typeof layer.update === "function") {
        layer.update(dt);
      }
      if (typeof layer.render === "function") {
        layer.render(this.ctx, this.camera, renderContext);
      }
    }

    for (const layer of this._overlayLayers) {
      if (typeof layer.update === "function") {
        layer.update(dt);
      }
      if (typeof layer.render === "function") {
        layer.render(this.ctx, this.camera, renderContext);
      }
    }
  }

  _drawGrid(width, height, visibleWorld = null) {
    const { ctx, camera } = this;
    const spacing = 80;
    const minWorld = visibleWorld
      ? { x: visibleWorld.minX, y: visibleWorld.minY }
      : camera.screenToWorld(0, 0);
    const maxWorld = visibleWorld
      ? { x: visibleWorld.maxX, y: visibleWorld.maxY }
      : camera.screenToWorld(width, height);

    const startX = Math.floor(minWorld.x / spacing) * spacing;
    const endX = Math.ceil(maxWorld.x / spacing) * spacing;
    const startY = Math.floor(minWorld.y / spacing) * spacing;
    const endY = Math.ceil(maxWorld.y / spacing) * spacing;

    ctx.strokeStyle = "#d6dde5";
    ctx.lineWidth = 1;

    for (let x = startX; x <= endX; x += spacing) {
      const screen = camera.worldToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(screen.x, 0);
      ctx.lineTo(screen.x, height);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += spacing) {
      const screen = camera.worldToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, screen.y);
      ctx.lineTo(width, screen.y);
      ctx.stroke();
    }

    const origin = camera.worldToScreen(0, 0);
    ctx.strokeStyle = "#8ba0b2";
    ctx.beginPath();
    ctx.moveTo(origin.x - 12, origin.y);
    ctx.lineTo(origin.x + 12, origin.y);
    ctx.moveTo(origin.x, origin.y - 12);
    ctx.lineTo(origin.x, origin.y + 12);
    ctx.stroke();
  }

  _visibleWorldBounds(width, height) {
    const worldA = this.camera.screenToWorld(0, 0);
    const worldB = this.camera.screenToWorld(width, height);
    return {
      minX: Math.min(worldA.x, worldB.x),
      maxX: Math.max(worldA.x, worldB.x),
      minY: Math.min(worldA.y, worldB.y),
      maxY: Math.max(worldA.y, worldB.y),
    };
  }

  _isWidgetVisible(widget, visibleWorld) {
    if (!widget || !visibleWorld) {
      return false;
    }

    const bounds =
      typeof widget.getInteractionBounds === "function"
        ? widget.getInteractionBounds(this.camera)
        : { width: widget.size?.width ?? 0, height: widget.size?.height ?? 0 };

    const margin = 140 / Math.max(0.25, this.camera.zoom);
    const minX = widget.position.x;
    const minY = widget.position.y;
    const maxX = minX + Math.max(1, bounds.width);
    const maxY = minY + Math.max(1, bounds.height);

    return !(
      maxX < visibleWorld.minX - margin ||
      minX > visibleWorld.maxX + margin ||
      maxY < visibleWorld.minY - margin ||
      minY > visibleWorld.maxY + margin
    );
  }

  _computeTouchMetrics() {
    const touchValues = Array.from(this._touchPointers.values());
    if (touchValues.length < 2) {
      return {
        center: { x: 0, y: 0 },
        distance: 0,
      };
    }

    const first = this._toCanvasPoint(touchValues[0]);
    const second = this._toCanvasPoint(touchValues[1]);
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return {
      center: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
      distance: Math.hypot(dx, dy),
    };
  }

  _reconcileTouchControllerOwner() {
    if (this._touchInteractionPointers.size > 0) {
      this._touchControllerOwner = "interaction";
      this._touchGesture = null;
      return;
    }

    if (this._touchPointers.size > 0) {
      this._touchControllerOwner = "camera";
      return;
    }

    this._touchControllerOwner = null;
    this._touchGesture = null;
  }

  _toCanvasPoint({ x, y }) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: x - rect.left,
      y: y - rect.top,
    };
  }
}
