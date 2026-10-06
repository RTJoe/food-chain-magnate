/**
 * L13 — Houses, gardens and new restaurants (docs/tutorial-plan.md §2, L13). New Business
 * Developers add gardens (×2 price, cap 5) and build numbered houses; a Local Manager opens a
 * COMING SOON restaurant within 3 borders and gives your restaurants drive-ins while at work.
 *
 * Scenario: round 6 Working, Ada at the houses sub-step with two New Business Developers and a Local
 * Manager at work; her restaurant already has its drive-in sign (Working step 3c). House 2 has no
 * room for a garden on the tutorial town, so the garden goes on house 18, the house Ada and Bo
 * compete for. Bo (scripted) ends his turn and pays at Payday.
 */
import type { Action } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { cashOf, houseId, placementsFor } from './late.js';

const NB1 = 'p1-nb1';
const NB2 = 'p1-nb2';
const LM = 'p1-lm';

/** Tiles A1 and A2: squares x 0–4, y 0–9. */
const onLeft = (x: number, y: number) => x <= 4 && y <= 9;

function houseSolution(ctx: StepCtx): Action[] {
  const all = placementsFor(ctx, { kind: 'house', cardUid: NB2, houseOrder: 1 });
  const pick = all.find((p) => p.kind === 'house' && p.x === 3 && p.y === 0 && p.gardenSide === 'E') ?? all.find((p) => p.kind === 'house' && onLeft(p.x, p.y));
  return pick && pick.kind === 'house' ? [{ type: 'work.placeHouse', playerId: ctx.me, cardUid: NB2, houseOrder: 1, x: pick.x, y: pick.y, gardenSide: pick.gardenSide }] : [];
}

function restaurantSolution(ctx: StepCtx): Action[] {
  const all = placementsFor(ctx, { kind: 'restaurant', cardUid: LM });
  const pick = all.find((p) => p.kind === 'restaurant' && p.x === 0 && p.y === 8) ?? all[0];
  return pick && pick.kind === 'restaurant' ? [{ type: 'work.placeRestaurant', playerId: ctx.me, cardUid: LM, x: pick.x, y: pick.y, entrance: pick.entrance, ...(pick.from ? { from: pick.from } : {}) }] : [];
}

