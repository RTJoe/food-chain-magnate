/**
 * Determinization (ai-strategy.md §4.2): full states consistent with the seat's view. Built on
 * `sampleState` (fresh rng, shuffled tile pool, hidden reserves, unrevealed drafts), with two
 * refinements: hidden reserve cards follow a prior instead of a uniform draw, and rivals'
 * submitted-but-hidden structures are drawn from Medium's candidate structures for their seat
 * (softmax over the forecast score; sample 0 takes the best one).
 */
import type { GameState, PlayerId, ReserveCard, RngState } from '@fcm/engine';
import { nextFloat, reserveOptions } from '@fcm/engine';
import { withState, type Ctx } from '../shared/ctx.js';
import { sampleState } from '../viewState.js';
import { structureCandidates } from '../medium/restructure.js';

/** Softmax temperature over structure scores ($). */
const TEMPERATURE = 8;

const RESERVE_PRIOR: Record<number, number> = { 100: 0.2, 200: 0.4, 300: 0.4 };
const PRICE_PRIOR: Record<number, number> = { 5: 0.3, 10: 0.4, 20: 0.3 };

function weighted<T>(rng: RngState, items: readonly T[], weight: (x: T) => number): T | undefined {
  const total = items.reduce((a, x) => a + Math.max(0, weight(x)), 0);
  if (total <= 0) return items[0];
  let r = nextFloat(rng) * total;
  for (const x of items) {
    r -= Math.max(0, weight(x));
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

const reserveWeight = (r: ReserveCard): number => (r.kind === 'price' ? (PRICE_PRIOR[r.basePrice] ?? 0.33) : (RESERVE_PRIOR[r.amount] ?? 0.33));

/** Rivals whose structure for this Restructuring is submitted but still hidden from me. */
export function hiddenDrafts(c: Ctx): PlayerId[] {
  if (c.view.phase.kind !== 'restructuring') return [];
  return c.view.turnOrder.filter((id) => id !== c.me && c.view.submitted[id]);
}

/** Does hidden information change rollouts much? (drafts now, or reserves near the bank break) */
export function sampleCount(c: Ctx, nearBreak: boolean): number {
  if (hiddenDrafts(c).length) return 4;
  return nearBreak ? 3 : 1;
}

export function makeSample(c: Ctx, rng: RngState, index: number): GameState {
  const s = sampleState(c.view, rng);
  // Reserve prior (only for cards not yet visible).
  const options = reserveOptions(s);
  for (const id of s.turnOrder) {
    if (id === c.me || c.view.visibleReserves[id] || s.players[id]?.reserveCard) continue;
    const sec = s.secrets[id];
    if (sec?.reserve && options.length) sec.reserve = weighted(rng, options, reserveWeight) ?? sec.reserve;
  }
  for (const id of hiddenDrafts(c)) {
    const sec = s.secrets[id] as { structureDraft: unknown } | undefined;
    const p = s.players[id];
    if (!sec || !p) continue;
    try {
      const cands = structureCandidates(withState(c, s, id), 5, id);
      if (!cands.length) continue;
      const best = cands[0]!.score;
      const pick = index === 0 ? cands[0] : weighted(rng, cands, (x) => Math.exp((x.score - best) / TEMPERATURE));
      if (pick) sec.structureDraft = { ceo: p.structure.ceo, ceoSubs: pick.sub.ceoSubs, managerSubs: pick.sub.managerSubs };
    } catch {
      // keep sampleState's draft
    }
  }
  return s;
}
