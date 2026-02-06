import { InkEngine } from "./ink-engine.js";

export function createInkFeature({ runtime, onStateChange }) {
  const engine = new InkEngine({ runtime, onStateChange });
  engine.attach();

  return {
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    dispose: () => engine.detach(),
  };
}
