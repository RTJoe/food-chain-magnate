/**
 * New Milestones (ketchup.md §3; DLX p17–19). Scenarios run through the real engine (`act` /
 * `applyAction`, or `kctx` + phase functions) so module hooks and milestone triggers fire.
 * Map: MAP3 (helpers/game.ts header). p1's first restaurant: (3,3) NW on tile (0,0).
 */
import { describe, expect, it } from 'vitest';
import type { Action, Cell, GameState, MilestoneId, ModuleId, PlayerId, Uid } from '../../../src/index.js';
import { legalActions, legalPlacements, validateAction } from '../../../src/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { NEW_MILESTONES } from '../../../src/modules/ketchup/newMilestones.js';
import { BASE_MILESTONE_IDS, type StateBuilder } from '../../../src/testing/stateBuilder.js';
import { ceoSlotsFor } from '../../../src/core/cards.js';
import { freezerCapacity } from '../../../src/rules/cleanup.js';
import { crossOutMilestones } from '../../../src/rules/milestones.js';
import { isSalaried, salaryBreakdown } from '../../../src/rules/payday.js';
import { tileOf } from '../../../src/map/grid.js';
import { act, actE, newGame, rejected, workingTurn } from '../../helpers/game.js';
import { dine, fromPhase, kb, kctx, kgame, market, MAP3 } from './helpers.js';

const M: ModuleId[] = ['ketchup:newMilestones'];
const ID = (s: string) => `ketchup:${s}` as MilestoneId;

/** StateBuilder on MAP with the module on and the 17 new milestones (instead of the base ones) in play. */
function nb(players = 2): StateBuilder {
  return kb(players, M).mutate((s) => {
    s.milestones = {};
    for (const d of NEW_MILESTONES) s.milestones[d.id] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: d.removeAfterRound ?? null };
  });
}

const game = (): GameState => kgame(2, M);
const owns = (s: GameState, p: PlayerId, id: MilestoneId) => Boolean(s.players[p]?.milestones[id]);
const restaurantOf = (s: GameState, p: PlayerId) => Object.values(s.board.restaurants).find((r) => r.owner === p) as NonNullable<GameState['board']['restaurants'][string]>;
const from = (s: GameState) => ({ kind: 'restaurant' as const, restaurantId: restaurantOf(s, 'p1').id, corner: 'NW' as const });
const line = (cells: [number, number][]): Cell[] => cells.map(([x, y]) => ({ x, y }));
const beachIds = (s: GameState, p: PlayerId) => (s.players[p]?.beach ?? []).map((u) => s.players[p]?.employees[u]?.employeeId);
const campaigns = (s: GameState) => Object.values(s.board.campaigns);

const campaign = (cardUid: Uid, campaignKind: 'billboard' | 'mailbox' | 'radio', tileNumber: number, x: number, y: number, w: number, h: number, duration: number, goods = ['burger']): Action => ({
  type: 'work.placeCampaign',
  playerId: 'p1',
  cardUid,
  campaignKind,
  tileNumber,
  goods: goods as never,
  placement: { kind: 'board', x, y, w, h },
  duration,
});

const airplane = (cardUid: Uid, tileNumber: number, offset: number, width: 1 | 3 | 5, goods: string[]): Action => ({
  type: 'work.placeCampaign',
  playerId: 'p1',
  cardUid,
  campaignKind: 'airplane',
  tileNumber,
  goods: goods as never,
  placement: { kind: 'airplane', side: 'N', offset, width },
  duration: 2,
});

describe('New Milestones setup (ketchup.md §3 Setup, Hard choices built in)', () => {
  it('§3 Setup: the 17 new milestones replace the base set; "Remove after turn 2" on marketeer / trainer / recruiting girl', () => {
    const s = newGame(2, 1, MAP3, { modules: M });
    const ids = Object.keys(s.milestones).sort();
    expect(ids).toEqual(NEW_MILESTONES.map((d) => d.id).sort());
    expect(ids).toHaveLength(17);
    for (const b of BASE_MILESTONE_IDS) expect(s.milestones[b]).toBeUndefined();
    const marked = ids.filter((id) => s.milestones[id as MilestoneId]?.removeAfterRound === 2).sort();
    expect(marked).toEqual([ID('first_marketeer_used'), ID('first_recruiting_girl_used'), ID('first_trainer_used')]);
    for (const id of ids) if (!marked.includes(id)) expect(s.milestones[id as MilestoneId]?.removeAfterRound).toBeNull();
  });

  it('§3 Hard choices: after round 2 the three marked milestones are crossed out if unclaimed; the rest stay', () => {
    const s = newGame(2, 1, MAP3, { modules: M });
    s.round = 2;
    crossOutMilestones(kctx(s));
    expect(s.milestones[ID('first_marketeer_used')]?.removed).toBe(true);
    expect(s.milestones[ID('first_trainer_used')]?.removed).toBe(true);
    expect(s.milestones[ID('first_recruiting_girl_used')]?.removed).toBe(true);
    expect(s.milestones[ID('first_burger_sold')]?.removed).toBe(false);
  });

  it('§3: the first restaurants placed at setup do not claim "First new restaurant"', () => {
    const s = game();
    expect(s.milestones[ID('first_new_restaurant')]?.claimedBy).toEqual([]);
  });
});

