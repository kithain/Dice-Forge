import { describe, expect, it } from 'vitest';

import { brpThreshold, evaluateBrpTest, parseDiceExpression, rollDice } from '../src/shared/dice.js';

describe('dice expressions', () => {
  it('parses mixed dice and modifiers', () => {
    expect(parseDiceExpression('2d6 + 1d8 - 3')).toEqual({
      source: '2D6+1D8-3',
      dice: [
        { count: 2, sides: 6, sign: 1 },
        { count: 1, sides: 8, sign: 1 },
      ],
      modifier: -3,
    });
  });

  it('rolls deterministically with an injected source', () => {
    const expression = parseDiceExpression('2d6+2');
    expect(rollDice(expression, () => 4).total).toBe(10);
  });

  it('rejects unsupported dice', () => {
    expect(() => parseDiceExpression('1d7')).toThrow('D7');
  });
});

describe('BRP percentile tests', () => {
  it('applies difficulty to the skill score', () => {
    expect(brpThreshold(60, 'easy')).toBe(120);
    expect(brpThreshold(61, 'hard')).toBe(31);
  });

  it.each([
    [3, 'critical'],
    [10, 'special'],
    [50, 'success'],
    [70, 'failure'],
    [98, 'fumble'],
  ] as const)('classifies a roll of %i as %s', (roll, outcome) => {
    expect(evaluateBrpTest(60, 'normal', () => roll).outcome).toBe(outcome);
  });

  it('handles automatic and impossible tests without rolling', () => {
    expect(evaluateBrpTest(40, 'automatic')).toMatchObject({ roll: null, outcome: 'success' });
    expect(evaluateBrpTest(40, 'impossible')).toMatchObject({ roll: null, outcome: 'failure' });
  });
});
