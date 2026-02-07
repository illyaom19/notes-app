export function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

function btoaPolyfill(value) {
  return Buffer.from(value, "binary").toString("base64");
}

function atobPolyfill(value) {
  return Buffer.from(value, "base64").toString("binary");
}

export function installBrowserEnv(storage) {
  const previousWindow = globalThis.window;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;

  const browserWindow = {
    localStorage: storage,
    setTimeout,
    clearTimeout,
    btoa: previousBtoa ?? btoaPolyfill,
    atob: previousAtob ?? atobPolyfill,
  };

  globalThis.window = browserWindow;
  globalThis.btoa = browserWindow.btoa;
  globalThis.atob = browserWindow.atob;

  return () => {
    if (previousWindow === undefined) {
      globalThis.window = {
        localStorage: createMemoryStorage(),
        setTimeout,
        clearTimeout,
        btoa: previousBtoa ?? btoaPolyfill,
        atob: previousAtob ?? atobPolyfill,
      };
    } else {
      globalThis.window = previousWindow;
    }

    if (previousBtoa === undefined) {
      delete globalThis.btoa;
    } else {
      globalThis.btoa = previousBtoa;
    }

    if (previousAtob === undefined) {
      delete globalThis.atob;
    } else {
      globalThis.atob = previousAtob;
    }
  };
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
