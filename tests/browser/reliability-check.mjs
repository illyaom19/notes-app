import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch();

async function dismissOpenDialog(page) {
  const dialog = page.locator('dialog[open]');
  if (!await dialog.count()) return;
  const dismiss = dialog.getByRole('button', { name: /dismiss|close|ok|cancel/i }).last();
  if (await dismiss.count()) await dismiss.click();
}

try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  await page.goto('http://127.0.0.1:4174');
  await page.waitForTimeout(700);
  await page.locator('#onboarding-hint-dismiss').click().catch(() => {});

  // Keep original PDF bytes and the rendered widget stable across repeated
  // section teardown/rehydration.
  await page.locator('#pdf-file-input').setInputFiles('tests/fixtures/searchable.pdf');
  await page.waitForFunction(() => document.querySelector('#widget-count')?.textContent === '1');
  await page.waitForTimeout(800);
  const firstSection = await page.locator('#section-tabs [data-section-id]').first().getAttribute('data-section-id');
  await page.locator('#new-section').click();
  await page.locator('dialog[open] input').fill('PDF switch target');
  await page.locator('dialog[open]').getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#widget-count')?.textContent === '0');
  const secondSection = await page.locator('#section-tabs [data-active="true"]').getAttribute('data-section-id');
  for (let index = 0; index < 12; index += 1) {
    await page.locator(`#section-tabs [data-section-id="${firstSection}"]`).click();
    await page.waitForFunction(() => document.querySelector('#widget-count')?.textContent === '1');
    await page.locator(`#section-tabs [data-section-id="${secondSection}"]`).click();
    await page.waitForFunction(() => document.querySelector('#widget-count')?.textContent === '0');
  }
  await page.locator(`#section-tabs [data-section-id="${firstSection}"]`).click();
  await page.waitForFunction(() => document.querySelector('#widget-count')?.textContent === '1');
  const pdfAssets = await page.evaluate(() => JSON.parse(localStorage.getItem('notes-app.assets.catalog.v1')).data.records.filter((record) => record.type === 'pdf-bytes'));
  assert.equal(pdfAssets.length, 1, 'Section switching preserves one original PDF asset');

  // Inject quota failure at the browser Storage boundary. The app must retain
  // the current section, expose a durable failure, then recover through Retry.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__notesOriginalSetItem = original;
    window.__notesFailWorkspaceWrites = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.__notesFailWorkspaceWrites && String(key).startsWith('notes-app.context.workspace.')) {
        throw new DOMException('Injected quota limit', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.mouse.click(760, 320, { button: 'right' });
  await page.locator('[data-create-type="expanded-area"]').click();
  await page.waitForTimeout(700);
  await dismissOpenDialog(page);
  await page.waitForFunction(() => document.querySelector('#save-status')?.dataset.state === 'failed');
  const activeBeforeBlockedSwitch = await page.locator('#section-tabs [data-active="true"]').getAttribute('data-section-id');
  await page.locator(`#section-tabs [data-section-id="${secondSection}"]`).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#section-tabs [data-active="true"]').getAttribute('data-section-id'), activeBeforeBlockedSwitch);
  await dismissOpenDialog(page);
  await page.evaluate(() => { window.__notesFailWorkspaceWrites = false; });
  await page.locator('#save-status').click();
  await page.waitForFunction(() => document.querySelector('#save-status')?.dataset.state === 'saved');
  await page.locator(`#section-tabs [data-section-id="${secondSection}"]`).click();
  await page.waitForFunction((id) => document.querySelector(`#section-tabs [data-section-id="${id}"]`)?.dataset.active === 'true', secondSection);

  // A restore in one tab pauses and then reloads sibling tabs, preventing a
  // stale page from overwriting the newly restored workspace.
  const sibling = await context.newPage();
  await sibling.goto('http://127.0.0.1:4174');
  await sibling.waitForTimeout(600);
  await sibling.evaluate(() => {
    sessionStorage.setItem('restore-phases', '');
    window.addEventListener('storage', (event) => {
      if (event.key !== 'notes-app.restore-event' || !event.newValue) return;
      const phase = JSON.parse(event.newValue).phase;
      sessionStorage.setItem('restore-phases', `${sessionStorage.getItem('restore-phases')},${phase}`);
    });
  });
  const siblingReloaded = sibling.waitForEvent('framenavigated', (frame) => frame === sibling.mainFrame());
  await page.evaluate(async () => {
    const module = await import('/src/features/storage/workspace-backup.js');
    const backup = await module.createWorkspaceBackup();
    await module.restoreWorkspaceBackup(backup);
  });
  await siblingReloaded;
  await sibling.waitForFunction(() => document.querySelector('#widget-count'));
  assert.match(await sibling.evaluate(() => sessionStorage.getItem('restore-phases')), /started,complete/);
  assert.equal(await sibling.locator('#workspace-canvas').evaluate((canvas) => canvas.style.pointerEvents), '');

  assert.deepEqual(errors, []);
  console.log('PDF section switching and quota-failure recovery passed.');
} finally {
  await browser.close();
}
