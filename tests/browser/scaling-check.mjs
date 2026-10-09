import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174');
  await page.locator('#onboarding-hint-dismiss').click().catch(() => {});
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 600], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      canvas: document.querySelector('#workspace-canvas').getBoundingClientRect().height,
      header: document.querySelector('.section-strip').getBoundingClientRect().height,
    }));
    assert.ok(layout.width <= width, `Horizontal overflow at ${width}: ${layout.width}`);
    assert.ok(layout.canvas >= height - 160, `Canvas crowded at ${width}: ${layout.canvas}`);
    assert.ok(layout.header <= 140, `Header too tall at ${width}: ${layout.header}`);
    await page.screenshot({ path: `/tmp/notes-app-check-layout-${width}.png` });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  await page.mouse.click(260, 260, { button: 'right' });
  await page.locator('[data-create-type="expanded-area"]').click();
  await page.waitForTimeout(400);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 750, y: 400, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
  for (let x = 752; x < 800; x += 2) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 400 + (x - 750) / 2, buttons: 1, pointerType: 'pen', force: 0.5 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 425, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await page.waitForTimeout(600);
  await page.waitForFunction(() => Object.entries(localStorage).filter(([k]) => k.startsWith('notes-app.context.workspace.')).some(([, v]) => JSON.parse(v).data.inkStrokes?.length > 0));
  await page.locator('#undo-ink').click();
  await page.waitForFunction(() => Object.entries(localStorage).filter(([k]) => k.startsWith('notes-app.context.workspace.')).every(([, v]) => (JSON.parse(v).data.inkStrokes?.length ?? 0) === 0));
  assert.equal(await page.locator('#widget-count').textContent(), '1');
  await page.locator('#undo-ink').click();
  assert.equal(await page.locator('#widget-count').textContent(), '0');
  await page.locator('#redo-ink').click();
  await page.locator('#redo-ink').click();
  await page.waitForFunction(() => Object.entries(localStorage).filter(([k]) => k.startsWith('notes-app.context.workspace.')).some(([, v]) => JSON.parse(v).data.inkStrokes?.length > 0));
  assert.deepEqual(errors, []);
  console.log('Four viewport layouts and chronological pen/widget undo/redo passed.');
} finally { await browser.close(); }
