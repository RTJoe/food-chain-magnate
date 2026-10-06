/**
 * Phase 3 Working 9–5 (base.md §6; DLX p14–25) through the reducer. Map: helpers/game.ts MAP3.
 * p1's restaurant: (3,3) NW on tile (0,0), entrance touching roads (3,2) and (2,3).
 * p2's restaurant: (5,3) NW on tile (0,1).
 */
import { describe, expect, it } from 'vitest';
import type { Action, Cell, GameState, Uid } from '../../src/index.js';
import { applyAction, legalActions, legalPlacements, validateAction } from '../../src/index.js';
import { act, actE, newGame, rejected, throughSetup, workingTurn } from '../helpers/game.js';

const base = (): GameState => throughSetup(newGame(2));
const p1Restaurant = (s: GameState) => Object.values(s.board.restaurants).find((r) => r.owner === 'p1') as NonNullable<GameState['board']['restaurants'][string]>;
const from = (s: GameState) => ({ kind: 'restaurant' as const, restaurantId: p1Restaurant(s).id, corner: 'NW' as const });
const line = (cells: [number, number][]): Cell[] => cells.map(([x, y]) => ({ x, y }));

describe('turn structure (base.md §6, §6.1)', () => {
  it('§6: players act one at a time in turn order; ending the turn passes to the next player', () => {
    let s = base();
    s = act(s, { type: 'order.choosePosition', playerId: s.awaiting.players[0] as string, position: 0 });
    expect(s.phase.kind).toBe('working');
    const [first, second] = s.turnOrder as [string, string];
    expect(s.awaiting).toEqual({ kind: 'work', players: [first] });
    expect(rejected(s, { type: 'work.endTurn', playerId: second }).code).toBe('NOT_YOUR_TURN');
    const r = actE(s, { type: 'work.endTurn', playerId: first });
    expect(r.undoable).toBe(false);
    expect(r.state.awaiting).toEqual({ kind: 'work', players: [second] });
    expect(r.state.turn?.player).toBe(second);
  });

  it('§6.1: sub-steps are strictly ordered; a later step closes the earlier ones', () => {
    const { s, work, ceo } = workingTurn(base(), 'p1', { work: ['kitchen_trainee'] });
    const t = act(s, { type: 'work.produce', playerId: 'p1', cardUid: work[0] as Uid, food: 'pizza' });
    expect(t.turn?.stage).toBe('food');
    expect(rejected(t, { type: 'work.recruit', playerId: 'p1', cardUid: ceo, employeeId: 'waitress' }).message).toMatch(/over/);
  });

  it('a full round 1: hires go to the beach, Payday asks who may fire, then round 2 Restructuring', () => {
    let s = base();
    s = act(s, { type: 'order.choosePosition', playerId: s.awaiting.players[0] as string, position: 0 });
    for (const pid of [...s.turnOrder]) {
      const ceo = s.players[pid]?.structure.ceo as Uid;
      s = act(s, { type: 'work.recruit', playerId: pid, cardUid: ceo, employeeId: 'waitress' });
      s = act(s, { type: 'work.endTurn', playerId: pid });
    }
    expect(s.phase.kind).toBe('payday');
    expect([...s.awaiting.players].sort()).toEqual(['p1', 'p2']);
    for (const pid of ['p1', 'p2']) s = act(s, { type: 'payday.confirm', playerId: pid });
    expect(s.round).toBe(2);
    expect(s.phase.kind).toBe('restructuring');
    expect(s.players.p1?.beach).toEqual([]);
  });
});

