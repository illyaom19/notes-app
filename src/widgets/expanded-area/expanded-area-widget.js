import { fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";

export class ExpandedAreaWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 420, height: 260 },
      metadata: {
        title: definition.metadata?.title ?? "Space",
        note: definition.metadata?.note ?? "Notes",
      },
    });
  }

  render(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.size.height * camera.zoom;

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 18, "#ffffff", "#2a7ebc", 1.6);

    ctx.fillStyle = "#0f2536";
    ctx.font = `${Math.max(12, 14 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 14, screen.y + 24);

    ctx.strokeStyle = "#d3dee8";
    ctx.lineWidth = 1;
    for (let row = 1; row <= 4; row += 1) {
      const y = screen.y + (height / 5) * row;
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
    ctx.fillText(`${this.metadata.title} ^`, screen.x + 12, screen.y + 22);
  }
}
