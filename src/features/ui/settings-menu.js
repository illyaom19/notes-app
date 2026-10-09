export function organizeSettingsMenu(documentObj = document) {
  const root = documentObj.querySelector('#controls-panel .controls');
  const groups = [
    ['Document actions', ['import-context-widget', 'share-current-section', 'workspace-backup', 'workspace-restore', 'recently-deleted', 'clear-diagram']],
    ['Writing and gestures', ['enable-ink', 'toggle-ink-tool', 'gesture-enabled', 'gesture-doubletap-enabled', 'gesture-barreltap-enabled', 'gesture-doubletap-binding', 'gesture-barreltap-binding']],
    ['Help', ['toggle-onboarding-hints', 'reset-onboarding-hints']],
    ['Developer', ['toggle-ui-mode', 'start-worker', 'run-stress-benchmark']],
  ];
  for (const [title, ids] of groups) {
    const section = documentObj.createElement(title === 'Developer' ? 'details' : 'section'); section.className = 'settings-group';
    const heading = documentObj.createElement(title === 'Developer' ? 'summary' : 'h2'); heading.textContent = title; section.append(heading);
    for (const id of ids) { const element = documentObj.getElementById(id); if (element) section.append(element.closest('label') ?? element); }
    root.append(section);
  }
  const appearance = documentObj.createElement('section'); appearance.className = 'settings-group';
  appearance.innerHTML = '<h2>Appearance</h2><label>Panel width<input type="range" min="280" max="640" step="20" aria-label="Library and search panel width"></label>';
  const width = appearance.querySelector('input'); width.value = localStorage.getItem('notes-app.drawer-width') ?? '380';
  const apply = () => documentObj.documentElement.style.setProperty('--drawer-width', `${Number(width.value)}px`);
  width.oninput = () => { apply(); localStorage.setItem('notes-app.drawer-width', width.value); }; apply();
  root.insertBefore(appearance, root.querySelector('details'));
}
