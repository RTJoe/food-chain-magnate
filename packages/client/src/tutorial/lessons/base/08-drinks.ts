/**
 * L8 — Drinks and buyer routes (docs/tutorial-plan.md §2, L8). The Errand Boy fetches 1 drink of
 * any kind; the Cart Operator drives a road route of range 2 and takes 2 drinks from every source
 * his road touches, whether you want them or not.
 *
 * Scenario: round 4, Working, Ada's turn at the food & drinks sub-step with an Errand Boy and a Cart
 * Operator at work and 1 burger in stock. House 2 (on Ada's tile) wants 2 beers and a burger. Bo
 * (scripted) has only his CEO and ends his turn. Note: on the tutorial town no single cart route
 * passes both the B1 beer and the C1 beer (the B1 beer sits at a dead end), so the lesson uses the
 * C1 haul: 2 beers and 2 sodas, which also shows that every source passed is collected.
 */
import type { Action, GameEvent } from '@fcm/engine';
import { town, TOWN_SOURCES } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { cashOf, continueAction, demandWords, houseId, pathTouches, placementsFor, salesIn, sourceAt } from './late.js';

const EB = 'p1-eb';
const CO = 'p1-co';
const BEER_C1 = TOWN_SOURCES.beerC1;
const SODA_C1 = TOWN_SOURCES.sodaC1;
const BEER_B1 = TOWN_SOURCES.beerB1;

/** The cart route through tile C1: passes the beer and the soda there. */
const isC1Haul = (a: Action) => a.type === 'work.buyDrinks' && a.cardUid === CO && a.route.mode === 'road' && pathTouches(a.route.path, BEER_C1) && pathTouches(a.route.path, SODA_C1);

const bought = (e: GameEvent, uid: string) => e.type === 'drinksBought' && e.player === 'p1' && e.uid === uid;

function cartSolution(ctx: StepCtx): Action[] {
  const beer = sourceAt(ctx.view, BEER_C1);
  const soda = sourceAt(ctx.view, SODA_C1);
  for (const p of placementsFor(ctx, { kind: 'buyerRoute', cardUid: CO })) {
    if (p.kind !== 'buyerRoute') continue;
    const ids = p.collects.map((c) => c.sourceId);
    if (beer && soda && ids.includes(beer) && ids.includes(soda)) return [{ type: 'work.buyDrinks', playerId: ctx.me, cardUid: CO, route: p.route }];
  }
  return [];
}

