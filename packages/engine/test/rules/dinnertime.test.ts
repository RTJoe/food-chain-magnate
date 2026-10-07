/**
 * Dinnertime scenarios (base.md §7, §12, §13; DLX p26–28). Map: see c2ctx.ts.
 * Restaurant spots used: R0 (3,3) NW on tile (0,0) — 0 borders from house 2;
 * R1 (5,3) NW on tile (0,1) — 1 border from house 2; R2 (8,8) NW on tile (1,1) — 2 borders.
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type StateBuilder } from '../../src/testing/index.js';
import { runDinnertime } from '../../src/rules/dinnertime.js';
import { routeStartOrigin, roadAt } from '../../src/map/pathfinding.js';
import { houseSquares, tileOf } from '../../src/map/grid.js';
import type { Cell, GameEvent, GameState } from '../../src/types/index.js';
import { MAP, makeCtx, type Pipe } from './c2ctx.js';

function base(players = 2, opts: { intro?: boolean } = {}): StateBuilder {
  return stateBuilder({ players, ...opts }).tiles(MAP).round(3);
}

function dine(b: StateBuilder, pipe?: Pipe) {
  const s = b.phase({ kind: 'dinnertime', houses: [], idx: 0 }).build();
  const ctx = makeCtx(s, pipe);
  runDinnertime(ctx);
  return ctx;
}

describe('competition (base.md §7.5–7.7)', () => {
  it('§7.5: lowest unit price + distance wins; distance is tile borders crossed', () => {
    // p1: $10 + 0 borders = 10. p2: $10 − 2 pricing − 1 (First to Lower Prices) = $7 + 1 border = 8.
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 5, 3, 'NW')
        .card('p2', 'pricing_manager', 'work')
        .card('p2', 'pricing_manager', 'work')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger']),
    );
    const [sale] = ctx.of('sale');
    expect(sale).toMatchObject({ player: 'p2', distance: 1, unitPrice: 7, total: 7 });
    expect(ctx.state.players.p2?.cash).toBe(7);
    expect(ctx.state.players.p2?.inventory.burger ?? 0).toBe(0);
    expect(ctx.state.players.p1?.inventory.burger).toBe(1);
  });

  it('§14: distance counts borders, not squares (2 borders from tile (1,1))', () => {
    const ctx = dine(base().restaurant('p1', 8, 8, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger']));
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', distance: 2, total: 10 });
  });

  it('§7.6: tie on price + distance → most waitresses at work wins (beach ignored)', () => {
    // House 10: both restaurants on its tile (distance 0), both $10.
    const ctx = dine(
      base()
        .restaurant('p1', 3, 5, 'NW')
        .restaurant('p2', 3, 8, 'NW')
        .card('p1', 'waitress', 'beach')
        .card('p1', 'waitress', 'beach')
        .card('p2', 'waitress', 'work')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(10, ['burger']),
    );
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', distance: 0 });
  });

  it('§7.7: still tied → earlier in the current turn order wins', () => {
    const make = () =>
      base()
        .restaurant('p1', 3, 5, 'NW')
        .restaurant('p2', 3, 8, 'NW')
        .card('p1', 'waitress', 'work')
        .card('p2', 'waitress', 'work')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(10, ['burger']);
    expect(dine(make()).of('sale')[0]?.player).toBe('p1');
    expect(dine(make().turnOrder(['p2', 'p1'])).of('sale')[0]?.player).toBe('p2');
  });

  it('§7.5–7.6: price and distance trade off ($9 + 1 border = $10 + 0); waitresses only break the exact tie', () => {
    // p2 has First to Lower Prices from an earlier round ($9) but sits 1 border away.
    const make = () =>
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 5, 3, 'NW')
        .milestone('p2', 'first_lower_prices', 2)
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 });
    expect(dine(make().demand(2, ['burger'])).of('sale')[0]).toMatchObject({ player: 'p1', distance: 0, unitPrice: 10 });
    const ctx = dine(make().card('p2', 'waitress', 'work').demand(2, ['burger']));
    // The winner is paid its own unit price, not the score.
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', distance: 1, unitPrice: 9, total: 9 });
    // Two waitresses lose to a strictly better score ($10 − 1 pricing − 1 milestone = $8, + 1 = 9 < 10).
    const ctx2 = dine(make().card('p1', 'waitress', 'work').card('p1', 'waitress', 'work').card('p2', 'pricing_manager', 'work').demand(2, ['burger']));
    expect(ctx2.of('sale')[0]).toMatchObject({ player: 'p2', unitPrice: 8 });
  });

  it('§7.5–7.7 with three chains: score first, then waitresses, then turn order', () => {
    const ctx = dine(
      base(3)
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 3, 5, 'NW')
        .restaurant('p3', 3, 8, 'NW')
        .card('p2', 'waitress', 'work')
        .card('p3', 'waitress', 'work')
        .turnOrder(['p1', 'p3', 'p2'])
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .inventory('p3', { burger: 1 })
        .demand(10, ['burger']),
    );
    // House 10 (tile (1,0)): p1 is 1 border away; p2 and p3 tie at 0 with one waitress each → p3 (earlier).
    expect(ctx.of('houseConsidered')[0]?.candidates.sort()).toEqual(['p1', 'p2', 'p3']);
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p3', distance: 0 });
  });

  it('§7.2: COMING SOON restaurants do not compete', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW', 'comingSoon')
        .restaurant('p2', 8, 8, 'NW')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger']),
    );
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', distance: 2 });
  });

  it('§6.3a: a drive-in measures from the nearest corner', () => {
    // Restaurant (4,3)-(5,4) straddles the x=5 border; entrance NE is on tile (0,1).
    const make = (driveIn: boolean) =>
      base()
        .restaurant('p1', 4, 3, 'NE', 'open', 'r1')
        .mutate((s) => {
          if (driveIn) (s.board.restaurants.r1 as { driveIn?: boolean }).driveIn = true;
        })
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']);
    expect(dine(make(false)).of('sale')[0]?.distance).toBe(1);
    expect(dine(make(true)).of('sale')[0]?.distance).toBe(0);
  });
});

describe('full-order rule (base.md §7.2)', () => {
  it('a chain that cannot deliver every item is not a candidate (no partial sales)', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 8, 8, 'NW')
        .inventory('p1', { burger: 5 })
        .inventory('p2', { burger: 1, beer: 1 })
        .demand(2, ['burger', 'beer']),
    );
    expect(ctx.of('sale')).toHaveLength(1);
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 20 });
    expect(ctx.state.players.p1?.inventory.burger).toBe(5);
  });

  it('no candidate → the house stays home and keeps its demand', () => {
    const ctx = dine(base().restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 2 }).demand(2, ['burger', 'burger', 'beer']));
    expect(ctx.of('sale')).toHaveLength(0);
    expect(ctx.of('houseStayedHome')).toHaveLength(1);
    const house = Object.values(ctx.state.board.houses).find((h) => h.order === 2);
    expect(house?.demand.map((d) => d.good)).toEqual(['burger', 'burger', 'beer']);
  });

  it('houses go in ascending number; later houses see the remaining stock', () => {
    const ctx = dine(base().restaurant('p1', 3, 5, 'NW').inventory('p1', { burger: 1 }).demand(10, ['burger']).demand(2, ['burger']));
    const sales = ctx.of('sale');
    expect(sales).toHaveLength(1);
    expect(ctx.state.board.houses[sales[0]?.houseId as string]?.order).toBe(2);
  });

  it('§10: frozen items are stock and can be sold', () => {
    const ctx = dine(base().restaurant('p1', 3, 3, 'NW').freezer('p1', { burger: 1 }).demand(2, ['burger']));
    expect(ctx.of('sale')).toHaveLength(1);
    expect(ctx.state.players.p1?.freezer.burger ?? 0).toBe(0);
  });
});

describe('selling (base.md §7 "Selling")', () => {
  it('RB p10 example: luxuries, First Burger Marketed, garden: 1 burger + 2 beer = $125 (garden doubles price, not bonus)', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .placedHouse(1, 3, 8, 'S')
        .card('p1', 'luxuries_manager', 'work')
        .milestone('p1', 'first_burger_marketed', 2)
        .milestone('p2', 'first_lower_prices', 1) // already crossed out for p1
        .inventory('p1', { burger: 1, beer: 2 })
        .demand(1, ['burger', 'beer', 'beer']),
    );
    const sale = ctx.of('sale')[0];
    expect(sale?.unitPrice).toBe(20);
    expect(sale?.lines).toEqual(
      expect.arrayContaining([
        { good: 'burger', count: 1, each: 40 },
        { good: 'beer', count: 2, each: 40 },
      ]),
    );
    expect(sale?.bonuses).toEqual([{ source: 'first_burger_marketed', amount: 5 }]);
    expect(sale?.total).toBe(125);
  });

  it('DLX p28 example: pricing manager, garden, First Pizza Marketed, 2 waitresses, CFO → $44', () => {
    const b = base()
      .restaurant('p1', 3, 3, 'NW')
      .placedHouse(1, 3, 8, 'S')
      .card('p1', 'management_trainee', 'work', 'mt')
      .card('p1', 'waitress', { under: 'mt' })
      .card('p1', 'waitress', { under: 'mt' })
      .card('p1', 'pricing_manager', 'work')
      .card('p1', 'cfo', 'work')
      .milestone('p1', 'first_pizza_marketed', 2)
      .milestone('p2', 'first_lower_prices', 1)
      .inventory('p1', { pizza: 1 })
      .demand(1, ['pizza']);
    const ctx = dine(b);
    expect(ctx.of('sale')[0]?.total).toBe(23); // $9 x2 + $5
    expect(ctx.of('tipsPaid')[0]).toMatchObject({ player: 'p1', waitresses: 2, amount: 6 });
    expect(ctx.of('cfoBonus')[0]).toMatchObject({ player: 'p1', amount: 15 }); // 50% of 29, rounded up
    expect(ctx.state.players.p1?.cash).toBe(44);
  });

  it('§7.5: unit price — 2 pricing + 1 discount = $5; luxuries +$10; First to Lower Prices −$1', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 3, 5, 'NW')
        .card('p1', 'pricing_manager', 'work')
        .card('p1', 'pricing_manager', 'work')
        .card('p1', 'discount_manager', 'work')
        .milestone('p2', 'first_lower_prices', 1)
        .card('p2', 'luxuries_manager', 'work')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { pizza: 1 })
        .demand(2, ['burger'])
        .demand(10, ['pizza']),
    );
    const sales = ctx.of('sale');
    expect(sales.find((x) => x.player === 'p1')?.unitPrice).toBe(5);
    // p2 owns First to Lower Prices from round 1: 10 + 10 − 1.
    expect(sales.find((x) => x.player === 'p2')?.unitPrice).toBe(19);
  });

  it('§7.5: no minimum price — a negative price makes the chain pay the bank', () => {
    // 10 − 3×3 (discount) − 2×1 (pricing) − 1 (First to Lower Prices, claimed at start) = −$2.
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .card('p1', 'junior_vp', 'work', 'jvp')
        .card('p1', 'discount_manager', { under: 'jvp' })
        .card('p1', 'discount_manager', { under: 'jvp' })
        .card('p1', 'discount_manager', { under: 'jvp' })
        .card('p1', 'pricing_manager', 'work')
        .card('p1', 'pricing_manager', 'work')
        .cash('p1', 10)
        .bank({ cash: 50 })
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']),
    );
    expect(ctx.of('sale')[0]).toMatchObject({ unitPrice: -2, total: -2 });
    expect(ctx.state.players.p1?.cash).toBe(8);
    expect(ctx.state.bank.cash).toBe(52);
  });

  it('§12 bankruptcy: a chain that cannot pay for a negative-price sale goes bankrupt and sells no more', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 8, 8, 'NW')
        .card('p1', 'junior_vp', 'work', 'jvp')
        .card('p1', 'discount_manager', { under: 'jvp' })
        .card('p1', 'discount_manager', { under: 'jvp' })
        .card('p1', 'discount_manager', { under: 'jvp' })
        .card('p1', 'pricing_manager', 'work')
        .card('p1', 'pricing_manager', 'work')
        .cash('p1', 1)
        .inventory('p1', { burger: 2 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger'])
        .demand(10, ['burger']),
    );
    expect(ctx.state.players.p1?.bankrupt).toBe(true);
    expect(ctx.of('bankrupt')).toEqual([{ type: 'bankrupt', player: 'p1' }]);
    const sales = ctx.of('sale');
    expect(sales.map((x) => x.player)).toEqual(['p1', 'p2']);
  });
});

describe('after the houses (base.md §7)', () => {
  it('waitresses earn $3 each even with no sales; $5 with First Waitress Played', () => {
    const ctx = dine(
      base()
        .card('p1', 'waitress', 'work')
        .card('p1', 'waitress', 'work')
        .card('p2', 'waitress', 'work')
        .milestone('p2', 'first_waitress', 3),
    );
    expect(ctx.state.players.p1?.cash).toBe(6);
    expect(ctx.state.players.p2?.cash).toBe(5);
  });

  it('CFO: +50% rounded up of all income incl. tips and bonuses', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .card('p1', 'cfo', 'work')
        .card('p1', 'waitress', 'work')
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']),
    );
    // 10 + 3 = 13 → +7 (6.5 rounded up)
    expect(ctx.of('cfoBonus')[0]?.amount).toBe(7);
    expect(ctx.state.players.p1?.cash).toBe(20);
  });

  it('First to Have $100 gives the CEO the CFO bonus from the NEXT Dinnertime only', () => {
    const make = (earnedRound: number) =>
      base()
        .restaurant('p1', 3, 3, 'NW')
        .cash('p1', 100)
        .bank({ cash: 500 })
        .milestone('p1', 'first_100', earnedRound)
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']);
    expect(dine(make(2)).state.players.p1?.cash).toBe(115);
    expect(dine(make(3)).state.players.p1?.cash).toBe(110);
  });
});

describe('Dinnertime milestones', () => {
  it('First to Lower Prices: claimed at the start of Dinnertime by every chain with a pricing/discount manager at work, even with no sales (DLX p28)', () => {
    const ctx = dine(base(3).card('p1', 'pricing_manager', 'work').card('p2', 'discount_manager', 'beach').card('p3', 'discount_manager', 'work'));
    expect(Object.keys(ctx.state.players.p1?.milestones ?? {})).toContain('first_lower_prices');
    expect(ctx.state.players.p2?.milestones.first_lower_prices).toBeUndefined();
    expect(ctx.state.players.p3?.milestones.first_lower_prices).toBeDefined();
    expect(ctx.state.milestones.first_lower_prices?.claimedBy).toEqual(['p1', 'p3']);
  });

  it('First to Lower Prices: a luxuries manager alone does not claim it; one beside a pricing manager does not prevent it (DLX p28, p35)', () => {
    const alone = dine(base(2).card('p1', 'luxuries_manager', 'work'));
    expect(alone.state.players.p1?.milestones.first_lower_prices).toBeUndefined();
    expect(alone.state.milestones.first_lower_prices?.claimedBy ?? []).toEqual([]);
    const both = dine(base(2).card('p2', 'pricing_manager', 'work').card('p2', 'luxuries_manager', 'work'));
    expect(both.state.milestones.first_lower_prices?.claimedBy).toEqual(['p2']);
  });

  it('First to Lower Prices applies to the same Dinnertime (−$1)', () => {
    const ctx = dine(base().restaurant('p1', 3, 3, 'NW').card('p1', 'pricing_manager', 'work').inventory('p1', { burger: 1 }).demand(2, ['burger']));
    expect(ctx.of('sale')[0]?.unitPrice).toBe(8);
  });

  it('First to Have $20 / $100: every chain reaching the amount in this Dinnertime claims it', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 3, 5, 'NW')
        .cash('p1', 95)
        .cash('p2', 12)
        .bank({ cash: 500 })
        .inventory('p1', { burger: 1 })
        .inventory('p2', { pizza: 1 })
        .demand(2, ['burger'])
        .demand(10, ['pizza']),
    );
    expect(ctx.state.players.p1?.milestones.first_20).toBeDefined();
    expect(ctx.state.players.p1?.milestones.first_100).toBeDefined();
    expect(ctx.state.players.p2?.milestones.first_20).toBeDefined();
    expect(ctx.state.players.p2?.milestones.first_100).toBeUndefined();
    expect(ctx.state.milestones.first_20?.claimedBy.sort()).toEqual(['p1', 'p2']);
  });
});

describe('bank (base.md §12, §13)', () => {
  it('first break mid-Dinnertime: reserves revealed and added, CEO slots = most common (tie → highest), payment completes', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .bank({ cash: 5 })
        .reserve('p1', { kind: 'standard', amount: 300, ceoSlots: 4 })
        .reserve('p2', { kind: 'standard', amount: 100, ceoSlots: 2 })
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']),
    );
    expect(ctx.of('bankBroke')[0]).toMatchObject({ breakNo: 1, added: 400, ceoSlots: 4 });
    expect(ctx.state.bank).toMatchObject({ breaks: 1, cash: 395, reserveOpened: true });
    expect(ctx.state.players.p1?.cash).toBe(10);
    expect(ctx.state.players.p2?.reserveCard).toEqual({ kind: 'standard', amount: 100, ceoSlots: 2 });
    expect(ctx.state.ceoSlots).toBe(4);
    expect(ctx.state.phase.kind).toBe('dinnertime');
  });

  it('second break: no refill, remaining income as IOUs, game ends after Dinnertime; tie → earlier in turn order', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 3, 5, 'NW')
        .cash('p1', 20)
        .cash('p2', 30)
        .bank({ cash: 4, breaks: 1, reserveOpened: true })
        .turnOrder(['p2', 'p1'])
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger'])
        .demand(10, ['burger']),
    );
    expect(ctx.of('bankBroke')[0]).toMatchObject({ breakNo: 2 });
    expect(ctx.state.bank.breaks).toBe(2);
    expect(ctx.state.bank.cash).toBe(0);
    // House 2 → p1 (+10: $4 from the bank + $6 IOU) = 30. House 10 → p2 (+$10 IOU) = 40.
    expect(ctx.state.players.p1?.cash).toBe(30);
    expect(ctx.state.players.p2?.cash).toBe(40);
    expect(ctx.state.bank.ious).toEqual({ p1: 6, p2: 10 });
    expect(ctx.state.phase).toEqual({ kind: 'gameOver', ranking: ['p2', 'p1'], reason: 'bankBroke' });
    expect(ctx.of('gameEnded')).toHaveLength(1);
  });

  it('game-end tie on cash → the tied player earlier in turn order wins', () => {
    const ctx = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .cash('p1', 10)
        .cash('p2', 20)
        .bank({ cash: 4, breaks: 1, reserveOpened: true })
        .turnOrder(['p2', 'p1'])
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']),
    );
    expect(ctx.state.phase).toMatchObject({ kind: 'gameOver', ranking: ['p2', 'p1'] });
    const ctx2 = dine(
      base()
        .restaurant('p1', 3, 3, 'NW')
        .cash('p1', 10)
        .cash('p2', 20)
        .bank({ cash: 4, breaks: 1, reserveOpened: true })
        .inventory('p1', { burger: 1 })
        .demand(2, ['burger']),
    );
    expect(ctx2.state.phase).toMatchObject({ kind: 'gameOver', ranking: ['p1', 'p2'] });
  });

  it('§13 intro game: the game ends after the Dinnertime in which the bank first breaks (no reserves)', () => {
    const ctx = dine(
      base(2, { intro: true })
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 3, 5, 'NW')
        .bank({ cash: 15 })
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger'])
        .demand(10, ['burger']),
    );
    expect(ctx.state.bank.breaks).toBe(1);
    expect(ctx.state.bank.reserveOpened).toBe(false);
    expect(ctx.state.players.p1?.cash).toBe(10);
    expect(ctx.state.players.p2?.cash).toBe(10);
    expect(ctx.state.bank.ious).toEqual({ p2: 5 });
    expect(ctx.state.phase).toMatchObject({ kind: 'gameOver', ranking: ['p1', 'p2'] });
  });

  it('a bank that does not reach $0 does not break', () => {
    const ctx = dine(base().restaurant('p1', 3, 3, 'NW').bank({ cash: 11 }).inventory('p1', { burger: 1 }).demand(2, ['burger']));
    expect(ctx.state.bank).toMatchObject({ breaks: 0, cash: 1 });
    expect(ctx.state.phase.kind).toBe('dinnertime');
  });
});

describe('module pipelines (architecture §3.7)', () => {
  it('unitPrice, dinnerCandidates and saleRevenue run through ctx.pipe', () => {
    const seen: string[] = [];
    const pipe: Pipe = (name, value) => {
      seen.push(name);
      if (name === 'unitPrice') return (value as number) + 5;
      if (name === 'saleRevenue') return { ...(value as object), total: 1 };
      return value;
    };
    const ctx = dine(base().restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger']), pipe);
    expect(seen).toEqual(expect.arrayContaining(['unitPrice', 'dinnerCandidates', 'saleRevenue']));
    expect(ctx.of('sale')[0]).toMatchObject({ unitPrice: 15, total: 1 });
  });
});

describe('animation data (animation-plan §2.7)', () => {
  /** Tile borders a sale route crosses: start square → path → house square (roadworks count). */
  function borders(st: GameState, e: Extract<GameEvent, { type: 'sale' }>): number {
    const b = st.board;
    const r = e.route!;
    const origin = routeStartOrigin(b, r.from)!;
    let n = (tileOf(b, origin) !== tileOf(b, r.path[0]!) ? 1 : 0) + (roadAt(b, r.path[0]!)?.roadworks ?? 0);
    for (let i = 1; i < r.path.length; i++) n += (tileOf(b, r.path[i - 1]!) !== tileOf(b, r.path[i]!) ? 1 : 0) + (roadAt(b, r.path[i]!)?.roadworks ?? 0);
    const last = r.path[r.path.length - 1]!;
    const house = st.board.houses[e.houseId]!;
    const adj = houseSquares(house).filter((c: Cell) => Math.abs(c.x - last.x) + Math.abs(c.y - last.y) === 1);
    expect(adj.length).toBeGreaterThan(0);
    return n + Math.min(...adj.map((c: Cell) => (tileOf(b, c) !== tileOf(b, last) ? 1 : 0)));
  }

  it('sale.route: an orthogonal road path from the winning restaurant whose borders equal the distance', () => {
    for (const [x, y] of [
      [3, 3],
      [5, 3],
      [8, 8],
    ] as const) {
      const ctx = dine(base().restaurant('p1', x, y, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger']));
      const [sale] = ctx.of('sale');
      expect(sale?.route, `restaurant at ${x},${y}`).toBeDefined();
      const r = sale!.route!;
      expect(r.from).toMatchObject({ kind: 'restaurant', restaurantId: sale!.restaurantId });
      for (let i = 1; i < r.path.length; i++) expect(Math.abs(r.path[i]!.x - r.path[i - 1]!.x) + Math.abs(r.path[i]!.y - r.path[i - 1]!.y)).toBe(1);
      expect(r.path.every((c) => roadAt(ctx.state.board, c))).toBe(true);
      expect(borders(ctx.state, sale!)).toBe(sale!.distance);
      expect(r.exit).toBeUndefined();
    }
  });

  it('pins the house beat order: houseConsidered → sale | houseStayedHome → cashChanged', () => {
    const ctx = dine(base().restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger']).demand(10, ['pizza']));
    const seq = ctx.events.filter((e) => ['houseConsidered', 'sale', 'houseStayedHome', 'coffeeSold', 'cashChanged'].includes(e.type));
    const houses = seq.filter((e) => e.type === 'houseConsidered').length;
    expect(houses).toBe(2);
    // Each beat starts with houseConsidered and resolves on the very next event.
    seq.forEach((e, i) => {
      if (e.type !== 'houseConsidered') return;
      const next = seq[i + 1]!;
      expect(['sale', 'houseStayedHome']).toContain(next.type);
      expect((next as { houseId: string }).houseId).toBe(e.houseId);
      if (next.type === 'sale') expect(seq[i + 2]).toMatchObject({ type: 'cashChanged', player: next.player, delta: next.total });
    });
  });
});
