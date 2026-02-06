import { drawStroke } from "./rendering.js";

export class StrokeRasterCache {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this._lastKey = "";

    if (!this.ctx) {
      throw new Error("Unable to create raster cache context.");
    }
  }

  ensure({ width, height, dpr, camera, revision, strokes }) {
    const cacheKey = [
      width,
      height,
      dpr,
      camera.offsetX.toFixed(2),
      camera.offsetY.toFixed(2),
      camera.zoom.toFixed(4),
      revision,
    ].join("|");

    if (this._lastKey === cacheKey) {
      return;
    }

    this._lastKey = cacheKey;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, width, height);

    for (const stroke of strokes) {
      drawStroke(this.ctx, camera, stroke);
    }
  }

  drawTo(targetCtx, width, height) {
    targetCtx.drawImage(this.canvas, 0, 0, width, height);
  }
}
