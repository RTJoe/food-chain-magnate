/**
 * Board previews and UI guidance (ux-plan.md §4, WP1): campaignReach, houseCellsReach,
 * rangeOverlay, houseOutlook, placementProblem, buyer route range, sale candidates, campaign
 * token-first placements, and "no action" reasons.
 */
import { describe, expect, it } from 'vitest';
import type { Campaign, Cell, GameEvent, GameState, LegalAction, Placement, Uid } from '../../src/index.js';
import { campaignReach, clone, engine, houseCellsReach, houseOutlook, legalActions, legalPlacements, placementProblem, rangeOverlay } from '../../src/index.js';
import { FIXTURES, stateBuilder } from '../../src/testing/index.js';
import { makeCtx } from '../../src/core/context.js';
import { runDinnertime } from '../../src/rules/dinnertime.js';
import { runMarketing } from '../../src/rules/marketing.js';
import { marketingRangeProblem, rangeField } from '../../src/rules/working/campaigns.js';
import { contentFor } from '../../src/modules/registry.js';
import { defOf } from '../../src/core/cards.js';
import { airplaneReach, billboardReach, campaignCells, mailboxReach, radioReach } from '../../src/map/reach.js';
import { fieldAt, playerRouteStarts, routeStartRoads, validateRoadRoute } from '../../src/map/pathfinding.js';
import { tileOf } from '../../src/map/grid.js';
import { throughSetup, newGame, workingTurn } from '../helpers/game.js';
import { MAP } from './c2ctx.js';

const camps = (s: GameState) => Object.values(s.board.campaigns) as Campaign[];
const campOf = (s: GameState, kind: Campaign['kind']) => camps(s).find((c) => c.kind === kind) as Campaign;
const base = (): GameState => throughSetup(newGame(2));
const skipOf = (list: LegalAction[], uid: Uid) => list.find((l) => l.kind === 'ready' && l.action.type === 'work.skip' && l.action.cardUid === uid);
const actsOf = (list: LegalAction[], uid: Uid) =>
  list.filter((l) => {
    if (l.kind === 'ready') {
      const a = l.action as { type: string; cardUid?: string; trainerUid?: string };
      return a.type !== 'work.skip' && (a.cardUid === uid || a.trainerUid === uid);
    }
    return l.cardUid === uid || (l.kind === 'placement' && l.spec.cardUid === uid);
  });

