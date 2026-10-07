/**
 * Dinnertime offers with Kimchi / Sushi / Noodles variants (one entry per chain) and Ketchup /
 * First marketeer score modifiers ("$10 + 0 − 2 = $8") across the client's offer displays.
 */
import { describe, expect, it } from 'vitest';
import { engine, type GameEvent, type GameState, type HouseOutlook, type SaleCandidate } from '@fcm/engine';
import { FIXTURES } from '@fcm/engine/testing';
import { dine, kb } from '../../engine/test/modules/ketchup/helpers.js';
import { buildCatalog } from '../src/state/catalog.js';
import { dinnerSteps } from '../src/state/feedback.js';
import { describeEvent } from '../src/state/log.js';
import { collapseOffers, saleCaptionText, scoreMath } from '../src/state/offers.js';
import { saleCaption } from '../src/three/anim/choreos/dinner.js';
import type { Beat } from '../src/three/anim/compile.js';
import { offerText } from '../src/three/overlays/feedback.js';
import { coachHints, type HintInput } from '../src/ui/hints/rules.js';

const M = ['ketchup:kimchi', 'ketchup:noodles'] as const;

/** p1 (Ada) has the burger but no kimchi; p2 (Bo) has burger + kimchi: Bo's kimchi variant wins. */
function kimchiDinner() {
  return dine(
    kb(2, [...M])
      .restaurant('p1', 3, 3, 'NW')
      .restaurant('p2', 8, 8, 'NW')
      .inventory('p1', { burger: 1 })
      .inventory('p2', { burger: 1, kimchi: 3 })
      .demand(2, ['burger']),
  );
}

const beatOf = (events: GameEvent[]): Beat => ({ kind: 'sale', id: 'h', focal: [], keys: [], events, nominal: 1, at: 0, dur: 1 }) as unknown as Beat;

describe('variants collapse to one offer per chain', () => {
  const ctx = kimchiDinner();
  const considered = ctx.of('houseConsidered')[0]!;
  const sale = ctx.of('sale')[0]!;

  it('the engine reports several variants per chain (precondition)', () => {
    expect(considered.offers!.length).toBeGreaterThan(2);
    expect(sale.player).toBe('p2');
  });

  it('collapseOffers keeps each chain once, preferring a variant that can supply', () => {
    const got = collapseOffers(considered.offers!);
    expect(got.map((o) => o.player).sort()).toEqual(['p1', 'p2']);
    expect(got.find((o) => o.player === 'p1')?.canSupply).toBe(true);
    expect(got.find((o) => o.player === 'p2')).toMatchObject({ canSupply: true, tier: -10 });
  });

  it('dinnerSteps: one offer per chain, the loser can supply, one winner', () => {
    const step = dinnerSteps(ctx.events).find((s) => s.sale)!;
    expect(step.offers.map((o) => o.player).sort()).toEqual(['p1', 'p2']);
    expect(step.offers.find((o) => o.player === 'p1')).toMatchObject({ canSupply: true, won: false });
    expect(step.offers.filter((o) => o.won).map((o) => o.player)).toEqual(['p2']);
  });

  it('live caption lists each rival once', () => {
    const c = saleCaption(beatOf([considered, sale]), sale);
    expect(c.others).toEqual([expect.objectContaining({ player: 'p1', canSupply: true })]);
  });

  it('log line names the rival once with a supplying offer', () => {
    const s = FIXTURES.dinnertime();
    const view = engine.redactFor(s, 'p1');
    const text = describeEvent(sale, view, buildCatalog(engine.listModules(), s.config.modules))?.text ?? '';
    expect(text).toMatch(/beating .* at \$/);
  });
});

// --- Modifiers ---------------------------------------------------------------

const cand = (o: Partial<SaleCandidate> & Pick<SaleCandidate, 'player'>): SaleCandidate => ({ restaurantId: `r-${o.player}`, unitPrice: 10, distance: 0, score: 10, tier: 0, canSupply: true, ...o });

