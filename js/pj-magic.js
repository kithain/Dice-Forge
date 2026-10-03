const text = value => String(value ?? '').trim();
const points = value => Math.max(0, Number(value) || 0);
export function spellScore(sheet,spell) {
  if(spell.allocation?.score != null)return Number(spell.allocation.score)+points(spell.allocation.xp_points);
  const base=sheet.creation?.phase==='draft' ? sheet.stats?.intelligence : (spell.base ?? sheet.stats?.intelligence);
  return points(base)+points(spell.points);
}

export function normalizeSpells(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => ({ ...row,
    name: text(row?.name), points: String(row?.points ?? '0'), checked: !!row?.checked
  }));
}

export function magicBudget(sheet, spells, skillIndexes) {
  const locked=['play','legacy_review'].includes(sheet.creation?.phase);
  const professional = points((locked ? sheet.creation?.professional : null) ?? sheet.fields?.skillProfessionalPool ?? 325);
  const intelligence = points(sheet.stats?.intelligence);
  const personal = locked && sheet.creation?.personal != null ? points(sheet.creation.personal) : intelligence * 10;
  const skillsSpent = skillIndexes.reduce((sum, index) => sum + points(sheet.skills?.[index]?.points), 0);
  const spellsSpent = spells.filter(row => row.name).reduce((sum, row) => sum + points(row.points), 0);
  return { professional, personal, intelligence, total: professional + personal,
    spent: skillsSpent + spellsSpent, spellsSpent, remaining: professional + personal - skillsSpent - spellsSpent
      + (['play','legacy_review'].includes(sheet.creation?.phase) ? points(sheet.progression?.xp_points)+points(sheet.progression?.learning_points) : 0) };
}

export function magicErrors(sheet, proposed, allowedNewSpells, skillIndexes) {
  const errors = [];
  const existing = normalizeSpells(sheet.spells).filter(row => row.name);
  const existingNames = new Set(existing.map(row => row.name));
  const locked=['play','legacy_review'].includes(sheet.creation?.phase);
  const selected = new Set();
  for (const row of proposed.filter(row => row.name)) {
    if (selected.has(row.name)) errors.push(`« ${row.name} » est déjà présent.`);
    selected.add(row.name);
    if (!Number.isInteger(Number(row.points)) || Number(row.points) < 0 || Number(row.points) > 999 || text(row.points) === '') {
      errors.push(`« ${row.name} » : indiquez des points répartis entiers entre 0 et 999.`);
    }
    if (!existingNames.has(row.name) && !allowedNewSpells.includes(row.name)) errors.push(`« ${row.name} » n’est pas disponible pour cette profession.`);
    if(locked && (!existingNames.has(row.name) || Number(existing.find(s=>s.name===row.name)?.points)!==Number(row.points))) errors.push(`« ${row.name} » : points acquis verrouillés.`);
  }
  for (const name of existingNames) {
    if (!selected.has(name)) errors.push(`Le sort enregistré « ${name} » doit être conservé.`);
  }
  const next = magicBudget(sheet, proposed, skillIndexes);
  if (!locked && next.remaining < 0) errors.push(`Budget dépassé de ${-next.remaining} point(s), compétences et sorts compris.`);
  return errors;
}

// Conserve la position des sorts : les coches du lanceur utilisent ces indices.
export function mergeMagicSheet(sheet, proposed, powers) {
  const named = proposed.filter(row => row.name);
  const byName = new Map(named.map(row => [row.name, row]));
  const merged = normalizeSpells(sheet.spells).map(row => {
    if (!row.name) return row;
    const next = byName.get(row.name);
    return next ? { ...row, points: String(next.points), checked: !!next.checked } : row;
  });
  const present = new Set(merged.map(row => row.name).filter(Boolean));
  for (const row of named) {
    if (present.has(row.name)) continue;
    const next = { name: row.name, points: String(row.points), checked: !!row.checked };
    const empty = merged.findIndex(slot => !slot.name);
    if (empty < 0) merged.push(next); else merged[empty] = next;
    present.add(row.name);
  }
  return { ...sheet, spells: merged, fields: { ...sheet.fields, powers } };
}

// Actualise uniquement les lignes de sorts, leurs totaux dérivés et les notes de magie.
export function patchMagicMarkdown(markdown, before, after) {
  if (!markdown) return markdown;
  const names = new Set([...normalizeSpells(before.spells), ...after.spells].map(row => row.name).filter(Boolean));
  const cell = value => text(value).replace(/\|/g, '\\|');
  const intelligence = points(after.stats?.intelligence);
  const spellRows = after.spells.filter(row => row.name).map(row =>
    `| ${cell(row.name)} | ${row.allocation?.base ?? intelligence} | ${row.points} | ${spellScore(after,row)} | [${row.checked ? 'x' : ' '}] |`).join('\n');
  const skillIndexes = (after.skills || []).map((_, index) => index);
  const budget = magicBudget(after, after.spells, skillIndexes);
  return markdown.replace(/(## Compétences\s*\n)([\s\S]*?)(?=\n## |\n---|$)/, (_, heading, body) => {
    const kept = body.split('\n').filter(line => !names.has(line.split('|')[1]?.trim())).join('\n')
      .replace(/(\*\*Points répartis\s*:\*\*\s*)-?\d+/, (_, prefix) => prefix + budget.spent)
      .replace(/(\*\*Points restants\s*:\*\*\s*)-?\d+/, (_, prefix) => prefix + budget.remaining);
    return heading + kept.trimEnd() + (spellRows ? `\n${spellRows}` : '') + '\n';
  }).replace(/(## Sorts \/ pouvoirs\s*\n)[\s\S]*?(?=\n## |\n---|$)/, (_, heading) =>
    heading + (String(after.fields.powers || '').split(/\r?\n/).filter(line => line.trim()).map(line => `- ${line}`).join('\n') || '- ') + '\n');
}
