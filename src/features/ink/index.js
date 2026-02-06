import { InkEngine } from "./ink-engine.js";

export function createInkFeature({ runtime, onStateChange, getActiveContextId }) {
  const engine = new InkEngine({ runtime, onStateChange, getActiveContextId });
  engine.attach();

  return {
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    dispose: () => engine.detach(),
  };
}