export const lesson08 = defineLesson({
  id: 'base.8',
  course: 'base',
  title: 'Drinks and buyer routes',
  minutes: 8,
  goal: 'Fetch drinks: the Errand Boy gets one of any kind; the Cart Operator collects along a road route.',
  concepts: ['errand_boy', 'cart_operator', 'route', 'route_range', 'collect'],
  scenario: {
    build: () => {
      const b = town({ round: 4 })
        .card('p1', 'errand_boy', 'work', EB)
        .card('p1', 'cart_operator', 'work', CO)
        .inventory('p1', { burger: 1 })
        .demand(2, ['beer', 'beer', 'burger'])
        .cash('p1', 20)
        .cash('p2', 20)
        .phase({ kind: 'working', player: 'p1', idx: 0 });
      return b.turn({ player: 'p1', stage: 'food', uses: { [b.ceoUid('p1')]: 0, [EB]: 1, [CO]: 1 } }).build();
    },
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'want-beer',
      say: (ctx) => `House 2 wants ${demandWords(ctx.view, 2)}. You have the burger; two of your cards fetch drinks.`,
      show: [{ house: 2 }, { card: { player: 'p1', uid: EB } }, { card: { player: 'p1', uid: CO } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'drink_source',
    },
    {
      id: 'errand-beer',
      say: 'The Errand Boy fetches 1 drink of any kind, no travel needed. Tap him and get a beer.',
      show: [{ ui: `work-card-${EB}` }],
      allow: { actions: [{ type: 'work.buyDrinks', where: (a) => a.type === 'work.buyDrinks' && a.cardUid === EB && a.route.mode === 'errand' && a.route.drink === 'beer' }] },
      until: { event: 'drinksBought', where: (e) => bought(e, EB) },
      solution: [{ type: 'work.buyDrinks', playerId: 'p1', cardUid: EB, route: { mode: 'errand', drink: 'beer' } }],
      then: (ctx) => `+1 beer. Your stock: ${ctx.view.players.p1?.inventory.beer ?? 0} beer, ${ctx.view.players.p1?.inventory.burger ?? 0} burger.`,
      hint: { say: 'Tap the Errand Boy card in the Turn panel, then "Get beer".', show: [{ ui: `work-card-${EB}` }] },
      glossary: 'errand_boy',
    },
    {
      id: 'cart-range',
      say: 'The Cart Operator drives up to 2 tile borders along the road from your door. He takes 2 drinks from every source his road touches.',
      show: [{ card: { player: 'p1', uid: CO } }, { overlay: 'range', spec: { kind: 'buyerRoute', cardUid: CO } }],
      until: { next: true },
      glossary: 'cart_operator',
    },
    {
      id: 'cart-route',
      say: 'Tap him: every haul is a ribbon on the board. Pick the one into tile C1, past the beer and the soda there.',
      show: [{ ui: `work-card-${CO}` }, { source: BEER_C1 }, { source: SODA_C1 }],
      allow: { actions: [{ type: 'work.buyDrinks', where: (a) => isC1Haul(a) }] },
      until: { event: 'drinksBought', where: (e) => bought(e, CO) },
      solution: cartSolution,
      then: (ctx) => {
        const e = ctx.events.find((x) => bought(x, CO));
        const n = e && e.type === 'drinksBought' ? e.collected.reduce((s, c) => s + c.count, 0) : 0;
        return `${n} drinks: 2 from each source. Tile borders crossed: 2 of 2.`;
      },
      hint: { say: 'The longest ribbon heads right along the top road into tile C1: "2× beer, 2× soft drink".', show: [{ source: BEER_C1 }, { source: SODA_C1 }] },
      checkpoint: true,
      glossary: 'route',
    },
    {
      id: 'must-collect',
      say: "You can't skip a source your road touches: the soda came along too. The beer on B1 sits on another road, so this haul missed it.",
      show: [{ source: SODA_C1 }, { source: BEER_B1 }],
      until: { next: true },
      glossary: 'collect',
    },
    {
      id: 'end-turn',
      say: 'House 2 wants 2 beers and a burger, and you have them. End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [{ player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } }],
      until: { paused: 'working' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
    },
    {
      id: 'dinner',
      say: 'Press Continue and watch house 2 buy from you.',
      show: [{ ui: 'continue' }, { house: 2 }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      onEnter: [{ follow: true }],
      then: (ctx) => {
        const sale = salesIn(ctx.events).find((e) => e.player === 'p1' && e.houseId === houseId(ctx.view, 2));
        const items = sale ? sale.lines.reduce((n, l) => n + l.count, 0) : 0;
        return sale ? `House 2 paid you $${sale.total}: ${items} items × $${sale.unitPrice}.` : 'Dinner is over.';
      },
      checkpoint: true,
    },
    {
      id: 'paid',
      say: (ctx) => `Each item sells for your $10 price, and house 2 is 0 borders away. You have $${cashOf(ctx.view, 'p1')} now.`,
      show: [{ house: 2 }, { ui: 'cash-p1' }],
      replay: { phase: 'dinnertime' },
      until: { next: true },
      then: 'Leftover drinks are thrown away at Clean up, like food.',
      // The check taps the board: stop following the replay and show the whole town.
      onExit: [{ follow: false }, { camera: { kind: 'board' } }],
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'number', q: 'How many tile borders can a Cart Operator drive?', answer: 2, why: 'Cart Operator: road range 2. A Truck Driver reaches 3.' },
      { kind: 'tap', q: 'Tap the house that bought your beers.', target: { house: 2 }, why: 'House 2, on your own tile: 2 beers and a burger, $30.' },
      { kind: 'choice', q: 'Can a cart skip a source it drives past?', options: ['Yes, if you want', 'No, it collects every source it passes', 'Only soda'], answer: 1, why: 'Every source next to the road you drive is collected, 2 drinks each.' },
    ],
  },
});
