import { fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import {
  drawFloatingWidgetTitle,
  drawUnifiedWidgetFrame,
  interactionStateForWidget,
  WIDGET_THEME,
} from "../../features/widget-system/widget-theme.js";

export class ExpandedAreaWidget extends WidgetBase {
  constructor(definition) {
    super({
      ...definition,
      size: definition.size ?? { width: 420, height: 260 },
      metadata: {
        title: definition.metadata?.title ?? "Notes",
        note: definition.metadata?.note ?? "",
      },
    });
  }

  render(ctx, camera, renderContext) {
    const interaction = interactionStateForWidget(this, renderContext);
    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      borderRadius: 18,
    });
    drawFloatingWidgetTitle(ctx, camera, {
      title: this.metadata.title || widgetTypeTitle(this.type),
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
    });
  }

  renderSnapshot(ctx, camera, _renderContext) {
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = Math.max(40, this.size.height * camera.zoom * 0.22);

    fillStrokeRoundedRect(
      ctx,
      screen.x,
      screen.y,
      width,
      height,
      16,
      WIDGET_THEME.palette.frameFill,
      WIDGET_THEME.palette.frameStroke,
      1.15,
    );

    ctx.fillStyle = WIDGET_THEME.palette.title;
    ctx.font = `${Math.max(1, 12 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
    ctx.fillText(`${this.metadata.title || widgetTypeTitle(this.type)}`, screen.x + 12, screen.y + 22);
  }
}
