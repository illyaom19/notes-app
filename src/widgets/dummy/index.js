import { DummyWidget } from "./dummy-widget.js";

export function createWidget(definition) {
  return new DummyWidget(definition);
}
