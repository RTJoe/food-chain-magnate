/**
 * Coffee (ketchup.md §4; DLX p10–14).
 *
 * Placement specs drive the real engine (`kgame` on MAP3: p1 restaurant (3,3) NW on tile A, p2
 * (5,3) NW on tile L). Dinnertime specs use `kb` on MAP with a loop of roads around tiles O/T/R/Q:
 *
 *   p1 restaurant (8,8) NW on tile O; placed house 1 at (13,13) with garden W on tile Q (×2).
 *   Two shortest routes (2 borders each): "T" = up x=12 then west along y=7;
 *   "R" = west along y=12 then up x=7.
 *   (11,8) on T touches only route T; (8,11) on R touches only route R; (13,11) on Q touches the
 *   routes that start at (13,12)/(14,12) or climb x=12.
 */
import { describe, expect, it } from 'vitest';
import type { EmployeeId, GameState, ModuleId, PlayerId, Uid, WorkTrain } from '../../../src/index.js';
import { applyAction } from '../../../src/index.js';
import { paint } from '../../../src/map/grid.js';
import { playerRouteStarts } from '../../../src/map/pathfinding.js';
import { FOODS } from '../../../src/content/foods.js';
import { contentFor } from '../../../src/modules/registry.js';
import { coffeeRouteSellers, shopPlacements } from '../../../src/modules/ketchup/coffee.js';
import { act, rejected, workingTurn } from '../../helpers/game.js';
import { dine, fromPhase, kb, kctx, kgame } from './helpers.js';
import { runCleanup } from '../../../src/rules/cleanup.js';

const M = ['ketchup:coffee'] as const;
const P1R = 'restaurant-21';

/** Put a coffee shop on the board directly (scenario setup). */
function addShop(s: GameState, id: string, owner: PlayerId, x: number, y: number): void {
  paint(s.board, [{ x, y }], 'coffeeShop', id);
  s.board.entities[id] = { kind: 'coffeeShop', id, owner, x, y };
}

const shops = (s: GameState, owner?: PlayerId) =>
  Object.values(s.board.entities).filter((e) => e.kind === 'coffeeShop' && (!owner || e.owner === owner));

/** p1's Working turn with a trainer at work and a barista trainee on the beach. */
function trainingTurn(setup?: (s: GameState) => void, beachCard: EmployeeId = 'ketchup:barista_trainee') {
  const g = kgame(2, [...M]);
  setup?.(g);
  const { s, work, beach } = workingTurn(g, 'p1', { work: ['trainer'], beach: [beachCard] });
  const train = (to: EmployeeId = 'ketchup:barista', coffeeShop?: { x: number; y: number; moveFrom?: string }): WorkTrain => ({
    type: 'work.train',
    playerId: 'p1',
    trainerUid: work[0] as Uid,
    targetUid: beach[0] as Uid,
    toEmployeeId: to,
    ...(coffeeShop ? { coffeeShop } : {}),
  });
  return { s, train };
}

/** p1 has trained a barista: a `coffeeShop` choice is at the head of the queue. */
function afterTraining(setup?: (s: GameState) => void) {
  const { s, train } = trainingTurn(setup);
  const t = act(s, train());
  const head = t.pending[0];
  if (head?.kind !== 'coffeeShop') throw new Error('no coffee shop choice');
  const place = (x: number, y: number, moveFrom?: string) => ({ type: 'ketchup:coffee.placeShop' as const, playerId: 'p1', choiceId: head.id, x, y, ...(moveFrom ? { moveFrom } : {}) });
  return { t, head, place };
}

/** Dinnertime scenario on MAP (see header). */
const dinner = (players = 2) =>
  kb(players, [...M])
    .restaurant('p1', 8, 8, 'NW')
    .placedHouse(1, 13, 13, 'W')
    .inventory('p1', { burger: 1 })
    .demand(1, ['burger'])
    // kb() only seeds base milestones; createGame adds module milestones.
    .mutate((s) => {
      s.milestones['ketchup:first_coffee_sold'] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null };
    });

const shop = (id: string, owner: PlayerId, x: number, y: number) => ({ kind: 'coffeeShop' as const, id, owner, x, y });