describe('§3 First marketeer used', () => {
  it('§3 First marketeer used: a marketing trainee placing a billboard claims it (and First marketing trainee used)', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['marketing_trainee'] });
    const t = act(s, campaign(work[0] as Uid, 'billboard', 14, 3, 0, 2, 1, 2));
    expect(owns(t, 'p1', ID('first_marketeer_used'))).toBe(true);
    expect(owns(t, 'p1', ID('first_marketing_trainee_used'))).toBe(true);
  });

  it('§3 First marketeer used (1): +$5 per demand counter your marketeer campaigns place in Marketing; pizza radios pay nothing', () => {
    const ctx = market(
      nb()
        .milestone('p1', ID('first_marketeer_used'))
        .marketeerCampaign('brand_director', 'bd1', { owner: 'p1', kind: 'radio', number: 1, goods: ['burger'], placement: { kind: 'board', x: 3, y: 5, w: 1, h: 1 }, remaining: 2, id: 'c1' })
        .campaign({ owner: 'p1', kind: 'radio', number: 2, goods: ['pizza'], placement: { kind: 'board', x: 3, y: 6, w: 1, h: 1 }, remaining: 2, marketeer: null, source: 'pizzaRadio', id: 'c2' }),
    );
    const byC1 = ctx.of('demandPlaced').filter((e) => e.campaignId === 'c1').reduce((a, e) => a + e.tokens.length, 0);
    const byC2 = ctx.of('demandPlaced').filter((e) => e.campaignId === 'c2').reduce((a, e) => a + e.tokens.length, 0);
    expect(byC1).toBe(2); // houses 2 and 10
    expect(byC2).toBe(2);
    expect(ctx.state.players.p1?.cash).toBe(10);
  });

  it('§3 First marketeer used (1): no cash without the milestone', () => {
    const ctx = market(
      nb().marketeerCampaign('brand_director', 'bd1', { owner: 'p1', kind: 'radio', number: 1, goods: ['burger'], placement: { kind: 'board', x: 3, y: 5, w: 1, h: 1 }, remaining: 2 }),
    );
    expect(ctx.of('demandPlaced').length).toBeGreaterThan(0);
    expect(ctx.state.players.p1?.cash).toBe(0);
  });

  it('§3 First marketeer used (2): Dinnertime score is price + distance − 2 (revenue unchanged)', () => {
    // p1 is 0 borders from house 2, p2 1 border: p2's 10 + 1 − 2 = 9 beats p1's 10.
    const ctx = dine(
      nb()
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 5, 3, 'NW')
        .milestone('p2', ID('first_marketeer_used'))
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger']),
    );
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 10 });
  });
});

describe('§3 First marketing trainee used', () => {
  it('§3 First marketing trainee used: a free Kitchen Trainee and Errand Boy go to the beach', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['marketing_trainee'] });
    const kt = s.supply.kitchen_trainee ?? 0;
    const eb = s.supply.errand_boy ?? 0;
    const t = act(s, campaign(work[0] as Uid, 'billboard', 14, 3, 0, 2, 1, 2));
    expect(beachIds(t, 'p1').sort()).toEqual(['errand_boy', 'kitchen_trainee']);
    expect(t.supply.kitchen_trainee).toBe(kt - 1);
    expect(t.supply.errand_boy).toBe(eb - 1);
  });
});

describe('§3 First campaign manager used', () => {
  it('§3 First campaign manager used: second tile of the same type, good and duration, linked both ways; the manager is busy on both', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['campaign_manager'] });
    const cm = work[0] as Uid;
    const t = act(s, campaign(cm, 'mailbox', 9, 3, 0, 1, 1, 3));
    expect(owns(t, 'p1', ID('first_campaign_manager_used'))).toBe(true);
    const head = t.pending[0];
    expect(head).toMatchObject({ kind: 'secondCampaign', player: 'p1', optional: true });
    const choiceId = head?.id as string;
    expect(legalActions(t, 'p1').some((a) => a.kind === 'placement' && a.actionType === 'ketchup:newMilestones.placeSecondCampaign')).toBe(true);
    const opts = legalPlacements(t, 'p1', { kind: 'campaign', choiceId });
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(o).toMatchObject({ kind: 'campaign', campaignKind: 'mailbox' });
    // A billboard tile is not "the same type".
    expect(rejected(t, { type: 'ketchup:newMilestones.placeSecondCampaign', playerId: 'p1', choiceId, tileNumber: 14, placement: { kind: 'board', x: 3, y: 1, w: 2, h: 1 } }).code).toBe('ILLEGAL_PLACEMENT');
    expect(rejected(t, { type: 'ketchup:newMilestones.placeSecondCampaign', playerId: 'p2', choiceId, tileNumber: 10, placement: { kind: 'board', x: 3, y: 1, w: 1, h: 1 } }).code).toBe('NOT_YOUR_TURN');
    const u = act(t, { type: 'ketchup:newMilestones.placeSecondCampaign', playerId: 'p1', choiceId, tileNumber: 10, placement: { kind: 'board', x: 3, y: 1, w: 1, h: 1 } });
    expect(u.pending).toEqual([]);
    const first = campaigns(u).find((c) => c.number === 9);
    const second = campaigns(u).find((c) => c.number === 10);
    expect(second).toMatchObject({ kind: 'mailbox', goods: ['burger'], remaining: 3, eternal: false, marketeer: cm, source: 'marketeer', linked: [first?.id] });
    expect(first?.linked).toEqual([second?.id]);
    expect(u.players.p1?.busy[cm]).toEqual([first?.id, second?.id]);
    expect(u.marketingTiles).not.toContain(10);
  });

  it('§3 First campaign manager used: the second tile may be declined; a second campaign manager this turn gets nothing', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['campaign_manager', 'campaign_manager'] });
    const t = act(s, campaign(work[0] as Uid, 'mailbox', 9, 3, 0, 1, 1, 3));
    const u = act(t, { type: 'choice.decline', playerId: 'p1', choiceId: t.pending[0]?.id as string });
    expect(u.pending).toEqual([]);
    expect(campaigns(u)).toHaveLength(1);
    const v = act(u, campaign(work[1] as Uid, 'mailbox', 10, 3, 1, 1, 1, 2));
    expect(v.pending).toEqual([]);
    expect(campaigns(v)).toHaveLength(2);
  });

  it('§3 First campaign manager used: the manager returns only when both linked campaigns are gone', () => {
    const ctx = market(
      nb()
        .marketeerCampaign('campaign_manager', 'cm1', { owner: 'p1', kind: 'mailbox', number: 9, goods: ['burger'], placement: { kind: 'board', x: 3, y: 5, w: 1, h: 1 }, remaining: 1, id: 'c1' })
        .campaign({ owner: 'p1', kind: 'mailbox', number: 10, goods: ['burger'], placement: { kind: 'board', x: 3, y: 6, w: 1, h: 1 }, remaining: 2, marketeer: 'cm1', id: 'c2' })
        .mutate((s) => {
          const p = s.players.p1 as NonNullable<GameState['players'][string]>;
          p.busy.cm1 = ['c1', 'c2'];
          (s.board.campaigns.c1 as NonNullable<GameState['board']['campaigns'][string]>).linked = ['c2'];
          (s.board.campaigns.c2 as NonNullable<GameState['board']['campaigns'][string]>).linked = ['c1'];
        }),
    );
    expect(ctx.state.board.campaigns.c1).toBeUndefined();
    expect(ctx.state.players.p1?.busy.cm1).toEqual(['c2']);
    expect(ctx.state.players.p1?.beach).not.toContain('cm1');
  });
});

