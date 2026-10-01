/**
 * Phase 7 — Clean up (base.md §10; DLX p33).
 *
 * A. Throw away unsold items. A player who earned "First to Throw Away" in an EARLIER round may
 *    keep up to 10 (player's choice); throwing away ≥1 item claims the milestone.
 * B. Structure and beach return to hand; busy marketeers stay.
 * C. COMING SOON restaurants open; drive-ins end (drive-ins are derived from the structure).
 * D. Milestones claimed this round are crossed out for everyone else.
 * Bankrupt chains leave the game at the end of the turn (base.md §12, JD 1473813).
 *
 * Kept items are stored in `PlayerState.freezer` and stay in stock (Dinnertime sells from
 * inventory + freezer).
 */
import type { HookContext } from '../types/module.js';
import type { CleanupFreezer, FoodCounts, FoodId, GameState, Ok, PlayerId, Rejected } from '../types/index.js';
import { FOODS } from '../content/foods.js';
import { endGame } from './bank.js';
import { crossOutMilestones, onMilestoneEvent } from './milestones.js';
import { hasMilestoneBefore } from './pricing.js';

/** Freezer capacity this Clean up: 10 with "First to Throw Away" earned in an earlier round. */
export function freezerCapacity(s: GameState, player: PlayerId): number {
  return hasMilestoneBefore(s, player, 'first_throw_away') ? 10 : 0;
}

/** inventory + freezer. */
export function stockOf(s: GameState, player: PlayerId): FoodCounts {
  const p = s.players[player];
  const out: FoodCounts = {};
  if (!p) return out;
  for (const src of [p.inventory, p.freezer]) {
    for (const [good, n] of Object.entries(src) as [FoodId, number][]) if (n > 0) out[good] = (out[good] ?? 0) + n;
  }
  return out;
}

const total = (c: FoodCounts) => Object.values(c).reduce<number>((a, n) => a + (n ?? 0), 0);
const freezerRule = (good: FoodId) => FOODS.find((f) => f.id === good)?.freezer ?? 'yes';

/** Phase 7: discard/freeze food, return cards, flip restaurants. May require freezer choices. */
export function runCleanup(ctx: HookContext): void {
  const s = ctx.state;
  if (s.phase.kind !== 'cleanup') s.phase = { kind: 'cleanup' };
  const waiting: PlayerId[] = [];
  for (const player of s.turnOrder) {
    const p = s.players[player];
    if (!p) continue;
    const stock = stockOf(s, player);
    const cap = p.bankrupt ? 0 : freezerCapacity(s, player);
    if (cap > 0 && total(stock) > 0) {
      const allPlain = (Object.keys(stock) as FoodId[]).every((g) => freezerRule(g) === 'yes');
      // Keeping is never worse than discarding, so an obvious choice is made automatically.
      if (allPlain && total(stock) <= cap) {
        keep(ctx, player, stock);
        continue;
      }
      waiting.push(player);
      continue;
    }
    keep(ctx, player, {});
  }
  if (waiting.length) {
    s.awaiting = { kind: 'cleanup.freezer', players: waiting };
    return;
  }
  finishCleanup(ctx);
}

/** Keep `kept` in the freezer, throw away the rest of the stock. */
function keep(ctx: HookContext, player: PlayerId, kept: FoodCounts): void {
  const s = ctx.state;
  const p = s.players[player];
  if (!p) return;
  const stock = stockOf(s, player);
  const discarded: FoodCounts = {};
  for (const [good, n] of Object.entries(stock) as [FoodId, number][]) {
    const k = Math.min(n, kept[good] ?? 0);
    if (n - k > 0) discarded[good] = n - k;
  }
  const frozen: FoodCounts = {};
  for (const [good, n] of Object.entries(kept) as [FoodId, number][]) if (n > 0) frozen[good] = n;
  p.inventory = {};
  p.freezer = frozen;
  if (total(frozen) > 0) ctx.emit({ type: 'foodFrozen', player, goods: frozen });
  if (total(discarded) > 0) {
    const ev = { type: 'foodDiscarded' as const, player, goods: discarded };
    ctx.emit(ev);
    if (!p.bankrupt) onMilestoneEvent(ctx, ev);
  }
}

