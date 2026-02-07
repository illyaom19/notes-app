import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";

const HEADER_HEIGHT = 34;
const MIN_BODY_HEIGHT = 90;
const MIN_SIZE = { width: 180, height: 120 };

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
    this._image = null;
    this.sourceLabel = definition.dataPayload?.sourceLabel ?? "Snip";

    if (this.imageDataUrl) {
      this._image = new Image();
      this._image.src = this.imageDataUrl;
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

    fillStrokeRoundedRect(ctx, screen.x + 8, bodyY + 8, width - 16, bodyH - 16, 12, "#f4f8fb", "#dbe7f2", 1);

    if (this._image) {
      ctx.drawImage(this._image, screen.x + 10, bodyY + 10, width - 20, bodyH - 20);
    } else {
      ctx.fillStyle = "#50697f";
      ctx.fillText("No capture", screen.x + 16, bodyY + 24);
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
