/**
 * Hard Choices (ketchup.md §16; DLX p29). Base milestone set only (conflicts with New Milestones).
 *
 * "Remove after turn 2" on First Burger Marketed, First Pizza Marketed, First Drink Marketed and
 * First to Train; "Remove after turn 3" on First to Hire 3. In the Cleanup of that round any of
 * them still unclaimed is crossed out for everyone (base `crossOutMilestones`).
 */
import type { MilestoneId } from '../../types/content.js';
import type { GameModule } from '../../types/module.js';

const ID = 'ketchup:hardChoices' as const;

export const HARD_CHOICES: Partial<Record<MilestoneId, number>> = {
  first_burger_marketed: 2,
  first_pizza_marketed: 2,
  first_drink_marketed: 2,
  first_train: 2,
  first_hire_3: 3,
};

export const HARD_CHOICES_MODULE: GameModule = {
  id: ID,
  name: 'Hard Choices',
  description: 'Some base milestones disappear after turn 2 or 3.',
  conflicts: ['ketchup:newMilestones'],
  hooks: {
    onCreateGame(ctx) {
      for (const [id, round] of Object.entries(HARD_CHOICES) as [MilestoneId, number][]) {
        const m = ctx.state.milestones[id];
        if (m) m.removeAfterRound = round;
      }
    },
  },
};
