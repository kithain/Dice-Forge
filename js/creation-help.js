import { professionByName, speciesByName } from './brp-data.js?v=20261004-professions-r2';

export const WEALTH_CLASSES = ['Indigent', 'Pauvre', 'Moyen', 'Aisé', 'Riche'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function professionSkill(name, profession) {
  const rules = normalize(professionByName(profession)?.skills);
  const root = normalize(name).replace(/\s*\(.*$/, '').trim();
  if (!rules || !root) return false;
  return new RegExp(`(^|[^a-z])${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(rules);
}

export function ageTable(race) {
  const species = speciesByName(race);
  return { race: species.name, rows: species.ageBands.map(band => ({
    range: `${band.min} à ${band.max} ans`, label: band.label
  })) };
}

export function ageHelpText(race) {
  const table = ageTable(race);
  return `Classes d’âge — ${table.race}\n${table.rows.map(band => `${band.range} : ${band.label}`).join('\n')}`;
}

// Preserve historical/custom social classes as selectable values.
export function fillWealthOptions(select, value = select.value) {
  const options = [...new Set([...WEALTH_CLASSES, value].filter(Boolean))];
  select.replaceChildren(...options.map(label => new Option(label, label)));
  select.value = value || 'Moyen';
}