export function validateCleanupAction(state: GameState, action: CleanupFreezer): Ok | Rejected {
  if (state.phase.kind !== 'cleanup') return rej('WRONG_PHASE', 'Not in Clean up');
  if (state.awaiting.kind !== 'cleanup.freezer' || !state.awaiting.players.includes(action.playerId)) {
    return rej('NOT_YOUR_TURN', 'No freezer decision pending for this player');
  }
  const stock = stockOf(state, action.playerId);
  const cap = freezerCapacity(state, action.playerId);
  let n = 0;
  for (const [good, k] of Object.entries(action.keep ?? {}) as [FoodId, number][]) {
    if (!Number.isInteger(k) || k < 0) return rej('INVALID_PAYLOAD', `Bad count for ${good}`);
    if (k === 0) continue;
    if (k > (stock[good] ?? 0)) return rej('ILLEGAL', `Only ${stock[good] ?? 0} ${good} in stock`);
    if (freezerRule(good) === 'no') return rej('ILLEGAL', `${good} cannot be frozen`);
    n += k;
  }
  if (n > cap) return rej('ILLEGAL', `The freezer holds at most ${cap} items`);
  const kinds = (Object.keys(action.keep ?? {}) as FoodId[]).filter((g) => (action.keep[g] ?? 0) > 0);
  if (kinds.some((g) => freezerRule(g) === 'exclusive') && kinds.length > 1) {
    return rej('ILLEGAL', 'Kimchi cannot be frozen together with other items');
  }
  return { ok: true };
}

export function applyCleanupAction(ctx: HookContext, action: CleanupFreezer): void {
  const s = ctx.state;
  keep(ctx, action.playerId, action.keep ?? {});
  const rest = s.awaiting.players.filter((id) => id !== action.playerId);
  if (rest.length) {
    s.awaiting = { kind: 'cleanup.freezer', players: rest };
    return;
  }
  finishCleanup(ctx);
}

export function isCleanupComplete(state: GameState): boolean {
  return state.phase.kind !== 'cleanup' || state.awaiting.kind !== 'cleanup.freezer' || state.awaiting.players.length === 0;
}

/** Steps B–D plus end-of-turn bankruptcy. */
function finishCleanup(ctx: HookContext): void {
  const s = ctx.state;
  s.awaiting = { kind: 'none', players: [] };
  for (const player of s.turnOrder) {
    const p = s.players[player];
    if (!p) continue;
    if (p.bankrupt) {
      removeBankruptChain(ctx, player);
      continue;
    }
    // B. Return employees (busy marketeers stay face up).
    if (p.structure.ceoSubs.length || Object.keys(p.structure.managerSubs).length || p.beach.length) {
      p.structure.ceoSubs = [];
      p.structure.managerSubs = {};
      p.beach = [];
      ctx.emit({ type: 'cardsReturned', player });
    }
    p.unusedRecruitActions = 0;
  }
  // C. Remove signs.
  for (const r of Object.values(s.board.restaurants)) {
    delete r.driveIn;
    if (r.status === 'comingSoon') {
      r.status = 'open';
      ctx.emit({ type: 'restaurantOpened', restaurantId: r.id });
    }
  }
  // D. Cross out milestones claimed this round.
  crossOutMilestones(ctx);
  if (s.turnOrder.every((id) => s.players[id]?.bankrupt)) endGame(ctx, 'allBankrupt');
}

/**
 * base.md §12 (JD 1473813, 1660800): cards return to the supply (busy marketeers as if fired;
 * their campaigns stay), restaurants stay as derelict buildings.
 */
function removeBankruptChain(ctx: HookContext, player: PlayerId): void {
  const s = ctx.state;
  const p = s.players[player];
  if (!p) return;
  for (const [uid, card] of Object.entries(p.employees)) {
    if (uid === p.structure.ceo) continue;
    for (const cid of p.busy[uid] ?? []) {
      const camp = s.board.campaigns[cid];
      if (camp) camp.marketeer = null;
    }
    if (s.supply[card.employeeId] !== undefined) s.supply[card.employeeId] = (s.supply[card.employeeId] ?? 0) + 1;
    delete p.employees[uid];
    ctx.emit({ type: 'employeeFired', player, uid, employeeId: card.employeeId, forced: true });
  }
  p.busy = {};
  p.beach = [];
  p.structure.ceoSubs = [];
  p.structure.managerSubs = {};
  p.inventory = {};
  p.freezer = {};
  for (const r of Object.values(s.board.restaurants)) if (r.owner === player) r.status = 'derelict';
}

function rej(code: Rejected['code'], message: string): Rejected {
  return { ok: false, code, message };
}