describe('campaignReach (base.md §9; DLX p30–32)', () => {
  const s = FIXTURES.dinnertime();

  it('billboard / mailbox / airplane / radio reach on the dinnertime fixture equals the marketing reach', () => {
    const bb = campOf(s, 'billboard');
    const mb = campOf(s, 'mailbox');
    const ap = campOf(s, 'airplane');
    const rd = campOf(s, 'radio');
    const ids = (c: Campaign) => campaignReach(s, { kind: c.kind, placement: c.placement, owner: c.owner, goods: c.goods }).houses.map((h) => h.houseId);
    const cells = (c: Campaign) => campaignCells(c.placement);
    expect(ids(bb)).toEqual(billboardReach(s.board, campaignCells(bb.placement)));
    expect(ids(mb)).toEqual(mailboxReach(s.board, cells(mb)));
    expect(ap.placement.kind === 'airplane' && ids(ap)).toEqual(ap.placement.kind === 'airplane' && airplaneReach(s.board, ap.placement));
    expect(ids(rd)).toEqual(radioReach(s.board, cells(rd)[0] as Cell));
    expect(ids(bb).length + ids(mb).length + ids(ap).length + ids(rd).length).toBeGreaterThan(0);
  });

  it('every house a campaign reaches gets the demand marketing places (adds), capped (full)', () => {
    const t = clone(s);
    t.phase = { kind: 'marketing', pass: 1, passes: 1, order: [], idx: 0 };
    // Preview the first campaign in run order on the untouched board, then run marketing.
    const first = camps(s).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))[0] as Campaign;
    const preview = campaignReach(s, { kind: first.kind, placement: first.placement, owner: first.owner, goods: first.goods });
    const ctx = makeCtx(t);
    runMarketing(ctx);
    const placed = ctx.events.filter((e): e is Extract<GameEvent, { type: 'demandPlaced' }> => e.type === 'demandPlaced' && e.campaignId === first.id);
    const expected = preview.houses.filter((h) => h.adds > 0).map((h) => [h.houseId, h.adds]);
    expect(placed.map((e) => [e.houseId, e.tokens.length])).toEqual(expected);
    for (const h of preview.houses) expect(h.full).toBe(h.capacity !== null && h.demand >= h.capacity);
  });

  it('area: mailbox flood region contains the mailbox; airplane covers its whole rows/columns; radio covers a 3×3 tile block', () => {
    const mb = campOf(s, 'mailbox');
    const ap = campOf(s, 'airplane');
    const rd = campOf(s, 'radio');
    const area = (c: Campaign) => campaignReach(s, { kind: c.kind, placement: c.placement }).area;
    if (mb.placement.kind === 'board') expect(area(mb)).toContainEqual({ x: mb.placement.x, y: mb.placement.y });
    if (ap.placement.kind === 'airplane') {
      const lines = ap.placement.side === 'N' || ap.placement.side === 'S' ? s.board.h : s.board.w;
      expect(area(ap)).toHaveLength(lines * ap.placement.width);
    }
    const tiles = new Set(area(rd).map((c) => `${Math.floor(c.x / 5)},${Math.floor(c.y / 5)}`));
    expect(tiles.size).toBeGreaterThanOrEqual(4);
    expect(tiles.size).toBeLessThanOrEqual(9);
  });

  it('module reach through the pipeline: giant billboard → rural area; gourmet guide → every house with a garden', () => {
    const k = FIXTURES.ketchup();
    const rural = Object.values(k.board.houses).find((h) => h.kind === 'rural');
    const giant = campaignReach(k, { kind: 'giantBillboard', placement: { kind: 'rural', side: 'E' }, owner: 'p3' });
    expect(giant.houses.map((h) => h.houseId)).toEqual([rural?.id]);
    // Rural area: no maximum and 2 tokens per hit (ketchup.md §12).
    expect(giant.houses[0]).toMatchObject({ capacity: null, adds: 2, full: false });
    const guide = campaignReach(k, { kind: 'gourmetGuide', placement: { kind: 'offBoard' } });
    const gardened = Object.values(k.board.houses).filter((h) => (h.kind === 'printed' || h.kind === 'placed') && h.garden);
    expect(guide.houses.map((h) => h.houseId).sort()).toEqual(gardened.map((h) => h.id).sort());
    expect(guide.area).toEqual([]);
  });

  it('houseCellsReach: a house placed next to the billboard is reached by it; one far away is not', () => {
    const bb = campOf(s, 'billboard');
    if (bb.placement.kind !== 'board') throw new Error('fixture');
    // Every board campaign reaching a hypothetical house on the billboard's adjacent squares.
    const adj = campaignReach(s, { kind: 'billboard', placement: bb.placement }).area.filter((c) => s.board.cells[c.y]?.[c.x]?.kind !== 'road');
    expect(adj.length).toBeGreaterThan(0);
    expect(houseCellsReach(s, [adj[0] as Cell])).toContain(bb.id);
    expect(engine.houseCellsReach(s, [{ x: 0, y: 0 }])).not.toContain(bb.id);
  });
});

describe('houseOutlook (base.md §7)', () => {
  it('ranking equals the Dinnertime winner on the fixture; capacity and reaching campaigns are reported', () => {
    const s = FIXTURES.dinnertime();
    const outlooks = Object.keys(s.board.houses).map((id) => houseOutlook(s, id));
    const t = clone(s);
    const ctx = makeCtx(t);
    runDinnertime(ctx);
    const sales = ctx.events.filter((e): e is Extract<GameEvent, { type: 'sale' }> => e.type === 'sale');
    expect(sales.length).toBeGreaterThan(0);
    for (const o of outlooks) {
      if (!o) throw new Error('missing outlook');
      const sale = sales.find((e) => e.houseId === o.houseId);
      expect(o.winner, o.houseId).toBe(sale?.player ?? null);
      if (sale) {
        // sale.candidates: everyone who could deliver, winner first, same numbers as the outlook.
        expect(sale.candidates?.[0]).toMatchObject({ player: sale.player, unitPrice: sale.unitPrice, distance: sale.distance, canSupply: true });
        expect(sale.candidates?.map((c) => c.player)).toEqual(o.sellers.filter((x) => x.canSupply).map((x) => x.player));
      }
      const house = s.board.houses[o.houseId];
      expect(o.capacity).toBe(house?.garden ? 5 : 3);
      expect(o.demand).toBe(house?.demand.length);
    }
    const considered = ctx.events.filter((e): e is Extract<GameEvent, { type: 'houseConsidered' }> => e.type === 'houseConsidered');
    expect(considered.every((e) => e.offers && e.candidates.every((p) => e.offers?.some((o) => o.player === p && o.canSupply)))).toBe(true);
    const bb = campOf(s, 'billboard');
    const reached = campaignReach(s, { kind: 'billboard', placement: bb.placement }).houses.map((h) => h.houseId);
    for (const id of reached) expect(houseOutlook(s, id)?.campaigns).toContain(bb.id);
    expect(houseOutlook(s, 'nope')).toBeNull();
  });
});

