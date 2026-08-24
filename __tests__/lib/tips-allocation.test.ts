/**
 * Tip attribution.
 *
 * These shares no longer move money — the establishment receives the whole tip
 * in one transfer — but they are what the payroll export pays people on. A
 * rounding bug here is an employee being shortchanged, so the invariant that
 * matters most is that the shares always add back up to the tip.
 */
import { describe, it, expect } from 'vitest';
import { allocateToOne, splitEqually } from '@/lib/tips/allocation';

describe('splitEqually', () => {
  it('splits evenly when the amount divides', () => {
    expect(splitEqually(900, ['a', 'b', 'c'])).toEqual([
      { staffId: 'a', amount: 300 },
      { staffId: 'b', amount: 300 },
      { staffId: 'c', amount: 300 },
    ]);
  });

  it('gives the rounding remainder to the first recipient', () => {
    // 10,00 € across 3 people: 3,34 / 3,33 / 3,33 — never 3,33 × 3 with a
    // centime left behind on the platform.
    expect(splitEqually(1000, ['a', 'b', 'c'])).toEqual([
      { staffId: 'a', amount: 334 },
      { staffId: 'b', amount: 333 },
      { staffId: 'c', amount: 333 },
    ]);
  });

  it('always distributes the whole amount, whatever the team size', () => {
    for (const total of [1, 50, 333, 500, 1000, 9999, 100_000]) {
      for (const n of [1, 2, 3, 4, 5, 7, 11, 23]) {
        const ids = Array.from({ length: n }, (_, i) => `s${i}`);
        const sum = splitEqually(total, ids).reduce((acc, a) => acc + a.amount, 0);
        expect(sum).toBe(total);
      }
    }
  });

  it('is stable across replays, so a re-delivered webhook writes identical rows', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(splitEqually(1001, ids)).toEqual(splitEqually(1001, ids));
  });

  it('returns nothing rather than dividing by zero on an empty team', () => {
    expect(splitEqually(1000, [])).toEqual([]);
  });

  it('returns nothing for a non-positive or invalid amount', () => {
    expect(splitEqually(0, ['a'])).toEqual([]);
    expect(splitEqually(-500, ['a'])).toEqual([]);
    expect(splitEqually(Number.NaN, ['a'])).toEqual([]);
  });

  it('gives everything to a single recipient', () => {
    expect(splitEqually(777, ['solo'])).toEqual([{ staffId: 'solo', amount: 777 }]);
  });
});

describe('allocateToOne', () => {
  it('credits the whole tip to the named recipient', () => {
    expect(allocateToOne(500, 'staff-1')).toEqual([{ staffId: 'staff-1', amount: 500 }]);
  });
});
