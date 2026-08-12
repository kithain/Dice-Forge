type JsonRecord = Record<string, unknown>;

export type SkillGroup = 'Combat' | 'Physique' | 'Magie & pouvoirs' | 'Social & mental' | 'Connaissances' | 'Pratique & divers';
export interface PlayableSkill { name: string; group: SkillGroup; base: number; points: number; score: number; checked: boolean }
export interface PlayableWeapon { name: string; contactScore: number; distanceScore: number; damage: string }
export interface PlayableSpell { name: string; points: number; checked: boolean }
export interface PlayableSheet {
  name: string;
  player: string;
  profession: string;
  race: string;
  stats: Array<{ key: string; label: string; score: number }>;
  hp: number;
  powerPoints: number;
  movement: number;
  course: number;
  skills: PlayableSkill[];
  weapons: PlayableWeapon[];
  spells: PlayableSpell[];
  armorType: string;
  armorPoints: string;
  powers: string;
  equipment: string;
  origin: string;
  npcLinks: string;
  factionLinks: string;
  motivation: string;
  notes: string;
}

const SKILL_NAMES = [
  'Estimation', 'Art (divers)', 'Artillerie (divers)', 'Marchandage', 'Bagarre', 'Escalade', 'Commandement',
  'Artisanat (divers)', 'Démolition', 'Déguisement', 'Défense', 'Conduite (divers)', 'Arme à énergie (divers)',
  'Étiquette (divers)', 'Baratin', 'Manipulation fine', 'Arme à feu (divers)', 'Premiers secours', 'Vol', 'Jeux',
  'Lutte', '', 'Arme lourde (divers)', 'Se cacher', 'Intuition', 'Saut', 'Connaissance (divers)',
  'Langue (divers)', 'Écouter', 'Alphabétisation (option)', '', 'Médecine', 'Arme de mêlée (divers)',
  'Arme de jet (divers)', 'Navigation', '', 'Représentation', 'Intimidation/Persuasion', 'Pilotage (divers)', '',
  'Psychothérapie', 'Réparation (divers)', 'Recherche', 'Équitation (divers)', 'Science (divers)', 'Sens', '',
  'Tour de main', 'Observation', 'Statut', 'Discrétion', 'Stratégie', 'Nage', 'Enseignement',
  'Compétence technique (divers)', 'Lancer', 'Pistage',
];

const STAT_LABELS: Record<string, string> = {
  force: 'FOR', constitution: 'CON', taille: 'TAI', intelligence: 'INT', pouvoir: 'POU', dexterite: 'DEX', apparence: 'APP', charisme: 'CHA',
};

const FIXED_SKILL_BASES: Record<string, number> = {
  'Estimation': 15, 'Art (divers)': 5, 'Artillerie (divers)': 0, 'Marchandage': 5, 'Bagarre': 25, 'Escalade': 40,
  'Commandement': 5, 'Artisanat (divers)': 5, 'Démolition': 1, 'Déguisement': 1, 'Conduite (divers)': 20,
  'Arme à énergie (divers)': 0, 'Étiquette (divers)': 5, 'Baratin': 5, 'Manipulation fine': 5, 'Arme à feu (divers)': 0,
  'Premiers secours': 30, 'Lutte': 25, 'Arme lourde (divers)': 0, 'Se cacher': 10, 'Intuition': 5, 'Saut': 25,
  'Connaissance (divers)': 5, 'Écouter': 25, 'Alphabétisation (option)': 0, 'Médecine': 5, 'Arme de mêlée (divers)': 0,
  'Arme de jet (divers)': 0, 'Navigation': 10, 'Représentation': 5, 'Intimidation/Persuasion': 15, 'Pilotage (divers)': 1,
  'Psychothérapie': 1, 'Réparation (divers)': 15, 'Recherche': 25, 'Équitation (divers)': 5, 'Science (divers)': 1,
  'Sens': 10, 'Tour de main': 5, 'Observation': 25, 'Statut': 15, 'Discrétion': 10, 'Stratégie': 1, 'Nage': 25,
  'Enseignement': 10, 'Compétence technique (divers)': 5, 'Lancer': 25, 'Pistage': 10,
};

