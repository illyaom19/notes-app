import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { resolveWidgetLod, widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import { loadPdfJs } from "./pdfjs-loader.js";
import { PdfTileCache } from "./pdf-tile-cache.js";

const HEADER_WORLD = 40;
const PAGE_GAP_WORLD = 16;
const MIN_WIDGET_HEIGHT = 320;
const COLLAPSED_ZONE_WORLD = 14;
const GUTTER_MIN_WORLD = 22;
const GUTTER_MAX_WORLD = 44;
const CONTENT_EDGE_PAD_WORLD = 6;

function intersects(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function shortName(name) {
  if (!name) {
    return "Document";
  }
  return name.length > 20 ? `${name.slice(0, 17)}...` : name;
}

function drawFrame(ctx, camera, widget) {
  const screen = camera.worldToScreen(widget.position.x, widget.position.y);
  const width = widget.size.width * camera.zoom;
  const height = widget.size.height * camera.zoom;
  const headerHeight = HEADER_WORLD * camera.zoom;

  fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 18, "#ffffff", "#6f8faa", 1.3);
  fillPill(ctx, screen.x + 10, screen.y + 8, Math.max(100, width - 20), Math.max(18, headerHeight - 16), "#eff4f8");

  return {
    screen,
    width,
    height,
    headerHeight,
  };
}

export class PdfDocumentWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 480, height: 680 },
      metadata: {
        title: definition.metadata?.title ?? definition.dataPayload?.fileName ?? "PDF",
      },
    });

    this.fileName = definition.dataPayload?.fileName ?? "document.pdf";
    this.pdfBytes = definition.dataPayload?.bytes ?? null;

    this.pdfDocument = null;
    this.pageCount = 0;
    this.pages = [];
    this.documentWorldHeight = 0;
    this.thumbnailCanvas = null;
    this.loading = true;
    this.loadError = null;

    this.whitespaceZones = [];
    this._whitespaceHitRegions = [];
    this._zoneWorldRects = new Map();
    this._pageLayout = new Map();
    this._pageSegments = new Map();
    this._layoutWidth = this.size.width;
    this._layoutMetrics = {
      gutterWidth: GUTTER_MIN_WORLD,
      pageX: this.position.x + GUTTER_MIN_WORLD,
      pageWidth: Math.max(120, this.size.width - GUTTER_MIN_WORLD - CONTENT_EDGE_PAD_WORLD),
    };
  }

  async initialize() {
    if (!(this.pdfBytes instanceof Uint8Array) || this.pdfBytes.length === 0) {
      this.loading = false;
      this.loadError = "Invalid PDF";
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
      this.loadError = error?.message ?? "PDF load failed";
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
        baseWorldY: currentY,
        baseWorldHeight: worldHeight,
        tileCache: new PdfTileCache(pageProxy),
      });

      currentY += worldHeight + PAGE_GAP_WORLD;
    }

    this.documentWorldHeight = currentY > 0 ? currentY - PAGE_GAP_WORLD : 0;
    const metrics = this._resolveLayoutMetrics();
    this._refreshPageBaseLayoutForWidth(metrics.pageWidth);
    const requiredHeight = Math.max(MIN_WIDGET_HEIGHT, HEADER_WORLD + this.documentWorldHeight);
    if (!Number.isFinite(this.size.height) || this.size.height < requiredHeight) {
      this.size.height = requiredHeight;
    }
    this._computeDisplayLayout();
  }

  _resolveLayoutMetrics() {
    const gutterWidth = Math.max(
      GUTTER_MIN_WORLD,
      Math.min(GUTTER_MAX_WORLD, this.size.width * 0.085),
    );
    const pageX = this.position.x + gutterWidth;
    const pageWidth = Math.max(120, this.size.width - gutterWidth - CONTENT_EDGE_PAD_WORLD);
    return {
      gutterWidth,
      pageX,
      pageWidth,
    };
  }

  _refreshPageBaseLayoutForWidth(pageWidth = this._resolveLayoutMetrics().pageWidth) {
    let currentY = 0;
    for (const pageEntry of this.pages) {
      const ratio = pageEntry.viewportAt1.height / Math.max(1, pageEntry.viewportAt1.width);
      const worldHeight = Math.max(40, ratio * pageWidth);
      pageEntry.baseWorldY = currentY;
      pageEntry.baseWorldHeight = worldHeight;
      currentY += worldHeight + PAGE_GAP_WORLD;
    }
    this.documentWorldHeight = currentY > 0 ? currentY - PAGE_GAP_WORLD : 0;
    this._layoutWidth = pageWidth;
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

  _zoneBaseHeight(zone, pageBaseHeight) {
    return Math.max(8, zone.normalizedHeight * pageBaseHeight);
  }

  _zoneDisplayHeight(zone, pageBaseHeight) {
    if (zone.collapsed) {
      return COLLAPSED_ZONE_WORLD;
    }
    return this._zoneBaseHeight(zone, pageBaseHeight);
  }

  _zoneReduction(zone, pageBaseHeight) {
    const base = this._zoneBaseHeight(zone, pageBaseHeight);
    const display = this._zoneDisplayHeight(zone, pageBaseHeight);
    return Math.max(0, base - display);
  }

  _zonesForPage(pageNumber) {
    return this.whitespaceZones
      .filter((zone) => zone.pageNumber === pageNumber)
      .sort((a, b) => a.normalizedY - b.normalizedY);
  }

  _computeDisplayLayout() {
    const metrics = this._resolveLayoutMetrics();
    this._layoutMetrics = metrics;

    if (this.pages.length > 0 && Math.abs(metrics.pageWidth - this._layoutWidth) > 0.01) {
      this._refreshPageBaseLayoutForWidth(metrics.pageWidth);
    }

    this._zoneWorldRects.clear();
    this._pageLayout.clear();
    this._pageSegments.clear();

    let cumulativeReduction = 0;

    for (const pageEntry of this.pages) {
      const pageZones = this._zonesForPage(pageEntry.pageNumber);
      const pageReduction = pageZones.reduce(
        (sum, zone) => sum + this._zoneReduction(zone, pageEntry.baseWorldHeight),
        0,
      );

      const pageY = this.position.y + HEADER_WORLD + pageEntry.baseWorldY - cumulativeReduction;
      const pageHeight = Math.max(40, pageEntry.baseWorldHeight - pageReduction);

      this._pageLayout.set(pageEntry.pageNumber, {
        x: metrics.pageX,
        y: pageY,
        width: metrics.pageWidth,
        height: pageHeight,
      });

      const segments = [];
      let consumedSourceY = 0;
      let cursorWorldY = pageY;

      for (const zone of pageZones) {
        const baseY = zone.normalizedY * pageEntry.baseWorldHeight;
        const baseHeight = this._zoneBaseHeight(zone, pageEntry.baseWorldHeight);
        const zoneDisplayHeight = this._zoneDisplayHeight(zone, pageEntry.baseWorldHeight);

        const preSegmentHeight = Math.max(0, baseY - consumedSourceY);
        if (preSegmentHeight > 0.01) {
          segments.push({
            sourceStartY: consumedSourceY,
            sourceEndY: baseY,
            worldStartY: cursorWorldY,
            worldEndY: cursorWorldY + preSegmentHeight,
          });
          cursorWorldY += preSegmentHeight;
        }

        const zoneY = cursorWorldY;
        const zoneHeight = this._zoneDisplayHeight(zone, pageEntry.baseWorldHeight);
        this._zoneWorldRects.set(zone.id, {
          x: metrics.pageX,
          y: zoneY,
          width: metrics.pageWidth,
          height: zoneHeight,
          pageNumber: pageEntry.pageNumber,
        });

        if (!zone.collapsed) {
          segments.push({
            sourceStartY: baseY,
            sourceEndY: baseY + baseHeight,
            worldStartY: zoneY,
            worldEndY: zoneY + zoneDisplayHeight,
          });
        }

        consumedSourceY = baseY + baseHeight;
        cursorWorldY = zoneY + zoneDisplayHeight;
      }

      const remainingHeight = Math.max(0, pageEntry.baseWorldHeight - consumedSourceY);
      if (remainingHeight > 0.01) {
        segments.push({
          sourceStartY: consumedSourceY,
          sourceEndY: pageEntry.baseWorldHeight,
          worldStartY: cursorWorldY,
          worldEndY: cursorWorldY + remainingHeight,
        });
      }

      this._pageSegments.set(pageEntry.pageNumber, segments);
      cumulativeReduction += pageReduction;
    }

    const documentDisplayHeight = Math.max(60, this.documentWorldHeight - cumulativeReduction);
    const requiredHeight = Math.max(MIN_WIDGET_HEIGHT, HEADER_WORLD + documentDisplayHeight);
    if (!Number.isFinite(this.size.height) || this.size.height < requiredHeight) {
      this.size.height = requiredHeight;
    }
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

  _getPageBoundsByNumber(pageNumber) {
    return this._pageLayout.get(pageNumber) ?? null;
  }

  _getPageSegmentsByNumber(pageNumber) {
    return this._pageSegments.get(pageNumber) ?? [];
  }

  _buildPageTileMappings(pageEntry, scaleBucket, visibleWorld) {
    const viewport = pageEntry.pageProxy.getViewport({ scale: scaleBucket });
    const pageBounds = this._getPageBoundsByNumber(pageEntry.pageNumber);
    if (!pageBounds) {
      return [];
    }
    const segments = this._getPageSegmentsByNumber(pageEntry.pageNumber);
    if (segments.length < 1) {
      return [];
    }

    return segments
      .filter((segment) => {
        if (segment.worldEndY <= segment.worldStartY) {
          return false;
        }
        return !(segment.worldEndY < visibleWorld.minY || segment.worldStartY > visibleWorld.maxY);
      })
      .map((segment) => ({
        sourceLeftPx: 0,
        sourceRightPx: viewport.width,
        sourceTopPx: (segment.sourceStartY / pageEntry.baseWorldHeight) * viewport.height,
        sourceBottomPx: (segment.sourceEndY / pageEntry.baseWorldHeight) * viewport.height,
        worldX: pageBounds.x,
        worldY: segment.worldStartY,
        worldWidth: pageBounds.width,
        worldHeight: segment.worldEndY - segment.worldStartY,
      }));
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
    const gutterWidth = Math.max(8, this._layoutMetrics.gutterWidth * camera.zoom);
    const screen = camera.worldToScreen(pageBounds.x, pageBounds.y);
    const badgeW = Math.max(20, Math.min(Math.max(34, 44 * camera.zoom), gutterWidth - 6));
    const badgeH = Math.max(16, 18 * camera.zoom);
    const gutterLeft = screen.x - gutterWidth;
    const badgeX = Math.max(gutterLeft + 3, screen.x - badgeW - 4);
    const badgeY = screen.y + 8;

    fillPill(ctx, badgeX, badgeY, badgeW, badgeH, "rgba(28, 48, 66, 0.78)");
    ctx.fillStyle = "#f2f7fb";
    ctx.font = `${Math.max(1, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${pageNumber}`, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  _drawWhitespaceZone(ctx, camera, zone, { showGlyph = true } = {}) {
    const rect = this._zoneWorldRects.get(zone.id);
    if (!rect) {
      return;
    }

    const screen = camera.worldToScreen(rect.x, rect.y);
    const screenW = rect.width * camera.zoom;
    const screenH = Math.max(8, rect.height * camera.zoom);

    if (zone.collapsed) {
      const dividerX = screen.x + 6;
      const dividerY = screen.y;
      const dividerW = Math.max(20, screenW - 12);
      const dividerH = screenH;
      fillPill(ctx, dividerX, dividerY, dividerW, dividerH, "rgba(220, 232, 242, 0.95)");

      const dividerWorld = camera.screenToWorld(dividerX, dividerY);
      this._whitespaceHitRegions.push({
        zoneId: zone.id,
        x: dividerWorld.x,
        y: dividerWorld.y,
        width: dividerW / camera.zoom,
        height: dividerH / camera.zoom,
      });
      return;
    }

    const gutterWidth = this._layoutMetrics.gutterWidth * camera.zoom;
    const gutterLeft = screen.x - gutterWidth;
    const chipW = Math.max(28, 24 * camera.zoom);
    const chipH = Math.max(28, 24 * camera.zoom);
    const chipX = Math.max(gutterLeft + 3, screen.x - chipW - 6);
    const chipY = screen.y + Math.max(2, Math.min(screenH - chipH - 2, (screenH - chipH) / 2));

    fillPill(ctx, chipX, chipY, chipW, chipH, "#337eab");
    if (showGlyph) {
      ctx.fillStyle = "#f1f7fb";
      ctx.font = `${Math.max(1, 14 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("-", chipX + chipW / 2, chipY + chipH / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    const chipWorld = camera.screenToWorld(chipX, chipY);
    this._whitespaceHitRegions.push({
      zoneId: zone.id,
      x: chipWorld.x,
      y: chipWorld.y,
      width: chipW / camera.zoom,
      height: chipH / camera.zoom,
    });
  }

  setWhitespaceZones(zones) {
    this.whitespaceZones = zones.map((zone) => ({
      id: zone.id,
      pageNumber: zone.pageNumber,
      normalizedY: zone.normalizedY,
      normalizedHeight: zone.normalizedHeight,
      confidence: zone.confidence ?? 0,
      collapsed: Boolean(zone.collapsed),
      linkedWidgetId: zone.linkedWidgetId ?? null,
    }));
    this._computeDisplayLayout();
  }

  getWhitespaceZones() {
    return this.whitespaceZones;
  }

  toggleWhitespaceZone(zoneId) {
    const zone = this.whitespaceZones.find((entry) => entry.id === zoneId);
    if (!zone) {
      return null;
    }

    zone.collapsed = !zone.collapsed;
    this._computeDisplayLayout();
    return zone;
  }

  setWhitespaceZoneLinkedWidget(zoneId, linkedWidgetId) {
    const zone = this.whitespaceZones.find((entry) => entry.id === zoneId);
    if (!zone) {
      return false;
    }
    zone.linkedWidgetId = linkedWidgetId ?? null;
    return true;
  }

  getWhitespaceZoneAt(worldX, worldY) {
    for (let index = this._whitespaceHitRegions.length - 1; index >= 0; index -= 1) {
      const region = this._whitespaceHitRegions[index];
      if (
        worldX >= region.x &&
        worldX <= region.x + region.width &&
        worldY >= region.y &&
        worldY <= region.y + region.height
      ) {
        return region.zoneId;
      }
    }
    return null;
  }

  getWhitespaceZoneWorldRect(zoneId) {
    this._computeDisplayLayout();
    const rect = this._zoneWorldRects.get(zoneId);
    if (!rect) {
      return null;
    }

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  getPageWorldRect(pageNumber) {
    this._computeDisplayLayout();
    const rect = this._pageLayout.get(pageNumber);
    if (!rect) {
      return null;
    }

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  render(ctx, camera, renderContext) {
    this._computeDisplayLayout();
    this._whitespaceHitRegions = [];

    const frame = drawFrame(ctx, camera, this);
    const lod = resolveWidgetLod({
      cameraZoom: camera.zoom,
      screenWidth: frame.width,
      screenHeight: frame.height,
    });
    const isLabelOnly = lod === "label-only";
    const isCompact = lod === "compact";

    if (this.loading) {
      ctx.fillStyle = "#1e3548";
      ctx.font = `${Math.max(1, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(
        isLabelOnly ? widgetTypeTitle(this.type) : "Loading document...",
        frame.screen.x + 18,
        frame.screen.y + 20 * camera.zoom,
      );
      return;
    }

    if (this.loadError) {
      ctx.fillStyle = "#9b2b2b";
      ctx.font = `${Math.max(1, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(
        isLabelOnly ? widgetTypeTitle(this.type) : "Document unavailable",
        frame.screen.x + 18,
        frame.screen.y + 20 * camera.zoom,
      );
      return;
    }

    const visibleWorld = this._getVisibleWorldBounds(camera, renderContext);
    if (!visibleWorld || this.pages.length === 0) {
      return;
    }

    const docLabel = isLabelOnly
      ? widgetTypeTitle(this.type)
      : isCompact
        ? shortName(this.metadata.title)
        : `${shortName(this.metadata.title)} • ${this.pageCount} pages`;
    ctx.fillStyle = "#1e3548";
    ctx.font = `${Math.max(1, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(docLabel, frame.screen.x + 18, frame.screen.y + 20 * camera.zoom);

    let firstVisiblePage = null;
    let lastVisiblePage = null;

    for (const pageEntry of this.pages) {
      const pageBounds = this._getPageBoundsByNumber(pageEntry.pageNumber);
      if (!pageBounds) {
        continue;
      }

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

      const pageScreen = camera.worldToScreen(pageBounds.x, pageBounds.y);
      const pageScreenW = pageBounds.width * camera.zoom;
      const pageScreenH = pageBounds.height * camera.zoom;
      fillStrokeRoundedRect(
        ctx,
        pageScreen.x,
        pageScreen.y,
        pageScreenW,
        pageScreenH,
        10,
        "#ffffff",
        "#d6e4f0",
        1,
      );

      const scaleBucket = this._getScaleBucket(camera.zoom);
      const mappings = this._buildPageTileMappings(pageEntry, scaleBucket, visibleWorld);
      pageEntry.tileCache.requestMappedRegions({
        mappings,
        scaleBucket,
      });

      const drawnTiles = pageEntry.tileCache.drawMappedRegions({
        ctx,
        camera,
        mappings,
        scaleBucket,
      });

      if (drawnTiles === 0) {
        if (!isLabelOnly) {
          const screen = camera.worldToScreen(pageBounds.x, pageBounds.y);
          ctx.fillStyle = "#5c7084";
          ctx.font = `${Math.max(1, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
          ctx.fillText("...", screen.x + 12, screen.y + 18 * camera.zoom);
        }
      }

      if (lod === "detail") {
        const zones = this.whitespaceZones.filter((zone) => zone.pageNumber === pageEntry.pageNumber);
        for (const zone of zones) {
          this._drawWhitespaceZone(ctx, camera, zone, { showGlyph: true });
        }
      }

      if (!isLabelOnly) {
        this._drawPageBadge(ctx, camera, pageBounds, pageEntry.pageNumber);
      }
    }

    if (!isLabelOnly && firstVisiblePage !== null && lastVisiblePage !== null) {
      const visibleLabel =
        firstVisiblePage === lastVisiblePage
          ? `${firstVisiblePage}`
          : `${firstVisiblePage}-${lastVisiblePage}`;

      const pillX = frame.screen.x + 3;
      const pillY = frame.screen.y + frame.headerHeight + 8;
      const pillW = Math.max(18, this._layoutMetrics.gutterWidth * camera.zoom - 4);
      const pillH = Math.max(16, 18 * camera.zoom);
      fillPill(ctx, pillX, pillY, pillW, pillH, "rgba(31, 56, 75, 0.78)");
      ctx.fillStyle = "#f2f7fb";
      ctx.font = `${Math.max(1, 10 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(visibleLabel, pillX + pillW / 2, pillY + pillH / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  renderSnapshot(ctx, camera) {
    this._computeDisplayLayout();
    const frame = drawFrame(ctx, camera, this);

    ctx.fillStyle = "#1e3548";
    ctx.font = `${Math.max(1, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`${shortName(this.metadata.title)} • ${this.pageCount} pages`, frame.screen.x + 18, frame.screen.y + 20 * camera.zoom);

    const inset = 10;
    const thumbX = frame.screen.x + inset;
    const thumbY = frame.screen.y + frame.headerHeight + inset;
    const thumbW = frame.width - inset * 2;
    const thumbH = Math.max(40, frame.height - frame.headerHeight - inset * 2);

    fillStrokeRoundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 12, "#f4f8fb", "#d9e6f2", 1);

    if (this.thumbnailCanvas) {
      ctx.drawImage(this.thumbnailCanvas, thumbX, thumbY, thumbW, thumbH);
    }
  }
}

export async function createPdfDocumentWidget(definition) {
  const widget = new PdfDocumentWidget(definition);
  await widget.initialize();
  return widget;
}
