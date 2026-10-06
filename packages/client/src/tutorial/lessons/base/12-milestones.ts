/**
 * L12 — Milestones (docs/tutorial-plan.md §2, L12; §1.4 "Milestones: first come, permanent").
 * Claimed the moment you qualify, shared by everyone who qualifies in the same round, crossed out
 * for everyone else at Clean up, and mandatory.
 *
 * Scenario: round 3 Working, Ada first with a Marketing Trainee at work (marketing sub-step). Bo
 * (scripted) also has a Marketing Trainee and places a pizza billboard by house 5 in the same round.
 */
import type { Action, GameView, LegalAction } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { claimed, placementsFor } from './late.js';

const MK = 'p1-mk';
const BO_MK = 'p2-mk';

/** Bo's billboard by house 5 (pizza): the first candidate whose tile and squares are free. */
const BO_SPOTS = [
  { tileNumber: 13, placement: { kind: 'board' as const, x: 6, y: 8, w: 3, h: 1 } },
  { tileNumber: 14, placement: { kind: 'board' as const, x: 7, y: 8, w: 2, h: 1 } },
  { tileNumber: 11, placement: { kind: 'board' as const, x: 7, y: 13, w: 3, h: 2 } },
  { tileNumber: 13, placement: { kind: 'board' as const, x: 7, y: 13, w: 3, h: 1 } },
];

function boBillboard(v: GameView, legal: LegalAction[]): Action {
  void legal;
  for (const s of BO_SPOTS) {
    if (!v.marketingTiles.includes(s.tileNumber)) continue;
    const { x, y, w, h } = s.placement;
    let free = true;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (v.board.cells[y + dy]?.[x + dx]?.kind !== 'empty') free = false;
    if (free) return { type: 'work.placeCampaign', playerId: 'p2', cardUid: BO_MK, campaignKind: 'billboard', tileNumber: s.tileNumber, goods: ['pizza'], placement: s.placement, duration: 2 };
  }
  return { type: 'work.endTurn', playerId: 'p2' };
}

/** A burger billboard by house 18 (tile 14 when free), else any legal billboard. */
function adaBillboard(ctx: StepCtx): Action[] {
  const all = placementsFor(ctx, { kind: 'campaign', cardUid: MK, campaignKind: 'billboard' });
  const pick = all.find((p) => p.kind === 'campaign' && p.tileNumber === 14 && p.placement.kind === 'board' && p.placement.x === 3 && p.placement.y === 8) ?? all[0];
  if (!pick || pick.kind !== 'campaign') return [];
  return [{ type: 'work.placeCampaign', playerId: ctx.me, cardUid: MK, campaignKind: 'billboard', tileNumber: pick.tileNumber, goods: ['burger'], placement: pick.placement, duration: 2, ...(pick.from ? { from: pick.from } : {}) }];
}

const gone = (v: GameView, id: string, player: string) => {
  const m = v.milestones[id as keyof GameView['milestones']];
  return Boolean(m && m.removed && !m.claimedBy.includes(player));
};

