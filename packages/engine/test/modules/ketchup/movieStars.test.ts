/**
 * Movie Stars (ketchup.md §15; KX p16; DLX p27).
 */
import { describe, expect, it } from 'vitest';
import type { EmployeeId, PlayerId, Uid } from '../../../src/index.js';
import { contentFor } from '../../../src/modules/registry.js';
import { choosingQueue } from '../../../src/rules/orderOfBusiness.js';
import { act, newGame, rejected, workingTurn, MAP3 } from '../../helpers/game.js';
import { dine, kb, kctx, kgame } from './helpers.js';

const M = ['ketchup:movieStars'] as const;
const B = 'ketchup:b_movie_star';
const C = 'ketchup:c_movie_star';
const D = 'ketchup:d_movie_star';
const STARS = [B, C, D];

const supplyOf = (n: number, modules: string[] = [...M]) => {
  const s = newGame(n, 1, MAP3, { modules: modules as never });
  return STARS.map((id) => s.supply[id as EmployeeId]);
};

describe('Movie Stars - cards and supply (ketchup.md §15)', () => {
  it('§15 setup: 2-3 players use B only', () => {
    expect(supplyOf(2)).toEqual([1, undefined, undefined]);
    expect(supplyOf(3)).toEqual([1, undefined, undefined]);
  });

  it('§15 setup: 4 players use B and C', () => {
    expect(supplyOf(4)).toEqual([1, 1, undefined]);
  });

  it('§15 setup: 5 players use B, C and D', () => {
    expect(supplyOf(5)).toEqual([1, 1, 1]);
  });

  it('§15 setup: 6 players use B, C and D', () => {
    expect(supplyOf(6, [...M, 'ketchup:sixPlayers', 'ketchup:newDistricts'])).toEqual([1, 1, 1]);
  });

  it('§15: salaried purple 1x cards forming one 1x type (uniqueGroup); not waitresses', () => {
    const c = contentFor([...M]);
    for (const id of STARS) {
      expect(c.employees[id as EmployeeId]).toMatchObject({ salary: true, unique: true, uniqueGroup: 'movieStar', colour: 'purple', count: 1 });
      expect(c.employees[id as EmployeeId]?.ability.kind).toBe('movieStar');
    }
    expect(c.employees.waitress?.salary).toBe(false);
  });

  it('§15: trained from a waitress', () => {
    const c = contentFor([...M]);
    expect(c.employees.waitress?.trainsInto).toEqual(expect.arrayContaining(STARS));
  });
});

describe('Movie Stars - training (ketchup.md §15)', () => {
  const setup = () => workingTurn(kgame(4, [...M]), 'p1', { work: ['trainer', 'trainer'], beach: ['waitress', 'waitress'] });
  const train = (s: ReturnType<typeof setup>, trainer: number, target: number, to: EmployeeId) =>
    ({ type: 'work.train', playerId: 'p1', trainerUid: s.work[trainer] as Uid, targetUid: s.beach[target] as Uid, toEmployeeId: to }) as const;

  it('§15: a waitress is trained into any available movie star; its supply pile empties', () => {
    const w = setup();
    const t = act(w.s, train(w, 0, 0, B as EmployeeId));
    expect(t.players.p1?.employees[w.beach[0] as Uid]?.employeeId).toBe(B);
    expect(t.supply[B as EmployeeId]).toBe(0);
    const u = act(w.s, train(w, 0, 0, C as EmployeeId));
    expect(u.players.p1?.employees[w.beach[0] as Uid]?.employeeId).toBe(C);
  });

  it('§15: D is not available with 4 players (not in the supply)', () => {
    const w = setup();
    expect(rejected(w.s, train(w, 0, 0, D as EmployeeId)).code).toBe('SUPPLY_EMPTY');
  });

  it('§15: all movie stars are one 1x type: a player may have only one', () => {
    const w = setup();
    const t = act(w.s, train(w, 0, 0, B as EmployeeId));
    const r = rejected(t, train(w, 1, 1, C as EmployeeId));
    expect(r.code).toBe('UNIQUE_LIMIT');
  });

  it('§15: another player cannot take a star that is already taken', () => {
    const w = setup();
    const t = act(w.s, train(w, 0, 0, B as EmployeeId));
    const w2 = workingTurn(t, 'p2', { work: ['trainer'], beach: ['waitress'] });
    const r = rejected(w2.s, { type: 'work.train', playerId: 'p2', trainerUid: w2.work[0] as Uid, targetUid: w2.beach[0] as Uid, toEmployeeId: B as EmployeeId });
    expect(r.code).toBe('SUPPLY_EMPTY');
    act(w2.s, { type: 'work.train', playerId: 'p2', trainerUid: w2.work[0] as Uid, targetUid: w2.beach[0] as Uid, toEmployeeId: C as EmployeeId });
  });

  it('§15: only a waitress becomes a movie star (a management trainee cannot)', () => {
    const w = workingTurn(kgame(4, [...M]), 'p1', { work: ['trainer'], beach: ['management_trainee'] });
    expect(rejected(w.s, { type: 'work.train', playerId: 'p1', trainerUid: w.work[0] as Uid, targetUid: w.beach[0] as Uid, toEmployeeId: B as EmployeeId }).message).toMatch(/cannot be trained/);
  });
});

