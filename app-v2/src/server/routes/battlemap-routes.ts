import type { FastifyInstance } from 'fastify';

import type { BattlemapService } from '../services/battlemap-service.js';
import type { RealtimeHub } from '../realtime.js';

type IdParams = { id: string };

export function registerBattlemapRoutes(app: FastifyInstance, battlemap: BattlemapService, realtime: RealtimeHub): void {
  const changed = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = await operation();
    realtime.broadcast({ type: 'battlemap.changed' });
    return result;
  };

  app.get('/api/battlemap', async () => battlemap.snapshot());
  app.put('/api/battlemap/tokens', async (request) => changed(() => battlemap.upsertToken(request.body as Record<string, unknown>)));
  app.delete<{ Params: IdParams }>('/api/battlemap/tokens/:id', async (request) => changed(() => battlemap.removeToken(request.params.id)));
  app.delete('/api/battlemap/tokens', async () => changed(() => battlemap.clearTokens()));
  app.post('/api/battlemap/map', async (request, reply) => {
    const upload = await request.file({ limits: { fileSize: 50 * 1024 * 1024 } });
    if (!upload) return reply.code(400).send({ message: 'Aucune carte reçue.' });
    const bytes = await upload.toBuffer();
    return changed(() => battlemap.saveMap(bytes));
  });
}
