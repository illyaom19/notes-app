export class WidgetRegistry {
  constructor() {
    this._loaders = new Map();
    this._moduleCache = new Map();
    this._listeners = new Set();
  }

  register(type, loader) {
    if (this._loaders.has(type)) {
      throw new Error(`Widget type already registered: ${type}`);
    }
    this._loaders.set(type, loader);
  }

  onModuleLoaded(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  getRegisteredTypes() {
    return Array.from(this._loaders.keys());
  }

  async loadModule(type) {
    const loader = this._loaders.get(type);
    if (!loader) {
      throw new Error(`No widget loader registered for type: ${type}`);
    }

    if (!this._moduleCache.has(type)) {
      const modulePromise = loader().then((moduleObject) => {
        for (const listener of this._listeners) {
          listener(type);
        }
        return moduleObject;
      });
      this._moduleCache.set(type, modulePromise);
    }

    return this._moduleCache.get(type);
  }

  async instantiate(type, definition = {}) {
    const moduleObject = await this.loadModule(type);
    if (typeof moduleObject.createWidget !== "function") {
      throw new Error(`Widget module "${type}" must export createWidget(definition).`);
    }

    return moduleObject.createWidget({
      ...definition,
      type,
    });
  }
}
