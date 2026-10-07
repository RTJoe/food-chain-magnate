/** Payday / freezer figures, choice headings, reserve text and the career catalog (P4 client UI audit). */
import { describe, expect, it } from 'vitest';
import { contentFor, engine, type EmployeeId, type GameState, type MilestoneId, type ModuleId, type PlayerId } from '@fcm/engine';
import { stateBuilder } from '@fcm/engine/testing';
import { buildCatalog } from '../src/state/catalog.js';
import { freezerRows, mustFireIfShort, paydayFigures, paydayLabel, salaryGoods } from '../src/state/payday.js';
import { choiceReason, promptFor, reserveRule } from '../src/state/guidance.js';

const viewOf = (s: GameState, me: PlayerId = 'p1') => engine.redactFor(s, me);
const NM: ModuleId[] = ['ketchup:newMilestones' as ModuleId];
const PLANE = { kind: 'airplane', side: 'W', offset: 3, width: 1 } as const;

describe('Payday figures come from the engine', () => {
  it('First to Train: 3 salaried cards owe $0 (not $15); firing previews include the discount', () => {
    const s = stateBuilder({ players: 2 })
      .round(3)
      .card('p1', 'junior_vp', 'work', 'a')
      .card('p1', 'burger_cook', 'beach', 'b')
      .card('p1', 'pizza_cook', 'beach', 'c')
      .card('p1', 'coach', 'beach', 'd')
      .milestone('p1', 'first_train' as MilestoneId, 2)
      .build();
    const v = viewOf(s);
    expect(paydayFigures(v, 'p1').before).toBe(5);
    const f = paydayFigures(v, 'p1', ['a']);
    expect(f.after).toBe(0);
    expect(f.before - f.after).toBe(5); // never a negative "saves"
  });

  it('First Billboard: busy brand manager draws no salary and gets no badge', () => {
    const s = stateBuilder({ players: 2 })
      .round(3)
      .card('p1', 'burger_cook', 'beach', 'cook')
      .marketeerCampaign('brand_manager', 'bm', { owner: 'p1', kind: 'airplane', number: 4, goods: ['burger'], placement: PLANE, remaining: 2 })
      .milestone('p1', 'first_billboard' as MilestoneId, 2)
      .build();
    const f = paydayFigures(viewOf(s), 'p1', ['cook']);
    expect(f.before).toBe(5);
    expect(f.after).toBe(0);
    expect(f.salaried).toEqual(['cook']);
  });

  it('the button says what happens: pay, fire more next, or pay what you can (First trainer used)', () => {
    const base = { n: 0, canConfirm: true, after: 15, cash: 10, goodsUsed: 0 };
    expect(paydayLabel({ ...base, forcedFiring: true })).not.toMatch(/what I can/i);
    expect(paydayLabel({ ...base, forcedFiring: true })).toMatch(/fire/i);
    expect(paydayLabel({ ...base, n: 1, forcedFiring: true })).toBe('Fire 1, then more to cover $15');
    expect(paydayLabel({ ...base, forcedFiring: false })).toBe('Pay $10 of $15');
    expect(paydayLabel({ ...base, after: 5, forcedFiring: true })).toBe('Pay $5');
    expect(paydayLabel({ ...base, after: 0, goodsUsed: 2, forcedFiring: true })).toBe('Pay $0 + 2 goods');
    const s = stateBuilder({ players: 2 }).modules(NM).milestone('p1', 'ketchup:first_trainer_used' as MilestoneId, 1).build();
    expect(mustFireIfShort(viewOf(s), 'p1')).toBe(false);
    expect(mustFireIfShort(viewOf(s), 'p2')).toBe(true);
  });

  it('First beer sold: goods from inventory and freezer (no coffee) pay salaries, 1 per card', () => {
    const s = stateBuilder({ players: 2 })
      .modules(NM)
      .round(3)
      .card('p1', 'junior_vp', 'work', 'a')
      .card('p1', 'junior_vp', 'work', 'b')
      .cash('p1', 0)
      .inventory('p1', { beer: 1, coffee: 2 } as never)
      .freezer('p1', { burger: 2 })
      .milestone('p1', 'ketchup:first_beer_sold' as MilestoneId, 2)
      .build();
    const v = viewOf(s);
    expect(Object.fromEntries(salaryGoods(v, 'p1'))).toEqual({ beer: 1, burger: 2 });
    expect(salaryGoods(v, 'p2')).toEqual([]);
    const f = paydayFigures(v, 'p1', [], { beer: 1, burger: 2 });
    expect(f.before).toBe(10);
    expect(f.goodsUsed).toBe(2); // capped by the 2 salaried cards
    expect(f.after).toBe(0);
  });
});