describe('houseOutlook forecasts the whole Dinnertime (DLX p26–28)', () => {
  const sb = () => stateBuilder({ players: 2 }).tiles(MAP).round(3);
  const dinnerWinners = (s: GameState) => {
    const ctx = makeCtx(clone(s));
    runDinnertime(ctx);
    return Object.fromEntries(ctx.events.flatMap((e) => (e.type === 'sale' ? [[e.houseId, e.player]] : [])));
  };

  it('houses resolve in number order: an earlier house uses up the goods (DLX p26–27)', () => {
    const b = sb().restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW').inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']).demand(10, ['burger']);
    const s = b.build();
    const [h2, h10] = [b.houseId(2), b.houseId(10)];
    expect(dinnerWinners(s)).toEqual({ [h2]: 'p1', [h10]: 'p2' });
    expect(houseOutlook(s, h2)?.winner).toBe('p1');
    const o10 = houseOutlook(s, h10);
    expect(o10?.winner).toBe('p2');
    // p1 is nearer house 10 but its only burger went to house 2.
    expect(o10?.sellers.find((x) => x.player === 'p1')?.canSupply).toBe(false);
  });

  it("counts the drive-ins a later player's local manager will open (DLX p25, p17)", () => {
    const b = sb()
      .restaurant('p1', 8, 8, 'NW')
      .restaurant('p2', 6, 3, 'SE')
      .card('p2', 'local_manager', 'work')
      .inventory('p1', { burger: 1 })
      .inventory('p2', { burger: 1 })
      .demand(2, ['burger'])
      .turnOrder(['p1', 'p2'])
      .phase({ kind: 'working', player: 'p1', idx: 0 })
      .turn({ player: 'p1', stage: 'recruit' } as never);
    const s = b.build();
    const h2 = b.houseId(2);
    // Without the drive-in p1 would win (2 borders against 3); p2's sign opens when its turn starts.
    expect(Object.values(s.board.restaurants).find((r) => r.owner === 'p2')?.driveIn).toBeFalsy();
    expect(houseOutlook(s, h2)?.winner).toBe('p2');
    const p1Turn = engine.applyAction(s, { type: 'work.endTurn', playerId: 'p1' });
    if (!p1Turn.ok) throw new Error(p1Turn.message);
    const end = engine.applyAction(p1Turn.state, { type: 'work.endTurn', playerId: 'p2' });
    if (!end.ok) throw new Error(end.message);
    expect(end.events.find((e) => e.type === 'sale' && e.houseId === h2)).toMatchObject({ player: 'p2' });
  });

  it('applies First to Lower Prices claimed at the start of Dinnertime (DLX p28)', () => {
    const b = sb().restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW').card('p1', 'pricing_manager', 'work').inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']);
    const s = b.build();
    expect(houseOutlook(s, b.houseId(2))?.sellers.find((x) => x.player === 'p1')?.unitPrice).toBe(8);
  });
});

