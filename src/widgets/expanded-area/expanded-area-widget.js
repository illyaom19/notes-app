import { fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";

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

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 18, "#ffffff", "#8fb0c8", 1.4);

    const headerHeight = Math.max(26, Math.min(40, height * 0.16));
    ctx.fillStyle = "#f1f7fb";
    ctx.fillRect(screen.x + 2, screen.y + 2, Math.max(10, width - 4), Math.max(10, headerHeight - 4));

    ctx.fillStyle = "#0f2536";
    ctx.font = `${Math.max(12, 14 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 14, screen.y + 24);

    if (typeof this.metadata.note === "string" && this.metadata.note.trim()) {
      ctx.fillStyle = "#4f6678";
      ctx.font = `${Math.max(9, 10 * camera.zoom)}px IBM Plex Sans, sans-serif`;
      ctx.fillText(this.metadata.note.trim().slice(0, 48), screen.x + 14, screen.y + 40);
    }

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

  renderSnapshot(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = Math.max(40, this.size.height * camera.zoom * 0.22);

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#eef8ff", "#77a9d0", 1.2);

    ctx.fillStyle = "#1f4e74";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`${this.metadata.title}`, screen.x + 12, screen.y + 22);
  }
}
