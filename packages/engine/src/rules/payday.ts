/**
 * Phase 5 — Payday (base.md §8; DLX p29).
 *
 * 1. Firing: all players decide **simultaneously** (`payday.fire` any number of times, then
 *    `payday.confirm`). Cards at work or on the beach may be fired; busy marketeers and the CEO
 *    may not. A firing decision cannot affect another player's salaries, so each submission is
 *    applied at once; salaries are settled only when everyone has confirmed.
 * 2. Salaries: $5 per owned salaried card — structure, beach and busy marketeers.
 * 3. Mandatory discounts: $5 per unused recruiting-manager / HR-director recruit action, $15 with
 *    "First to Train", no marketeer salaries with "First Billboard". Minimum $0.
 * 4. Can't pay: fire salaried cards until the rest is payable (`forcedFire` choice). A busy
 *    marketeer may be fired only when no other salaried card is left; its campaign stays.
 * 5. "First to Pay $20 or More": awarded on the amount actually paid.
 * Intro game: no Payday.
 */
import type { EmployeeDef } from '../types/content.js';
import type { ContentIndex, HookContext, SalaryBreakdown } from '../types/module.js';
import type { GameState, Ok, PaydayConfirm, PaydayFire, PlayerId, PlayerState, Rejected, Uid } from '../types/index.js';
import { payToBank } from './bank.js';
import { onMilestoneEvent } from './milestones.js';
import { cardsAtWork, hasMilestone, runPipeline, staticContent } from './pricing.js';

/** Base salary per salaried card (base.md §8.2). */
export const SALARY = 5;
/** First Billboard waives these salaries (milestones.md first_billboard (a)). */
const BILLBOARD_WAIVED: readonly string[] = ['campaign_manager', 'brand_manager', 'brand_director'];

// ---------------------------------------------------------------------------
// Salary computation
// ---------------------------------------------------------------------------

/** Does this owned card cost salary this Payday? */
export function isSalaried(s: GameState, content: ContentIndex, player: PlayerId, uid: Uid): boolean {
  const p = s.players[player];
  const card = p?.employees[uid];
  if (!p || !card || card.salaryFree) return false;
  const def: EmployeeDef | undefined = content.employees[card.employeeId];
  if (!def?.salary) return false;
  if (BILLBOARD_WAIVED.includes(card.employeeId) && hasMilestone(s, player, 'first_billboard')) return false;
  // base.md §6.4: the marketeer of an eternal campaign has no salary (DLX p20), whatever its type.
  if ((p.busy[uid] ?? []).some((cid) => s.board.campaigns[cid]?.eternal)) return false;
  return true;
}

export function salariedCards(s: GameState, content: ContentIndex, player: PlayerId): Uid[] {
  const p = s.players[player];
  if (!p) return [];
  return Object.keys(p.employees).filter((uid) => isSalaried(s, content, player, uid));
}

/** Gross salary, mandatory discounts, total (≥ 0). Runs the `salaryTotal` pipeline when `ctx` is given. */
export function salaryBreakdown(s: GameState, content: ContentIndex, player: PlayerId, ctx?: HookContext): SalaryBreakdown {
  const p = s.players[player] as PlayerState;
  const salaried = salariedCards(s, content, player).length;
  const discounts: SalaryBreakdown['discounts'] = [];
  // Q-B9: recorded during Working; kept even if the recruiting manager is fired in step 1.
  if (p.unusedRecruitActions > 0) discounts.push({ source: 'recruiting', amount: p.unusedRecruitActions * 5 });
  if (hasMilestone(s, player, 'first_train')) discounts.push({ source: 'first_train', amount: 15 });
  const gross = salaried * SALARY;
  const off = discounts.reduce((a, d) => a + d.amount, 0);
  const bd: SalaryBreakdown = { player, salaried, rate: SALARY, discounts, total: Math.max(0, gross - off) };
  return ctx ? runPipeline(ctx, 'salaryTotal', bd, { player }) : bd;
}

// ---------------------------------------------------------------------------
// Phase flow
// ---------------------------------------------------------------------------