describe('rangeOverlay and placementProblem (DLX p19)', () => {
  it('campaign manager: overlay distances match rangeField, and footprint distance ≤ 3 ⇔ marketingRangeProblem is null', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['campaign_manager'] });
    const uid = work[0] as Uid;
    const ov = rangeOverlay(s, 'p1', uid);
    expect(ov.range).toBe(3);
    expect(ov.starts).toEqual(playerRouteStarts(s.board, 'p1'));
    const field = rangeField(s, 'p1');
    if (typeof field === 'string') throw new Error(field);
    for (const r of ov.roads) expect(r.distance).toBe(fieldAt(field, r));
    expect(ov.roads.every((r) => r.distance <= 3)).toBe(true);
    const dist = new Map(ov.roads.map((r) => [`${r.x},${r.y}`, r.distance]));
    const def = defOf(contentFor([]), s.players.p1 as never, uid);
    if (!def) throw new Error('def');
    let checked = 0;
    for (let y = 0; y < s.board.h; y++) {
      for (let x = 0; x < s.board.w; x++) {
        if (s.board.cells[y]?.[x]?.kind !== 'empty') continue;
        const t = { x, y };
        const near = [
          { x, y: y - 1 },
          { x: x + 1, y },
          { x, y: y + 1 },
          { x: x - 1, y },
        ];
        const ds = near.flatMap((r) => (dist.has(`${r.x},${r.y}`) ? [(dist.get(`${r.x},${r.y}`) as number) + (tileOf(s.board, r) !== tileOf(s.board, t) ? 1 : 0)] : []));
        const inRange = ds.some((d) => d <= 3);
        expect(marketingRangeProblem(s, 'p1', def, [t]) === null, `${x},${y}`).toBe(inRange);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('a single `from` start narrows the overlay; brand manager is unlimited (null range, all reachable roads)', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['marketing_trainee', 'brand_manager'] });
    const start = playerRouteStarts(s.board, 'p1')[0];
    const one = rangeOverlay(s, 'p1', work[0] as Uid, start);
    expect(one.starts).toEqual([start]);
    expect(one.range).toBe(2);
    const all = engine.rangeOverlay(s, 'p1', work[1] as Uid);
    expect(all.range).toBeNull();
    expect(all.roads.length).toBeGreaterThan(one.roads.length);
    expect(rangeOverlay(s, 'p1', work[0] as Uid, { kind: 'coffeeShop', entityId: 'nope' }).roads).toEqual([]);
  });

  it('placementProblem: null for every legal placement, the engine reason otherwise', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['marketing_trainee'] });
    const spec = { kind: 'campaign' as const, cardUid: work[0] as Uid, campaignKind: 'billboard' as const, tileNumber: 14 };
    const legal = legalPlacements(s, 'p1', spec);
    expect(legal.length).toBeGreaterThan(0);
    for (const p of legal.slice(0, 20)) expect(placementProblem(s, 'p1', spec, p)).toBeNull();
    const far: Placement = { kind: 'campaign', campaignKind: 'billboard', tileNumber: 14, placement: { kind: 'board', x: 13, y: 13, w: 2, h: 1 } };
    expect(engine.placementProblem(s, 'p1', spec, far)).toMatch(/range|road|empty/i);
    const onRoad: Placement = { kind: 'campaign', campaignKind: 'billboard', tileNumber: 14, placement: { kind: 'board', x: 0, y: 2, w: 2, h: 1 } };
    expect(placementProblem(s, 'p1', spec, onRoad)).toBe('Campaigns go on empty squares only');
    expect(placementProblem(s, 'p1', spec, { ...far, tileNumber: 13 })).toBe('Expected campaign #14');
    expect(placementProblem(s, 'p2', spec, legal[0] as Placement)).toMatch(/turn/i);
  });
});

describe('buyer routes carry range and borders used (base.md §6.5)', () => {
  it('cart operator: range 2, bordersUsed = the route validator borders', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['cart_operator'] });
    const routes = legalPlacements(s, 'p1', { kind: 'buyerRoute', cardUid: work[0] as Uid });
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      if (r.kind !== 'buyerRoute' || r.route.mode !== 'road') throw new Error('road route expected');
      expect(r.range).toBe(2);
      const check = validateRoadRoute(s.board, routeStartRoads(s.board, r.route.from), r.route.path, 2);
      expect(check.ok && check.borders).toBe(r.bordersUsed);
      expect(r.bordersUsed).toBeLessThanOrEqual(2);
    }
  });

  it('zeppelin: bordersUsed = tiles entered after the start', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['zeppelin_pilot'] });
    const routes = legalPlacements(s, 'p1', { kind: 'buyerRoute', cardUid: work[0] as Uid });
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      if (r.kind !== 'buyerRoute' || r.route.mode !== 'air') throw new Error('air route expected');
      expect(r.bordersUsed).toBe(r.route.tiles.length - 1);
      expect(r.range).toBe(4);
    }
  });
});