describe('3a hire (base.md §6.2)', () => {
  it('§6.2: the CEO hires one entry-level card to the beach', () => {
    const { s, ceo } = workingTurn(base(), 'p1');
    const left = s.supply.waitress as number;
    const r = actE(s, { type: 'work.recruit', playerId: 'p1', cardUid: ceo, employeeId: 'waitress' });
    const uid = r.state.turn?.hired[0] as Uid;
    expect(r.state.players.p1?.employees[uid]?.employeeId).toBe('waitress');
    expect(r.state.players.p1?.beach).toContain(uid);
    expect(r.state.supply.waitress).toBe(left - 1);
    expect(r.undoable).toBe(true);
    expect(rejected(r.state, { type: 'work.recruit', playerId: 'p1', cardUid: ceo, employeeId: 'waitress' }).code).toBe('CARD_UNAVAILABLE');
    expect(rejected(s, { type: 'work.recruit', playerId: 'p1', cardUid: ceo, employeeId: 'junior_vp' }).message).toMatch(/entry-level/);
  });

  it('§6.2: recruiting girl +1 hire; "First to hire 3" counts the CEO and gives 2 management trainees', () => {
    const { s, work, ceo } = workingTurn(base(), 'p1', { work: ['recruiting_girl', 'recruiting_manager'] });
    let t = act(s, { type: 'work.recruit', playerId: 'p1', cardUid: ceo, employeeId: 'trainer' });
    t = act(t, { type: 'work.recruit', playerId: 'p1', cardUid: work[0] as Uid, employeeId: 'errand_boy' });
    expect(t.players.p1?.milestones.first_hire_3).toBeUndefined();
    t = act(t, { type: 'work.recruit', playerId: 'p1', cardUid: work[1] as Uid, employeeId: 'kitchen_trainee' });
    expect(t.players.p1?.milestones.first_hire_3).toBeDefined();
    const beach = (t.players.p1?.beach ?? []).map((u) => t.players.p1?.employees[u]?.employeeId);
    expect(beach.filter((e) => e === 'management_trainee')).toHaveLength(2);
  });

  it('§6.2: unused recruiting-manager / HR-director actions become $5 Payday discounts; CEO ones do not', () => {
    const { s, work, ceo } = workingTurn(base(), 'p1', { work: ['hr_director'] });
    let t = act(s, { type: 'work.recruit', playerId: 'p1', cardUid: work[0] as Uid, employeeId: 'waitress' });
    t = act(t, { type: 'work.skip', playerId: 'p1', cardUid: ceo });
    t = act(t, { type: 'work.endTurn', playerId: 'p1' });
    expect(t.players.p1?.unusedRecruitActions).toBe(3);
    const { s: s2, work: w2 } = workingTurn(base(), 'p1', { work: ['recruiting_manager'] });
    const t2 = act(s2, { type: 'work.skip', playerId: 'p1', cardUid: w2[0] as Uid });
    expect(t2.players.p1?.unusedRecruitActions).toBe(2);
  });

  it('§6.2 (DLX p16): an empty pile may be hired only if the card is trained up this turn', () => {
    const empty = (s: GameState) => ({ ...s, supply: { ...s.supply, marketing_trainee: 0 } });
    const { s: noTrainer, ceo: c0 } = workingTurn(base(), 'p1');
    expect(rejected(empty(noTrainer), { type: 'work.recruit', playerId: 'p1', cardUid: c0, employeeId: 'marketing_trainee' }).code).toBe('SUPPLY_EMPTY');

    const { s, work, ceo } = workingTurn(base(), 'p1', { work: ['trainer', 'kitchen_trainee'] });
    let t = act(empty(s), { type: 'work.recruit', playerId: 'p1', cardUid: ceo, employeeId: 'marketing_trainee' });
    const uid = t.turn?.mustTrain[0] as Uid;
    expect(uid).toBeDefined();
    expect(t.supply.marketing_trainee).toBe(0);
    expect(rejected(t, { type: 'work.produce', playerId: 'p1', cardUid: work[1] as Uid, food: 'burger' }).message).toMatch(/empty pile/);
    expect(rejected(t, { type: 'work.endTurn', playerId: 'p1' }).message).toMatch(/empty pile/);
    expect(rejected(t, { type: 'work.skip', playerId: 'p1', cardUid: work[0] as Uid }).message).toMatch(/empty pile/);
    const cm = t.supply.campaign_manager as number;
    t = act(t, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: uid, toEmployeeId: 'campaign_manager' });
    expect(t.players.p1?.employees[uid]?.employeeId).toBe('campaign_manager');
    expect(t.supply.marketing_trainee).toBe(0);
    expect(t.supply.campaign_manager).toBe(cm - 1);
    act(t, { type: 'work.endTurn', playerId: 'p1' });
  });
});

