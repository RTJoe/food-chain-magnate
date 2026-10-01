/**
 * Ketchup milestone "Someone sells your demand" (ketchup.md §8; KX p13; DLX p20).
 *
 * Map (see test/rules/c2ctx.ts): house 2 printed on tile (0,0), house 10 printed on tile (1,0).
 * Restaurants: (3,3) on tile (0,0); (5,3) on tile (0,1); (3,8) on tile (1,0).
 */
import { describe, expect, it } from 'vitest';
import type { StateBuilder } from '../../../src/testing/index.js';
import type { GameState, Phase } from '../../../src/types/index.js';
import { dine, fromPhase, kb } from './helpers.js';

const M = ['ketchup:ketchup'] as const;
const ID = 'ketchup:ketchup';
const DINNER: Phase = { kind: 'dinnertime', houses: [], idx: 0 };

/** Run a whole Dinnertime through the phase machine, so Dinnertime exit hooks fire (awards at the END). */
const through = (b: StateBuilder) => {
  // The state builder does not register module milestones (createGame does); the claim needs the entry.
  const s = b
    .mutate((st) => {
      st.milestones[ID] ??= { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null };
    })
    .phase(DINNER)
    .build();
  // The phase machine only runs a fixture Dinnertime when it lists its houses.
  s.phase = { kind: 'dinnertime', houses: Object.values(s.board.houses).sort((a, c) => a.order - c.order).map((h) => h.id), idx: 0 };
  return fromPhase(s);
};
const has = (s: GameState, p: string) => Boolean(s.players[p]?.milestones[ID]);

