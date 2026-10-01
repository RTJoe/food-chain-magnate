/**
 * Mass Marketeers (ketchup.md §10; KX p14; DLX p23-24).
 *
 * Map: see test/rules/c2ctx.ts. The 3-wide airplane over rows 3..5 reaches houses 2 (y 3..4), 10 (y 5..6) and a placed house at (3,3).
 */
import { describe, expect, it } from 'vitest';
import type { StateBuilder } from '../../../src/testing/index.js';
import type { GameState, Uid } from '../../../src/types/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { rejected, workingTurn } from '../../helpers/game.js';
import { fromPhase, kb, kgame, market } from './helpers.js';

const M = ['ketchup:massMarketeers'] as const;
const MM = 'ketchup:mass_marketeer';
const plane = (b: StateBuilder, remaining: number, extra: { id?: string; owner?: string; number?: number; goods?: ('burger' | 'pizza')[] } = {}) =>
  b.campaign({
    id: extra.id ?? 'c',
    owner: extra.owner ?? 'p1',
    kind: 'airplane',
    number: extra.number ?? 4,
    goods: extra.goods ?? ['burger'],
    placement: { kind: 'airplane', side: 'W', offset: 3, width: 3 },
    remaining,
  });
const demandOf = (s: GameState, order: number) => Object.values(s.board.houses).find((h) => h.order === order)?.demand.map((t) => t.good) ?? [];

describe('Mass Marketeers (ketchup.md §10)', () => {
  it('§10: card data: x6, blue marketing card, salary, trained from the marketing trainee', () => {
    const c = contentFor([...M]);
    expect(c.employees[MM]).toMatchObject({ count: 6, salary: true, colour: 'blue', category: 'marketing' });
    expect(c.employees[MM]?.ability).toEqual({ kind: 'massMarketing' });
    expect(c.employees.marketing_trainee?.trainsInto).toContain(MM);
  });

  describe('extra marketing passes (phase 6)', () => {
    it('§10: without a mass marketeer there is one pass', () => {
      const ctx = market(plane(kb(2, [...M]), 3));
      expect(ctx.state.phase).toMatchObject({ kind: 'marketing', passes: 1 });
      expect(ctx.of('campaignRan').map((e) => e.pass)).toEqual([1]);
      expect(demandOf(ctx.state, 2)).toEqual(['burger']);
    });

    it('§10: each mass marketeer at work adds one full pass; every campaign runs once per pass', () => {
      const ctx = market(plane(kb(2, [...M]).card('p1', MM, 'work'), 3));
      expect(ctx.state.phase).toMatchObject({ passes: 2 });
      expect(ctx.of('campaignRan').map((e) => e.pass)).toEqual([1, 2]);
      expect(demandOf(ctx.state, 2)).toEqual(['burger', 'burger']);
      expect(demandOf(ctx.state, 10)).toEqual(['burger', 'burger']);
    });

    it('§10: mass marketeers of ALL players count (one each = 3 passes), and several on one chain add up', () => {
      const two = market(plane(kb(2, [...M]).card('p1', MM, 'work').card('p2', MM, 'work'), 3));
      expect(two.state.phase).toMatchObject({ passes: 3 });
      expect(demandOf(two.state, 2)).toHaveLength(3);
      const stacked = market(plane(kb(2, [...M]).card('p1', MM, 'work').card('p1', MM, 'work'), 3));
      expect(stacked.state.phase).toMatchObject({ passes: 3 });
    });

    it('§10: the extra pass runs campaigns of every owner, even the player without a mass marketeer', () => {
      const ctx = market(plane(plane(kb(2, [...M]).card('p2', MM, 'work'), 3, { id: 'a', number: 4 }), 3, { id: 'b', owner: 'p2', number: 5, goods: ['pizza'] }));
      expect(ctx.of('campaignRan').map((e) => `${e.campaignId}${e.pass}`)).toEqual(['a1', 'b1', 'a2', 'b2']);
      expect(demandOf(ctx.state, 2)).toEqual(['burger', 'pizza', 'burger']);
    });

    it('§10: only played mass marketeers count: one on the beach adds nothing', () => {
      const ctx = market(plane(kb(2, [...M]).card('p1', MM, 'beach'), 3));
      expect(ctx.state.phase).toMatchObject({ passes: 1 });
      expect(demandOf(ctx.state, 2)).toEqual(['burger']);
    });

    it('§10: with no campaigns on the board the extra pass does nothing', () => {
      const ctx = market(kb(2, [...M]).card('p1', MM, 'work'));
      expect(ctx.of('campaignRan')).toHaveLength(0);
    });
  });

  describe('duration counters and caps', () => {
    it('§10: only ONE duration counter is removed per campaign, after the last pass', () => {
      const ctx = market(plane(kb(2, [...M]).card('p1', MM, 'work').card('p2', MM, 'work'), 4));
      expect(ctx.state.board.campaigns.c?.remaining).toBe(3);
      expect(ctx.of('campaignTicked')).toHaveLength(1);
    });

    it('§10: a campaign on its last counter runs all passes and only then expires', () => {
      const ctx = market(
        kb(2, [...M])
          .marketeerCampaign('marketing_trainee', 'mkt', { id: 'c', owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: { kind: 'airplane', side: 'W', offset: 3, width: 3 }, remaining: 1 })
          .card('p1', MM, 'work'),
      );
      expect(ctx.of('campaignRan').map((e) => e.pass)).toEqual([1, 2]);
      expect(demandOf(ctx.state, 2).filter((g) => g === 'burger')).toHaveLength(2);
      expect(ctx.state.board.campaigns.c).toBeUndefined();
      expect(ctx.of('campaignExpired').map((e) => e.campaignId)).toEqual(['c']);
      expect(ctx.state.players.p1?.beach).toContain('mkt');
    });

    it('§10: demand caps still apply: 3 per house, 5 with a garden, however many passes', () => {
      const b = kb(2, [...M])
        .placedHouse(1, 3, 3, 'E')
        .card('p1', MM, 'work')
        .card('p1', MM, 'work')
        .card('p2', MM, 'work')
        .card('p2', MM, 'work');
      const ctx = market(plane(b, 3));
      expect(ctx.state.phase).toMatchObject({ passes: 5 });
      expect(demandOf(ctx.state, 2)).toHaveLength(3);
      expect(demandOf(ctx.state, 10)).toHaveLength(3);
      expect(demandOf(ctx.state, 1)).toHaveLength(5);
    });
  });

  describe('through the real engine', () => {
    it('§10: a full round (Marketing → Clean up) with a mass marketeer at work runs two passes', () => {
      const b = plane(kb(2, [...M]).card('p1', MM, 'work'), 3);
      const s = b.phase({ kind: 'marketing', pass: 1, passes: 1, order: ['c'], idx: 0 }).build();
      const ctx = fromPhase(s);
      expect(ctx.of('campaignRan').map((e) => e.pass)).toEqual([1, 2]);
      expect(demandOf(ctx.state, 2)).toEqual(['burger', 'burger']);
    });

    it('§10: it places no tile: a mass marketeer cannot launch a campaign', () => {
      const { s, work } = workingTurn(kgame(2, [...M]), 'p1', { work: [MM] });
      const r = rejected(s, {
        type: 'work.placeCampaign',
        playerId: 'p1',
        cardUid: work[0] as Uid,
        campaignKind: 'billboard',
        tileNumber: 14,
        goods: ['burger'],
        placement: { kind: 'board', x: 3, y: 8, w: 1, h: 1 },
        duration: 1,
      });
      expect(r.code).toBe('CARD_UNAVAILABLE');
    });
  });
});
