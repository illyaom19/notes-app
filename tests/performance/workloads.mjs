// Reproducible CPU microbenchmarks; these do not measure physical stylus latency.
import { execFileSync } from 'node:child_process';
import { createAssetManager } from '../../src/features/storage/asset-manager.js';
import { createSectionHistory } from '../../src/features/history/section-history.js';
import { createSearchIndex } from '../../src/features/search/search-index.js';
import { createMemoryStorage, installBrowserEnv } from '../helpers/browser-env.mjs';
const restore = installBrowserEnv(createMemoryStorage());
function measure(name, fn, count = 100) {
  const times = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); fn(i); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { name, samples: count, p50Ms: times[Math.floor(count * .5)], p95Ms: times[Math.floor(count * .95)], totalMs: times.reduce((a, b) => a + b, 0) };
}
try {
  const base = process.argv[2] ?? '6151df2';
  const source = execFileSync('git', ['show', `${base}:src/features/storage/asset-manager.js`], { encoding: 'utf8' })
    .replaceAll('"./schema-migrations.js"', JSON.stringify(new URL('../../src/features/storage/schema-migrations.js', import.meta.url).href))
    .replaceAll('"./schema-registry.js"', JSON.stringify(new URL('../../src/features/storage/schema-registry.js', import.meta.url).href));
  const baseline = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const raster = { pages: Array.from({ length: 10 }, (_, id) => ({ id, width: 1024, height: 1448, dataUrl: 'x'.repeat(100000) })) };
  const results = [];
  for (const [name, create] of [['baseline warm raster registration', baseline.createAssetManager], ['current warm raster registration', createAssetManager]]) {
    const manager = create({ storage: createMemoryStorage() });
    manager.registerPdfRasterDocument(raster, { ownerId: 'fixture' });
    results.push(measure(name, () => manager.registerPdfRasterDocument(raster, { ownerId: 'fixture' })));
  }
  const state = { widgets: [{ id: 'note', position: { x: 0, y: 0 } }], strokes: Array.from({ length: 1000 }, (_, id) => ({ id: `s${id}`, points: Array.from({ length: 20 }, (_, x) => ({ x, y: x })) })) };
  const history = createSectionHistory({ state });
  results.push(measure('current history capture: 1000 strokes / 20000 points', i => { state.widgets[0].position.x = i; history.capture(state); }, 30));
  const widgets = Array.from({ length: 1000 }, (_, i) => ({ id: `w${i}`, type: 'expanded-area', metadata: { title: `Note ${i}`, note: 'Chlorophyll supports photosynthesis. '.repeat(50) } }));
  const index = createSearchIndex();
  results.push(measure('current repeated reindex: 1000 unchanged text notes', () => index.reindexNow({ runtime: { listWidgets: () => widgets }, contextId: 'fixture' }), 30));
  results.push(measure('current query: 1000 text notes', () => index.query('chlorophyll')));
  console.log(JSON.stringify({ node: process.version, baseline: base, results }, null, 2));
} finally { restore(); }
