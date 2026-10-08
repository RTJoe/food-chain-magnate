/**
 * 3e Prep food (base.md §6.5; DLX p21).
 *
 * Kitchen trainee: 1 burger OR 1 pizza (player's choice); cooks 3, chefs 8. Producing is
 * optional, but a card that produces makes its full amount (all or nothing; questions.md Q-B3,
 * JD 1564805). Food goes to the player's single shared stock. Milestones (first burger / pizza
 * produced) fire from the `foodProduced` event.
 */
import type { WorkProduce } from '../../types/actions.js';
import type { FoodId } from '../../types/content.js';
import type { GameState, PlayerState } from '../../types/state.js';
import type { EngineCtx } from '../../core/context.js';
import { OK, reject, type Check } from '../../core/errors.js';
import { contentFor } from '../../modules/registry.js';
import { advanceTo, cardCheck, spend } from './stages.js';

/** The food this card would make for this action (null = invalid choice). */
export function produceChoice(s: GameState, a: WorkProduce): { food: FoodId; amount: number } | string {
  const p = s.players[a.playerId];
  const card = p?.employees[a.cardUid];
  const def = card ? contentFor(s.config.modules).employees[card.employeeId] : undefined;
  if (def?.ability.kind !== 'produce') return 'Not a cook';
  const foods = def.ability.foods;
  const food = a.food ?? (foods.length === 1 ? foods[0] : undefined);
  if (!food) return `Choose one of: ${foods.join(', ')}`;
  if (!foods.includes(food)) return `${def.name} cannot make ${food}`;
  return { food, amount: def.ability.amount };
}

export function validateProduce(s: GameState, a: WorkProduce): Check {
  const c = cardCheck(s, a.playerId, a.cardUid, ['produce'], 'food');
  if (!c.ok) return c;
  if (c.def.ability.kind === 'produce' && c.def.ability.timing !== 'working') return reject('ILLEGAL', `${c.def.name} produces in Cleanup`);
  const choice = produceChoice(s, a);
  return typeof choice === 'string' ? reject('INVALID_PAYLOAD', choice) : OK;
}

export function applyProduce(ctx: EngineCtx, a: WorkProduce): void {
  const s = ctx.state;
  const choice = produceChoice(s, a);
  if (typeof choice === 'string') return;
  advanceTo(ctx, 'food');
  const p = s.players[a.playerId] as PlayerState;
  p.inventory[choice.food] = (p.inventory[choice.food] ?? 0) + choice.amount;
  spend(ctx, a.cardUid);
  ctx.emit({ type: 'foodProduced', player: a.playerId, uid: a.cardUid, food: choice.food, count: choice.amount });
}
