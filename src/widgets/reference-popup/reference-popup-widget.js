import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { resolveWidgetLod, widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import { drawControlGlyph, interactionStateForWidget, WIDGET_THEME } from "../../features/widget-system/widget-theme.js";

const HEADER_HEIGHT = 34;
const MIN_SIZE = { width: 180, height: 120 };
const SOURCE_BUTTON_SIZE = { width: 82, height: 22 };
const CONTROL_SIZE_WORLD = 22;
const CONTROL_PAD_WORLD = 8;
const CONTROL_GAP_WORLD = 6;
const PANEL_INSET_WORLD = 8;
const BODY_INSET_WORLD = 10;

function normalizeTagLabel(tag) {
  if (typeof tag !== "string") {
    return "";
  }
  const trimmed = tag.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function buildInfoRows({ popupMetadata, citation }) {
  const rows = [];
  if (citation?.sourceTitle) {
    rows.push(`Source: ${citation.sourceTitle}`);
  }

  const details = [];
  if (citation?.author) {
    details.push(citation.author);
  }
  if (citation?.publisher) {
    details.push(citation.publisher);
  }
  if (citation?.attributionText) {
    details.push(citation.attributionText);
  }
  if (details.length > 0) {
    rows.push(details.join(" • "));
  }

  const tags = Array.isArray(popupMetadata?.tags)
    ? popupMetadata.tags.map((entry) => normalizeTagLabel(entry)).filter(Boolean)
    : [];
  if (tags.length > 0) {
    rows.push(`Tags: ${tags.join(" ")}`);
  }

  if (citation?.url) {
    rows.push(ellipsis(citation.url, 90));
  }

  return rows;
}

export class ReferencePopupWidget extends WidgetBase {
  constructor(definition) {
    const title = definition.metadata?.title ?? "Reference";
    const popupMetadata = normalizePopupMetadata(definition.metadata?.popupMetadata, title);

    super({
      ...definition,
      size: {
        width: Math.max(MIN_SIZE.width, definition.size?.width ?? 280),
        height: Math.max(MIN_SIZE.height, definition.size?.height ?? 210),
      },
      metadata: {
        title,
        minimized: Boolean(definition.metadata?.minimized),
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
  }

  get displayHeight() {
    if (this.metadata.minimized) {
      return HEADER_HEIGHT;
    }
    return this.size.height;
  }

  _headerRect() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.size.width,
      height: HEADER_HEIGHT,
    };
  }

  _resizeHandleRect() {
    const handleSize = CONTROL_SIZE_WORLD;
    return {
      x: this.position.x + this.size.width - handleSize,
      y: this.position.y + this.displayHeight - handleSize,
      width: handleSize,
      height: handleSize,
    };
  }

  _minimizeButtonRect() {
    const closeX = this.position.x + this.size.width - CONTROL_PAD_WORLD - CONTROL_SIZE_WORLD;
    return {
      x: closeX - CONTROL_GAP_WORLD - CONTROL_SIZE_WORLD,
      y: this.position.y + CONTROL_PAD_WORLD,
      width: CONTROL_SIZE_WORLD,
      height: CONTROL_SIZE_WORLD,
    };
  }

  _closeButtonRect() {
    return {
      x: this.position.x + this.size.width - CONTROL_PAD_WORLD - CONTROL_SIZE_WORLD,
      y: this.position.y + CONTROL_PAD_WORLD,
      width: CONTROL_SIZE_WORLD,
      height: CONTROL_SIZE_WORLD,
    };
  }

  _sourceButtonRect() {
    return {
      x: this.position.x + this.size.width - SOURCE_BUTTON_SIZE.width - (PANEL_INSET_WORLD + BODY_INSET_WORLD),
      y: this.position.y + HEADER_HEIGHT + PANEL_INSET_WORLD + BODY_INSET_WORLD,
      width: SOURCE_BUTTON_SIZE.width,
      height: SOURCE_BUTTON_SIZE.height,
    };
  }

  hasSourceAction() {
    return isLikelyHttpUrl(this.citation?.url);
  }

  containsWorldPoint(worldX, worldY) {
    const minX = this.position.x;
    const minY = this.position.y;
    const maxX = minX + this.size.width;
    const maxY = minY + this.displayHeight;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  getControlAt(worldX, worldY) {
    if (this._revealActions) {
      const controls = [
        ["minimize", this._minimizeButtonRect()],
        ["close", this._closeButtonRect()],
        ["resize", this._resizeHandleRect()],
      ];

      for (const [key, rect] of controls) {
        if (
          worldX >= rect.x &&
          worldX <= rect.x + rect.width &&
          worldY >= rect.y &&
          worldY <= rect.y + rect.height
        ) {
          return key;
        }
      }
    }

    if (!this.metadata.minimized && this._revealActions && this.hasSourceAction()) {
      const sourceRect = this._sourceButtonRect();
      if (
        worldX >= sourceRect.x &&
        worldX <= sourceRect.x + sourceRect.width &&
        worldY >= sourceRect.y &&
        worldY <= sourceRect.y + sourceRect.height
      ) {
        return "open-source";
      }
    }

    const header = this._headerRect();
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

  setMinimized(nextMinimized) {
    this.metadata.minimized = Boolean(nextMinimized);
  }

  toggleMinimized() {
    this.metadata.minimized = !this.metadata.minimized;
  }

  setImageData(dataUrl) {
    this.imageDataUrl = dataUrl;
    this.contentType = "image";
    this.textContent = "";
    this._image = new Image();
    this._image.src = dataUrl;
  }

  resizeFromCorner(deltaWidth, deltaHeight) {
    this.size.width = clamp(this.size.width + deltaWidth, MIN_SIZE.width, 800);
    this.size.height = clamp(this.size.height + deltaHeight, MIN_SIZE.height, 640);
  }

  render(ctx, camera, renderContext) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.displayHeight * camera.zoom;
    const headerHeight = HEADER_HEIGHT * camera.zoom;
    const lod = resolveWidgetLod({
      cameraZoom: camera.zoom,
      viewMode: renderContext?.viewMode,
    });
    const interaction = interactionStateForWidget(this, renderContext);
    this._revealActions = interaction.revealActions && lod === "detail";

    const popupMetadata = normalizePopupMetadata(this.metadata.popupMetadata, this.metadata.title);
    this.metadata.popupMetadata = popupMetadata;
    this.metadata.title = popupMetadata.title;

    fillStrokeRoundedRect(
      ctx,
      screen.x,
      screen.y,
      width,
      height,
      16,
      WIDGET_THEME.palette.frameFill,
      interaction.focused ? WIDGET_THEME.palette.frameStroke : WIDGET_THEME.palette.frameStrokeSoft,
      interaction.focused ? 1.35 : 1.05,
    );

    fillPill(
      ctx,
      screen.x + 8,
      screen.y + 6,
      Math.max(12, width - 16),
      Math.max(6, Math.min(14, headerHeight * 0.28)),
      interaction.focused ? WIDGET_THEME.palette.headerAccent : WIDGET_THEME.palette.headerAccentSoft,
    );

    if (interaction.focused) {
      ctx.fillStyle = WIDGET_THEME.palette.title;
      ctx.font = `${Math.max(1, 12 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText(this.metadata.title, screen.x + 14, screen.y + 26);
    }

    if (this.metadata.minimized) {
      return;
    }

    const bodyTop = interaction.focused ? screen.y + headerHeight : screen.y + 12;
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

    const sourceRect = this._sourceButtonRect();
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

    const topInset = BODY_INSET_WORLD + (sourceButtonVisible ? SOURCE_BUTTON_SIZE.height * camera.zoom + 7 : 0);
    const showInfoSection = lod === "detail" && panelH >= 112 * camera.zoom;
    const contentX = panelX + BODY_INSET_WORLD;
    const contentY = panelY + topInset;
    const contentW = panelW - BODY_INSET_WORLD * 2;
    const infoHeight = showInfoSection ? Math.max(54 * camera.zoom, Math.min(96 * camera.zoom, panelH * 0.36)) : 0;
    const contentH = Math.max(
      30 * camera.zoom,
      panelH - topInset - BODY_INSET_WORLD - (showInfoSection ? infoHeight + 8 : 0),
    );

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

    if (showInfoSection) {
      const infoX = panelX + BODY_INSET_WORLD;
      const infoY = panelY + panelH - infoHeight - BODY_INSET_WORLD;
      const infoW = panelW - BODY_INSET_WORLD * 2;
      const infoRows = buildInfoRows({ popupMetadata, citation: this.citation });
      fillStrokeRoundedRect(
        ctx,
        infoX,
        infoY,
        infoW,
        infoHeight,
        10,
        WIDGET_THEME.palette.infoFill,
        WIDGET_THEME.palette.infoStroke,
        1,
      );

      ctx.fillStyle = WIDGET_THEME.palette.headerAccent;
      ctx.font = `${Math.max(1, 9 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText("Info", infoX + 8 * camera.zoom, infoY + 14 * camera.zoom);

      ctx.fillStyle = WIDGET_THEME.palette.mutedText;
      ctx.font = `${Math.max(1, 8.5 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      const detailsLabel = infoRows.length > 0 ? infoRows.join(" · ") : "No source metadata yet.";
      drawWrappedText(
        ctx,
        detailsLabel,
        infoX + 8 * camera.zoom,
        infoY + 28 * camera.zoom,
        Math.max(12, infoW - 16 * camera.zoom),
        11.5 * camera.zoom,
        3,
      );
    }

    if (!this._revealActions) {
      return;
    }

    const minimizeRect = this._minimizeButtonRect();
    const closeRect = this._closeButtonRect();
    const resizeRect = this._resizeHandleRect();
    const minimizeScreen = camera.worldToScreen(minimizeRect.x, minimizeRect.y);
    const closeScreen = camera.worldToScreen(closeRect.x, closeRect.y);
    const resizeScreen = camera.worldToScreen(resizeRect.x, resizeRect.y);
    const iconSize = CONTROL_SIZE_WORLD * camera.zoom;
    const handleSize = 18 * camera.zoom;

    fillPill(ctx, minimizeScreen.x, minimizeScreen.y, iconSize, iconSize, WIDGET_THEME.palette.controlBg);
    drawControlGlyph(ctx, "minus", {
      x: minimizeScreen.x,
      y: minimizeScreen.y,
      size: iconSize,
      color: WIDGET_THEME.palette.controlFg,
    });

    fillPill(ctx, closeScreen.x, closeScreen.y, iconSize, iconSize, WIDGET_THEME.palette.controlBg);
    drawControlGlyph(ctx, "close", {
      x: closeScreen.x,
      y: closeScreen.y,
      size: iconSize,
      color: WIDGET_THEME.palette.controlFg,
    });

    fillPill(ctx, resizeScreen.x, resizeScreen.y, handleSize, handleSize, WIDGET_THEME.palette.controlBgSoft);
    drawControlGlyph(ctx, "resize", {
      x: resizeScreen.x,
      y: resizeScreen.y,
      size: handleSize,
      color: WIDGET_THEME.palette.controlFg,
    });
  }

  renderSnapshot(ctx, camera, renderContext) {
    const wasMinimized = this.metadata.minimized;
    this.metadata.minimized = true;
    this.render(ctx, camera, {
      ...renderContext,
      interaction: {
        selectedWidgetId: this.id,
        focusedWidgetId: this.id,
        hoverWidgetId: this.id,
        isTouchPrimary: false,
      },
    });
    this.metadata.minimized = wasMinimized;
  }
}
