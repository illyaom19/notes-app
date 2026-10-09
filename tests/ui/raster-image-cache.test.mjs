import test from 'node:test';
import assert from 'node:assert/strict';
import { createRasterImageCache } from '../../src/widgets/pdf/raster-image-cache.js';
test('decoded PDF cache deduplicates loads, bounds memory and limits concurrency', async () => {
  let active = 0, peak = 0, loads = 0;
  const cache = createRasterImageCache({ maxBytes: 800, concurrency: 2, load: async () => { loads++; active++; peak = Math.max(peak, active); await new Promise(r=>setTimeout(r,1)); active--; return { width: 10, height: 10 }; } });
  await Promise.all(['a', 'a', 'b', 'c'].map(key=>cache.load(key)));
  assert.equal(loads, 3); assert.ok(peak <= 2); assert.ok(cache.stats().bytes <= 800); assert.equal(cache.peek('a'), null);
});
