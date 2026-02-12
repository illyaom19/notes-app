import { InkEngine } from "./ink-engine.js";

export function createInkFeature({ runtime, onStateChange, getActiveContextId, onCreateNoteFromLasso }) {
  const engine = new InkEngine({ runtime, onStateChange, getActiveContextId, onCreateNoteFromLasso });
  engine.attach();

  return {
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    getTool: () => engine.getTool(),
    setTool: (tool) => engine.setTool(tool),
    toggleTool: () => engine.toggleTool(),
    getPenStyle: () => engine.getPenStyle(),
    setPenColor: (color) => engine.setPenColor(color),
    setPenThickness: (thickness) => engine.setPenThickness(thickness),
    isEnabled: () => engine.isEnabled(),
    setEnabled: (nextEnabled) => engine.setEnabled(nextEnabled),
    cloneStrokesForWidget: (options) => engine.cloneStrokesForWidget(options),
    commitImportedStrokes: (strokes) => engine.commitImportedStrokes(strokes),
    removeStrokesForWidget: (widgetId, options) => engine.removeStrokesForWidget(widgetId, options),
    getWidgetInkRevision: (widgetId) => engine.getWidgetInkRevision(widgetId),
    isWidgetInkActive: (widgetId) => engine.isWidgetInkActive(widgetId),
    hasActiveInkPointers: () => engine.hasActiveInkPointers(),
    renderWidgetInkForRaster: (ctx, camera, widgetId) => engine.renderWidgetInkForRaster(ctx, camera, widgetId),
    dispose: () => engine.detach(),
  };
}
