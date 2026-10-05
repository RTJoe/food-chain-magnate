/**
 * Anytime search (ai-strategy.md §4.6): every candidate is rolled out on determinization 0 (Medium's
 * own choice first), then the remaining samples go best-first (UCB-lite). Candidates are compared
 * with the base (Medium's choice) on the same samples (paired differences: the hidden information
 * and the opponent model are the same for both), and the base is kept unless a candidate is better
 * by a margin. Deadline checks happen between rollouts, with room for one more average rollout.
 */
import type { GameState } from '@fcm/engine';
import type { Evaluation } from './evaluate.js';

export interface SearchCandidate<T> {
  label: string;
  data: T;
  /** Evaluation per sample index (null = rollout failed). */
  scores: (number | null)[];
  terms: (Record<string, number> | null)[];
}

export interface SearchBudget {
  deadline: number;
  maxRollouts: number;
  /** Rollouts run so far (shared across calls of one decision). */
  rollouts: number;
  /** Running mean rollout time (ms). */
  avgMs: number;
  /** Slowest rollout so far (ms). */
  maxMs?: number;
}

export interface SearchOptions<T> {
  samples: GameState[];
  /** Roll candidate `data` out on sample `i`; null when it failed, 'timeout' when out of time. */
  run: (data: T, sample: GameState, i: number) => Evaluation | null | 'timeout';
  budget: SearchBudget;
  /** Extra candidates to try once every candidate has one rollout (pairwise combinations). */
  afterFirstPass?: (ranked: SearchCandidate<T>[]) => SearchCandidate<T>[];
  /** UCB exploration constant ($). */
  explore?: number;
  /** A candidate must beat the base by this much ($, paired mean) to be chosen. */
  margin?: number;
}

export interface SearchResult<T> {
  best: SearchCandidate<T>;
  /** Candidates ranked by paired advantage over the base (base included). */
  ranked: { cand: SearchCandidate<T>; adv: number; n: number }[];
  rollouts: number;
}

const FAILED = -1e6;

const hasTime = (b: SearchBudget): boolean => b.rollouts < b.maxRollouts && Date.now() + Math.max(b.avgMs * 1.5, b.maxMs ?? 0) < b.deadline;

export const newCandidate = <T>(label: string, data: T): SearchCandidate<T> => ({ label, data, scores: [], terms: [] });

const n = <T>(c: SearchCandidate<T>) => c.scores.length;
const failures = <T>(c: SearchCandidate<T>) => c.scores.filter((x) => x === null).length;

/** Mean paired difference to the base over the samples both have. */
export function advantage<T>(c: SearchCandidate<T>, base: SearchCandidate<T>): number {
  const k = Math.min(n(c), n(base));
  if (!k) return -Infinity;
  let t = 0;
  for (let i = 0; i < k; i++) t += (c.scores[i] ?? FAILED) - (base.scores[i] ?? FAILED);
  return t / k;
}

export function search<T>(cands: SearchCandidate<T>[], o: SearchOptions<T>): SearchResult<T> {
  const b = o.budget;
  let out = false;
  const timeLeft = (x: SearchBudget) => !out && hasTime(x);
  const K = o.samples.length;
  const explore = o.explore ?? 10;
  const margin = o.margin ?? 0;
  const base = cands[0] as SearchCandidate<T>;
  const step = (c: SearchCandidate<T>) => {
    const i = n(c);
    const t0 = Date.now();
    let e: Evaluation | null | 'timeout' = null;
    try {
      e = o.run(c.data, o.samples[i] as GameState, i);
    } catch {
      e = null;
    }
    if (e === 'timeout') {
      out = true;
      return;
    }
    const ms = Date.now() - t0;
    b.avgMs = b.rollouts ? b.avgMs + (ms - b.avgMs) / (b.rollouts + 1) : ms;
    b.maxMs = Math.max(b.maxMs ?? 0, ms);
    b.rollouts++;
    c.scores.push(e ? e.value : null);
    c.terms.push(e ? e.terms : null);
  };
  // Pass 1: every candidate once on sample 0, base first.
  for (const c of cands) {
    if (!timeLeft(b)) break;
    step(c);
  }
  if (o.afterFirstPass && timeLeft(b)) {
    const ranked = cands.filter((c) => c !== base && n(c) > 0 && failures(c) === 0).sort((x, y) => advantage(y, base) - advantage(x, base));
    for (const c of o.afterFirstPass(ranked)) {
      cands.push(c);
      if (!timeLeft(b)) break;
      step(c);
    }
  }
  // Pass 2: the base gets every sample first (paired comparisons), then UCB-lite.
  while (timeLeft(b)) {
    let pick: SearchCandidate<T> | undefined;
    if (n(base) < K) pick = base;
    else {
      let bestU = -Infinity;
      for (const c of cands) {
        if (c === base || n(c) >= K || failures(c) >= 2) continue;
        const u = n(c) === 0 ? Infinity : advantage(c, base) + explore / Math.sqrt(n(c));
        if (u > bestU) {
          bestU = u;
          pick = c;
        }
      }
    }
    if (!pick) break;
    step(pick);
  }
  const ranked = cands
    .filter((c) => n(c) > 0)
    .map((cand) => ({ cand, adv: cand === base ? 0 : failures(cand) ? -Infinity : advantage(cand, base), n: n(cand) }))
    .sort((x, y) => y.adv - x.adv);
  // Fully sampled challengers only (as many samples as the base has, up to K).
  const need = Math.min(K, Math.max(1, n(base)));
  const top = ranked.find((r) => r.cand === base || (r.n >= need && r.adv > margin));
  return { best: top?.cand ?? base, ranked, rollouts: b.rollouts };
}
