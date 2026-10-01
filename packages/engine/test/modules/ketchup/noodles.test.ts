/**
 * Noodles (ketchup.md §7; KX p11; DLX p9) and the combined Kimchi + Sushi + Noodles priority list
 * (ketchup.md §7 "Combined priority"; KX p11; DLX p31-32).
 *
 * Map: see sushi.test.ts. Garden house = house 1 (placed at (3,8), garden south); plain house =
 * printed house 2 on tile (0,0); apartment = tile X (order 3.14).
 */
import { describe, expect, it } from 'vitest';
import type { FoodCounts, ModuleId } from '../../../src/types/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { createGame } from '../../../src/core/createGame.js';
import { act, cfg, workingTurn } from '../../helpers/game.js';
import { dine, kb, kgame, MAP } from './helpers.js';
import type { Uid } from '../../../src/types/index.js';

const NOODLES = ['ketchup:noodles'] as const;
const ALL: ModuleId[] = ['ketchup:kimchi', 'ketchup:sushi', 'ketchup:noodles'];
const APT_MAP = [MAP[0] as string[], ['F', 'X', 'T'], MAP[2] as string[]];

/** Garden house 1; p1 at (3,3) and p2 at (8,8) are both 1 border away. */
const garden = (mods: ModuleId[] = ALL) => kb(2, mods).placedHouse(1, 3, 8, 'S').restaurant('p1', 3, 3, 'NW').restaurant('p2', 8, 8, 'NW');
/** Plain house 2: p1 0 borders away, p2 1 border. */
const plain = (mods: ModuleId[] = ALL) => kb(2, mods).restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW');

