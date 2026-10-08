/**
 * Phase 2 — Order of Business (base.md §5; DLX p14).
 *
 * Open slots = empty slots on the CEO and on every manager in the structure (+2 with "First
 * airplane campaign", count only). Most open slots chooses ANY free position first; ties go to
 * the player earlier in the previous turn order (turn 1: the random starting order). This is a
 * choice, not a sort. The last chooser's single remaining position is assigned automatically.
 * Bankrupt chains take no part and keep their place at the end.
 */
import type { OrderChoosePosition } from '../types/actions.js';
import type { GameState, PlayerId, Structure } from '../types/state.js';
import type { EngineCtx } from '../core/context.js';
import { OK, reject, type Check } from '../core/errors.js';
import { activePlayers, ceoSlotsFor, defOf, hasEffect, managerSlots } from '../core/cards.js';
import { contentFor, pipe } from '../modules/registry.js';

/** Extra open slots from milestones (First Airplane +2, DLX p14). */
export function orderSlotsBonus(s: GameState, player: PlayerId): number {
  return hasEffect(s, contentFor(s.config.modules), player, 'orderSlots').reduce((n, e) => n + e.amount, 0);
}

/** Open slots of `player` (their structure, or `structure` for a preview), milestone bonus included. */
export function openSlots(s: GameState, player: PlayerId, structure?: Pick<Structure, 'ceoSubs' | 'managerSubs'>): number {
  const p = s.players[player];
  if (!p) return 0;
  const st = structure ?? p.structure;
  const content = contentFor(s.config.modules);
  let open = Math.max(0, ceoSlotsFor(s, content, player) - st.ceoSubs.length);
  for (const uid of st.ceoSubs) {
    const slots = managerSlots(defOf(content, p, uid));
    if (slots > 0) open += Math.max(0, slots - (st.managerSubs[uid]?.length ?? 0));
  }
  return open + orderSlotsBonus(s, player);
}

export function choosingQueue(ctx: EngineCtx): PlayerId[] {
  const s = ctx.state;
  const active = activePlayers(s);
  const prev = new Map(s.turnOrder.map((id, i) => [id, i]));
  const slots = new Map(active.map((id) => [id, openSlots(s, id)]));
  const queue = [...active].sort((a, b) => (slots.get(b) ?? 0) - (slots.get(a) ?? 0) || (prev.get(a) ?? 0) - (prev.get(b) ?? 0));
  return pipe(ctx, 'orderQueue', queue, {}) as PlayerId[];
}

export function freePositions(s: GameState): number[] {
  if (s.phase.kind !== 'orderOfBusiness') return [];
  const n = s.phase.queue.length;
  const taken = new Set(Object.values(s.phase.picks));
  return Array.from({ length: n }, (_, i) => i).filter((i) => !taken.has(i));
}

export function currentChooser(s: GameState): PlayerId | null {
  if (s.phase.kind !== 'orderOfBusiness') return null;
  const ph = s.phase;
  return ph.queue.find((id) => ph.picks[id] === undefined) ?? null;
}

export function validateOrder(s: GameState, a: OrderChoosePosition): Check {
  if (s.phase.kind !== 'orderOfBusiness') return reject('WRONG_PHASE', 'Not choosing turn order');
  if (currentChooser(s) !== a.playerId) return reject('NOT_YOUR_TURN', 'Not your turn to choose');
  if (!freePositions(s).includes(a.position)) return reject('ILLEGAL', 'That position is not free');
  return OK;
}

export function applyOrder(ctx: EngineCtx, a: OrderChoosePosition): void {
  const s = ctx.state;
  if (s.phase.kind !== 'orderOfBusiness') return;
  s.phase.picks[a.playerId] = a.position;
  ctx.emit({ type: 'orderChosen', player: a.playerId, position: a.position });
}

/** Assign the last free position automatically. Returns true once everyone has a position. */
export function normalizeOrder(ctx: EngineCtx): boolean {
  const s = ctx.state;
  const who = currentChooser(s);
  const free = freePositions(s);
  if (who && free.length === 1) applyOrder(ctx, { type: 'order.choosePosition', playerId: who, position: free[0] as number });
  return currentChooser(s) === null;
}

/** Fix the new turn order (bankrupt chains last, in their old order). */
export function finishOrder(ctx: EngineCtx): void {
  const s = ctx.state;
  if (s.phase.kind !== 'orderOfBusiness') return;
  const picks = s.phase.picks;
  const chosen = s.phase.queue.slice().sort((a, b) => (picks[a] ?? 0) - (picks[b] ?? 0));
  const rest = s.turnOrder.filter((id) => !chosen.includes(id));
  s.turnOrder = [...chosen, ...rest];
  ctx.emit({ type: 'turnOrderSet', turnOrder: [...s.turnOrder] });
}
