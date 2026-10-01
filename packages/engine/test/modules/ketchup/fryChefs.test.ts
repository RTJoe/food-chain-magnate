/**
 * Fry Chefs (ketchup.md §9; KX p13; DLX p21).
 */
import { describe, expect, it } from 'vitest';
import { contentFor } from '../../../src/modules/registry.js';
import { dine, kb } from './helpers.js';

const M = ['ketchup:fryChefs'] as const;

describe('Fry Chefs (ketchup.md §9)', () => {
  it('§9: trained from any cook; kitchen card with a salary', () => {
    const c = contentFor([...M]);
    expect(c.employees.burger_cook?.trainsInto).toContain('ketchup:fry_chef');
    expect(c.employees.pizza_cook?.trainsInto).toContain('ketchup:fry_chef');
    expect(c.employees['ketchup:fry_chef']).toMatchObject({ salary: true, colour: 'oliveGreen' });
    const withSushi = contentFor(['ketchup:fryChefs', 'ketchup:sushi', 'ketchup:noodles']);
    expect(withSushi.employees['ketchup:sushi_cook']?.trainsInto).toContain('ketchup:fry_chef');
    expect(withSushi.employees['ketchup:noodle_cook']?.trainsInto).toContain('ketchup:fry_chef');
  });

  it('§9 DLX example: 3 burgers at $20 with 2 fry chefs → $60 + $20 = $80', () => {
    // Placed house 1 (with garden, ×2) at (3,8): $10 burgers sell for $20 each.
    const ctx = dine(
      kb(2, [...M])
        .placedHouse(1, 3, 8, 'S')
        .restaurant('p1', 3, 3, 'NW')
        .card('p1', 'ketchup:fry_chef', 'work')
        .card('p1', 'ketchup:fry_chef', 'work')
        .inventory('p1', { burger: 3 })
        .demand(1, ['burger', 'burger', 'burger']),
    );
    const [sale] = ctx.of('sale');
    expect(sale).toMatchObject({ player: 'p1', total: 80 });
    expect(sale?.bonuses).toContainEqual({ source: 'ketchup:fry_chef', amount: 20 });
  });

  it('§9: the bonus is per house, not per item, and does not change who wins', () => {
    const ctx = dine(
      kb(2, [...M])
        .restaurant('p1', 3, 3, 'NW')
        .restaurant('p2', 5, 3, 'NW')
        .card('p2', 'ketchup:fry_chef', 'work')
        .inventory('p1', { burger: 1 })
        .inventory('p2', { burger: 1 })
        .demand(2, ['burger']),
    );
    // p1 is 0 borders away, p2 1 border: p1 wins although p2 would earn more.
    expect(ctx.of('sale')[0]).toMatchObject({ player: 'p1', total: 10 });
  });
});
