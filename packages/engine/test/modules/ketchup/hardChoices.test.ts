/**
 * Hard Choices (ketchup.md §16; DLX p29). Base milestone set only.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, MilestoneId } from '../../../src/index.js';
import { createGame } from '../../../src/core/createGame.js';
import { awardMilestone } from '../../../src/rules/milestones.js';
import { runCleanup } from '../../../src/rules/cleanup.js';
import { HARD_CHOICES } from '../../../src/modules/ketchup/hardChoices.js';
import { cfg, newGame } from '../../helpers/game.js';
import { kctx, type KCtx } from './helpers.js';

const M = ['ketchup:hardChoices'] as const;
const TURN2: MilestoneId[] = ['first_burger_marketed', 'first_pizza_marketed', 'first_drink_marketed', 'first_train'];
const TURN3: MilestoneId[] = ['first_hire_3'];

const game = (): GameState => newGame(2, 1, undefined, { modules: [...M] });

/** Run the Cleanup of `round` on a fresh Hard Choices game; `claim` = [player, milestone] claimed that round. */
function cleanup(round: number, state: GameState = game(), claim: [string, MilestoneId][] = []): KCtx {
  state.round = round;
  const ctx = kctx(state);
  for (const [p, m] of claim) awardMilestone(ctx, p, m);
  ctx.events.length = 0;
  runCleanup(ctx);
  return ctx;
}
const removed = (s: GameState) => Object.entries(s.milestones).filter(([, m]) => m?.removed).map(([id]) => id).sort();

describe('Hard Choices - setup (ketchup.md §16)', () => {
  it('§16: "Remove after turn 2" on the four milestones, "Remove after turn 3" on First to Hire 3', () => {
    const s = game();
    for (const id of TURN2) expect(s.milestones[id]?.removeAfterRound).toBe(2);
    for (const id of TURN3) expect(s.milestones[id]?.removeAfterRound).toBe(3);
    expect(HARD_CHOICES).toEqual({ first_burger_marketed: 2, first_pizza_marketed: 2, first_drink_marketed: 2, first_train: 2, first_hire_3: 3 });
  });

  it('§16: every other base milestone is untouched', () => {
    const s = game();
    const marked = new Set<string>([...TURN2, ...TURN3]);
    const others = Object.entries(s.milestones).filter(([id]) => !marked.has(id));
    expect(others.length).toBeGreaterThan(10);
    for (const [, m] of others) expect(m?.removeAfterRound).toBeNull();
  });

  it('§16: without the module nothing is marked', () => {
    expect(Object.values(newGame(2).milestones).every((m) => m?.removeAfterRound === null)).toBe(true);
  });

  it('§16: base milestone set only - combining with New Milestones is rejected by createGame', () => {
    expect(() => createGame({ ...cfg(2), modules: ['ketchup:hardChoices', 'ketchup:newMilestones'] }, 1)).toThrow(/cannot be combined with/);
    expect(() => createGame({ ...cfg(2), modules: ['ketchup:newMilestones', 'ketchup:hardChoices'] }, 1)).toThrow(/cannot be combined with/);
  });
});

describe('Hard Choices - Cleanup (ketchup.md §16)', () => {
  it('§16: nothing expires in the Cleanup of round 1', () => {
    const ctx = cleanup(1);
    expect(removed(ctx.state)).toEqual([]);
    expect(ctx.of('milestonesRemoved')).toHaveLength(0);
  });

  it('§16: in the Cleanup of round 2 the unclaimed turn-2 milestones are crossed out for everyone', () => {
    const ctx = cleanup(2);
    expect(removed(ctx.state)).toEqual([...TURN2].sort());
    expect(ctx.of('milestonesRemoved')[0]?.milestoneIds.slice().sort()).toEqual([...TURN2].sort());
  });

  it('§16: First to Hire 3 survives round 2 and is crossed out in the Cleanup of round 3', () => {
    const s = game();
    cleanup(2, s);
    expect(s.milestones.first_hire_3?.removed).toBe(false);
    const ctx = cleanup(3, s);
    expect(s.milestones.first_hire_3?.removed).toBe(true);
    expect(ctx.of('milestonesRemoved')[0]?.milestoneIds).toEqual(['first_hire_3']);
  });

  it('§16: in round 3 the turn-2 ones are already gone and other milestones stay', () => {
    const s = game();
    cleanup(2, s);
    cleanup(3, s);
    expect(removed(s)).toEqual([...TURN2, ...TURN3].sort());
    expect(s.milestones.first_billboard?.removed).toBe(false);
  });

  it('§16: a crossed-out milestone can no longer be claimed', () => {
    const s = game();
    cleanup(2, s);
    s.round = 3;
    expect(awardMilestone(kctx(s), 'p1', 'first_train')).toBe(false);
    expect(awardMilestone(kctx(s), 'p1', 'first_hire_3')).toBe(true);
  });

  it('§16: still available before its round ends (claimable in round 2)', () => {
    const s = game();
    s.round = 2;
    expect(awardMilestone(kctx(s), 'p2', 'first_burger_marketed')).toBe(true);
  });

  it('§16: a milestone claimed in round 2 is not "unclaimed": players keep it', () => {
    const s = game();
    const ctx = cleanup(2, s, [['p1', 'first_train']]);
    expect(s.players.p1?.milestones.first_train).toBeDefined();
    expect(s.milestones.first_train).toMatchObject({ claimedBy: ['p1'], removed: true });
    // Removed once, by the normal claim rule, and listed once.
    expect(ctx.of('milestonesRemoved')[0]?.milestoneIds.filter((m) => m === 'first_train')).toHaveLength(1);
  });

  it('§16: a claimed milestone is not affected before its round (claimed in round 1: normal cross-out, kept by owner)', () => {
    const s = game();
    const ctx = cleanup(1, s, [['p1', 'first_hire_3']]);
    expect(removed(s)).toEqual(['first_hire_3']);
    expect(s.players.p1?.milestones.first_hire_3).toBeDefined();
    expect(ctx.of('milestonesRemoved')[0]?.milestoneIds).toEqual(['first_hire_3']);
    // The turn-2 ones are still available.
    for (const id of TURN2) expect(s.milestones[id]?.removed).toBe(false);
  });
});