describe('§3 First brand manager used', () => {
  it('§3 First brand manager used: the claiming airplane may carry 2 different goods; a later brand manager may not', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['brand_manager', 'brand_manager'] });
    expect(rejected(s, airplane(work[0] as Uid, 4, 0, 1, ['burger', 'burger'])).message).toMatch(/different/);
    const t = act(s, airplane(work[0] as Uid, 4, 0, 1, ['burger', 'pizza']));
    expect(owns(t, 'p1', ID('first_brand_manager_used'))).toBe(true);
    expect(campaigns(t)[0]).toMatchObject({ kind: 'airplane', goods: ['burger', 'pizza'] });
    expect(rejected(t, airplane(work[1] as Uid, 5, 3, 3, ['burger', 'pizza'])).code).toBe('INVALID_PAYLOAD');
    expect(act(t, airplane(work[1] as Uid, 5, 3, 3, ['beer'])).board.campaigns).toBeDefined();
  });

  it('§3 First brand manager used: a brand manager placing a mailbox first claims it and forfeits the 2-good airplane', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['brand_manager', 'brand_manager'] });
    const t = act(s, campaign(work[0] as Uid, 'mailbox', 9, 3, 0, 1, 1, 2));
    expect(owns(t, 'p1', ID('first_brand_manager_used'))).toBe(true);
    expect(rejected(t, airplane(work[1] as Uid, 4, 0, 1, ['burger', 'pizza'])).code).toBe('INVALID_PAYLOAD');
  });
});

describe('§3 First brand director used', () => {
  it('§3 First brand director used: radios become eternal; the director stays busy and keeps its salary', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['brand_director'] });
    const bd = work[0] as Uid;
    const t = act(s, campaign(bd, 'radio', 1, 3, 1, 1, 1, 3));
    expect(owns(t, 'p1', ID('first_brand_director_used'))).toBe(true);
    expect(campaigns(t)[0]).toMatchObject({ kind: 'radio', eternal: true, remaining: 1, marketeer: bd });
    expect(t.players.p1?.busy[bd]).toHaveLength(1);
    expect(isSalaried(t, contentFor(M), 'p1', bd)).toBe(true);
  });

  it('§3 First brand director used: only radios become eternal', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['brand_director'] });
    const t = act(s, airplane(work[0] as Uid, 4, 0, 1, ['burger']));
    expect(owns(t, 'p1', ID('first_brand_director_used'))).toBe(true);
    expect(campaigns(t)[0]).toMatchObject({ kind: 'airplane', eternal: false, remaining: 2 });
  });

  it('§3 First brand director used: an eternal radio never ticks; its director never returns', () => {
    const ctx = market(
      nb()
        .milestone('p1', ID('first_brand_director_used'))
        .marketeerCampaign('brand_director', 'bd1', { owner: 'p1', kind: 'radio', number: 1, goods: ['burger'], placement: { kind: 'board', x: 3, y: 5, w: 1, h: 1 }, remaining: 1, eternal: true, id: 'c1' }),
    );
    expect(ctx.state.board.campaigns.c1).toMatchObject({ eternal: true, remaining: 1 });
    expect(ctx.state.players.p1?.busy.bd1).toEqual(['c1']);
    expect(isSalaried(ctx.state, contentFor(M), 'p1', 'bd1')).toBe(true);
  });
});

