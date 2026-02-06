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

  getWidgetCount() {
    return this.widgets.length;
  }

  _bindEvents() {
    window.addEventListener("resize", () => this._resizeToViewport());

    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      this._dragging = true;
      this._lastPointer = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
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
      if (!this._dragging) {
        return;
      }
      this._dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener("pointerup", stopDragging);
    this.canvas.addEventListener("pointercancel", stopDragging);

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

    for (const widget of this.widgets) {
      widget.update(dt);
      widget.render(this.ctx, this.camera);
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
}
