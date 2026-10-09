// Shared decoded-image budget. Compressed source assets remain owned by storage.
export function createRasterImageCache({ maxBytes = 64 * 1024 * 1024, concurrency = 2, load = (src) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }) } = {}) {
  const entries = new Map(), pending = new Map(), queue = [];
  let bytes = 0, active = 0;
  function pump() {
    while (active < concurrency && queue.length) {
      const { src, resolve, reject } = queue.shift(); active++;
      load(src).then((image) => {
        const cost = (image.naturalWidth || image.width) * (image.naturalHeight || image.height) * 4;
        while (bytes + cost > maxBytes && entries.size) {
          const key = entries.keys().next().value; bytes -= entries.get(key).cost; entries.delete(key);
        }
        entries.set(src, { image, cost }); bytes += cost; resolve(image);
      }, reject).finally(() => { active--; pending.delete(src); pump(); });
    }
  }
  return {
    peek(src) { const entry = entries.get(src); if (!entry) return null; entries.delete(src); entries.set(src, entry); return entry.image; },
    load(src) {
      const cached = this.peek(src); if (cached) return Promise.resolve(cached);
      if (pending.has(src)) return pending.get(src);
      const promise = new Promise((resolve, reject) => queue.push({ src, resolve, reject })); pending.set(src, promise); pump(); return promise;
    },
    async settled() { await Promise.allSettled([...pending.values()]); },
    stats: () => ({ bytes, entries: entries.size, pending: pending.size, active, maxBytes }),
  };
}
export const rasterImageCache = createRasterImageCache();
