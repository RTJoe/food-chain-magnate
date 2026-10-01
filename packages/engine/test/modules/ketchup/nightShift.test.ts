/**
 * Night Shift Managers (ketchup.md §11; KX p14; DLX p22).
 *
 * Working-phase scenarios go through the reducer on MAP3 (p1's restaurant at (3,3) NW, see
 * test/rules/working.test.ts); Dinnertime scenarios use the `kb` builder (helpers.ts).
 */
import { describe, expect, it } from 'vitest';
import type { Action, EmployeeId, GameState, PlayerId, Uid } from '../../../src/index.js';
import { clone } from '../../../src/index.js';
import { allocId } from '../../../src/core/ids.js';
import { makeCtx } from '../../../src/core/context.js';
import { runUntilInput } from '../../../src/core/phase.js';
import { runMarketing } from '../../../src/rules/marketing.js';
import { contentFor } from '../../../src/modules/registry.js';
import { act, actE, rejected, workingTurn } from '../../helpers/game.js';
import { dine, kb, kgame } from './helpers.js';

const M = ['ketchup:nightShift'] as const;
const NSM = 'ketchup:night_shift_manager';

const turn = (s: GameState) => s.turn as NonNullable<GameState['turn']>;

describe('Night Shift Managers (ketchup.md §11)', () => {
  it('§11: card data: 1x entry-level black manager with a salary, 3 copies, not reachable by training', () => {
    const c = contentFor([...M]);
    expect(c.employees[NSM]).toMatchObject({ count: 3, entry: true, salary: true, unique: true, colour: 'black', category: 'manager' });
    expect(c.employees[NSM]?.ability).toEqual({ kind: 'nightShift' });
    for (const def of Object.values(c.employees)) expect(def?.trainsInto ?? []).not.toContain(NSM);
  });

  describe('CEO slot only (restructure.submit)', () => {
    /** Round-2 Restructuring with these cards in p1's hand. */
    function restructuring(hand: EmployeeId[]) {
      const s: GameState = clone(kgame(2, [...M]));
      const p = s.players.p1 as GameState['players'][PlayerId];
      const uids = hand.map((id) => {
        const uid = allocId(s, 'card');
        p.employees[uid] = { uid, employeeId: id, acquiredRound: 1 };
        s.supply[id] = (s.supply[id] ?? 0) - 1;
        return uid;
      });
      s.round = 2;
      s.phase = { kind: 'restructuring' };
      runUntilInput(makeCtx(s));
      return { s, uids };
    }
    const submit = (ceoSubs: Uid[], managerSubs: Record<Uid, Uid[]> = {}): Action => ({ type: 'restructure.submit', playerId: 'p1', structure: { ceoSubs, managerSubs } });

    it('§11: accepted in a CEO slot', () => {
      const { s, uids } = restructuring([NSM, 'waitress']);
      act(s, submit([uids[0] as Uid, uids[1] as Uid]));
    });

    it('§11: rejected under another manager', () => {
      const { s, uids } = restructuring([NSM, 'management_trainee']);
      const [nsm, mt] = uids as [Uid, Uid];
      expect(rejected(s, submit([mt], { [mt]: [nsm] })).message).toMatch(/CEO slot/);
    });

    it('§11: it has 0 slots of its own: nothing can be placed under it', () => {
      const { s, uids } = restructuring([NSM, 'waitress']);
      const [nsm, w] = uids as [Uid, Uid];
      expect(rejected(s, submit([nsm], { [nsm]: [w] })).message).toMatch(/not a manager/);
    });

    it('§11 clarification: a management trainee gains no slots from it (3 under a 2-slot trainee is still overfill)', () => {
      const { s, uids } = restructuring([NSM, 'management_trainee', 'waitress', 'waitress', 'waitress']);
      const [nsm, mt, a, b, c] = uids as [Uid, Uid, Uid, Uid, Uid];
      const over = actE(s, submit([nsm, mt], { [mt]: [a, b, c] }));
      expect(over.events.some((e) => e.type === 'structurePenalty')).toBe(true);
      const ok = actE(s, submit([nsm, mt], { [mt]: [a, b] }));
      expect(ok.events.some((e) => e.type === 'structurePenalty')).toBe(false);
      expect(ok.state.players.p1?.structure.ceoSubs).toEqual([nsm, mt]);
    });
  });

  describe('salary-free cards act twice (cardUses)', () => {
    it('§11: uses double for cards without a salary icon; salaried cards and the CEO keep 1; the NSM itself has none', () => {
      const { s, work, ceo } = workingTurn(kgame(2, [...M]), 'p1', { work: [NSM, 'kitchen_trainee', 'recruiting_girl', 'burger_cook'] });
      const [nsm, kt, rg, bc] = work as Uid[] as [Uid, Uid, Uid, Uid];
      expect(turn(s).uses[kt]).toBe(2);
      expect(turn(s).uses[rg]).toBe(2);
      expect(turn(s).uses[bc]).toBe(1);
      expect(turn(s).uses[ceo]).toBe(1);
      expect(turn(s).uses[nsm]).toBeUndefined();
    });

    it('§11: without a Night Shift Manager at work (on the beach) nothing doubles', () => {
      const { s, work } = workingTurn(kgame(2, [...M]), 'p1', { work: ['kitchen_trainee'], beach: [NSM] });
      expect(turn(s).uses[work[0] as Uid]).toBe(1);
    });

    it('§11: a kitchen trainee makes 2 (1 each time); a third production is rejected', () => {
      const { s, work } = workingTurn(kgame(2, [...M]), 'p1', { work: [NSM, 'kitchen_trainee'] });
      const kt = work[1] as Uid;
      let t = act(s, { type: 'work.produce', playerId: 'p1', cardUid: kt, food: 'burger' });
      t = act(t, { type: 'work.produce', playerId: 'p1', cardUid: kt, food: 'pizza' });
      expect(t.players.p1?.inventory).toEqual({ burger: 1, pizza: 1 });
      expect(rejected(t, { type: 'work.produce', playerId: 'p1', cardUid: kt, food: 'burger' }).code).toBe('CARD_UNAVAILABLE');
    });

    it('§11: a recruiting girl hires 2; a third hire is rejected', () => {
      const { s, work } = workingTurn(kgame(2, [...M]), 'p1', { work: [NSM, 'recruiting_girl'] });
      const rg = work[1] as Uid;
      let t = act(s, { type: 'work.recruit', playerId: 'p1', cardUid: rg, employeeId: 'waitress' });
      t = act(t, { type: 'work.recruit', playerId: 'p1', cardUid: rg, employeeId: 'errand_boy' });
      expect(rejected(t, { type: 'work.recruit', playerId: 'p1', cardUid: rg, employeeId: 'waitress' }).code).toBe('CARD_UNAVAILABLE');
    });

    it('§11: a trainer trains 2 different cards, but never the same card twice', () => {
      const { s, work, beach } = workingTurn(kgame(2, [...M]), 'p1', { work: [NSM, 'trainer'], beach: ['kitchen_trainee', 'marketing_trainee'] });
      const trainer = work[1] as Uid;
      let t = act(s, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: beach[0] as Uid, toEmployeeId: 'burger_cook' });
      expect(rejected(t, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: beach[0] as Uid, toEmployeeId: 'burger_chef' }).message).toMatch(/at most 1/);
      t = act(t, { type: 'work.train', playerId: 'p1', trainerUid: trainer, targetUid: beach[1] as Uid, toEmployeeId: 'campaign_manager' });
      expect(t.players.p1?.employees[beach[0] as string]?.employeeId).toBe('burger_cook');
      expect(t.players.p1?.employees[beach[1] as string]?.employeeId).toBe('campaign_manager');
    });

    it('§11: a marketing trainee may start a second billboard; both busy chips sit on her', () => {
      const { s, work } = workingTurn(kgame(2, [...M]), 'p1', { work: [NSM, 'marketing_trainee'] });
      const mt = work[1] as Uid;
      const bb = (x: number, y: number, tileNumber: number, w = 2): Action => ({
        type: 'work.placeCampaign',
        playerId: 'p1',
        cardUid: mt,
        campaignKind: 'billboard',
        tileNumber,
        goods: ['burger'],
        placement: { kind: 'board', x, y, w, h: 1 },
        duration: 1,
      });
      let t = act(s, bb(3, 0, 14));
      t = act(t, bb(3, 1, 13, 3));
      const ids = Object.keys(t.board.campaigns);
      expect(ids).toHaveLength(2);
      expect(t.players.p1?.busy[mt]).toEqual(ids);
      expect(t.players.p1?.structure.ceoSubs).not.toContain(mt);
      expect(rejected(t, bb(6, 0, 15, 1)).code).toBe('CARD_UNAVAILABLE');

      // She returns to the beach only when BOTH campaigns have ended.
      const u = clone(t);
      for (const c of Object.values(u.board.campaigns)) {
        c.eternal = false;
        c.remaining = c.id === ids[0] ? 1 : 2;
      }
      const ctx = makeCtx(u);
      runMarketing(ctx);
      expect(u.players.p1?.busy[mt]).toEqual([ids[1]]);
      expect(u.players.p1?.beach).not.toContain(mt);
      runMarketing(ctx);
      expect(u.players.p1?.busy[mt]).toBeUndefined();
      expect(u.players.p1?.beach).toContain(mt);
    });
  });

  describe('passive cards (Dinnertime)', () => {
    // House 2 on tile (0,0); p1 restaurant (3,3) NW.
    const sale = (b: ReturnType<typeof kb>) => dine(b.restaurant('p1', 3, 3, 'NW').inventory('p1', { burger: 1 }).demand(2, ['burger'])).of('sale')[0];

    it('§11: a pricing manager gives -$2 instead of -$1', () => {
      const one = sale(kb(2, [...M]).card('p1', 'pricing_manager', 'work'));
      const doubled = sale(kb(2, [...M]).card('p1', NSM, 'work').card('p1', 'pricing_manager', 'work'));
      expect(doubled?.unitPrice).toBe((one?.unitPrice ?? 0) - 1);
      expect(sale(kb(2, [...M]).card('p1', NSM, 'beach').card('p1', 'pricing_manager', 'work'))?.unitPrice).toBe(one?.unitPrice);
    });

    it('§11: salaried pricing cards (discount manager, luxuries manager) are not doubled', () => {
      const discount = sale(kb(2, [...M]).card('p1', 'discount_manager', 'work'));
      expect(sale(kb(2, [...M]).card('p1', NSM, 'work').card('p1', 'discount_manager', 'work'))?.unitPrice).toBe(discount?.unitPrice);
      const lux = sale(kb(2, [...M]).card('p1', 'luxuries_manager', 'work'));
      expect(sale(kb(2, [...M]).card('p1', NSM, 'work').card('p1', 'luxuries_manager', 'work'))?.unitPrice).toBe(lux?.unitPrice);
    });

    it('§11: a waitress earns double tips (also with First Waitress: ($3 + $2) x 2)', () => {
      const plain = dine(kb(2, [...M]).card('p1', NSM, 'work').card('p1', 'waitress', 'work')).of('tipsPaid');
      expect(plain).toEqual([expect.objectContaining({ player: 'p1', waitresses: 2, amount: 6 })]);
      const noNsm = dine(kb(2, [...M]).card('p1', 'waitress', 'work')).of('tipsPaid');
      expect(noNsm).toEqual([expect.objectContaining({ waitresses: 1, amount: 3 })]);
      const milestone = dine(kb(2, [...M]).milestone('p1', 'first_waitress', 2).card('p1', NSM, 'work').card('p1', 'waitress', 'work')).of('tipsPaid');
      expect(milestone[0]).toMatchObject({ amount: 10 });
    });

    it('§11: a waitress counts as 2 waitresses for ties', () => {
      // House 10: both restaurants 0 borders away, same price. p2 has 2 waitresses, p1 has 1 (+ night shift).
      const duel = (nsm: boolean) => {
        let b = kb(2, [...M])
          .restaurant('p1', 3, 5, 'NW')
          .restaurant('p2', 3, 8, 'NW')
          .turnOrder(['p2', 'p1'])
          .card('p1', 'waitress', 'work')
          .card('p2', 'waitress', 'work')
          .card('p2', 'waitress', 'work')
          .inventory('p1', { burger: 1 })
          .inventory('p2', { burger: 1 })
          .demand(10, ['burger']);
        if (nsm) b = b.card('p1', NSM, 'work');
        return dine(b).of('sale')[0];
      };
      expect(duel(false)).toMatchObject({ player: 'p2' });
      // 2 vs 2 waitresses: still a tie on waitresses, so turn order (p2 first) decides...
      expect(duel(true)).toMatchObject({ player: 'p2' });
    });

    it('§11: a waitress counts as 2 waitresses for ties (strict win: 2 vs 1)', () => {
      const duel = (nsm: boolean) => {
        let b = kb(2, [...M])
          .restaurant('p1', 3, 5, 'NW')
          .restaurant('p2', 3, 8, 'NW')
          .turnOrder(['p2', 'p1'])
          .card('p1', 'waitress', 'work')
          .card('p2', 'waitress', 'work')
          .inventory('p1', { burger: 1 })
          .inventory('p2', { burger: 1 })
          .demand(10, ['burger']);
        if (nsm) b = b.card('p1', NSM, 'work');
        return dine(b).of('sale')[0];
      };
      // 1 vs 1: turn order, p2 first.
      expect(duel(false)).toMatchObject({ player: 'p2' });
      // 2 (night shift) vs 1: p1 wins the tie despite being later in turn order.
      expect(duel(true)).toMatchObject({ player: 'p1' });
    });

    it('§11: the CEO and the salaried pricing cards are never doubled', () => {
      const { s, ceo } = workingTurn(kgame(2, [...M]), 'p1', { work: [NSM] });
      expect(turn(s).uses[ceo]).toBe(1);
    });
  });
});
