export const RENDER_MODE = Object.freeze({
  INTERACTIVE: "interactive",
  SNAPSHOT: "snapshot",
});

const COLLAPSED_WIDTH_WORLD = 40;
const COLLAPSED_MIN_HEIGHT_WORLD = 40;

function normalizeInteractionFlags(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  return {
    movable: source.movable !== false,
    resizable: source.resizable !== false,
    collapsible: source.collapsible !== false,
  };
}

export class WidgetBase {
  constructor(definition) {
    this.id = definition.id;
    this.type = definition.type;
    this.position = definition.position ?? { x: 0, y: 0 };
    this.size = definition.size ?? { width: 260, height: 180 };
    this.renderMode = definition.renderMode ?? RENDER_MODE.INTERACTIVE;
    this.collapsed = Boolean(definition.collapsed);
    this.metadata = definition.metadata ?? {};
    this.interactionFlags = normalizeInteractionFlags(definition.interactionFlags);
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

  containsWorldPoint(worldX, worldY, camera) {
    const bounds = this.getInteractionBounds(camera);
    const minX = this.position.x;
    const minY = this.position.y;
    const maxX = minX + bounds.width;
    const maxY = minY + bounds.height;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  getInteractionFlags() {
    return { ...this.interactionFlags };
  }

  getCollapsedInteractionBounds(_camera) {
    return {
      width: COLLAPSED_WIDTH_WORLD,
      height: COLLAPSED_MIN_HEIGHT_WORLD,
    };
  }

  getInteractionBounds(camera) {
    if (this.collapsed) {
      return this.getCollapsedInteractionBounds(camera);
    }
    return {
      width: this.size.width,
      height:
        typeof this.displayHeight === "number" && Number.isFinite(this.displayHeight)
          ? this.displayHeight
          : this.size.height,
    };
  }

  moveBy(dx, dy) {
    this.position.x += dx;
    this.position.y += dy;
  }

  resizeBy(dx, dy) {
    this.size.width = Math.max(120, this.size.width + dx);
    this.size.height = Math.max(80, this.size.height + dy);
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

  getRasterRevision() {
    return "";
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
      interactionFlags: this.getInteractionFlags(),
    };
  }
}