describe('§3 First burger sold', () => {
  it('§3 First burger sold: the seller\'s CEO has 4 slots for the rest of the game', () => {
    const ctx = dine(nb().restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger']));
    const s = ctx.state;
    expect(owns(s, 'p1', ID('first_burger_sold'))).toBe(true);
    expect(ceoSlotsFor(s, contentFor(M), 'p1')).toBe(4);
    expect(ceoSlotsFor(s, contentFor(M), 'p2')).toBe(s.ceoSlots);
  });
});

describe('§3 First pizza sold', () => {
  /** p1 sells pizza to placed house 1, house 2, placed house 3 and house 10 (in that order). */
  const fourPizzaHouses = (b: StateBuilder) =>
    b
      .placedHouse(1, 3, 8, 'S')
      .placedHouse(3, 8, 8, 'S')
      .restaurant('p1', 3, 3, 'NW')
      .card('p2', 'waitress', 'work') // p2 must confirm Payday, so the game stops there
      .inventory('p1', { pizza: 4 })
      .demand(1, ['pizza'])
      .demand(2, ['pizza'])
      .demand(3, ['pizza'])
      .demand(10, ['pizza']);

  it('§3 First pizza sold: a 2-turn pizza radio (radio #1–3, not linked to a marketeer) on the tile of each of the first 3 pizza houses', () => {
    const b = fourPizzaHouses(nb());
    const ctx = dine(b);
    expect(ctx.of('sale')).toHaveLength(4);
    expect(owns(ctx.state, 'p1', ID('first_pizza_sold'))).toBe(true);
    const houses = [b.houseId(1), b.houseId(2), b.houseId(3)];
    expect(ctx.state.pending.map((c) => c.kind === 'pizzaRadio' && c.houseId)).toEqual(houses);
    expect(ctx.state.pending.every((c) => c.player === 'p1' && !c.optional)).toBe(true);

    let s = ctx.state;
    // Off the house's tile, and someone else's choice, are rejected.
    const head0 = s.pending[0]?.id as string;
    expect(rejected(s, { type: 'ketchup:newMilestones.placePizzaRadio', playerId: 'p1', choiceId: head0, x: 3, y: 1 }).code).toBe('ILLEGAL_PLACEMENT');
    expect(rejected(s, { type: 'ketchup:newMilestones.placePizzaRadio', playerId: 'p2', choiceId: head0, x: 3, y: 5 }).code).toBe('NOT_YOUR_TURN');
    expect(legalActions(s, 'p1').some((a) => a.kind === 'placement' && a.actionType === 'ketchup:newMilestones.placePizzaRadio')).toBe(true);

    for (const houseId of houses) {
      const head = s.pending[0];
      if (head?.kind !== 'pizzaRadio') throw new Error('expected a pizza radio choice');
      const opts = legalPlacements(s, 'p1', { kind: 'pizzaRadio', choiceId: head.id });
      expect(opts.length).toBeGreaterThan(0);
      const tiles = new Set((s.board.houses[houseId]?.cells ?? []).map((c) => tileOf(s.board, c)));
      for (const o of opts) {
        if (o.kind !== 'pizzaRadio') throw new Error('kind');
        expect(tiles.has(tileOf(s.board, { x: o.x, y: o.y }))).toBe(true);
      }
      const o = opts[0] as { x: number; y: number };
      s = act(s, { type: 'ketchup:newMilestones.placePizzaRadio', playerId: 'p1', choiceId: head.id, x: o.x, y: o.y });
    }
    const radios = campaigns(s).filter((c) => c.source === 'pizzaRadio');
    expect(radios.map((c) => c.number)).toEqual([1, 2, 3]);
    for (const r of radios) expect(r).toMatchObject({ owner: 'p1', kind: 'radio', goods: ['pizza'], remaining: 2, eternal: false, marketeer: null });
    expect(s.pending).toEqual([]);
    expect(s.phase.kind).toBe('payday');
  });

  it('§3 First pizza sold: forfeited when no radio tile is left (Q-K4)', () => {
    const ctx = dine(fourPizzaHouses(nb()).mutate((s) => (s.marketingTiles = s.marketingTiles.filter((n) => n > 3))));
    expect(owns(ctx.state, 'p1', ID('first_pizza_sold'))).toBe(true);
    expect(ctx.state.pending).toEqual([]);
    expect(ctx.of('choiceResolved').filter((e) => e.declined)).toHaveLength(3);
  });

  it('§3 First pizza sold: with one radio tile left only the first radio is placed, the rest are forfeited', () => {
    const ctx = dine(fourPizzaHouses(nb()).mutate((s) => (s.marketingTiles = s.marketingTiles.filter((n) => n !== 1 && n !== 2))));
    expect(ctx.state.pending).toHaveLength(3);
    const head = ctx.state.pending[0];
    const opts = legalPlacements(ctx.state, 'p1', { kind: 'pizzaRadio', choiceId: head?.id as string });
    const o = opts[0] as { x: number; y: number };
    const s = act(ctx.state, { type: 'ketchup:newMilestones.placePizzaRadio', playerId: 'p1', choiceId: head?.id as string, x: o.x, y: o.y });
    expect(campaigns(s).filter((c) => c.source === 'pizzaRadio').map((c) => c.number)).toEqual([3]);
    expect(s.pending).toEqual([]);
  });

  it('§3 First pizza sold: pizza radios stay 2-turn even with First brand director used (Q-K14)', () => {
    const ctx = dine(fourPizzaHouses(nb().milestone('p1', ID('first_brand_director_used'))));
    const head = ctx.state.pending[0];
    const o = legalPlacements(ctx.state, 'p1', { kind: 'pizzaRadio', choiceId: head?.id as string })[0] as { x: number; y: number };
    const s = act(ctx.state, { type: 'ketchup:newMilestones.placePizzaRadio', playerId: 'p1', choiceId: head?.id as string, x: o.x, y: o.y });
    expect(campaigns(s).find((c) => c.source === 'pizzaRadio')).toMatchObject({ eternal: false, remaining: 2 });
  });

  it('§3 First pizza sold: only in the round it is claimed', () => {
    const ctx = dine(fourPizzaHouses(nb().milestone('p1', ID('first_pizza_sold'), 2)));
    expect(ctx.of('sale')).toHaveLength(4);
    expect(ctx.state.pending).toEqual([]);
  });
});

describe('§3 First lemonade sold', () => {
  it('§3 First lemonade sold: a card at work may be trained into a card of the same colour; it stays in its slot', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['trainer', 'management_trainee'], milestones: [ID('first_lemonade_sold')] });
    const [tr, mt] = work as [Uid, Uid];
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: tr, targetUid: mt, toEmployeeId: 'new_business_developer' }).message).toMatch(/beach/);
    const t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: tr, targetUid: mt, toEmployeeId: 'junior_vp' });
    expect(t.players.p1?.employees[mt]?.employeeId).toBe('junior_vp');
    expect(t.players.p1?.structure.ceoSubs).toContain(mt);
  });

  it('§3 First lemonade sold: legal actions offer training cards at work, same colour only, never the trainer or the CEO (KX p18)', () => {
    const trains = (st: GameState) => legalActions(st, 'p1').flatMap((l) => (l.kind === 'ready' && l.action.type === 'work.train' ? [l.action] : []));
    const { s, work, ceo } = workingTurn(game(), 'p1', { work: ['trainer', 'management_trainee'], milestones: [ID('first_lemonade_sold')] });
    const [tr, mt] = work as [Uid, Uid];
    const offered = trains(s);
    expect(offered.map((a) => [a.targetUid, a.toEmployeeId])).toEqual([[mt, 'junior_vp']]);
    expect(offered.some((a) => a.targetUid === tr || a.targetUid === ceo)).toBe(false);
    for (const a of offered) expect(validateAction(s, a).ok).toBe(true);
    const without = workingTurn(game(), 'p1', { work: ['trainer', 'management_trainee'] });
    expect(trains(without.s)).toEqual([]);
  });

  it('§3 First lemonade sold: without the milestone cards at work cannot be trained', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['trainer', 'management_trainee'] });
    const [tr, mt] = work as [Uid, Uid];
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: tr, targetUid: mt, toEmployeeId: 'junior_vp' }).message).toMatch(/beach/);
  });

  it('§3 First lemonade sold: the trained card may act only if the old card had not acted', () => {
    const fresh = workingTurn(game(), 'p1', { work: ['trainer', 'errand_boy'], milestones: [ID('first_lemonade_sold')] });
    const [tr, eb] = fresh.work as [Uid, Uid];
    const t = act(fresh.s, { type: 'work.train', playerId: 'p1', trainerUid: tr, targetUid: eb, toEmployeeId: 'cart_operator' });
    expect(t.turn?.uses[eb]).toBe(1);

    const acted = workingTurn(game(), 'p1', { work: ['trainer', 'errand_boy'], milestones: [ID('first_lemonade_sold')] });
    const [tr2, eb2] = acted.work as [Uid, Uid];
    acted.s.turn?.used.push(eb2);
    const u = act(acted.s, { type: 'work.train', playerId: 'p1', trainerUid: tr2, targetUid: eb2, toEmployeeId: 'cart_operator' });
    expect(u.turn?.uses[eb2]).toBe(0);
  });
});

