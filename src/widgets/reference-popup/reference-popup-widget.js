import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";

const HEADER_HEIGHT = 34;
const MIN_BODY_HEIGHT = 90;
const MIN_SIZE = { width: 180, height: 120 };
const SOURCE_BUTTON_SIZE = { width: 90, height: 18 };

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

export class ReferencePopupWidget extends WidgetBase {
  constructor(definition) {
    const title = definition.metadata?.title ?? "Ref";
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
    this.sourceLabel = definition.dataPayload?.sourceLabel ?? "Snip";
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
    const handleSize = 18;
    return {
      x: this.position.x + this.size.width - handleSize,
      y: this.position.y + this.displayHeight - handleSize,
      width: handleSize,
      height: handleSize,
    };
  }

  _minimizeButtonRect() {
    return {
      x: this.position.x + this.size.width - 52,
      y: this.position.y + 8,
      width: 16,
      height: 16,
    };
  }

  _closeButtonRect() {
    return {
      x: this.position.x + this.size.width - 28,
      y: this.position.y + 8,
      width: 16,
      height: 16,
    };
  }

  _sourceButtonRect() {
    return {
      x: this.position.x + this.size.width - SOURCE_BUTTON_SIZE.width - 12,
      y: this.position.y + HEADER_HEIGHT + 10,
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

    if (!this.metadata.minimized && this.hasSourceAction()) {
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

  render(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.displayHeight * camera.zoom;
    const headerHeight = HEADER_HEIGHT * camera.zoom;
    const popupMetadata = normalizePopupMetadata(this.metadata.popupMetadata, this.metadata.title);
    this.metadata.popupMetadata = popupMetadata;
    this.metadata.title = popupMetadata.title;

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#ffffff", "#6f8faa", 1.4);
    fillPill(ctx, screen.x + 10, screen.y + 6, Math.max(90, width - 88), 20 * camera.zoom, "#edf4fb");

    const typeLabel = popupMetadata.type.length > 18 ? `${popupMetadata.type.slice(0, 15)}...` : popupMetadata.type;
    const typeChipWidth = Math.max(54, Math.min(122, (typeLabel.length + 3) * 6.5 * camera.zoom));
    fillPill(ctx, screen.x + 16, screen.y + 10 * camera.zoom, typeChipWidth, 12 * camera.zoom, "#d8e9f6");

    ctx.fillStyle = "#245473";
    ctx.font = `${Math.max(8, 9 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(typeLabel, screen.x + 21, screen.y + 19 * camera.zoom);

    ctx.fillStyle = "#17354d";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 16 + typeChipWidth + 8 * camera.zoom, screen.y + 20 * camera.zoom);

    if (popupMetadata.tags.length > 0) {
      const firstTag = popupMetadata.tags[0];
      const tagLabel = `#${firstTag}`;
      const tagX = screen.x + width - 162 * camera.zoom;
      fillPill(ctx, tagX, screen.y + 10 * camera.zoom, 56 * camera.zoom, 12 * camera.zoom, "#e6f0f8");
      ctx.fillStyle = "#43637b";
      ctx.font = `${Math.max(8, 9 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(tagLabel, tagX + 6 * camera.zoom, screen.y + 19 * camera.zoom);
    }

    const minimizeRect = this._minimizeButtonRect();
    const closeRect = this._closeButtonRect();
    const minimizeScreen = camera.worldToScreen(minimizeRect.x, minimizeRect.y);
    const closeScreen = camera.worldToScreen(closeRect.x, closeRect.y);
    const iconSize = 16 * camera.zoom;

    fillPill(ctx, minimizeScreen.x, minimizeScreen.y, iconSize, iconSize, "#dce7f1");
    fillPill(ctx, closeScreen.x, closeScreen.y, iconSize, iconSize, "#dce7f1");

    ctx.fillStyle = "#284760";
    ctx.fillText("^", minimizeScreen.x + 5 * camera.zoom, minimizeScreen.y + 12 * camera.zoom);
    ctx.fillText("x", closeScreen.x + 4 * camera.zoom, closeScreen.y + 12 * camera.zoom);

    if (this.metadata.minimized) {
      return;
    }

    const bodyY = screen.y + headerHeight;
    const bodyH = Math.max(MIN_BODY_HEIGHT * camera.zoom, height - headerHeight);
    const panelX = screen.x + 8;
    const panelY = bodyY + 8;
    const panelW = width - 16;
    const panelH = bodyH - 16;

    fillStrokeRoundedRect(ctx, panelX, panelY, panelW, panelH, 12, "#f4f8fb", "#dbe7f2", 1);

    const sourceRect = this._sourceButtonRect();
    const sourceScreen = camera.worldToScreen(sourceRect.x, sourceRect.y);
    const sourceButtonVisible = this.hasSourceAction();
    if (sourceButtonVisible) {
      fillPill(
        ctx,
        sourceScreen.x,
        sourceScreen.y,
        sourceRect.width * camera.zoom,
        sourceRect.height * camera.zoom,
        "#dbe9f5",
      );
      ctx.fillStyle = "#2d536f";
      ctx.font = `${Math.max(8, 9 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText("Open Source", sourceScreen.x + 8 * camera.zoom, sourceScreen.y + 12 * camera.zoom);
    }

    const topInset = sourceButtonVisible ? 34 : 12;
    const citationVisible = Boolean(this.citation);
    const citationHeight = citationVisible ? Math.max(56 * camera.zoom, panelH * 0.3) : 0;
    const contentX = panelX + 8;
    const contentY = panelY + topInset;
    const contentW = panelW - 16;
    const contentH = Math.max(
      26 * camera.zoom,
      panelH - topInset - (citationVisible ? citationHeight + 10 : 10),
    );

    fillStrokeRoundedRect(ctx, contentX, contentY, contentW, contentH, 10, "#ffffff", "#d7e6f2", 1);

    if (this.contentType === "image" && this._image) {
      ctx.drawImage(this._image, contentX + 4, contentY + 4, Math.max(10, contentW - 8), Math.max(10, contentH - 8));
    } else {
      ctx.fillStyle = "#50697f";
      ctx.font = `${Math.max(9, 10 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      const text = this.textContent.trim() || "No capture";
      drawWrappedText(
        ctx,
        text,
        contentX + 8,
        contentY + 18 * camera.zoom,
        Math.max(10, contentW - 16),
        14 * camera.zoom,
        Math.max(2, Math.floor(contentH / (14 * camera.zoom))),
      );
    }

    if (citationVisible) {
      const cardX = panelX + 8;
      const cardY = panelY + panelH - citationHeight - 8;
      const cardW = panelW - 16;
      const cardH = citationHeight;
      fillStrokeRoundedRect(ctx, cardX, cardY, cardW, cardH, 10, "#eaf3fa", "#d1e2ef", 1);

      ctx.fillStyle = "#21445d";
      ctx.font = `${Math.max(9, 10 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      const sourceTitle = ellipsis(this.citation.sourceTitle, 72);
      ctx.fillText(sourceTitle, cardX + 8, cardY + 14 * camera.zoom);

      const details = [];
      if (this.citation.author) {
        details.push(this.citation.author);
      }
      if (this.citation.publisher) {
        details.push(this.citation.publisher);
      }
      details.push(this.citation.attributionText);

      ctx.fillStyle = "#43637b";
      ctx.font = `${Math.max(8, 9 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      drawWrappedText(
        ctx,
        details.join(" • "),
        cardX + 8,
        cardY + 28 * camera.zoom,
        Math.max(10, cardW - 16),
        12 * camera.zoom,
        2,
      );

      if (this.citation.url) {
        ctx.fillStyle = "#345e7d";
        const urlLabel = ellipsis(this.citation.url, 74);
        ctx.fillText(urlLabel, cardX + 8, cardY + cardH - 10 * camera.zoom);
      }
    }

    const resizeRect = this._resizeHandleRect();
    const resizeScreen = camera.worldToScreen(resizeRect.x, resizeRect.y);
    const handleSize = 18 * camera.zoom;
    fillPill(ctx, resizeScreen.x, resizeScreen.y, handleSize, handleSize, "#7e9db7");
    ctx.fillStyle = "#f2f8fc";
    ctx.fillText("<>", resizeScreen.x + 3 * camera.zoom, resizeScreen.y + 12 * camera.zoom);
  }

  renderSnapshot(ctx, camera) {
    const wasMinimized = this.metadata.minimized;
    this.metadata.minimized = true;
    this.render(ctx, camera);
    this.metadata.minimized = wasMinimized;
  }
}
