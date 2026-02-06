import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";

const HEADER_HEIGHT = 34;
const MIN_BODY_HEIGHT = 90;
const MIN_SIZE = { width: 180, height: 120 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class ReferencePopupWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: {
        width: Math.max(MIN_SIZE.width, definition.size?.width ?? 280),
        height: Math.max(MIN_SIZE.height, definition.size?.height ?? 210),
      },
      metadata: {
        title: definition.metadata?.title ?? "Ref",
        minimized: Boolean(definition.metadata?.minimized),
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

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#ffffff", "#6f8faa", 1.4);
    fillPill(ctx, screen.x + 10, screen.y + 6, Math.max(90, width - 88), 20 * camera.zoom, "#edf4fb");

    ctx.fillStyle = "#17354d";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 18, screen.y + 20 * camera.zoom);

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
      ctx.fillText("v", screen.x + width / 2 - 4, bodyY + 24);
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