describe('§3 First beer sold', () => {
  /** Payday: p1 has 3 salaried cards at work, $20, 3 beers; p2 has a waitress (so both must confirm). */
  const payday = (withBeer = true) => {
    let b = nb()
      .card('p1', 'junior_vp', 'work')
      .card('p1', 'junior_vp', 'work')
      .card('p1', 'junior_vp', 'work')
      .card('p2', 'waitress', 'work')
      .cash('p1', 20)
      .inventory('p1', { beer: 3 })
      .milestone('p1', ID('first_coke_sold')) // freezer keeps the leftovers, so stock is visible after Clean up
      .phase({ kind: 'dinnertime', houses: [], idx: 0 });
    if (withBeer) b = b.milestone('p1', ID('first_beer_sold'));
    const s = fromPhase(b.build()).state;
    expect(s.phase.kind).toBe('payday');
    return s;
  };

  it('§3 First beer sold: 1 token = 1 salary; tokens leave your stock (p1 confirms first)', () => {
    const s = payday();
    expect(salaryBreakdown(s, contentFor(M), 'p1').salaried).toBe(3);
    const t = act(s, { type: 'payday.confirm', playerId: 'p1', tokens: { beer: 2 } });
    const r = actE(t, { type: 'payday.confirm', playerId: 'p2' });
    expect(r.events.find((e) => e.type === 'salaryPaid' && e.player === 'p1')).toMatchObject({ paid: 5 });
    expect(r.state.players.p1?.cash).toBe(15);
    expect(r.state.players.p1?.freezer).toEqual({ beer: 1 });
  });

  it('§3 First beer sold: tokens declared by the last player to confirm count too', () => {
    const s = payday();
    const t = act(s, { type: 'payday.confirm', playerId: 'p2' });
    const r = actE(t, { type: 'payday.confirm', playerId: 'p1', tokens: { beer: 2 } });
    // Regression: the last confirmer's tokens must count although salaries settle during that action.
    expect(r.state.players.p1?.salaryPaidThisRound).toBe(5);
    expect(r.state.players.p1?.cash).toBe(15);
    expect(r.state.players.p1?.freezer).toEqual({ beer: 1 });
    // Recorded before dispatch (beforeAction hook): no refund, the salary event already shows $5.
    expect(r.events.find((e) => e.type === 'salaryPaid' && e.player === 'p1')).toMatchObject({ paid: 5 });
    expect(r.events.some((e) => e.type === 'cashChanged' && e.player === 'p1' && e.delta > 0)).toBe(false);
  });

  it('§3 First beer sold: with no cash, tokens covering every salary avoid firing (last to confirm)', () => {
    const s = payday();
    (s.players.p1 as NonNullable<GameState['players'][string]>).cash = 0;
    const t = act(s, { type: 'payday.confirm', playerId: 'p2' });
    const r = actE(t, { type: 'payday.confirm', playerId: 'p1', tokens: { beer: 3 } });
    expect(r.state.pending).toEqual([]);
    expect(r.events.some((e) => e.type === 'employeeFired')).toBe(false);
    expect(r.events.find((e) => e.type === 'salaryPaid' && e.player === 'p1')).toMatchObject({ paid: 0 });
    expect(r.state.players.p1).toMatchObject({ cash: 0, bankrupt: false, freezer: {} });
  });

  it('§3 First beer sold: a holder with nobody to fire is still asked, so goods can pay salaries', () => {
    const b = (beer: boolean) => {
      let x = nb()
        .marketeerCampaign('campaign_manager', 'cm', { owner: 'p1', kind: 'billboard', number: 11, goods: ['burger'], placement: { kind: 'board', x: 0, y: 0, w: 2, h: 2 }, remaining: 2 })
        .card('p2', 'waitress', 'work')
        .cash('p1', 0)
        .inventory('p1', { beer: 1 })
        .phase({ kind: 'dinnertime', houses: [], idx: 0 });
      if (beer) x = x.milestone('p1', ID('first_beer_sold'));
      return fromPhase(x.build()).state;
    };
    expect(b(false).awaiting.players).not.toContain('p1');
    const s = b(true);
    expect(s.phase.kind).toBe('payday');
    expect(s.awaiting).toEqual({ kind: 'payday.fire', players: ['p1', 'p2'] });
    const t = act(s, { type: 'payday.confirm', playerId: 'p1', tokens: { beer: 1 } });
    const r = actE(t, { type: 'payday.confirm', playerId: 'p2' });
    expect(r.events.find((e) => e.type === 'salaryPaid' && e.player === 'p1')).toMatchObject({ paid: 0 });
    expect(r.events.some((e) => e.type === 'employeeFired' && e.player === 'p1')).toBe(false);
  });

  it('§3 First beer sold: rejected without the milestone, for coffee, or beyond your stock', () => {
    expect(rejected(payday(false), { type: 'payday.confirm', playerId: 'p1', tokens: { beer: 1 } }).message).toMatch(/First beer sold/);
    const s = payday();
    expect(rejected(s, { type: 'payday.confirm', playerId: 'p1', tokens: { coffee: 1 } as never }).message).toMatch(/coffee cannot pay/);
    expect(rejected(s, { type: 'payday.confirm', playerId: 'p1', tokens: { beer: 4 } }).message).toMatch(/Only 3/);
  });
});

