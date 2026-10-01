/**
 * Sushi (ketchup.md §6; KX p11; DLX p7-8).
 *
 * Map (helpers MAP, see test/rules/c2ctx.ts): house 2 is a printed house without a garden on tile
 * (0,0). House 1 is a placed house WITH a garden at (3,8) on tile (1,0). Restaurants at (3,3) (tile
 * (0,0)) and (8,8) (tile (1,1)) are both 1 border from house 1, so price decides between them.
 */
import { describe, expect, it } from 'vitest';
import { contentFor } from '../../../src/modules/registry.js';
import { createGame } from '../../../src/core/createGame.js';
import { act, cfg } from '../../helpers/game.js';
import { workingTurn } from '../../helpers/game.js';
import { dine, kb, kgame, MAP } from './helpers.js';
import type { Uid } from '../../../src/types/index.js';

const M = ['ketchup:sushi'] as const;
const APT_MAP = [MAP[0] as string[], ['F', 'X', 'T'], MAP[2] as string[]];

/** Two chains, 1 border from the garden house 1 each. */
const garden = (mods: readonly string[] = M) =>
  kb(2, [...mods] as never)
    .placedHouse(1, 3, 8, 'S')
    .restaurant('p1', 3, 3, 'NW')
    .restaurant('p2', 8, 8, 'NW');

