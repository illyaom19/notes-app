import { WidgetBase } from "../../core/widgets/widget-base.js";
import { widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import {
  drawFloatingWidgetTitle,
  drawUnifiedWidgetFrame,
  interactionStateForWidget,
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
    const interaction = interactionStateForWidget(this, _renderContext);
    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      borderRadius: 18,
      collapsedScale: 0.22,
    });
    drawFloatingWidgetTitle(ctx, camera, {
      title: this.metadata.title || widgetTypeTitle(this.type),
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
    });
  }
}
