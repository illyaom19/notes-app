import { DiagramWidget } from "./diagram-widget.js";

export function createWidget(definition) {
  return new DiagramWidget(definition);
}
