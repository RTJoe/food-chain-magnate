/**
 * Marketing scenarios (base.md §9; DLX p30–32; milestones.md first_radio, first_billboard).
 * Map: see c2ctx.ts. Extra house 1 is placed at (3,3) with its garden on the east (5,3)-(5,4),
 * on tile (0,0) inside the road block x 3..6, y 3..6.
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type CampaignSpec, type StateBuilder } from '../../src/testing/index.js';
import { campaignRunOrder, runMarketing } from '../../src/rules/marketing.js';
import type { GameState } from '../../src/types/index.js';
import { MAP, makeCtx, type Pipe, type TestCtx } from './c2ctx.js';

type Spec = Omit<CampaignSpec, 'owner'> & { owner?: string };

/** Airplane over the rows `offset..offset+width-1` from the west edge. */
const plane = (offset: number, width: 1 | 3 | 5 = 1, side: 'W' | 'E' = 'W') => ({ kind: 'airplane', side, offset, width }) as const;
const board = (x: number, y: number, w = 1, h = 1) => ({ kind: 'board', x, y, w, h }) as const;

function base(): StateBuilder {
  return stateBuilder({ players: 2 }).tiles(MAP).round(3);
}

function camp(b: StateBuilder, spec: Spec): StateBuilder {
  return b.campaign({ owner: 'p1', ...spec });
}

function market(b: StateBuilder, pipe?: Pipe): TestCtx {
  const ctx = makeCtx(b.phase({ kind: 'marketing', pass: 1, passes: 1, order: [], idx: 0 }).build(), pipe);
  runMarketing(ctx);
  return ctx;
}

const demandOf = (s: GameState, order: number) => Object.values(s.board.houses).find((h) => h.order === order)?.demand.map((t) => t.good) ?? [];

describe('run order (base.md §9)', () => {
  it('campaigns run in ascending tile number, not placement order', () => {
    // House 2 holds 2 of 3. #4 (burger) must run before #5 (pizza) and take the last slot.
    let b = base().demand(2, ['beer', 'beer']);
    b = camp(b, { id: 'c5', kind: 'airplane', number: 5, goods: ['pizza'], placement: plane(3, 3, 'E'), remaining: 3 });
    b = camp(b, { id: 'c4', kind: 'airplane', number: 4, goods: ['burger'], placement: plane(3), remaining: 3 });
    const ctx = market(b);
    expect(ctx.of('campaignRan').map((e) => e.campaignId)).toEqual(['c4', 'c5']);
    expect(demandOf(ctx.state, 2)).toEqual(['beer', 'beer', 'burger']);
    expect(demandOf(ctx.state, 10)).toEqual(['pizza']);
  });

  it('campaignRunOrder sorts by runOrder/number', () => {
    let b = base();
    b = camp(b, { id: 'c11', kind: 'billboard', number: 11, goods: ['burger'], placement: board(3, 8), remaining: 1 });
    b = camp(b, { id: 'c1', kind: 'radio', number: 1, goods: ['burger'], placement: board(4, 8), remaining: 1 });
    b = camp(b, { id: 'c7', kind: 'mailbox', number: 7, goods: ['burger'], placement: board(5, 8), remaining: 1 });
    expect(campaignRunOrder(b.build())).toEqual(['c1', 'c7', 'c11']);
  });
});