describe('§3 First soda sold', () => {
  it('§3 First soda sold: selling a soda gives a freezer for 10 items', () => {
    const b = nb().restaurant('p1', 3, 3, 'NW').inventory('p1', { soft_drink: 1 }).demand(2, ['soft_drink']);
    expect(freezerCapacity(b.build(), 'p1')).toBe(0);
    const ctx = dine(b);
    expect(owns(ctx.state, 'p1', ID('first_coke_sold'))).toBe(true);
    expect(freezerCapacity(ctx.state, 'p1')).toBe(10);
    expect(freezerCapacity(ctx.state, 'p2')).toBe(0);
  });
});

describe('§3 First recruiting girl used', () => {
  it('§3 First recruiting girl used: a salary-free Executive VP from the supply', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['recruiting_girl'] });
    const evp = s.supply.executive_vp ?? 0;
    expect(evp).toBeGreaterThan(0);
    const t = act(s, { type: 'work.recruit', playerId: 'p1', cardUid: work[0] as Uid, employeeId: 'waitress' });
    expect(owns(t, 'p1', ID('first_recruiting_girl_used'))).toBe(true);
    const p = t.players.p1 as NonNullable<GameState['players'][string]>;
    const uid = p.beach.find((u) => p.employees[u]?.employeeId === 'executive_vp') as Uid;
    expect(p.employees[uid]).toMatchObject({ salaryFree: true });
    expect(t.supply.executive_vp).toBe(evp - 1);
    expect(isSalaried(t, contentFor(M), 'p1', uid)).toBe(false);
  });

  it('§3 First recruiting girl used: from the box when the supply has none', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['recruiting_girl'] });
    s.supply.executive_vp = 0;
    const t = act(s, { type: 'work.recruit', playerId: 'p1', cardUid: work[0] as Uid, employeeId: 'waitress' });
    const p = t.players.p1 as NonNullable<GameState['players'][string]>;
    const evps = p.beach.filter((u) => p.employees[u]?.employeeId === 'executive_vp');
    expect(evps).toHaveLength(1);
    expect(p.employees[evps[0] as Uid]).toMatchObject({ salaryFree: true });
    expect(t.supply.executive_vp).toBe(0);
  });
});

