import { Camera2D } from "./camera.js";

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
    this._renderLayers = [];
    this._overlayLayers = [];
    this._selectedWidgetId = null;
    this._focusedWidgetId = null;
    this._viewMode = "interactive";

    if (!this.ctx) {
      throw new Error("Canvas 2D context unavailable.");
    }

    this._bindEvents();
    this._resizeToViewport();
    requestAnimationFrame((now) => this._frame(now));
  }

  addWidget(widget) {
    widget.mount({
      requestRender: () => {
        // Render loop stays active for camera and widget interaction responsiveness.
      },
    });
    this.widgets.push(widget);
  }

  removeWidgetById(widgetId) {
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
    for (let index = this.widgets.length - 1; index >= 0; index -= 1) {
      const widget = this.widgets[index];
      if (widget.containsWorldPoint(world.x, world.y)) {
        return widget;
      }
    }
    return null;
  }

  getWidgetCount() {
    return this.widgets.length;
  }

  registerInputHandler(handler) {
    this._inputHandlers.push(handler);
    return () => {
      this._inputHandlers = this._inputHandlers.filter((entry) => entry !== handler);
    };
  }

  registerRenderLayer(layer) {
    this._renderLayers.push(layer);
    return () => {
      this._renderLayers = this._renderLayers.filter((entry) => entry !== layer);
    };
  }

  registerOverlayLayer(layer) {
    this._overlayLayers.push(layer);
    return () => {
      this._overlayLayers = this._overlayLayers.filter((entry) => entry !== layer);
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
    if (typeof this.onViewModeChange === "function") {
      this.onViewModeChange({
        mode: this._viewMode,
      });
    }
    return this._viewMode;
  }

  _bindEvents() {
    window.addEventListener("resize", () => this._resizeToViewport());

    this.canvas.addEventListener("pointerdown", (event) => {
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

    const stopDragging = (event) => {
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
    for (let index = this._inputHandlers.length - 1; index >= 0; index -= 1) {
      const handler = this._inputHandlers[index];
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
    const renderContext = {
      width,
      height,
      canvas: this.canvas,
      dpr: window.devicePixelRatio || 1,
      viewMode: this._viewMode,
      lod: this._viewMode === "peek" ? "low" : "full",
    };
    const visibleWorld = this._visibleWorldBounds(width, height);
    const peekMode = this._viewMode === "peek";

    this.ctx.clearRect(0, 0, width, height);
    this._drawGrid(width, height, this._viewMode);

    for (const widget of this.widgets) {
      if (!this._isWidgetVisible(widget, visibleWorld)) {
        continue;
      }

      widget.update(dt);
      if ((peekMode || widget.collapsed) && typeof widget.renderSnapshot === "function") {
        widget.renderSnapshot(this.ctx, this.camera, renderContext);
      } else {
        widget.render(this.ctx, this.camera, renderContext);
      }
    }

    const renderLayers = peekMode
      ? this._renderLayers.filter((layer) => layer?.renderInPeek === true)
      : this._renderLayers;

    // Render layers (for example ink) are painted after widgets so strokes remain visible on top.
    for (const layer of renderLayers) {
      if (typeof layer.update === "function") {
        layer.update(dt);
      }
      if (typeof layer.render === "function") {
        layer.render(this.ctx, this.camera, renderContext);
      }
    }

    const overlayLayers = peekMode
      ? this._overlayLayers.filter((layer) => layer?.renderInPeek === true)
      : this._overlayLayers;

    for (const layer of overlayLayers) {
      if (typeof layer.update === "function") {
        layer.update(dt);
      }
      if (typeof layer.render === "function") {
        layer.render(this.ctx, this.camera, renderContext);
      }
    }
  }

  _drawGrid(width, height, viewMode = "interactive") {
    const { ctx, camera } = this;
    const spacing = viewMode === "peek" ? 180 : 80;
    const minWorld = camera.screenToWorld(0, 0);
    const maxWorld = camera.screenToWorld(width, height);

    const startX = Math.floor(minWorld.x / spacing) * spacing;
    const endX = Math.ceil(maxWorld.x / spacing) * spacing;
    const startY = Math.floor(minWorld.y / spacing) * spacing;
    const endY = Math.ceil(maxWorld.y / spacing) * spacing;

    ctx.strokeStyle = viewMode === "peek" ? "#dbe3ea" : "#d6dde5";
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
    ctx.strokeStyle = viewMode === "peek" ? "#a2b4c4" : "#8ba0b2";
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
        ? widget.getInteractionBounds()
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
