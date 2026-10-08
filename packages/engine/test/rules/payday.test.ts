/**
 * Payday scenarios (base.md §8; DLX p29; milestones.md first_train, first_billboard,
 * first_pay_20, first_100; questions.md Q-B6). Map: see c2ctx.ts.
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type StateBuilder } from '../../src/testing/index.js';
import { applyPaydayAction, enterPayday, isPaydayComplete, salaryAfterFiring, salaryBreakdown, validatePaydayAction } from '../../src/rules/payday.js';
import { contentFor } from '../../src/modules/registry.js';
import type { PaydayConfirm, PaydayFire } from '../../src/types/index.js';
import { MAP, makeCtx, type TestCtx } from './c2ctx.js';
import { makeCtx as coreCtx } from '../../src/core/context.js';
import { runUntilInput } from '../../src/core/phase.js';
import { applyAction, derivePrompt, redactFor } from '../../src/index.js';

/** A W-side 1-wide airplane over row 3 (needs no board squares). */
const PLANE = { kind: 'airplane', side: 'W', offset: 3, width: 1 } as const;

function base(opts: { intro?: boolean; players?: number } = {}): StateBuilder {
  return stateBuilder({ players: opts.players ?? 2, intro: opts.intro ?? false }).tiles(MAP).round(3).bank({ cash: 100 });
}

function payday(b: StateBuilder): TestCtx {
  const ctx = makeCtx(b.phase({ kind: 'payday', queue: [], idx: 0 }).build());
  enterPayday(ctx);
  return ctx;
}

function act(ctx: TestCtx, a: PaydayFire | PaydayConfirm): void {
  const r = validatePaydayAction(ctx.state, a);
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  applyPaydayAction(ctx, a);
}

const fire = (playerId: string, ...uids: string[]): PaydayFire => ({ type: 'payday.fire', playerId, uids });
const confirm = (playerId: string): PaydayConfirm => ({ type: 'payday.confirm', playerId });

describe('salaries (base.md §8.2)', () => {
  it('$5 per salaried card at work, on the beach and busy; unsalaried cards are free; money goes to the bank', () => {
    const ctx = payday(
      base()
        .cash('p1', 50)
        .card('p1', 'junior_vp', 'work', 'jvp')
        .card('p1', 'burger_cook', 'beach', 'cook')
        .card('p1', 'waitress', 'work', 'w')
        .card('p1', 'pricing_manager', 'beach', 'pm')
        .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 2 }),
    );
    expect(ctx.state.awaiting).toEqual({ kind: 'payday.fire', players: ['p1'] });
    act(ctx, confirm('p1'));
    expect(ctx.of('salaryPaid')).toEqual([expect.objectContaining({ player: 'p1', gross: 15, discounts: 0, paid: 15 }), expect.objectContaining({ player: 'p2', paid: 0 })]);
    expect(ctx.state.players.p1?.cash).toBe(35);
    expect(ctx.state.bank.cash).toBe(115);
    expect(ctx.state.players.p1?.salaryPaidThisRound).toBe(15);
    expect(isPaydayComplete(ctx.state)).toBe(true);
  });

  it('a player with nothing to fire (CEO only) is not asked', () => {
    const ctx = payday(base());
    expect(ctx.state.awaiting.kind).toBe('none');
    expect(isPaydayComplete(ctx.state)).toBe(true);
  });

  it('§13 intro game: no Payday at all', () => {
    const ctx = payday(base({ intro: true }).cash('p1', 50).card('p1', 'junior_vp', 'work'));
    expect(ctx.of('salaryPaid')).toHaveLength(0);
    expect(ctx.state.players.p1?.cash).toBe(50);
    expect(isPaydayComplete(ctx.state)).toBe(true);
  });
});

