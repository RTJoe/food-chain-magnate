/**
 * xoshiro128** (Blackman & Vigna) over `GameState.rng`. Deterministic, 32-bit, plain-JSON state.
 * Functions mutate the passed state array in place (the reducer works on a clone).
 */
import type { RngState } from '../types/state.js';

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** splitmix32: expands a seed into well-mixed words. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Seed a fresh RNG state. Any integer seed (truncated to uint32). Never returns all-zero. */
export function createRng(seed: number): RngState {
  const next = splitmix32(seed);
  const s: RngState = [next(), next(), next(), next()];
  if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 1;
  return s;
}

/** Next uint32. Mutates `s`. */
export function nextUint32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextUint32(s) / 0x1_0000_0000;
}

/** Unbiased integer in [0, maxExclusive). `maxExclusive` must be in 1..2^32. */
export function randomInt(s: RngState, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new RangeError(`randomInt: bad bound ${maxExclusive}`);
  }
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % maxExclusive);
  let x = nextUint32(s);
  while (x >= limit) x = nextUint32(s);
  return x % maxExclusive;
}

/** Fisher–Yates shuffle in place; returns the same array. */
export function shuffle<T>(s: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(s, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

/** Uniform pick. Throws on empty input. */
export function pick<T>(s: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: empty array');
  return items[randomInt(s, items.length)] as T;
}
