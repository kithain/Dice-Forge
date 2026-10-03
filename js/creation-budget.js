import { professionSkill } from './creation-help.js?v=20261003-age-help';
import { professionByName } from './brp-data.js?v=20260715-combat-cleanup';
import { BRP_SKILLS } from './brp-skills.js?v=20260925-medfan';

const number = value => Math.max(0, Number(value) || 0);
export function creationBudget(sheet, skills = sheet.skills || [], spells = sheet.spells || []) {
  const locked = ['play', 'legacy_review'].includes(sheet.creation?.phase);
  const professional = number((locked ? sheet.creation?.professional : null) ?? sheet.fields?.skillProfessionalPool ?? 325);
  const personal = number((locked ? sheet.creation?.personal : null) ?? number(sheet.stats?.intelligence) * 10);
  const profession = sheet.fields?.profession || '';
  const magic = professionByName(profession)?.tag === 'Magie';
  const cost = row => locked
    ? (row?.allocation?.origin === 'learning' ? 0 : number(row?.allocation?.creation_points ?? row?.allocation?.inherited_points ?? row?.allocation?.points ?? row?.points))
    : number(row?.points);
  let eligible = 0, outside = 0;
  skills.forEach((row, index) => {
    if (professionSkill(row?.name || BRP_SKILLS[index]?.[0], profession)) eligible += cost(row);
    else outside += cost(row);
  });
  spells.filter(row => row?.name).forEach(row => { if (magic) eligible += cost(row); else outside += cost(row); });
  const professionalUsed = Math.min(professional, eligible);
  const personalUsed = outside + Math.max(0, eligible - professional);
  return { professional, personal, eligible, outside, professionalUsed, personalUsed,
    professionalRemaining: professional - professionalUsed, personalRemaining: personal - personalUsed,
    total: professional + personal, spent: eligible + outside, remaining: professional + personal - eligible - outside };
}

export function creationBudgetErrors(sheet, skills, spells) {
  if (['play', 'legacy_review'].includes(sheet.creation?.phase)) return [];
  const budget = creationBudget(sheet, skills, spells), errors = [];
  if (budget.personalRemaining < 0) errors.push(`Points personnels dépassés de ${-budget.personalRemaining} : ${budget.personalUsed}/${budget.personal}. Les points professionnels sont réservés aux compétences étoilées.`);
  if (budget.remaining < 0) errors.push(`Budget total dépassé de ${-budget.remaining} point(s).`);
  return errors;
}

// An unfinished allocation may be saved as a draft, but cannot enter play.
export function creationValidationErrors(sheet, skills, spells) {
  const errors = creationBudgetErrors(sheet, skills, spells);
  if (['play', 'legacy_review'].includes(sheet.creation?.phase)) return errors;
  const budget = creationBudget(sheet, skills, spells);
  if (budget.remaining > 0) errors.push(`Il reste ${budget.remaining} point(s) à répartir avant de valider la création : ${budget.professionalRemaining} professionnels et ${Math.max(0,budget.personalRemaining)} personnels.`);
  return errors;
}