describe('3b train (base.md §6.3)', () => {
  it('§6.3: one step per action; only beach cards; old card back to the supply; "First to train"', () => {
    const { s, work, beach } = workingTurn(base(), 'p1', { work: ['trainer', 'waitress'], beach: ['management_trainee', 'waitress'] });
    const [trainer, waitressAtWork] = work as [Uid, Uid];
    const [mt, w] = beach as [Uid, Uid];
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: waitressAtWork, toEmployeeId: 'waitress' }).message).toMatch(/beach/);
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: w, toEmployeeId: 'junior_vp' }).message).toMatch(/cannot be trained/);
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: mt, toEmployeeId: 'vice_president' }).message).toMatch(/1 training action/);
    const before = { mt: s.supply.management_trainee as number, jvp: s.supply.junior_vp as number };
    const t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: mt, toEmployeeId: 'junior_vp' });
    expect(t.players.p1?.employees[mt]?.employeeId).toBe('junior_vp');
    expect(t.supply.management_trainee).toBe(before.mt + 1);
    expect(t.supply.junior_vp).toBe(before.jvp - 1);
    expect(t.players.p1?.milestones.first_train).toBeDefined();
  });

  it('§6.3: a coach may put 2 steps on one card; another trainer may not add to it without "First to pay $20"', () => {
    const setup = { work: ['coach', 'trainer'] as const, beach: ['management_trainee'] as const };
    const { s, work, beach } = workingTurn(base(), 'p1', { work: [...setup.work], beach: [...setup.beach] });
    const [coach, trainer] = work as [Uid, Uid];
    const mt = beach[0] as Uid;
    const t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: coach, targetUid: mt, toEmployeeId: 'vice_president' });
    expect(t.players.p1?.employees[mt]?.employeeId).toBe('vice_president');
    expect(rejected(t, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: mt, toEmployeeId: 'senior_vp' }).message).toMatch(/already trained/);

    const w = workingTurn(base(), 'p1', { work: [...setup.work], beach: [...setup.beach], milestones: ['first_pay_20'] });
    let u = act(w.s, { type: 'work.train', playerId: 'p1', trainerUid: w.work[0] as Uid, targetUid: w.beach[0] as Uid, toEmployeeId: 'vice_president' });
    u = act(u, { type: 'work.train', playerId: 'p1', trainerUid: w.work[1] as Uid, targetUid: w.beach[0] as Uid, toEmployeeId: 'senior_vp' });
    expect(u.players.p1?.employees[w.beach[0] as Uid]?.employeeId).toBe('senior_vp');
  });

  it('§6.3: a coach may split its two actions over two cards', () => {
    const { s, work, beach } = workingTurn(base(), 'p1', { work: ['coach'], beach: ['errand_boy', 'kitchen_trainee'] });
    let t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'cart_operator' });
    t = act(t, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[1] as Uid, toEmployeeId: 'pizza_cook' });
    expect(t.turn?.uses[work[0] as Uid]).toBe(0);
  });

  it('§6.3: no training into a 1x card you own; the target pile must not be empty', () => {
    const { s, work, beach } = workingTurn(base(), 'p1', { work: ['trainer'], beach: ['vice_president', 'guru', 'kitchen_trainee'] });
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'guru' }).code).toBe('UNIQUE_LIMIT');
    const t = { ...s, supply: { ...s.supply, burger_cook: 0 } };
    expect(rejected(t, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[2] as Uid, toEmployeeId: 'burger_cook' }).code).toBe('SUPPLY_EMPTY');
  });

  it('§6.3 (DLX p34): with "First to have $100" a CFO may not be trained', () => {
    const { s, work, beach } = workingTurn(base(), 'p1', { work: ['trainer'], beach: ['senior_vp'], milestones: ['first_100'] });
    expect(rejected(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'cfo' }).message).toMatch(/CFO/);
  });
});

