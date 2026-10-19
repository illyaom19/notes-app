import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1024,height:768},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto('http://127.0.0.1:4174');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForTimeout(500);await context.setOffline(true);await page.reload();await page.waitForTimeout(800);
await page.locator('#pdf-file-input').setInputFiles('tests/fixtures/searchable.pdf');await page.waitForTimeout(4500);
console.log('pdfWidgets',await page.locator('#widget-count').textContent());
await page.locator('#toggle-search-panel').click();await page.locator('#search-query').fill('Chlorophyll');await page.waitForTimeout(500);console.log('search',await page.locator('#search-result-count').textContent());assert.notEqual(await page.locator('#search-result-count').textContent(),'0 results');
await page.locator('#search-close').click();
// Leave the app so its pagehide save completes, then inject the persisted
// recovery fixture without the live runtime overwriting it during reload.
await context.setOffline(false);
await page.goto('http://127.0.0.1:4174/docs/PROJECT_SUMMARY.md');
await page.evaluate(async () => {
  const workspaceModule = await import('/src/features/storage/workspace-database.js');
  await workspaceModule.createWorkspaceDatabase();
  const snapshot = await workspaceModule.inspectWorkspaceStorage();
  for (const [key, envelope] of snapshot.records) {
    const pdf = envelope?.data?.widgets?.find((widget) => widget.type === 'pdf-document');
    if (!pdf) continue;
    const scopeId = envelope.data.contextId;
    const sectionId = scopeId.split('::').at(-1);
    envelope.data.suggestions = [{
      id: 'offline-ghosted-suggestion', scopeId, sectionId,
      documentId: null, kind: 'reference-popup', label: 'Chlorophyll reference',
      fingerprint: 'offline-ghosted-suggestion', anchor: { x: pdf.position.x, y: pdf.position.y },
      payload: { sourceWidgetId: pdf.id, snippetText: 'Chlorophyll absorbs light.' },
      state: 'ghosted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }];
    workspaceModule.updateActiveWorkspaceRecord(key, () => envelope);
  }
  await workspaceModule.flushWorkspaceWrites();
});
await context.setOffline(true);
await page.goto('http://127.0.0.1:4174');await page.waitForTimeout(1000);assert.equal(await page.locator('#widget-count').textContent(),'1');
await page.locator('#toggle-search-panel').click();await page.locator('#search-query').fill('Chlorophyll');await page.waitForTimeout(400);
await page.locator('.search-result-item').first().click();
await page.locator('.suggestion-recovery-tray').waitFor();
assert.match(await page.locator('.suggestion-recovery-tray summary').textContent(), /Dismissed \(1\)/);
await page.locator('.suggestion-recovery-tray summary').click();
await page.locator('.suggestion-recovery-list [data-action="restore"]').click();
await page.waitForFunction(() => !document.querySelector('.suggestion-recovery-list [data-action="restore"]'));
await page.locator('#search-close').click();
const assets=await page.evaluate(()=>JSON.parse(localStorage.getItem('notes-app.assets.catalog.v1')).data.records.map(r=>r.type));console.log('assetTypes',assets);assert.ok(assets.includes('pdf-bytes'));
await page.locator('#toggle-tools').click();
await page.locator('#share-current-section').click();
await page.locator('.export-dialog button[value="preview"]').click();
await page.locator('.export-dialog [data-action="save"]').waitFor();
const exported = page.waitForEvent('download');
await page.locator('.export-dialog [data-action="save"]').click();
assert.match((await exported).suggestedFilename(), /\.pdf$/);
const backup = await page.evaluate(async () => {
  const module = await import('/src/features/storage/workspace-backup.js');
  const blob = await module.createWorkspaceBackup();
  return (await module.inspectWorkspaceBackup(blob)).records.length;
});
assert.ok(backup > 0, 'Offline editable backup includes PDF assets');
const stagedCleanup = await page.evaluate(async () => {
  const module = await import('/src/features/storage/workspace-backup.js');
  const blob = await module.createWorkspaceBackup();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('notes-app-assets', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('payloads', 'readwrite');
    tx.objectStore('payloads').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  const controller = new AbortController();
  let cancelled = false;
  try {
    await module.restoreWorkspaceBackup(blob, {
      signal: controller.signal,
      onProgress: (completed) => { if (completed === 1) controller.abort(); },
    });
  } catch (error) {
    cancelled = error.name === 'AbortError';
  }
  const keys = await new Promise((resolve, reject) => {
    const tx = db.transaction('payloads', 'readonly');
    const request = tx.objectStore('payloads').getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return { cancelled, keys };
});
assert.equal(stagedCleanup.cancelled, true, 'Restore cancellation is reported');
assert.deepEqual(stagedCleanup.keys, [], 'Cancelled restore removes newly staged assets');
console.log('offline export and editable backup passed');
console.log('errors',errors);assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/notes-app-check-offline-pdf.png'});await browser.close();