describe('demand limit (base.md §9)', () => {
  it('a house holds at most 3 demand; with a garden at most 5; a full house gets nothing', () => {
    let b = base()
      .placedHouse(1, 3, 3, 'E')
      .demand(1, ['pizza', 'pizza', 'pizza', 'pizza'])
      .demand(2, ['beer', 'beer', 'beer']);
    // Rows 3–5: houses 1, 2 and 10.
    b = camp(b, { kind: 'airplane', number: 5, goods: ['burger'], placement: plane(3, 3), remaining: 3 });
    const ctx = market(b);
    expect(demandOf(ctx.state, 1)).toHaveLength(5);
    expect(demandOf(ctx.state, 2)).toEqual(['beer', 'beer', 'beer']);
    expect(demandOf(ctx.state, 10)).toEqual(['burger']);
    expect(ctx.of('demandPlaced').map((e) => e.houseId).length).toBe(2);
  });

  it('First Radio Campaign: 2 counters per house, as many as fit; still 1 duration counter removed', () => {
    let b = base().milestone('p1', 'first_radio', 3).demand(2, ['beer', 'beer']);
    // Radio on tile (1,0): reaches the 3x3 tiles around it (houses 2 and 10).
    b = camp(b, { id: 'r', kind: 'radio', number: 1, goods: ['pizza'], placement: board(3, 8), remaining: 3 });
    const ctx = market(b);
    expect(demandOf(ctx.state, 2)).toEqual(['beer', 'beer', 'pizza']);
    expect(demandOf(ctx.state, 10)).toEqual(['pizza', 'pizza']);
    expect(ctx.state.board.campaigns.r?.remaining).toBe(2);
  });

  it('without the milestone a radio places 1 per house; other owners’ radios are unaffected by it', () => {
    let b = base().milestone('p2', 'first_radio', 3);
    b = camp(b, { kind: 'radio', number: 1, goods: ['pizza'], placement: board(3, 8), remaining: 3 });
    const ctx = market(b);
    expect(demandOf(ctx.state, 10)).toEqual(['pizza']);
  });
});

describe('reach (base.md §9)', () => {
  it('billboard: a house counts when only its garden is orthogonally adjacent', () => {
    let b = base().placedHouse(1, 3, 3, 'E');
    // (5,5)-(5,6): touches garden square (5,4) and the road at (5,7); diagonal to the house at (4,4).
    b = camp(b, { kind: 'billboard', number: 14, goods: ['burger'], placement: board(5, 5, 1, 2), remaining: 2 });
    expect(demandOf(market(b).state, 1)).toEqual(['burger']);
  });

  it('billboard: diagonal adjacency does not count', () => {
    // House (3..4, 3..4) with its garden south at (3..4, 5). (5,6) touches the road (5,7) and is
    // only diagonal to garden square (4,5).
    let b = base().placedHouse(1, 3, 3, 'S');
    b = camp(b, { kind: 'billboard', number: 14, goods: ['burger'], placement: board(5, 6), remaining: 2 });
    expect(demandOf(market(b).state, 1)).toEqual([]);
  });

  it('mailbox: reaches houses in its road-bounded block only', () => {
    let b = base().placedHouse(1, 3, 3, 'E');
    // (3,6) is in the block x 3.., y 3..6 with house 1; house 10 sits behind the road at x = 2.
    b = camp(b, { kind: 'mailbox', number: 9, goods: ['pizza'], placement: board(3, 6), remaining: 2 });
    const ctx = market(b);
    expect(demandOf(ctx.state, 1)).toEqual(['pizza']);
    expect(demandOf(ctx.state, 10)).toEqual([]);
  });

  it('airplane: every house in the covered rows', () => {
    let b = base();
    b = camp(b, { kind: 'airplane', number: 4, goods: ['soft_drink'], placement: plane(5), remaining: 2 });
    const ctx = market(b);
    expect(demandOf(ctx.state, 2)).toEqual([]);
    expect(demandOf(ctx.state, 10)).toEqual(['soft_drink']);
  });
});

describe('campaignRan reach (animation)', () => {
  it('names every house in reach and the full ones, before the demandPlaced events', () => {
    let b = base().demand(2, ['beer', 'beer', 'beer']);
    b = camp(b, { id: 'c', kind: 'airplane', number: 4, goods: ['burger'], placement: plane(3), remaining: 3 });
    const ctx = market(b);
    const run = ctx.of('campaignRan')[0]!;
    expect(run.full).toEqual(run.reached);
    expect(run.reached?.length).toBeGreaterThan(0);
    const types = ctx.events.map((e) => e.type);
    expect(types.indexOf('campaignRan')).toBeLessThan(types.indexOf('campaignTicked'));
  });

  it('full lists only reached houses that took nothing; demandPlaced follows in reach order', () => {
    let b = base().demand(10, ['beer', 'beer', 'beer']);
    b = camp(b, { id: 'c', kind: 'airplane', number: 4, goods: ['burger'], placement: plane(5), remaining: 3 });
    const ctx = market(b);
    const run = ctx.of('campaignRan')[0]!;
    const got = ctx.of('demandPlaced').map((e) => e.houseId);
    const h10 = Object.values(ctx.state.board.houses).find((h) => h.order === 10)!.id;
    expect(run.full).toEqual([h10]);
    expect(got.every((h) => run.reached!.includes(h) && !run.full!.includes(h))).toBe(true);
    expect([...got, ...run.full!].sort()).toEqual([...run.reached!].sort());
    expect(got).toEqual(run.reached!.filter((h) => !run.full!.includes(h)));
  });
});