describe('3c drive-ins (base.md §6.3a)', () => {
  it('§6.3a: a local manager at work puts drive-in signs on every open restaurant', () => {
    const { s } = workingTurn(base(), 'p1', { work: ['local_manager'] });
    expect(p1Restaurant(s).driveIn).toBe(true);
    const { s: s2 } = workingTurn(base(), 'p1', { work: ['waitress'] });
    expect(p1Restaurant(s2).driveIn).toBeUndefined();
  });
});

describe('3d campaigns (base.md §6.4)', () => {
  const billboard = (cardUid: Uid, x: number, y: number, extra: Partial<Extract<Action, { type: 'work.placeCampaign' }>> = {}): Action => ({
    type: 'work.placeCampaign',
    playerId: 'p1',
    cardUid,
    campaignKind: 'billboard',
    tileNumber: 14,
    goods: ['burger'],
    placement: { kind: 'board', x, y, w: 2, h: 1 },
    duration: 2,
    ...extra,
  });

  it('§6.4: trainee places a billboard in road range; marketeer becomes busy; tile leaves the supply', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['marketing_trainee'] });
    const mt = work[0] as Uid;
    const t = act(s, billboard(mt, 3, 0));
    const camp = Object.values(t.board.campaigns)[0];
    expect(camp).toMatchObject({ number: 14, kind: 'billboard', goods: ['burger'], owner: 'p1', marketeer: mt });
    expect(t.players.p1?.busy[mt]).toEqual([camp?.id]);
    expect(t.players.p1?.structure.ceoSubs).not.toContain(mt);
    expect(t.marketingTiles).not.toContain(14);
    expect(t.board.cells[0]?.[3]?.kind).toBe('campaign');
    // DLX p20: First Billboard → the triggering billboard is eternal.
    expect(t.players.p1?.milestones.first_billboard).toBeDefined();
    expect(Object.values(t.board.campaigns)[0]).toMatchObject({ eternal: true, remaining: 1 });
  });

  it('§6.4: range counts tile borders to the road next to the campaign (trainee range 2)', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['marketing_trainee', 'brand_manager'] });
    // (13,13) on tile (2,2) is 4 borders away by road.
    expect(rejected(s, billboard(work[0] as Uid, 13, 13)).message).toMatch(/Out of range/);
    act(s, billboard(work[1] as Uid, 13, 13));
  });

  it('§6.4: allowed types, max duration, available tiles, empty squares next to a road', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['marketing_trainee'] });
    const mt = work[0] as Uid;
    expect(rejected(s, billboard(mt, 3, 0, { campaignKind: 'mailbox', tileNumber: 9, placement: { kind: 'board', x: 3, y: 0, w: 1, h: 1 } })).message).toMatch(/cannot place/);
    expect(rejected(s, billboard(mt, 3, 0, { duration: 3 })).message).toMatch(/Duration/);
    expect(rejected(s, billboard(mt, 3, 0, { tileNumber: 12, placement: { kind: 'board', x: 3, y: 0, w: 2, h: 2 } })).message).toMatch(/not available/);
    expect(rejected(s, billboard(mt, 3, 3)).message).toMatch(/empty/);
    expect(rejected(s, billboard(mt, 3, 0, { placement: { kind: 'board', x: 3, y: 0, w: 3, h: 1 } })).message).toMatch(/2x1/);
    // Q-B7: footprints may be rotated.
    act(s, billboard(mt, 3, 0, { placement: { kind: 'board', x: 3, y: 0, w: 1, h: 2 } }));
  });

  it('§6.4: airplanes sit beside an edge, no overhang, no overlap on the same edge', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['brand_manager', 'brand_manager'] });
    const plane = (cardUid: Uid, tileNumber: number, width: 1 | 3 | 5, side: 'N' | 'S', offset: number): Action => ({
      type: 'work.placeCampaign', playerId: 'p1', cardUid, campaignKind: 'airplane', tileNumber, goods: ['pizza'], placement: { kind: 'airplane', side, offset, width }, duration: 4,
    });
    expect(rejected(s, plane(work[0] as Uid, 6, 5, 'N', 11)).message).toMatch(/overhang/);
    expect(rejected(s, plane(work[0] as Uid, 6, 3, 'N', 0)).message).toMatch(/5 wide/);
    const t = act(s, plane(work[0] as Uid, 6, 5, 'N', 0));
    expect(rejected(t, plane(work[1] as Uid, 5, 3, 'N', 3)).message).toMatch(/overlap/);
    act(t, plane(work[1] as Uid, 5, 3, 'S', 3));
  });

  it('legalPlacements offers only placements the reducer accepts', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['marketing_trainee'] });
    const opts = legalPlacements(s, 'p1', { kind: 'campaign', cardUid: work[0] as Uid, campaignKind: 'billboard' });
    expect(opts.length).toBeGreaterThan(10);
    for (const o of opts.slice(0, 40)) {
      if (o.kind !== 'campaign') throw new Error('kind');
      expect(validateAction(s, { ...(billboard(work[0] as Uid, 0, 0) as Extract<Action, { type: 'work.placeCampaign' }>), tileNumber: o.tileNumber, placement: o.placement }).ok).toBe(true);
    }
  });
});

