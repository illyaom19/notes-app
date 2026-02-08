import { fillPill, fillStrokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { resolveWidgetLod, widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import { interactionStateForWidget, WIDGET_THEME } from "../../features/widget-system/widget-theme.js";

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
    const screen = camera.worldToScreen(this.position.x, this.position.y);
    const width = this.size.width * camera.zoom;
    const height = this.size.height * camera.zoom;
    const lod = resolveWidgetLod({
      cameraZoom: camera.zoom,
      viewMode: renderContext?.viewMode,
    });
    const interaction = interactionStateForWidget(this, renderContext);

    fillStrokeRoundedRect(
      ctx,
      screen.x,
      screen.y,
      width,
      height,
      18,
      WIDGET_THEME.palette.frameFill,
      interaction.focused ? WIDGET_THEME.palette.frameStroke : WIDGET_THEME.palette.frameStrokeSoft,
      interaction.focused ? 1.35 : 1.05,
    );

    const topStripH = Math.max(4, Math.min(14, height * 0.05));
    fillPill(
      ctx,
      screen.x + 8,
      screen.y + 6,
      Math.max(12, width - 16),
      topStripH,
      interaction.focused ? WIDGET_THEME.palette.headerAccent : WIDGET_THEME.palette.headerAccentSoft,
    );

    if (interaction.focused) {
      ctx.fillStyle = WIDGET_THEME.palette.title;
      ctx.font = `${Math.max(1, 12 * camera.zoom)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText(this.metadata.title, screen.x + 14, screen.y + 28);
    }

    const contentTop = screen.y + (interaction.focused ? 36 : 14);
    const contentBottom = screen.y + height - 12;
    const lines = lod === "detail" ? 7 : 4;
    if (contentBottom > contentTop + 8) {
      ctx.strokeStyle = WIDGET_THEME.palette.line;
      ctx.lineWidth = 1;
      for (let row = 1; row <= lines; row += 1) {
        const y = contentTop + ((contentBottom - contentTop) / (lines + 1)) * row;
        ctx.beginPath();
        ctx.moveTo(screen.x + 14, y);
        ctx.lineTo(screen.x + width - 14, y);
        ctx.stroke();
      }
    }
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