describe('freezer choice', () => {
  const s = (inv: Record<string, number>, frz: Record<string, number>) =>
    stateBuilder({ players: 2 }).inventory('p1', inv as never).freezer('p1', frz as never).build();

  it('lists goods already in the freezer, so they can be kept again', () => {
    const rows = freezerRows(viewOf(s({ pizza: 8 }, { burger: 5 })), 'p1', {}, 10);
    expect(rows.map((r) => [r.food, r.n, r.frozen])).toEqual(expect.arrayContaining([['pizza', 8, 0], ['burger', 5, 5]]));
    expect(rows.find((r) => r.food === 'burger')?.max).toBe(5);
  });

  it('coffee cannot be frozen; kimchi is frozen alone', () => {
    const v = viewOf(s({ coffee: 2, kimchi: 2, pizza: 3 }, {}));
    expect(freezerRows(v, 'p1', {}, 10).find((r) => r.food === 'coffee')?.max).toBe(0);
    const withKimchi = freezerRows(v, 'p1', { kimchi: 1 }, 10);
    expect(withKimchi.find((r) => r.food === 'pizza')?.max).toBe(0);
    expect(withKimchi.find((r) => r.food === 'kimchi')?.max).toBe(2);
    expect(freezerRows(v, 'p1', { pizza: 1 }, 10).find((r) => r.food === 'kimchi')?.max).toBe(0);
  });
});

describe('pending choices and reserve cards', () => {
  it('a choice is headed by what it is, with the reason underneath', () => {
    const st = stateBuilder({ players: 2 }).modules(['ketchup:coffee' as ModuleId]).pending({ id: 'ch1', kind: 'coffeeShop', player: 'p1', source: 'milestone', optional: false }).build();
    const pr = promptFor(viewOf(st), 'p1', engine.listModules());
    expect(pr.kind).toBe('choice');
    expect(pr.title).toBe('Place a coffee shop');
    expect(choiceReason({ id: 'ch1', kind: 'coffeeShop', player: 'p1', source: 'milestone', optional: false })).toMatch(/First coffee sold/);
    expect(choiceReason({ id: 'ch2', kind: 'freeway', player: 'p1', optional: true })).toMatch(/First rural marketeer/);
  });

  it('Reserve Prices cards set the base price, not CEO slots', () => {
    const text = reserveRule([{ kind: 'price', amount: 200, basePrice: 5 } as never]);
    expect(text).toMatch(/base unit price/);
    expect(text).toMatch(/CEO slots do not change/);
    expect(reserveRule([{ kind: 'standard', amount: 100, ceoSlots: 2 }])).toMatch(/CEO slots/);
  });
});

describe('client catalog careers', () => {
  it('equals the engine content with every module on (careerAdditions merged)', () => {
    const manifest = engine.listModules();
    const ids = manifest.map((m) => m.id);
    const c = buildCatalog(manifest, ids);
    const eng = contentFor(ids).employees;
    for (const [id, def] of Object.entries(eng)) {
      if (!def) continue;
      expect([...(c.employees[id as EmployeeId]?.trainsInto ?? [])].sort(), id).toEqual([...def.trainsInto].sort());
    }
  });
});
