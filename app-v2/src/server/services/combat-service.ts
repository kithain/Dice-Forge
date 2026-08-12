import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
  emptyCombat, ensureTokenNumbers, nextTurn, normalizeCombat, normalizeParticipant,
  patchParticipant, sortCombat, type CombatState,
} from '../../shared/combat.js';
import { JsonStore } from '../storage/json-store.js';

function safeEncounterName(value: string): string {
  const name = value.trim().slice(0, 60);
  if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) {
    throw new Error('Nom de rencontre invalide.');
  }
  return name;
}

export class CombatService {
  readonly #store: JsonStore<CombatState>;
  readonly #encounters: string;
  #state: CombatState = emptyCombat();

  constructor(dataDirectory: string) {
    this.#store = new JsonStore(path.join(dataDirectory, 'combat_autosave.json'), emptyCombat, normalizeCombat);
    this.#encounters = path.join(dataDirectory, 'encounters');
  }

  async initialize(): Promise<void> {
    this.#state = await this.#store.read();
    await this.#save();
  }

  snapshot(): CombatState {
    return structuredClone(this.#state);
  }

  async add(source: Record<string, unknown>): Promise<CombatState> {
    this.#state.participants.push(normalizeParticipant(source));
    ensureTokenNumbers(this.#state.participants);
    return this.#save();
  }

  async patch(id: string, change: Record<string, unknown>): Promise<CombatState> {
    const index = this.#state.participants.findIndex((participant) => participant.id === id);
    if (index < 0) throw new Error('Participant introuvable.');
    this.#state.participants[index] = patchParticipant(this.#state.participants[index]!, change);
    return this.#save();
  }

  async remove(id: string): Promise<CombatState> {
    const before = this.#state.participants.length;
    this.#state.participants = this.#state.participants.filter((participant) => participant.id !== id);
    if (this.#state.participants.length === before) throw new Error('Participant introuvable.');
    this.#state.current_turn_index = Math.min(this.#state.current_turn_index, Math.max(0, this.#state.participants.length - 1));
    return this.#save();
  }

  async sort(): Promise<CombatState> {
    sortCombat(this.#state);
    return this.#save();
  }

  async next(): Promise<CombatState> {
    nextTurn(this.#state);
    return this.#save();
  }

  async restart(): Promise<CombatState> {
    for (const participant of this.#state.participants) {
      participant.hp = participant.hp_max;
      participant.statuses = [];
    }
    this.#state.current_turn_index = 0;
    this.#state.round_number = 1;
    return this.#save();
  }

  async encounters(): Promise<string[]> {
    await mkdir(this.#encounters, { recursive: true });
    return (await readdir(this.#encounters))
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.basename(file, '.json'))
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  async saveEncounter(rawName: string): Promise<void> {
    const name = safeEncounterName(rawName);
    const store = new JsonStore(path.join(this.#encounters, `${name}.json`), emptyCombat, normalizeCombat);
    await store.write(this.#state);
  }

  async loadEncounter(rawName: string): Promise<CombatState> {
    const name = safeEncounterName(rawName);
    const content = await readFile(path.join(this.#encounters, `${name}.json`), 'utf8');
    this.#state = normalizeCombat(JSON.parse(content) as Record<string, unknown>);
    return this.#save();
  }

  async deleteEncounter(rawName: string): Promise<void> {
    await unlink(path.join(this.#encounters, `${safeEncounterName(rawName)}.json`));
  }

  async #save(): Promise<CombatState> {
    await this.#store.write(this.#state);
    return this.snapshot();
  }
}