describe('3e food and drinks (base.md §6.5)', () => {
  it('§6.5: kitchen trainee makes 1 burger or pizza (choice required); cooks make their full amount', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['kitchen_trainee', 'burger_cook'] });
    expect(rejected(s, { type: 'work.produce', playerId: 'p1', cardUid: work[0] as Uid }).code).toBe('INVALID_PAYLOAD');
    let t = act(s, { type: 'work.produce', playerId: 'p1', cardUid: work[0] as Uid, food: 'pizza' });
    t = act(t, { type: 'work.produce', playerId: 'p1', cardUid: work[1] as Uid });
    expect(t.players.p1?.inventory).toEqual({ pizza: 1, burger: 3 });
    // milestones.md: First burger / pizza produced → a free cook on the beach.
    const beach = (t.players.p1?.beach ?? []).map((u) => t.players.p1?.employees[u]?.employeeId).sort();
    expect(beach).toEqual(['burger_cook', 'pizza_cook']);
  });

  it('§6.5: errand boy gets 1 drink of any type; 2 with "First errand boy played"', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['errand_boy'] });
    expect(act(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: { mode: 'errand', drink: 'beer' } }).players.p1?.inventory).toEqual({ beer: 1 });
    const w = workingTurn(base(), 'p1', { work: ['errand_boy'], milestones: ['first_errand_boy'] });
    expect(act(w.s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: w.work[0] as Uid, route: { mode: 'errand', drink: 'soft_drink' } }).players.p1?.inventory).toEqual({ soft_drink: 2 });
  });

  it('§6.5: cart operator collects 2 from every supplier along its road route within range 2', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['cart_operator'] });
    const path = line([[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2]]);
    const t = act(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: { mode: 'road', from: from(s), path } });
    expect(t.players.p1?.inventory).toEqual({ lemonade: 2, beer: 2 });
  });

  it('animation: drinksBought carries the played route (road / errand)', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['cart_operator'] });
    const path = line([[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2]]);
    const route = { mode: 'road' as const, from: from(s), path };
    const ev = actE(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route }).events.find((e) => e.type === 'drinksBought');
    expect(ev).toMatchObject({ path, route });
    const e2 = workingTurn(base(), 'p1', { work: ['errand_boy'] });
    const ev2 = actE(e2.s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: e2.work[0] as Uid, route: { mode: 'errand', drink: 'beer' } }).events.find((e) => e.type === 'drinksBought');
    expect(ev2).toMatchObject({ path: [], route: { mode: 'errand', drink: 'beer' } });
  });

  it('§6.5: range is tile borders (3 is too far for a cart, fine with "First cart operator"); no U-turns', () => {
    const down = line([[2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [7, 8], [7, 9], [7, 10], [7, 11]]);
    const { s, work } = workingTurn(base(), 'p1', { work: ['cart_operator'] });
    const buy = (st: GameState, uid: Uid, path: Cell[]): Action => ({ type: 'work.buyDrinks', playerId: 'p1', cardUid: uid, route: { mode: 'road', from: from(st), path } });
    expect(rejected(s, buy(s, work[0] as Uid, down)).message).toMatch(/range is 2/);
    expect(rejected(s, buy(s, work[0] as Uid, line([[3, 2], [4, 2], [3, 2]]))).message).toMatch(/straight back/);
    expect(rejected(s, buy(s, work[0] as Uid, line([[5, 2]]))).message).toMatch(/begin/);
    const w = workingTurn(base(), 'p1', { work: ['cart_operator'], milestones: ['first_cart_operator'] });
    expect(act(w.s, buy(w.s, w.work[0] as Uid, down)).players.p1?.inventory).toEqual({ soft_drink: 2 });
  });

  it('§6.5: zeppelin flies tile to tile, collects 2 per supplier on every tile incl. the start, no re-entry', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['zeppelin_pilot'] });
    const fly = (tiles: [number, number][]): Action => ({ type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: { mode: 'air', from: from(s), tiles: tiles.map(([row, col]) => ({ row, col })) } });
    expect(rejected(s, fly([[0, 0], [0, 1], [0, 0]])).message).toMatch(/twice/);
    expect(act(s, fly([[0, 0], [0, 1], [0, 2]])).players.p1?.inventory).toEqual({ lemonade: 2, beer: 2 });
  });

  it('legal buyer routes come from the engine and validate', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['truck_driver'] });
    const routes = legalPlacements(s, 'p1', { kind: 'buyerRoute', cardUid: work[0] as Uid });
    expect(routes.length).toBeGreaterThan(1);
    for (const r of routes) {
      if (r.kind !== 'buyerRoute') throw new Error('kind');
      expect(applyAction(s, { type: 'work.buyDrinks', playerId: 'p1', cardUid: work[0] as Uid, route: r.route }).ok).toBe(true);
    }
  });
});

