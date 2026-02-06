import { WidgetBase } from "../../core/widgets/widget-base.js";

export class ExpandedAreaWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 420, height: 260 },
      metadata: {
        title: definition.metadata?.title ?? "Expanded Area",
        note: definition.metadata?.note ?? "Freeform extension surface",
      },
    });
  }

  render(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.size.height * camera.zoom;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#2a7ebc";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(screen.x, screen.y, width, height);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f2536";
    ctx.font = `${Math.max(13, 16 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.title, screen.x + 14, screen.y + 30);

    ctx.fillStyle = "#4f6374";
    ctx.font = `${Math.max(10, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(this.metadata.note, screen.x + 14, screen.y + 54);

    ctx.strokeStyle = "#d3dee8";
    ctx.lineWidth = 1;
    for (let row = 1; row <= 4; row += 1) {
      const y = screen.y + (height / 5) * row;
      ctx.beginPath();
      ctx.moveTo(screen.x + 12, y);
      ctx.lineTo(screen.x + width - 12, y);
      ctx.stroke();
    }
  }

  renderSnapshot(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = Math.max(44, this.size.height * camera.zoom * 0.24);

    ctx.fillStyle = "#eef8ff";
    ctx.strokeStyle = "#77a9d0";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(screen.x, screen.y, width, height);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1f4e74";
    ctx.font = `${Math.max(11, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`${this.metadata.title} (collapsed)`, screen.x + 12, screen.y + 24);
  }
}