describe('duration and expiry (base.md §9 "After each campaign runs")', () => {
  it('one counter comes off after each run, even when the campaign placed nothing', () => {
    let b = base().demand(2, ['beer', 'beer', 'beer']);
    b = camp(b, { id: 'c', kind: 'airplane', number: 4, goods: ['burger'], placement: plane(3), remaining: 3 });
    const ctx = market(b);
    expect(ctx.of('demandPlaced')).toHaveLength(0);
    expect(ctx.state.board.campaigns.c?.remaining).toBe(2);
    expect(ctx.of('campaignTicked')).toEqual([expect.objectContaining({ campaignId: 'c', remaining: 2 })]);
  });

  it('the last counter ends the campaign: tile and squares freed, the marketeer goes on the beach', () => {
    const b = base().marketeerCampaign('marketing_trainee', 'mkt', {
      id: 'c',
      owner: 'p1',
      kind: 'billboard',
      number: 14,
      goods: ['burger'],
      placement: board(3, 6),
      remaining: 1,
    });
    expect(b.build().marketingTiles).not.toContain(14);
    const ctx = market(b);
    const s = ctx.state;
    expect(s.board.campaigns.c).toBeUndefined();
    expect(s.marketingTiles).toContain(14);
    expect(s.board.cells[6]?.[3]?.kind).toBe('empty');
    expect(s.players.p1?.busy.mkt).toBeUndefined();
    expect(s.players.p1?.beach).toContain('mkt');
    expect(ctx.of('campaignExpired')[0]).toMatchObject({ campaignId: 'c', marketeer: 'mkt' });
    expect(ctx.of('marketeerReturned')[0]).toMatchObject({ player: 'p1', uid: 'mkt' });
  });

  it('a campaign whose marketeer was fired still runs and expires normally', () => {
    let b = base();
    b = camp(b, { id: 'c', kind: 'airplane', number: 4, goods: ['burger'], placement: plane(3), remaining: 1, marketeer: null });
    const ctx = market(b);
    expect(demandOf(ctx.state, 2)).toEqual(['burger']);
    expect(ctx.state.board.campaigns.c).toBeUndefined();
    expect(ctx.of('marketeerReturned')).toHaveLength(0);
  });

  it('eternal campaigns (First Billboard) never lose their counter and never end', () => {
    const b = base().marketeerCampaign('marketing_trainee', 'mkt', {
      id: 'c',
      owner: 'p1',
      kind: 'airplane',
      number: 4,
      goods: ['burger'],
      placement: plane(3),
      remaining: 1,
      eternal: true,
    });
    let s = b.build();
    for (let round = 0; round < 3; round++) {
      const ctx = makeCtx(s);
      runMarketing(ctx);
      s = ctx.state;
    }
    expect(s.board.campaigns.c).toMatchObject({ eternal: true, remaining: 1 });
    expect(demandOf(s, 2)).toEqual(['burger', 'burger', 'burger']);
    expect(s.players.p1?.busy.mkt).toEqual(['c']);
  });

  it('module marketingPasses: every campaign runs each pass; counters come off once, after the last', () => {
    let b = base();
    b = camp(b, { id: 'c', kind: 'airplane', number: 4, goods: ['burger'], placement: plane(3), remaining: 2 });
    const ctx = market(b, (name, value) => (name === 'marketingPasses' ? 2 : value));
    expect(ctx.of('campaignRan').map((e) => e.pass)).toEqual([1, 2]);
    expect(demandOf(ctx.state, 2)).toEqual(['burger', 'burger']);
    expect(ctx.state.board.campaigns.c?.remaining).toBe(1);
  });
});
