// Serializable entity deltas: original assets are referenced, never copied into each undo step.
const COLLECTIONS = ['widgets', 'strokes', 'documents', 'documentBindings', 'ordering'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (entry) => entry.id ?? entry.documentId;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function diffState(before, after) {
  const changes = [];
  for (const collection of COLLECTIONS) {
    const previous = new Map((before[collection] ?? []).map((entry) => [key(entry), entry]));
    const next = new Map((after[collection] ?? []).map((entry) => [key(entry), entry]));
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      const a = previous.get(id) ?? null, b = next.get(id) ?? null;
      if (!equal(a, b)) changes.push({ collection, id, before: a, after: b });
    }
  }
  return clone(changes);
}

export function applyChanges(state, changes, direction) {
  const result = clone(state);
  // Check every precondition before applying anything.
  for (const change of changes) {
    const expected = direction === 'before' ? change.after : change.before;
    const current = (result[change.collection] ?? []).find((entry) => key(entry) === change.id) ?? null;
    if (!equal(current, expected)) throw new Error('This edit changed since it was recorded. Nothing was undone.');
  }
  for (const { collection, id, [direction]: value } of changes) {
    const list = result[collection] ?? [];
    const index = list.findIndex((entry) => key(entry) === id);
    if (value === null) { if (index >= 0) list.splice(index, 1); }
    else if (index >= 0) list[index] = clone(value);
    else list.push(clone(value));
    result[collection] = list;
  }
  return result;
}

export function createSectionHistory({ state, saved, maxActions = 100, maxBytes = 2 * 1024 * 1024, now = Date.now } = {}) {
  let baseline = clone(state);
  let past = saved?.version === 1 && Array.isArray(saved.past) ? clone(saved.past) : [];
  let future = saved?.version === 1 && Array.isArray(saved.future) ? clone(saved.future) : [];
  let deleted = saved?.version === 1 && Array.isArray(saved.deleted) ? clone(saved.deleted) : [];
  const expire = () => { deleted = deleted.filter((entry) => entry.deletedAt + RETENTION_MS > now()); };
  const trim = () => {
    while (past.length + future.length > maxActions || JSON.stringify({ past, future }).length * 2 > maxBytes) {
      if (past.length) past.shift(); else if (future.length) future.shift(); else break;
    }
  };
  expire(); trim();
  return {
    get state() { return clone(baseline); },
    get undoDepth() { return past.length; },
    get redoDepth() { return future.length; },
    capture(next, label = 'Edit') {
      const changes = diffState(baseline, next);
      if (!changes.length) return null;
      const action = { id: globalThis.crypto?.randomUUID?.() ?? `${now()}-${Math.random()}`, label, changes };
      const removedWidgets = changes.filter((c) => c.collection === 'widgets' && c.before && !c.after);
      const removedInk = changes.filter((c) => c.collection === "strokes" && c.before && !c.after);
      if (removedWidgets.length || removedInk.length) {
        action.label = 'Delete';
        const ids = new Set(removedWidgets.map((c) => c.id));
        deleted.push({ id: action.id, deletedAt: now(), label: removedWidgets.length ? removedWidgets.map((c) => c.before.metadata?.title ?? c.before.type).join(', ') : 'Ink', changes: changes.filter((c) => !c.after && (c.collection === 'widgets' || c.collection === 'strokes' || ids.has(c.before?.widgetId))) });
      }
      past.push(action); future = []; baseline = clone(next); expire(); trim();
      return action;
    },
    prepare(direction) {
      const action = (direction === 'undo' ? past : future).at(-1);
      return action ? { action, state: applyChanges(baseline, action.changes, direction === 'undo' ? 'before' : 'after') } : null;
    },
    commit(direction, prepared) {
      const from = direction === 'undo' ? past : future, to = direction === 'undo' ? future : past;
      if (from.at(-1)?.id !== prepared.action.id) throw new Error('History changed during recovery.');
      from.pop(); to.push(prepared.action); baseline = clone(prepared.state);
      if (direction === 'undo') deleted = deleted.filter((entry) => entry.id !== prepared.action.id);
      else if (prepared.action.label === 'Delete') {
        deleted.push({ id: prepared.action.id, deletedAt: now(), label: 'Deleted content', changes: prepared.action.changes.filter((c) => c.before && !c.after) });
      }
    },
    listDeleted() { expire(); return clone(deleted); },
    prepareRestore(id) {
      const entry = deleted.find((item) => item.id === id);
      if (!entry) return null;
      return applyChanges(baseline, entry.changes, 'before');
    },
    forgetDeleted(id) { deleted = deleted.filter((entry) => entry.id !== id); },
    emptyDeleted() { deleted = []; },
    serialize() { expire(); return clone({ version: 1, past, future, deleted }); },
  };
}
