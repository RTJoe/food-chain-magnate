/**
 * K9 — Coffee (docs/tutorial-plan.md §3, ketchup.md §4). Baristas make coffee; training into a
 * Barista or Lead Barista places a coffee shop (road range 2, one per tile). A house that eats out
 * buys 1 coffee at every shop or restaurant of a chain with coffee next to its shortest route,
 * except at the restaurant it eats at.
 *
 * Scenario: round 3, Working, Ada's turn. Her Trainer and a Barista Trainee are at work, another
 * Barista Trainee waits on the beach. House 18 wants a burger only Bo has; its route to Bo runs
 * along the row-6 road of tile B2, where Ada opens her shop.
 */
import type { Action } from '@fcm/engine';
import { defineLesson } from '../../dsl.js';
import { BASE_COURSE, BO, continueAction, endTurn, eventOf, kTown, ME, only, usd } from './shared.js';

const SHOP = { x: 6, y: 6 } as const;

export const coffeeLesson = defineLesson({
  id: 'ketchup.coffee',
  course: 'ketchup',
  title: 'Coffee',
  minutes: 8,
  goal: 'Train a Barista, open a coffee shop and sell coffee to a house that eats at a rival.',
  concepts: ['module_coffee', 'barista', 'coffee_shop', 'coffee'],
  requires: BASE_COURSE,
  scenario: {
    build: () =>
      kTown(3, ['ketchup:coffee'])
        .cash('p1', 30)
        .card('p1', 'trainer', 'work', 'k9-tr')
        .card('p1', 'ketchup:barista_trainee', 'work', 'k9-bt1')
        .card('p1', 'ketchup:barista_trainee', 'beach', 'k9-bt2')
        .inventory('p2', { burger: 1 })
        .demand(18, ['burger'])
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .build(),
    learner: ME,
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'intro',
      say: 'Coffee is a new item. Baristas make it, and training one into a Barista opens a coffee shop on the board.',
      show: [{ card: { player: ME, uid: 'k9-bt1' } }],
      until: { next: true },
      checkpoint: true,
      glossary: 'module_coffee',
    },
    {
      id: 'train',
      say: 'Tap your Trainer and train the Barista Trainee on the beach into a Barista.',
      show: [{ card: { player: ME, uid: 'k9-tr' } }, { ui: 'train-ketchup:barista' }],
      allow: { actions: [only('work.train', (a) => a.targetUid === 'k9-bt2' && a.toEmployeeId === 'ketchup:barista')] },
      until: { event: 'choicePending', where: (e) => e.type === 'choicePending' && e.kind === 'coffeeShop' && e.player === ME },
      solution: [{ type: 'work.train', playerId: ME, trainerUid: 'k9-tr', targetUid: 'k9-bt2', toEmployeeId: 'ketchup:barista' }],
      hint: { say: 'Tap the Trainer card, then the Barista option.' },
      glossary: 'barista',
    },
    {
      id: 'shop',
      say: 'Now place the shop: within 2 borders of your restaurant, next to a road. Put it on tile B2, on the road house 18 takes to Bo.',
      show: [{ cell: [SHOP.x, SHOP.y] }, { house: 18 }, { restaurant: BO }],
      allow: { actions: [only('ketchup:coffee.placeShop', (a) => a.x === SHOP.x && a.y === SHOP.y)] },
      until: { event: 'entityPlaced', where: (e) => e.type === 'entityPlaced' && e.entity.kind === 'coffeeShop' },
      solution: (ctx): Action[] => {
        const head = ctx.view.pending[0];
        return head?.kind === 'coffeeShop' ? [{ type: 'ketchup:coffee.placeShop', playerId: ME, choiceId: head.id, x: SHOP.x, y: SHOP.y }] : [];
      },
      then: 'Open. One coffee shop per map tile, whoever owns it.',
      hint: { say: 'Press "Place a coffee shop", then pick the square just right of the road on tile B2, below the top road.', show: [{ cell: [SHOP.x, SHOP.y] }] },
      glossary: 'coffee_shop',
      checkpoint: true,
    },
    {
      id: 'produce',
      say: 'A shop sells only if you have coffee. Tap the Barista Trainee at work and make 1.',
      show: [{ card: { player: ME, uid: 'k9-bt1' } }],
      allow: { actions: [only('work.produce', (a) => a.cardUid === 'k9-bt1')] },
      until: { event: 'foodProduced', where: (e) => e.type === 'foodProduced' && e.player === ME },
      solution: [{ type: 'work.produce', playerId: ME, cardUid: 'k9-bt1', food: 'coffee' }],
    },
    {
      id: 'end-turn',
      say: 'End your turn; Bo ends his.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [only('work.endTurn')] },
      script: [{ player: BO, action: endTurn(BO) }],
      until: { paused: 'working' },
      solution: [endTurn()],
    },
    {
      id: 'route',
      say: 'House 18 eats at Bo: you have no burger. On its shortest way there it passes your shop and must buy a coffee.',
      show: [{ house: 18 }, { cell: [SHOP.x, SHOP.y] }, { restaurant: BO }],
      until: { next: true },
      checkpoint: true,
    },
    {
      id: 'dinner',
      say: 'Press Continue and watch the delivery route.',
      show: [{ ui: 'continue' }],
      allow: { actions: [only('tutorial.continue')] },
      until: { paused: 'dinnertime' },
      solution: continueAction,
      then: (ctx) => {
        const c = eventOf(ctx, 'coffeeSold', (e) => e.player === ME);
        return c ? `Your shop sold a coffee for ${usd(c.amount)} to a house that ate at Bo's.` : 'Dinner is over.';
      },
    },
    {
      id: 'rules',
      say: 'Coffee is not a drink: it cannot be marketed or frozen. The restaurant a house eats at never sells it coffee.',
      until: { next: true },
      glossary: 'coffee',
    },
    {
      id: 'combine',
      say: 'First Coffee Sold gives you a free shop at Cleanup, anywhere. Shops also count as starting points for every range.',
      until: { next: true },
      glossary: 'first_coffee_sold',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'Where does a house buy coffee?', options: ['At shops and restaurants with coffee next to its route, except where it eats', 'Only where it eats', 'At every shop on the map'], answer: 0, why: 'One coffee per passed location of a chain with coffee; never at the destination.' },
      { kind: 'choice', q: 'Can a campaign market coffee?', options: ['Yes', 'No'], answer: 1, why: 'Coffee cannot be marketed; houses buy it on the way.' },
      { kind: 'number', q: 'A route passes 2 shops of chains with coffee. How many coffees does the house buy?', answer: 2, why: 'One at each location next to the route.' },
    ],
  },
});