describe('Noodles (ketchup.md §7)', () => {
  describe('cards and setup', () => {
    it('§7: noodle cook x6 makes 6 (salary, trains to chef); chef x3 1x makes 16; Any-Cook trainee trains into the cook', () => {
      const c = contentFor([...NOODLES]);
      expect(c.employees['ketchup:noodle_cook']).toMatchObject({ count: 6, salary: true, trainsInto: ['ketchup:noodle_chef'] });
      expect(c.employees['ketchup:noodle_cook']?.ability).toMatchObject({ kind: 'produce', foods: ['noodles'], amount: 6 });
      expect(c.employees['ketchup:noodle_chef']).toMatchObject({ count: 3, unique: true });
      expect(c.employees['ketchup:noodle_chef']?.ability).toMatchObject({ amount: 16 });
      expect(c.employees.kitchen_trainee?.trainsInto).toEqual(expect.arrayContaining(['burger_cook', 'pizza_cook', 'ketchup:noodle_cook']));
    });

    it('§0/§7: adds the luxuries manager exactly once', () => {
      const base = createGame(cfg(2), 1).supply.luxuries_manager ?? 0;
      expect(createGame(cfg(2, undefined, { modules: [...NOODLES] }), 1).supply.luxuries_manager).toBe(base + 1);
    });

    it('§7: a kitchen trainee trains into a noodle cook, who makes 6 noodles', () => {
      const { s, work, beach } = workingTurn(kgame(2, [...NOODLES]), 'p1', { work: ['trainer', 'ketchup:noodle_cook'], beach: ['kitchen_trainee'] });
      let t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: work[0] as Uid, targetUid: beach[0] as Uid, toEmployeeId: 'ketchup:noodle_cook' });
      t = act(t, { type: 'work.produce', playerId: 'p1', cardUid: work[1] as Uid });
      expect(t.players.p1?.inventory.noodles).toBe(6);
    });
  });

  describe('Dinnertime (noodles alone)', () => {
    it('§7: noodles are used only when no chain can serve the exact order, even if the noodle chain is closer', () => {
      const ctx = dine(plain([...NOODLES]).inventory('p1', { noodles: 2 }).inventory('p2', { burger: 2 }).demand(2, ['burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 20, lines: [{ good: 'burger', count: 2, each: 10 }] });
      expect(ctx.state.players.p1?.inventory.noodles).toBe(2);
    });

    it('§7: when nobody can serve the order, a chain with at least as many noodles as demand tokens sells exactly that many', () => {
      const ctx = dine(plain([...NOODLES]).inventory('p2', { noodles: 5, burger: 1 }).demand(2, ['burger', 'pizza']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 20, lines: [{ good: 'noodles', count: 2, each: 10 }] });
      expect(ctx.state.players.p2?.inventory).toEqual({ noodles: 3, burger: 1 });
    });

    it('§7 all-or-nothing: too few noodles never mix with other items', () => {
      const ctx = dine(plain([...NOODLES]).inventory('p1', { noodles: 1, burger: 1 }).demand(2, ['burger', 'burger']));
      expect(ctx.of('sale')).toHaveLength(0);
      expect(ctx.state.players.p1?.inventory).toEqual({ noodles: 1, burger: 1 });
    });

    it('§7: among noodle chains normal competition applies', () => {
      const ctx = dine(plain([...NOODLES]).inventory('p1', { noodles: 3 }).inventory('p2', { noodles: 3 }).demand(2, ['burger', 'burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 30 });
    });

    it('§7: garden houses with no usable sushi take noodles, paid with garden doubling', () => {
      const ctx = dine(garden([...NOODLES]).inventory('p2', { noodles: 2 }).demand(1, ['burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2', total: 40 });
    });

    it('§7: works for apartments too (no cap on demand there)', () => {
      const ctx = dine(kb(2, [...NOODLES], APT_MAP).restaurant('p1', 3, 3, 'NW').inventory('p1', { noodles: 2 }).demand(3.14, ['burger', 'burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 20, lines: [{ good: 'noodles', count: 2 }] });
    });

    it('§7: frozen noodles count as stock', () => {
      const ctx = dine(plain([...NOODLES]).freezer('p1', { noodles: 1 }).demand(2, ['burger']));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 10 });
    });
  });
});

// ---------------------------------------------------------------------------
// Combined priority
// ---------------------------------------------------------------------------

const D2 = ['burger', 'burger'] as const; // 2 demand tokens → sushi:2 / noodles:2

const GARDEN_TIERS: [string, FoodCounts][] = [
  ['1 enough sushi + 1 kimchi', { sushi: 2, kimchi: 1 }],
  ['2 exact items + 1 kimchi', { burger: 2, kimchi: 1 }],
  ['3 enough noodles + 1 kimchi', { noodles: 2, kimchi: 1 }],
  ['4 enough sushi', { sushi: 2 }],
  ['5 exact items', { burger: 2 }],
  ['6 enough noodles', { noodles: 2 }],
];

const PLAIN_TIERS: [string, FoodCounts][] = [
  ['1 exact + kimchi', { burger: 2, kimchi: 1 }],
  ['2 noodles + kimchi', { noodles: 2, kimchi: 1 }],
  ['3 exact', { burger: 2 }],
  ['4 noodles', { noodles: 2 }],
];

/** The sold goods of the winning sale (excluding counts of 0), as a plain object. */
const sold = (lines: { good: string; count: number }[]) => Object.fromEntries(lines.map((l) => [l.good, l.count]));

describe('Combined priority Kimchi + Sushi + Noodles (ketchup.md §7 "Combined priority")', () => {
  describe('garden house: sushi+kimchi, exact+kimchi, noodles+kimchi, sushi, exact, noodles', () => {
    const pairs: [number, number][] = [];
    for (let i = 0; i < GARDEN_TIERS.length; i++) for (let j = i + 1; j < GARDEN_TIERS.length; j++) pairs.push([i, j]);

    it.each(pairs)('tier %i beats tier %i regardless of price (the loser is cheaper and first in turn order)', (hi, lo) => {
      const [hiName, hiStock] = GARDEN_TIERS[hi] as [string, FoodCounts];
      const [, loStock] = GARDEN_TIERS[lo] as [string, FoodCounts];
      const ctx = dine(garden().card('p1', 'pricing_manager', 'work').inventory('p1', loStock).inventory('p2', hiStock).demand(1, [...D2]));
      const [sale] = ctx.of('sale');
      expect(sale, hiName).toMatchObject({ player: 'p2' });
      expect(sold(sale?.lines ?? []), hiName).toEqual(hiStock);
      // Winner's stock is only reduced by what was sold; loser keeps everything.
      expect(ctx.state.players.p1?.inventory).toEqual(loStock);
    });

    it('each tier on its own sells exactly its items (kimchi: 1, sushi/noodles: demand count)', () => {
      for (const [name, stock] of GARDEN_TIERS) {
        const sale = dine(garden().inventory('p2', { ...stock, pizza: 7 }).demand(1, [...D2])).of('sale')[0];
        expect(sold(sale?.lines ?? []), name).toEqual(stock);
      }
    });

    it('a chain with MORE kimchi than needed still sells only 1', () => {
      const sale = dine(garden().inventory('p2', { sushi: 2, kimchi: 9 }).demand(1, [...D2])).of('sale')[0];
      expect(sold(sale?.lines ?? [])).toEqual({ sushi: 2, kimchi: 1 });
    });

    it('within a tier normal competition applies (price, then turn order)', () => {
      const cheaper = dine(garden().card('p2', 'pricing_manager', 'work').inventory('p1', { sushi: 2, kimchi: 1 }).inventory('p2', { sushi: 2, kimchi: 1 }).demand(1, [...D2])).of('sale')[0];
      expect(cheaper?.player).toBe('p2');
      const tie = dine(garden().inventory('p1', { burger: 2, kimchi: 1 }).inventory('p2', { burger: 2, kimchi: 1 }).demand(1, [...D2])).of('sale')[0];
      expect(tie?.player).toBe('p1');
    });

    it('not enough sushi (1 of 2) falls through: exact items win, then noodles', () => {
      const exact = dine(garden().inventory('p1', { sushi: 1, kimchi: 1 }).inventory('p2', { burger: 2 }).demand(1, [...D2])).of('sale')[0];
      // p1 has kimchi but cannot serve any variant; p2 serves exactly.
      expect(exact).toMatchObject({ player: 'p2' });
      const noodles = dine(garden().inventory('p1', { sushi: 1 }).inventory('p2', { noodles: 2 }).demand(1, [...D2])).of('sale')[0];
      expect(noodles).toMatchObject({ player: 'p2', lines: [{ good: 'noodles', count: 2 }] });
    });

    it('one chain holding several tiers uses its best one (sushi+kimchi over exact+kimchi)', () => {
      const sale = dine(garden().inventory('p1', { sushi: 2, burger: 2, noodles: 2, kimchi: 1 }).demand(1, [...D2])).of('sale')[0];
      expect(sold(sale?.lines ?? [])).toEqual({ sushi: 2, kimchi: 1 });
      const left = dine(garden().inventory('p1', { sushi: 2, burger: 2, noodles: 2, kimchi: 1 }).demand(1, [...D2])).state.players.p1?.inventory;
      expect(left).toEqual({ burger: 2, noodles: 2 });
    });

    it('does not depend on the order of the three modules in the game config', () => {
      for (const mods of [ALL, [...ALL].reverse(), ['ketchup:noodles', 'ketchup:kimchi', 'ketchup:sushi'] as ModuleId[]]) {
        const sale = dine(garden(mods).card('p1', 'pricing_manager', 'work').inventory('p1', { burger: 2, kimchi: 1 }).inventory('p2', { sushi: 2, kimchi: 1 }).demand(1, [...D2])).of('sale')[0];
        expect(sale?.player).toBe('p2');
        expect(sold(sale?.lines ?? [])).toEqual({ sushi: 2, kimchi: 1 });
      }
    });
  });

  describe('house without a garden: exact+kimchi, noodles+kimchi, exact, noodles (sushi ignored)', () => {
    const pairs: [number, number][] = [];
    for (let i = 0; i < PLAIN_TIERS.length; i++) for (let j = i + 1; j < PLAIN_TIERS.length; j++) pairs.push([i, j]);

    it.each(pairs)('tier %i beats tier %i regardless of price and distance', (hi, lo) => {
      const [hiName, hiStock] = PLAIN_TIERS[hi] as [string, FoodCounts];
      const [, loStock] = PLAIN_TIERS[lo] as [string, FoodCounts];
      // p1 is 0 borders away; the better tier is held by the farther p2.
      const ctx = dine(plain().inventory('p1', loStock).inventory('p2', hiStock).demand(2, [...D2]));
      const [sale] = ctx.of('sale');
      expect(sale, hiName).toMatchObject({ player: 'p2' });
      expect(sold(sale?.lines ?? []), hiName).toEqual(hiStock);
    });

    it('sushi (with or without kimchi) is ignored: an exact chain wins, and sushi alone cannot serve', () => {
      const exact = dine(plain().inventory('p1', { sushi: 2, kimchi: 1 }).inventory('p2', { burger: 2 }).demand(2, [...D2])).of('sale')[0];
      expect(exact).toMatchObject({ player: 'p2', lines: [{ good: 'burger', count: 2 }] });
      expect(dine(plain().inventory('p1', { sushi: 2, kimchi: 1 }).demand(2, [...D2])).of('sale')).toHaveLength(0);
    });

    it('apartments follow the non-garden list (noodles+kimchi beat exact)', () => {
      const ctx = dine(
        kb(2, ALL, APT_MAP).restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW').inventory('p1', { burger: 2 }).inventory('p2', { noodles: 2, kimchi: 1 }).demand(3.14, [...D2]),
      );
      expect(sold(ctx.of('sale')[0]?.lines ?? [])).toEqual({ noodles: 2, kimchi: 1 });
      expect(ctx.of('sale')[0]?.player).toBe('p2');
    });
  });
});
