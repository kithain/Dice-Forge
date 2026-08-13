import path from 'node:path';

import { emptyRoomNpcState, normalizeRoomNpc, normalizeRoomNpcState, type RoomNpc, type RoomNpcState } from '../../shared/room-npcs.js';
import { normalizeRoom } from '../../shared/session.js';
import { JsonStore } from '../storage/json-store.js';

export class RoomNpcService {
  readonly #store: JsonStore<RoomNpcState>;
  #state = emptyRoomNpcState();

  constructor(dataDirectory: string) {
    this.#store = new JsonStore(path.join(dataDirectory, 'room_npcs.json'), emptyRoomNpcState, normalizeRoomNpcState);
  }

  async initialize(): Promise<void> {
    this.#state = await this.#store.read();
  }

  list(rawRoom: string): RoomNpc[] {
    const room = this.#room(rawRoom);
    return structuredClone(this.#state.rooms[room] ?? []);
  }

  async add(rawRoom: string, source: Record<string, unknown>): Promise<RoomNpc[]> {
    const room = this.#room(rawRoom);
    const npc = normalizeRoomNpc(source);
    const roomNpcs = this.#state.rooms[room] ?? [];
    const existing = roomNpcs.findIndex((item) => item.name.localeCompare(npc.name, 'fr', { sensitivity: 'base' }) === 0);
    if (existing >= 0) roomNpcs[existing] = { ...npc, id: roomNpcs[existing]!.id };
    else roomNpcs.push(npc);
    this.#state.rooms[room] = roomNpcs.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return this.#save(room);
  }

  async remove(rawRoom: string, id: string): Promise<RoomNpc[]> {
    const room = this.#room(rawRoom);
    const before = this.#state.rooms[room] ?? [];
    const after = before.filter((npc) => npc.id !== id);
    if (before.length === after.length) throw new Error('PNJ introuvable dans cette room.');
    this.#state.rooms[room] = after;
    return this.#save(room);
  }

  #room(value: string): string {
    const room = normalizeRoom(value);
    if (!room) throw new Error('Code de room invalide.');
    return room;
  }

  async #save(room: string): Promise<RoomNpc[]> {
    await this.#store.write(this.#state);
    return this.list(room);
  }
}
