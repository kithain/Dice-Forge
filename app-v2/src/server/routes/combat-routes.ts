import type { FastifyInstance } from 'fastify';

import type { CombatService } from '../services/combat-service.js';
import type { RealtimeHub } from '../realtime.js';

type IdParams = { id: string };
type NameBody = { name?: string };

export function registerCombatRoutes(app: FastifyInstance, combat: CombatService, realtime: RealtimeHub): void {
  const changed = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = await operation();
    realtime.broadcast({ type: 'combat.changed' });
    return result;
  };

  app.get('/api/combat', async () => combat.snapshot());
  app.post('/api/combat/participants', async (request) => changed(() => combat.add(request.body as Record<string, unknown>)));
  app.patch<{ Params: IdParams }>('/api/combat/participants/:id', async (request) => changed(() => combat.patch(request.params.id, request.body as Record<string, unknown>)));
  app.delete<{ Params: IdParams }>('/api/combat/participants/:id', async (request) => changed(() => combat.remove(request.params.id)));
  app.post('/api/combat/sort', async () => changed(() => combat.sort()));
  app.post('/api/combat/next', async () => changed(() => combat.next()));
  app.post('/api/combat/restart', async () => changed(() => combat.restart()));

  app.get('/api/encounters', async () => ({ encounters: await combat.encounters() }));
  app.post('/api/encounters', async (request) => {
    await combat.saveEncounter((request.body as NameBody).name ?? '');
    return { success: true };
  });
  app.post<{ Params: IdParams }>('/api/encounters/:id/load', async (request) => changed(() => combat.loadEncounter(request.params.id)));
  app.delete<{ Params: IdParams }>('/api/encounters/:id', async (request) => {
    await combat.deleteEncounter(request.params.id);
    return { success: true };
  });
}
