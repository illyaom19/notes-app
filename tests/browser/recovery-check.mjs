import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto('http://127.0.0.1:4174');await page.waitForTimeout(600);await page.locator('#onboarding-hint-dismiss').click().catch(()=>{});
await page.mouse.click(350,300,{button:'right'});await page.locator('[data-create-type="expanded-area"]').click();await page.waitForTimeout(350);
await page.mouse.click(360,310,{button:'right'});await page.locator('[data-action="remove-widget"]').click();await page.waitForTimeout(400);assert.equal(await page.locator('#widget-count').textContent(),'0');
await page.locator('#recovery-notification button').getByText('Undo',{exact:true}).click();await page.waitForTimeout(400);assert.equal(await page.locator('#widget-count').textContent(),'1');
await page.mouse.click(360,310,{button:'right'});await page.locator('[data-action="remove-widget"]').click();await page.waitForTimeout(400);await page.reload();await page.waitForTimeout(500);
await page.locator('#toggle-tools').click();await page.locator('#recently-deleted').click();await page.getByRole('button',{name:/Restore Notes/}).click();await page.waitForTimeout(400);assert.equal(await page.locator('#widget-count').textContent(),'1');
const archived=await page.evaluate(async()=>{const m=await import('/src/features/storage/workspace-backup.js');const blob=await m.createWorkspaceBackup(); const before=Object.fromEntries(Object.entries(localStorage));localStorage.setItem('notes-app.test-restore','temporary');await m.restoreWorkspaceBackup(blob);const restored=localStorage.getItem('notes-app.test-restore')===null;const parts=[await blob.slice(0,blob.size-1).arrayBuffer(),new Uint8Array([0])];let rejected=false;try{await m.restoreWorkspaceBackup(new Blob(parts));}catch{rejected=true;}return{restored,rejected,journal:localStorage.getItem('notes-app.restore-journal')};});console.log('archive',archived);assert.equal(archived.restored,true);assert.equal(archived.rejected,true);assert.equal(archived.journal,null);const interrupted = await page.evaluate(async () => {
  const module = await import('/src/features/storage/workspace-backup.js');
  const before = Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('notes-app.')));
  localStorage.setItem('notes-app.restore-journal', JSON.stringify(before));
  localStorage.setItem('notes-app.partial-restore', 'unfinished');
  module.recoverInterruptedRestore();
  return localStorage.getItem('notes-app.partial-restore') === null && localStorage.getItem('notes-app.restore-journal') === null;
});
assert.equal(interrupted, true, 'Interrupted settings restore rolls back');
assert.deepEqual(errors,[]);console.log('recovery checks passed');await browser.close();
