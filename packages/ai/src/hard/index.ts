/**
 * Hard bot (ai-strategy.md §4): Medium's planner proposes candidates, determinized rollouts through
 * Dinnertime / Payday / Clean up judge them, and an evaluation function scores the next round's
 * start. Anytime: it answers within `budgetMs` (minus a safety margin) and keeps Medium's choice
 * when nothing beats it in time.
 *
 * - Restructuring: Medium's candidate structures against sampled rival drafts.
 * - Order of business: every free position.
 * - Working: substitutions into Medium's turn plan, searched at the first call of the turn; the
 *   chosen substitutions are cached per (game, seat, round). The cache may be missing (pooled
 *   workers, restarts, undo): then the rest of the turn is searched again from the view.
 * - Payday: Medium's firing sets.
 * - Setup, Clean up and pending choices: Medium (search gains little there).
 */
import type { Action, GameState, Uid } from '@fcm/engine';
import type { Bot, BotExplanation, BotInput, ScoredAlternative } from '../types.js';
import { fallbackAction } from '../heuristics.js';
import { isValid, makeCtx, type Ctx } from '../shared/ctx.js';
import { roundsLeftEstimate } from '../shared/facts.js';
import type { PlanStep } from '../shared/plan.js';
import { mediumChoose } from '../medium/index.js';
import { chooseArchetype } from '../medium/archetype.js';
import { combine, fireCands, orderCands, structureCands, workCands, type Labeled } from './candidates.js';
import { makeSample, sampleCount } from './determinize.js';
import { evaluate, WEIGHTS, type Weights } from './evaluate.js';
import { overrideWork, rollout, rolloutSeed, seatCtx, type MinePolicy } from './rollout.js';
import { newCandidate, search, type SearchBudget, type SearchCandidate } from './search.js';

export { evaluate, WEIGHTS, type Weights, type Evaluation } from './evaluate.js';
export { rollout, overrideWork, mediumMove, seatCtx } from './rollout.js';

export interface HardOptions {
  weights?: Weights;
  /** Cap on rollouts per decision (tests, determinism); time still applies. */
  maxRollouts?: number;
  /** Budgets at or below this return Medium's choice (ai-strategy.md §4.6). */
  minBudgetMs?: number;
  /** Kept back from `budgetMs` for answering (ms). */
  safetyMs?: number;
  /** Paired advantage ($) a candidate needs over Medium's choice. */
  margin?: number;
  /**
   * Rounds each rollout plays (1 = to the next Restructuring). Default: 2 (hires and training pay
   * off over two rounds), 1 with more than 4 players or under 1 s (rollouts get too dear).
   */
  horizon?: number;
  /** Phases that search (default all four); others play Medium. For ablations. */
  phases?: readonly ('restructuring' | 'orderOfBusiness' | 'working' | 'payday')[];
}

const DEFAULTS = { minBudgetMs: 150, safetyMs: 80, margin: 2 };

// ---------------------------------------------------------------------------
// Per-turn cache (may be missing)
// ---------------------------------------------------------------------------

interface WorkEntry {
  kind: 'work';
  seq: number;
  overrides: PlanStep[];
  consumed: number[];
}
interface PaydayEntry {
  kind: 'payday';
  seq: number;
}
type Entry = WorkEntry | PaydayEntry;

const CACHE_SIZE = 64;
const cache = new Map<string, Entry>();

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

function cacheKey(c: Ctx, kind: string): string {
  const v = c.view;
  const game = hash(JSON.stringify(v.board.tiles) + JSON.stringify(v.config.players));
  return `${game}:${c.me}:${v.round}:${kind}`;
}

function remember(key: string, e: Entry): void {
  cache.delete(key);
  cache.set(key, e);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
}

/** Forget cached turn plans (tests). */
export function clearHardCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

interface Decision {
  action: Action;
  info?: Omit<BotExplanation, 'action'>;
}

interface Run<T> {
  cands: Labeled<T>[];
  /** Policy for my seat inside a rollout of candidate `data` (fresh per rollout). */
  policy: (data: T) => MinePolicy;
  combos?: (ranked: SearchCandidate<T>[]) => Labeled<T>[];
}

function medium(input: BotInput, why: string): Decision {
  return { action: mediumChoose(input), info: { extra: { search: why } } };
}

