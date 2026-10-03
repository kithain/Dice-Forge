const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .filter(key => key !== 'id').map(key => [key, canonical(value[key])])) : value;
// Item IDs can be assigned by an older server on first save. That metadata is
// not a user edit; differences in actual fields still constitute a conflict.
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function inventoryChanges(before, after, path = []) {
  if (equal(before, after)) return [];
  if (object(before) && object(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key =>
      inventoryChanges(before[key], after[key], [...path, key]));
  }
  return [{ path, before: before ?? null, after: after ?? null,
    beforeExists: before !== undefined, afterExists: after !== undefined }];
}

export function applyInventoryChanges(base, changes, strict = true) {
  const result = clone(base);
  for (const change of changes) {
    let parent = result;
    for (const key of change.path.slice(0, -1)) parent = parent[key] ||= {};
    const key = change.path.at(-1);
    const current = parent[key];
    const matches = (value, exists) => exists ? equal(current, value) : current === undefined;
    if (strict && !matches(change.before, change.beforeExists) && !matches(change.after, change.afterExists)) {
      const error = new Error(`Conflit sur « ${change.path.join('.')} ». Vos modifications restent dans l’historique local ; utilisez « Résoudre le conflit » pour choisir de les appliquer.`);
      error.code = 'DF_INVENTORY_CONFLICT';
      throw error;
    }
    if (change.afterExists) parent[key] = clone(change.after); else delete parent[key];
  }
  return result;
}

// One durable FIFO per account/room. A failed head stays pending, so later edits
// never overtake it. Arrays are compared as a whole to avoid losing remote rows.
export function inventoryJournal(storage, key) {
  let entries = JSON.parse(storage.getItem(key) || '[]');
  if (!Array.isArray(entries)) throw new Error('Historique local illisible.');
  let running = null;
  const refresh = () => {
    const stored = JSON.parse(storage.getItem(key) || '[]');
    if (!Array.isArray(stored)) throw new Error('Historique local illisible.');
    const byId = new Map(stored.map(entry => [entry.id, entry]));
    for (const entry of entries) {
      if (byId.get(entry.id)?.status !== 'saved') byId.set(entry.id, entry);
    }
    entries = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const savedEntries = entries.filter(entry => entry.status === 'saved');
    const retained = new Set(savedEntries.slice(-100));
    entries = entries.filter(entry => entry.status !== 'saved' || retained.has(entry));
  };
  const persist = () => { refresh(); storage.setItem(key, JSON.stringify(entries)); };
  const pending = () => entries.filter(entry => entry.status === 'pending');
  return {
    pending,
    history: () => clone(entries),
    record(before, after) {
      const changes = inventoryChanges(before, after);
      if (!changes.length) return;
      const entry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pending', changes };
      entries.push(entry);
      try { persist(); } catch (error) { entries = entries.filter(item => item.id !== entry.id); throw error; }
    },
    replay(base, strict = false) {
      return pending().reduce((data, entry) => applyInventoryChanges(data, entry.changes, strict), clone(base));
    },
    // Explicit user resolution only: preserve the original patch in the audit,
    // then rebase each pending edit in order over the newly fetched baseline.
    rebase(base) {
      refresh();
      let data = clone(base);
      for (const entry of pending()) {
        const next = applyInventoryChanges(data, entry.changes, false);
        entry.originalChanges ||= clone(entry.changes);
        entry.changes = inventoryChanges(data, next);
        entry.rebasedAt = new Date().toISOString();
        data = next;
      }
      persist();
    },
    flush(read, write, acknowledged = () => {}) {
      if (running) return running;
      const drain = async () => {
        refresh();
        while (pending().length) {
          const entry = pending()[0];
          let saved;
          for (let attempt = 0; attempt < 3; attempt++) {
            const latest = await read();
            const data = applyInventoryChanges(latest.data, entry.changes);
            try { saved = await write(data, latest); break; }
            catch (error) { if (error.code !== '40001' || attempt === 2) throw error; }
          }
          entry.status = 'saved';
          entry.savedAt = new Date().toISOString();
          persist();
          acknowledged(saved);
        }
      };
      const locks = globalThis.navigator?.locks;
      running = (locks ? locks.request(`diceforge-inventory:${key}`, drain) : drain())
        .finally(() => { running = null; });
      return running;
    }
  };
}