export function skillBase(name: string, stats: Record<string, unknown>): number {
  const stat = (key: string) => number(stats[key]);
  if (name === 'Défense') return stat('dexterite') * 2;
  if (name === 'Vol') return Math.ceil(stat('dexterite') / 2);
  if (name === 'Jeux') return stat('intelligence') + stat('pouvoir');
  if (name === 'Langue (divers)') return stat('intelligence') * 5;
  return FIXED_SKILL_BASES[name] ?? 0;
}

const SKILL_GROUPS: Record<SkillGroup, Set<string>> = {
  Combat: new Set(['Artillerie (divers)', 'Bagarre', 'Défense', 'Arme à énergie (divers)', 'Arme à feu (divers)', 'Lutte', 'Arme lourde (divers)', 'Arme de mêlée (divers)', 'Arme de jet (divers)']),
  Physique: new Set(['Escalade', 'Conduite (divers)', 'Se cacher', 'Saut', 'Pilotage (divers)', 'Équitation (divers)', 'Discrétion', 'Nage', 'Lancer']),
  'Magie & pouvoirs': new Set(['Vol']),
  'Social & mental': new Set(['Marchandage', 'Commandement', 'Déguisement', 'Étiquette (divers)', 'Baratin', 'Jeux', 'Intuition', 'Écouter', 'Représentation', 'Intimidation/Persuasion', 'Psychothérapie', 'Sens', 'Observation', 'Statut']),
  Connaissances: new Set(['Connaissance (divers)', 'Langue (divers)', 'Alphabétisation (option)', 'Médecine', 'Recherche', 'Science (divers)', 'Stratégie', 'Enseignement', 'Compétence technique (divers)']),
  'Pratique & divers': new Set(['Estimation', 'Art (divers)', 'Artisanat (divers)', 'Démolition', 'Manipulation fine', 'Premiers secours', 'Navigation', 'Réparation (divers)', 'Tour de main', 'Pistage']),
};

export const PLAYABLE_SKILL_GROUPS = Object.keys(SKILL_GROUPS) as SkillGroup[];

