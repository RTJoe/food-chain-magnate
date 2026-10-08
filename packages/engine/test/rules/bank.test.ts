/**
 * The bank (base.md §12, §13; DLX p28, p33). Unit tests of rules/bank.ts; whole-Dinnertime bank
 * scenarios are in dinnertime.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type StateBuilder } from '../../src/testing/index.js';
import { burnFromBank, ceoSlotsFromReserves, endGameIfBankBroken, isFinalBreak, payFromBank, payToBank, rankPlayers } from '../../src/rules/bank.js';
import type { ReserveCard } from '../../src/types/index.js';
import { MAP, makeCtx, type TestCtx } from './c2ctx.js';

const R = (amount: 100 | 200 | 300): ReserveCard => ({ kind: 'standard', amount, ceoSlots: (amount / 100 + 1) as 2 | 3 | 4 });

function base(players = 2, intro = false): StateBuilder {
  return stateBuilder({ players, intro }).tiles(MAP).round(4).phase({ kind: 'dinnertime', houses: [], idx: 0 });
}

const ctxOf = (b: StateBuilder): TestCtx => makeCtx(b.build());

describe('burning money (Ketchup First discount manager used, KX p19)', () => {
  it('KX p19 + DLX p28 step 4: a $100 burn from a $60 bank breaks it and takes the other $40 from the refill', () => {
    const ctx = ctxOf(base().bank({ cash: 60 }).reserve('p1', R(300)).reserve('p2', R(300)));
    expect(burnFromBank(ctx, 'p1', 100)).toBe(100);
    expect(ctx.state.bank).toMatchObject({ cash: 560, breaks: 1, burned: 100 });
    expect(ctx.of('bankBurned')).toEqual([{ type: 'bankBurned', player: 'p1', amount: 100 }]);
  });

  it('the final break stops a burn', () => {
    const ctx = ctxOf(base(2, true).bank({ cash: 60 }));
    expect(burnFromBank(ctx, 'p1', 100)).toBe(60);
    expect(ctx.state.bank).toMatchObject({ cash: 0, breaks: 1, burned: 60 });
  });
});

describe('paying out (base.md §12)', () => {
  it('a payment that leaves money in the bank is a plain transfer', () => {
    const ctx = ctxOf(base().bank({ cash: 50 }));
    payFromBank(ctx, 'p1', 20, 'sale');
    expect(ctx.state.bank).toMatchObject({ cash: 30, breaks: 0 });
    expect(ctx.state.players.p1?.cash).toBe(20);
    expect(ctx.of('cashChanged')[0]).toMatchObject({ player: 'p1', delta: 20, bank: 30 });
    expect(ctx.of('bankBroke')).toHaveLength(0);
  });

  it('DLX p28: reaching exactly $0 breaks the bank', () => {
    const ctx = ctxOf(base().bank({ cash: 20 }).reserve('p1', R(100)).reserve('p2', R(100)));
    payFromBank(ctx, 'p1', 20, 'sale');
    expect(ctx.state.bank).toMatchObject({ breaks: 1, cash: 200, reserveOpened: true });
    expect(ctx.state.players.p1?.cash).toBe(20);
  });

  it('first break: every reserve card is revealed, its money added, CEO slots set and the card tucked under each CEO', () => {
    const ctx = ctxOf(base(3).bank({ cash: 10 }).reserve('p1', R(300)).reserve('p2', R(100)).reserve('p3', R(100)));
    payFromBank(ctx, 'p2', 25, 'sale');
    // $10 from the bank, refill $500, then the remaining $15.
    expect(ctx.state.players.p2?.cash).toBe(25);
    expect(ctx.state.bank.cash).toBe(485);
    expect(ctx.state.ceoSlots).toBe(2);
    expect(ctx.state.players.p1?.reserveCard).toEqual(R(300));
    expect(ctx.state.players.p3?.reserveCard).toEqual(R(100));
    expect(ctx.of('bankBroke')).toEqual([
      expect.objectContaining({ breakNo: 1, added: 500, ceoSlots: 2, reserves: { p1: R(300), p2: R(100), p3: R(100) } }),
    ]);
    expect(isFinalBreak(ctx.state)).toBe(false);
    expect(endGameIfBankBroken(ctx)).toBe(false);
  });

  it('second break: no refill; everything still owed is paid as IOUs and the game ends after Dinnertime', () => {
    const ctx = ctxOf(base().bank({ cash: 8, breaks: 1, reserveOpened: true }).cash('p1', 30).cash('p2', 40));
    payFromBank(ctx, 'p1', 20, 'sale');
    expect(ctx.state.bank).toMatchObject({ cash: 0, breaks: 2, ious: { p1: 12 } });
    expect(ctx.state.players.p1?.cash).toBe(50);
    payFromBank(ctx, 'p2', 10, 'tips');
    expect(ctx.state.bank.ious).toEqual({ p1: 12, p2: 10 });
    expect(ctx.of('iouIssued').map((e) => e.amount)).toEqual([12, 10]);
    expect(ctx.of('bankBroke')).toEqual([expect.objectContaining({ breakNo: 2, added: 0 })]);
    expect(isFinalBreak(ctx.state)).toBe(true);
    expect(endGameIfBankBroken(ctx)).toBe(true);
    // Most cash incl. IOUs wins.
    expect(ctx.state.phase).toEqual({ kind: 'gameOver', ranking: ['p1', 'p2'], reason: 'bankBroke' });
    expect(ctx.of('gameEnded')[0]).toMatchObject({ cash: { p1: 50, p2: 50 }, winner: 'p1' });
  });

  it('both breaks inside one payment: refill, empty again, rest as IOU', () => {
    const ctx = ctxOf(base().bank({ cash: 5 }).reserve('p1', R(100)).reserve('p2', R(100)));
    payFromBank(ctx, 'p1', 300, 'sale');
    expect(ctx.state.bank).toMatchObject({ cash: 0, breaks: 2, ious: { p1: 95 } });
    expect(ctx.state.players.p1?.cash).toBe(300);
    expect(ctx.of('bankBroke').map((e) => e.breakNo)).toEqual([1, 2]);
  });

  it('§13 intro game: the first break is final — no reserves, CEO slots unchanged, IOUs', () => {
    const ctx = ctxOf(base(2, true).bank({ cash: 5 }));
    payFromBank(ctx, 'p1', 8, 'sale');
    expect(ctx.state.bank).toMatchObject({ cash: 0, breaks: 1, reserveOpened: false, ious: { p1: 3 } });
    expect(ctx.state.ceoSlots).toBe(3);
    expect(isFinalBreak(ctx.state)).toBe(true);
    expect(ctx.of('bankBroke')).toEqual([expect.objectContaining({ breakNo: 1, added: 0 })]);
  });

  it('salaries paid back into the bank keep it from breaking (base.md §12)', () => {
    const ctx = ctxOf(base().bank({ cash: 10 }).cash('p1', 30));
    payToBank(ctx, 'p1', 15, 'salaries');
    payFromBank(ctx, 'p2', 20, 'sale');
    expect(ctx.state.bank).toMatchObject({ cash: 5, breaks: 0 });
  });
});

describe('CEO slots from reserve cards (base.md §12; DLX p28)', () => {
  it('the most common slot number wins', () => {
    expect(ceoSlotsFromReserves([R(100), R(100), R(300)])).toBe(2);
    expect(ceoSlotsFromReserves([R(200), R(300), R(200), R(100), R(200)])).toBe(3);
  });

  it('a tie goes to the highest tied number (DLX: two 2s + two 4s → 4)', () => {
    expect(ceoSlotsFromReserves([R(100), R(300), R(100), R(300)])).toBe(4);
    expect(ceoSlotsFromReserves([R(300), R(100), R(100), R(300)])).toBe(4);
    expect(ceoSlotsFromReserves([R(100), R(200), R(300)])).toBe(4);
    expect(ceoSlotsFromReserves([R(100), R(200)])).toBe(3);
  });

  it('no standard cards → unchanged (null); Ketchup price cards carry no slot number', () => {
    expect(ceoSlotsFromReserves([])).toBeNull();
    expect(ceoSlotsFromReserves([{ kind: 'price', amount: 200, basePrice: 5 }])).toBeNull();
  });
});

describe('paying in and bankruptcy (base.md §12, JD 1473813)', () => {
  it('a chain that cannot pay what it owes pays what it has and goes bankrupt', () => {
    const ctx = ctxOf(base().bank({ cash: 10 }).cash('p1', 4));
    payToBank(ctx, 'p1', 6, 'negative price');
    expect(ctx.state.players.p1).toMatchObject({ cash: 0, bankrupt: true });
    expect(ctx.state.bank.cash).toBe(14);
    expect(ctx.of('bankrupt')).toEqual([{ type: 'bankrupt', player: 'p1' }]);
  });

  it('negative amounts flip direction', () => {
    const ctx = ctxOf(base().bank({ cash: 10 }).cash('p1', 4));
    payFromBank(ctx, 'p1', -3, 'x');
    expect(ctx.state.players.p1?.cash).toBe(1);
    payToBank(ctx, 'p1', -5, 'y');
    expect(ctx.state.players.p1?.cash).toBe(6);
  });

  it('ranking: most cash first, tie → earlier in turn order, bankrupt chains last', () => {
    const s = base(3)
      .cash('p1', 40)
      .cash('p2', 50)
      .cash('p3', 50)
      .turnOrder(['p3', 'p1', 'p2'])
      .build();
    expect(rankPlayers(s)).toEqual(['p3', 'p2', 'p1']);
    (s.players.p3 as { bankrupt: boolean }).bankrupt = true;
    expect(rankPlayers(s)).toEqual(['p2', 'p1', 'p3']);
  });
});
