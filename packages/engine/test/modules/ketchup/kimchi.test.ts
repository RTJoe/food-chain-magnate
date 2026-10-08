/**
 * Kimchi (ketchup.md §5; KX p11; DLX p5-6).
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import type { Phase } from '../../../src/types/index.js';
import { FOODS } from '../../../src/content/foods.js';
import { createGame } from '../../../src/core/createGame.js';
import { cfg } from '../../helpers/game.js';
import { dine, fromPhase, kb } from './helpers.js';

const M = ['ketchup:kimchi'] as const;
const MARKETING: Phase = { kind: 'marketing', pass: 1, passes: 1, order: [], idx: 0 };

describe('Kimchi (ketchup.md §5)', () => {
  it('§5: Kimchi Master is a 1x entry-level kitchen card with a salary; kimchi cannot be marketed', () => {
    const c = contentFor([...M]);
    expect(c.employees['ketchup:kimchi_master']).toMatchObject({ entry: true, salary: true, unique: true, count: 3, category: 'kitchen' });
    expect(FOODS.find((f) => f.id === 'kimchi')).toMatchObject({ freezer: 'exclusive', marketable: false });
  });

  it('§0/§5: adds the single expansion luxuries manager at setup', () => {
    const base = createGame(cfg(2), 1).supply.luxuries_manager ?? 0;
    expect(createGame(cfg(2, undefined, { modules: [...M] }), 1).supply.luxuries_manager).toBe(base + 1);
  });

  describe('production in Clean up', () => {
    const cleanupBase = () => kb(2, [...M]).restaurant('p1', 3, 3, 'NW').phase(MARKETING);

    it('§5: the master at work makes 1 kimchi after the freezer step; none is made in phase 3', () => {
      const s = cleanupBase().card('p1', 'ketchup:kimchi_master', 'work').inventory('p1', { burger: 2 }).build();
      const ctx = fromPhase(s);
      // Burgers thrown away first, kimchi arrives afterwards and is kept for next turn.
      expect(ctx.state.players.p1?.inventory).toEqual({ kimchi: 1 });
      expect(ctx.of('foodDiscarded')[0]?.goods).toEqual({ burger: 2 });
      expect(ctx.of('foodProduced')).toEqual([expect.objectContaining({ player: 'p1', food: 'kimchi', count: 1 })]);
      const types = ctx.events.map((e) => e.type);
      expect(types.indexOf('foodDiscarded')).toBeLessThan(types.indexOf('foodProduced'));
      // ...and still inside this round's Clean up, before the next round starts.
      expect(types.indexOf('foodProduced')).toBeLessThan(types.indexOf('roundStarted'));
      expect(ctx.state.round).toBe(4);
    });

    it('§5: a master on the beach, or none at all, makes nothing; two masters make 1 each', () => {
      const beach = fromPhase(cleanupBase().card('p1', 'ketchup:kimchi_master', 'beach').build());
      expect(beach.state.players.p1?.inventory.kimchi ?? 0).toBe(0);
      const rival = fromPhase(cleanupBase().card('p2', 'ketchup:kimchi_master', 'work').build());
      expect(rival.state.players.p2?.inventory.kimchi).toBe(1);
      expect(rival.state.players.p1?.inventory.kimchi ?? 0).toBe(0);
    });

    it('§5 freezer: kimchi is frozen alone (up to 10); mixing is rejected; kimchi from the master comes on top', () => {
      const s = cleanupBase().milestone('p1', 'first_throw_away', 2).card('p1', 'ketchup:kimchi_master', 'work').inventory('p1', { kimchi: 10, burger: 1 }).build();
      const ctx = fromPhase(s);
      expect(ctx.state.awaiting).toEqual({ kind: 'cleanup.freezer', players: ['p1'] });
      const mixed = applyAction(ctx.state, { type: 'cleanup.freezer', playerId: 'p1', keep: { kimchi: 5, burger: 1 } });
      expect(mixed.ok).toBe(false);
      const allKimchi = applyAction(ctx.state, { type: 'cleanup.freezer', playerId: 'p1', keep: { kimchi: 10 } });
      expect(allKimchi.ok).toBe(true);
      if (!allKimchi.ok) return;
      expect(allKimchi.state.players.p1?.freezer).toEqual({ kimchi: 10 });
      // +1 fresh kimchi from the master (produced after the freezer step), burger thrown away.
      expect(allKimchi.state.players.p1?.inventory).toEqual({ kimchi: 1 });
    });

    it('freezer: a kimchi-only stock that fits is kept without asking; coffee alone is just thrown away', () => {
      const ctx = fromPhase(cleanupBase().milestone('p1', 'first_throw_away', 2).inventory('p1', { kimchi: 3 }).build());
      expect(ctx.state.awaiting.kind).not.toBe('cleanup.freezer');
      expect(ctx.state.players.p1?.freezer).toEqual({ kimchi: 3 });
      const c2 = fromPhase(cleanupBase().milestone('p1', 'first_throw_away', 2).inventory('p1', { coffee: 2, burger: 2 } as never).build());
      expect(c2.state.awaiting.kind).not.toBe('cleanup.freezer');
      expect(c2.state.players.p1?.freezer).toEqual({ burger: 2 });
    });

    it('§5 freezer: an exclusive kimchi stock cannot be frozen with other items, but other items alone are fine', () => {
      const s = cleanupBase().milestone('p1', 'first_throw_away', 2).inventory('p1', { kimchi: 2, burger: 9, pizza: 3 }).build();
      const ctx = fromPhase(s);
      expect(applyAction(ctx.state, { type: 'cleanup.freezer', playerId: 'p1', keep: { kimchi: 1, pizza: 1 } }).ok).toBe(false);
      expect(applyAction(ctx.state, { type: 'cleanup.freezer', playerId: 'p1', keep: { burger: 9, pizza: 1 } }).ok).toBe(true);
    });
  });

  describe('Dinnertime', () => {
    it('§5: a kimchi chain beats a cheaper, closer chain and sells exactly 1 kimchi with the order', () => {
      const ctx = dine(
        kb(2, [...M])
          .restaurant('p1', 3, 3, 'NW') // 0 borders, no kimchi
          .restaurant('p2', 8, 8, 'NW') // 2 borders, kimchi
          .inventory('p1', { burger: 1 })
          .inventory('p2', { burger: 1, kimchi: 3 })
          .demand(2, ['burger']),
      );
      const [sale] = ctx.of('sale');
      expect(sale).toMatchObject({ player: 'p2', total: 20 });
      expect(sale?.lines).toEqual(expect.arrayContaining([{ good: 'burger', count: 1, each: 10 }, { good: 'kimchi', count: 1, each: 10 }]));
      expect(ctx.state.players.p2?.inventory).toEqual({ kimchi: 2 });
      expect(ctx.state.players.p1?.inventory.burger).toBe(1);
    });

    it('§5: never more than 1 kimchi per house, even with a 3-item order', () => {
      const ctx = dine(
        kb(2, [...M]).restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 3, kimchi: 5 }).demand(2, ['burger', 'burger', 'burger']),
      );
      expect(ctx.of('sale')[0]?.total).toBe(40);
      expect(ctx.state.players.p1?.inventory.kimchi).toBe(4);
    });

    it('§5: kimchi never lets a chain without the full order win ("normal rules")', () => {
      const ctx = dine(
        kb(2, [...M])
          .restaurant('p1', 3, 3, 'NW')
          .restaurant('p2', 5, 3, 'NW')
          .inventory('p1', { burger: 1 }) // complete order, no kimchi
          .inventory('p2', { kimchi: 4 }) // kimchi but no burger
          .demand(2, ['burger']),
      );
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 10 });
      expect(ctx.state.players.p2?.inventory.kimchi).toBe(4);
    });

    it('§5: kimchi is never sold to a house without its own demand', () => {
      const ctx = dine(kb(2, [...M]).restaurant('p1', 3, 3, 'NW').inventory('p1', { kimchi: 2 }));
      expect(ctx.of('sale')).toHaveLength(0);
      expect(ctx.state.players.p1?.inventory.kimchi).toBe(2);
    });

    it('§5: among several kimchi chains normal competition applies (price + distance, then turn order)', () => {
      const ctx = dine(
        kb(2, [...M])
          .restaurant('p1', 3, 3, 'NW')
          .restaurant('p2', 5, 3, 'NW')
          .inventory('p1', { burger: 1, kimchi: 1 })
          .inventory('p2', { burger: 1, kimchi: 1 })
          .demand(2, ['burger']),
      );
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', distance: 0 });
    });

    it('§5: if no chain has kimchi the normal rules decide (and no kimchi line appears)', () => {
      const ctx = dine(
        kb(2, [...M]).restaurant('p1', 3, 3, 'NW').restaurant('p2', 5, 3, 'NW').inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']),
      );
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 10 });
      expect(ctx.of('sale')[0]?.lines.every((l) => l.good !== 'kimchi')).toBe(true);
    });

    it('§5: kimchi is paid like any other item (garden doubling)', () => {
      const ctx = dine(
        kb(2, [...M]).placedHouse(1, 3, 8, 'S').restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1, kimchi: 1 }).demand(1, ['burger']),
      );
      expect(ctx.of('sale')[0]?.total).toBe(40);
    });

    it('§5: frozen kimchi counts as stock', () => {
      const ctx = dine(kb(2, [...M]).restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1 }).freezer('p1', { kimchi: 2 }).demand(2, ['burger']));
      expect(ctx.of('sale')[0]?.total).toBe(20);
      expect(ctx.state.players.p1?.freezer.kimchi).toBe(1);
    });
  });
});
