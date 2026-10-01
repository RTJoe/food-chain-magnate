/**
 * Unit price and shared helpers (base.md §7 step 5, §4; DLX p27; milestones.md first_lower_prices).
 */
import { describe, expect, it } from 'vitest';
import { stateBuilder, type StateBuilder } from '../../src/testing/index.js';
import { cardsAtWork, countAbilityAtWork, hasMilestone, hasMilestoneBefore, unitPrice } from '../../src/rules/pricing.js';
import { MAP, makeCtx, type Pipe } from './c2ctx.js';

function base(): StateBuilder {
  return stateBuilder({ players: 2 }).tiles(MAP).round(3);
}

const price = (b: StateBuilder, pipe?: Pipe, player = 'p1') => unitPrice(makeCtx(b.build(), pipe), player);

describe('unit price (base.md §7.5)', () => {
  it('$10 base', () => {
    expect(price(base())).toBe(10);
  });

  it('−$1 per pricing manager, −$3 per discount manager at work: 2 pricing + 1 discount = $5', () => {
    expect(price(base().card('p1', 'pricing_manager', 'work').card('p1', 'pricing_manager', 'work').card('p1', 'discount_manager', 'work'))).toBe(5);
  });

  it('+$10 with the luxuries manager', () => {
    expect(price(base().card('p1', 'luxuries_manager', 'work'))).toBe(20);
    expect(price(base().card('p1', 'luxuries_manager', 'work').card('p1', 'discount_manager', 'work'))).toBe(17);
  });

  it('cards on the beach or in a manager slot: only at-work cards count, wherever they sit in the structure', () => {
    const b = base()
      .card('p1', 'pricing_manager', 'beach')
      .card('p1', 'management_trainee', 'work', 'mt')
      .card('p1', 'discount_manager', { under: 'mt' });
    expect(price(b)).toBe(7);
  });

  it('"First to Lower Prices" is a permanent −$1', () => {
    expect(price(base().milestone('p1', 'first_lower_prices', 1))).toBe(9);
    expect(price(base().milestone('p1', 'first_lower_prices', 1).card('p1', 'luxuries_manager', 'work'))).toBe(19);
  });

  it('no minimum: the price can be $0 or negative', () => {
    let b = base().milestone('p1', 'first_lower_prices', 1);
    for (let i = 0; i < 3; i++) b = b.card('p1', 'discount_manager', 'work');
    expect(price(b)).toBe(0);
    expect(price(b.card('p1', 'pricing_manager', 'work').card('p1', 'pricing_manager', 'work'))).toBe(-2);
  });

  it('bonuses (CFO, waitresses, marketed milestones) never change the unit price', () => {
    const b = base().card('p1', 'cfo', 'work').card('p1', 'waitress', 'work').milestone('p1', 'first_burger_marketed', 1);
    expect(price(b)).toBe(10);
  });

  it('the base price comes from state (Ketchup Reserve Prices) and modules adjust via the unitPrice pipeline', () => {
    expect(price(base().mutate((s) => (s.basePrice = 20)).card('p1', 'pricing_manager', 'work'))).toBe(19);
    const seen: unknown[] = [];
    const pipe: Pipe = (name, value, args) => {
      if (name === 'unitPrice') {
        seen.push(args);
        return (value as number) - 4;
      }
      return value;
    };
    expect(price(base(), pipe, 'p2')).toBe(6);
    expect(seen).toEqual([{ player: 'p2' }]);
  });
});

describe('helpers', () => {
  it('cardsAtWork: CEO, CEO slots and manager slots; not the beach, hand or busy marketeers', () => {
    const b = base()
      .card('p1', 'management_trainee', 'work', 'mt')
      .card('p1', 'waitress', { under: 'mt' }, 'w')
      .card('p1', 'trainer', 'beach', 'beach')
      .card('p1', 'errand_boy', 'hand', 'hand')
      .marketeerCampaign('marketing_trainee', 'mkt', {
        owner: 'p1',
        kind: 'airplane',
        number: 4,
        goods: ['burger'],
        placement: { kind: 'airplane', side: 'W', offset: 3, width: 1 },
        remaining: 2,
      });
    const s = b.build();
    const p1 = s.players.p1!;
    expect(cardsAtWork(p1).sort()).toEqual([b.ceoUid('p1'), 'mt', 'w'].sort());
    expect(countAbilityAtWork(makeCtx(s).content, p1, 'waitress')).toBe(1);
  });

  it('hasMilestoneBefore: only milestones earned in an earlier round', () => {
    const s = base().milestone('p1', 'first_100', 3).milestone('p2', 'first_100', 2).build();
    expect(hasMilestone(s, 'p1', 'first_100')).toBe(true);
    expect(hasMilestoneBefore(s, 'p1', 'first_100')).toBe(false);
    expect(hasMilestoneBefore(s, 'p2', 'first_100')).toBe(true);
  });
});