describe('discounts (base.md §8.3)', () => {
  it('$5 per unused recruiting-manager/HR-director action and $15 with First to Train; total never below $0', () => {
    const b = base()
      .cash('p1', 50)
      .card('p1', 'recruiting_manager', 'work')
      .card('p1', 'junior_vp', 'beach')
      .card('p1', 'burger_cook', 'beach')
      .card('p1', 'pizza_cook', 'beach')
      .card('p1', 'coach', 'beach')
      .mutate((s) => {
        (s.players.p1 as { unusedRecruitActions: number }).unusedRecruitActions = 1;
      });
    // 5 salaried = $25 − $5 = $20
    const ctx = payday(b);
    act(ctx, confirm('p1'));
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ gross: 25, discounts: 5, paid: 20 });

    // + First to Train: 25 − 5 − 15 = $5
    const ctx2 = payday(b.milestone('p1', 'first_train', 2));
    act(ctx2, confirm('p1'));
    expect(ctx2.of('salaryPaid')[0]).toMatchObject({ gross: 25, discounts: 20, paid: 5 });
  });

  it('discounts are mandatory and the total is floored at $0', () => {
    const s = base().card('p1', 'junior_vp', 'work').milestone('p1', 'first_train', 2).build();
    expect(salaryBreakdown(s, makeCtx(s).content, 'p1')).toMatchObject({ salaried: 1, total: 0 });
  });

  it('First Billboard: no salary for campaign managers, brand managers, brand directors (in structure or busy); others still paid', () => {
    const ctx = payday(
      base()
        .cash('p1', 50)
        .milestone('p1', 'first_billboard', 2)
        .card('p1', 'campaign_manager', 'work')
        .card('p1', 'brand_director', 'beach')
        .card('p1', 'junior_vp', 'work')
        .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 2 }),
    );
    act(ctx, confirm('p1'));
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ gross: 5, paid: 5 });
  });

  it('§6.4: the marketeer of an eternal campaign has no salary', () => {
    const s = base()
      .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 1, eternal: true })
      .build();
    expect(salaryBreakdown(s, makeCtx(s).content, 'p1')).toMatchObject({ salaried: 0, total: 0 });
  });

  it('a card gained with salaryFree costs nothing', () => {
    const s = base()
      .card('p1', 'executive_vp', 'beach', 'evp')
      .mutate((st) => {
        (st.players.p1?.employees.evp as { salaryFree?: boolean }).salaryFree = true;
      })
      .build();
    expect(salaryBreakdown(s, makeCtx(s).content, 'p1').salaried).toBe(0);
  });
});

describe('voluntary firing (base.md §8.1)', () => {
  const make = () =>
    base()
      .cash('p1', 50)
      .cash('p2', 50)
      .card('p1', 'management_trainee', 'work', 'mt')
      .card('p1', 'junior_vp', { under: 'mt' }, 'jvp-under')
      .card('p1', 'burger_cook', 'beach', 'cook')
      .card('p2', 'pizza_cook', 'work', 'p2cook')
      .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 2 });

  it('firing is simultaneous: anyone may decide in any order; salaries settle only after everyone confirms', () => {
    const ctx = payday(make());
    expect(ctx.state.awaiting).toEqual({ kind: 'payday.fire', players: ['p1', 'p2'] });
    act(ctx, fire('p2', 'p2cook'));
    act(ctx, confirm('p2'));
    expect(ctx.of('salaryPaid')).toHaveLength(0);
    expect(ctx.state.awaiting).toEqual({ kind: 'payday.fire', players: ['p1'] });
    act(ctx, fire('p1', 'cook'));
    act(ctx, confirm('p1'));
    expect(ctx.state.players.p2?.employees.p2cook).toBeUndefined();
    expect(ctx.state.supply.pizza_cook).toBe(6);
    // p1: busy brand manager + JVP = $10; p2: nothing.
    expect(ctx.of('salaryPaid').map((e) => [e.player, e.paid])).toEqual([
      ['p1', 10],
      ['p2', 0],
    ]);
    expect(validatePaydayAction(ctx.state, confirm('p1'))).toMatchObject({ ok: false, code: 'ALREADY_SUBMITTED' });
  });

  it('cards at work and on the beach can be fired; the CEO and busy marketeers cannot', () => {
    const b = make();
    const ctx = payday(b);
    const ceo = b.ceoUid('p1');
    expect(validatePaydayAction(ctx.state, fire('p1', ceo))).toMatchObject({ ok: false, code: 'ILLEGAL' });
    expect(validatePaydayAction(ctx.state, fire('p1', 'bm'))).toMatchObject({ ok: false, code: 'CARD_UNAVAILABLE' });
    expect(validatePaydayAction(ctx.state, fire('p1', 'p2cook'))).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    expect(validatePaydayAction(ctx.state, fire('p1', 'cook', 'cook'))).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(validatePaydayAction(ctx.state, fire('p1', 'mt', 'jvp-under', 'cook'))).toEqual({ ok: true });
  });

  it('firing a manager leaves its reports owned (on the beach, still salaried)', () => {
    const ctx = payday(make());
    act(ctx, fire('p1', 'mt'));
    act(ctx, confirm('p1'));
    act(ctx, confirm('p2'));
    const p1 = ctx.state.players.p1;
    expect(p1?.employees.mt).toBeUndefined();
    expect(p1?.beach).toContain('jvp-under');
    expect(p1?.structure.managerSubs.mt).toBeUndefined();
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ player: 'p1', paid: 15 });
  });

});