function runSearch<T>(c: Ctx, input: BotInput, opts: Required<HardOptions>, t0: number, r: Run<T>) {
  const nearBreak = roundsLeftEstimate(c) < 3;
  const horizon = opts.horizon || (c.s.turnOrder.length > 4 || input.budgetMs < 1000 ? 1 : 2);
  const K = sampleCount(c, nearBreak);
  const samples: GameState[] = [];
  for (let i = 0; i < K; i++) samples.push(makeSample(c, input.rng, i));
  const seeds = samples.map(() => rolloutSeed(input.rng));
  const budget: SearchBudget = { deadline: t0 + input.budgetMs - opts.safetyMs, maxRollouts: opts.maxRollouts, rollouts: 0, avgMs: 0 };
  const cands = r.cands.map((x) => newCandidate(x.label, x.data));
  const res = search(cands, {
    samples,
    budget,
    margin: opts.margin,
    run: (data, sample, i) => {
      const out = rollout(sample, c.me, c.engine, seeds[i] ?? 1, r.policy(data), { horizon, abortAt: budget.deadline });
      return out === 'timeout' ? out : out ? evaluate(c, out.state, c.me, opts.weights) : null;
    },
    ...(r.combos ? { afterFirstPass: (ranked: SearchCandidate<T>[]) => r.combos!(ranked).map((x) => newCandidate(x.label, x.data)) } : {}),
  });
  return { res, K, horizon };
}

function info<T>(res: ReturnType<typeof runSearch<T>>, archetype: string | undefined): Omit<BotExplanation, 'action'> {
  const top: ScoredAlternative[] = res.res.ranked.slice(0, 8).map((r) => {
    const valid = r.cand.scores.filter((x): x is number => x !== null);
    const mean = valid.length ? valid.reduce((a, x) => a + x, 0) / valid.length : NaN;
    const terms = r.cand.terms.find((t) => t) ?? undefined;
    return { summary: `${r.cand.label} (adv ${Number.isFinite(r.adv) ? r.adv.toFixed(1) : 'fail'})`, score: Math.round(mean * 10) / 10, n: r.n, ...(terms ? { terms: roundTerms(terms) } : {}) };
  });
  const chosen = res.res.best.terms.find((t) => t);
  return {
    ...(archetype ? { archetype } : {}),
    candidates: res.res.ranked.length,
    rollouts: res.res.rollouts,
    samples: res.K,
    horizon: res.horizon,
    top,
    ...(chosen ? { evalTerms: roundTerms(chosen) } : {}),
  };
}

const roundTerms = (t: Record<string, number>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10]));

/** Policy that plays `action` once for my seat while the game is still at the given phase/round. */
function once(action: Action, phase: GameState['phase']['kind'], round: number): MinePolicy {
  return (s) => (s.phase.kind === phase && s.round === round && !s.pending.length ? action : null);
}

function decide(input: BotInput, opts: Required<HardOptions>): Decision {
  const t0 = Date.now();
  const c = makeCtx(input);
  const s = c.s;
  const me = c.me;
  if (s.pending[0]?.player === me) return medium(input, 'pending choice');
  if (input.budgetMs <= opts.minBudgetMs) return medium(input, 'budget');
  if (!(opts.phases as readonly string[]).includes(s.phase.kind)) return medium(input, 'phase not searched');
  const arch = (): string | undefined => {
    try {
      return chooseArchetype(c).id;
    } catch {
      return undefined;
    }
  };
  switch (s.phase.kind) {
    case 'restructuring': {
      const cands = structureCands(c);
      if (s.round <= 1 || cands.length <= 1) return medium(input, 'one structure');
      const round = s.round;
      const r = runSearch(c, input, opts, t0, { cands, policy: (a) => once(a, 'restructuring', round) });
      return { action: r.res.best.data, info: info(r, arch()) };
    }
    case 'orderOfBusiness': {
      const cands = orderCands(c);
      if (cands.length <= 1) return medium(input, 'one position');
      const round = s.round;
      const r = runSearch(c, input, opts, t0, { cands, policy: (a) => once(a, 'orderOfBusiness', round) });
      return { action: r.res.best.data, info: info(r, arch()) };
    }
    case 'working':
      return decideWork(c, input, opts, t0, arch);
    case 'payday':
      return decidePayday(c, input, opts, t0, arch);
    default:
      return medium(input, 'medium phase');
  }
}

