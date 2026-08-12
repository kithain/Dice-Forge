import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import type { ArmorCatalogItem, EquipmentCatalog, WeaponCatalogItem } from '../../shared/equipment.js';

const REFERENCES: Record<string, string> = {
  help: 'help.html',
  playerBook: 'livret_joueur.html',
  equipment: 'inventaire.html',
  gmScreen: 'ecran_MJ_BRP_ORC.html',
  playerScreen: 'ecran_joueur_BRP_ORC.html',
  rules: 'BRP_ORC_traduction_FR_complete.html',
};
const ASSET_EXTENSIONS = new Set(['.css', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.mp3', '.ogg']);

export function sanitizeReferenceHtml(content: string): string {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    // Legacy pages hide their body until an authentication script removes this
    // class. Reference pages deliberately omit those scripts, so reveal the body.
    .replace(/(<html\b[^>]*\bclass=["'][^"']*)\bauth-pending\b([^"']*["'])/i, '$1$2')
    .replace(/(<head[^>]*>)/i, '$1<base href="/reference-assets/">');
}

function tableRows(markdown: string, heading: string): string[][] {
  const section = markdown.match(new RegExp(`## ${heading}\\s+([\\s\\S]*?)(?=\\n## |$)`, 'i'))?.[1] ?? '';
  return section.split(/\r?\n/).filter((line) => /^\|.*\|$/.test(line)).slice(2).map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
}

export function parseEquipmentCatalog(markdown: string): EquipmentCatalog {
  const melee: WeaponCatalogItem[] = tableRows(markdown, 'Armes de mêlée').map(([name = '', description = '', category = '', damage = '', hands = '', traits = '', price = '']) => ({ kind: 'weapon', name, description, category, damage, range: 'Contact', hands, traits, price }));
  const ranged: WeaponCatalogItem[] = tableRows(markdown, 'Armes à distance').map(([name = '', description = '', damage = '', range = '', hands = '', traits = '', price = '']) => ({ kind: 'weapon', name, description, category: 'Distance', damage, range, hands, traits, price }));
  const armors: ArmorCatalogItem[] = tableRows(markdown, 'Armures').map(([name = '', description = '', category = '', armorPoints = '0', mobility = '', stealth = '', price = '']) => ({ kind: 'armor', name, description, category, armorPoints: Number(armorPoints) || 0, mobility, stealth, traits: '', price }));
  const protections: ArmorCatalogItem[] = tableRows(markdown, 'Boucliers et protections').map(([name = '', description = '', bonus = '', traits = '', price = '']) => ({ kind: 'armor', name, description, category: 'Protection', armorPoints: 0, mobility: '', stealth: '', traits: [bonus, traits].filter(Boolean).join(' · '), price }));
  return { weapons: [...melee, ...ranged].filter((item) => item.name), armors: [...armors, ...protections].filter((item) => item.name) };
}

function safeAsset(root: string, relative: string): string | null {
  const normalized = relative.replaceAll('\\', '/');
  if (!normalized || normalized.split('/').some((part) => !part || part === '..' || part.startsWith('.'))) return null;
  const target = path.resolve(root, normalized);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`) || !ASSET_EXTENSIONS.has(path.extname(target).toLowerCase())) return null;
  return target;
}

export function registerReferenceRoutes(app: FastifyInstance, repositoryRoot: string): void {
  app.get('/api/equipment-catalog', async () => parseEquipmentCatalog(await readFile(path.join(repositoryRoot, 'inventaire.md'), 'utf8')));
  app.get<{ Params: { id: string } }>('/references/:id', async (request, reply) => {
    const filename = REFERENCES[request.params.id];
    if (!filename) return reply.code(404).send({ message: 'Référence introuvable.' });
    const content = sanitizeReferenceHtml(await readFile(path.join(repositoryRoot, filename), 'utf8'));
    return reply.type('text/html; charset=utf-8').send(content);
  });
  app.get<{ Params: { '*': string } }>('/reference-assets/*', async (request, reply) => {
    const target = safeAsset(repositoryRoot, request.params['*']);
    if (!target) return reply.code(404).send({ message: 'Ressource introuvable.' });
    return reply.sendFile(path.basename(target), path.dirname(target));
  });
}
