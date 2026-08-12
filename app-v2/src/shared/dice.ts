export interface DiceTerm {
  count: number;
  sides: number;
  sign: 1 | -1;
}

export interface DiceExpression {
  source: string;
  dice: DiceTerm[];
  modifier: number;
}

export interface DiceRoll {
  expression: string;
  results: Array<DiceTerm & { values: number[]; subtotal: number }>;
  modifier: number;
  total: number;
}

export type BrpDifficulty = 'automatic' | 'easy' | 'normal' | 'hard' | 'impossible';
export type BrpOutcome = 'critical' | 'special' | 'success' | 'failure' | 'fumble';

export interface BrpTest {
  score: number;
  difficulty: BrpDifficulty;
  threshold: number;
  criticalLimit: number;
  specialLimit: number;
  fumbleMinimum: number;
  roll: number | null;
  outcome: BrpOutcome;
}

const TERM_PATTERN = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gi;
const ALLOWED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

export function parseDiceExpression(source: string): DiceExpression {
  const compact = source.replace(/\s+/g, '');
  if (!compact) throw new Error('Saisissez une expression de dés.');

  const dice: DiceTerm[] = [];
  let modifier = 0;
  let cursor = 0;

  for (const match of compact.matchAll(TERM_PATTERN)) {
    if (match.index !== cursor) throw new Error('Expression de dés invalide.');
    cursor += match[0].length;
    const sign: 1 | -1 = match[1] === '-' ? -1 : 1;
    if (match[3]) {
      const count = Number(match[2] || 1);
      const sides = Number(match[3]);
      if (!ALLOWED_SIDES.has(sides)) throw new Error(`Le D${sides} n’est pas pris en charge.`);
      if (count < 1 || count > 10) throw new Error('Utilisez entre 1 et 10 dés par terme.');
      dice.push({ count, sides, sign });
    } else {
      modifier += sign * Number(match[4]);
    }
  }

  if (cursor !== compact.length || dice.length === 0) throw new Error('Expression de dés invalide.');
  return { source: compact.toUpperCase(), dice, modifier };
}

function secureRandom(sides: number): number {
  const range = 0x1_0000_0000;
  const limit = range - (range % sides);
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while ((sample[0] ?? range) >= limit);
  return ((sample[0] ?? 0) % sides) + 1;
}

export function rollDice(
  expression: DiceExpression,
  random: (sides: number) => number = secureRandom,
): DiceRoll {
  const results = expression.dice.map((term) => {
    const values = Array.from({ length: term.count }, () => random(term.sides));
    const subtotal = term.sign * values.reduce((sum, value) => sum + value, 0);
    return { ...term, values, subtotal };
  });
  return {
    expression: expression.source,
    results,
    modifier: expression.modifier,
    total: results.reduce((sum, result) => sum + result.subtotal, expression.modifier),
  };
}

export function brpThreshold(score: number, difficulty: BrpDifficulty): number {
  if (!Number.isInteger(score) || score < 1 || score > 100) {
    throw new Error('La compétence doit être comprise entre 1 et 100.');
  }
  if (difficulty === 'automatic') return 100;
  if (difficulty === 'impossible') return 0;
  if (difficulty === 'easy') return score * 2;
  if (difficulty === 'hard') return Math.ceil(score / 2);
  return score;
}

export function brpFumbleMinimum(threshold: number): number {
  if (threshold <= 20) return 96;
  if (threshold <= 40) return 97;
  if (threshold <= 60) return 98;
  if (threshold <= 80) return 99;
  return 100;
}

export function evaluateBrpTest(
  score: number,
  difficulty: BrpDifficulty,
  random: (sides: number) => number = secureRandom,
): BrpTest {
  const threshold = brpThreshold(score, difficulty);
  const criticalLimit = Math.max(1, Math.ceil(threshold / 20));
  const specialLimit = Math.max(1, Math.ceil(threshold / 5));
  const fumbleMinimum = brpFumbleMinimum(threshold);

  if (difficulty === 'automatic') {
    return { score, difficulty, threshold, criticalLimit, specialLimit, fumbleMinimum, roll: null, outcome: 'success' };
  }
  if (difficulty === 'impossible') {
    return { score, difficulty, threshold, criticalLimit, specialLimit, fumbleMinimum, roll: null, outcome: 'failure' };
  }

  const roll = random(100);
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw new Error('Le résultat du D100 est invalide.');
  let outcome: BrpOutcome;
  if (roll >= fumbleMinimum) outcome = 'fumble';
  else if (roll >= 96 || roll > threshold) outcome = 'failure';
  else if (roll <= criticalLimit) outcome = 'critical';
  else if (roll <= specialLimit) outcome = 'special';
  else outcome = 'success';
  return { score, difficulty, threshold, criticalLimit, specialLimit, fumbleMinimum, roll, outcome };
}
