import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export type ObsidianSource = 'pj' | 'pnj' | 'bestiaire';

export interface ObsidianEntry {
  source: string;
  source_type: ObsidianSource;
  name: string;
  default_role: 'player' | 'ally' | 'monster';
  hp_max: number;
  dexterity: number;
  strength: number;
  constitution: number;
  size: number;
  intelligence: number;
  power: number;
  charisma: number;
  movement: number;
  armor_points: number;
  melee_attack: number;
  ranged_attack: number;
  defense: number;
}

const SOURCE_FOLDERS: Record<ObsidianSource, string[]> = {
  pj: ['30 - PERSONNAGES/PJ', 'PJ'],
  pnj: ['30 - PERSONNAGES/PNJ', 'PNJ'],
  bestiaire: ['50 - OUTILS/Bestiaire', 'Bestiaire'],
};
const STAT_FIELD: Record<string, keyof Pick<ObsidianEntry, 'strength' | 'constitution' | 'size' | 'intelligence' | 'power' | 'dexterity' | 'charisma'>> = {
  FOR: 'strength', CON: 'constitution', TAI: 'size', INT: 'intelligence',
  POU: 'power', DEX: 'dexterity', APP: 'charisma', CHA: 'charisma',
};

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

function frontmatter(text: string): string {
  if (!text.startsWith('---')) return '';
  return text.split('---', 3)[1] ?? '';
}

function frontmatterValue(text: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`^${escaped}\\s*:\\s*["']?([^\\r\\n"']+)`, 'im'))?.[1]?.trim() ?? '';
}

function firstAlias(text: string): string {
  const inline = text.match(/^aliases\s*:\s*\[(.*?)]\s*$/im)?.[1];
  if (inline) return inline.split(',')[0]?.replace(/["']/g, '').trim() ?? '';
  const block = text.match(/^aliases\s*:\s*\r?\n((?:\s+-[^\r\n]*(?:\r?\n|$))*)/im)?.[1] ?? '';
  return block.match(/^\s+-\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ?? '';
}

function parseStats(text: string): Record<string, number> {
  const stats: Record<string, number> = {};
  const inline = text.match(/^\*\*Caract[ée]ristiques\s*:\*\*\s*([^\r\n]+)/im)?.[1] ?? '';
  for (const match of inline.matchAll(/\b(FOR|CON|TAI|INT|POU|DEX|APP|CHA)\s+(\d+)\b/gi)) stats[match[1]!.toUpperCase()] = Number(match[2]);
  for (const match of text.matchAll(/^\|\s*(FOR|CON|TAI|INT|POU|DEX|APP|CHA)\s*\|\s*(\d+)\s*\|/gim)) stats[match[1]!.toUpperCase()] = Number(match[2]);
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((line) => line.replace(/^\||\|$/g, '').split('|').slice(0, 7).map((cell) => cell.trim().toUpperCase()).join('|') === 'FOR|CON|TAI|INT|POU|DEX|CHA');
  if (header >= 0) {
    const values = lines.slice(header + 1, header + 4).map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())).find((cells) => cells.length >= 7 && cells.slice(0, 7).every((cell) => /^\d+$/.test(cell)));
    values?.slice(0, 7).forEach((value, index) => { stats[['FOR', 'CON', 'TAI', 'INT', 'POU', 'DEX', 'CHA'][index]!] = Number(value); });
  }
  return stats;
}

function fieldNumber(text: string, label: string): number | undefined {
  const values = text.match(new RegExp(`${label}\\s*:\\s*\\*{0,2}([^·\\r\\n]+)`, 'i'))?.[1]?.match(/\d+/g);
  return values?.length ? Number(values.at(-1)) : undefined;
}

function explicitPercent(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const matterValue = frontmatterValue(frontmatter(text), label);
    const matterScore = matterValue.match(/\d+/)?.[0];
    if (matterScore) return Number(matterScore);
    const bodyScore = text.match(new RegExp(`\\*{0,2}${label}\\*{0,2}\\s*:\\s*(\\d+)\\s*%?`, 'i'))?.[1];
    if (bodyScore) return Number(bodyScore);
  }
  return undefined;
}

function isRangedAttack(label: string): boolean {
  if (/lanc(?:é|ée|és|ées)/i.test(label)) return true;
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(?:arc|arbalete|fronde|tir|projectile|javelot|grenade|lancer|trait|eclair|onde|decharge|distorsion|distance|portee|sort|glyphe)\b/i.test(normalized);
}