describe('Ketchup milestone (ketchup.md §8)', () => {
  describe('awarding at the end of Dinnertime', () => {
    it('§8: the player whose marketeer demand a rival sold gets it; the seller does not', () => {
      const ctx = through(kb(2, [...M]).restaurant('p2', 3, 3, 'NW').inventory('p2', { burger: 1 }).demand(2, ['burger'], 'p1'));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2' });
      expect(has(ctx.state, 'p1')).toBe(true);
      expect(has(ctx.state, 'p2')).toBe(false);
      expect(ctx.state.players.p1?.milestones[ID]).toEqual({ round: 3, phase: 'dinnertime' });
      expect(ctx.of('milestoneClaimed')).toEqual([expect.objectContaining({ player: 'p1', milestoneId: ID })]);
    });

    it('§8: it is claimed at the END of the Dinnertime, after every sale', () => {
      const ctx = through(
        kb(2, [...M])
          .restaurant('p2', 3, 3, 'NW')
          .inventory('p2', { burger: 2 })
          .demand(2, ['burger'], 'p1')
          .demand(10, ['burger'], 'p1'),
      );
      const types = ctx.events.map((e) => e.type);
      expect(types.lastIndexOf('sale')).toBeLessThan(types.indexOf('milestoneClaimed'));
    });

    it('§8: selling to your own marketeer demand earns nothing', () => {
      const ctx = through(kb(2, [...M]).restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger'], 'p1'));
      expect(ctx.of('sale')).toHaveLength(1);
      expect(has(ctx.state, 'p1')).toBe(false);
      expect(has(ctx.state, 'p2')).toBe(false);
    });

    it('§8: demand without a marketeer (`by: null`, e.g. pizza radio / free mailbox) does not count', () => {
      const ctx = through(kb(2, [...M]).restaurant('p2', 3, 3, 'NW').inventory('p2', { burger: 1 }).demand(2, ['burger'], null));
      expect(ctx.of('sale')).toHaveLength(1);
      expect(has(ctx.state, 'p1')).toBe(false);
      expect(has(ctx.state, 'p2')).toBe(false);
    });

    it('§8: several players can earn it from one sale (and a seller who also placed demand does not)', () => {
      const ctx = through(
        kb(3, [...M])
          .restaurant('p2', 3, 3, 'NW')
          .inventory('p2', { burger: 1, beer: 1, pizza: 1 })
          .demand(2, ['burger'], 'p1')
          .mutate((s) => {
            const h = Object.values(s.board.houses).find((x) => x.order === 2);
            h?.demand.push({ good: 'beer', by: 'p3', campaign: null }, { good: 'pizza', by: 'p2', campaign: null });
          }),
      );
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p2' });
      expect(has(ctx.state, 'p1')).toBe(true);
      expect(has(ctx.state, 'p3')).toBe(true);
      expect(has(ctx.state, 'p2')).toBe(false);
    });

    it('§8: players earn it from sales to different houses in the same Dinnertime', () => {
      const ctx = through(
        kb(3, [...M])
          .restaurant('p3', 3, 3, 'NW')
          .restaurant('p2', 3, 8, 'NE')
          .inventory('p3', { burger: 1 })
          .inventory('p2', { burger: 1 })
          .demand(2, ['burger'], 'p1')
          .demand(10, ['burger'], 'p3'),
      );
      expect(ctx.of('sale').map((e) => e.player).sort()).toEqual(['p2', 'p3']);
      expect(has(ctx.state, 'p1')).toBe(true);
      expect(has(ctx.state, 'p3')).toBe(true); // p2 sold the house carrying p3's demand
      expect(has(ctx.state, 'p2')).toBe(false);
    });

    it('§8: a house that stayed home (nobody could serve it) earns nothing', () => {
      const ctx = through(kb(2, [...M]).restaurant('p2', 3, 3, 'NW').demand(2, ['burger'], 'p1'));
      expect(ctx.of('sale')).toHaveLength(0);
      expect(has(ctx.state, 'p1')).toBe(false);
    });

    it('§8: works for drink-only orders', () => {
      const ctx = through(kb(2, [...M]).restaurant('p2', 3, 3, 'NW').inventory('p2', { beer: 1 }).demand(2, ['beer'], 'p1'));
      expect(has(ctx.state, 'p1')).toBe(true);
    });

    it('§8: one per player; a holder is not awarded it again and the Dinnertime is unaffected', () => {
      const ctx = through(kb(2, [...M]).milestone('p1', ID, 1).restaurant('p2', 3, 3, 'NW').inventory('p2', { burger: 1 }).demand(2, ['burger'], 'p1'));
      expect(ctx.state.players.p1?.milestones[ID]).toMatchObject({ round: 1 });
      expect(ctx.of('milestoneClaimed')).toHaveLength(0);
    });

    it('§8: demand that was not sold (house stayed home) does not qualify its creator', () => {
      // p2 sells house 2 (p1 earns it); house 10 holds p3 demand but nobody has pizza.
      const first = through(kb(3, [...M]).restaurant('p2', 3, 3, 'NW').inventory('p2', { burger: 1 }).demand(2, ['burger'], 'p1').demand(10, ['pizza'], 'p3'));
      expect(has(first.state, 'p3')).toBe(false);
    });
  });

  describe('effect: price + distance − 1 in the next Dinnertime', () => {
    // p2 at (3,3) is closer to house 2 than p1 at (5,3) by one border; equal price. Turn order p1, p2.
    const duel = (b: StateBuilder) =>
      b.restaurant('p1', 5, 3, 'NW').restaurant('p2', 3, 3, 'NW').inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']);

    it('§8: without the milestone the closer chain wins', () => {
      expect(dine(duel(kb(2, [...M]))).of('sale')[0]).toMatchObject({ player: 'p2', distance: 0 });
    });

    it('§8: with it the score drops by 1 (tie → turn order); the price paid and the distance are unchanged', () => {
      const ctx = dine(duel(kb(2, [...M]).milestone('p1', ID, 2)));
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', distance: 1, unitPrice: 10, total: 10 });
    });

    it('§8: it is not a range rule: a chain farther than the road range is still not a candidate', () => {
      // p1 restaurant is on tile (2,2) (Q), 4 borders from house 2: score 14 − 1 = 13 > 10.
      const ctx = dine(
        kb(2, [...M]).milestone('p1', ID, 2).restaurant('p1', 13, 13, 'NW').restaurant('p2', 3, 3, 'NW').inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']),
      );
      expect(ctx.of('sale')[0]?.player).toBe('p2');
    });

    it('§8: works for drink-only orders', () => {
      const ctx = dine(
        kb(2, [...M]).milestone('p1', ID, 2).restaurant('p1', 5, 3, 'NW').restaurant('p2', 3, 3, 'NW').inventory('p1', { beer: 1 }).inventory('p2', { beer: 1 }).demand(2, ['beer']),
      );
      expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 10 });
    });

    it('§8: earned during this Dinnertime it cannot affect it (applies only to later Dinnertimes)', () => {
      // House 2: p2 sells demand created by p1. House 10 (later): p1 is 1 border farther than p2 on a
      // tie in everything else; had p1 already held the milestone it would win by turn order.
      const ctx = through(
        kb(2, [...M])
          .restaurant('p1', 5, 3, 'NW')
          .restaurant('p2', 3, 3, 'NW')
          .inventory('p1', { burger: 1 })
          .inventory('p2', { burger: 2 })
          .demand(2, ['burger'], 'p1')
          .demand(10, ['burger'], null),
      );
      const sales = ctx.of('sale');
      expect(sales).toHaveLength(2);
      expect(sales.every((e) => e.player === 'p2')).toBe(true);
      expect(has(ctx.state, 'p1')).toBe(true);
      // Control: holding it from an earlier round, p1 wins house 10 on the tie.
      const held = dine(
        kb(2, [...M]).milestone('p1', ID, 2).restaurant('p1', 5, 3, 'NW').restaurant('p2', 3, 3, 'NW').inventory('p1', { burger: 1 }).inventory('p2', { burger: 2 }).demand(10, ['burger'], null),
      );
      expect(held.of('sale')[0]?.player).toBe('p1');
    });

    it('§8: stacks with First marketeer used (-2): -3 in total', () => {
      const mods = ['ketchup:ketchup', 'ketchup:newMilestones'] as never;
      // p2 is first in turn order. p1 (2 borders away) scores 10 + 2 = 12 before milestones, p2 scores 10.
      const duel = (b: StateBuilder) =>
        b.turnOrder(['p2', 'p1']).restaurant('p1', 8, 8, 'NW').restaurant('p2', 3, 3, 'NW').inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 }).demand(2, ['burger']);
      const fmu = 'ketchup:first_marketeer_used';
      // −2 alone: 10 vs 10, tie → p2 (turn order).
      expect(dine(duel(kb(2, mods).milestone('p1', fmu, 2))).of('sale')[0]?.player).toBe('p2');
      // −1 alone: 11 vs 10 → p2.
      expect(dine(duel(kb(2, mods).milestone('p1', ID, 2))).of('sale')[0]?.player).toBe('p2');
      // Both: 9 vs 10 → p1.
      expect(dine(duel(kb(2, mods).milestone('p1', fmu, 2).milestone('p1', ID, 2))).of('sale')[0]).toMatchObject({ player: 'p1', distance: 2 });
    });
  });
});
