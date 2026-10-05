export function normalizeGenre(value) {
  const genre = String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ({ m: 'Masculin', masculin: 'Masculin', f: 'Féminin', feminin: 'Féminin', n: 'Neutre', neutre: 'Neutre' })[genre] || '';
}
