import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { resolveWidgetLod } from "../../features/widget-system/widget-lod.js";
import {
  drawControlGlyph,
  drawFloatingWidgetTitle,
  drawUnifiedWidgetFrame,
  interactionStateForWidget,
  WIDGET_THEME,
} from "../../features/widget-system/widget-theme.js";
import * as pdfjsLoader from "./pdfjs-loader.js";
import { selectRasterLevelForZoom } from "./pdf-rasterizer.js";
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

function preferredPdfLabel(widget) {
  const title =
    typeof widget?.metadata?.title === "string" && widget.metadata.title.trim()
      ? widget.metadata.title.trim()
      : "";
  const fileName =
    typeof widget?.fileName === "string" && widget.fileName.trim()
      ? widget.fileName.trim()
      : "";
  return title || fileName || "document.pdf";
}

function isRasterDocument(candidate) {
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      Array.isArray(candidate.pages) &&
      candidate.pages.length > 0,
  );
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode raster image."));
    image.src = src;
  });
}

function isWorkerBootstrapError(error) {
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return (
    message.includes("setting up fake worker failed") ||
    message.includes("pdf.worker") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

async function loadPdfDocumentCompat(pdfBytes) {
  if (typeof pdfjsLoader.loadPdfDocumentFromBytes === "function") {
    return pdfjsLoader.loadPdfDocumentFromBytes(pdfBytes);
  }

  const pdfjs = await pdfjsLoader.loadPdfJs();
  const open = async (disableWorker) => {
    const loadingTask = pdfjs.getDocument({
      data: pdfBytes,
      ...(disableWorker ? { disableWorker: true } : {}),
    });
    const pdfDocument = await loadingTask.promise;
    return { pdfDocument, loadingTask };
  };

  try {
    return await open(false);
  } catch (error) {
    if (!isWorkerBootstrapError(error)) {
      throw error;
    }
    return open(true);
  }
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
    this.rasterDocument = isRasterDocument(definition.dataPayload?.rasterDocument)
      ? definition.dataPayload.rasterDocument
      : null;

    this.pdfDocument = null;
    this.pageCount = 0;
    this.pages = [];
    this.documentWorldHeight = 0;
    this.thumbnailCanvas = null;
    this.loading = true;
    this.loadError = null;

    this.whitespaceZones = [];
    this._whitespaceControlRegions = [];
    this._hoveredWhitespaceControl = null;
    this._zonesByPage = new Map();
    this._zoneWorldRects = new Map();
    this._pageLayout = new Map();
    this._pageSegments = new Map();
    this._layoutWidth = this.size.width;
    this._layoutMetrics = {
      gutterWidth: GUTTER_MIN_WORLD,
      pageX: this.position.x + GUTTER_MIN_WORLD,
      pageWidth: Math.max(120, this.size.width - GUTTER_MIN_WORLD - CONTENT_EDGE_PAD_WORLD),
    };
    this._layoutDirty = true;
    this._layoutAnchor = {
      x: this.position.x,
      y: this.position.y,
      width: this.size.width,
      height: this.size.height,
    };
  }

  async initialize() {
    this.loading = true;
    this.loadError = null;
    this.pdfDocument = null;
    this.pageCount = 0;
    this.pages = [];
    this.documentWorldHeight = 0;
    this.thumbnailCanvas = null;

    if (isRasterDocument(this.rasterDocument)) {
      try {
        await this._buildPageLayoutFromRasterDocument();
        await this._buildThumbnail();
        this.loading = false;
      } catch (error) {
        this.loading = false;
        const reason =
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : "Rasterized PDF render failed";
        this.loadError = `${reason}. Reimport "${preferredPdfLabel(this)}".`;
      }
      return;
    }

    if (!(this.pdfBytes instanceof Uint8Array) || this.pdfBytes.length === 0) {
      this.loading = false;
      this.loadError = `PDF data missing. Reimport "${preferredPdfLabel(this)}".`;
      return;
    }

    try {
      const { pdfDocument } = await loadPdfDocumentCompat(this.pdfBytes);
      this.pdfDocument = pdfDocument;
      this.pageCount = this.pdfDocument.numPages;

      await this._buildPageLayout();
      await this._buildThumbnail();
      this.loading = false;
    } catch (error) {
      this.loading = false;
      const reason =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "PDF render failed";
      this.loadError = `${reason}. Reimport "${preferredPdfLabel(this)}".`;
    }
  }

  async _buildPageLayoutFromRasterDocument() {
    if (!isRasterDocument(this.rasterDocument)) {
      return;
    }

    this.pages = [];
    let currentY = 0;
    let totalPageCount = 0;
    const sortedPages = [...this.rasterDocument.pages].sort(
      (a, b) => (Number(a?.pageNumber) || 0) - (Number(b?.pageNumber) || 0),
    );

    for (const sourcePage of sortedPages) {
      const pageNumber = Number(sourcePage?.pageNumber) || totalPageCount + 1;
      const baseWidth = Math.max(1, Number(sourcePage?.width) || 1);
      const baseHeight = Math.max(1, Number(sourcePage?.height) || 1);
      const rasterLevels = [];
      const rawLevels = Array.isArray(sourcePage?.levels) ? sourcePage.levels : [];
      for (const level of rawLevels) {
        if (typeof level?.dataUrl !== "string" || !level.dataUrl) {
          continue;
        }
        const image = await loadImageElement(level.dataUrl);
        rasterLevels.push({
          id: typeof level.id === "string" ? level.id : "",
          width: Math.max(1, Number(level.width) || image.naturalWidth || 1),
          height: Math.max(1, Number(level.height) || image.naturalHeight || 1),
          dataUrl: level.dataUrl,
          image,
        });
      }
      if (rasterLevels.length < 1) {
        continue;
      }

      const worldHeight = Math.max(40, (baseHeight / baseWidth) * this.size.width);
      this.pages.push({
        pageNumber,
        viewportAt1: { width: baseWidth, height: baseHeight },
        baseWorldY: currentY,
        baseWorldHeight: worldHeight,
        rasterLevels,
        pageProxy: null,
        tileCache: null,
      });
      currentY += worldHeight + PAGE_GAP_WORLD;
      totalPageCount += 1;
    }

    if (totalPageCount < 1) {
      throw new Error("Raster document has no renderable pages");
    }

    this.pageCount = totalPageCount;
    this.documentWorldHeight = currentY > 0 ? currentY - PAGE_GAP_WORLD : 0;
    const metrics = this._resolveLayoutMetrics();
    this._refreshPageBaseLayoutForWidth(metrics.pageWidth);
    const requiredHeight = Math.max(MIN_WIDGET_HEIGHT, HEADER_WORLD + this.documentWorldHeight);
    this.size.height = requiredHeight;
    this._markLayoutDirty();
    this._ensureDisplayLayout();
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
    this.size.height = requiredHeight;
    this._markLayoutDirty();
    this._ensureDisplayLayout();
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
    const firstPage = this.pages[0];
    if (!firstPage) {
      return;
    }

    if (Array.isArray(firstPage.rasterLevels) && firstPage.rasterLevels.length > 0) {
      const previewLevel = firstPage.rasterLevels[firstPage.rasterLevels.length - 1];
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(previewLevel.width));
      canvas.height = Math.max(1, Math.floor(previewLevel.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        return;
      }
      ctx.drawImage(previewLevel.image, 0, 0, canvas.width, canvas.height);
      this.thumbnailCanvas = canvas;
      return;
    }

    const firstPageProxy = firstPage.pageProxy;
    if (!firstPageProxy) {
      return;
    }
    const baseViewport = firstPageProxy.getViewport({ scale: 1 });
    const targetWidth = 220;
    const scale = targetWidth / baseViewport.width;
    const viewport = firstPageProxy.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }

    const renderTask = firstPageProxy.render({
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
    return this._zonesByPage.get(pageNumber) ?? [];
  }

  _rebuildZonesByPage() {
    this._zonesByPage.clear();
    for (const zone of this.whitespaceZones) {
      const existing = this._zonesByPage.get(zone.pageNumber) ?? [];
      existing.push(zone);
      this._zonesByPage.set(zone.pageNumber, existing);
    }
    for (const zones of this._zonesByPage.values()) {
      zones.sort((a, b) => a.normalizedY - b.normalizedY);
    }
  }

  _markLayoutDirty() {
    this._layoutDirty = true;
  }

  _hasLayoutAnchorChanged() {
    return (
      this._layoutAnchor.x !== this.position.x ||
      this._layoutAnchor.y !== this.position.y ||
      this._layoutAnchor.width !== this.size.width ||
      this._layoutAnchor.height !== this.size.height
    );
  }

  _captureLayoutAnchor() {
    this._layoutAnchor = {
      x: this.position.x,
      y: this.position.y,
      width: this.size.width,
      height: this.size.height,
    };
  }

  _ensureDisplayLayout() {
    if (!this._layoutDirty && !this._hasLayoutAnchorChanged()) {
      return;
    }
    this._computeDisplayLayout();
    this._layoutDirty = false;
    this._captureLayoutAnchor();
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
    this.size.height = requiredHeight;
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

    fillPill(ctx, badgeX, badgeY, badgeW, badgeH, WIDGET_THEME.palette.pageBadgeBg);
    ctx.fillStyle = WIDGET_THEME.palette.pageBadgeFg;
    ctx.font = `${Math.max(1, 11 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${pageNumber}`, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  _drawWhitespaceZone(ctx, camera, zone, { showGlyph = true, hoveredControl = null } = {}) {
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
      const dividerHovered = hoveredControl?.zoneId === zone.id && hoveredControl?.kind === "expand";
      fillPill(
        ctx,
        dividerX,
        dividerY,
        dividerW,
        dividerH,
        dividerHovered ? WIDGET_THEME.palette.headerAccent : WIDGET_THEME.palette.whitespaceDivider,
      );

      const dividerWorld = camera.screenToWorld(dividerX, dividerY);
      this._whitespaceControlRegions.push({
        zoneId: zone.id,
        kind: "expand",
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
    const collapseHovered = hoveredControl?.zoneId === zone.id && hoveredControl?.kind === "collapse";

    if (collapseHovered) {
      fillPill(ctx, chipX, chipY, chipW, chipH, WIDGET_THEME.palette.whitespaceChip);
      if (showGlyph) {
        drawControlGlyph(ctx, "minus", {
          x: chipX,
          y: chipY,
          size: Math.min(chipW, chipH),
          color: WIDGET_THEME.palette.controlFg,
        });
      }
    } else {
      const dotSize = Math.max(6, Math.min(10, Math.min(chipW, chipH) * 0.42));
      fillPill(
        ctx,
        chipX + (chipW - dotSize) / 2,
        chipY + (chipH - dotSize) / 2,
        dotSize,
        dotSize,
        WIDGET_THEME.palette.headerAccentSoft,
      );
    }

    const chipWorld = camera.screenToWorld(chipX, chipY);
    this._whitespaceControlRegions.push({
      zoneId: zone.id,
      kind: "collapse",
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
    this._rebuildZonesByPage();
    this._markLayoutDirty();
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
    this._markLayoutDirty();
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
    const control = this.getWhitespaceControlAt(worldX, worldY);
    return control?.zoneId ?? null;
  }

  getWhitespaceControlAt(worldX, worldY) {
    for (let index = this._whitespaceControlRegions.length - 1; index >= 0; index -= 1) {
      const region = this._whitespaceControlRegions[index];
      if (
        worldX >= region.x &&
        worldX <= region.x + region.width &&
        worldY >= region.y &&
        worldY <= region.y + region.height
      ) {
        return {
          zoneId: region.zoneId,
          kind: region.kind,
        };
      }
    }
    return null;
  }

  setHoveredWhitespaceControl(control) {
    if (
      !control ||
      typeof control.zoneId !== "string" ||
      !control.zoneId.trim() ||
      (control.kind !== "collapse" && control.kind !== "expand")
    ) {
      this._hoveredWhitespaceControl = null;
      return;
    }

    this._hoveredWhitespaceControl = {
      zoneId: control.zoneId,
      kind: control.kind,
    };
  }

  getWhitespaceZoneWorldRect(zoneId) {
    this._ensureDisplayLayout();
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
    this._ensureDisplayLayout();
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

  getRasterRevision() {
    let tileRevision = 0;
    for (const page of this.pages) {
      const revision = Number(page?.tileCache?.revision) || 0;
      tileRevision = (tileRevision + revision) >>> 0;
    }
    const whitespaceRevision = this.whitespaceZones
      .map((zone) => `${zone.id}:${zone.collapsed ? 1 : 0}:${zone.linkedWidgetId ? 1 : 0}`)
      .join("|");
    const rasterRevision = this.pages
      .map((page) =>
        Array.isArray(page?.rasterLevels)
          ? page.rasterLevels.map((level) => `${level.id}:${level.width}x${level.height}`).join(",")
          : "",
      )
      .join("|");
    return [
      this.loading ? "loading" : "ready",
      this.loadError ?? "",
      this.fileName ?? "",
      this.pageCount,
      this.documentWorldHeight.toFixed(2),
      tileRevision,
      rasterRevision,
      whitespaceRevision,
    ].join("::");
  }

  render(ctx, camera, renderContext) {
    this._ensureDisplayLayout();
    this._whitespaceControlRegions = [];
    const interaction = interactionStateForWidget(this, renderContext);
    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      borderRadius: 18,
      headerWorldHeight: HEADER_WORLD,
    });
    const lod = resolveWidgetLod({
      cameraZoom: camera.zoom,
      viewMode: renderContext?.viewMode,
    });
    const showPageChrome = interaction.revealActions;
    const transformingWidgetId =
      typeof renderContext?.interaction?.transformingWidgetId === "string"
        ? renderContext.interaction.transformingWidgetId
        : null;
    const externalWidgetTransformActive = Boolean(transformingWidgetId && transformingWidgetId !== this.id);
    const titleLabel =
      lod === "compact"
        ? shortName(this.metadata.title)
        : `${shortName(this.metadata.title)} • ${this.pageCount} pages`;
    drawFloatingWidgetTitle(ctx, camera, {
      title: titleLabel,
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
    });

    if (this.loading) {
      ctx.fillStyle = WIDGET_THEME.palette.title;
      ctx.font = `${Math.max(1, 12 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText("Loading document...", frame.screen.x + 18, frame.screen.y + 20 * camera.zoom);
      return;
    }

    if (this.loadError) {
      const inset = 12;
      const bodyX = frame.screen.x + inset;
      const bodyY = frame.screen.y + frame.headerHeight + inset;
      const bodyW = Math.max(40, frame.width - inset * 2);
      const bodyH = Math.max(52, frame.height - frame.headerHeight - inset * 2);
      fillStrokeRoundedRect(
        ctx,
        bodyX,
        bodyY,
        bodyW,
        bodyH,
        12,
        "#f7fbfe",
        WIDGET_THEME.palette.line,
        1,
      );

      const lineY = bodyY + Math.max(14, 18 * camera.zoom);
      ctx.fillStyle = "#9b2b2b";
      ctx.font = `${Math.max(1, 11 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText("PDF unavailable in this section state.", bodyX + 10, lineY);

      ctx.fillStyle = WIDGET_THEME.palette.bodyText;
      ctx.font = `${Math.max(1, 10 * camera.zoom)}px ${WIDGET_THEME.typography.contentFamily}`;
      ctx.fillText(`Please reimport "${preferredPdfLabel(this)}".`, bodyX + 10, lineY + Math.max(14, 16 * camera.zoom));
      return;
    }

    const visibleWorld = this._getVisibleWorldBounds(camera, renderContext);
    if (!visibleWorld || this.pages.length === 0) {
      return;
    }

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
        WIDGET_THEME.palette.line,
        1,
      );

      let drawnTiles = 0;
      if (Array.isArray(pageEntry.rasterLevels) && pageEntry.rasterLevels.length > 0) {
        const mappings = this._getPageSegmentsByNumber(pageEntry.pageNumber)
          .filter((segment) => {
            if (segment.worldEndY <= segment.worldStartY) {
              return false;
            }
            return !(segment.worldEndY < visibleWorld.minY || segment.worldStartY > visibleWorld.maxY);
          })
          .map((segment) => ({
            sourceStartY: segment.sourceStartY,
            sourceEndY: segment.sourceEndY,
            worldStartY: segment.worldStartY,
            worldEndY: segment.worldEndY,
          }));
        const drawLevel = selectRasterLevelForZoom(pageEntry, camera.zoom);
        if (drawLevel?.image) {
          for (const segment of mappings) {
            const srcTop = (segment.sourceStartY / pageEntry.baseWorldHeight) * drawLevel.height;
            const srcBottom = (segment.sourceEndY / pageEntry.baseWorldHeight) * drawLevel.height;
            const srcHeight = Math.max(1, srcBottom - srcTop);
            const worldHeight = Math.max(0.01, segment.worldEndY - segment.worldStartY);
            const segmentScreen = camera.worldToScreen(pageBounds.x, segment.worldStartY);
            ctx.drawImage(
              drawLevel.image,
              0,
              srcTop,
              drawLevel.width,
              srcHeight,
              segmentScreen.x,
              segmentScreen.y,
              pageScreenW,
              worldHeight * camera.zoom,
            );
            drawnTiles += 1;
          }
        }
      } else if (pageEntry.tileCache) {
        const scaleBucket = this._getScaleBucket(camera.zoom);
        const mappings = this._buildPageTileMappings(pageEntry, scaleBucket, visibleWorld);
        if (!externalWidgetTransformActive) {
          pageEntry.tileCache.requestMappedRegions({
            mappings,
            scaleBucket,
          });
        }
        const drawScaleBucket =
          externalWidgetTransformActive
            ? pageEntry.tileCache.closestAvailableScaleBucket(scaleBucket) ?? scaleBucket
            : scaleBucket;

        drawnTiles = pageEntry.tileCache.drawMappedRegions({
          ctx,
          camera,
          mappings,
          scaleBucket: drawScaleBucket,
        });
      }

      if (drawnTiles === 0) {
        if (interaction.showTitle) {
          const screen = camera.worldToScreen(pageBounds.x, pageBounds.y);
          ctx.fillStyle = WIDGET_THEME.palette.mutedText;
          ctx.font = `${Math.max(1, 11 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
          ctx.fillText("...", screen.x + 12, screen.y + 18 * camera.zoom);
        }
      }

      if (showPageChrome && !externalWidgetTransformActive) {
        const zones = this._zonesForPage(pageEntry.pageNumber);
        for (const zone of zones) {
          this._drawWhitespaceZone(ctx, camera, zone, {
            showGlyph: true,
            hoveredControl: this._hoveredWhitespaceControl,
          });
        }
      }

      if (showPageChrome && !externalWidgetTransformActive) {
        this._drawPageBadge(ctx, camera, pageBounds, pageEntry.pageNumber);
      }
    }

    if (
      showPageChrome &&
      !externalWidgetTransformActive &&
      firstVisiblePage !== null &&
      lastVisiblePage !== null
    ) {
      const visibleLabel =
        firstVisiblePage === lastVisiblePage
          ? `${firstVisiblePage}`
          : `${firstVisiblePage}-${lastVisiblePage}`;

      const pillX = frame.screen.x + 3;
      const pillY = frame.screen.y + frame.headerHeight + 8;
      const pillW = Math.max(18, this._layoutMetrics.gutterWidth * camera.zoom - 4);
      const pillH = Math.max(16, 18 * camera.zoom);
      fillPill(ctx, pillX, pillY, pillW, pillH, WIDGET_THEME.palette.pageBadgeBg);
      ctx.fillStyle = WIDGET_THEME.palette.pageBadgeFg;
      ctx.font = `${Math.max(1, 10 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(visibleLabel, pillX + pillW / 2, pillY + pillH / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  renderSnapshot(ctx, camera, renderContext) {
    this._ensureDisplayLayout();
    const interaction = interactionStateForWidget(this, renderContext);
    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      borderRadius: 18,
      headerWorldHeight: HEADER_WORLD,
      collapsedScale: 0.24,
    });
    drawFloatingWidgetTitle(ctx, camera, {
      title: shortName(this.metadata.title),
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
    });

    const inset = 10;
    const thumbX = frame.screen.x + inset;
    const thumbY = frame.screen.y + frame.headerHeight + inset;
    const thumbW = frame.width - inset * 2;
    const thumbH = Math.max(40, frame.height - frame.headerHeight - inset * 2);

    fillStrokeRoundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 12, "#f4f8fb", WIDGET_THEME.palette.line, 1);

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