describe("can't pay (base.md §8.4)", () => {
  it('must fire salaried employees until the rest is payable — and no more', () => {
    const ctx = payday(
      base()
        .cash('p1', 7)
        .card('p1', 'junior_vp', 'work', 'a')
        .card('p1', 'burger_cook', 'beach', 'b')
        .card('p1', 'pizza_cook', 'beach', 'c')
        .card('p1', 'waitress', 'work', 'w'),
    );
    act(ctx, confirm('p1'));
    expect(ctx.state.pending[0]).toMatchObject({ kind: 'forcedFire', player: 'p1', owed: 15 });
    expect(ctx.state.awaiting).toEqual({ kind: 'choice', players: ['p1'] });
    expect(isPaydayComplete(ctx.state)).toBe(false);
    expect(validatePaydayAction(ctx.state, confirm('p1'))).toMatchObject({ ok: false });
    expect(validatePaydayAction(ctx.state, fire('p1', 'w'))).toMatchObject({ ok: false, code: 'ILLEGAL' });
    // 2 fired → $5 owed ≤ $7; a third would be one too many.
    expect(validatePaydayAction(ctx.state, fire('p1', 'a', 'b', 'c'))).toMatchObject({ ok: false, code: 'ILLEGAL' });
    // Firing one at a time also works: still unpayable after the first.
    act(ctx, fire('p1', 'a'));
    expect(ctx.state.pending[0]).toMatchObject({ kind: 'forcedFire', owed: 10 });
    act(ctx, fire('p1', 'c'));
    expect(ctx.state.pending).toHaveLength(0);
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ player: 'p1', paid: 5 });
    expect(ctx.state.players.p1?.cash).toBe(2);
    expect(ctx.of('employeeFired').every((e) => e.forced)).toBe(true);
    expect(isPaydayComplete(ctx.state)).toBe(true);
  });

  it('with $0 a player fires every salaried card; a busy marketeer only once no other salaried card is left; its campaign stays', () => {
    const ctx = payday(
      base()
        .card('p1', 'junior_vp', 'beach', 'a')
        .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 2, id: 'camp-x' }),
    );
    act(ctx, confirm('p1'));
    expect(validatePaydayAction(ctx.state, fire('p1', 'bm'))).toMatchObject({ ok: false, code: 'ILLEGAL' });
    act(ctx, fire('p1', 'a', 'bm'));
    expect(ctx.state.players.p1?.employees.bm).toBeUndefined();
    expect(ctx.state.players.p1?.busy.bm).toBeUndefined();
    expect(ctx.state.board.campaigns['camp-x']).toMatchObject({ marketeer: null, remaining: 2 });
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ player: 'p1', paid: 0 });
  });

  it('discounts count when deciding whether salaries are payable', () => {
    const ctx = payday(
      base()
        .cash('p1', 0)
        .card('p1', 'junior_vp', 'work')
        .card('p1', 'burger_cook', 'beach')
        .card('p1', 'pizza_cook', 'beach')
        .milestone('p1', 'first_train', 2),
    );
    act(ctx, confirm('p1'));
    expect(ctx.state.pending).toHaveLength(0);
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ gross: 15, paid: 0 });
  });

  it('only the player who must fire may act while forced firing is pending', () => {
    const ctx = payday(base({ players: 3 }).card('p1', 'junior_vp', 'work', 'a').card('p2', 'junior_vp', 'work', 'b').cash('p2', 5));
    act(ctx, confirm('p2'));
    act(ctx, confirm('p1'));
    expect(ctx.state.pending[0]).toMatchObject({ player: 'p1' });
    expect(validatePaydayAction(ctx.state, fire('p2', 'b'))).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    act(ctx, fire('p1', 'a'));
    expect(ctx.of('salaryPaid').map((e) => [e.player, e.paid])).toEqual([
      ['p1', 0],
      ['p2', 5],
      ['p3', 0],
    ]);
  });
});

describe('Payday milestones', () => {
  it('§8.5 First to Pay $20 or More: judged on the amount actually paid after discounts', () => {
    const make = (unused: number) =>
      base()
        .cash('p1', 50)
        .card('p1', 'recruiting_manager', 'work')
        .card('p1', 'junior_vp', 'beach')
        .card('p1', 'burger_cook', 'beach')
        .card('p1', 'pizza_cook', 'beach')
        .card('p1', 'coach', 'beach')
        .mutate((s) => {
          (s.players.p1 as { unusedRecruitActions: number }).unusedRecruitActions = unused;
        });
    const ctx = payday(make(1)); // $25 − $5 = $20
    act(ctx, confirm('p1'));
    expect(ctx.state.players.p1?.milestones.first_pay_20).toBeDefined();
    const ctx2 = payday(make(2)); // $25 − $10 = $15
    act(ctx2, confirm('p1'));
    expect(ctx2.state.players.p1?.milestones.first_pay_20).toBeUndefined();
  });

  it('Q-B6 First to Have $100: an owned CFO is fired at the start of Payday (no salary due for it)', () => {
    const ctx = payday(base().cash('p1', 120).milestone('p1', 'first_100', 3).card('p1', 'cfo', 'work', 'cfo').card('p1', 'junior_vp', 'work'));
    expect(ctx.state.players.p1?.employees.cfo).toBeUndefined();
    expect(ctx.of('employeeFired')[0]).toMatchObject({ uid: 'cfo', forced: true, reason: 'milestone' });
    act(ctx, confirm('p1'));
    expect(ctx.of('salaryPaid')[0]).toMatchObject({ paid: 5 });
  });
});

