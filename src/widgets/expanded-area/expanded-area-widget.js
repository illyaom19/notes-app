import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { resolveWidgetLod, widgetTypeTitle } from "../../features/widget-system/widget-lod.js";

export class ExpandedAreaWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 420, height: 260 },
      metadata: {
        title: definition.metadata?.title ?? "Notes Sheet",
        note: definition.metadata?.note ?? "",
      },
    });
  }

  render(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.size.height * camera.zoom;
    const lod = resolveWidgetLod({
      cameraZoom: camera.zoom,
      screenWidth: width,
      screenHeight: height,
    });

    if (lod === "label-only") {
      fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#f7fbff", "#9ab8cf", 1.2);
      const chipW = Math.max(52, Math.min(88, width - 20));
      const chipX = screen.x + (width - chipW) / 2;
      const chipY = screen.y + Math.max(8, (height - 22) / 2);
      fillPill(ctx, chipX, chipY, chipW, 22, "#e7f2fb");
      ctx.fillStyle = "#1b4d71";
      ctx.font = "11px IBM Plex Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(widgetTypeTitle(this.type), chipX + chipW / 2, chipY + 11);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      return;
    }

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 18, "#ffffff", "#8fb0c8", 1.4);

    const headerHeight = Math.max(26, Math.min(40, height * 0.16));
    ctx.fillStyle = "#f1f7fb";
    ctx.fillRect(screen.x + 2, screen.y + 2, Math.max(10, width - 4), Math.max(10, headerHeight - 4));

    ctx.fillStyle = "#0f2536";
    ctx.font = `${Math.max(1, 14 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 14, screen.y + 24);

    if (lod === "detail" && typeof this.metadata.note === "string" && this.metadata.note.trim()) {
      ctx.fillStyle = "#4f6678";
      ctx.font = `${Math.max(1, 10 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(this.metadata.note.trim().slice(0, 48), screen.x + 14, screen.y + 40);
    }

    if (lod === "detail") {
      ctx.strokeStyle = "#d8e3ec";
      ctx.lineWidth = 1;
      for (let row = 1; row <= 5; row += 1) {
        const y = screen.y + headerHeight + ((height - headerHeight) / 6) * row;
        ctx.beginPath();
        ctx.moveTo(screen.x + 14, y);
        ctx.lineTo(screen.x + width - 14, y);
        ctx.stroke();
      }
    }
  }

  renderSnapshot(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = Math.max(40, this.size.height * camera.zoom * 0.22);

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#eef8ff", "#77a9d0", 1.2);

    ctx.fillStyle = "#1f4e74";
    ctx.font = `${Math.max(1, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`${this.metadata.title || widgetTypeTitle(this.type)}`, screen.x + 12, screen.y + 22);
  }
}
