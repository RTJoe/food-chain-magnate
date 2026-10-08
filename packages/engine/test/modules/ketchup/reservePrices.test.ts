/**
 * Reserve Prices (ketchup.md §14; KX p16; DLX p28).
 */
import { describe, expect, it } from 'vitest';
import { derivePrompt, legalActions, redactFor, type Corner, type PlayerId, type ReserveCard } from '../../../src/index.js';
import { basePriceFromReserves, PRICE_RESERVES } from '../../../src/modules/ketchup/reservePrices.js';
import { payFromBank } from '../../../src/rules/bank.js';
import { runDinnertime } from '../../../src/rules/dinnertime.js';
import { reserveOptions } from '../../../src/rules/setup.js';
import { act, newGame, rejected, reserve, SPOTS } from '../../helpers/game.js';
import { kb, kctx, type KCtx } from './helpers.js';

const M = ['ketchup:reservePrices'] as const;
const P = (basePrice: 5 | 10 | 20): ReserveCard => ({ kind: 'price', amount: 200, basePrice });
const std = (amount: 100 | 200 | 300): ReserveCard => ({ kind: 'standard', amount, ceoSlots: (amount / 100 + 1) as 2 | 3 | 4 });

/** Build a game on MAP where the bank is nearly empty, with the given reserve cards chosen. */
function nearBreak(cards: ReserveCard[], cash = 10): KCtx {
  let b = kb(cards.length, [...M]).bank({ cash }).phase({ kind: 'dinnertime', houses: [], idx: 0 });
  cards.forEach((c, i) => {
    b = b.reserve(`p${i + 1}`, c);
  });
  return kctx(b.build());
}

describe('Reserve Prices - reserve cards (ketchup.md §14)', () => {
  it('§14: the options are the three $200 price cards ($5, $10, $20), replacing the base cards', () => {
    const s = newGame(2, 1, undefined, { modules: [...M] });
    expect(reserveOptions(s)).toEqual([P(5), P(10), P(20)]);
    expect(PRICE_RESERVES.every((c) => c.kind === 'price' && c.amount === 200)).toBe(true);
    expect(reserveOptions(newGame(2))).toHaveLength(3);
    expect(reserveOptions(newGame(2)).every((c) => c.kind === 'standard')).toBe(true);
  });

  it('§14: a price card is chosen at setup as usual; a base reserve card is refused', () => {
    let s = newGame(2, 1, undefined, { modules: [...M] });
    let i = 0;
    while (s.phase.kind === 'setup.restaurants') {
      const [x, y, entrance] = SPOTS[i++] as [number, number, Corner];
      s = act(s, { type: 'setup.placeRestaurant', playerId: s.awaiting.players[0] as PlayerId, x, y, entrance });
    }
    expect(s.phase.kind).toBe('setup.reserve');
    // The view-based prompt offers the same cards the engine accepts (C7 fix: it used to show base cards).
    const who = s.awaiting.players[0] as PlayerId;
    expect(derivePrompt(redactFor(s, who), who)).toMatchObject({ kind: 'chooseReserve', options: [P(5), P(10), P(20)] });
    expect(rejected(s, { type: 'setup.chooseReserve', playerId: 'p1', card: reserve(100) }).code).toBe('INVALID_PAYLOAD');
    expect(legalActions(s, 'p1').map((l) => l.label)).toEqual(['Reserve card: base price $5 (+$200)', 'Reserve card: base price $10 (+$200)', 'Reserve card: base price $20 (+$200)']);
    s = act(s, { type: 'setup.chooseReserve', playerId: 'p1', card: P(20) });
    expect(s.secrets.p1?.reserve).toEqual(P(20));
  });
});

