import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

interface CharacterBackupBody {
  format?: string;
  version?: number;
  exportedAt?: string;
  account?: unknown;
  characters?: unknown[];
  sheets?: unknown[];
  inventories?: unknown[];
}

export function registerBackupRoutes(app: FastifyInstance, repositoryRoot: string): void {
  app.post('/api/backups/character-sheets', async (request, reply) => {
    const body = request.body as CharacterBackupBody;
    if (body?.format !== 'dice-forge-character-backup' || body.version !== 1) return reply.code(400).send({ message: 'Format de sauvegarde invalide.' });
    if (![body.characters, body.sheets, body.inventories].every(Array.isArray)) return reply.code(400).send({ message: 'Données de sauvegarde incomplètes.' });
    const itemCount = body.characters!.length + body.sheets!.length + body.inventories!.length;
    if (itemCount > 5000) return reply.code(413).send({ message: 'Sauvegarde trop volumineuse.' });
    const json = `${JSON.stringify(body, null, 2)}\n`;
    if (Buffer.byteLength(json) > 20 * 1024 * 1024) return reply.code(413).send({ message: 'Sauvegarde trop volumineuse.' });

    const backupDirectory = path.resolve(repositoryRoot, 'backups');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `fiches-personnages-${stamp}.json`;
    const target = path.join(backupDirectory, filename);
    const temporary = `${target}.tmp`;
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(temporary, json, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
    return { success: true, filename, itemCount };
  });
}
