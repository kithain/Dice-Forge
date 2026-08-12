import { describe, expect, it } from 'vitest';

import { canAct, nextTurn, normalizeCombat, normalizeParticipant, sortCombat } from '../src/shared/combat.js';

describe('combat domain', () => {
  it('reads the historical Dice Forge format', () => {
    const participant = normalizeParticipant({ name: 'Ilya', role: 'player', dexterity: 17, hp: 8, hp_max: 8, statuses: [] });
    expect(participant).toMatchObject({ name: 'Ilya', role: 'player', is_player: true, dexterity: 17, hp: 8 });
    expect(participant.id).toBeTruthy();
  });

  it('keeps hit points bounded and synchronizes Dead', () => {
    const participant = normalizeParticipant({ name: 'Vermine', role: 'monster', hp: -4, hp_max: 12, statuses: [{ name: 'Dying' }] });
    expect(participant.hp).toBe(0);
    expect(participant.statuses).toEqual([{ name: 'Dead', duration: null }]);
    expect(canAct(participant)).toBe(false);
  });

  it('sorts by dexterity and keeps token numbers unique', () => {
    const state = normalizeCombat({ participants: [
      { name: 'Lent', dexterity: 8, token_number: 1 },
      { name: 'Rapide', dexterity: 18, token_number: 1 },
    ] });
    sortCombat(state);
    expect(state.participants.map((participant) => participant.name)).toEqual(['Rapide', 'Lent']);
    expect(new Set(state.participants.map((participant) => participant.token_number)).size).toBe(2);
  });

  it('starts a new round and expires temporary statuses', () => {
    const state = normalizeCombat({ participants: [
      { name: 'A', dexterity: 18, statuses: [{ name: 'Prone', duration: 1 }] },
      { name: 'B', dexterity: 10 },
    ], current_turn_index: 1, round_number: 2 });
    expect(nextTurn(state)).toBe(true);
    expect(state.round_number).toBe(3);
    expect(state.participants[0]?.statuses).toEqual([]);
  });
});
