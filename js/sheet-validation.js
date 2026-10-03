// Empty characteristics explicitly mean N/A; entered values must be whole scores.
export function characteristicErrors(stats) {
  const labels = { force: 'FOR', constitution: 'CON', taille: 'TAI', intelligence: 'INT',
    pouvoir: 'POU', dexterite: 'DEX', apparence: 'APP' };
  return Object.entries(stats || {}).flatMap(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return [];
    const score = Number(value);
    return Number.isInteger(score) && score >= 0 && score <= 999 ? []
      : [`${labels[key] || key} : indiquez un entier entre 0 et 999, ou laissez vide pour N/A.`];
  });
}

export function normalizeCharacteristics(stats) {
  return Object.fromEntries(Object.entries(stats || {}).map(([key, value]) =>
    [key, value === null || value === undefined || String(value).trim() === '' ? null : Number(value)]));
}

// Hidden rules do not participate in the active sheet. Keep old values outside
// skills so imports remain recoverable without spending points on unused rules.
export function archiveInactiveSkills(sheet, activeIndexes, skillIds) {
  const active = new Set(activeIndexes);
  const retiredSkills = { ...sheet.retiredSkills };
  (sheet.skills || []).forEach((skill, index) => {
    if (!active.has(index) && skill && Object.keys(skill).length) {
      retiredSkills[skill.id || skillIds[index] || `legacy.${index}`] = structuredClone(skill);
    }
  });
  return retiredSkills;
}

export function transferSheetData(source, destination) {
  const data = structuredClone(source);
  for (const key of ['character_id', 'state_id', 'campaign_id', 'revision']) delete data[key];
  if (destination?.sheet_data) {
    for (const key of ['character_id', 'state_id', 'campaign_id', 'revision']) {
      if (destination.sheet_data[key] !== undefined) data[key] = destination.sheet_data[key];
    }
  }
  return data;
}

// Server metadata is advisory in the UI; database guards remain authoritative.
export function isCreationLocked(sheet) {
  return sheet?.lifecycle?.status === 'dead' || ['play', 'legacy_review'].includes(sheet?.creation?.phase);
}

export function skillSaveValues(sheet, index, proposed) {
  const saved = sheet?.skills?.[index];
  if (!isCreationLocked(sheet)) return proposed;
  if (!saved || !Object.keys(saved).length) return {};
  return { ...proposed, base: saved.base, points: saved.points, score: saved.score };
}