function skillGroup(name: string): SkillGroup {
  return PLAYABLE_SKILL_GROUPS.find((group) => SKILL_GROUPS[group].has(name)) ?? 'Pratique & divers';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function number(value: unknown): number {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function playableSheet(sheetData: Record<string, unknown>, fallbackName = ''): PlayableSheet {
  const fields = record(sheetData.fields);
  const rawStats = record(sheetData.stats);
  const stats = Object.entries(STAT_LABELS).map(([key, label]) => ({ key, label, score: number(rawStats[key]) })).filter((stat) => stat.score > 0);
  const stat = (key: string) => number(rawStats[key]);
  const movement = number(fields.movement) || 10;
  const skills = (Array.isArray(sheetData.skills) ? sheetData.skills : []).map((value, index) => {
    const skill = record(value);
    const name = text(skill.name || SKILL_NAMES[index]);
    const base = skillBase(name, rawStats);
    const points = number(skill.points);
    return { name, group: skillGroup(name), base, points, score: base + points, checked: Boolean(skill.checked) };
  }).filter((skill) => skill.name);
  const weapons = (Array.isArray(sheetData.weapons) ? sheetData.weapons : []).map((value) => {
    const weapon = record(value);
    return { name: text(weapon.name), contactScore: number(weapon.contactScore || weapon.score), distanceScore: number(weapon.distanceScore), damage: text(weapon.damage) };
  }).filter((weapon) => weapon.name);
  const spells = (Array.isArray(sheetData.spells) ? sheetData.spells : []).map((value) => {
    const spell = record(value);
    return { name: text(spell.name), points: number(spell.points), checked: Boolean(spell.checked) };
  }).filter((spell) => spell.name);
  return {
    name: text(fields.name || fallbackName || 'Personnage'), player: text(fields.player), profession: text(fields.profession), race: text(fields.race), stats,
    hp: Math.ceil((stat('constitution') + stat('taille')) / 2), powerPoints: stat('pouvoir'), movement, course: (stat('dexterite') + movement) * 3,
    skills, weapons, spells, armorType: text(fields.armorType), armorPoints: text(fields.armorPoints), powers: text(fields.powers), equipment: text(fields.equipment),
    origin: text(fields.origin), npcLinks: text(fields.npcLinks), factionLinks: text(fields.factionLinks), motivation: text(fields.motivation), notes: text(fields.notes),
  };
}

export function resetExperienceChecks(sheetData: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(sheetData);
  for (const key of ['skills', 'spells']) {
    const entries = Array.isArray(copy[key]) ? copy[key] as unknown[] : [];
    copy[key] = entries.map((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? { ...entry as JsonRecord, checked: false } : entry);
  }
  return copy;
}

function lines(value: unknown): string {
  const content = text(value).trim();
  return content ? content.split(/\r?\n/).map((line) => `- ${line.replace(/^[-*]\s*/, '')}`).join('\n') : '-';
}

function tableCell(value: unknown): string {
  return text(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function isBrokenSheetMarkdown(markdown: string): boolean {
  return !markdown.trim() || markdown.includes('[object Object]');
}

export function structuredSheetToMarkdown(sheetData: Record<string, unknown>, fallbackName = ''): string {
  const fields = record(sheetData.fields);
  const stats = record(sheetData.stats);
  const name = text(fields.name || fallbackName || 'Personnage');
  const identity = [
    `**Joueur :** ${text(fields.player)}`,
    `**Profession :** ${text(fields.profession)}`,
    `**Race :** ${text(fields.race)}`,
  ].join('  \n');
  const statRows = Object.entries(stats).map(([key, value]) => `| ${STAT_LABELS[key] ?? key.toUpperCase()} | ${tableCell(value)} |`).join('\n') || '| — | — |';
  const skills = Array.isArray(sheetData.skills) ? sheetData.skills : [];
  const skillRows = skills.map((value, index) => {
    const skill = record(value);
    const skillName = text(skill.name || SKILL_NAMES[index]);
    if (!skillName) return '';
    return `| ${tableCell(skillName)} | ${tableCell(skill.base)} | ${tableCell(skill.points)} | ${tableCell(skill.score)} | ${skill.checked ? '✓' : ''} |`;
  }).filter(Boolean).join('\n') || '| — | — | — | — | |';
  const weapons = Array.isArray(sheetData.weapons) ? sheetData.weapons : [];
  const weaponRows = weapons.map((value) => {
    const weapon = record(value);
    if (!Object.values(weapon).some((item) => text(item).trim())) return '';
    const score = weapon.score || [weapon.contactScore && `Contact ${text(weapon.contactScore)}`, weapon.distanceScore && `Jet ${text(weapon.distanceScore)}`].filter(Boolean).join(' / ');
    return `| ${tableCell(weapon.name)} | ${tableCell(score)} | ${tableCell(weapon.damage)} |`;
  }).filter(Boolean).join('\n') || '| — | — | — |';
  const spells = Array.isArray(sheetData.spells) ? sheetData.spells : [];
  const spellRows = spells.map((value) => {
    const spell = record(value);
    if (!text(spell.name).trim()) return '';
    return `| ${tableCell(spell.name)} | ${tableCell(spell.points)} | ${spell.checked ? '✓' : ''} |`;
  }).filter(Boolean).join('\n') || '| — | — | |';

  return `# ${name}\n\n${identity}\n\n## Caractéristiques\n\n| Caractéristique | Score |\n|---|---:|\n${statRows}\n\n## Compétences\n\n| Compétence | Base | Points | Score | Expérience |\n|---|---:|---:|---:|:---:|\n${skillRows}\n\n## Armes\n\n| Arme | Score | Dégâts |\n|---|---:|---|\n${weaponRows}\n\n## Sorts et pouvoirs\n\n| Sort | Points | Expérience |\n|---|---:|:---:|\n${spellRows}\n\n## Armure\n\n- **Type :** ${text(fields.armorType)}\n- **Points :** ${text(fields.armorPoints)}\n\n## Équipement et richesse\n\n${lines(fields.equipment)}\n\n## Histoire et liens\n\n- **Origine :** ${text(fields.origin)}\n- **PNJ :** ${text(fields.npcLinks)}\n- **Factions :** ${text(fields.factionLinks)}\n- **Motivation :** ${text(fields.motivation)}\n\n## Notes de jeu\n\n${lines(fields.notes)}\n`;
}

export function editableSheetMarkdown(sheetData: Record<string, unknown>, markdown: string, fallbackName = ''): string {
  return isBrokenSheetMarkdown(markdown) ? structuredSheetToMarkdown(sheetData, fallbackName) : markdown;
}
