import { WidgetBase } from "../../core/widgets/widget-base.js";
import { loadPdfJs } from "./pdfjs-loader.js";
import { PdfTileCache } from "./pdf-tile-cache.js";

const HEADER_HEIGHT = 34;

function drawFrame(ctx, camera, widget) {
  const screen = camera.worldToScreen(widget.position.x, widget.position.y);
  const width = widget.size.width * camera.zoom;
  const height = widget.size.height * camera.zoom;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#6f8faa";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, width, height);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#eff4f8";
  ctx.beginPath();
  ctx.rect(screen.x, screen.y, width, HEADER_HEIGHT);
  ctx.fill();

  return {
    screen,
    width,
    height,
  };
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
    this.page = null;
    this.pageCount = 0;
    this.pageNumber = 1;
    this.tileCache = null;
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
      await this._loadPage(1);
      this.loading = false;
    } catch (error) {
      this.loading = false;
      this.loadError = error?.message ?? "Failed to load PDF document.";
    }
  }

  async _loadPage(pageNumber) {
    if (!this.pdfDocument) {
      return;
    }

    this.pageNumber = pageNumber;
    this.page = await this.pdfDocument.getPage(pageNumber);
    this.tileCache = new PdfTileCache(this.page);

    const pageViewport = this.page.getViewport({ scale: 1 });
    if (!this._hasExplicitSize) {
      const targetWidth = 480;
      this.size = {
        width: targetWidth,
        height: Math.max(320, (pageViewport.height / pageViewport.width) * targetWidth + HEADER_HEIGHT),
      };
    }

    await this._buildThumbnail();
  }

  async _buildThumbnail() {
    if (!this.page) {
      return;
    }

    const baseViewport = this.page.getViewport({ scale: 1 });
    const targetWidth = 220;
    const scale = targetWidth / baseViewport.width;
    const viewport = this.page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }

    const renderTask = this.page.render({
      canvasContext: ctx,
      viewport,
      intent: "display",
      background: "white",
    });
    await renderTask.promise;
    this.thumbnailCanvas = canvas;
  }

  render(ctx, camera, renderContext) {
    const frame = drawFrame(ctx, camera, this);

    ctx.fillStyle = "#1e3548";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    const label = `${this.metadata.title} (${this.pageNumber}/${Math.max(1, this.pageCount)})`;
    ctx.fillText(label, frame.screen.x + 10, frame.screen.y + 22);

    if (this.loading) {
      ctx.fillStyle = "#4d6071";
      ctx.font = `${Math.max(11, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText("Loading PDF...", frame.screen.x + 12, frame.screen.y + HEADER_HEIGHT + 22);
      return;
    }

    if (this.loadError) {
      ctx.fillStyle = "#9b2b2b";
      ctx.font = `${Math.max(11, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(`PDF error: ${this.loadError}`, frame.screen.x + 12, frame.screen.y + HEADER_HEIGHT + 22);
      return;
    }

    if (!this.page || !this.tileCache || !renderContext) {
      return;
    }

    const pageBounds = {
      x: this.position.x,
      y: this.position.y + HEADER_HEIGHT / camera.zoom,
      width: this.size.width,
      height: this.size.height - HEADER_HEIGHT / camera.zoom,
    };

    const scaleBucket = camera.zoom >= 1.25 ? 2 : 1;
    this.tileCache.requestVisibleTiles({
      camera,
      widgetBounds: pageBounds,
      canvasSize: {
        width: renderContext.width,
        height: renderContext.height,
      },
      scaleBucket,
    });

    const drawnTiles = this.tileCache.drawVisibleTiles({
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
      ctx.fillText("Rendering tiles...", screen.x + 12, screen.y + 20);
    }
  }

  renderSnapshot(ctx, camera) {
    const frame = drawFrame(ctx, camera, this);

    ctx.fillStyle = "#1e3548";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`${this.metadata.title} (collapsed)`, frame.screen.x + 10, frame.screen.y + 22);

    const inset = 10;
    const thumbX = frame.screen.x + inset;
    const thumbY = frame.screen.y + HEADER_HEIGHT + inset;
    const thumbW = frame.width - inset * 2;
    const thumbH = Math.max(40, frame.height - HEADER_HEIGHT - inset * 2);

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
  }
}

export async function createPdfDocumentWidget(definition) {
  const widget = new PdfDocumentWidget(definition);
  await widget.initialize();
  return widget;
}
