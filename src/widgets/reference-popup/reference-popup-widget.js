import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { resolveWidgetLod, widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import {
  drawFloatingWidgetTitle,
  drawUnifiedWidgetFrame,
  interactionStateForWidget,
  WIDGET_THEME,
} from "../../features/widget-system/widget-theme.js";

const HEADER_HEIGHT = 34;
const MIN_SIZE = { width: 180, height: 120 };
const MAX_SIZE = { width: 800, height: 640 };
const SOURCE_BUTTON_SIZE = { width: 82, height: 22 };
const CONTROL_SIZE_WORLD = 22;
const PANEL_INSET_WORLD = 8;
const BODY_INSET_WORLD = 10;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function worldFromPixels(camera, px) {
  return px / Math.max(0.25, camera?.zoom ?? 1);
}

function normalizeTags(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const tags = [];
  const seen = new Set();
  for (const entry of values) {
    if (typeof entry !== "string" || !entry.trim()) {
      continue;
    }
    const tag = entry.trim();
    if (seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function normalizePopupMetadata(candidate, fallbackTitle) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return {
    id:
      typeof source.id === "string" && source.id.trim()
        ? source.id
        : globalThis.crypto?.randomUUID?.() ?? `popup-${Date.now()}`,
    title:
      typeof source.title === "string" && source.title.trim() ? source.title.trim() : fallbackTitle,
    type:
      typeof source.type === "string" && source.type.trim() ? source.type.trim() : "reference-popup",
    sourceDocumentId:
      typeof source.sourceDocumentId === "string" && source.sourceDocumentId.trim()
        ? source.sourceDocumentId
        : null,
    tags: normalizeTags(source.tags),
    createdAt:
      typeof source.createdAt === "string" && source.createdAt.trim()
        ? source.createdAt
        : new Date().toISOString(),
  };
}

function normalizeContentType(value, fallback = "text") {
  if (value === "image" || value === "definition") {
    return value;
  }
  if (fallback === "image" || fallback === "definition") {
    return fallback;
  }
  return "text";
}

function normalizeCitation(candidate, fallbackSourceTitle, snippetType) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const sourceTitle =
    typeof candidate.sourceTitle === "string" && candidate.sourceTitle.trim()
      ? candidate.sourceTitle.trim()
      : typeof fallbackSourceTitle === "string" && fallbackSourceTitle.trim()
        ? fallbackSourceTitle.trim()
        : "Source";
  const url = typeof candidate.url === "string" && candidate.url.trim() ? candidate.url.trim() : "";
  const attributionText =
    typeof candidate.attributionText === "string" && candidate.attributionText.trim()
      ? candidate.attributionText.trim()
      : sourceTitle;

  const citation = {
    sourceTitle,
    url,
    accessedAt:
      typeof candidate.accessedAt === "string" && candidate.accessedAt.trim()
        ? candidate.accessedAt
        : new Date().toISOString(),
    snippetType: normalizeContentType(candidate.snippetType, snippetType),
    attributionText,
  };

  if (typeof candidate.author === "string" && candidate.author.trim()) {
    citation.author = candidate.author.trim();
  }
  if (typeof candidate.publisher === "string" && candidate.publisher.trim()) {
    citation.publisher = candidate.publisher.trim();
  }

  return citation;
}

function isLikelyHttpUrl(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return false;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function ellipsis(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 3))}...`;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const source = typeof text === "string" ? text.trim() : "";
  if (!source) {
    return 0;
  }

  const words = source.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length >= maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (lines.length >= maxLines && current) {
    lines[maxLines - 1] = ellipsis(lines[maxLines - 1], Math.max(4, Math.floor(maxWidth / 6)));
  }

  let rendered = 0;
  for (const line of lines.slice(0, maxLines)) {
    ctx.fillText(line, x, y + rendered * lineHeight);
    rendered += 1;
  }
  return rendered;
}

export class ReferencePopupWidget extends WidgetBase {
  constructor(definition) {
    const title = definition.metadata?.title ?? "Reference";
    const popupMetadata = normalizePopupMetadata(definition.metadata?.popupMetadata, title);
    const legacyMinimized = Boolean(definition.metadata?.minimized);

    super({
      ...definition,
      collapsed: typeof definition.collapsed === "boolean" ? definition.collapsed : legacyMinimized,
      size: {
        width: Math.max(MIN_SIZE.width, definition.size?.width ?? 280),
        height: Math.max(MIN_SIZE.height, definition.size?.height ?? 210),
      },
      metadata: {
        title,
        popupMetadata,
      },
    });

    this.imageDataUrl = definition.dataPayload?.imageDataUrl ?? null;
    this.textContent =
      typeof definition.dataPayload?.textContent === "string" ? definition.dataPayload.textContent : "";
    this._image = null;
    this.sourceLabel = definition.dataPayload?.sourceLabel ?? "Source";
    this.contentType = normalizeContentType(
      definition.dataPayload?.contentType,
      this.imageDataUrl ? "image" : "text",
    );
    this.citation = normalizeCitation(definition.dataPayload?.citation, this.sourceLabel, this.contentType);
    this.researchCaptureId =
      typeof definition.dataPayload?.researchCaptureId === "string" &&
      definition.dataPayload.researchCaptureId.trim()
        ? definition.dataPayload.researchCaptureId
        : null;

    if (this.imageDataUrl) {
      this._image = new Image();
      this._image.src = this.imageDataUrl;
    }

    const hasImage = Boolean(this.imageDataUrl);
    const hasText = Boolean(this.textContent.trim());
    if (this.contentType === "image" && !hasImage && hasText) {
      this.contentType = "text";
    } else if (this.contentType !== "image" && !hasText && hasImage) {
      this.contentType = "image";
    }

    if (this.citation?.sourceTitle) {
      this.sourceLabel = this.citation.sourceTitle;
    }

    this._revealActions = false;
    this._aspectRatio = Math.max(0.5, this.size.width / Math.max(1, this.size.height));
  }

  get displayHeight() {
    return this.size.height;
  }

  _headerRect(camera) {
    const bounds = this.getInteractionBounds(camera);
    return {
      x: this.position.x,
      y: this.position.y,
      width: bounds.width,
      height: HEADER_HEIGHT,
    };
  }

  _resizeHandleRect(camera) {
    const handleSize = worldFromPixels(camera, CONTROL_SIZE_WORLD);
    return {
      x: this.position.x + this.size.width - handleSize,
      y: this.position.y + this.displayHeight - handleSize,
      width: handleSize,
      height: handleSize,
    };
  }

  _sourceButtonRect(camera) {
    const sourceWidth = worldFromPixels(camera, SOURCE_BUTTON_SIZE.width);
    const sourceHeight = worldFromPixels(camera, SOURCE_BUTTON_SIZE.height);
    const panelInset = worldFromPixels(camera, PANEL_INSET_WORLD);
    const bodyInset = worldFromPixels(camera, BODY_INSET_WORLD);
    return {
      x: this.position.x + this.size.width - sourceWidth - (panelInset + bodyInset),
      y: this.position.y + HEADER_HEIGHT + panelInset + bodyInset,
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  hasSourceAction() {
    return isLikelyHttpUrl(this.citation?.url);
  }

  containsWorldPoint(worldX, worldY, camera) {
    const bounds = this.getInteractionBounds(camera);
    const minX = this.position.x;
    const minY = this.position.y;
    const maxX = minX + bounds.width;
    const maxY = minY + bounds.height;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  getControlAt(worldX, worldY, camera) {
    const controlCamera = camera ?? { zoom: 1 };
    if (this._revealActions && this.hasSourceAction()) {
      const sourceRect = this._sourceButtonRect(controlCamera);
      if (
        worldX >= sourceRect.x &&
        worldX <= sourceRect.x + sourceRect.width &&
        worldY >= sourceRect.y &&
        worldY <= sourceRect.y + sourceRect.height
      ) {
        return "open-source";
      }
    }

    const header = this._headerRect(controlCamera);
    if (
      worldX >= header.x &&
      worldX <= header.x + header.width &&
      worldY >= header.y &&
      worldY <= header.y + header.height
    ) {
      return "drag";
    }

    return null;
  }

  setImageData(dataUrl) {
    this.imageDataUrl = dataUrl;
    this.contentType = "image";
    this.textContent = "";
    this._image = new Image();
    this._image.src = dataUrl;
  }

  resizeFromCorner(deltaWidth, deltaHeight) {
    const ratio = Math.max(0.5, this._aspectRatio || this.size.width / Math.max(1, this.size.height));
    const weightedHeightDelta = deltaHeight * ratio;
    const nextWidth = clamp(
      this.size.width + (Math.abs(weightedHeightDelta) > Math.abs(deltaWidth) ? weightedHeightDelta : deltaWidth),
      MIN_SIZE.width,
      MAX_SIZE.width,
    );
    const nextHeight = clamp(nextWidth / ratio, MIN_SIZE.height, MAX_SIZE.height);
    this.size.width = nextHeight * ratio > MAX_SIZE.width ? MAX_SIZE.width : nextWidth;
    this.size.height = nextHeight;
  }

  render(ctx, camera, renderContext) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const lod = resolveWidgetLod({
      cameraZoom: camera.zoom,
      viewMode: renderContext?.viewMode,
    });
    const interaction = interactionStateForWidget(this, renderContext);
    this._revealActions = interaction.revealActions;

    const popupMetadata = normalizePopupMetadata(this.metadata.popupMetadata, this.metadata.title);
    this.metadata.popupMetadata = popupMetadata;
    this.metadata.title = popupMetadata.title;

    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      borderRadius: 16,
      headerWorldHeight: HEADER_HEIGHT,
    });
    drawFloatingWidgetTitle(ctx, camera, {
      title: this.metadata.title || widgetTypeTitle(this.type),
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
    });

    const width = frame.width;
    const height = frame.height;
    const bodyTop = screen.y + frame.headerHeight;
    const panelX = screen.x + PANEL_INSET_WORLD;
    const panelY = bodyTop + PANEL_INSET_WORLD;
    const panelW = width - PANEL_INSET_WORLD * 2;
    const panelH = Math.max(18, height - (panelY - screen.y) - PANEL_INSET_WORLD);
    fillStrokeRoundedRect(
      ctx,
      panelX,
      panelY,
      panelW,
      panelH,
      12,
      WIDGET_THEME.palette.frameFill,
      WIDGET_THEME.palette.line,
      1,
    );

    const sourceRect = this._sourceButtonRect(camera);
    const sourceScreen = camera.worldToScreen(sourceRect.x, sourceRect.y);
    const sourceButtonVisible = this._revealActions && this.hasSourceAction();
    if (sourceButtonVisible) {
      fillPill(
        ctx,
        sourceScreen.x,
        sourceScreen.y,
        sourceRect.width * camera.zoom,
        sourceRect.height * camera.zoom,
        WIDGET_THEME.palette.headerAccentSoft,
      );
      ctx.fillStyle = WIDGET_THEME.palette.headerAccent;
      ctx.font = `${Math.max(1, 8.5 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText("Source", sourceScreen.x + 8 * camera.zoom, sourceScreen.y + 13 * camera.zoom);
    }

    const topInset = BODY_INSET_WORLD + (sourceButtonVisible ? sourceRect.height * camera.zoom + 7 : 0);
    const contentX = panelX + BODY_INSET_WORLD;
    const contentY = panelY + topInset;
    const contentW = panelW - BODY_INSET_WORLD * 2;
    const contentH = Math.max(30 * camera.zoom, panelH - topInset - BODY_INSET_WORLD);

    fillStrokeRoundedRect(
      ctx,
      contentX,
      contentY,
      contentW,
      contentH,
      10,
      WIDGET_THEME.palette.frameFill,
      WIDGET_THEME.palette.line,
      1,
    );

    if (this.contentType === "image" && this._image) {
      ctx.drawImage(this._image, contentX + 4, contentY + 4, Math.max(10, contentW - 8), Math.max(10, contentH - 8));
    } else {
      ctx.fillStyle = WIDGET_THEME.palette.bodyText;
      ctx.font = `${Math.max(1, 11 * camera.zoom)}px ${WIDGET_THEME.typography.contentFamily}`;
      const text = this.textContent.trim() || widgetTypeTitle(this.type);
      const lineHeight = Math.max(1, 15 * camera.zoom);
      drawWrappedText(
        ctx,
        text,
        contentX + 8,
        contentY + 18 * camera.zoom,
        Math.max(10, contentW - 16),
        lineHeight,
        lod === "detail" ? Math.max(2, Math.floor((contentH - 10 * camera.zoom) / lineHeight)) : 2,
      );
    }

    if (!this._revealActions) {
      return;
    }
  }

  renderSnapshot(ctx, camera, renderContext) {
    const interaction = interactionStateForWidget(this, renderContext);
    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      borderRadius: 16,
      headerWorldHeight: HEADER_HEIGHT,
      collapsedScale: 0.24,
    });
    drawFloatingWidgetTitle(ctx, camera, {
      title: this.metadata.title || widgetTypeTitle(this.type),
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
    });
  }
}
