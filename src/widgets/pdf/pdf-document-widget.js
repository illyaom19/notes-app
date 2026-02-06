import { WidgetBase } from "../../core/widgets/widget-base.js";
import { loadPdfJs } from "./pdfjs-loader.js";
import { PdfTileCache } from "./pdf-tile-cache.js";

const HEADER_WORLD = 40;
const PAGE_GAP_WORLD = 16;
const MIN_WIDGET_HEIGHT = 320;

function drawFrame(ctx, camera, widget) {
  const screen = camera.worldToScreen(widget.position.x, widget.position.y);
  const width = widget.size.width * camera.zoom;
  const height = widget.size.height * camera.zoom;
  const headerHeight = HEADER_WORLD * camera.zoom;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#6f8faa";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, width, height);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#eff4f8";
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, width, headerHeight);
  ctx.fill();

  return {
    screen,
    width,
    height,
    headerHeight,
  };
}

function intersects(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export class PdfDocumentWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 480, height: 680 },
      metadata: {
        title: definition.metadata?.title ?? definition.dataPayload?.fileName ?? "PDF Document",
      },
    });

    this._hasExplicitSize = Boolean(definition.size);
    this.fileName = definition.dataPayload?.fileName ?? "document.pdf";
    this.pdfBytes = definition.dataPayload?.bytes ?? null;

    this.pdfDocument = null;
    this.pageCount = 0;
    this.pages = [];
    this.documentWorldHeight = 0;
    this.thumbnailCanvas = null;
    this.loading = true;
    this.loadError = null;
  }

  async initialize() {
    if (!(this.pdfBytes instanceof Uint8Array) || this.pdfBytes.length === 0) {
      this.loading = false;
      this.loadError = "Invalid PDF data payload.";
      return;
    }

    try {
      const pdfjs = await loadPdfJs();
      const loadingTask = pdfjs.getDocument({ data: this.pdfBytes });
      this.pdfDocument = await loadingTask.promise;
      this.pageCount = this.pdfDocument.numPages;

      await this._buildPageLayout();
      await this._buildThumbnail();
      this.loading = false;
    } catch (error) {
      this.loading = false;
      this.loadError = error?.message ?? "Failed to load PDF document.";
    }
  }

  async _buildPageLayout() {
    if (!this.pdfDocument) {
      return;
    }

    this.pages = [];
    let currentY = 0;

    for (let pageNumber = 1; pageNumber <= this.pageCount; pageNumber += 1) {
      const pageProxy = await this.pdfDocument.getPage(pageNumber);
      const viewportAt1 = pageProxy.getViewport({ scale: 1 });
      const worldHeight = Math.max(40, (viewportAt1.height / viewportAt1.width) * this.size.width);

      this.pages.push({
        pageNumber,
        pageProxy,
        viewportAt1,
        worldY: currentY,
        worldHeight,
        tileCache: new PdfTileCache(pageProxy),
      });

      currentY += worldHeight + PAGE_GAP_WORLD;
    }

    this.documentWorldHeight = currentY > 0 ? currentY - PAGE_GAP_WORLD : 0;
    const requiredHeight = HEADER_WORLD + this.documentWorldHeight;
    const baseHeight = this._hasExplicitSize ? this.size.height : MIN_WIDGET_HEIGHT;
    this.size.height = Math.max(baseHeight, requiredHeight);
  }

  async _buildThumbnail() {
    const firstPage = this.pages[0]?.pageProxy;
    if (!firstPage) {
      return;
    }

    const baseViewport = firstPage.getViewport({ scale: 1 });
    const targetWidth = 220;
    const scale = targetWidth / baseViewport.width;
    const viewport = firstPage.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }

    const renderTask = firstPage.render({
      canvasContext: ctx,
      viewport,
      intent: "display",
      background: "white",
    });
    await renderTask.promise;
    this.thumbnailCanvas = canvas;
  }

  _getVisibleWorldBounds(camera, renderContext) {
    if (!renderContext) {
      return null;
    }

    const worldA = camera.screenToWorld(0, 0);
    const worldB = camera.screenToWorld(renderContext.width, renderContext.height);
    return {
      minX: Math.min(worldA.x, worldB.x),
      maxX: Math.max(worldA.x, worldB.x),
      minY: Math.min(worldA.y, worldB.y),
      maxY: Math.max(worldA.y, worldB.y),
    };
  }

  _getPageBounds(pageEntry) {
    return {
      x: this.position.x,
      y: this.position.y + HEADER_WORLD + pageEntry.worldY,
      width: this.size.width,
      height: pageEntry.worldHeight,
    };
  }

  _getScaleBucket(zoom) {
    if (zoom >= 2.2) {
      return 3;
    }
    if (zoom >= 1.25) {
      return 2;
    }
    return 1;
  }

  _drawPageBadge(ctx, camera, pageBounds, pageNumber) {
    const screen = camera.worldToScreen(pageBounds.x, pageBounds.y);
    const badgeW = Math.max(40, 56 * camera.zoom);
    const badgeH = Math.max(16, 20 * camera.zoom);

    ctx.fillStyle = "rgba(28, 48, 66, 0.78)";
    ctx.beginPath();
    ctx.rect(screen.x + 8, screen.y + 8, badgeW, badgeH);
    ctx.fill();

    ctx.fillStyle = "#f2f7fb";
    ctx.font = `${Math.max(9, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`p.${pageNumber}`, screen.x + 14, screen.y + 22 * camera.zoom);
  }

  render(ctx, camera, renderContext) {
    const frame = drawFrame(ctx, camera, this);

    if (this.loading) {
      ctx.fillStyle = "#1e3548";
      ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(this.metadata.title, frame.screen.x + 10, frame.screen.y + 16 * camera.zoom);
      ctx.fillStyle = "#4d6071";
      ctx.font = `${Math.max(11, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText("Loading PDF...", frame.screen.x + 12, frame.screen.y + frame.headerHeight + 24 * camera.zoom);
      return;
    }

    if (this.loadError) {
      ctx.fillStyle = "#9b2b2b";
      ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(this.metadata.title, frame.screen.x + 10, frame.screen.y + 16 * camera.zoom);
      ctx.font = `${Math.max(11, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(`PDF error: ${this.loadError}`, frame.screen.x + 12, frame.screen.y + frame.headerHeight + 24 * camera.zoom);
      return;
    }

    const visibleWorld = this._getVisibleWorldBounds(camera, renderContext);
    if (!visibleWorld || this.pages.length === 0) {
      return;
    }

    const docLabel = `${this.metadata.title} (${this.pageCount} pages)`;
    ctx.fillStyle = "#1e3548";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(docLabel, frame.screen.x + 10, frame.screen.y + 16 * camera.zoom);

    let firstVisiblePage = null;
    let lastVisiblePage = null;

    for (const pageEntry of this.pages) {
      const pageBounds = this._getPageBounds(pageEntry);
      const pageWorldRect = {
        minX: pageBounds.x,
        maxX: pageBounds.x + pageBounds.width,
        minY: pageBounds.y,
        maxY: pageBounds.y + pageBounds.height,
      };

      if (!intersects(pageWorldRect, visibleWorld)) {
        continue;
      }

      if (firstVisiblePage === null) {
        firstVisiblePage = pageEntry.pageNumber;
      }
      lastVisiblePage = pageEntry.pageNumber;

      const scaleBucket = this._getScaleBucket(camera.zoom);
      pageEntry.tileCache.requestVisibleTiles({
        camera,
        widgetBounds: pageBounds,
        canvasSize: {
          width: renderContext.width,
          height: renderContext.height,
        },
        scaleBucket,
      });

      const drawnTiles = pageEntry.tileCache.drawVisibleTiles({
        ctx,
        camera,
        widgetBounds: pageBounds,
        canvasSize: {
          width: renderContext.width,
          height: renderContext.height,
        },
        scaleBucket,
      });

      if (drawnTiles === 0) {
        const screen = camera.worldToScreen(pageBounds.x, pageBounds.y);
        ctx.fillStyle = "#5c7084";
        ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
        ctx.fillText(`Rendering page ${pageEntry.pageNumber}...`, screen.x + 12, screen.y + 20 * camera.zoom);
      }

      this._drawPageBadge(ctx, camera, pageBounds, pageEntry.pageNumber);
    }

    if (firstVisiblePage !== null && lastVisiblePage !== null) {
      const visibleLabel =
        firstVisiblePage === lastVisiblePage
          ? `Visible page: ${firstVisiblePage}`
          : `Visible pages: ${firstVisiblePage}-${lastVisiblePage}`;

      ctx.fillStyle = "#5a6f83";
      ctx.font = `${Math.max(9, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(visibleLabel, frame.screen.x + 12, frame.screen.y + 32 * camera.zoom);
    }
  }

  renderSnapshot(ctx, camera) {
    const frame = drawFrame(ctx, camera, this);

    ctx.fillStyle = "#1e3548";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`${this.metadata.title} (collapsed)`, frame.screen.x + 10, frame.screen.y + 16 * camera.zoom);

    const inset = 10;
    const thumbX = frame.screen.x + inset;
    const thumbY = frame.screen.y + frame.headerHeight + inset;
    const thumbW = frame.width - inset * 2;
    const thumbH = Math.max(40, frame.height - frame.headerHeight - inset * 2);

    ctx.fillStyle = "#f4f8fb";
    ctx.beginPath();
    ctx.rect(thumbX, thumbY, thumbW, thumbH);
    ctx.fill();

    if (this.thumbnailCanvas) {
      ctx.drawImage(this.thumbnailCanvas, thumbX, thumbY, thumbW, thumbH);
    } else {
      ctx.fillStyle = "#5c7084";
      ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText("PDF thumbnail", thumbX + 12, thumbY + 20);
    }

    const badgeText = `${this.pageCount} pages`;
    ctx.fillStyle = "rgba(20, 43, 63, 0.86)";
    ctx.beginPath();
    ctx.rect(thumbX + 8, thumbY + 8, Math.max(62, 74 * camera.zoom), Math.max(16, 20 * camera.zoom));
    ctx.fill();

    ctx.fillStyle = "#f2f7fb";
    ctx.font = `${Math.max(9, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(badgeText, thumbX + 14, thumbY + 22 * camera.zoom);
  }
}

export async function createPdfDocumentWidget(definition) {
  const widget = new PdfDocumentWidget(definition);
  await widget.initialize();
  return widget;
}
