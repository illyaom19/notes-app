import { Camera2D } from "./camera.js";

export class CanvasRuntime {
  constructor({ canvas, onCameraChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = new Camera2D();
    this.widgets = [];
    this.onCameraChange = onCameraChange;
    this._lastFrameAt = performance.now();
    this._dragging = false;
    this._lastPointer = { x: 0, y: 0 };
    this._touchPointers = new Map();
    this._touchGesture = null;
    this._inputHandlers = [];
    this._renderLayers = [];

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
        // Render loop is always active in Sprint 0 for smooth camera interaction.
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
    return true;
  }

  getWidgetById(widgetId) {
    return this.widgets.find((widget) => widget.id === widgetId) ?? null;
  }

  listWidgets() {
    return [...this.widgets];
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

  _bindEvents() {
    window.addEventListener("resize", () => this._resizeToViewport());

    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        event.preventDefault();
        this._touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
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

      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      this._dragging = true;
      this._lastPointer = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
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
      if (event.pointerType === "touch" && this._touchPointers.has(event.pointerId)) {
        this._touchPointers.delete(event.pointerId);
        if (this._touchPointers.size < 2) {
          this._touchGesture = null;
        }
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
      if (event.pointerType === "touch" && this._touchPointers.has(event.pointerId)) {
        this._touchPointers.delete(event.pointerId);
        if (this._touchPointers.size < 2) {
          this._touchGesture = null;
        }
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

  _dispatchPointer(handlerName, event) {
    for (let index = this._inputHandlers.length - 1; index >= 0; index -= 1) {
      const handler = this._inputHandlers[index];
      if (typeof handler[handlerName] !== "function") {
        continue;
      }

      const handled = handler[handlerName](event, {
        camera: this.camera,
        canvas: this.canvas,
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

    this.ctx.clearRect(0, 0, width, height);
    this._drawGrid(width, height);

    for (const layer of this._renderLayers) {
      if (typeof layer.update === "function") {
        layer.update(dt);
      }
      if (typeof layer.render === "function") {
        layer.render(this.ctx, this.camera, {
          width,
          height,
          dpr: window.devicePixelRatio || 1,
        });
      }
    }

    for (const widget of this.widgets) {
      widget.update(dt);
      if (widget.collapsed && typeof widget.renderSnapshot === "function") {
        widget.renderSnapshot(this.ctx, this.camera);
      } else {
        widget.render(this.ctx, this.camera);
      }
    }
  }

  _drawGrid(width, height) {
    const { ctx, camera } = this;
    const spacing = 80;
    const minWorld = camera.screenToWorld(0, 0);
    const maxWorld = camera.screenToWorld(width, height);

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

  _toCanvasPoint({ x, y }) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: x - rect.left,
      y: y - rect.top,
    };
  }
}