/** Phase 5 entry: compute salaries/discounts, set who must decide (simultaneous firing). */
export function enterPayday(ctx: HookContext): void {
  const s = ctx.state;
  const queue = s.turnOrder.filter((id) => s.players[id] && !s.players[id]?.bankrupt);
  for (const id of queue) (s.players[id] as PlayerState).salaryPaidThisRound = 0;
  s.phase = { kind: 'payday', queue, idx: 0, decided: [] };
  if (s.config.intro) {
    // base.md §13: no salaries in the intro game.
    s.phase = { kind: 'payday', queue, idx: queue.length, decided: [...queue] };
    s.awaiting = { kind: 'none', players: [] };
    return;
  }
  // Q-B6: "First to Have $100" — an owned CFO must be fired, at this Payday's firing step.
  for (const id of queue) {
    if (!hasMilestone(s, id, 'first_100')) continue;
    const p = s.players[id] as PlayerState;
    for (const [uid, card] of Object.entries(p.employees)) {
      if (ctx.content.employees[card.employeeId]?.ability.kind === 'cfo' && !p.busy[uid]) fireCard(ctx, id, uid, true);
    }
  }
  // Players with nothing they could fire have nothing to decide.
  const decided = queue.filter((id) => voluntarilyFireable(s.players[id] as PlayerState).length === 0);
  s.phase = { kind: 'payday', queue, idx: 0, decided };
  advance(ctx);
}

/** Cards a player may fire voluntarily: at work or on the beach, never the CEO or a busy marketeer. */
export function voluntarilyFireable(p: PlayerState): Uid[] {
  return [...cardsAtWork(p).filter((u) => u !== p.structure.ceo), ...p.beach];
}

export function validatePaydayAction(state: GameState, action: PaydayFire | PaydayConfirm): Ok | Rejected {
  const ph = state.phase;
  if (ph.kind !== 'payday') return rej('WRONG_PHASE', 'Not in Payday');
  const p = state.players[action.playerId];
  if (!p) return rej('INVALID_PAYLOAD', 'Unknown player');
  const head = state.pending[0];
  const forced = head?.kind === 'forcedFire' ? head : null;

  if (forced) {
    if (forced.player !== action.playerId) return rej('NOT_YOUR_TURN', 'Another player must fire employees first');
    if (action.type !== 'payday.fire') return rej('ILLEGAL', 'You cannot pay your salaries: fire salaried employees');
    return validateForcedFire(state, staticContent(state), action);
  }
  const decided = ph.decided ?? [];
  if (!ph.queue.includes(action.playerId) || decided.includes(action.playerId)) {
    return rej('ALREADY_SUBMITTED', 'Firing decision already made');
  }
  if (action.type === 'payday.confirm') return { ok: true };
  const allowed = new Set(voluntarilyFireable(p));
  if (!Array.isArray(action.uids) || action.uids.length === 0) return rej('INVALID_PAYLOAD', 'No cards to fire');
  if (new Set(action.uids).size !== action.uids.length) return rej('INVALID_PAYLOAD', 'Duplicate card');
  for (const uid of action.uids) {
    if (!p.employees[uid]) return rej('NOT_OWNED', `Card ${uid} not owned`);
    if (uid === p.structure.ceo) return rej('ILLEGAL', 'The CEO cannot be fired');
    if (p.busy[uid]) return rej('CARD_UNAVAILABLE', 'Busy marketeers cannot be fired voluntarily');
    if (!allowed.has(uid)) return rej('CARD_UNAVAILABLE', `Card ${uid} cannot be fired`);
  }
  return { ok: true };
}

/**
 * Forced firing: only salaried cards; a busy marketeer only once no other salaried card is left;
 * stop as soon as the rest is payable (every card but the last must still leave it unpayable).
 */
function validateForcedFire(state: GameState, content: ContentIndex, action: PaydayFire): Ok | Rejected {
  const player = action.playerId;
  const p = state.players[player] as PlayerState;
  if (!Array.isArray(action.uids) || action.uids.length === 0) return rej('INVALID_PAYLOAD', 'No cards to fire');
  if (new Set(action.uids).size !== action.uids.length) return rej('INVALID_PAYLOAD', 'Duplicate card');
  const salaried = new Set(salariedCards(state, content, player));
  const disc = salaryBreakdown(state, content, player);
  const off = disc.discounts.reduce((a, d) => a + d.amount, 0);
  const owed = (n: number) => Math.max(0, n * disc.rate - off);
  let remaining = salaried.size;
  for (let i = 0; i < action.uids.length; i++) {
    const uid = action.uids[i] as Uid;
    if (!p.employees[uid]) return rej('NOT_OWNED', `Card ${uid} not owned`);
    if (!salaried.has(uid)) return rej('ILLEGAL', 'Only salaried employees can be fired to cover salaries');
    if (p.busy[uid] && [...salaried].some((u) => !p.busy[u])) {
      return rej('ILLEGAL', 'A busy marketeer can only be fired when no other salaried employee is left');
    }
    if (owed(remaining) <= p.cash) return rej('ILLEGAL', 'You can already pay; fire no more employees');
    salaried.delete(uid);
    remaining -= 1;
  }
  return { ok: true };
}

