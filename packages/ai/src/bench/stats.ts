/** Statistics for tournaments (docs/ai-strategy.md §8.2): Wilson intervals, percentiles, multiplayer Elo. */
import { createRng, nextFloat } from '@fcm/engine';

/** Wilson score interval for `wins` out of `n` (fractional wins allowed). z = 1.96 → 95 %. */
export function wilson(wins: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Nearest-rank percentile of a sorted array (q in 0..1). */
export function percentile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i] as number;
}

export interface LatencyStats {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export function latencyStats(values: number[]): LatencyStats {
  const s = Float64Array.from(values).sort();
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, mean: s.length ? sum / s.length : 0, p50: percentile(s, 0.5), p95: percentile(s, 0.95), max: s.length ? (s[s.length - 1] as number) : 0 };
}

/**
 * One game for Elo: every entity's finishing place (0 = winner). Equal places are draws. A game
 * can hold several seats of one entity; pairs within one entity are skipped.
 */
export interface EloGame {
  places: { entity: string; place: number }[];
}

export interface EloRating {
  mean: number;
  /** Standard deviation over the shuffles. */
  spread: number;
}

/**
 * Multiplayer Elo: each game is split into pairwise results (i above j → i beats j); K = 16 from
 * 1500, `passes` passes over a shuffled game list, averaged over `shuffles` shuffles.
 */
export function multiplayerElo(games: EloGame[], opts: { k?: number; passes?: number; shuffles?: number; seed?: number } = {}): Record<string, EloRating> {
  const k = opts.k ?? 16;
  const passes = opts.passes ?? 2;
  const shuffles = opts.shuffles ?? 10;
  const rng = createRng(opts.seed ?? 12345);
  const entities = [...new Set(games.flatMap((g) => g.places.map((p) => p.entity)))].sort();
  const runs: Record<string, number[]> = Object.fromEntries(entities.map((e) => [e, []]));
  for (let s = 0; s < shuffles; s++) {
    const order = games.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(nextFloat(rng) * (i + 1));
      [order[i], order[j]] = [order[j] as EloGame, order[i] as EloGame];
    }
    const r: Record<string, number> = Object.fromEntries(entities.map((e) => [e, 1500]));
    for (let pass = 0; pass < passes; pass++) {
      for (const g of order) {
        const delta: Record<string, number> = {};
        for (let i = 0; i < g.places.length; i++) {
          for (let j = i + 1; j < g.places.length; j++) {
            const a = g.places[i]!;
            const b = g.places[j]!;
            if (a.entity === b.entity) continue;
            const ra = r[a.entity]!;
            const rb = r[b.entity]!;
            const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
            const score = a.place < b.place ? 1 : a.place > b.place ? 0 : 0.5;
            const d = k * (score - expected);
            delta[a.entity] = (delta[a.entity] ?? 0) + d;
            delta[b.entity] = (delta[b.entity] ?? 0) - d;
          }
        }
        for (const [e, d] of Object.entries(delta)) r[e] = r[e]! + d;
      }
    }
    for (const e of entities) runs[e]!.push(r[e]!);
  }
  return Object.fromEntries(
    entities.map((e) => {
      const xs = runs[e]!;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const spread = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
      return [e, { mean, spread }];
    }),
  );
}
