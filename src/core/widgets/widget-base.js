export const RENDER_MODE = Object.freeze({
  INTERACTIVE: "interactive",
  SNAPSHOT: "snapshot",
});

export class WidgetBase {
  constructor(definition) {
    this.id = definition.id;
    this.type = definition.type;
    this.position = definition.position ?? { x: 0, y: 0 };
    this.size = definition.size ?? { width: 260, height: 180 };
    this.renderMode = definition.renderMode ?? RENDER_MODE.INTERACTIVE;
    this.collapsed = Boolean(definition.collapsed);
    this.metadata = definition.metadata ?? {};
    this._mounted = false;
    this._context = null;
  }

  mount(context) {
    this._context = context;
    this._mounted = true;
  }

  unmount() {
    this._context = null;
    this._mounted = false;
  }

  setRenderMode(mode) {
    if (mode !== RENDER_MODE.INTERACTIVE && mode !== RENDER_MODE.SNAPSHOT) {
      throw new Error(`Unsupported render mode: ${mode}`);
    }
    this.renderMode = mode;
  }

  setCollapsed(nextCollapsed) {
    this.collapsed = Boolean(nextCollapsed);
    this.renderMode = this.collapsed ? RENDER_MODE.SNAPSHOT : RENDER_MODE.INTERACTIVE;
  }

  containsWorldPoint(worldX, worldY) {
    const minX = this.position.x;
    const minY = this.position.y;
    const maxX = minX + this.size.width;
    const maxY = minY + this.size.height;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  update(_deltaTimeMs) {
    // Optional override.
  }

  render(_ctx, _camera) {
    throw new Error("WidgetBase.render must be implemented by concrete widgets.");
  }

  renderSnapshot(ctx, camera) {
    this.render(ctx, camera);
  }

  toSerializableState() {
    return {
      id: this.id,
      type: this.type,
      position: this.position,
      size: this.size,
      renderMode: this.renderMode,
      collapsed: this.collapsed,
      metadata: this.metadata,
    };
  }
}