describe('Reserve Prices - first bank break (ketchup.md §14)', () => {
  it('§14: the first break adds $200 per player; the revealed cards are tucked under the CEOs', () => {
    const ctx = nearBreak([P(5), P(20)]);
    payFromBank(ctx, 'p1', 25, 'sale');
    // $10 from the bank, refill 2 x $200, then the remaining $15.
    expect(ctx.state.bank).toMatchObject({ breaks: 1, cash: 385, reserveOpened: true });
    expect(ctx.of('bankBroke')[0]).toMatchObject({ breakNo: 1, added: 400 });
    expect(ctx.state.players.p2?.reserveCard).toEqual(P(20));
  });

  it('§14: three players add $600', () => {
    const ctx = nearBreak([P(10), P(10), P(5)]);
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.of('bankBroke')[0]?.added).toBe(600);
  });

  it('§14: CEO slots do not change (price cards carry no slot number)', () => {
    const ctx = nearBreak([P(5), P(20), P(10)]);
    const before = ctx.state.ceoSlots;
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.state.ceoSlots).toBe(before);
    expect(ctx.of('bankBroke')[0]?.ceoSlots).toBe(before);
  });

  it('§14: the new base price is the most frequent revealed price', () => {
    const ctx = nearBreak([P(5), P(5), P(20)]);
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.state.basePrice).toBe(5);
    // KX p28: the bankBroke event carries the new price, not the old $10.
    expect(ctx.of('bankBroke')[0]?.basePrice).toBe(5);
    const ctx2 = nearBreak([P(10), P(20), P(20)]);
    payFromBank(ctx2, 'p1', 10, 'sale');
    expect(ctx2.state.basePrice).toBe(20);
  });

  it('§14: ties - $20 beats $10 and $5 ($5/$20 tie gives $20)', () => {
    const ctx = nearBreak([P(5), P(20)]);
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.state.basePrice).toBe(20);
    const ctx2 = nearBreak([P(10), P(20)]);
    payFromBank(ctx2, 'p1', 10, 'sale');
    expect(ctx2.state.basePrice).toBe(20);
  });

  it('§14: ties - $5 beats $10', () => {
    const ctx = nearBreak([P(5), P(10)]);
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.state.basePrice).toBe(5);
  });

  it('§14: before the first break the base price stays $10', () => {
    const ctx = nearBreak([P(5), P(5)], 1000);
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.state.basePrice).toBe(10);
    expect(ctx.of('bankBroke')).toHaveLength(0);
  });

  it('§14: the second break does not change the base price again', () => {
    const ctx = nearBreak([P(5), P(5)]);
    payFromBank(ctx, 'p1', 10, 'sale');
    expect(ctx.state.basePrice).toBe(5);
    payFromBank(ctx, 'p1', ctx.state.bank.cash, 'sale');
    expect(ctx.of('bankBroke').map((e) => e.breakNo)).toEqual([1, 2]);
    expect(ctx.state.basePrice).toBe(5);
  });
});

describe('basePriceFromReserves (ketchup.md §14)', () => {
  it('§14: most frequent price wins', () => {
    expect(basePriceFromReserves([P(10), P(10), P(20), P(5)])).toBe(10);
    expect(basePriceFromReserves([P(5), P(20), P(5)])).toBe(5);
  });

  it('§14: tie preference is $20 > $5 > $10 regardless of order', () => {
    for (const cards of [[P(5), P(20)], [P(20), P(5)], [P(10), P(20)], [P(20), P(10)], [P(5), P(10), P(20)]]) {
      expect(basePriceFromReserves(cards)).toBe(20);
    }
    expect(basePriceFromReserves([P(5), P(10)])).toBe(5);
    expect(basePriceFromReserves([P(10), P(5)])).toBe(5);
    expect(basePriceFromReserves([P(10), P(10), P(5), P(5)])).toBe(5);
  });

  it('§14: null when no price card is revealed (standard cards only)', () => {
    expect(basePriceFromReserves([])).toBeNull();
    expect(basePriceFromReserves([std(100), std(200)])).toBeNull();
    expect(basePriceFromReserves([std(100), P(10)])).toBe(10);
  });
});

describe('Reserve Prices - Dinnertime (ketchup.md §14)', () => {
  it('§14: Dinnertime uses the new base price (modifiers apply on top)', () => {
    const b = kb(2, [...M])
      .bank({ cash: 10 })
      .restaurant('p1', 3, 3, 'NW')
      .inventory('p1', { burger: 2 })
      .reserve('p1', P(5))
      .reserve('p2', P(20))
      .demand(2, ['burger']);
    const ctx = kctx(b.phase({ kind: 'dinnertime', houses: [], idx: 0 }).build());
    payFromBank(ctx, 'p2', 10, 'break');
    expect(ctx.state.basePrice).toBe(20);
    runDinnertime(ctx);
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', unitPrice: 20, total: 20 });
  });

  it('§14: a $5 base price sells burgers at $5', () => {
    const b = kb(2, [...M]).bank({ cash: 10 }).restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 2 })
      .reserve('p1', P(5)).reserve('p2', P(5)).demand(2, ['burger']);
    const ctx = kctx(b.phase({ kind: 'dinnertime', houses: [], idx: 0 }).build());
    payFromBank(ctx, 'p2', 10, 'break');
    runDinnertime(ctx);
    expect(ctx.of('sale')[0]).toMatchObject({ unitPrice: 5, total: 5 });
  });

  it('§14: a pricing manager still applies on top of the new base price', () => {
    const b = kb(2, [...M]).bank({ cash: 10 }).restaurant('p1', 3, 3, 'NW').card('p1', 'pricing_manager', 'work').inventory('p1', { burger: 2 })
      .reserve('p1', P(20)).reserve('p2', P(20)).demand(2, ['burger']);
    const ctx = kctx(b.phase({ kind: 'dinnertime', houses: [], idx: 0 }).build());
    payFromBank(ctx, 'p2', 10, 'break');
    runDinnertime(ctx);
    expect(ctx.of('sale')[0]).toMatchObject({ unitPrice: 18, total: 18 });
  });
});
