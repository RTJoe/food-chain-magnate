/**
 * The bank (base.md §12, §13; DLX p28, p33).
 *
 * - The bank breaks when a payment leaves it at $0 (DLX p28: "$0 remaining").
 * - First break: reveal every reserve card, add their total, set CEO slots to the most common
 *   slot number among them (tie → highest), keep paying.
 * - Second break (intro game: first break): no refill; all further income is paid as IOUs
 *   (credited to cash, recorded in `bank.ious`). The game ends after this Dinnertime.
 */
import type { HookContext } from '../types/module.js';
import type { GameState, PlayerId, ReserveCard } from '../types/state.js';

/** Pay a player from the bank, handling first break (reserve) and second break (game end flag). */
export function payFromBank(ctx: HookContext, playerId: PlayerId, amount: number, reason: string): void {
  const s = ctx.state;
  const p = s.players[playerId];
  if (!p) throw new Error(`payFromBank: unknown player ${playerId}`);
  if (amount < 0) return payToBank(ctx, playerId, -amount, reason);
  if (amount === 0) return;
  let left = amount;
  let paid = 0;
  let iou = 0;
  while (left > 0) {
    if (isFinalBreak(s)) {
      iou += left;
      left = 0;
      break;
    }
    const take = Math.min(left, s.bank.cash);
    s.bank.cash -= take;
    paid += take;
    left -= take;
    if (s.bank.cash <= 0) breakBank(ctx);
  }
  p.cash += paid + iou;
  if (paid > 0) ctx.emit({ type: 'cashChanged', player: playerId, delta: paid, reason, bank: s.bank.cash });
  if (iou > 0) {
    s.bank.ious[playerId] = (s.bank.ious[playerId] ?? 0) + iou;
    ctx.emit({ type: 'iouIssued', player: playerId, amount: iou });
    ctx.emit({ type: 'cashChanged', player: playerId, delta: iou, reason: `${reason} (IOU)`, bank: s.bank.cash });
  }
}

/**
 * Pay the bank from a player (salaries etc.). A player who cannot pay in full pays what they have
 * and goes bankrupt (base.md §12, JD 1473813). Payday makes sure salaries are payable first.
 */
export function payToBank(ctx: HookContext, playerId: PlayerId, amount: number, reason: string): void {
  const s = ctx.state;
  const p = s.players[playerId];
  if (!p) throw new Error(`payToBank: unknown player ${playerId}`);
  if (amount < 0) return payFromBank(ctx, playerId, -amount, reason);
  if (amount === 0) return;
  const paid = Math.min(amount, Math.max(0, p.cash));
  p.cash -= paid;
  s.bank.cash += paid;
  ctx.emit({ type: 'cashChanged', player: playerId, delta: -paid, reason, bank: s.bank.cash });
  if (paid < amount && !p.bankrupt) {
    p.bankrupt = true;
    ctx.emit({ type: 'bankrupt', player: playerId });
  }
}

/**
 * Remove money from the bank, out of the game (Ketchup "First discount manager used"). Taking the
 * bank to $0 breaks it like a payment would (base.md §12). Returns the amount removed.
 */
export function burnFromBank(ctx: HookContext, playerId: PlayerId, amount: number): number {
  const s = ctx.state;
  if (amount <= 0 || isFinalBreak(s)) return 0;
  const take = Math.min(amount, s.bank.cash);
  s.bank.cash -= take;
  s.bank.burned += take;
  ctx.emit({ type: 'bankBurned', player: playerId, amount: take });
  if (s.bank.cash <= 0) breakBank(ctx);
  return take;
}

/** True once no more money can come out of the bank: second break, or first break in the intro game. */
export function isFinalBreak(s: GameState): boolean {
  return s.config.intro ? s.bank.breaks >= 1 : s.bank.breaks >= 2;
}

/** The bank just reached $0. */
function breakBank(ctx: HookContext): void {
  const s = ctx.state;
  if (isFinalBreak(s)) return;
  if (s.bank.breaks === 0 && !s.config.intro) {
    s.bank.breaks = 1;
    const reserves: Record<PlayerId, ReserveCard> = {};
    let added = 0;
    for (const id of s.turnOrder) {
      const card = s.secrets[id]?.reserve ?? null;
      const p = s.players[id];
      if (!card || !p) continue;
      reserves[id] = card;
      p.reserveCard = { ...card };
      added += card.amount;
    }
    s.bank.cash += added;
    s.bank.reserveOpened = true;
    const slots = ceoSlotsFromReserves(Object.values(reserves));
    if (slots !== null) s.ceoSlots = slots;
    ctx.emit({ type: 'bankBroke', breakNo: 1, reserves, added, ceoSlots: s.ceoSlots, basePrice: s.basePrice });
    return;
  }
  // Second break (or the intro game's only break): no refill, game ends after this Dinnertime.
  s.bank.breaks = s.config.intro ? 1 : 2;
  ctx.emit({ type: 'bankBroke', breakNo: s.config.intro ? 1 : 2, added: 0, ceoSlots: s.ceoSlots, basePrice: s.basePrice });
}

/**
 * base.md §12: the slot number that occurs most often among the revealed cards; tie → highest.
 * Null when no standard card was revealed (CEO slots unchanged).
 */
export function ceoSlotsFromReserves(cards: ReserveCard[]): number | null {
  const counts = new Map<number, number>();
  for (const c of cards) if (c.kind === 'standard') counts.set(c.ceoSlots, (counts.get(c.ceoSlots) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [slots, n] of counts) {
    if (n > bestCount || (n === bestCount && best !== null && slots > best)) {
      best = slots;
      bestCount = n;
    }
  }
  return best;
}

/** base.md §12: most cash (incl. IOUs) wins; tie → earlier in turn order. Bankrupt chains last. */
export function rankPlayers(s: GameState): PlayerId[] {
  const pos = (id: PlayerId) => s.turnOrder.indexOf(id);
  const alive = s.turnOrder.filter((id) => !s.players[id]?.bankrupt);
  const out = s.turnOrder.filter((id) => s.players[id]?.bankrupt);
  alive.sort((a, b) => (s.players[b]?.cash ?? 0) - (s.players[a]?.cash ?? 0) || pos(a) - pos(b));
  return [...alive, ...out];
}

/** Move to `gameOver` and emit `gameEnded`. */
export function endGame(ctx: HookContext, reason: 'bankBroke' | 'allBankrupt'): void {
  const s = ctx.state;
  const ranking = rankPlayers(s);
  const from = s.phase ? s.phase.kind : null;
  s.phase = { kind: 'gameOver', ranking, reason };
  ctx.emit({ type: 'phaseChanged', from, to: { kind: 'gameOver', ranking: [...ranking], reason } });
  s.awaiting = { kind: 'none', players: [] };
  s.pending = [];
  const cash: Record<PlayerId, number> = {};
  for (const id of s.turnOrder) cash[id] = s.players[id]?.cash ?? 0;
  ctx.emit({ type: 'gameEnded', ranking, cash });
}

/** End of Dinnertime: the game ends if the bank broke for the last time (base.md §12, §13). */
export function endGameIfBankBroken(ctx: HookContext): boolean {
  if (!isFinalBreak(ctx.state)) return false;
  endGame(ctx, 'bankBroke');
  return true;
}
