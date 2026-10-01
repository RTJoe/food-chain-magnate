/**
 * Gourmet Food Critics (ketchup.md §13; KX p15; DLX p26).
 */
import { describe, expect, it } from 'vitest';
import type { Action, FoodId, House, Uid } from '../../../src/index.js';
import { legalPlacements } from '../../../src/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { clone } from '../../../src/core/clone.js';
import { act, rejected, workingTurn } from '../../helpers/game.js';
import { kb, kgame, market } from './helpers.js';

const M = ['ketchup:gourmetCritics'] as const;
const GC = 'ketchup:gourmet_food_critic';

const guide = (cardUid: Uid, extra: Partial<Extract<Action, { type: 'work.placeCampaign' }>> = {}): Action => ({
  type: 'work.placeCampaign',
  playerId: 'p1',
  cardUid,
  campaignKind: 'gourmetGuide',
  tileNumber: 17,
  goods: ['pizza'],
  placement: { kind: 'offBoard' },
  duration: 3,
  ...extra,
});

const turn = (extraWork: string[] = []) => workingTurn(kgame(2, [...M]), 'p1', { work: [GC, ...extraWork] as never });

const spec = (cardUid: Uid) => ({ kind: 'campaign' as const, cardUid, campaignKind: 'gourmetGuide' as const });

describe('Gourmet Food Critics - cards and placement (ketchup.md §13)', () => {
  it('§13: trained from a marketing trainee; salaried; gourmet guides are tiles 17-20', () => {
    const c = contentFor([...M]);
    expect(c.employees.marketing_trainee?.trainsInto).toContain(GC);
    expect(c.employees[GC]).toMatchObject({ salary: true, count: 6 });
    expect([17, 18, 19, 20].map((n) => c.marketingTiles[n]?.kind)).toEqual(Array(4).fill('gourmetGuide'));
    expect(kgame(2, [...M]).marketingTiles).toEqual(expect.arrayContaining([17, 18, 19, 20]));
  });

  it('§13: a critic places a guide beside the board (off-board, no range); the critic is busy while it runs', () => {
    const { s, work } = turn();
    const t = act(s, guide(work[0] as Uid));
    const camp = Object.values(t.board.campaigns)[0];
    expect(camp).toMatchObject({ kind: 'gourmetGuide', number: 17, goods: ['pizza'], remaining: 3, eternal: false, placement: { kind: 'offBoard' } });
    expect(t.players.p1?.busy[work[0] as Uid]).toEqual([camp?.id]);
    expect(t.marketingTiles).not.toContain(17);
  });

  it('§13: duration 1-3 only (max duration 3)', () => {
    const { s, work } = turn();
    const u = work[0] as Uid;
    expect(rejected(s, guide(u, { duration: 4 })).message).toMatch(/Duration must be 1–3/);
    expect(rejected(s, guide(u, { duration: 0 })).message).toMatch(/Duration/);
    act(s, guide(u, { duration: 1 }));
  });

  it('§13: 1 good only (one demand token type per guide)', () => {
    const { s, work } = turn();
    expect(rejected(s, guide(work[0] as Uid, { goods: ['pizza', 'burger'] })).code).toBe('INVALID_PAYLOAD');
  });

  it('§13: guides are placed beside the board only, and only tiles 17-20 count as guides', () => {
    const { s, work } = turn();
    const u = work[0] as Uid;
    expect(rejected(s, guide(u, { placement: { kind: 'board', x: 3, y: 0, w: 1, h: 1 } })).message).toMatch(/beside the board/);
    expect(rejected(s, guide(u, { tileNumber: 14 })).message).toMatch(/not a gourmet guide/);
    expect(rejected(s, guide(u, { tileNumber: 21 })).code).toBe('ILLEGAL_PLACEMENT');
  });

  it('§13: only gourmet critics place guides; a critic cannot place a billboard', () => {
    const { s, work } = turn(['marketing_trainee', 'brand_manager']);
    expect(rejected(s, guide(work[1] as Uid, { duration: 1 })).message).toMatch(/cannot place/);
    expect(rejected(s, guide(work[2] as Uid, { duration: 1 })).message).toMatch(/cannot place/);
    const bill: Action = { type: 'work.placeCampaign', playerId: 'p1', cardUid: work[0] as Uid, campaignKind: 'billboard', tileNumber: 14, goods: ['burger'], placement: { kind: 'board', x: 3, y: 0, w: 2, h: 1 }, duration: 1 };
    expect(rejected(s, bill).message).toMatch(/cannot place/);
  });

  it('§13: a tile cannot be used twice (4 guides at most)', () => {
    const { s, work } = workingTurn(kgame(2, [...M]), 'p1', { work: [GC, GC] as never });
    const t = act(s, guide(work[0] as Uid));
    expect(rejected(t, guide(work[1] as Uid)).message).toMatch(/not available/);
    act(t, guide(work[1] as Uid, { tileNumber: 18 }));
  });

  it('§13: legalPlacements offers the free guide tiles to a critic only', () => {
    const { s, work } = turn(['marketing_trainee']);
    const tiles = legalPlacements(s, 'p1', spec(work[0] as Uid)).map((o) => (o.kind === 'campaign' ? o.tileNumber : null));
    expect(tiles).toEqual([17, 18, 19, 20]);
    expect(legalPlacements(s, 'p1', spec(work[1] as Uid))).toEqual([]);
  });

  it('§13: legalPlacements offers nothing when the card cannot act now (marketing stage passed)', () => {
    const { s, work } = turn();
    const late = clone(s);
    if (!late.turn) throw new Error('no turn');
    late.turn.stage = 'end' as never;
    expect(legalPlacements(late, 'p1', spec(work[0] as Uid))).toEqual([]);
    // Same card, not at work any more: nothing either.
    const away = clone(s);
    away.players.p1!.structure.ceoSubs = [];
    expect(legalPlacements(away, 'p1', spec(work[0] as Uid))).toEqual([]);
  });
});