export const lesson13 = defineLesson({
  id: 'base.13',
  course: 'base',
  title: 'Houses, gardens and new restaurants',
  minutes: 8,
  goal: 'Gardens double a house’s price, new houses get a number, Local Managers open COMING SOON restaurants.',
  concepts: ['nbd', 'garden', 'local_manager', 'coming_soon', 'regional_manager', 'drive_in'],
  scenario: {
    build: () => {
      const b = town({ round: 6 })
        .card('p1', 'new_business_developer', 'work', NB1)
        .card('p1', 'new_business_developer', 'work', NB2)
        .card('p1', 'local_manager', 'work', LM)
        .cash('p1', 40)
        .cash('p2', 30)
        .phase({ kind: 'working', player: 'p1', idx: 0 })
        .mutate((s) => {
          for (const r of Object.values(s.board.restaurants)) if (r.owner === 'p1') r.driveIn = true;
        });
      return b.turn({ player: 'p1', stage: 'houses', uses: { [b.ceoUid('p1')]: 0, [NB1]: 1, [NB2]: 1, [LM]: 1 } }).build();
    },
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['cleanup'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'drive-in',
      say: 'Your Local Manager is at work, so your restaurant is a drive-in this round: all four corners are doors.',
      show: [{ restaurant: 'p1' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'drive_in',
    },
    {
      id: 'garden',
      say: 'A New Business Developer builds a house, or adds a garden to a house without one. Add a garden to house 18.',
      show: [{ house: 18 }, { ui: `work-card-${NB1}` }],
      allow: { actions: [{ type: 'work.placeGarden', where: (a, v) => a.type === 'work.placeGarden' && a.houseId === houseId(v, 18) }] },
      until: { event: 'gardenAdded', where: (e) => e.type === 'gardenAdded' && e.player === 'p1' },
      solution: (ctx) => {
        const g = placementsFor(ctx, { kind: 'garden', cardUid: NB1 }).find((p) => p.kind === 'garden' && p.houseId === houseId(ctx.view, 18));
        return g && g.kind === 'garden' ? [{ type: 'work.placeGarden', playerId: ctx.me, cardUid: NB1, houseId: g.houseId, side: g.side }] : [];
      },
      then: 'House 18 now pays double for every item and holds up to 5 demand tokens instead of 3.',
      hint: { say: 'Tap a New Business Developer, then "Add a garden", then a side of house 18.', show: [{ house: 18 }] },
      glossary: 'garden',
    },
    {
      id: 'new-house',
      say: 'A house’s number decides when it eats: lower numbers first. With your other Developer, build house 1 on your side of town (tiles A1, A2).',
      show: [{ ui: `work-card-${NB2}` }, { tile: 'A1' }, { tile: 'A2' }],
      allow: { actions: [{ type: 'work.placeHouse', where: (a) => a.type === 'work.placeHouse' && a.houseOrder === 1 && onLeft(a.x, a.y) }] },
      until: { event: 'houseBuilt', where: (e) => e.type === 'houseBuilt' && e.player === 'p1' },
      solution: houseSolution,
      then: 'House 1 comes with its own garden, and it now eats before every other house.',
      hint: { say: 'Tap the other Developer, "Build a house", pick house tile 1, then a spot on tiles A1 or A2.', show: [{ tile: 'A1' }] },
      checkpoint: true,
      glossary: 'nbd',
    },
    {
      id: 'local-manager',
      say: 'The Local Manager opens another restaurant within 3 borders by road from one of your doors. It stays COMING SOON until Clean up.',
      show: [{ ui: `work-card-${LM}` }, { overlay: 'range', spec: { kind: 'restaurant', cardUid: LM } }],
      allow: { actions: [{ type: 'work.placeRestaurant' }] },
      until: { event: 'restaurantPlaced', where: (e) => e.type === 'restaurantPlaced' && e.player === 'p1' },
      solution: restaurantSolution,
      then: 'COMING SOON: it cannot sell this round.',
      hint: { say: 'Tap the Local Manager, then "Place a restaurant", then any lit spot.', show: [{ ui: `work-card-${LM}` }] },
      glossary: 'local_manager',
    },
    {
      id: 'end-turn',
      say: 'End your turn; Bo ends his. Nobody has demand, so Dinnertime is quiet.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [{ player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } }],
      until: { view: (v) => v.phase.kind === 'payday' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
    },
    {
      id: 'payday',
      say: (ctx) => `Your two Developers and the Local Manager earn $5 each: pay $15 from your $${cashOf(ctx.view, 'p1')}.`,
      show: [{ ui: 'payday-confirm' }],
      allow: { actions: [{ type: 'payday.confirm' }] },
      script: [{ player: 'p2', action: { type: 'payday.confirm', playerId: 'p2' } }],
      until: { paused: 'cleanup' },
      solution: [{ type: 'payday.confirm', playerId: 'p1' }],
      hint: { say: 'Press the pay button in the Payday panel.', show: [{ ui: 'payday-confirm' }] },
    },
    {
      id: 'opened',
      say: 'At Clean up your new restaurant opened and the drive-in signs came off. A Regional Manager places or moves a restaurant anywhere, open at once.',
      show: [{ restaurant: 'p1' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'coming_soon',
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'What does a garden do?', options: ['Doubles the price per item and raises the cap to 5', 'Adds $5 per sale', 'Adds 1 to range'], answer: 0, why: 'Garden houses pay ×2 per item and hold up to 5 demand tokens.' },
      { kind: 'number', q: 'How many tile borders can a Local Manager reach by road?', answer: 3, why: 'Local Manager: road range 3 from one of your doors.' },
      { kind: 'tap', q: 'Tap the house that now has a garden from your first Developer.', target: { house: 18 }, why: 'You added the garden to house 18.' },
    ],
  },
});
