import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto('http://127.0.0.1:4174');await page.waitForTimeout(600);await page.locator('#onboarding-hint-dismiss').click().catch(()=>{});
async function create(type,x,y){await page.mouse.click(x,y,{button:'right'});await page.locator(`[data-create-type="${type}"]`).click();await page.waitForTimeout(400);}
await create('expanded-area',300,250);assert.equal(await page.locator('#widget-count').textContent(),'1');
await page.mouse.click(330,280,{button:'right'});await page.locator('[data-action="toggle-library"]').click();await page.waitForTimeout(400);
await page.locator('#reference-manager-launcher').click();await page.locator('#reference-manager-reference-list [data-action="add-chip"]').first().click();await page.waitForTimeout(500);assert.equal(await page.locator('#widget-count').textContent(),'2');
await page.locator('#library-close').click();
const copies=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('notes-app.context.workspace.')).flatMap(([,v])=>JSON.parse(v).data.widgets));console.log('copies',copies.map(w=>({id:w.id,independent:w.metadata.independentCopy,origin:w.metadata.sourceProvenance})));
assert.equal(copies.filter(w=>w.metadata.independentCopy).length,1);
await page.locator('#toggle-search-panel').click();await page.locator('#search-query').fill('Notes');await page.waitForTimeout(500);console.log('search',await page.locator('#search-result-count').textContent());await page.locator('#search-close').click();
await page.locator('#toggle-tools').click();await page.locator('#share-current-section').click();
await page.locator('.export-dialog button[value="preview"]').click();await page.locator('.export-dialog [data-action="save"]').waitFor();await page.waitForTimeout(350);
const exportDownload=page.waitForEvent('download');await page.locator('.export-dialog [data-action="save"]').click();console.log('pdf', (await exportDownload).suggestedFilename());
if (!await page.locator('#workspace-backup').isVisible()) await page.locator('#toggle-tools').click();
const backupDownload=page.waitForEvent('download');await page.locator('#workspace-backup').click();const download=await backupDownload;await download.saveAs('/tmp/notes-app-check-full.notesbackup');
const result=await page.evaluate(async()=>{const {createWorkspaceBackup,inspectWorkspaceBackup}=await import('/src/features/storage/workspace-backup.js'); const blob=await createWorkspaceBackup();const manifest=await inspectWorkspaceBackup(blob);return {size:blob.size,keys:Object.keys(manifest.settings).length};});console.log('backup',result);
console.log('errors',errors);assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/notes-app-check-full-check.png'});await browser.close();
