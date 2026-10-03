import { BRP_ACTIVE_SKILLS } from './brp-skills.js';
import { spellScore } from './pj-magic.js?v=20261003-learning';

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export function sheetSummary(row) {
  const data = row.sheet_data || {}, f = data.fields || {}, stats = data.stats || {};
  const skills = BRP_ACTIVE_SKILLS.map(({ skill, index }) => ({ name: skill[0], score: text(data.skills?.[index]?.score) }))
    .filter(skill => skill.score.trim() !== '' && Number.isFinite(parseFloat(skill.score)));
  const line = skill => `${skill.name} : ${parseFloat(skill.score)} %`;
  const named = (...names) => skills.filter(skill => names.includes(skill.name)).map(line).join('\n');
  const ranked = [...skills].sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  const weapon = Array.isArray(data.weapons) ? data.weapons.find(w => w?.name) : null;
  const con = Number(stats.constitution), size = Number(stats.taille);
  const result = {
    name: text(f.name || row.character_name || row.player_name), role: text(f.profession),
    hpMax: con > 0 && size > 0 ? String(Math.ceil((con + size) / 2)) : '',
    speed: text(f.movement), defense: named('Défense'), perception: named('Observation', 'Écouter'),
    strengths: ranked.slice(0, 4).map(line).join('\n'),
    attack: weapon ? [weapon.name, weapon.contactScore && `Contact ${weapon.contactScore}`, weapon.distanceScore && `Distance ${weapon.distanceScore}`].filter(Boolean).join(' · ') : '',
    damage: text(weapon?.damage), languages: named('Langue (divers)'),
    detection: named('Observation', 'Écouter', 'Sens', 'Intuition'), survival: named('Pistage', 'Navigation'),
    locks: named('Manipulation fine'), movement: named('Vol', 'Nage', 'Escalade'),
    persuasion: named('Intimidation/Persuasion'), intimidation: named('Intimidation/Persuasion'), deception: named('Baratin'),
    factions: text(f.factionLinks), npc: text(f.npcLinks), motivation: text(f.motivation),
    signature: text(f.powers),
    spells: Array.isArray(data.spells) ? data.spells.filter(s => s?.name).map(s => `${text(s.name)} : ${spellScore(data,s)} %`).join('\n') : '',
    armor: [text(f.armorType), f.armorPoints !== undefined && f.armorPoints !== '' ? `${text(f.armorPoints)} PA` : ''].filter(Boolean).join(' · '),
    equipment: text(f.equipment),
    conditions: row.character_status === 'dead' ? 'Mort · fiche conservée' : ''
  };
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.slice(0, 20000)]));
}

// Keep local overrides and GM-only notes; update fields still equal to the last source value.
export function mergeRoomSheets(characters, rows, room, { deletedCharacters = [], sheetSources = [] } = {}) {
  const result = [];
  const snapshot = pj => { try { return JSON.parse(pj.sourceSnapshot || '{}') || {}; } catch { return {}; } };
  const metadata = key => key.startsWith('source');
  const overrides = (pj, key) => {
    if (metadata(key) || pj[key] === undefined) return false;
    const previous = snapshot(pj);
    return Object.hasOwn(previous, key) ? pj[key] !== previous[key] : pj[key] !== '';
  };
  const conflicts = pj => { try { const value = JSON.parse(pj.sourceMergeConflicts || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  for (const original of characters) {
    const pj = { ...original };
    if (pj.sourceRoom === room) {
      const candidates = sheetSources.filter(s => pj.sourceCharacter ? s.character_id === pj.sourceCharacter :
        String(s.state_id) === String(pj.sourceId) || (s.legacy_sheet_ids || []).map(String).includes(String(pj.sourceId)));
      const identity = candidates.length === 1 ? candidates[0] : null;
      if (identity) { pj.sourceId = String(identity.state_id); pj.sourceCharacter = identity.character_id; }
    }
    const existing = pj.sourceRoom === room && pj.sourceId ? result.find(item => item.sourceRoom === room &&
      ((item.sourceId === pj.sourceId && (!item.sourceCharacter || !pj.sourceCharacter || item.sourceCharacter === pj.sourceCharacter)) ||
        (pj.sourceCharacter && item.sourceCharacter === pj.sourceCharacter))) : null;
    if (!existing) { result.push(pj); continue; }
    const retained = [...conflicts(existing), ...conflicts(pj)];
    for (const [key, value] of Object.entries(pj)) {
      if (metadata(key)) continue;
      if (overrides(pj, key)) {
        if (!overrides(existing, key)) existing[key] = value;
        else if (existing[key] !== value && !retained.some(note => note.field === key && note.value === value)) retained.push({ field: key, value });
      } else if (existing[key] === undefined) existing[key] = value;
    }
    const encoded = JSON.stringify(retained);
    if (encoded.length > 1000000) throw new Error('Notes trop volumineuses pour regrouper les doublons. Exportez le carnet pour les conserver.');
    existing.sourceMergeConflicts = encoded;
  }
  for (const pj of result) {
    if (pj.sourceRoom === room && deletedCharacters.some(c => String(c.state_id || '') === pj.sourceId || c.character_id === pj.sourceCharacter)) pj.sourceDeleted = 'yes';
  }
  for (const row of rows) {
    if (row.room_code !== room || row.id == null) continue;
    if (deletedCharacters.some(c => String(c.state_id || '') === String(row.id) || c.character_id === row.character_id)) continue;
    const sourceId = String(row.id);
    let pj = result.find(item => item.sourceRoom === room && item.sourceId === sourceId);
    if (!pj) {
      if (result.filter(item => item.sourceDeleted !== 'yes').length >= 100 || result.length >= 1000) throw new Error('Limite de 100 PJ atteinte. Retirez des fiches avant de réessayer.');
      pj = { sourceId, sourceRoom: room }; result.push(pj);
    }
    let previous = {};
    try { previous = JSON.parse(pj.sourceSnapshot || '{}'); } catch { /* An old export may lack a snapshot. */ }
    if (!previous || typeof previous !== 'object') previous = {};
    const next = sheetSummary(row);
    for (const [key, value] of Object.entries(next)) {
      if (pj[key] === undefined || pj[key] === previous[key]) pj[key] = value;
    }
    pj.sourceSnapshot = JSON.stringify(next);
    pj.sourcePlayer = text(row.player_name);
    pj.sourceCharacter = text(row.character_id);
    pj.sourceDeleted = '';
  }
  return result;
}
