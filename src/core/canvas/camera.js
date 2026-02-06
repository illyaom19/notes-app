const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

export class Camera2D {
  constructor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
  }

  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.offsetX) / this.zoom,
      y: (screenY - this.offsetY) / this.zoom,
    };
  }

  worldToScreen(worldX, worldY) {
    return {
      x: worldX * this.zoom + this.offsetX,
      y: worldY * this.zoom + this.offsetY,
    };
  }

  panBy(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  zoomAt(screenX, screenY, zoomFactor) {
    const pointBeforeZoom = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
    this.offsetX = screenX - pointBeforeZoom.x * this.zoom;
    this.offsetY = screenY - pointBeforeZoom.y * this.zoom;
  }

  setCenteredViewport(width, height) {
    this.offsetX = width / 2;
    this.offsetY = height / 2;
  }
}
