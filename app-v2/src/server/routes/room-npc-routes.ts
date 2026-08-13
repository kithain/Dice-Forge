import type { FastifyInstance } from 'fastify';

import type { RoomNpcService } from '../services/room-npc-service.js';

type RoomParams = { room: string };
type NpcParams = RoomParams & { id: string };

export function registerRoomNpcRoutes(app: FastifyInstance, roomNpcs: RoomNpcService): void {
  app.get<{ Params: RoomParams }>('/api/rooms/:room/npcs', async (request) => ({ npcs: roomNpcs.list(request.params.room) }));
  app.post<{ Params: RoomParams }>('/api/rooms/:room/npcs', async (request) => ({ npcs: await roomNpcs.add(request.params.room, request.body as Record<string, unknown>) }));
  app.delete<{ Params: NpcParams }>('/api/rooms/:room/npcs/:id', async (request) => ({ npcs: await roomNpcs.remove(request.params.room, request.params.id) }));
}
