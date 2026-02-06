import { GraphWidget } from "./graph-widget.js";

export function createWidget(definition) {
  return new GraphWidget(definition);
}