describe('Movie Stars - Order of Business (ketchup.md §15)', () => {
  const order = (cards: Partial<Record<PlayerId, { id: string; where?: 'work' | 'beach'; filler?: number }[]>>, n = 5) => {
    let b = kb(n, [...M]);
    for (const [p, list] of Object.entries(cards)) {
      for (const c of list ?? []) {
        b = b.card(p, c.id as EmployeeId, c.where ?? 'work');
        for (let i = 0; i < (c.filler ?? 0); i++) b = b.card(p, 'waitress', 'work');
      }
    }
    return choosingQueue(kctx(b.phase({ kind: 'restructuring' }).build()));
  };

  it('§15: without movie stars the most open slots choose first (base order)', () => {
    expect(order({ p1: [{ id: 'waitress' }, { id: 'waitress' }], p2: [{ id: 'waitress' }] })).toEqual(['p3', 'p4', 'p5', 'p2', 'p1']);
  });

  it('§15: players with a movie star at work choose first: B, then C, then D, then the rest by open slots', () => {
    const q = order({
      p1: [{ id: 'waitress' }],
      p2: [{ id: D }],
      p3: [{ id: B, filler: 2 }],
      p4: [{ id: C }],
    });
    // p3 has no open slot (CEO slots 3) yet is first; p5 (3 open) and p1 (2 open) follow the stars.
    expect(q).toEqual(['p3', 'p4', 'p2', 'p5', 'p1']);
  });

  it('§15: a movie star on the beach does not count', () => {
    const q = order({ p2: [{ id: B, where: 'beach' }], p4: [{ id: D }] });
    expect(q[0]).toBe('p4');
    expect(q.indexOf('p2')).toBeGreaterThan(0);
    expect(q).toEqual(['p4', 'p1', 'p2', 'p3', 'p5']);
  });
});

describe('Movie Stars - Dinnertime ties (ketchup.md §15)', () => {
  /**
   * Three restaurants on tile (0,0), all 0 borders from house 2: equal prices and distance, so only
   * the tie-breaks decide.
   */
  const winner = (kit: Partial<Record<PlayerId, { star?: string; waitresses?: number; pricing?: boolean }>>) => {
    let b = kb(3, [...M])
      .restaurant('p1', 3, 3, 'NW')
      .restaurant('p2', 3, 0, 'SW')
      .restaurant('p3', 0, 0, 'SE')
      .demand(2, ['burger']);
    for (const p of ['p1', 'p2', 'p3']) {
      b = b.inventory(p, { burger: 1 });
      const k = kit[p] ?? {};
      if (k.star) b = b.card(p, k.star as EmployeeId, 'work');
      for (let i = 0; i < (k.waitresses ?? 0); i++) b = b.card(p, 'waitress', 'work');
      if (k.pricing) b = b.card(p, 'pricing_manager', 'work');
    }
    const ctx = dine(b);
    return ctx.of('sale')[0]?.player;
  };

  it('§15: B beats C beats D beats players without a star', () => {
    expect(winner({ p1: { star: D }, p2: { star: B }, p3: { star: C } })).toBe('p2');
    expect(winner({ p1: { star: D }, p3: { star: C } })).toBe('p3');
    expect(winner({ p1: {}, p2: { star: D } })).toBe('p2');
    expect(winner({ p1: { star: D }, p2: { star: C }, p3: { star: B } })).toBe('p3');
  });

  it('§15: a movie star wins the tie even against more waitresses', () => {
    expect(winner({ p1: { waitresses: 3 }, p2: { star: D, waitresses: 0 } })).toBe('p2');
    // A star's own waitresses do not matter against a higher star either.
    expect(winner({ p1: { star: C, waitresses: 3 }, p2: { star: B } })).toBe('p2');
  });

  it('§15: without any star, waitresses and then turn order decide as in the base game', () => {
    expect(winner({ p2: { waitresses: 2 }, p3: { waitresses: 1 } })).toBe('p2');
    expect(winner({})).toBe('p1');
  });

  it('§15: a movie star only breaks ties; a lower price still wins', () => {
    expect(winner({ p1: { pricing: true }, p2: { star: B } })).toBe('p1');
  });

  it('§15: a movie star on the beach does not win ties', () => {
    const b = kb(2, [...M]).restaurant('p1', 3, 3, 'NW').restaurant('p2', 3, 0, 'SW').demand(2, ['burger']).inventory('p1', { burger: 1 }).inventory('p2', { burger: 1 })
      .card('p2', B as EmployeeId, 'beach').card('p1', 'waitress', 'work');
    expect(dine(b).of('sale')[0]?.player).toBe('p1');
  });

  it('§15: no income - a movie star earns no waitress tips', () => {
    const ctx = dine(kb(2, [...M]).restaurant('p1', 3, 3, 'NW').card('p1', B as EmployeeId, 'work').card('p2', 'waitress', 'work'));
    expect(ctx.of('tipsPaid').map((e) => e.player)).toEqual(['p2']);
  });
});