describe('§3 First trainer used', () => {
  it('§3 First trainer used: training with a trainer gives a free Trainer', () => {
    const { s, work, beach } = workingTurn(game(), 'p1', { work: ['trainer'], beach: ['management_trainee'] });
    const t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'junior_vp' });
    expect(owns(t, 'p1', ID('first_trainer_used'))).toBe(true);
    expect(beachIds(t, 'p1').sort()).toEqual(['junior_vp', 'trainer']);
  });

  const broke = (withTrainer: boolean) => {
    let b = nb()
      .card('p1', 'junior_vp', 'work')
      .card('p1', 'junior_vp', 'work')
      .card('p1', 'junior_vp', 'work')
      .cash('p1', 7)
      .phase({ kind: 'dinnertime', houses: [], idx: 0 });
    if (withTrainer) b = b.milestone('p1', ID('first_trainer_used'));
    return fromPhase(b.build()).state;
  };

  it('§3 First trainer used: no forced firing — pay what you can, no forcedFire choice, not bankrupt', () => {
    const r = actE(broke(true), { type: 'payday.confirm', playerId: 'p1' });
    expect(r.events.some((e) => e.type === 'choicePending' && e.kind === 'forcedFire')).toBe(false);
    expect(r.events.find((e) => e.type === 'salaryPaid' && e.player === 'p1')).toMatchObject({ paid: 7 });
    expect(r.state.players.p1).toMatchObject({ cash: 0, bankrupt: false });
    expect(Object.keys(r.state.players.p1?.employees ?? {})).toHaveLength(4);
  });

  it('KX p19: with First beer sold, goods must cover salaries the cash cannot (First trainer used: no firing)', () => {
    const s = fromPhase(
      nb()
        .card('p1', 'junior_vp', 'work')
        .card('p1', 'junior_vp', 'work')
        .card('p1', 'junior_vp', 'work')
        .cash('p1', 7)
        .inventory('p1', { burger: 3, coffee: 2 } as never)
        .milestone('p1', ID('first_trainer_used'))
        .milestone('p1', ID('first_beer_sold'))
        .phase({ kind: 'dinnertime', houses: [], idx: 0 })
        .build(),
    ).state;
    // $15 owed, $7 cash: 2 salaries ($10) must be paid with goods, then $5 in cash.
    const r = actE(s, { type: 'payday.confirm', playerId: 'p1' });
    expect(r.events.find((e) => e.type === 'salaryPaid' && e.player === 'p1')).toMatchObject({ paid: 5 });
    expect(r.state.players.p1?.cash).toBe(2);
    // Coffee cannot pay salaries; the burger left over is thrown away at Clean up.
    expect(r.events.find((e) => e.type === 'foodDiscarded' && e.player === 'p1')).toMatchObject({ goods: { burger: 1, coffee: 2 } });
  });

  it('§3 First trainer used: without it the player must fire (control)', () => {
    const s = act(broke(false), { type: 'payday.confirm', playerId: 'p1' });
    expect(s.pending[0]).toMatchObject({ kind: 'forcedFire', player: 'p1' });
  });
});

describe('§3 First discount manager used', () => {
  it('§3 First discount manager used: claimed at the start of Dinnertime with a discount manager at work, without selling', () => {
    const s = fromPhase(nb().card('p1', 'discount_manager', 'work').card('p2', 'pricing_manager', 'work').phase({ kind: 'working', player: 'p2', idx: 2 }).build()).state;
    expect(s.players.p1?.milestones[ID('first_discount_manager_used')]).toMatchObject({ phase: 'dinnertime' });
    expect(owns(s, 'p2', ID('first_discount_manager_used'))).toBe(false);
  });

  /** Round 3 Restructuring; p1 holds `card` in hand and earned the milestone in round `earned`. */
  const reveal = (card: 'discount_manager' | 'pricing_manager', earned: number) => {
    const s = nb()
      .bank({ cash: 500 })
      .card('p1', card, 'hand', 'dm-1')
      .milestone('p1', ID('first_discount_manager_used'), earned)
      .phase({ kind: 'restructuring' })
      .build();
    expect(s.phase.kind).toBe('restructuring');
    return act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: ['dm-1'], managerSubs: {} } });
  };

  it('§3 First discount manager used: $100 leaves the game at the next structure reveal when discounting $3+ (Q-K5)', () => {
    const t = reveal('discount_manager', 0);
    expect(t.bank.burned).toBe(100);
    expect(t.bank.cash).toBe(400);
    expect(t.round).toBe(3);
  });

  it('§3 First discount manager used: no second burn at the reveal of the claiming round; nothing with a discount under $3', () => {
    expect(reveal('discount_manager', 3).bank.burned).toBe(0);
    expect(reveal('pricing_manager', 0).bank.burned).toBe(0);
  });

  it('KX p19 "including this one": the claiming turn burns $100 when the milestone is claimed (Q-K5)', () => {
    const r = fromPhase(nb().bank({ cash: 500 }).card('p1', 'discount_manager', 'work').phase({ kind: 'working', player: 'p2', idx: 2 }).build());
    expect(owns(r.state, 'p1', ID('first_discount_manager_used'))).toBe(true);
    expect(r.state.bank.burned).toBe(100);
    expect(r.events.find((e) => e.type === 'bankBurned')).toMatchObject({ player: 'p1', amount: 100 });
  });

  it('KX p19 + p22: Night Shift doubles salary-free pricing managers, so 2 of them discount $4 and burn $100', () => {
    const s = kb(2, [...M, 'ketchup:nightShift'])
      .mutate((st) => {
        st.milestones = {};
        for (const d of NEW_MILESTONES) st.milestones[d.id] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: d.removeAfterRound ?? null };
      })
      .bank({ cash: 500 })
      .card('p1', 'ketchup:night_shift_manager', 'hand', 'ns')
      .card('p1', 'pricing_manager', 'hand', 'pm1')
      .card('p1', 'pricing_manager', 'hand', 'pm2')
      .milestone('p1', ID('first_discount_manager_used'), 0)
      .phase({ kind: 'restructuring' })
      .build();
    const t = act(s, { type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs: ['ns', 'pm1', 'pm2'], managerSubs: {} } });
    expect(t.bank.burned).toBe(100);
  });
});