export const lesson12 = defineLesson({
  id: 'base.12',
  course: 'base',
  title: 'Milestones',
  minutes: 7,
  goal: 'Milestones: claimed at once, shared within a round, gone for the rest at Clean up, and mandatory.',
  concepts: ['milestone', 'same_round_sharing', 'eternal_campaign', 'mandatory_effect'],
  scenario: {
    build: () => {
      const b = town({ round: 3 })
        .card('p1', 'marketing_trainee', 'work', MK)
        .card('p2', 'marketing_trainee', 'work', BO_MK)
        .cash('p1', 12)
        .cash('p2', 12)
        .phase({ kind: 'working', player: 'p1', idx: 0 });
      return b.turn({ player: 'p1', stage: 'marketing', uses: { [b.ceoUid('p1')]: 0, [MK]: 1 } }).build();
    },
    learner: 'p1',
    opponents: { p2: 'scripted' },
    pauseAfter: ['working', 'cleanup'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'open-tab',
      say: 'Milestones are one-off rewards for being first. Open the Milestones tab: all 18 are still open.',
      show: [{ ui: 'tab-milestones' }],
      allow: { ui: ['tab-milestones'] },
      until: { signal: 'dockTab', equals: 'milestones' },
      solution: [{ tap: { ui: 'tab-milestones' } }],
      hint: { say: 'The Milestones tab is in the dock, with the trophy.', show: [{ ui: 'tab-milestones' }] },
      checkpoint: true,
      glossary: 'milestone',
    },
    {
      id: 'billboard',
      say: 'Back in the Turn tab, tap your Marketing Trainee and place any billboard for burgers. Being first claims First Billboard Campaign.',
      show: [{ ui: `work-card-${MK}` }, { ui: 'milestone-first_billboard' }],
      allow: { actions: [{ type: 'work.placeCampaign', where: (a) => a.type === 'work.placeCampaign' && a.campaignKind === 'billboard' && a.goods.length === 1 && a.goods[0] === 'burger' }] },
      until: { event: 'milestoneClaimed', where: (e) => e.type === 'milestoneClaimed' && e.player === 'p1' && e.milestoneId === 'first_billboard' },
      solution: adaBillboard,
      then: (ctx) => `Stamped: First Billboard${claimed(ctx.events, 'p1', 'first_burger_marketed') ? ' and First Burger Marketed are' : ' is'} yours for the rest of the game.`,
      hint: { say: 'Turn tab → Marketing Trainee → pick a billboard token, Burger, then a spot.', show: [{ ui: `work-card-${MK}` }] },
      glossary: 'first_billboard',
    },
    {
      id: 'mandatory',
      say: 'First Billboard makes every campaign you launch eternal, and its marketeer stays busy for good. Milestone effects are mandatory, even when they hurt.',
      show: [{ ui: 'milestone-first_billboard' }, { restaurant: 'p1' }],
      until: { next: true },
      checkpoint: true,
      glossary: 'mandatory_effect',
    },
    {
      id: 'same-round',
      say: 'End your turn and watch Bo: he places a billboard in this same round.',
      show: [{ ui: 'end-turn' }],
      allow: { actions: [{ type: 'work.endTurn' }] },
      script: [
        { player: 'p2', action: boBillboard },
        { player: 'p2', action: { type: 'work.endTurn', playerId: 'p2' } },
      ],
      until: { paused: 'working' },
      solution: [{ type: 'work.endTurn', playerId: 'p1' }],
      then: (ctx) => (claimed(ctx.events, 'p2', 'first_billboard') ? 'Same round, so Bo claims First Billboard too: everyone who qualifies this round gets it.' : 'Bo ended his turn.'),
      onEnter: [{ openTab: 'turn' }],
      glossary: 'same_round_sharing',
    },
    {
      id: 'cleanup',
      say: 'Press Continue. Dinnertime, Payday, Marketing and Clean up run; watch the Milestones tab at Clean up.',
      show: [{ ui: 'continue' }],
      allow: { actions: [{ type: 'tutorial.continue' }] },
      until: { paused: 'cleanup' },
      solution: (ctx) => {
        const head = ctx.view.pending[0];
        return head?.kind === 'continue' ? [{ type: 'tutorial.continue', playerId: ctx.me, choiceId: head.id }] : [];
      },
    },
    {
      id: 'crossed-out',
      say: (ctx) =>
        gone(ctx.view, 'first_burger_marketed', 'p2')
          ? 'At Clean up, milestones claimed this round were crossed out for the rest: First Burger Marketed is gone for Bo, First Pizza Marketed for you.'
          : 'At Clean up, a milestone claimed this round is crossed out for everyone who did not claim it.',
      show: [{ ui: 'milestone-first_burger_marketed' }, { ui: 'milestone-first_pizza_marketed' }],
      until: { next: true },
      onEnter: [{ summary: 'close' }, { openTab: 'milestones' }],
      checkpoint: true,
    },
    {
      id: 'costs',
      say: 'Some milestones cut both ways. First to Lower Prices is −$1 on every item forever; First Burger Marketed pays +$5 per burger sold.',
      show: [{ ui: 'milestone-first_lower_prices' }, { ui: 'milestone-first_burger_marketed' }],
      until: { next: true },
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'You and Bo both place your first billboard in the same round. Who gets First Billboard?', options: ['Whoever placed first', 'Both of you', 'Nobody'], answer: 1, why: 'Everyone who qualifies in the same round claims it.' },
      { kind: 'choice', q: 'Can you refuse a milestone’s effect?', options: ['Yes', 'No, effects are mandatory'], answer: 1, why: 'Benefits and drawbacks alike apply for the rest of the game.' },
      { kind: 'tap', q: 'Tap the house your billboard advertises burgers to.', target: { house: 18 }, why: 'Your billboard sits beside house 18 on tile A2.' },
    ],
  },
});