describe('Sushi (ketchup.md §6)', () => {
  describe('cards and setup', () => {
    it('§6: sushi cook x6 (makes 2, salary, trains to chef); chef x3 1x makes 5; Any-Cook trainee trains into the cook', () => {
      const c = contentFor([...M]);
      expect(c.employees['ketchup:sushi_cook']).toMatchObject({ count: 6, salary: true, trainsInto: ['ketchup:sushi_chef'] });
      expect(c.employees['ketchup:sushi_cook']?.ability).toMatchObject({ kind: 'produce', foods: ['sushi'], amount: 2 });
      expect(c.employees['ketchup:sushi_chef']).toMatchObject({ count: 3, unique: true });
      expect(c.employees['ketchup:sushi_chef']?.ability).toMatchObject({ kind: 'produce', amount: 5 });
      expect(c.employees.kitchen_trainee?.trainsInto).toEqual(expect.arrayContaining(['burger_cook', 'pizza_cook', 'ketchup:sushi_cook']));
      expect(contentFor([]).employees.kitchen_trainee?.trainsInto).not.toContain('ketchup:sushi_cook');
    });

    it('§0/§6: the extra luxuries manager is added once, also with several luxury modules on', () => {
      const base = createGame(cfg(2), 1).supply.luxuries_manager ?? 0;
      const one = createGame(cfg(2, undefined, { modules: [...M] }), 1);
      expect(one.supply.luxuries_manager).toBe(base + 1);
      const all = createGame(cfg(2, undefined, { modules: ['ketchup:sushi', 'ketchup:kimchi', 'ketchup:noodles', 'ketchup:coffee'] }), 1);
      expect(all.supply.luxuries_manager).toBe(base + 1);
    });

    it('§6 "produced like food": a kitchen trainee trains into a sushi cook, who makes 2 sushi (and sushi is not marketable)', () => {
      const g = kgame(2, [...M]);
      const { s, work, beach } = workingTurn(g, 'p1', { work: ['trainer', 'ketchup:sushi_cook'], beach: ['kitchen_trainee'] });
      let t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'ketchup:sushi_cook' });
      expect(t.players.p1?.employees[beach[0] as string]?.employeeId).toBe('ketchup:sushi_cook');
      t = act(t, { type: 'work.produce', playerId: 'p1', cardUid: work[1] as Uid });
      expect(t.players.p1?.inventory.sushi).toBe(2);
    });
  });

  describe('Dinnertime, garden houses', () => {
    it('§6: a chain with at least as much sushi as demand tokens wins over a cheaper chain with the exact order', () => {
      const ctx = dine(
        garden()
          .card('p1', 'pricing_manager', 'work')
          .inventory('p1', { burger: 1, beer: 1 })
          .inventory('p2', { sushi: 2 })
          .demand(1, ['burger', 'beer']),
      );
      // Sushi replaces the whole order (food and drink); paid as normal items with garden doubling.
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 40, lines: [{ good: 'sushi', count: 2, each: 20 }] });
      expect(ctx.state.players.p1?.inventory).toEqual({ burger: 1, beer: 1 });
    });

    it('§6: removes all demand tokens and exactly that many sushi (surplus stays)', () => {
      const ctx = dine(garden().inventory('p2', { sushi: 5 }).demand(1, ['pizza', 'pizza', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 60 });
      expect(ctx.state.players.p2?.inventory.sushi).toBe(2);
      expect(Object.values(ctx.state.board.houses).find((h) => h.order === 1)?.demand).toEqual([]);
    });

    it('§6: fewer sushi than demand tokens → sushi is ignored; normal rules apply', () => {
      const ctx = dine(garden().inventory('p1', { sushi: 1 }).inventory('p2', { burger: 2 }).demand(1, ['burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 40 });
      expect(ctx.state.players.p1?.inventory.sushi).toBe(1);
    });

    it('§6 all-or-nothing: no mixing sushi with other items, no sale at all if nothing else fits', () => {
      const ctx = dine(garden().inventory('p1', { sushi: 1, burger: 1 }).demand(1, ['burger', 'burger']));
      expect(ctx.of('sale')).toHaveLength(0);
      expect(ctx.of('houseStayedHome')).toHaveLength(1);
      expect(ctx.state.players.p1?.inventory).toEqual({ sushi: 1, burger: 1 });
    });

    it('§6: among sushi chains normal competition decides (here lower price)', () => {
      const ctx = dine(garden().card('p2', 'pricing_manager', 'work').inventory('p1', { sushi: 3 }).inventory('p2', { sushi: 2 }).demand(1, ['burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2' });
      expect(ctx.state.players.p1?.inventory.sushi).toBe(3);
    });

    it('§6: frozen sushi counts as stock', () => {
      const ctx = dine(garden().freezer('p2', { sushi: 2 }).demand(1, ['burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 40 });
      expect(ctx.state.players.p2?.freezer.sushi ?? 0).toBe(0);
    });

    it('§6: a house with 5 demand tokens (cap with garden) needs 5 sushi', () => {
      const demand = ['burger', 'burger', 'pizza', 'pizza', 'beer'] as const;
      const four = dine(garden().inventory('p2', { sushi: 4 }).demand(1, [...demand]));
      expect(four.of('sale')).toHaveLength(0);
      const five = dine(garden().inventory('p2', { sushi: 5 }).demand(1, [...demand]));
      expect(five.of('sale')[0]).toMatchObject({ player: 'p2', total: 100 });
    });
  });

  describe('Dinnertime, houses that do not want sushi', () => {
    it('§6: a printed house without a garden ignores sushi', () => {
      const ctx = dine(
        kb(2, [...M]).restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW').inventory('p1', { sushi: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']),
      );
      // p1 is closer but has only sushi; the house takes the normal order from p2.
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 10 });
      expect(ctx.state.players.p1?.inventory.sushi).toBe(1);
    });

    it('§6: sushi alone never serves a house without a garden', () => {
      const ctx = dine(kb(2, [...M]).restaurant('p1', 3, 3, 'NW').inventory('p1', { sushi: 3 }).demand(2, ['burger']));
      expect(ctx.of('sale')).toHaveLength(0);
    });

    it('§6: apartments do not want sushi', () => {
      const ctx = dine(kb(2, [...M], APT_MAP).restaurant('p1', 3, 3, 'NW').inventory('p1', { sushi: 3 }).demand(3.14, ['burger']));
      expect(ctx.of('sale')).toHaveLength(0);
    });

    it('§6: a printed house that gets a garden tile counts as a garden house', () => {
      const ctx = dine(
        kb(2, [...M])
          .mutate((s) => {
            const h = Object.values(s.board.houses).find((x) => x.order === 10);
            if (h) h.garden = { cells: [], source: 'gardenTile' };
          })
          .restaurant('p1', 3, 3, 'NW')
          .inventory('p1', { sushi: 1 })
          .demand(10, ['burger']),
      );
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', lines: [{ good: 'sushi', count: 1 }] });
    });
  });
});
