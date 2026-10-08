/**
 * L15 — Guided game vs an Easy bot (docs/tutorial-plan.md §2, L15). A full game on the tutorial
 * town against Bo (Easy bot) with the coach at full level. The lesson is thin: a few steps whose
 * narration follows the phase ("phase-triggered coach cards"), the coach hints (ui/hints) in the
 * Turn panel, and a pause after every Dinnertime to read what happened.
 *
 * Every learner step's solution is "the next sensible move" (the Medium bot's choice for the
 * learner's seat), recomputed until the step's goal holds (`repeatSolution`): Skip step lets the
 * coach play that stretch, the headless walk plays the whole game, and e2e follows it through the UI.
 */
import type { Action, GameEvent, PlayerId } from '@fcm/engine';
import { botBudgetMs, decisionSeed, fallbackAction, runBot } from '@fcm/ai';
import { engine } from '@fcm/engine';
import { town } from '@fcm/engine/testing';
import { defineLesson, type StepCtx } from '../../dsl.js';
import { cashOf, openSlots, openSlotsOf } from './late.js';

/** The learner's next sensible move (the Medium bot's choice on the learner's own view), or nothing when not awaited. */
export function coachMove(ctx: StepCtx): Action[] {
  const v = ctx.view;
  const head = v.pending[0];
  if (head?.kind === 'continue') return head.player === ctx.me ? [{ type: 'tutorial.continue', playerId: ctx.me, choiceId: head.id }] : [];
  if (v.phase.kind === 'gameOver' || !v.awaiting.players.includes(ctx.me)) return [];
  if (v.phase.kind === 'restructuring' && v.submitted[ctx.me]) return [];
  const s = ctx.state();
  try {
    const a = runBot({ level: 'medium', view: v, playerId: ctx.me, seed: decisionSeed(s.seed, s.history.seq, ctx.me), budgetMs: botBudgetMs('medium', 'hotSeat') });
    return [{ ...a, playerId: ctx.me } as Action];
  } catch {
    return [fallbackAction(s, ctx.me, engine)];
  }
}

/** Income per player in the most recent Dinnertime of these events. */
function lastDinner(events: readonly GameEvent[]): Record<PlayerId, number> | null {
  let start = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'phaseChanged' && e.to.kind === 'dinnertime') {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const out: Record<PlayerId, number> = {};
  for (const e of events.slice(start)) {
    if (e.type === 'phaseChanged' && e.to.kind !== 'dinnertime') break;
    if (e.type === 'cashChanged' && e.delta > 0) out[e.player] = (out[e.player] ?? 0) + e.delta;
  }
  return out;
}

const START_BANK = 100;

/** Phase-triggered coach card: one or two sentences for whatever the game is doing now. */
export function coachSay(ctx: StepCtx): string {
  const v = ctx.view;
  const me = ctx.me;
  if (v.phase.kind === 'gameOver') {
    const rank = v.phase.ranking.indexOf(me) + 1;
    return rank === 1 ? `Game over: you win with $${cashOf(v, me)}!` : `Game over: Bo wins this time, $${cashOf(v, 'p2')} to your $${cashOf(v, me)}.`;
  }
  const head = v.pending[0];
  if (head?.kind === 'continue' && head.phase === 'dinnertime') {
    const d = lastDinner(ctx.events);
    const mine = d?.[me] ?? 0;
    const bo = d?.p2 ?? 0;
    const bank = v.bank.cash <= 40 && v.round >= 2 ? ` The bank is down to $${v.bank.cash}: count what you both earn next dinner.` : '';
    return `Dinner: you earned $${mine}, Bo $${bo}.${bank || ' Open the Summary to watch it again, then Continue.'}`;
  }
  if (v.bank.cash <= 40 && v.round >= 2) return `The bank is down to $${v.bank.cash}${v.bank.breaks ? ' after the refill' : ` of $${START_BANK}`}. Count what you and Bo will earn next dinner.`;
  switch (v.phase.kind) {
    case 'setup.reserve':
      return 'Pick a reserve card. It refills the bank at the first break and votes for the CEO slots everyone gets.';
    case 'restructuring': {
      const p = v.players[me];
      const d = ctx.signals.draft;
      const open = p && d ? openSlotsOf(v, p, d) : openSlots(v, me);
      return v.submitted[me] ? 'Submitted. Bo is still deciding; charts are revealed at once.' : `Plan: who works today? Cards in slots work; the rest go to the beach. Open slots: ${open}.`;
    }
    case 'orderOfBusiness':
      return `Open slots: you ${openSlots(v, me)}, Bo ${openSlots(v, 'p2')}. Most open slots chooses a turn order spot first.`;
    case 'working': {
      if (v.turn?.player !== me) return 'Bo is working. Watch what he hires and where he markets.';
      const stage = v.turn.stage;
      if (stage === 'recruit') return v.round <= 2 ? 'Hire with your CEO: a Kitchen Trainee makes food, a Marketing Trainee makes demand. Demand is everything.' : 'Hire first, then train beach cards, then market, then make food and drinks.';
      if (stage === 'train') return 'Training turns a beach card into the next card on its career line.';
      if (stage === 'marketing') return 'A billboard puts demand on the houses it touches, in Marketing after Payday.';
      if (stage === 'food') return 'Make what the houses you can reach will want, and fetch drinks they ask for.';
      return 'Finish your cards, then end your turn.';
    }
    case 'payday':
      return 'Payday: $5 for every salaried card you own, minus any discounts. Fire anyone who costs more than they earn.';
    default:
      return 'The automatic phases are running.';
  }
}

