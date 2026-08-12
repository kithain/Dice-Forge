import path from 'node:path';

import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';

import { loadConfig, type AppConfig } from './config.js';
import { RealtimeHub } from './realtime.js';
import { registerBattlemapRoutes } from './routes/battlemap-routes.js';
import { registerBackupRoutes } from './routes/backup-routes.js';
import { registerCombatRoutes } from './routes/combat-routes.js';
import { registerObsidianRoutes } from './routes/obsidian-routes.js';
import { registerReferenceRoutes } from './routes/reference-routes.js';
import { BattlemapService } from './services/battlemap-service.js';
import { CombatService } from './services/combat-service.js';
import { getCloudConfig } from './services/cloud-config.js';
import { ObsidianService } from './services/obsidian-service.js';
import { migrateLegacyData } from './services/legacy-migration.js';
import { getSystemStatus } from './services/system-status.js';

const NON_SPA_PREFIXES = ['/api/', '/dice-box/', '/maps/', '/portraits/', '/ws'];

export function shouldServeSpaIndex(method: string, url: string, accept = ''): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const pathname = url.split('?', 1)[0] || '/';
  if (NON_SPA_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix))) return false;
  if (path.posix.extname(pathname)) return false;
  return accept.includes('text/html');
}

export async function buildApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await migrateLegacyData(config);
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart);
  await app.register(fastifyStatic, {
    root: config.clientDist,
    setHeaders(reply, filePath) {
      if (path.basename(filePath) === 'index.html') {
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  await app.register(fastifyStatic, {
    root: config.diceAssetsDirectory,
    prefix: '/dice-box/',
    decorateReply: false,
  });
  await app.register(fastifyStatic, { root: config.mapsDirectory, prefix: '/maps/', decorateReply: false });
  await app.register(fastifyStatic, { root: config.portraitsDirectory, prefix: '/portraits/', decorateReply: false });

  const realtime = new RealtimeHub();
  const combat = new CombatService(config.dataDirectory);
  const battlemap = new BattlemapService(config.dataDirectory, config.mapsDirectory);
  const obsidian = new ObsidianService(config.vaultPath);
  await Promise.all([combat.initialize(), battlemap.initialize()]);

  app.get('/api/status', async () => getSystemStatus(config));
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/cloud-config', async (_request, reply) => {
    const cloud = await getCloudConfig(config);
    return cloud ?? reply.code(404).send({ message: 'Supabase non configuré.' });
  });
  realtime.register(app);
  registerCombatRoutes(app, combat, realtime);
  registerBattlemapRoutes(app, battlemap, realtime);
  registerBackupRoutes(app, config.repositoryRoot);
  registerObsidianRoutes(app, obsidian);
  registerReferenceRoutes(app, config.repositoryRoot);

  app.setNotFoundHandler(async (request, reply) => {
    if (shouldServeSpaIndex(request.method, request.url, String(request.headers.accept || ''))) {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.sendFile('index.html', { cacheControl: false });
    }
    return reply.code(404).send({ message: 'Ressource introuvable.' });
  });
  app.addHook('onClose', async () => {
    app.log.info({ clientDist: path.normalize(config.clientDist) }, 'Dice Forge V2 arrêté');
  });
  return app;
}