describe('3f houses and gardens (base.md §6.6)', () => {
  it('§6.6: a new house comes with its garden, on empty squares next to a road, unlimited range', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['new_business_developer'] });
    expect(rejected(s, { type: 'work.placeHouse', playerId: 'p1', cardUid: work[0] as Uid, houseOrder: 1, x: 2, y: 2, gardenSide: 'E' }).message).toMatch(/empty/);
    expect(rejected(s, { type: 'work.placeHouse', playerId: 'p1', cardUid: work[0] as Uid, houseOrder: 2, x: 3, y: 8, gardenSide: 'W' }).message).toMatch(/not available/);
    const t = act(s, { type: 'work.placeHouse', playerId: 'p1', cardUid: work[0] as Uid, houseOrder: 1, x: 3, y: 8, gardenSide: 'W' });
    const house = Object.values(t.board.houses).find((h) => h.order === 1);
    expect(house).toMatchObject({ kind: 'placed', garden: { source: 'withHouse' } });
    expect(house?.garden?.cells).toEqual(line([[2, 8], [2, 9]]));
    expect(t.houseTiles).not.toContain(1);
    expect(t.board.cells[8]?.[2]?.kind).toBe('garden');
  });

  it('§6.6: a garden goes beside a printed house without one, forming a 2x3 rectangle', () => {
    // Tile D: house 7 at (1..2, 1..2) with empty squares south and east.
    const s0 = newGame(2, 1, [['D', 'L', 'N'], ['F', 'O', 'T'], ['L', 'R', 'Q']]);
    const { s, work } = workingTurn(s0, 'p1', { work: ['new_business_developer', 'new_business_developer'] });
    const h7 = Object.values(s.board.houses).find((h) => h.order === 7)?.id as string;
    const h10 = Object.values(s.board.houses).find((h) => h.order === 10)?.id as string;
    expect(rejected(s, { type: 'work.placeGarden', playerId: 'p1', cardUid: work[0] as Uid, houseId: h10, side: 'S' }).message).toMatch(/empty/);
    const t = act(s, { type: 'work.placeGarden', playerId: 'p1', cardUid: work[0] as Uid, houseId: h7, side: 'S' });
    expect(t.board.houses[h7]?.garden).toEqual({ cells: line([[1, 3], [2, 3]]), source: 'gardenTile' });
    expect(t.gardenTiles).toBe(7);
    expect(rejected(t, { type: 'work.placeGarden', playerId: 'p1', cardUid: work[1] as Uid, houseId: h7, side: 'E' }).message).toMatch(/already/);
  });
});