function decideWork(c: Ctx, input: BotInput, opts: Required<HardOptions>, t0: number, arch: () => string | undefined): Decision {
  const key = cacheKey(c, 'work');
  const seq = c.view.history.seq;
  const hit = cache.get(key);
  if (hit?.kind === 'work' && hit.seq === seq) {
    const consumed = new Set(hit.consumed);
    const action = overrideWork(c, hit.overrides, consumed);
    remember(key, { ...hit, seq: seq + 1, consumed: [...consumed] });
    return { action, info: { extra: { search: 'cached turn plan', overrides: hit.overrides.map((o) => o.summary) } } };
  }
  const cands = workCands(c);
  let chosen: PlanStep[] = [];
  let details: Omit<BotExplanation, 'action'> = { extra: { search: 'one plan' } };
  if (cands.length > 1) {
    const me = c.me;
    const round = c.s.round;
    const r = runSearch(c, input, opts, t0, {
      cands,
      policy: (ovs) => {
        const consumed = new Set<number>();
        return (s, rng) => {
          if (s.phase.kind !== 'working' || s.phase.player !== me || s.round !== round || s.pending.length) return null;
          return overrideWork(seatCtx(s, me, c.engine, rng), ovs, consumed);
        };
      },
      combos: (ranked) => {
        const good = ranked.filter((x) => x.data.length === 1).slice(0, 3);
        return combine(
          good.map((x) => x.data),
          good.map((x) => x.label),
        );
      },
    });
    chosen = r.res.best.data;
    details = info(r, arch());
  }
  const consumed = new Set<number>();
  const action = overrideWork(c, chosen, consumed);
  remember(key, { kind: 'work', seq: seq + 1, overrides: chosen, consumed: [...consumed] });
  return { action, info: details };
}

function decidePayday(c: Ctx, input: BotInput, opts: Required<HardOptions>, t0: number, arch: () => string | undefined): Decision {
  const me = c.me;
  const confirm: Action = { type: 'payday.confirm', playerId: me };
  const fire = (uids: Uid[]): Action => ({ type: 'payday.fire', playerId: me, uids });
  const key = cacheKey(c, 'payday');
  const seq = c.view.history.seq;
  const hit = cache.get(key);
  if (hit?.kind === 'payday' && hit.seq === seq && isValid(c, confirm)) return { action: confirm, info: { extra: { search: 'fired; confirm' } } };
  const cands = fireCands(c);
  if (cands.length <= 1) return medium(input, 'one firing set');
  const round = c.s.round;
  const r = runSearch(c, input, opts, t0, {
    cands,
    policy: (uids) => {
      let fired = false;
      return (s) => {
        if (s.phase.kind !== 'payday' || s.round !== round || s.pending.length) return null;
        if (!fired && uids.length) {
          fired = true;
          return fire(uids);
        }
        return confirm;
      };
    },
  });
  const set = r.res.best.data;
  if (!set.length) return { action: confirm, info: info(r, arch()) };
  remember(key, { kind: 'payday', seq: seq + 1 });
  return { action: fire(set), info: info(r, arch()) };
}

function safeDecide(input: BotInput, opts: Required<HardOptions>): Decision {
  let d: Decision | null = null;
  try {
    d = decide(input, opts);
  } catch {
    d = null;
  }
  const c = makeCtx(input);
  if (d && isValid(c, d.action)) return d;
  // Something went wrong: Medium, then the safe fallback.
  try {
    const a = mediumChoose(input);
    if (isValid(c, a)) return { action: a, info: { warnings: ['hard failed; medium move'] } };
  } catch {
    // fall through
  }
  return { action: fallbackAction(c.s, c.me, c.engine, c.legal, c.rng), info: { warnings: ['hard failed; fallback'] } };
}

export function createHardBot(options: HardOptions = {}): Bot {
  const opts: Required<HardOptions> = {
    weights: options.weights ?? WEIGHTS,
    maxRollouts: options.maxRollouts ?? Infinity,
    minBudgetMs: options.minBudgetMs ?? DEFAULTS.minBudgetMs,
    safetyMs: options.safetyMs ?? DEFAULTS.safetyMs,
    margin: options.margin ?? DEFAULTS.margin,
    horizon: options.horizon ?? 0,
    phases: options.phases ?? ['restructuring', 'orderOfBusiness', 'working', 'payday'],
  };
  return {
    level: 'hard',
    choose: (input) => safeDecide(input, opts).action,
    explain: (input) => {
      const d = safeDecide(input, opts);
      return { action: d.action, ...(d.info ?? {}) };
    },
  };
}