describe('score modifiers are shown', () => {
  const winner = cand({ player: 'p1', unitPrice: 10, distance: 0, score: 8 });
  const rival = cand({ player: 'p2', unitPrice: 9, distance: 0, score: 9 });
  const considered = { type: 'houseConsidered', houseId: 'h1', candidates: ['p1', 'p2'], offers: [winner, rival] } as unknown as Extract<GameEvent, { type: 'houseConsidered' }>;
  const sale = {
    type: 'sale',
    houseId: 'h1',
    player: 'p1',
    restaurantId: 'r-p1',
    distance: 0,
    unitPrice: 10,
    lines: [{ good: 'burger', count: 1, each: 10 }],
    bonuses: [],
    total: 10,
    candidates: [winner, rival],
  } as unknown as Extract<GameEvent, { type: 'sale' }>;

  it('scoreMath: modifier only when non-zero', () => {
    expect(scoreMath(winner)).toBe('$10 + 0 − 2 = $8');
    expect(scoreMath(rival)).toBe('$9 + 0 = $9');
    expect(scoreMath({ unitPrice: 9, distance: 1, score: 11 })).toBe('$9 + 1 + 1 = $11');
    expect(scoreMath(winner, { compact: true })).toBe('$10+0−2=$8');
  });

  it('3D offer chip shows the modifier', () => {
    expect(offerText({ ...winner, won: true })).toBe('✓ $10+0−2=$8');
  });

  it('dinnerSteps keeps the engine score', () => {
    const step = dinnerSteps([considered, sale])[0]!;
    expect(step.offers.find((o) => o.won)?.score).toBe(8);
  });

  it('caption total is the score, with the modifier visible', () => {
    const c = saleCaption(beatOf([considered, sale]), sale);
    expect(c.score).toBe(8);
    const text = saleCaptionText({ ...c, key: 1 }, (p) => (p === 'p1' ? 'Ada' : 'Bo'), '1');
    expect(text).toContain('$10 + 0 − 2 = $8');
    expect(text).toContain('Bo $9');
  });

  it('log line shows the modifier and the score', () => {
    const s = FIXTURES.dinnertime();
    const view = engine.redactFor(s, 'p1');
    const text = describeEvent(sale, view, buildCatalog(engine.listModules(), s.config.modules))?.text ?? '';
    expect(text).toContain('$10 + 0 − 2 = $8');
  });
});

// --- lose_by_one ---------------------------------------------------------------

describe('lose_by_one with variants and modifiers', () => {
  const manifest = engine.listModules();
  const input = (s: GameState, sellers: HouseOutlook['sellers']): HintInput => {
    const [hid, house] = Object.entries(s.board.houses)[0]!;
    house.demand = [{ good: 'beer' } as never];
    const outlook = (h: string): HouseOutlook | null => (h === hid ? { houseId: hid, capacity: 3, demand: 1, winner: 'p1', campaigns: [], sellers } : null);
    return { view: engine.redactFor(s, 'p2'), me: 'p2', catalog: buildCatalog(manifest, s.config.modules), draft: null, outlook, ghostReach: 0 };
  };
  const working = () => {
    const s = FIXTURES.working();
    s.turn!.stage = 'food';
    return s;
  };
  const seller = (o: Partial<HouseOutlook['sellers'][number]> & { player: string }) => ({ restaurantId: `r-${o.player}`, unitPrice: 10, distance: 1, score: 11, tier: 0, waitresses: 0, canSupply: true, ...o });

  it("uses the winner's supplying variant, not its first one", () => {
    const sellers = [
      seller({ player: 'p1', unitPrice: 9, score: 10, tier: -10, canSupply: false }),
      seller({ player: 'p1', unitPrice: 9, score: 10 }),
      seller({ player: 'p2' }),
    ];
    const got = coachHints(input(working(), sellers), 'full').find((h) => h.id === 'lose_by_one');
    expect(got?.text).toMatch(/\$9 \+ 1 = 10 against your \$10 \+ 1 = 11/);
  });

  it('shows modifiers in the math', () => {
    const sellers = [seller({ player: 'p1', unitPrice: 10, distance: 0, score: 8 }), seller({ player: 'p2', unitPrice: 9, distance: 0, score: 9 })];
    const got = coachHints(input(working(), sellers), 'full').find((h) => h.id === 'lose_by_one');
    expect(got?.text).toContain('$10 + 0 − 2 = 8');
  });
});

describe('collapseOffers keeps ranked order and base offers untouched', () => {
  it('base game: no change', () => {
    const offers = [cand({ player: 'p1', score: 9 }), cand({ player: 'p2', score: 10, canSupply: false }), cand({ player: 'p3', score: 11 })];
    expect(collapseOffers(offers)).toEqual(offers);
  });
});
