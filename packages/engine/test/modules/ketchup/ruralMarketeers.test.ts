/**
 * Rural Marketeers (ketchup.md §12; DLX p25-26; questions.md Q-K6, Q-K7).
 * Map: helpers MAP (3x3 tiles). Roads on the N edge at x = 2, 7, 12 (tile cols 0, 1, 2); W edge at y = 2, 7, 12.
 */
import { describe, expect, it } from 'vitest';
import type { Action, GameState, ModuleEntity, Uid } from '../../../src/index.js';
import { legalPlacements } from '../../../src/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { RURAL_MARKETEERS_MODULE, freewayProblem, ruralDistance, ruralHouse } from '../../../src/modules/ketchup/ruralMarketeers.js';
import { clone } from '../../../src/core/clone.js';
import { act, rejected, workingTurn } from '../../helpers/game.js';
import { dine, kb, kgame, market } from './helpers.js';

const M = ['ketchup:ruralMarketeers'] as const;
const RM = 'ketchup:rural_marketeer';

const giant = (cardUid: Uid, side: 'N' | 'E' | 'S' | 'W', extra: Partial<Extract<Action, { type: 'work.placeCampaign' }>> = {}): Action => ({
  type: 'work.placeCampaign',
  playerId: 'p1',
  cardUid,
  campaignKind: 'giantBillboard',
  tileNumber: 21,
  goods: ['burger'],
  placement: { kind: 'rural', side },
  duration: 1,
  ...extra,
});

const fw = (id: string, side: 'N' | 'E' | 'S' | 'W', offset: number): ModuleEntity => ({ kind: 'freeway', id, owner: 'p1', side, offset, tile: 't0' });

/** Working turn with n rural marketeers at work on a real game. */
const turn = (n = 1, extraWork: string[] = []) => workingTurn(kgame(2, [...M]), 'p1', { work: [...Array(n).fill(RM), ...extraWork] as never });

/** Working turn where the "first rural marketeer used" freeway choice is pending. */
function withChoice() {
  const { s, work } = turn(2);
  const t = act(s, giant(work[0] as Uid, 'N'));
  return { t, work };
}

describe('Rural Marketeers - rural area (ketchup.md §12)', () => {
  it('§12: the rural area is created at setup as a squareless house that eats last (order 1000)', () => {
    const s = kgame(2, [...M]);
    const rural = ruralHouse(s);
    expect(rural).toMatchObject({ kind: 'rural', order: 1000, cells: [], garden: null, demand: [] });
    expect(Object.values(s.board.houses).filter((h) => h.kind === 'rural')).toHaveLength(1);
    const max = Math.max(...Object.values(s.board.houses).map((h) => h.order));
    expect(max).toBe(1000);
  });

  it('§12: no rural area without the module', () => {
    expect(ruralHouse(kgame(2, []))).toBeUndefined();
  });

  it('§12: rural marketeer is a salaried marketeer trained from the marketing trainee; 3 freeways, 4 giant billboards', () => {
    const c = contentFor([...M]);
    expect(c.employees.marketing_trainee?.trainsInto).toContain(RM);
    expect(c.employees[RM]).toMatchObject({ salary: true, count: 6 });
    expect([21, 22, 23, 24].map((n) => c.marketingTiles[n]?.kind)).toEqual(Array(4).fill('giantBillboard'));
    expect(RURAL_MARKETEERS_MODULE.content?.entities?.find((e) => e.kind === 'freeway')?.limit).toEqual({ scope: 'total', count: 3 });
  });

  it('§12: a marketing trainee is trained into a rural marketeer through work.train', () => {
    const { s, work, beach } = workingTurn(kgame(2, [...M]), 'p1', { work: ['trainer'], beach: ['marketing_trainee'] });
    const t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: RM });
    expect(t.players.p1?.employees[beach[0] as Uid]?.employeeId).toBe(RM);
  });
});

