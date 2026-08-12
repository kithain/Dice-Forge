import { describe, expect, it } from 'vitest';

import { normalizeSession } from '../src/shared/session.js';

describe('session normalization', () => {
  it('normalizes the room and player name in one place', () => {
    expect(normalizeSession({ room: ' a-b12!?cd ', playerName: '  Jean   Pierre  ' })).toEqual({
      room: 'AB12CD',
      playerName: 'Jean Pierre',
    });
  });
});