describe('§3 First house built', () => {
  it('§3 First house built: building a house claims it', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['new_business_developer'] });
    const t = act(s, { type: 'work.placeHouse', playerId: 'p1', cardUid: work[0] as Uid, houseOrder: 1, x: 3, y: 8, gardenSide: 'W' });
    expect(owns(t, 'p1', ID('first_house_built'))).toBe(true);
  });

  it('§3 First house built: training actions stack on one employee', () => {
    const train = (st: GameState, tr: Uid, target: Uid, to: 'junior_vp' | 'vice_president') => ({ type: 'work.train' as const, playerId: 'p1', trainerUid: tr, targetUid: target, toEmployeeId: to });
    const w = workingTurn(game(), 'p1', { work: ['trainer', 'trainer'], beach: ['management_trainee'], milestones: [ID('first_house_built')] });
    let t = act(w.s, train(w.s, w.work[0] as Uid, w.beach[0] as Uid, 'junior_vp'));
    t = act(t, train(t, w.work[1] as Uid, w.beach[0] as Uid, 'vice_president'));
    expect(t.players.p1?.employees[w.beach[0] as Uid]?.employeeId).toBe('vice_president');

    const c = workingTurn(game(), 'p1', { work: ['trainer', 'trainer'], beach: ['management_trainee'] });
    const u = act(c.s, train(c.s, c.work[0] as Uid, c.beach[0] as Uid, 'junior_vp'));
    expect(rejected(u, train(u, c.work[1] as Uid, c.beach[0] as Uid, 'vice_president')).message).toMatch(/already trained/);
  });
});

describe('§3 First new restaurant', () => {
  it('§3 First new restaurant: a free eternal mailbox in the new restaurant\'s block, any marketable good', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['local_manager'] });
    const t = act(s, { type: 'work.placeRestaurant', playerId: 'p1', cardUid: work[0] as Uid, x: 8, y: 8, entrance: 'NW' });
    expect(owns(t, 'p1', ID('first_new_restaurant'))).toBe(true);
    const head = t.pending[0];
    // KX p19 "allows you to": the free mailbox may be declined (Q-K36).
    expect(head).toMatchObject({ kind: 'freeMailbox', player: 'p1', optional: true });
    const choiceId = head?.id as string;
    expect(act(t, { type: 'choice.decline', playerId: 'p1', choiceId }).pending).toEqual([]);
    const opts = legalPlacements(t, 'p1', { kind: 'freeMailbox', choiceId });
    expect(opts.length).toBeGreaterThan(0);
    // Block bounded by the roads at x = 7, 12 and y = 7, 12.
    for (const o of opts) {
      if (o.kind !== 'freeMailbox') throw new Error('kind');
      expect(o.x >= 8 && o.x <= 11 && o.y >= 8 && o.y <= 11).toBe(true);
    }
    expect(rejected(t, { type: 'ketchup:newMilestones.placeFreeMailbox', playerId: 'p1', choiceId, x: 3, y: 0, good: 'burger' }).code).toBe('ILLEGAL_PLACEMENT');
    expect(rejected(t, { type: 'ketchup:newMilestones.placeFreeMailbox', playerId: 'p1', choiceId, x: 10, y: 8, good: 'coffee' as never }).message).toMatch(/cannot be marketed/);
    const u = act(t, { type: 'ketchup:newMilestones.placeFreeMailbox', playerId: 'p1', choiceId, x: 10, y: 8, good: 'lemonade' });
    expect(u.pending).toEqual([]);
    const mb = campaigns(u).find((c) => c.source === 'freeMailbox');
    expect(mb).toMatchObject({ owner: 'p1', kind: 'mailbox', number: 9, goods: ['lemonade'], eternal: true, marketeer: null, placement: { kind: 'board', x: 10, y: 8, w: 1, h: 1 } });
  });
});

describe('§3 First waitress used', () => {
  it('§3 First waitress used: tips claim it; salaries are $3 each; recruiting discounts stay $5', () => {
    const ctx = dine(nb().restaurant('p1', 3, 3, 'NW').card('p1', 'waitress', 'work').card('p1', 'junior_vp', 'work').card('p1', 'junior_vp', 'work').card('p1', 'junior_vp', 'work'));
    const s = ctx.state;
    expect(owns(s, 'p1', ID('first_waitress_used'))).toBe(true);
    (s.players.p1 as NonNullable<GameState['players'][string]>).unusedRecruitActions = 1;
    const bd = salaryBreakdown(s, contentFor(M), 'p1');
    expect(bd).toMatchObject({ salaried: 3, rate: 3, total: 3 * 3 - 5 });
    expect(salaryBreakdown(s, contentFor(M), 'p2').rate).toBe(5);
  });
});

describe('§3 First cart operator used', () => {
  const path = line([[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2]]);

  it('§3 First cart operator used: 4 per source, including the triggering haul', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['cart_operator'] });
    const t = act(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: { mode: 'road', from: from(s), path } });
    expect(owns(t, 'p1', ID('first_cart_operator_used'))).toBe(true);
    expect(t.players.p1?.inventory).toEqual({ lemonade: 4, beer: 4 });
  });

  it('KX p17: a cart operator haul that collects nothing does not count as used', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['cart_operator'] });
    const t = act(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: { mode: 'road', from: from(s), path: line([[3, 2]]) } });
    expect(t.players.p1?.inventory).toEqual({});
    expect(owns(t, 'p1', ID('first_cart_operator_used'))).toBe(false);
  });

  it('§3 First cart operator used: afterwards truck drivers collect 6 per source', () => {
    const { s, work } = workingTurn(game(), 'p1', { work: ['truck_driver'], milestones: [ID('first_cart_operator_used')] });
    const t = act(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: { mode: 'road', from: from(s), path } });
    expect(t.players.p1?.inventory).toEqual({ lemonade: 6, beer: 6 });
  });
});
