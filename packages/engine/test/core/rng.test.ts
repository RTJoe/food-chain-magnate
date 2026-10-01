import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextUint32, pick, randomInt, shuffle } from '../../src/core/rng.js';
import type { RngState } from '../../src/types/state.js';

describe('xoshiro128**', () => {
  it('matches the reference output for state [1, 2, 3, 4]', () => {
    const s: RngState = [1, 2, 3, 4];
    expect([nextUint32(s), nextUint32(s), nextUint32(s)]).toEqual([11520, 0, 5927040]);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 50 }, () => nextUint32(a));
    const seqB = Array.from({ length: 50 }, () => nextUint32(b));
    const seqC = Array.from({ length: 50 }, () => nextUint32(c));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    expect(seqA.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true);
  });

  it('keeps plain-JSON state that resumes identically after a round trip', () => {
    const s = createRng(7);
    nextUint32(s);
    const copy = JSON.parse(JSON.stringify(s)) as RngState;
    expect(nextUint32(copy)).toBe(nextUint32(s));
  });

  it('never seeds an all-zero state', () => {
    for (let seed = 0; seed < 1000; seed++) expect(createRng(seed).some((w) => w !== 0)).toBe(true);
  });

  it('randomInt stays in range and covers all values roughly uniformly', () => {
    const s = createRng(1);
    const counts = Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i++) {
      const v = randomInt(s, 6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(9400), expect(c).toBeLessThan(10600);
    expect(() => randomInt(s, 0)).toThrow();
    expect(() => randomInt(s, 1.5)).toThrow();
  });

  it('nextFloat is in [0, 1)', () => {
    const s = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('shuffle is a deterministic permutation; pick returns a member', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(createRng(9), [...items]);
    const b = shuffle(createRng(9), [...items]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
    expect(items).toContain(pick(createRng(5), items));
    expect(() => pick(createRng(5), [])).toThrow();
  });
});