export function applyPaydayAction(ctx: HookContext, action: PaydayFire | PaydayConfirm): void {
  const s = ctx.state;
  const ph = s.phase;
  if (ph.kind !== 'payday') return;
  const head = s.pending[0];
  if (head?.kind === 'forcedFire' && head.player === action.playerId && action.type === 'payday.fire') {
    for (const uid of action.uids) fireCard(ctx, action.playerId, uid, true);
    const bd = salaryBreakdown(s, ctx.content, action.playerId, ctx);
    const p = s.players[action.playerId] as PlayerState;
    if (bd.total <= p.cash || salariedCards(s, ctx.content, action.playerId).length === 0) {
      s.pending.shift();
      ctx.emit({ type: 'choiceResolved', choiceId: head.id, declined: false });
    } else {
      head.owed = bd.total;
    }
    advance(ctx);
    return;
  }
  if (action.type === 'payday.fire') {
    for (const uid of action.uids) fireCard(ctx, action.playerId, uid, false);
    advance(ctx);
    return;
  }
  const decided = (ph.decided ??= []);
  if (!decided.includes(action.playerId)) decided.push(action.playerId);
  advance(ctx);
}

/** True when every player has confirmed and salaries are settled. */
export function isPaydayComplete(state: GameState): boolean {
  const ph = state.phase;
  if (ph.kind !== 'payday') return true;
  return (ph.decided ?? []).length >= ph.queue.length && ph.idx >= ph.queue.length && !state.pending.some((c) => c.kind === 'forcedFire');
}

/** Settle salaries in turn order once everyone has decided; otherwise wait for the undecided. */
function advance(ctx: HookContext): void {
  const s = ctx.state;
  const ph = s.phase;
  if (ph.kind !== 'payday') return;
  const decided = ph.decided ?? [];
  const undecided = ph.queue.filter((id) => !decided.includes(id));
  if (undecided.length) {
    s.awaiting = { kind: 'payday.fire', players: undecided };
    return;
  }
  if (s.pending[0]?.kind === 'forcedFire') {
    s.awaiting = { kind: 'choice', players: [s.pending[0].player] };
    return;
  }
  while (ph.idx < ph.queue.length) {
    const player = ph.queue[ph.idx] as PlayerId;
    const p = s.players[player] as PlayerState;
    const bd = salaryBreakdown(s, ctx.content, player, ctx);
    if (bd.total > p.cash && salariedCards(s, ctx.content, player).length > 0) {
      const id = ctx.id('choice');
      s.pending.unshift({ id, kind: 'forcedFire', player, owed: bd.total, optional: false });
      ctx.emit({ type: 'choicePending', choiceId: id, kind: 'forcedFire', player });
      s.awaiting = { kind: 'choice', players: [player] };
      return;
    }
    const paid = Math.min(bd.total, Math.max(0, p.cash));
    const gross = bd.salaried * bd.rate;
    payToBank(ctx, player, paid, 'salaries');
    p.salaryPaidThisRound = paid;
    const ev = { type: 'salaryPaid' as const, player, gross, discounts: Math.max(0, gross - bd.total), paid };
    ctx.emit(ev);
    onMilestoneEvent(ctx, ev);
    ph.idx += 1;
  }
  s.awaiting = { kind: 'none', players: [] };
}

/** Return a card to the supply. A fired busy marketeer's campaign stays and runs out normally. */
export function fireCard(ctx: HookContext, player: PlayerId, uid: Uid, forced: boolean): void {
  const s = ctx.state;
  const p = s.players[player];
  const card = p?.employees[uid];
  if (!p || !card || uid === p.structure.ceo) return;
  const st = p.structure;
  st.ceoSubs = st.ceoSubs.filter((u) => u !== uid);
  const orphans = st.managerSubs[uid] ?? [];
  delete st.managerSubs[uid];
  // A fired manager's reports stay owned; with no manager they wait on the beach until Clean up.
  p.beach.push(...orphans);
  for (const [mgr, subs] of Object.entries(st.managerSubs)) st.managerSubs[mgr] = subs.filter((u) => u !== uid);
  p.beach = p.beach.filter((u) => u !== uid);
  for (const cid of p.busy[uid] ?? []) {
    const camp = s.board.campaigns[cid];
    if (camp) camp.marketeer = null;
  }
  delete p.busy[uid];
  delete p.employees[uid];
  if (s.supply[card.employeeId] !== undefined) s.supply[card.employeeId] = (s.supply[card.employeeId] ?? 0) + 1;
  ctx.emit({ type: 'employeeFired', player, uid, employeeId: card.employeeId, forced });
}

function rej(code: Rejected['code'], message: string): Rejected {
  return { ok: false, code, message };
}