describe('campaign token first, then place and rotate (map.md §7; questions.md Q-B7)', () => {
  it('tileNumber filter returns only that token, with both orientations at the same anchor', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['brand_director'] });
    const uid = work[0] as Uid;
    const placements = legalPlacements(s, 'p1', { kind: 'campaign', cardUid: uid, tileNumber: 13 });
    expect(placements.length).toBeGreaterThan(0);
    const board = placements.flatMap((p) => (p.kind === 'campaign' && p.placement.kind === 'board' ? [{ ...p.placement, n: p.tileNumber, o: p.orientation }] : []));
    expect(board).toHaveLength(placements.length);
    expect(new Set(board.map((b) => b.n))).toEqual(new Set([13]));
    for (const b of board) expect(b.o).toBe(b.w === 3 ? 'landscape' : 'portrait');
    const key = (b: { x: number; y: number }) => `${b.x},${b.y}`;
    const land = new Set(board.filter((b) => b.o === 'landscape').map(key));
    expect(board.some((b) => b.o === 'portrait' && land.has(key(b)))).toBe(true);
    // Square tokens: one orientation.
    const sq = legalPlacements(s, 'p1', { kind: 'campaign', cardUid: uid, tileNumber: 7 });
    expect(sq.length).toBeGreaterThan(0);
    expect(sq.every((p) => p.kind === 'campaign' && p.orientation === 'square')).toBe(true);
  });
});

describe('"No action" reasons (Ketchup synthetic states; ux-plan.md §2.2)', () => {
  const ketchupTurn = () =>
    stateBuilder({ players: 3 })
      .modules(['ketchup:coffee', 'ketchup:ruralMarketeers', 'ketchup:gourmetCritics'])
      .round(3)
      .restaurant('p1', 3, 3, 'NW')
      .ruralArea()
      .card('p1', 'ketchup:rural_marketeer', 'work', 'rm')
      .card('p1', 'ketchup:gourmet_food_critic', 'work', 'gc')
      .card('p1', 'trainer', 'work', 'tr')
      .card('p1', 'ketchup:barista_trainee', 'beach', 'bt')
      .phase({ kind: 'working', player: 'p1', idx: 0 })
      .turn({ player: 'p1', stage: 'recruit', uses: { rm: 1, gc: 1, tr: 1 } });

  it('builder states with Ketchup modules have module supply and campaign tiles, so these cards can act', () => {
    const s = ketchupTurn().build();
    expect(s.supply['ketchup:barista']).toBe(6);
    expect(s.marketingTiles).toEqual(expect.arrayContaining([17, 18, 19, 20, 21, 22, 23, 24]));
    const list = legalActions(s, 'p1');
    for (const uid of ['rm', 'gc', 'tr']) {
      expect(actsOf(list, uid).length, uid).toBeGreaterThan(0);
      expect(skipOf(list, uid)?.disabledReason, uid).toBeUndefined();
    }
    expect(legalPlacements(s, 'p1', { kind: 'campaign', cardUid: 'rm' })).toHaveLength(4);
    expect(legalPlacements(s, 'p1', { kind: 'campaign', cardUid: 'gc', tileNumber: 18 })).toEqual([{ kind: 'campaign', campaignKind: 'gourmetGuide', tileNumber: 18, placement: { kind: 'offBoard' } }]);
  });

  it('when a card can only skip, its skip entry says why', () => {
    const s = ketchupTurn()
      .mutate((t) => {
        t.supply['ketchup:barista'] = 0;
        t.marketingTiles = t.marketingTiles.filter((n) => n < 17);
      })
      .build();
    const list = legalActions(s, 'p1');
    expect(actsOf(list, 'tr')).toEqual([]);
    expect(skipOf(list, 'tr')?.disabledReason).toBe('No Barista left');
    expect(skipOf(list, 'rm')?.disabledReason).toBe('No giant billboard campaign tiles left');
    expect(skipOf(list, 'gc')?.disabledReason).toBe('No gourmet guide campaign tiles left');
  });

  it('trainer with an empty beach; cards that can act carry no reason', () => {
    const { s, work } = workingTurn(base(), 'p1', { work: ['trainer', 'kitchen_trainee'] });
    const list = legalActions(s, 'p1');
    expect(skipOf(list, work[0] as Uid)?.disabledReason).toBe('No card on the beach to train');
    expect(skipOf(list, work[1] as Uid)?.disabledReason).toBeUndefined();
  });
});
