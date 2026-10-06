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
import type { EmployeeId, GameState, PlayerId, Uid, WorkTrain } from '../../../src/index.js';
import { applyAction } from '../../../src/index.js';
import { paint } from '../../../src/map/grid.js';
import { playerRouteStarts } from '../../../src/map/pathfinding.js';
import { FOODS } from '../../../src/content/foods.js';
import { contentFor } from '../../../src/modules/registry.js';
import { coffeeRouteSellers, shopPlacements } from '../../../src/modules/ketchup/coffee.js';
import { act, rejected, workingTurn } from '../../helpers/game.js';
import { dine, fromPhase, kb, kgame } from './helpers.js';

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
      expect(rejected(t, place(1, 8, 'entity-d')).message).toMatch(/your own/);
      const r = act(t, place(8, 11, 'entity-c'));
      expect(r.pending).toEqual([]);
      expect(shops(r, 'p1').map((e) => [e.kind === 'coffeeShop' && e.x, e.kind === 'coffeeShop' && e.y]).sort()).toEqual([[3, 6], [6, 1], [8, 11]]);
      expect(r.board.cells[0]?.[11]?.kind).toBe('empty');
      expect(r.board.entities['entity-c']).toBeUndefined();
      // With 3 on the map every legal placement is a move.
      expect(shopPlacements(r, 'p1', 'training').every((p) => p.moveFrom)).toBe(true);
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
      expect(coffeeRouteSellers(s, house as never, dest as never).map((l) => l.id)).toEqual(['entity-k3', 'restaurant-p2']);
      const ctx = dine(dinner().restaurant('p2', 10, 8, 'NE', 'open', 'restaurant-p2').entity(shop('entity-k3', 'p2', 13, 11)).inventory('p2', { coffee: 1 }));
      expect(ctx.of('coffeeSold').map((e) => e.at)).toEqual(['entity-k3']);
      expect(ctx.state.players.p2?.inventory.coffee ?? 0).toBe(0);
    });

    it('§4: a chain without coffee sells nothing', () => {
      const ctx = dine(dinner().entity(shop('entity-k1', 'p2', 11, 8)));
      expect(ctx.of('coffeeSold')).toEqual([]);
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
      const t = act(ctx.state, { type: 'ketchup:coffee.placeShop', playerId: 'p2', choiceId: head?.id as string, x: 13, y: 11 });
      expect(t.pending).toEqual([]);
      expect(shops(t, 'p2')).toEqual([expect.objectContaining({ x: 13, y: 11 })]);
    });

    it('§4: a milestone earned in an earlier round queues nothing', () => {
      const s = kb(2, [...M]).restaurant('p2', 5, 3, 'NW').milestone('p2', 'ketchup:first_coffee_sold', 2).phase({ kind: 'cleanup' }).build();
      expect(fromPhase(s).state.pending).toEqual([]);
    });
  });
});
