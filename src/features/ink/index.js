import { InkEngine } from "./ink-engine.js";

export function createInkFeature({ runtime, onStateChange, getActiveContextId }) {
  const engine = new InkEngine({ runtime, onStateChange, getActiveContextId });
  engine.attach();

  return {
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    getTool: () => engine.getTool(),
    setTool: (tool) => engine.setTool(tool),
    toggleTool: () => engine.toggleTool(),
    isEnabled: () => engine.isEnabled(),
    setEnabled: (nextEnabled) => engine.setEnabled(nextEnabled),
    cloneStrokesForWidget: (options) => engine.cloneStrokesForWidget(options),
    commitImportedStrokes: (strokes) => engine.commitImportedStrokes(strokes),
    dispose: () => engine.detach(),
  };
}
