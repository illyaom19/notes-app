import { RENDER_MODE, WidgetBase } from "../../core/widgets/widget-base.js";

export class DummyWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 300, height: 180 },
    });
  }

  render(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.size.height * camera.zoom;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0866a8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(screen.x, screen.y, width, height);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f1720";
    ctx.font = `${Math.max(12, 14 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText(`Dummy Widget (${this.id})`, screen.x + 12, screen.y + 26);

    ctx.fillStyle = "#546274";
    const modeLabel =
      this.renderMode === RENDER_MODE.SNAPSHOT ? "Snapshot" : "Interactive";
    ctx.fillText(`Mode: ${modeLabel}`, screen.x + 12, screen.y + 48);
  }
}