describe('Coffee (ketchup.md §4)', () => {
  describe('§4 cards and coffee', () => {
    it('§4: Barista Trainee → Barista → Lead Barista (1x) make 1 / 2 / 5 coffee', () => {
      const c = contentFor([...M]);
      expect(c.employees['ketchup:barista_trainee']).toMatchObject({ entry: true, salary: false, trainsInto: ['ketchup:barista'] });
      expect(c.employees['ketchup:barista']).toMatchObject({ salary: true, trainsInto: ['ketchup:lead_barista'] });
      expect(c.employees['ketchup:lead_barista']).toMatchObject({ salary: true, unique: true });
      expect(c.employees['ketchup:lead_barista']?.ability).toMatchObject({ kind: 'produce', foods: ['coffee'], amount: 5 });
    });

    it('§4: coffee cannot be marketed, is not a drink and cannot go in the freezer', () => {
      expect(FOODS.find((f) => f.id === 'coffee')).toMatchObject({ marketable: false, freezer: 'no', category: 'coffee' });
    });

    it('§4: in Clean up coffee cannot be frozen and is thrown away', () => {
      const s = kb(2, [...M])
        .restaurant('p1', 3, 3, 'NW')
        .milestone('p1', 'first_throw_away', 1)
        .inventory('p1', { coffee: 2, burger: 1 })
        .phase({ kind: 'cleanup' })
        .build();
      const ctx = fromPhase(s);
      expect(ctx.state.awaiting).toMatchObject({ kind: 'cleanup.freezer', players: ['p1'] });
      const bad = applyAction(ctx.state, { type: 'cleanup.freezer', playerId: 'p1', keep: { coffee: 1 } });
      expect(bad.ok).toBe(false);
      expect(!bad.ok && bad.message).toMatch(/cannot be frozen/);
      const t = act(ctx.state, { type: 'cleanup.freezer', playerId: 'p1', keep: { burger: 1 } });
      expect(t.players.p1?.freezer).toEqual({ burger: 1 });
      expect(t.players.p1?.inventory.coffee).toBeUndefined();
    });
    it('§4: throwing away only coffee does not claim First to Throw Away Food or Drink (KX p10: coffee is not a drink for milestones)', () => {
      const run = (inv: Record<string, number>) => {
        const ctx = kctx(kb(2, [...M]).round(3).restaurant('p1', 3, 3, 'NW').inventory('p1', inv).phase({ kind: 'cleanup' }).build());
        runCleanup(ctx);
        return ctx.state;
      };
      expect(run({ coffee: 2 }).milestones.first_throw_away?.claimedBy ?? []).toEqual([]);
      expect(run({ coffee: 2 }).players.p1?.inventory.coffee).toBeUndefined();
      expect(run({ coffee: 1, burger: 1 }).milestones.first_throw_away?.claimedBy).toEqual(['p1']);
    });
  });

  describe('§4 placing a coffee shop via training', () => {
    it('§4: training into a Barista queues a coffeeShop choice for the trainer', () => {
      const { t, head } = afterTraining();
      expect(head).toMatchObject({ kind: 'coffeeShop', player: 'p1', source: 'training', optional: false });
      expect(t.players.p1?.employees).toSatisfy((e: GameState['players'][string]['employees']) => Object.values(e).some((c) => c.employeeId === 'ketchup:barista'));
    });

    it('§4: training a Barista into the Lead Barista also queues a choice', () => {
      const { s, train } = trainingTurn(undefined, 'ketchup:barista');
      const t = act(s, train('ketchup:lead_barista'));
      expect(t.pending[0]).toMatchObject({ kind: 'coffeeShop', source: 'training' });
    });

    it('§4: placing the shop resolves the choice and puts the shop on the board', () => {
      const { t, place } = afterTraining();
      const r = act(t, place(11, 0));
      expect(r.pending).toEqual([]);
      expect(shops(r, 'p1')).toEqual([expect.objectContaining({ x: 11, y: 0 })]);
      expect(r.board.cells[0]?.[11]?.kind).toBe('coffeeShop');
    });

    it('§4: inline work.train.coffeeShop places the shop in the same action', () => {
      const { s, train } = trainingTurn();
      const t = act(s, train('ketchup:barista', { x: 11, y: 0 }));
      expect(t.pending).toEqual([]);
      expect(shops(t, 'p1')).toHaveLength(1);
    });

    it('§4: inline coffeeShop is rejected when illegal or when the target is not a barista', () => {
      const { s, train } = trainingTurn();
      expect(rejected(s, train('ketchup:barista', { x: 0, y: 0 })).message).toMatch(/next to a road/);
      const other = trainingTurn(undefined, 'marketing_trainee');
      expect(rejected(other.s, other.train('campaign_manager', { x: 11, y: 0 })).message).toMatch(/Barista/);
    });

    it('§4: must be on an empty square next to a road', () => {
      const { t, place } = afterTraining();
      expect(rejected(t, place(2, 2)).message).toMatch(/empty/); // road
      expect(rejected(t, place(3, 3)).message).toMatch(/empty/); // own restaurant
      expect(rejected(t, place(0, 0)).message).toMatch(/next to a road/);
      expect(rejected(t, place(-1, 0)).message).toMatch(/on the map/);
    });

    it('§4: via training, within road range 2 of one of your restaurants', () => {
      const { t, place } = afterTraining();
      expect(act(t, place(11, 0)).pending).toEqual([]); // tile N: 2 borders
      expect(rejected(t, place(13, 11)).message).toMatch(/range/); // tile Q: far
      expect(rejected(t, place(11, 8)).message).toMatch(/range/); // tile T: 3 borders
    });

    it('§4: your coffee shops are range starts too (playerRouteStarts)', () => {
      const { t, place } = afterTraining((g) => addShop(g, 'entity-k1', 'p1', 3, 6));
      expect(playerRouteStarts(t.board, 'p1')).toContainEqual({ kind: 'coffeeShop', entityId: 'entity-k1' });
      // (11,8) is 3 borders from the restaurant but 2 from the shop at (3,6).
      expect(act(t, place(11, 8)).pending).toEqual([]);
    });

    it('§4: at most one coffee shop per tile, all chains combined', () => {
      const { t, place } = afterTraining((g) => addShop(g, 'entity-k2', 'p2', 6, 1));
      expect(rejected(t, place(8, 1)).message).toMatch(/already has a coffee shop/); // tile L
      expect(act(t, place(11, 0)).pending).toEqual([]);
    });

    it('§4: with all 3 shops on the map, one of yours is moved instead', () => {
      const { t, place } = afterTraining((g) => {
        addShop(g, 'entity-a', 'p1', 3, 6);
        addShop(g, 'entity-b', 'p1', 6, 1);
        addShop(g, 'entity-c', 'p1', 11, 0);
        addShop(g, 'entity-d', 'p2', 8, 6);
      });
      expect(rejected(t, place(1, 8)).message).toMatch(/move one/);
      // KX p11: moving is optional ("you MAY move one"), so the choice can be declined.
      const head = t.pending[0];
      expect(head).toMatchObject({ kind: 'coffeeShop', optional: true });
      const kept = act(t, { type: 'choice.decline', playerId: 'p1', choiceId: head?.id as string });
      expect(kept.pending).toEqual([]);
      expect(shops(kept, 'p1')).toHaveLength(3);
      expect(rejected(t, place(1, 8, 'entity-d')).message).toMatch(/your own/);
      const r = act(t, place(8, 11, 'entity-c'));
      expect(r.pending).toEqual([]);
      expect(shops(r, 'p1').map((e) => [e.kind === 'coffeeShop' && e.x, e.kind === 'coffeeShop' && e.y]).sort()).toEqual([[3, 6], [6, 1], [8, 11]]);
      expect(r.board.cells[0]?.[11]?.kind).toBe('empty');
      expect(r.board.entities['entity-c']).toBeUndefined();
      // With 3 on the map every legal placement is a move.
      expect(shopPlacements(r, 'p1', 'training').every((p) => p.moveFrom)).toBe(true);
    });

    it('KX p11 (JD BGG 2379732): a Coach training a Barista Trainee straight to Lead Barista places two shops', () => {
      const g = kgame(2, [...M]);
      const { s, work, beach } = workingTurn(g, 'p1', { work: ['coach'], beach: ['ketchup:barista_trainee'] });
      const t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'ketchup:lead_barista' });
      expect(t.pending.map((c) => c.kind)).toEqual(['coffeeShop', 'coffeeShop']);
    });

    it('§4: legalPlacements lists coffee shop squares for the pending choice', () => {
      const { t, head } = afterTraining();
      const list = shopPlacements(t, 'p1', 'training');
      expect(list).toContainEqual({ kind: 'coffeeShop', x: 11, y: 0 });
      expect(list).not.toContainEqual({ kind: 'coffeeShop', x: 13, y: 11 });
      expect(head.source).toBe('training');
    });
  });

  describe('§4 Dinnertime coffee', () => {
    it('§4: a house buys 1 coffee at a rival shop next to the shortest route (price × garden)', () => {
      const ctx = dine(dinner().entity(shop('entity-k1', 'p2', 11, 8)).inventory('p2', { coffee: 3 }));
      expect(ctx.of('sale')).toEqual([expect.objectContaining({ player: 'p1', total: 20, distance: 2 })]);
      const sold = ctx.of('coffeeSold');
      // (11,8) touches two squares of route T but sells at most 1.
      expect(sold).toEqual([expect.objectContaining({ player: 'p2', at: 'entity-k1', amount: 20 })]);
      expect(ctx.state.players.p2?.inventory.coffee).toBe(2);
      expect(ctx.state.players.p2?.cash).toBe(20);
    });

    it('animation: the house beat order with coffee is houseConsidered → sale → (coffeeSold → cashChanged)* → cashChanged', () => {
      const ctx = dine(dinner().entity(shop('entity-k1', 'p2', 11, 8)).inventory('p2', { coffee: 3 }));
      const types = ctx.events.filter((e) => ['houseConsidered', 'sale', 'houseStayedHome', 'coffeeSold', 'cashChanged'].includes(e.type)).map((e) => e.type);
      expect(types).toEqual(['houseConsidered', 'sale', 'coffeeSold', 'cashChanged', 'cashChanged']);
      const cash = ctx.of('cashChanged');
      expect(cash.map((c) => c.player)).toEqual(['p2', 'p1']);
    });

    it('§4: the house picks its restaurant ignoring coffee; no sale → no coffee', () => {
      const ctx = dine(dinner().inventory('p1', {}).entity(shop('entity-k1', 'p2', 11, 8)).inventory('p2', { coffee: 3 }));
      expect(ctx.of('sale')).toEqual([]);
      expect(ctx.of('coffeeSold')).toEqual([]);
    });

    it('§4: price = the seller unit price (pricing manager) × multiplier; CFO counts it', () => {
      const ctx = dine(
        dinner()
          .entity(shop('entity-k1', 'p2', 11, 8))
          .inventory('p2', { coffee: 3 })
          .card('p2', 'pricing_manager', 'work')
          .card('p2', 'cfo', 'work'),
      );
      // $10 − 1 (pricing manager) − 1 (First to lower prices, claimed as Dinnertime starts) = $8, ×2 garden.
      expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ amount: 16 })]);
      expect(ctx.of('cfoBonus')).toContainEqual({ type: 'cfoBonus', player: 'p2', amount: 8 });
      expect(ctx.state.players.p2?.cash).toBe(24);
    });

    it('§4: the destination restaurant never sells; your own shop on the route does', () => {
      const ctx = dine(dinner().entity(shop('entity-k1', 'p1', 11, 8)).inventory('p1', { burger: 1, coffee: 3 }));
      expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ player: 'p1', at: 'entity-k1', amount: 20 })]);
    });

    it('§4: a rival restaurant entrance next to the route sells coffee', () => {
      const ctx = dine(dinner().restaurant('p2', 10, 8, 'NE', 'open', 'restaurant-p2').inventory('p2', { coffee: 1 }));
      expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ player: 'p2', at: 'restaurant-p2' })]);
    });

    it('§4: shortest routes tie on coffee → only locations common to all of them sell', () => {
      const tie = dinner().entity(shop('entity-k1', 'p2', 11, 8)).entity(shop('entity-k2', 'p2', 8, 11)).inventory('p2', { coffee: 5 });
      expect(dine(tie).of('coffeeSold')).toEqual([]);
      const common = dine(
        dinner()
          .entity(shop('entity-k1', 'p2', 11, 8))
          .entity(shop('entity-k2', 'p2', 8, 11))
          .entity(shop('entity-k3', 'p2', 13, 11))
          .inventory('p2', { coffee: 5 }),
      );
      expect(common.of('coffeeSold').map((e) => e.at)).toEqual(['entity-k3']);
    });

    it('§4: a chain sells in route order while it has coffee', () => {
      const s = dinner()
        .restaurant('p2', 10, 8, 'NE', 'open', 'restaurant-p2')
        .entity(shop('entity-k3', 'p2', 13, 11))
        .inventory('p2', { coffee: 1 })
        .build();
      const house = Object.values(s.board.houses).find((h) => h.order === 1);
      const dest = s.board.restaurants[Object.keys(s.board.restaurants).find((id) => s.board.restaurants[id]?.owner === 'p1') as string];
      // With 1 coffee only the location nearest the house sells (route order); with 2 both do.
      expect(coffeeRouteSellers(s, house as never, dest as never).map((l) => l.id)).toEqual(['entity-k3']);
      const s2 = { ...s, players: { ...s.players, p2: { ...(s.players.p2 as NonNullable<typeof s.players.p2>), inventory: { coffee: 2 } } } };
      expect(coffeeRouteSellers(s2, house as never, dest as never).map((l) => l.id)).toEqual(['entity-k3', 'restaurant-p2']);
      const ctx = dine(dinner().restaurant('p2', 10, 8, 'NE', 'open', 'restaurant-p2').entity(shop('entity-k3', 'p2', 13, 11)).inventory('p2', { coffee: 1 }));
      expect(ctx.of('coffeeSold').map((e) => e.at)).toEqual(['entity-k3']);
      expect(ctx.state.players.p2?.inventory.coffee ?? 0).toBe(0);
    });

    it('§4: a chain without coffee sells nothing', () => {
      const ctx = dine(dinner().entity(shop('entity-k1', 'p2', 11, 8)));
      expect(ctx.of('coffeeSold')).toEqual([]);
    });
  });

  describe('§4 Dinnertime coffee: routes (KX p11–14)', () => {
    const setRoad = (s: GameState, x: number, y: number) => {
      const c = s.board.cells[y]?.[x];
      if (c) Object.assign(c, { kind: 'road', occupant: null, road: { links: [], bridge: false, underConstruction: false, roadworks: 0, lobbyistRoad: null } });
    };
    const clear = (s: GameState, x: number, y: number) => {
      const c = s.board.cells[y]?.[x];
      if (c) Object.assign(c, { kind: 'empty', occupant: null, road: null });
    };

    it('KX p12 Example 1: routes go to every equidistant restaurant of the chain; only the shared shop sells', () => {
      const b = kb(2, [...M])
        .mutate((s) => {
          // Tile R keeps only its road row y=12; shops west (tile L), centre (tile R), east (tile Q).
          for (const [x, y] of [[7, 10], [7, 11], [7, 13], [7, 14], [6, 11]] as const) clear(s, x, y);
          addShop(s, 'entity-W', 'p2', 3, 11);
          addShop(s, 'entity-C', 'p2', 7, 11);
          addShop(s, 'entity-E', 'p2', 11, 11);
        })
        .restaurant('p1', 0, 13, 'NE', 'open', 'restaurant-A')
        .restaurant('p1', 13, 13, 'NW', 'open', 'restaurant-B')
        .placedHouse(1, 5, 13, 'E')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { coffee: 5 })
        .demand(1, ['burger']);
      const ctx = dine(b);
      expect(ctx.of('sale')).toEqual([expect.objectContaining({ restaurantId: 'restaurant-A', distance: 1 })]);
      expect(ctx.of('coffeeSold').map((e) => e.at)).toEqual(['entity-C']);
    });

    it('DLX p10 backtracking, KX p13 Example 2: a route may trace road squares again to pass a shop inside a loop', () => {
      const b = kb(2, [...M])
        .mutate((s) => {
          for (let y = 5; y <= 14; y++) for (let x = 5; x <= 14; x++) if (y < 10 || x < 10) clear(s, x, y);
          for (let x = 5; x <= 14; x++) setRoad(s, x, 9);
          setRoad(s, 7, 8); // stem from the main road into a ring around (7,6)
          for (const [x, y] of [[6, 5], [7, 5], [8, 5], [8, 6], [8, 7], [7, 7], [6, 7], [6, 6]] as const) setRoad(s, x, y);
          addShop(s, 'entity-k1', 'p2', 7, 6);
        })
        .restaurant('p1', 5, 10, 'NW', 'open', 'restaurant-p1')
        .placedHouse(1, 13, 7, 'W')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { coffee: 3 })
        .demand(1, ['burger']);
      const ctx = dine(b);
      expect(ctx.of('sale')).toEqual([expect.objectContaining({ player: 'p1', distance: 2 })]);
      expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ player: 'p2', at: 'entity-k1', amount: 20 })]);
    });

    it('KX p14 Example 4: at distance 0 the house takes the roundabout past the shop and back to the entrance', () => {
      const b = kb(2, [...M])
        .mutate((s) => {
          for (let y = 5; y <= 9; y++) for (let x = 5; x <= 9; x++) clear(s, x, y);
          clear(s, 7, 10);
          setRoad(s, 7, 7);
          setRoad(s, 7, 6); // the only road square at the entrance corner (6,6)
          for (const [x, y] of [[8, 6], [9, 6], [9, 5], [8, 5], [7, 5]] as const) setRoad(s, x, y);
          addShop(s, 'entity-own', 'p1', 8, 4);
        })
        .restaurant('p1', 5, 5, 'SE', 'open', 'restaurant-p1')
        .placedHouse(1, 7, 8, 'E')
        .inventory('p1', { burger: 1, coffee: 2 })
        .demand(1, ['burger']);
      const ctx = dine(b);
      expect(ctx.of('sale')).toEqual([expect.objectContaining({ player: 'p1', distance: 0 })]);
      expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ player: 'p1', at: 'entity-own' })]);
    });
  });

  describe('§4 Dinnertime coffee: Fry Chefs (KX p21; JD BGG 2342129)', () => {
    const fry = () =>
      kb(2, [...M, 'ketchup:fryChefs'])
        .restaurant('p1', 8, 8, 'NW')
        .placedHouse(1, 13, 13, 'W')
        .inventory('p1', { burger: 1 })
        .demand(1, ['burger'])
        .mutate((s) => {
          s.milestones['ketchup:first_coffee_sold'] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null };
        });

    it('a chain selling coffee to a house gets its Fry Chef bonus once for that house', () => {
      const ctx = dine(fry().entity(shop('entity-k3', 'p2', 13, 11)).restaurant('p2', 10, 8, 'NE', 'open', 'restaurant-p2').inventory('p2', { coffee: 3 }).card('p2', 'ketchup:fry_chef', 'work'));
      const sold = ctx.of('coffeeSold');
      expect(sold.map((e) => e.at).sort()).toEqual(['entity-k3', 'restaurant-p2']);
      // $10 × 2 (garden) per coffee, +$10 Fry Chef on the first only.
      expect(sold.map((e) => e.amount).reduce((a, b) => a + b, 0)).toBe(50);
      expect(sold.filter((e) => e.fryChefBonus === 10)).toHaveLength(1);
      expect(ctx.state.players.p2?.cash).toBe(50);
    });

    it('no second bonus for the chain that served the meal', () => {
      const ctx = dine(fry().entity(shop('entity-k1', 'p1', 11, 8)).inventory('p1', { burger: 1, coffee: 3 }).card('p1', 'ketchup:fry_chef', 'work'));
      expect(ctx.of('sale')[0]?.bonuses).toContainEqual({ source: 'ketchup:fry_chef', amount: 10 });
      expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ player: 'p1', amount: 20 })]);
      expect(ctx.of('coffeeSold')[0]?.fryChefBonus).toBeUndefined();
    });
  });

  describe('KX p12 Tied Routes with limited stock (JD BGG 3013738)', () => {
    const tie = (p2coffee: number, withP3: boolean) =>
      dinner(3)
        .entity(shop('entity-T1', 'p2', 11, 8))
        .entity(shop('entity-T2', 'p2', 10, 6))
        .entity(shop('entity-R1', 'p2', withP3 ? 6 : 8, withP3 ? 10 : 11))
        .mutate((s) => {
          if (withP3) s.board.entities['entity-R2'] = shop('entity-R2', 'p3', 8, 11);
        })
        .inventory('p2', { coffee: p2coffee })
        .inventory('p3', { coffee: 3 });

    it('routes are compared by the coffee they would sell: one coffee on two routes, no common seller, sells nothing', () => {
      const ctx = dine(tie(1, false));
      expect(ctx.of('coffeeSold')).toEqual([]);
    });

    it('the route selling more coffee wins even if the other passes more of a short chain', () => {
      const ctx = dine(tie(1, true));
      expect(ctx.of('coffeeSold').map((e) => e.at).sort()).toEqual(['entity-R1', 'entity-R2']);
    });
  });

  describe('§4 First coffee sold', () => {
    it('§4: the first coffee sold claims the milestone', () => {
      const ctx = dine(dinner().entity(shop('entity-k1', 'p2', 11, 8)).inventory('p2', { coffee: 3 }));
      expect(ctx.state.players.p2?.milestones['ketchup:first_coffee_sold']).toBeDefined();
      expect(ctx.state.players.p1?.milestones['ketchup:first_coffee_sold']).toBeUndefined();
    });

    it('§4: an extra shop choice (no range limit) is queued when Clean up ends', () => {
      const s = kb(2, [...M])
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 5, 3, 'NW')
        .milestone('p2', 'ketchup:first_coffee_sold', 3)
        .phase({ kind: 'cleanup' })
        .build();
      const ctx = fromPhase(s);
      const head = ctx.state.pending[0];
      expect(head).toMatchObject({ kind: 'coffeeShop', player: 'p2', source: 'milestone' });
      // Tile Q at (13,11) is far out of road range 2 of p2's restaurant: legal via the milestone.
      expect(shopPlacements(ctx.state, 'p2', 'milestone')).toContainEqual({ kind: 'coffeeShop', x: 13, y: 11 });
      // KX p12: placed "during the Cleanup Phase": round 3 has not ended yet.
      expect(ctx.state.phase.kind).toBe('cleanup');
      expect(ctx.state.round).toBe(3);
      const t = act(ctx.state, { type: 'ketchup:coffee.placeShop', playerId: 'p2', choiceId: head?.id as string, x: 13, y: 11 });
      expect(t.pending).toEqual([]);
      expect(t.round).toBe(4);
      expect(shops(t, 'p2')).toEqual([expect.objectContaining({ x: 13, y: 11 })]);
    });

    it('§4: a milestone earned in an earlier round queues nothing', () => {
      const s = kb(2, [...M]).restaurant('p2', 5, 3, 'NW').milestone('p2', 'ketchup:first_coffee_sold', 2).phase({ kind: 'cleanup' }).build();
      expect(fromPhase(s).state.pending).toEqual([]);
    });
  });
});