describe('Gourmet Food Critics - marketing phase (ketchup.md §13)', () => {
  const house = (id: string, kind: House['kind'], order: number, garden: boolean, demand: FoodId[] = []): House => ({
    id,
    kind,
    order,
    label: id,
    cells: [],
    garden: garden ? { cells: [], source: 'gardenTile' } : null,
    demand: demand.map((good) => ({ good, by: null, campaign: null })),
  });
  /** Garden placed house (1), plain printed house (2, 10), apartment, rural, and a printed house with a garden. */
  const world = () =>
    kb(2, [...M])
      .ruralArea()
      .placedHouse(1, 3, 8, 'S')
      .mutate((s) => {
        s.board.houses.apt = house('apt', 'apartment', 50, false);
        s.board.houses.pg = house('pg', 'printed', 60, true);
      });
  const run = (b: ReturnType<typeof kb>, ...guides: { n: number; good: FoodId; remaining?: number }[]) => {
    let w = b;
    guides.forEach((g, i) => {
      w = w.marketeerCampaign(GC as never, `gc${i}`, { owner: 'p1', kind: 'gourmetGuide', number: g.n, goods: [g.good], placement: { kind: 'offBoard' }, remaining: g.remaining ?? 2 });
    });
    return market(w);
  };
  const demandOf = (ctx: ReturnType<typeof run>, id: string) => ctx.state.board.houses[id]?.demand.map((d) => d.good) ?? [];

  it('§13: places 1 demand on every house with a garden, not on non-garden, apartment or rural houses', () => {
    const ctx = run(world(), { n: 17, good: 'pizza' });
    const gardenIds = Object.values(ctx.state.board.houses).filter((h) => h.garden).map((h) => h.id).sort();
    expect(gardenIds).toHaveLength(2);
    for (const id of gardenIds) expect(demandOf(ctx, id)).toEqual(['pizza']);
    const others = Object.values(ctx.state.board.houses).filter((h) => !h.garden);
    expect(others.length).toBeGreaterThanOrEqual(4);
    for (const h of others) expect(h.demand).toEqual([]);
    expect(ctx.of('demandPlaced')).toHaveLength(2);
  });

  it('§13: the garden-house cap (5) applies', () => {
    const b = world().demand(1, ['burger', 'burger', 'burger', 'burger']);
    expect(demandOf(run(b, { n: 17, good: 'pizza' }), b.houseId(1))).toHaveLength(5);
    const full = world().demand(1, ['burger', 'burger', 'burger', 'burger', 'burger']);
    const ctx = run(full, { n: 17, good: 'pizza' });
    expect(demandOf(ctx, full.houseId(1))).toEqual(Array(5).fill('burger'));
    expect(ctx.of('demandPlaced').some((e) => e.houseId === full.houseId(1))).toBe(false);
  });

  it('§13: guides run in number order (after the base campaigns)', () => {
    const b = world().marketeerCampaign('marketing_trainee', 'mt1', { owner: 'p2', kind: 'billboard', number: 14, goods: ['burger'], placement: { kind: 'board', x: 3, y: 0, w: 2, h: 1 }, remaining: 2 });
    const ctx = run(b, { n: 19, good: 'burger' }, { n: 17, good: 'pizza' });
    const ran = ctx.of('campaignRan').map((e) => ctx.state.board.campaigns[e.campaignId]?.number);
    expect(ran).toEqual([14, 17, 19]);
    // Number order shows in the token order on the garden house: 17 (pizza) before 19 (burger).
    const gid = Object.values(ctx.state.board.houses).find((h) => h.kind === 'placed')?.id as string;
    expect(demandOf(ctx, gid)).toEqual(['pizza', 'burger']);
  });

  it('§13: one counter comes off per run; the critic returns to the beach when the guide ends', () => {
    const ctx = run(world(), { n: 17, good: 'pizza', remaining: 2 }, { n: 18, good: 'burger', remaining: 1 });
    const left = Object.values(ctx.state.board.campaigns);
    expect(left.map((c) => [c.number, c.remaining])).toEqual([[17, 1]]);
    expect(ctx.state.players.p1?.beach).toContain('gc1');
    expect(ctx.state.players.p1?.busy.gc1).toBeUndefined();
    expect(ctx.state.players.p1?.busy.gc0).toBeDefined();
    expect(ctx.state.marketingTiles).toContain(18);
  });
});
