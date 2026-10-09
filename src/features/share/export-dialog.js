export function exportOptions(documentObj = document) {
  return new Promise((resolve) => {
    const dialog = documentObj.createElement('dialog'); dialog.className = 'export-dialog';
    dialog.innerHTML = `<form method="dialog"><h2>Export PDF</h2><p>Image-based PDF for sharing. Use workspace backup to keep editable content.</p><label>Content<select name="scope"><option value="section">Current section</option><option value="selection">Selected widget and its ink</option></select></label><label>Orientation<select name="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label>Layout<select name="layout"><option value="fit">Fit on one page</option><option value="tile">Tile at readable size</option></select></label><label>File name<input name="filename" value="Notes" required maxlength="120"></label><div class="dialog-actions"><button value="cancel">Cancel</button><button value="preview">Preview</button></div></form>`;
    dialog.addEventListener('close', () => { const data = Object.fromEntries(new FormData(dialog.querySelector('form'))); resolve(dialog.returnValue === 'preview' ? data : null); dialog.remove(); });
    documentObj.body.append(dialog); dialog.showModal();
  });
}
export function exportPreview(documentObj = document) {
  const dialog = documentObj.createElement('dialog'); dialog.className = 'export-dialog';
  dialog.innerHTML = `<h2>PDF preview</h2><p role="status">Preparing pages…</p><div class="export-pages"></div><div class="dialog-actions"><button data-action="cancel">Cancel</button><button data-action="save" disabled>Download PDF</button></div>`;
  const controller = new AbortController(); let resolveChoice;
  const choice = new Promise((resolve) => { resolveChoice = resolve; });
  const close = (save) => { if (!save) controller.abort(); resolveChoice(save); dialog.close(); dialog.remove(); };
  dialog.querySelector('[data-action="cancel"]').onclick = () => close(false);
  dialog.querySelector('[data-action="save"]').onclick = () => close(true);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(false); });
  documentObj.body.append(dialog); dialog.showModal();
  return {
    signal: controller.signal,
    append(canvas, number, count) {
      const thumb = documentObj.createElement('canvas'); thumb.width = 240; thumb.height = Math.round(canvas.height * 240 / canvas.width);
      thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height); thumb.setAttribute('aria-label', `Page ${number}`);
      dialog.querySelector('.export-pages').append(thumb); dialog.querySelector('[role="status"]').textContent = `Page ${number} of ${count}`;
    },
    ready() { dialog.querySelector('[data-action="save"]').disabled = false; return choice; },
    close: () => close(false),
  };
}
