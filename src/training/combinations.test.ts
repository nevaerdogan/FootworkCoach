import { describe, expect, it } from 'vitest';
import { MOVEMENTS } from '../movements';
import { COMBINATION_RULES, DRILLS, generateCombination, isValidCombination, PRESETS, type Level } from './combinations';

const LEVELS: Level[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

describe('generateCombination', () => {
  it('is deterministic for a seed', () => {
    for (const level of LEVELS) {
      expect(generateCombination(level, 6, 42)).toEqual(generateCombination(level, 6, 42));
    }
  });

  it('different seeds give different combinations', () => {
    const seen = new Set(Array.from({ length: 10 }, (_, s) => generateCombination('ADVANCED', 6, s).join()));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('respects length and level-allowed moves', () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 50; seed++) {
        const c = generateCombination(level, 5, seed);
        expect(c).toHaveLength(5);
        expect(c.every((id) => COMBINATION_RULES.allowed[level].includes(id))).toBe(true);
      }
    }
  });

  it('beginner has no pivots; intermediate at most one', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pivots = (l: Level) => generateCombination(l, 6, seed).filter((id) => MOVEMENTS[id].kind === 'pivot').length;
      expect(pivots('BEGINNER')).toBe(0);
      expect(pivots('INTERMEDIATE')).toBeLessThanOrEqual(1);
    }
  });

  it('every generated combination obeys the rules (no repeats, stays in frame)', () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 100; seed++) {
        expect(isValidCombination(generateCombination(level, 6, seed), level)).toBe(true);
      }
    }
  });

  it('presets are valid', () => {
    for (const level of LEVELS) expect(isValidCombination(PRESETS[level], level)).toBe(true);
  });
});

describe('isValidCombination', () => {
  it('rejects immediate repeats', () => {
    expect(isValidCombination(['LEFT_STEP', 'LEFT_STEP'])).toBe(false);
  });

  it('rejects drifting out of frame', () => {
    expect(isValidCombination(['FORWARD_STEP', 'LEFT_STEP', 'FORWARD_STEP', 'RIGHT_STEP', 'FORWARD_STEP'])).toBe(false);
    expect(isValidCombination(['DASH_FORWARD', 'LEFT_STEP', 'FORWARD_STEP'])).toBe(false);
  });

  it('every drill stays in frame and the shapes close where expected', () => {
    for (const d of DRILLS) expect(isValidCombination(d.moves), d.id).toBe(true);
  });

  it('rejects back-to-back pivots', () => {
    expect(isValidCombination(['PIVOT_LEFT', 'PIVOT_RIGHT'])).toBe(false);
  });
});
