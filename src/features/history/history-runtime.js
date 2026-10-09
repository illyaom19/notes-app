import { createSectionHistory } from './section-history.js';

export function createHistoryRuntime({ canvas, getScope, getSnapshot, applySnapshot, persist, notify, onChange, isBusy }) {
  let history = null, scope = null, timer = null, applying = false;
  const pointers = new Set();
  const update = () => onChange?.(history?.undoDepth ?? 0, history?.redoDepth ?? 0, applying);
  function capture() {
    clearTimeout(timer);
    if (!history || applying || isBusy() || pointers.size || scope !== getScope()) return;
    const action = history.capture(getSnapshot());
    update();
    if (action) {
      persist();
      if (action.label === 'Delete') notify('Deleted — available in Recently Deleted', () => move('undo'));
    }
  }
  function schedule() {
    if (applying || isBusy()) return;
    clearTimeout(timer);
    timer = setTimeout(capture, 0);
  }
  canvas.addEventListener('pointerdown', (event) => { capture(); pointers.add(event.pointerId); }, true);
  window.addEventListener('pointerup', (event) => { pointers.delete(event.pointerId); schedule(); });
  window.addEventListener('pointercancel', (event) => {
    const tracked = pointers.delete(event.pointerId);
    if (tracked && !pointers.size && history && !applying && !isBusy()) {
      clearTimeout(timer); void apply(history.state).catch((error) => notify(error.message));
    }
  });
  async function apply(next) {
    applying = true; update();
    try { await applySnapshot(next); }
    finally { applying = false; update(); }
  }
  async function move(direction) {
    if (applying || pointers.size || isBusy()) return;
    capture();
    try {
      const prepared = history?.prepare(direction);
      if (!prepared) return;
      await apply(prepared.state);
      history.commit(direction, prepared);
      persist(); update();
    } catch (error) { notify(error.message); }
  }
  return {
    initialize(state, saved) { clearTimeout(timer); scope = getScope(); pointers.clear(); history = createSectionHistory({ state, saved }); update(); },
    capture, schedule, move,
    async replace(next, label = 'Replace content') {
      if (applying || pointers.size || isBusy()) return false;
      capture();
      await apply(next);
      history.capture(getSnapshot(), label);
      persist(); update();
      return true;
    },
    get applying() { return applying; },
    serialize: () => history?.serialize() ?? null,
    listDeleted: () => history?.listDeleted() ?? [],
    async restore(id) {
      if (applying || isBusy()) return;
      capture();
      try {
        const next = history?.prepareRestore(id);
        if (!next) return;
        await apply(next); history.capture(next, 'Restore deleted content'); history.forgetDeleted(id); persist(); update();
      } catch (error) { notify(error.message); }
    },
    emptyDeleted() { history?.emptyDeleted(); persist(); },
  };
}