describe('Coffee and the rural area (KX p25-26: "one (potentially enormous) house")', () => {
  it('the rural area buys coffee along its road route from a freeway', () => {
    const L = [['X', 'O', 'Y'], ['W', 'U', 'V']];
    const mods: ModuleId[] = ['ketchup:newDistricts', 'ketchup:lobbyists', 'ketchup:coffee', 'ketchup:ruralMarketeers'];
    const ctx = dine(
      kb(2, mods, L)
        .restaurant('p1', 8, 0, 'SW')
        .inventory('p1', { beer: 2 })
        .inventory('p2', { coffee: 3 })
        .entity({ kind: 'coffeeShop', id: 'shopO', owner: 'p2', x: 6, y: 1 })
        .ruralArea()
        .entity({ kind: 'freeway', id: 'fw', owner: 'p1', side: 'N', offset: 7, tile: 't' } as never)
        .mutate((s) => {
          const r = Object.values(s.board.houses).find((h) => h.kind === 'rural');
          if (r) r.demand = [{ good: 'beer', by: null, campaign: null } as never, { good: 'beer', by: null, campaign: null } as never];
        }),
    );
    expect(ctx.of('sale').map((e) => e.player)).toEqual(['p1']);
    expect(ctx.of('coffeeSold')).toEqual([expect.objectContaining({ player: 'p2', at: 'shopO' })]);
  });
});
