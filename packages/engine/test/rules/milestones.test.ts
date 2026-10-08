/**
 * Milestone triggers, same-round sharing and immediate effects (docs/rules/milestones.md;
 * base.md §11; DLX p11, p34–35). Map: see c2ctx.ts.
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type StateBuilder } from '../../src/testing/index.js';
import {
  awardMilestone,
  checkCashMilestones,
  crossOutMilestones,
  launchesEternal,
  milestoneAvailable,
  onMilestoneEvent,
} from '../../src/rules/milestones.js';
import type { GameEvent } from '../../src/types/events.js';
import type { GameState } from '../../src/types/index.js';
import { MAP, makeCtx, type TestCtx } from './c2ctx.js';

function base(players = 2, intro = false): StateBuilder {
  return stateBuilder({ players, intro }).tiles(MAP).round(3).phase({ kind: 'working', player: 'p1', idx: 0 } as never);
}

function ctxOf(b: StateBuilder): TestCtx {
  return makeCtx(b.build());
}

const claimed = (s: GameState, player: string) => Object.keys(s.players[player]?.milestones ?? {}).sort();

function placed(ctx: TestCtx, player: string, campaignId: string): void {
  const campaign = ctx.state.board.campaigns[campaignId];
  if (!campaign) throw new Error(`no campaign ${campaignId}`);
  onMilestoneEvent(ctx, { type: 'campaignPlaced', player, campaign });
}

const PLANE = { kind: 'airplane', side: 'W', offset: 3, width: 1 } as const;

describe('same-round sharing (milestones.md general rules 1–3)', () => {
  it('every player who meets the condition in the same round claims it; after Cleanup D nobody else can', () => {
    const ctx = ctxOf(base(3));
    expect(awardMilestone(ctx, 'p2', 'first_train')).toBe(true);
    expect(awardMilestone(ctx, 'p1', 'first_train')).toBe(true);
    // Not twice for the same player.
    expect(awardMilestone(ctx, 'p1', 'first_train')).toBe(false);
    expect(ctx.state.milestones.first_train).toMatchObject({ claimedBy: ['p2', 'p1'], claimedRound: 3, removed: false });
    expect(ctx.state.players.p1?.milestones.first_train).toEqual({ round: 3, phase: 'working' });
    crossOutMilestones(ctx);
    expect(ctx.state.milestones.first_train?.removed).toBe(true);
    expect(milestoneAvailable(ctx.state, 'p3', 'first_train')).toBe(false);
    expect(awardMilestone(ctx, 'p3', 'first_train')).toBe(false);
    // Owners keep their milestone.
    expect(ctx.state.players.p1?.milestones.first_train).toBeDefined();
  });

  it('a milestone claimed in an earlier round is gone for everyone else', () => {
    const ctx = ctxOf(base().milestone('p1', 'first_train', 2));
    expect(awardMilestone(ctx, 'p2', 'first_train')).toBe(false);
  });

  it('module removeAfterRound: an unclaimed milestone is crossed out at the end of that round (Ketchup hard choices)', () => {
    const ctx = ctxOf(base().mutate((s) => {
      (s.milestones.first_radio as { removeAfterRound: number | null }).removeAfterRound = 3;
    }));
    crossOutMilestones(ctx);
    expect(ctx.state.milestones.first_radio?.removed).toBe(true);
    expect(ctx.state.milestones.first_airplane?.removed).toBe(false);
  });

  it('§13 intro game: no milestones', () => {
    const ctx = ctxOf(base(2, true));
    expect(awardMilestone(ctx, 'p1', 'first_train')).toBe(false);
  });
});

describe('campaign milestones (milestones.md; DLX p14, p20, p35)', () => {
  it('a burger billboard claims First Billboard and First Burger Marketed at once, and is itself eternal', () => {
    const b = base().campaign({ id: 'bb', owner: 'p1', kind: 'billboard', number: 14, goods: ['burger'], placement: { kind: 'board', x: 3, y: 8, w: 1, h: 1 }, remaining: 2 });
    const ctx = ctxOf(b);
    placed(ctx, 'p1', 'bb');
    expect(claimed(ctx.state, 'p1')).toEqual(['first_billboard', 'first_burger_marketed']);
    expect(ctx.state.board.campaigns.bb).toMatchObject({ eternal: true, remaining: 1 });
    expect(launchesEternal(ctx, 'p1', 'mailbox')).toBe(true);
    expect(launchesEternal(ctx, 'p2', 'mailbox')).toBe(false);
  });

  it('campaigns launched before First Billboard stay finite, even earlier the same turn (JD 1535067)', () => {
    const b = base()
      .campaign({ id: 'early', owner: 'p1', kind: 'airplane', number: 4, goods: ['soft_drink'], placement: PLANE, remaining: 3 })
      .campaign({ id: 'bb', owner: 'p1', kind: 'billboard', number: 14, goods: ['pizza'], placement: { kind: 'board', x: 3, y: 8, w: 1, h: 1 }, remaining: 2 });
    const ctx = ctxOf(b);
    placed(ctx, 'p1', 'early');
    placed(ctx, 'p1', 'bb');
    expect(ctx.state.board.campaigns.early).toMatchObject({ eternal: false, remaining: 3 });
    expect(ctx.state.board.campaigns.bb?.eternal).toBe(true);
    expect(claimed(ctx.state, 'p1')).toEqual(['first_airplane', 'first_billboard', 'first_drink_marketed', 'first_pizza_marketed']);
  });

  it('a radio claims First Radio Campaign; any drink claims First Drink Marketed', () => {
    const b = base().campaign({ id: 'r', owner: 'p2', kind: 'radio', number: 1, goods: ['lemonade'], placement: { kind: 'board', x: 3, y: 8, w: 1, h: 1 }, remaining: 2 });
    const ctx = ctxOf(b);
    placed(ctx, 'p2', 'r');
    expect(claimed(ctx.state, 'p2')).toEqual(['first_drink_marketed', 'first_radio']);
    expect(ctx.state.board.campaigns.r?.eternal).toBe(false);
  });
});

describe('restructuring milestones: "played" = at work at reveal (base.md §4.9)', () => {
  it('waitress, errand boy and cart operator at work claim; on the beach they do not', () => {
    const b = base()
      .card('p1', 'waitress', 'work')
      .card('p1', 'errand_boy', 'work')
      .card('p2', 'cart_operator', 'beach')
      .card('p2', 'management_trainee', 'work', 'mt')
      .card('p2', 'waitress', { under: 'mt' });
    const ctx = ctxOf(b);
    const structures = { p1: ctx.state.players.p1!.structure, p2: ctx.state.players.p2!.structure };
    onMilestoneEvent(ctx, { type: 'structuresRevealed', structures });
    expect(claimed(ctx.state, 'p1')).toEqual(['first_errand_boy', 'first_waitress']);
    expect(claimed(ctx.state, 'p2')).toEqual(['first_waitress']);
  });
});

describe('working-phase milestones', () => {
  it('First to Hire 3 (CEO hire counts): 2 free Management Trainees on the beach', () => {
    const b = base().turn({ player: 'p1', hired: ['a', 'b', 'c'] });
    const ctx = ctxOf(b);
    const supply = ctx.state.supply.management_trainee ?? 0;
    onMilestoneEvent(ctx, { type: 'employeeHired', player: 'p1', uid: 'c', employeeId: 'waitress', by: b.ceoUid('p1') });
    expect(claimed(ctx.state, 'p1')).toEqual(['first_hire_3']);
    expect(ctx.of('employeeGained').map((e) => e.employeeId)).toEqual(['management_trainee', 'management_trainee']);
    expect(ctx.state.supply.management_trainee).toBe(supply - 2);
    expect(ctx.state.players.p1?.beach).toHaveLength(2);
  });

  it('First to Hire 3: fewer trainees if the supply is short; 2 hires do not trigger it', () => {
    const ctx = ctxOf(base().turn({ player: 'p1', hired: ['a', 'b', 'c'] }).mutate((s) => (s.supply.management_trainee = 1)));
    onMilestoneEvent(ctx, { type: 'employeeHired', player: 'p1', uid: 'c', employeeId: 'waitress', by: 'x' });
    expect(ctx.of('employeeGained')).toHaveLength(1);
    expect(ctx.state.supply.management_trainee).toBe(0);
    const ctx2 = ctxOf(base().turn({ player: 'p1', hired: ['a', 'b'] }));
    onMilestoneEvent(ctx2, { type: 'employeeHired', player: 'p1', uid: 'b', employeeId: 'waitress', by: 'x' });
    expect(claimed(ctx2.state, 'p1')).toEqual([]);
  });

  it('First Burger / Pizza Produced: gain a cook on the beach; none in supply → milestone only; 0 produced → nothing', () => {
    const ctx = ctxOf(base().mutate((s) => (s.supply.pizza_cook = 0)));
    onMilestoneEvent(ctx, { type: 'foodProduced', player: 'p1', uid: null, food: 'burger', count: 0 });
    expect(claimed(ctx.state, 'p1')).toEqual([]);
    onMilestoneEvent(ctx, { type: 'foodProduced', player: 'p1', uid: null, food: 'burger', count: 3 });
    onMilestoneEvent(ctx, { type: 'foodProduced', player: 'p1', uid: null, food: 'pizza', count: 1 });
    expect(claimed(ctx.state, 'p1')).toEqual(['first_burger_produced', 'first_pizza_produced']);
    const gained = ctx.of('employeeGained');
    expect(gained.map((e) => e.employeeId)).toEqual(['burger_cook']);
    const uid = gained[0]!.uid;
    expect(ctx.state.players.p1?.beach).toContain(uid);
    expect(ctx.state.players.p1?.employees[uid]).toMatchObject({ employeeId: 'burger_cook', acquiredRound: 3 });
  });

  it('First to Train', () => {
    const ctx = ctxOf(base());
    onMilestoneEvent(ctx, { type: 'employeeTrained', player: 'p2', uid: 'u', from: 'waitress', to: 'waitress', by: ['t'], steps: 1 });
    expect(claimed(ctx.state, 'p2')).toEqual(['first_train']);
  });
});

describe('Payday / cash milestones', () => {
  it('First to Pay $20: paid ≥ $20 (after discounts)', () => {
    const ctx = ctxOf(base());
    const ev = (player: string, paid: number): GameEvent => ({ type: 'salaryPaid', player, gross: 30, discounts: 30 - paid, paid });
    onMilestoneEvent(ctx, ev('p1', 19));
    onMilestoneEvent(ctx, ev('p2', 20));
    expect(claimed(ctx.state, 'p1')).toEqual([]);
    expect(claimed(ctx.state, 'p2')).toEqual(['first_pay_20']);
  });

  it('Q-B1 First to Have $20 / $100 are only checked during Dinnertime', () => {
    const ctx = ctxOf(base().cash('p1', 150));
    checkCashMilestones(ctx, 'p1');
    onMilestoneEvent(ctx, { type: 'cashChanged', player: 'p1', delta: 5, reason: 'x', bank: 0 });
    expect(claimed(ctx.state, 'p1')).toEqual([]);
    ctx.state.phase = { kind: 'dinnertime', houses: [], idx: 0 };
    onMilestoneEvent(ctx, { type: 'cashChanged', player: 'p1', delta: 5, reason: 'x', bank: 0 });
    expect(claimed(ctx.state, 'p1')).toEqual(['first_100', 'first_20']);
  });

  it('Q-B1 (DLX p28 "at any point during Dinnertime"): $20 reached mid-Dinnertime is kept even if cash later drops (negative prices)', () => {
    const ctx = ctxOf(base().cash('p1', 25));
    ctx.state.phase = { kind: 'dinnertime', houses: [], idx: 0 };
    onMilestoneEvent(ctx, { type: 'cashChanged', player: 'p1', delta: 6, reason: 'sale', bank: 0 });
    expect(claimed(ctx.state, 'p1')).toEqual(['first_20']);
    (ctx.state.players.p1 as { cash: number }).cash = 11;
    onMilestoneEvent(ctx, { type: 'cashChanged', player: 'p1', delta: -14, reason: 'sale', bank: 0 });
    checkCashMilestones(ctx, 'p1');
    expect(claimed(ctx.state, 'p1')).toEqual(['first_20']);
  });

  it('First to Throw Away: any discarded item', () => {
    const ctx = ctxOf(base());
    onMilestoneEvent(ctx, { type: 'foodDiscarded', player: 'p1', goods: {} });
    expect(claimed(ctx.state, 'p1')).toEqual([]);
    onMilestoneEvent(ctx, { type: 'foodDiscarded', player: 'p1', goods: { soft_drink: 1 } });
    expect(claimed(ctx.state, 'p1')).toEqual(['first_throw_away']);
  });
});