describe('3g restaurants (base.md §6.7)', () => {
  it('§6.7: local manager places COMING SOON within road range 3 of an open restaurant', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['local_manager'] });
    const lm = work[0] as Uid;
    expect(rejected(s, { type: 'work.placeRestaurant', playerId: 'p1', cardUid: lm, x: 13, y: 13, entrance: 'NW' }).message).toMatch(/Out of range/);
    const t = act(s, { type: 'work.placeRestaurant', playerId: 'p1', cardUid: lm, x: 8, y: 8, entrance: 'NW' });
    const r = Object.values(t.board.restaurants).find((x) => x.x === 8 && x.y === 8);
    expect(r).toMatchObject({ owner: 'p1', status: 'comingSoon' });
    expect(r?.driveIn).toBeUndefined();
    expect(t.players.p1?.restaurantsRemaining).toBe(1);
  });

  it('§6.7: regional manager places an open restaurant anywhere with a drive-in, or moves one (not both)', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['regional_manager'] });
    const rm = work[0] as Uid;
    const t = act(s, { type: 'work.placeRestaurant', playerId: 'p1', cardUid: rm, x: 13, y: 13, entrance: 'NW' });
    expect(Object.values(t.board.restaurants).find((x) => x.x === 13)).toMatchObject({ status: 'open', driveIn: true });
    expect(rejected(t, { type: 'work.moveRestaurant', playerId: 'p1', cardUid: rm, restaurantId: p1Restaurant(t).id, x: 8, y: 8, entrance: 'NW' }).code).toBe('CARD_UNAVAILABLE');
    const m = act(s, { type: 'work.moveRestaurant', playerId: 'p1', cardUid: rm, restaurantId: p1Restaurant(s).id, x: 8, y: 8, entrance: 'NW' });
    expect(p1Restaurant(m)).toMatchObject({ x: 8, y: 8, driveIn: true });
    expect(m.board.cells[3]?.[3]?.kind).toBe('empty');
    expect(m.board.cells[8]?.[8]?.kind).toBe('restaurant');
  });

  it('§6.7: at most 3 restaurants per chain', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['regional_manager'] });
    const t = { ...s, players: { ...s.players, p1: { ...(s.players.p1 as GameState['players'][string]), restaurantsRemaining: 0 } } };
    expect(rejected(t, { type: 'work.placeRestaurant', playerId: 'p1', cardUid: work[0] as Uid, x: 13, y: 13, entrance: 'NW' }).message).toMatch(/All 3/);
  });
});

describe('legal actions in Working', () => {
  it('lists hires, card actions, skips and end turn; every ready action validates', () => {
    const { s } = workingTurn(base(), 'p1', { work: ['kitchen_trainee', 'marketing_trainee'] });
    const legal = legalActions(s, 'p1');
    const labels = legal.map((l) => l.label);
    expect(labels).toContain('End turn');
    expect(labels.some((l) => l.includes('hire Waitress'))).toBe(true);
    expect(labels.some((l) => l.includes('make 1 pizza'))).toBe(true);
    expect(legal.some((l) => l.kind === 'placement' && l.spec.kind === 'campaign')).toBe(true);
    for (const l of legal) if (l.kind === 'ready') expect(validateAction(s, l.action).ok).toBe(true);
    expect(legalActions(s, 'p2')).toEqual([]);
  });
});
