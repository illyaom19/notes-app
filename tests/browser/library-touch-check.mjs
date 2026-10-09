import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4174');
  await page.waitForFunction(() => localStorage.getItem('notes-app.contexts.v1'));
  await page.evaluate(async () => {
    const { createContextStore } = await import('/src/features/contexts/context-store.js');
    const { createNotebookLibraryStore } = await import('/src/features/notebooks/notebook-library-store.js');
    const notebook = createContextStore().getActiveContextId();
    const library = createNotebookLibraryStore();
    for (let i = 0; i < 100; i++) library.upsertNote(notebook, { id: `fixture-${i}`, title: `Library fixture ${String(i).padStart(3, '0')}`, metadata: { note: `Searchable specimen ${i}` } });
  });
  await page.reload();
  await page.waitForTimeout(800);
  await page.waitForFunction(() => document.querySelectorAll('#reference-manager-reference-list .library-chip-row').length === 100);
  await page.locator('#reference-manager-launcher').tap();
  const list = page.locator('#reference-manager-reference-list');
  assert.equal(await list.locator('.library-chip-row').count(), 100);
  const rect = await list.boundingBox();
  const x = rect.x + 70, y = rect.y + Math.min(rect.height - 20, 230);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let delta = 10; delta <= 170; delta += 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - delta }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  assert.ok(await list.evaluate(el => el.scrollTop) > 0, 'Swipe scrolls the library');
  assert.equal(await page.locator('#widget-count').textContent(), '0', 'Swipe never spawns a widget');
  await page.locator('#library-close').tap();
  await page.locator('#toggle-search-panel').tap();
  await page.locator('#search-query').fill('specimen 99');
  await page.locator('.search-result-item').first().click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#reference-manager-overlay').isVisible(), true);
  assert.equal(await page.locator('#reference-manager-reference-list [data-key="note:fixture-99"]').count(), 1);
  assert.equal(await page.locator('#widget-count').textContent(), '0');
  assert.deepEqual(errors, []);
  console.log('100-item touch swipe and library search navigation passed.');
} finally { await browser.close(); }
