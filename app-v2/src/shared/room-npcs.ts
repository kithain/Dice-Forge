import { randomUUID } from 'node:crypto';

export interface RoomNpc {
  id: string;
  name: string;
  meleeAttack: number;
  rangedAttack: number;
  defense: number;
  source: string;
}

export interface RoomNpcState {
  rooms: Record<string, RoomNpc[]>;
}

function score(value: unknown, fallback = 50, minimum = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(minimum, Math.round(parsed))) : fallback;
}

export function normalizeRoomNpc(source: Record<string, unknown>): RoomNpc {
  const name = String(source.name ?? '').trim().slice(0, 80);
  if (!name) throw new Error('Le nom du PNJ est obligatoire.');
  return {
    id: String(source.id ?? '').trim() || randomUUID(),
    name,
    meleeAttack: score(source.meleeAttack ?? source.attack),
    rangedAttack: score(source.rangedAttack, 0, 0),
    defense: score(source.defense),
    source: String(source.source ?? '').trim().slice(0, 300),
  };
}

export function normalizeRoomNpcState(source: Record<string, unknown>): RoomNpcState {
  const rawRooms = source.rooms && typeof source.rooms === 'object' ? source.rooms as Record<string, unknown> : {};
  const rooms: Record<string, RoomNpc[]> = {};
  for (const [room, rawNpcs] of Object.entries(rawRooms)) {
    if (!Array.isArray(rawNpcs)) continue;
    rooms[room] = rawNpcs.flatMap((npc) => {
      try { return [normalizeRoomNpc(npc as Record<string, unknown>)]; } catch { return []; }
    });
  }
  return { rooms };
}

export function emptyRoomNpcState(): RoomNpcState {
  return { rooms: {} };
}
