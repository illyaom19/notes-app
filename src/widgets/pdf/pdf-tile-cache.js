const TILE_PX = 512;
const MAX_TILE_CACHE_ENTRIES = 180;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeVisibleTileRange({ camera, widgetBounds, viewport, canvasSize }) {
  const worldA = camera.screenToWorld(0, 0);
  const worldB = camera.screenToWorld(canvasSize.width, canvasSize.height);

  const minX = Math.min(worldA.x, worldB.x);
  const maxX = Math.max(worldA.x, worldB.x);
  const minY = Math.min(worldA.y, worldB.y);
  const maxY = Math.max(worldA.y, worldB.y);

  const left = Math.max(widgetBounds.x, minX);
  const right = Math.min(widgetBounds.x + widgetBounds.width, maxX);
  const top = Math.max(widgetBounds.y, minY);
  const bottom = Math.min(widgetBounds.y + widgetBounds.height, maxY);

  if (right <= left || bottom <= top) {
    return null;
  }

  const u0 = clamp((left - widgetBounds.x) / widgetBounds.width, 0, 1);
  const u1 = clamp((right - widgetBounds.x) / widgetBounds.width, 0, 1);
  const v0 = clamp((top - widgetBounds.y) / widgetBounds.height, 0, 1);
  const v1 = clamp((bottom - widgetBounds.y) / widgetBounds.height, 0, 1);

  const pxLeft = u0 * viewport.width;
  const pxRight = Math.max(pxLeft + 1, u1 * viewport.width);
  const pxTop = v0 * viewport.height;
  const pxBottom = Math.max(pxTop + 1, v1 * viewport.height);

  const cols = Math.max(1, Math.ceil(viewport.width / TILE_PX));
  const rows = Math.max(1, Math.ceil(viewport.height / TILE_PX));

  const xStart = clamp(Math.floor(pxLeft / TILE_PX), 0, cols - 1);
  const xEnd = clamp(Math.floor((pxRight - 1) / TILE_PX), 0, cols - 1);
  const yStart = clamp(Math.floor(pxTop / TILE_PX), 0, rows - 1);
  const yEnd = clamp(Math.floor((pxBottom - 1) / TILE_PX), 0, rows - 1);

  return {
    xStart,
    xEnd,
    yStart,
    yEnd,
    cols,
    rows,
  };
}

export class PdfTileCache {
  constructor(pageProxy) {
    this.page = pageProxy;
    this.tiles = new Map();
    this.pending = new Map();
    this.queue = [];
    this.processing = false;
  }

  requestVisibleTiles({ camera, widgetBounds, canvasSize, scaleBucket }) {
    const viewport = this.page.getViewport({ scale: scaleBucket });
    const range = computeVisibleTileRange({
      camera,
      widgetBounds,
      viewport,
      canvasSize,
    });

    if (!range) {
      return;
    }

    for (let tileY = range.yStart; tileY <= range.yEnd; tileY += 1) {
      for (let tileX = range.xStart; tileX <= range.xEnd; tileX += 1) {
        const key = this._tileKey(scaleBucket, tileX, tileY);
        if (this.tiles.has(key) || this.pending.has(key)) {
          continue;
        }
        this.pending.set(key, true);
        this.queue.push({ key, scaleBucket, tileX, tileY, viewport });
      }
    }

    void this._drainQueue();
  }

  drawVisibleTiles({ ctx, camera, widgetBounds, canvasSize, scaleBucket }) {
    const viewport = this.page.getViewport({ scale: scaleBucket });
    const range = computeVisibleTileRange({
      camera,
      widgetBounds,
      viewport,
      canvasSize,
    });

    if (!range) {
      return 0;
    }

    let drawCount = 0;
    for (let tileY = range.yStart; tileY <= range.yEnd; tileY += 1) {
      for (let tileX = range.xStart; tileX <= range.xEnd; tileX += 1) {
        const key = this._tileKey(scaleBucket, tileX, tileY);
        const tile = this.tiles.get(key);
        if (!tile) {
          continue;
        }

        const tileWorldX = widgetBounds.x + (tileX * TILE_PX / viewport.width) * widgetBounds.width;
        const tileWorldY = widgetBounds.y + (tileY * TILE_PX / viewport.height) * widgetBounds.height;
        const tileWorldWidth = (tile.canvas.width / viewport.width) * widgetBounds.width;
        const tileWorldHeight = (tile.canvas.height / viewport.height) * widgetBounds.height;

        const screen = camera.worldToScreen(tileWorldX, tileWorldY);
        const screenW = tileWorldWidth * camera.zoom;
        const screenH = tileWorldHeight * camera.zoom;

        ctx.drawImage(tile.canvas, screen.x, screen.y, screenW, screenH);
        drawCount += 1;
      }
    }

    return drawCount;
  }

  _tileKey(scaleBucket, tileX, tileY) {
    return `${scaleBucket}:${tileX}:${tileY}`;
  }

  async _drainQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      try {
        const tile = await this._renderTile(next);
        this.tiles.set(next.key, tile);
        if (this.tiles.size > MAX_TILE_CACHE_ENTRIES) {
          const oldestKey = this.tiles.keys().next().value;
          this.tiles.delete(oldestKey);
        }
      } catch (_error) {
        // Skip failed tiles and continue queue.
      } finally {
        this.pending.delete(next.key);
      }
    }
    this.processing = false;
  }

  async _renderTile({ tileX, tileY, viewport }) {
    const sourceX = tileX * TILE_PX;
    const sourceY = tileY * TILE_PX;

    const tileWidth = Math.max(1, Math.min(TILE_PX, Math.ceil(viewport.width - sourceX)));
    const tileHeight = Math.max(1, Math.min(TILE_PX, Math.ceil(viewport.height - sourceY)));

    const canvas = document.createElement("canvas");
    canvas.width = tileWidth;
    canvas.height = tileHeight;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Unable to create tile canvas context.");
    }

    const renderTask = this.page.render({
      canvasContext: ctx,
      viewport,
      transform: [1, 0, 0, 1, -sourceX, -sourceY],
      intent: "display",
      background: "white",
    });

    await renderTask.promise;
    return {
      canvas,
      x: tileX,
      y: tileY,
    };
  }
}
