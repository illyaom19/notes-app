import { fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
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

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#ffffff", "#0866a8", 1.5);

    ctx.fillStyle = "#0f1720";
    ctx.font = `${Math.max(11, 13 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText("Dummy", screen.x + 14, screen.y + 24);

    ctx.fillStyle = "#546274";
    const modeLabel = this.renderMode === RENDER_MODE.SNAPSHOT ? "^" : "v";
    ctx.fillText(modeLabel, screen.x + width - 18, screen.y + 24);
  }

  renderSnapshot(ctx, camera) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = Math.max(40, this.size.height * camera.zoom * 0.24);

    fillStrokeRoundedRect(ctx, screen.x, screen.y, width, height, 16, "#f2f7fc", "#86a7c4", 1.2);

    ctx.fillStyle = "#30485e";
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px IBM Plex Sans, sans-serif`;
    ctx.fillText("Dummy ^", screen.x + 12, screen.y + 22);
  }
}