describe('Rural Marketeers - giant billboards (ketchup.md §12)', () => {
  it('§12: a rural marketeer places an eternal giant billboard on a side of the rural area; marketeer is busy', () => {
    const { s, work } = turn();
    const t = act(s, giant(work[0] as Uid, 'N'));
    const camp = Object.values(t.board.campaigns)[0];
    expect(camp).toMatchObject({ kind: 'giantBillboard', number: 21, eternal: true, remaining: 1, placement: { kind: 'rural', side: 'N' }, goods: ['burger'], marketeer: work[0] });
    expect(t.players.p1?.busy[work[0] as Uid]).toEqual([camp?.id]);
    expect(t.marketingTiles).not.toContain(21);
  });

  it('§12: placement ignores range (no road range limit)', () => {
    const { s, work } = turn();
    expect(act(s, giant(work[0] as Uid, 'S', { tileNumber: 24 })).board.campaigns).not.toEqual({});
  });

  it('§12: one giant billboard per side of the rural area (max 4)', () => {
    const { t, work } = withChoice();
    const t2 = act(t, { type: 'choice.decline', playerId: 'p1', choiceId: t.pending[0]?.id as string });
    expect(rejected(t2, giant(work[1] as Uid, 'N', { tileNumber: 22 })).message).toMatch(/taken/);
    const t3 = act(t2, giant(work[1] as Uid, 'E', { tileNumber: 22 }));
    expect(Object.values(t3.board.campaigns).map((c) => c.placement)).toEqual([
      { kind: 'rural', side: 'N' },
      { kind: 'rural', side: 'E' },
    ]);
  });

  it('§12: only rural marketeers place giant billboards; others cannot', () => {
    const { s, work } = turn(0, ['marketing_trainee', 'brand_manager', 'brand_director']);
    for (const u of work) expect(rejected(s, giant(u, 'N')).message).toMatch(/cannot place/);
  });

  it('§12: a rural marketeer cannot place anything but a giant billboard', () => {
    const { s, work } = turn();
    const bill: Action = { type: 'work.placeCampaign', playerId: 'p1', cardUid: work[0] as Uid, campaignKind: 'billboard', tileNumber: 14, goods: ['burger'], placement: { kind: 'board', x: 3, y: 0, w: 2, h: 1 }, duration: 1 };
    expect(rejected(s, bill).message).toMatch(/cannot place/);
  });

  it('§12: a giant billboard needs a rural placement and an available giant tile (21-24)', () => {
    const { s, work } = turn();
    const u = work[0] as Uid;
    expect(rejected(s, giant(u, 'N', { placement: { kind: 'offBoard' } })).message).toMatch(/side of the rural area/);
    expect(rejected(s, giant(u, 'N', { tileNumber: 14 })).message).toMatch(/not a giant billboard/);
    expect(rejected(s, giant(u, 'N', { tileNumber: 25 })).code).toBe('ILLEGAL_PLACEMENT');
  });

  it('§12: legalPlacements offers the 4 free sides, fewer once a side is taken, none for another marketeer', () => {
    const { s, work } = turn(1, ['marketing_trainee']);
    const spec = (cardUid: Uid) => ({ kind: 'campaign' as const, cardUid, campaignKind: 'giantBillboard' as const });
    const opts = legalPlacements(s, 'p1', spec(work[0] as Uid));
    expect(opts.map((o) => (o.kind === 'campaign' && o.placement?.kind === 'rural' ? o.placement.side : null)).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(legalPlacements(s, 'p1', spec(work[1] as Uid))).toEqual([]);
  });

  it('§12: legalPlacements offers nothing once the marketing stage has passed', () => {
    const { s, work } = turn();
    const late = clone(s);
    if (!late.turn) throw new Error('no turn');
    late.turn.stage = 'end' as never;
    expect(legalPlacements(late, 'p1', { kind: 'campaign', cardUid: work[0] as Uid, campaignKind: 'giantBillboard' })).toEqual([]);
  });
});

describe('Rural Marketeers - marketing phase (ketchup.md §12, Q-K6)', () => {
  const camp = (side: 'N' | 'E', number: number, goods: ('burger' | 'pizza')[], uid: string) => ({
    owner: 'p1',
    kind: 'giantBillboard' as const,
    number,
    goods,
    placement: { kind: 'rural' as const, side },
    remaining: 1,
    eternal: true,
    uid,
  });
  const withCamp = (c: ReturnType<typeof camp>) => {
    const { uid, ...spec } = c;
    return (b: ReturnType<typeof kb>) => b.marketeerCampaign(RM as never, uid, spec);
  };

  it('§12: each marketing pass puts 2 tokens of the good on the rural area (no other house)', () => {
    const b = withCamp(camp('N', 21, ['burger'], 'rm1'))(kb(2, [...M]).ruralArea().placedHouse(1, 3, 8, 'S'));
    const ctx = market(b);
    const s = ctx.state;
    expect(ruralHouse(s)?.demand.map((d) => d.good)).toEqual(['burger', 'burger']);
    expect(Object.values(s.board.houses).filter((h) => h.kind !== 'rural').every((h) => h.demand.length === 0)).toBe(true);
    expect(ctx.of('demandPlaced')[0]?.tokens).toHaveLength(2);
  });

  it('§12: the rural area has no maximum demand, and the eternal billboard keeps running', () => {
    const b = withCamp(camp('N', 21, ['burger'], 'rm1'))(kb(2, [...M]).ruralArea());
    const ctx = market(b.demand(1000, ['pizza', 'pizza', 'pizza', 'pizza', 'pizza', 'pizza', 'pizza']));
    expect(ruralHouse(ctx.state)?.demand).toHaveLength(9);
    expect(Object.values(ctx.state.board.campaigns)[0]).toMatchObject({ eternal: true, remaining: 1 });
    expect(ctx.of('campaignExpired')).toHaveLength(0);
  });

  it('§12 / Q-K6: unnumbered giant billboards (tiles 21-24) run after every numbered campaign', () => {
    const b = kb(2, [...M]).ruralArea()
      .marketeerCampaign(RM as never, 'rm1', { owner: 'p1', kind: 'giantBillboard', number: 21, goods: ['burger'], placement: { kind: 'rural', side: 'N' }, remaining: 1, eternal: true })
      .marketeerCampaign('brand_director', 'bd1', { owner: 'p2', kind: 'airplane', number: 1, goods: ['pizza'], placement: { kind: 'airplane', side: 'N', offset: 0, width: 5 }, remaining: 2 });
    const ctx = market(b);
    const ran = ctx.of('campaignRan').map((e) => ctx.state.board.campaigns[e.campaignId]?.kind);
    expect(ran).toEqual(['airplane', 'giantBillboard']);
  });

  it('§12: two giant billboards on different goods each place 2', () => {
    const b = withCamp(camp('E', 22, ['pizza'], 'rm2'))(withCamp(camp('N', 21, ['burger'], 'rm1'))(kb(2, [...M]).ruralArea()));
    const demand = ruralHouse(market(b).state)?.demand.map((d) => d.good).sort();
    expect(demand).toEqual(['burger', 'burger', 'pizza', 'pizza']);
  });
});

describe('Rural Marketeers - First Rural Marketeer Used / freeways (ketchup.md §12)', () => {
  it('§12: the first giant billboard claims the milestone and offers an optional freeway choice', () => {
    const { t } = withChoice();
    expect(t.players.p1?.milestones['ketchup:first_rural_marketeer_used']).toBeDefined();
    expect(t.pending[0]).toMatchObject({ kind: 'freeway', player: 'p1', optional: true });
  });

  it('§12: the freeway may be declined', () => {
    const { t } = withChoice();
    const u = act(t, { type: 'choice.decline', playerId: 'p1', choiceId: t.pending[0]?.id as string });
    expect(u.pending).toEqual([]);
    expect(Object.values(u.board.entities).filter((e) => e.kind === 'freeway')).toEqual([]);
  });

  it('§12: a later rural marketeer (milestone already claimed) offers no second freeway choice', () => {
    const { t, work } = withChoice();
    const u = act(t, { type: 'choice.decline', playerId: 'p1', choiceId: t.pending[0]?.id as string });
    expect(act(u, giant(work[1] as Uid, 'E', { tileNumber: 22 })).pending).toEqual([]);
  });

  it('§12: placeFreeway puts a freeway beside the edge touching a road square', () => {
    const { t } = withChoice();
    const u = act(t, { type: 'ketchup:ruralMarketeers.placeFreeway', playerId: 'p1', choiceId: t.pending[0]?.id as string, side: 'N', offset: 2 });
    expect(Object.values(u.board.entities)).toContainEqual(expect.objectContaining({ kind: 'freeway', owner: 'p1', side: 'N', offset: 2 }));
    expect(u.pending).toEqual([]);
  });

  it('§12: a freeway must touch a road on the map edge (square next to a non-road is rejected)', () => {
    const { t } = withChoice();
    const base = { type: 'ketchup:ruralMarketeers.placeFreeway' as const, playerId: 'p1', choiceId: t.pending[0]?.id as string };
    expect(rejected(t, { ...base, side: 'N', offset: 0 }).message).toMatch(/touch a road/);
    expect(rejected(t, { ...base, side: 'N', offset: 99 }).message).toMatch(/beside the map/);
    expect(rejected(t, { ...base, side: 'X' as never, offset: 2 }).message).toMatch(/Bad freeway/);
    act(t, { ...base, side: 'W', offset: 7 });
  });

  it('§12: a freeway may not overlap any part of an airplane position', () => {
    const { s, work } = turn(1);
    const w = clone(s);
    w.board.campaigns.air = { id: 'air', owner: 'p2', number: 5, kind: 'airplane', goods: ['pizza'], placement: { kind: 'airplane', side: 'N', offset: 1, width: 3 }, remaining: 3, eternal: false, marketeer: null, source: 'marketeer', linked: [], placedRound: 1 };
    w.marketingTiles = w.marketingTiles.filter((n) => n !== 5);
    const t = act(w, giant(work[0] as Uid, 'S'));
    const base = { type: 'ketchup:ruralMarketeers.placeFreeway' as const, playerId: 'p1', choiceId: t.pending[0]?.id as string };
    expect(rejected(t, { ...base, side: 'N', offset: 2 }).message).toMatch(/airplane/);
    act(t, { ...base, side: 'N', offset: 7 });
  });

  it('§12: at most 3 freeways; no choice is offered when none can be placed', () => {
    const s = kb(2, [...M]).ruralArea().entity(fw('f1', 'N', 2)).entity(fw('f2', 'N', 7)).entity(fw('f3', 'N', 12)).build();
    expect(freewayProblem(s, 'W', 7)).toBe('No freeways left');
    const two = kb(2, [...M]).ruralArea().entity(fw('f1', 'N', 2)).entity(fw('f2', 'N', 7)).build();
    expect(freewayProblem(two, 'W', 7)).toBeNull();
    expect(freewayProblem(two, 'N', 7)).toMatch(/already a freeway/);
  });

  it('§12: an airplane may not be placed over a freeway', () => {
    const s0 = workingTurn(kgame(2, [...M]), 'p1', { work: ['brand_manager'] });
    const s = clone(s0.s);
    s.board.entities.f1 = fw('f1', 'N', 7);
    const plane = (offset: number, width: 1 | 3, tileNumber: number): Action => ({
      type: 'work.placeCampaign', playerId: 'p1', cardUid: s0.work[0] as Uid, campaignKind: 'airplane', tileNumber, goods: ['pizza'], placement: { kind: 'airplane', side: 'N', offset, width }, duration: 3,
    });
    expect(rejected(s, plane(6, 3, 5)).message).toMatch(/cover a freeway/);
    expect(rejected(s, plane(7, 1, 4)).message).toMatch(/cover a freeway/);
    act(s, plane(8, 1, 4));
    act(s, plane(8, 3, 5));
  });
});

describe('Rural Marketeers - Dinnertime (ketchup.md §12, Q-K7)', () => {
  const scene = (freeways: ModuleEntity[], extra: (b: ReturnType<typeof kb>) => ReturnType<typeof kb> = (b) => b) => {
    let b = kb(2, [...M]).ruralArea().restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 3 }).demand(1000, ['burger']);
    for (const f of freeways) b = b.entity(f);
    return dine(extra(b));
  };

  it('§12: with no freeway nobody reaches the rural area; the house stays home', () => {
    const ctx = scene([]);
    expect(ctx.of('sale')).toHaveLength(0);
    expect(ctx.of('houseStayedHome')).toHaveLength(1);
    expect(ruralHouse(ctx.state)?.demand).toHaveLength(1);
  });

  it('§12 / Q-K7: distance counts from the freeway road square (same tile = 0 borders)', () => {
    const ctx = scene([fw('f1', 'N', 2)]);
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', distance: 0, unitPrice: 10, total: 10 });
    expect(ruralHouse(ctx.state)?.demand).toHaveLength(0);
  });

  it('animation: a rural sale routes to the nearest freeway square and exits by its board edge', () => {
    const ctx = scene([fw('f1', 'N', 12), fw('f2', 'N', 7)]);
    const [sale] = ctx.of('sale');
    const r = sale!.route!;
    expect(r.exit).toMatchObject({ side: 'N', cell: r.path[r.path.length - 1] });
    expect(r.exit!.cell.x).toBe(7);
    expect(r.from).toMatchObject({ kind: 'restaurant', restaurantId: sale!.restaurantId });
  });

  it('§12 / Q-K7: a farther freeway adds tile borders crossed; the nearest freeway counts', () => {
    expect(scene([fw('f1', 'N', 12)]).of('sale')[0]).toMatchObject({ distance: 2 });
    expect(scene([fw('f1', 'N', 12), fw('f2', 'N', 7)]).of('sale')[0]).toMatchObject({ distance: 1 });
    expect(scene([fw('f1', 'N', 12), fw('f2', 'N', 2)]).of('sale')[0]).toMatchObject({ distance: 0 });
  });

  it('§12 / Q-K7: ruralDistance is null without freeways and per player otherwise', () => {
    const s = kb(2, [...M]).ruralArea().restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW').entity(fw('f1', 'N', 2)).build();
    expect(ruralDistance(s, 'p1')?.distance).toBe(0);
    expect(ruralDistance(s, 'p2')?.distance).toBe(1);
    expect(ruralDistance(kb(2, [...M]).ruralArea().restaurant('p1', 3, 3, 'NW').build(), 'p1')).toBeNull();
  });

  it('§12: the rural area eats last: a chain with one burger serves the ordinary house first', () => {
    const b = kb(2, [...M]).ruralArea().placedHouse(1, 3, 8, 'S').restaurant('p1', 3, 3, 'NW').entity(fw('f1', 'N', 2))
      .inventory('p1', { burger: 1 }).demand(1000, ['burger']).demand(1, ['burger']);
    const ctx = dine(b);
    expect(ctx.of('sale')).toHaveLength(1);
    expect(ctx.of('sale')[0]?.houseId).not.toBe(ruralHouse(ctx.state)?.id);
    expect(ctx.of('houseStayedHome')).toHaveLength(1);
    expect(ruralHouse(ctx.state)?.demand).toHaveLength(1);
  });

  it('§12: the rural area must be fully satisfied as usual (insufficient stock: stays home)', () => {
    const b = kb(2, [...M]).ruralArea().restaurant('p1', 3, 3, 'NW').entity(fw('f1', 'N', 2)).inventory('p1', { burger: 1 }).demand(1000, ['burger', 'burger', 'burger', 'burger']);
    const ctx = dine(b);
    expect(ctx.of('sale')).toHaveLength(0);
    expect(ctx.of('houseStayedHome')).toHaveLength(1);
  });

  it('§12: fry chefs apply to the rural area as to any house (ketchup.md §9)', () => {
    const ctx = dine(
      kb(2, [...M, 'ketchup:fryChefs']).ruralArea().restaurant('p1', 3, 3, 'NW').entity(fw('f1', 'N', 2)).card('p1', 'ketchup:fry_chef', 'work')
        .inventory('p1', { burger: 4 }).demand(1000, ['burger', 'burger', 'burger', 'burger']),
    );
    const [sale] = ctx.of('sale');
    expect(sale?.bonuses).toContainEqual({ source: 'ketchup:fry_chef', amount: 10 });
    expect(sale?.total).toBe(4 * 10 + 10);
  });
});

export type { GameState };
