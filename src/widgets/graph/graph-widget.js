import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { GraphEngine } from "./graph-engine.js";

const HEADER_HEIGHT = 34;
const MIN_SIZE = { width: 260, height: 180 };

function defaultView() {
  return {
    minX: -10,
    maxX: 10,
    minY: -6,
    maxY: 6,
  };
}

export class GraphWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: {
        width: Math.max(MIN_SIZE.width, definition.size?.width ?? 420),
        height: Math.max(MIN_SIZE.height, definition.size?.height ?? 280),
      },
      metadata: {
        title: definition.metadata?.title ?? "f(x)",
      },
    });

    this.state = {
      equation: definition.dataPayload?.equation ?? "sin(x)",
      view: {
        ...defaultView(),
        ...(definition.dataPayload?.view ?? {}),
      },
    };

    this.engine = new GraphEngine();
    this._snapshotCanvas = null;
    this._snapshotDirty = true;
  }

  getContentRect() {
    return {
      x: this.position.x,
      y: this.position.y + HEADER_HEIGHT,
      width: this.size.width,
      height: Math.max(1, this.size.height - HEADER_HEIGHT),
    };
  }

  getControlAt(worldX, worldY) {
    if (this.collapsed) {
      const resizeRect = {
        x: this.position.x + this.size.width - 18,
        y: this.position.y + this.size.height - 18,
        width: 18,
        height: 18,
      };
      if (
        worldX >= resizeRect.x &&
        worldX <= resizeRect.x + resizeRect.width &&
        worldY >= resizeRect.y &&
        worldY <= resizeRect.y + resizeRect.height
      ) {
        return "resize";
      }

      if (
        worldX >= this.position.x &&
        worldX <= this.position.x + this.size.width &&
        worldY >= this.position.y &&
        worldY <= this.position.y + HEADER_HEIGHT
      ) {
        return "move";
      }

      return null;
    }

    const controls = [
      ["zoom-in", this.position.x + this.size.width - 84],
      ["zoom-out", this.position.x + this.size.width - 58],
      ["reset", this.position.x + this.size.width - 32],
    ];

    for (const [key, x] of controls) {
      const y = this.position.y + 8;
      if (worldX >= x && worldX <= x + 18 && worldY >= y && worldY <= y + 18) {
        return key;
      }
    }

    const resizeRect = {
      x: this.position.x + this.size.width - 18,
      y: this.position.y + this.size.height - 18,
      width: 18,
      height: 18,
    };
    if (
      worldX >= resizeRect.x &&
      worldX <= resizeRect.x + resizeRect.width &&
      worldY >= resizeRect.y &&
      worldY <= resizeRect.y + resizeRect.height
    ) {
      return "resize";
    }

    if (
      worldX >= this.position.x &&
      worldX <= this.position.x + this.size.width &&
      worldY >= this.position.y &&
      worldY <= this.position.y + HEADER_HEIGHT
    ) {
      return "move";
    }

    const body = this.getContentRect();
    if (
      worldX >= body.x &&
      worldX <= body.x + body.width &&
      worldY >= body.y &&
      worldY <= body.y + body.height
    ) {
      return "pan";
    }

    return null;
  }

  moveBy(dx, dy) {
    this.position.x += dx;
    this.position.y += dy;
  }

  resizeBy(dx, dy) {
    this.size.width = Math.max(MIN_SIZE.width, this.size.width + dx);
    this.size.height = Math.max(MIN_SIZE.height, this.size.height + dy);
    this._snapshotDirty = true;
  }

  panByWorldDelta(dx, dy) {
    const content = this.getContentRect();
    const xUnitsPerWorld = (this.state.view.maxX - this.state.view.minX) / content.width;
    const yUnitsPerWorld = (this.state.view.maxY - this.state.view.minY) / content.height;

    this.state.view.minX -= dx * xUnitsPerWorld;
    this.state.view.maxX -= dx * xUnitsPerWorld;
    this.state.view.minY += dy * yUnitsPerWorld;
    this.state.view.maxY += dy * yUnitsPerWorld;
    this._snapshotDirty = true;
  }

  zoom(factor) {
    const centerX = (this.state.view.minX + this.state.view.maxX) / 2;
    const centerY = (this.state.view.minY + this.state.view.maxY) / 2;
    const halfX = ((this.state.view.maxX - this.state.view.minX) / 2) * factor;
    const halfY = ((this.state.view.maxY - this.state.view.minY) / 2) * factor;

    this.state.view.minX = centerX - halfX;
    this.state.view.maxX = centerX + halfX;
    this.state.view.minY = centerY - halfY;
    this.state.view.maxY = centerY + halfY;
    this._snapshotDirty = true;
  }

  resetView() {
    this.state.view = defaultView();
    this._snapshotDirty = true;
  }

  _drawHeader(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const totalHeight = this.size.height * camera.zoom;

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, totalHeight, 18, "#ffffff", "#6f8faa", 1.4);
    fillPill(ctx, screen.x + 10, screen.y + 6, Math.max(96, width - 106), 20 * camera.zoom, "#edf5fc");

    ctx.fillStyle = "#1a3c57";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 18, screen.y + 20 * camera.zoom);

    const controls = ["^", "v", "<>"];
    for (let i = 0; i < controls.length; i += 1) {
      const x = screen.x + width - (84 - i * 26) * camera.zoom;
      const y = screen.y + 8 * camera.zoom;
      const size = 18 * camera.zoom;

      fillPill(ctx, x, y, size, size, "#d9e8f5");
      ctx.fillStyle = "#27445a";
      ctx.fillText(controls[i], x + 4 * camera.zoom, y + 12 * camera.zoom);
    }

    return {
      screen,
      width,
      headerHeight: HEADER_HEIGHT * camera.zoom,
    };
  }

  _drawGraph(ctx, camera) {
    const content = this.getContentRect();
    const screen = camera.worldToScreen(content.x, content.y);
    const rect = {
      x: screen.x,
      y: screen.y,
      width: content.width * camera.zoom,
      height: content.height * camera.zoom,
    };

    this.engine.draw(ctx, rect, this.state);

    const resize = camera.worldToScreen(this.position.x + this.size.width - 18, this.position.y + this.size.height - 18);
    const handleSize = 18 * camera.zoom;
    fillPill(ctx, resize.x, resize.y, handleSize, handleSize, "#7f9db8");

    ctx.fillStyle = "#3d5970";
    ctx.font = `${Math.max(9, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.state.equation.slice(0, 24), screen.x + 8, screen.y + 16);
  }

  _refreshSnapshot() {
    const width = 220;
    const height = 130;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }

    this.engine.draw(ctx, { x: 0, y: 0, width, height }, this.state);
    this._snapshotCanvas = canvas;
    this._snapshotDirty = false;
  }

  render(ctx, camera) {
    this._drawHeader(ctx, camera);
    this._drawGraph(ctx, camera);
  }

  renderSnapshot(ctx, camera) {
    const frame = this._drawHeader(ctx, camera);
    if (this._snapshotDirty || !this._snapshotCanvas) {
      this._refreshSnapshot();
    }

    const inset = 10;
    const x = frame.screen.x + inset;
    const y = frame.screen.y + frame.headerHeight + inset;
    const width = frame.width - inset * 2;
    const height = Math.max(36, this.size.height * camera.zoom - frame.headerHeight - inset * 2);

    fillStrokeRoundedRect(ctx, x, y, width, height, 12, "#eff5fb", "#d9e6f2", 1);

    if (this._snapshotCanvas) {
      ctx.drawImage(this._snapshotCanvas, x, y, width, height);
    }

    fillPill(ctx, x + 8, y + 8, 62, 18, "rgba(22, 43, 62, 0.82)");
    ctx.fillStyle = "#f2f8fc";
    ctx.font = `${Math.max(9, 11 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText("f(x)^", x + 14, y + 20);
  }

  toSerializableState() {
    const base = super.toSerializableState();
    return {
      ...base,
      dataPayload: {
        equation: this.state.equation,
        view: this.state.view,
      },
    };
  }
}