describe('Payday prompt', () => {
  it('DLX p29: mustFire warns a player whose cash cannot cover the salaries', () => {
    const ctx = payday(base().cash('p1', 0).cash('p2', 50).card('p1', 'junior_vp', 'work', 'j1').card('p2', 'junior_vp', 'work', 'j2'));
    expect(derivePrompt(redactFor(ctx.state, 'p1'), 'p1')).toMatchObject({ kind: 'payday', owed: 5, mustFire: true });
    expect(derivePrompt(redactFor(ctx.state, 'p2'), 'p2')).toMatchObject({ kind: 'payday', owed: 5, mustFire: false });
  });
});

describe('undo while others decide (DLX p29 simultaneous)', () => {
  it('a payday.confirm stays undoable until the last player confirms', () => {
    const b = base().cash('p1', 50).cash('p2', 50).card('p1', 'junior_vp', 'work', 'j1').card('p2', 'junior_vp', 'work', 'j2');
    const ctx = coreCtx(b.phase({ kind: 'payday', queue: [], idx: 0 }).build());
    enterPayday(ctx);
    let s = ctx.state;
    const step = (a: PaydayFire | PaydayConfirm) => {
      const r = applyAction(s, a);
      if (!r.ok) throw new Error(r.message);
      s = r.state;
      return r.undoable;
    };
    expect(step(fire('p1', 'j1'))).toBe(true);
    expect(step(confirm('p1'))).toBe(true);
    expect(step(confirm('p2'))).toBe(false);
    expect(s.players.p1?.employees.j1).toBeUndefined();
  });
});

describe('intro game through the phase loop (DLX p5)', () => {
  function afterDinner(b: StateBuilder) {
    const ctx = coreCtx(b.phase({ kind: 'dinnertime', houses: [], idx: 0 }).build());
    runUntilInput(ctx);
    return ctx;
  }

  it('DLX p5: Dinnertime goes straight to Marketing; no Payday phase is entered', () => {
    const ctx = afterDinner(base({ intro: true }).cash('p1', 50).card('p1', 'junior_vp', 'work'));
    const to = ctx.events.flatMap((e) => (e.type === 'phaseChanged' ? [e.to.kind] : []));
    expect(to).toContain('marketing');
    expect(to).not.toContain('payday');
    expect(ctx.state.players.p1?.cash).toBe(50);
  });

  it('DLX p34 + p5: with milestones, the First to Have $100 CFO is still fired although Payday is skipped', () => {
    const ctx = afterDinner(base({ intro: true }).cash('p1', 120).milestone('p1', 'first_100', 3).card('p1', 'cfo', 'work', 'cfo'));
    expect(ctx.state.players.p1?.employees.cfo).toBeUndefined();
    expect(ctx.events.find((e) => e.type === 'employeeFired')).toMatchObject({ uid: 'cfo', reason: 'milestone' });
    expect(ctx.state.supply.cfo).toBeGreaterThan(0);
  });
});

describe('salaryAfterFiring (Payday panel preview)', () => {
  const content = contentFor([]);
  it('applies First to Train: 4 salaried cards owe $5, firing one leaves $0 (not $15)', () => {
    const s = base()
      .card('p1', 'junior_vp', 'work', 'a')
      .card('p1', 'burger_cook', 'beach', 'b')
      .card('p1', 'pizza_cook', 'beach', 'c')
      .card('p1', 'coach', 'beach', 'd')
      .milestone('p1', 'first_train', 2)
      .build();
    expect(salaryBreakdown(s, content, 'p1').total).toBe(5);
    expect(salaryAfterFiring(s, content, 'p1', ['a']).total).toBe(0);
    expect(salaryAfterFiring(s, content, 'p1', []).total).toBe(5);
    // The state itself is untouched.
    expect(Object.keys(s.players.p1!.employees)).toContain('a');
  });

  it('applies the First Billboard waiver: firing the cook leaves $0', () => {
    const s = base()
      .card('p1', 'burger_cook', 'beach', 'cook')
      .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 2 })
      .milestone('p1', 'first_billboard', 2)
      .build();
    expect(salaryBreakdown(s, content, 'p1').total).toBe(5);
    expect(salaryAfterFiring(s, content, 'p1', ['cook']).total).toBe(0);
  });
});
