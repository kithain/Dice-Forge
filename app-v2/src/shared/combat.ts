export const ROLES = ['player', 'ally', 'monster'] as const;
export type ParticipantRole = typeof ROLES[number];

export const STATUS_EFFECTS = [
  'Bleeding', 'Blinded', 'Confused', 'Dead', 'Deafened', 'Dying',
  'Entangled', 'Exhausted', 'Frightened', 'Grappled', 'Helpless',
  'Impaled', 'Incapacitated', 'Major Wound', 'Paralyzed', 'Prone',
  'Shock', 'Stunned', 'Unconscious',
] as const;

export interface ParticipantStatus {
  name: string;
  duration: number | null;
}

export interface Participant {
  id: string;
  system: 'DICE-FORGE-BRP';
  name: string;
  role: ParticipantRole;
  is_player: boolean;
  strength: number;
  constitution: number;
  size: number;
  intelligence: number;
  power: number;
  dexterity: number;
  charisma: number;
  movement: number;
  hp: number;
  hp_max: number;
  armor_points: number;
  portrait: string | null;
  token_number: number | null;
  statuses: ParticipantStatus[];
}

export interface CombatState {
  system: 'DICE-FORGE-BRP';
  participants: Participant[];
  current_turn_index: number;
  round_number: number;
  current_phase: 'attack';
}

const INACTIVE = new Set(['Unconscious', 'Dying', 'Dead', 'Incapacitated']);

function integer(value: unknown, fallback: number, minimum = Number.MIN_SAFE_INTEGER): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.trunc(parsed)) : fallback;
}

function statuses(value: unknown): ParticipantStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ParticipantStatus[] => {
    if (typeof item === 'string') return [{ name: item, duration: null }];
    if (!item || typeof item !== 'object' || !('name' in item)) return [];
    const record = item as { name: unknown; duration?: unknown };
    const duration = record.duration == null ? null : integer(record.duration, 1, 1);
    return [{ name: String(record.name), duration }];
  });
}

export function normalizeParticipant(source: Record<string, unknown>): Participant {
  const role = ROLES.includes(source.role as ParticipantRole) ? source.role as ParticipantRole : 'monster';
  const constitution = integer(source.constitution, integer(source.hp_max, 10, 1), 1);
  const size = integer(source.size, integer(source.hp_max, 10, 1), 1);
  const calculatedHp = Math.ceil((constitution + size) / 2);
  const hpMax = integer(source.hp_max, calculatedHp, 1);
  const hp = Math.min(hpMax, integer(source.hp, hpMax, 0));
  const normalizedStatuses = statuses(source.statuses).filter((status) => !['Dead', 'Dying'].includes(status.name));
  if (hp === 0) normalizedStatuses.push({ name: 'Dead', duration: null });
  return {
    id: typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    system: 'DICE-FORGE-BRP',
    name: String(source.name || 'Combattant').trim().slice(0, 80),
    role,
    is_player: role === 'player',
    strength: integer(source.strength, 10, 1),
    constitution,
    size,
    intelligence: integer(source.intelligence, 10, 1),
    power: integer(source.power, 10, 1),
    dexterity: integer(source.dexterity ?? source.initiative_roll, 10, 1),
    charisma: integer(source.charisma, 10, 1),
    movement: integer(source.movement, 10, 0),
    hp,
    hp_max: hpMax,
    armor_points: integer(source.armor_points, 0, 0),
    portrait: typeof source.portrait === 'string' && source.portrait ? source.portrait : null,
    token_number: integer(source.token_number, 0, 0) || null,
    statuses: normalizedStatuses,
  };
}

export function emptyCombat(): CombatState {
  return { system: 'DICE-FORGE-BRP', participants: [], current_turn_index: 0, round_number: 1, current_phase: 'attack' };
}

export function normalizeCombat(source: Record<string, unknown>): CombatState {
  const state: CombatState = {
    ...emptyCombat(),
    participants: Array.isArray(source.participants)
      ? source.participants.map((item) => normalizeParticipant(item as Record<string, unknown>))
      : [],
    current_turn_index: integer(source.current_turn_index, 0, 0),
    round_number: integer(source.round_number, 1, 1),
  };
  ensureTokenNumbers(state.participants);
  if (state.current_turn_index >= state.participants.length) state.current_turn_index = 0;
  return state;
}

export function ensureTokenNumbers(participants: Participant[]): void {
  const used = new Set<number>();
  for (const participant of participants) {
    if (participant.token_number && !used.has(participant.token_number)) used.add(participant.token_number);
    else participant.token_number = null;
  }
  let next = 1;
  for (const participant of participants.filter((item) => item.token_number === null)) {
    while (used.has(next)) next += 1;
    participant.token_number = next;
    used.add(next);
  }
}

export function canAct(participant: Participant): boolean {
  return !participant.statuses.some((status) => INACTIVE.has(status.name));
}

export function sortCombat(state: CombatState): void {
  const activeId = state.participants[state.current_turn_index]?.id;
  state.participants.sort((left, right) => right.dexterity - left.dexterity || right.name.localeCompare(left.name, 'fr'));
  const activeIndex = state.participants.findIndex((participant) => participant.id === activeId);
  state.current_turn_index = Math.max(0, activeIndex);
}

export function nextTurn(state: CombatState): boolean {
  const order = state.participants.flatMap((participant, index) => canAct(participant) ? [index] : []);
  if (!order.length) return false;
  const position = order.indexOf(state.current_turn_index);
  if (position < 0) state.current_turn_index = order[0] ?? 0;
  else if (position === order.length - 1) {
    state.round_number += 1;
    for (const participant of state.participants) {
      participant.statuses = participant.statuses.flatMap((status) => {
        if (status.duration === null) return [status];
        return status.duration > 1 ? [{ ...status, duration: status.duration - 1 }] : [];
      });
    }
    state.current_turn_index = order[0] ?? 0;
  } else state.current_turn_index = order[position + 1] ?? 0;
  return true;
}

export function patchParticipant(participant: Participant, change: Record<string, unknown>): Participant {
  return normalizeParticipant({ ...participant, ...change, id: participant.id });
}