export function parseCombatScores(text: string): { meleeAttack: number; rangedAttack: number; defense: number } {
  const explicitMelee = explicitPercent(text, ['attaque_cac', 'attaque cac', 'melee_attack']);
  const explicitRanged = explicitPercent(text, ['attaque_distance', 'attaque distance', 'ranged_attack']);
  const legacyAttack = explicitPercent(text, ['attaque', 'attack']);
  const attackSection = text.match(/\*\*Attaques?\s*:\*\*([\s\S]*?)(?=\n\s*(?:\*\*[^\n]+:\*\*|##|---)|$)/i)?.[1] ?? '';
  const attacks = [
    ...[...text.matchAll(/^\|\s*([^|]+)\|\s*(\d+)\s*%\s*\|([^\r\n]*)/gim)].map((match) => ({ label: `${match[1]} ${match[3]}`, score: Number(match[2]) })),
    ...[...attackSection.matchAll(/(?:^|[;\n])\s*[-*]?\s*([^;\n]+?)\s+(\d+)\s*%([^;\n]*)/gim)].map((match) => ({ label: `${match[1]} ${match[3]}`, score: Number(match[2]) })),
  ].filter((attack) => !/\bparade\b/i.test(attack.label));
  const meleeScores = attacks.filter((attack) => !isRangedAttack(attack.label)).map((attack) => attack.score);
  const rangedScores = attacks.filter((attack) => isRangedAttack(attack.label)).map((attack) => attack.score);
  const meleeAttack = explicitMelee ?? legacyAttack ?? (Math.max(0, ...meleeScores) || (attacks.length ? 0 : 50));
  const rangedAttack = explicitRanged ?? Math.max(0, ...rangedScores);
  const explicitDefense = explicitPercent(text, ['défense', 'defense', 'defense_score']);
  const dodge = text.match(/\bEsquive\s+(\d+)\s*%/i)?.[1];
  return { meleeAttack, rangedAttack, defense: explicitDefense ?? (dodge ? Number(dodge) : Math.max(meleeAttack, rangedAttack, 50)) };
}

function parseEntry(text: string, relative: string, sourceType: ObsidianSource): ObsidianEntry {
  const matter = frontmatter(text);
  if (['false', 'non', 'no', '0'].includes(frontmatterValue(matter, 'webtracker').toLowerCase())) throw new Error('disabled');
  const stats = parseStats(text);
  if (!stats.DEX) throw new Error('DEX introuvable.');
  const name = firstAlias(matter) || text.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || path.basename(relative, '.md');
  const hp = fieldNumber(text, 'Points de [Vv]ie') ?? (stats.CON && stats.TAI ? Math.ceil((stats.CON + stats.TAI) / 2) : undefined);
  if (!hp) throw new Error('Points de vie introuvables.');
  const category = frontmatterValue(matter, 'categorie').toLowerCase();
  const combat = parseCombatScores(text);
  const base: ObsidianEntry = {
    source: relative.replaceAll('\\', '/'), source_type: sourceType, name,
    default_role: sourceType === 'pj' ? 'player' : sourceType === 'bestiaire' ? 'monster' : ['allies', 'alliés'].includes(category) ? 'ally' : 'monster',
    hp_max: hp, dexterity: stats.DEX,
    strength: stats.FOR ?? 10, constitution: stats.CON ?? hp, size: stats.TAI ?? hp,
    intelligence: stats.INT ?? 10, power: stats.POU ?? 10, charisma: stats.APP ?? stats.CHA ?? 10,
    movement: fieldNumber(text, '(?:Déplacement|Mouvement)') ?? 10,
    armor_points: fieldNumber(text, "(?:Points d['’]armure|Armure)") ?? 0,
    melee_attack: combat.meleeAttack, ranged_attack: combat.rangedAttack, defense: combat.defense,
  };
  for (const [stat, field] of Object.entries(STAT_FIELD)) if (stats[stat] !== undefined) base[field] = stats[stat]!;
  return base;
}

async function markdownFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [target] : [];
  }));
  return nested.flat();
}

export class ObsidianService {
  constructor(readonly root: string) {}

  async scan(query = '', requested?: ObsidianSource): Promise<{ entries: ObsidianEntry[]; issues: Array<{ source: string; message: string }> }> {
    const entries: ObsidianEntry[] = [];
    const issues: Array<{ source: string; message: string }> = [];
    const types = requested ? [requested] : Object.keys(SOURCE_FOLDERS) as ObsidianSource[];
    for (const sourceType of types) {
      const candidates = SOURCE_FOLDERS[sourceType].map((relative) => path.resolve(this.root, relative));
      let resolved: string | undefined;
      for (const candidate of candidates) if (await exists(candidate)) { resolved = candidate; break; }
      if (!resolved) { issues.push({ source: SOURCE_FOLDERS[sourceType][0]!, message: 'Dossier Obsidian introuvable.' }); continue; }
      for (const filename of await markdownFiles(resolved)) {
        const relative = path.relative(this.root, filename).replaceAll('\\', '/');
        try {
          const entry = parseEntry(await readFile(filename, 'utf8'), relative, sourceType);
          if (!query || entry.name.toLowerCase().includes(query.toLowerCase()) || relative.toLowerCase().includes(query.toLowerCase())) entries.push(entry);
        } catch (error) {
          if (error instanceof Error && error.message !== 'disabled') issues.push({ source: relative, message: error.message });
        }
      }
    }
    entries.sort((a, b) => a.source_type.localeCompare(b.source_type) || a.name.localeCompare(b.name, 'fr'));
    return { entries, issues };
  }
}