export const lesson15 = defineLesson({
  id: 'base.15',
  course: 'base',
  title: 'Guided game vs an Easy bot',
  minutes: 40,
  goal: 'Play a whole game on the tutorial town against an Easy bot, with the coach at your side.',
  concepts: ['game_end', 'bank_break', 'open_slots', 'demand'],
  badge: { id: 'lesson:base.15', label: 'Guided game' },
  scenario: {
    build: () => town({ round: 0, seed: 1500 }).phase({ kind: 'setup.reserve' }).build(),
    learner: 'p1',
    opponents: { p2: 'easy' },
    pauseAfter: ['dinnertime'],
    camera: { kind: 'board' },
  },
  steps: [
    {
      id: 'welcome',
      say: 'A whole game against Bo, an Easy bot, on the town you know. Coach hints appear in the Turn panel; Skip step lets the coach play a stretch for you.',
      show: [{ restaurant: 'p1' }, { restaurant: 'p2' }],
      until: { next: true },
      onEnter: [{ coach: 'full' }],
      checkpoint: true,
    },
    {
      id: 'reserve',
      say: coachSay,
      show: [{ ui: 'reserve-200' }],
      allow: 'any',
      until: { view: (v) => v.phase.kind !== 'setup.reserve' },
      solution: coachMove,
      repeatSolution: true,
      glossary: 'reserve_card',
    },
    {
      id: 'round-1',
      say: coachSay,
      show: [{ ui: 'tab-turn' }],
      allow: 'any',
      until: { view: (v) => v.round >= 2 || v.phase.kind === 'gameOver' },
      solution: coachMove,
      repeatSolution: true,
      checkpoint: true,
      glossary: 'hiring',
    },
    {
      id: 'round-2',
      say: coachSay,
      show: [{ ui: 'tab-turn' }],
      allow: 'any',
      until: { view: (v) => v.round >= 3 || v.phase.kind === 'gameOver' },
      solution: coachMove,
      repeatSolution: true,
      checkpoint: true,
      glossary: 'ceo_slots',
    },
    {
      id: 'play',
      say: coachSay,
      show: [{ ui: 'tab-turn' }, { ui: 'bank' }],
      allow: 'any',
      until: { event: 'gameEnded' },
      solution: coachMove,
      repeatSolution: true,
      checkpoint: true,
      glossary: 'bank_break',
    },
    {
      id: 'result',
      say: (ctx) => `${coachSay(ctx)} Next: free play with the coach, against any bot on any map.`,
      show: [{ ui: 'cash-p1' }, { ui: 'cash-p2' }],
      until: { next: true },
    },
  ],
  quiz: {
    pass: 2,
    questions: [
      { kind: 'choice', q: 'What makes a house buy at Dinnertime?', options: ['Being close to a restaurant', 'Demand tokens from marketing', 'A garden'], answer: 1, why: 'No demand, no sale: campaigns place demand in the Marketing phase.' },
      { kind: 'choice', q: 'When does the game end?', options: ['After round 10', 'After the Dinnertime in which the bank breaks a second time', 'When a chain runs out of cash'], answer: 1, why: 'The second break ends the game after that Dinnertime; most cash wins.' },
      { kind: 'tap', q: 'Tap your restaurant.', target: { restaurant: 'p1' }, why: 'Your chain started on tile A1.' },
    ],
  },
});
