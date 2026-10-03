// The preview is a local snapshot. Exporting never saves or changes campaign data.
export const PRINT_STORAGE_KEY = 'dice-forge.pj-print.v1';

export function inventoryPrintKey(room, characterId) {
  if (!room?.code || !room?.userId || !room?.player) return 'dice-forge.inventory.v1:local';
  return `dice-forge.inventory.v1:${room.userId}:${String(room.code).toUpperCase()}${characterId ? ':' + characterId : ''}`;
}

export function readPrintInventory(storage, room, characterId) {
  try {
    const value = JSON.parse(storage.getItem(inventoryPrintKey(room, characterId)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch { return null; }
}

export function storePrintSnapshot(storage, data) {
  storage.setItem(PRINT_STORAGE_KEY, JSON.stringify({ ...data, printVersion: 2 }));
}

export function loadPrintSnapshot(storage, legacyStorage) {
  // A damaged current snapshot must not silently show a different, older character.
  const raw = storage.getItem(PRINT_STORAGE_KEY) ?? legacyStorage?.getItem(PRINT_STORAGE_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !data.fields || typeof data.fields !== 'object') {
    throw new Error('Fiche PDF invalide');
  }
  return data;
}
