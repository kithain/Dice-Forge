const POTION_FIELDS = ['name', 'effect', 'backlash'];
const clean = value => String(value ?? '').trim();
const TYPE = 'alchemy-potions';
export const MAX_CARRIED_DOSES = 4;
export const doseCount = value => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(value)))) : 0;

export function availablePotionCapacity(rows, index) {
  return Math.max(0, MAX_CARRIED_DOSES - rows.reduce((total, row, position) =>
    total + (position === index ? 0 : doseCount(row?.carried)), 0));
}

export function normalizePotionRows(rows) {
  let remaining = MAX_CARRIED_DOSES;
  return (Array.isArray(rows) ? rows : []).map(row => {
    const requested = doseCount(row?.carried);
    const carried = Math.min(remaining, requested);
    remaining -= carried;
    return { ...Object.fromEntries(POTION_FIELDS.map(field => [field, clean(row?.[field])])),
      carried, stock: doseCount(row?.stock) + requested - carried };
  }).filter(row => POTION_FIELDS.some(field => row[field]) || row.carried || row.stock);
}

export function potionRowsFromInventory(source, catalog = []) {
  const saved = source?.consumables?.find?.(row => row?.type === TYPE);
  const rows = Array.isArray(source?.potions) ? source.potions : saved?.entries;
  if (!Array.isArray(rows)) return [];
  // Retire uniquement l'ancien répertoire intégral, jamais les potions personnalisées.
  const oldPrefill = catalog.length > 0 && rows.length === catalog.length && rows.every((row, index) =>
    row?.carried == null && row?.stock == null && POTION_FIELDS.every(field => row?.[field] === catalog[index][field]));
  return oldPrefill ? [] : normalizePotionRows(rows);
}

export function regularConsumables(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => row?.type !== TYPE);
}

// Le répertoire utilise la colonne JSON existante, sans migration Supabase.
// Le conteneur conserve aussi une liste volontairement vide.
export function consumablesWithPotions(consumables, potions) {
  return [...regularConsumables(consumables), { type: TYPE, entries: normalizePotionRows(potions) }];
}
