/**
 * Milestone triggers and awards (docs/rules/milestones.md; DLX p11, p34–35).
 *
 * Model (milestones.md general rules 1–3, audit.md top-10 #4):
 * - A milestone is claimed **immediately** when its condition is met.
 * - Every player who meets it during the same round also claims it: a milestone stays
 *   claimable until Clean up step D of the round it was first claimed in (`removed`), so order
 *   within the round does not matter.
 * - Effects are mandatory and are read from `PlayerState.milestones` by the phase code.
 *
 * Triggers evaluated here are data-driven from `MilestoneDef.trigger`, so module milestones with
 * the same trigger kinds work too. Module-specific triggers live in module `onEvent` hooks.
 */
import type { EmployeeId, FoodOrAnyDrink, MilestoneDef, MilestoneId } from '../types/content.js';
import type { GameEvent } from '../types/events.js';
import type { HookContext } from '../types/module.js';
import type { FoodId, GameState, PlayerId } from '../types/index.js';
import { FOODS } from '../content/foods.js';
import { BASE_MILESTONES } from '../content/milestones.js';
import { cardsAtWork, defOf, hasMilestone } from './pricing.js';
import { legacyRules } from '../core/rulesVersion.js';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * In play, not crossed out, and not yet owned by this player. A bankrupt chain claims nothing: it
 * leaves the game at the end of the turn (base.md §12), so it must not close a milestone for the
 * players still in it.
 */
export function milestoneAvailable(s: GameState, player: PlayerId, id: MilestoneId): boolean {
  const m = s.milestones[id];
  const p = s.players[player];
  // LEGACY(v1): a bankrupt chain could still claim.
  return Boolean(m && !m.removed && p && (!p.bankrupt || legacyRules(s)) && !p.milestones[id]);
}

function defs(ctx: HookContext): MilestoneDef[] {
  const fromContent = Object.values(ctx.content.milestones).filter((d): d is MilestoneDef => Boolean(d));
  return fromContent.length ? fromContent : [...BASE_MILESTONES];
}

function matchesGood(want: FoodOrAnyDrink | undefined, goods: FoodId[]): boolean {
  if (!want) return true;
  if (want === 'anyDrink') return goods.some((g) => FOODS.find((f) => f.id === g)?.category === 'drink');
  return goods.includes(want);
}

// ---------------------------------------------------------------------------
// Award
// ---------------------------------------------------------------------------

/** Claim `id` for `player` if available; apply immediate effects. Returns true if claimed now. */
export function awardMilestone(ctx: HookContext, player: PlayerId, id: MilestoneId): boolean {
  const s = ctx.state;
  if (!milestoneAvailable(s, player, id)) return false;
  const p = s.players[player];
  const m = s.milestones[id];
  if (!p || !m) return false;
  p.milestones[id] = { round: s.round, phase: s.phase.kind };
  if (!m.claimedBy.includes(player)) m.claimedBy.push(player);
  if (m.claimedRound === null) m.claimedRound = s.round;
  ctx.emit({ type: 'milestoneClaimed', player, milestoneId: id });
  const def = ctx.content.milestones[id] ?? BASE_MILESTONES.find((d) => d.id === id);
  for (const effect of def?.effects ?? []) {
    if (effect.kind === 'gainEmployees') {
      for (const { id: employeeId, count } of effect.employees) gainEmployees(ctx, player, employeeId, count, id, effect.salaryFree);
    }
  }
  return true;
}

/** Take up to `count` cards from the supply onto the player's beach (milestones.md first_hire_3, first_*_produced). */
function gainEmployees(ctx: HookContext, player: PlayerId, employeeId: EmployeeId, count: number, reason: string, salaryFree?: boolean): void {
  const s = ctx.state;
  const p = s.players[player];
  if (!p) return;
  for (let i = 0; i < count; i++) {
    const left = s.supply[employeeId] ?? 0;
    if (left <= 0) return; // "fewer if the supply is short"
    s.supply[employeeId] = left - 1;
    const uid = ctx.id('card');
    p.employees[uid] = { uid, employeeId, acquiredRound: s.round, ...(salaryFree ? { salaryFree: true } : {}) };
    p.beach.push(uid);
    ctx.emit({ type: 'employeeGained', player, uid, employeeId, reason });
  }
}

/** Award every milestone whose trigger `pred` accepts, for one player. */
function awardWhere(ctx: HookContext, player: PlayerId, pred: (d: MilestoneDef) => boolean): void {
  for (const d of defs(ctx)) if (pred(d)) awardMilestone(ctx, player, d.id);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** Called by the reducer for every emitted event; records milestone qualification. */
export function onMilestoneEvent(ctx: HookContext, event: GameEvent): void {
  const s = ctx.state;
  switch (event.type) {
    case 'campaignPlaced': {
      const c = event.campaign;
      awardWhere(
        ctx,
        event.player,
        (d) =>
          d.trigger.kind === 'campaignPlaced' &&
          (d.trigger.campaignKind === undefined || d.trigger.campaignKind === c.kind) &&
          matchesGood(d.trigger.good, c.goods),
      );
      applyEternal(ctx, event.player, c.id);
      return;
    }
    case 'employeeTrained':
      return awardWhere(ctx, event.player, (d) => d.trigger.kind === 'trained');
    case 'employeeHired': {
      const hired = s.turn && s.turn.player === event.player ? s.turn.hired.length : 0;
      return awardWhere(ctx, event.player, (d) => d.trigger.kind === 'hiredThisTurn' && hired >= d.trigger.count);
    }
    case 'structuresRevealed': {
      // "Played" = in the structure at reveal; beach never counts (base.md §4.9).
      for (const player of s.turnOrder) {
        const p = s.players[player];
        if (!p || !(player in event.structures)) continue;
        const atWork = new Set(cardsAtWork(p).map((uid) => p.employees[uid]?.employeeId));
        awardWhere(ctx, player, (d) => d.trigger.kind === 'atWork' && d.trigger.employees.some((e) => atWork.has(e)));
      }
      return;
    }
    case 'foodProduced':
      if (event.count <= 0) return;
      return awardWhere(ctx, event.player, (d) => d.trigger.kind === 'produced' && d.trigger.food === event.food);
    case 'foodDiscarded':
      // Coffee is neither food nor a drink for milestones (KX p10): throwing only coffee away claims nothing.
      if (!Object.entries(event.goods).some(([good, n]) => (n ?? 0) > 0 && ctx.content.foods[good as FoodId]?.category !== 'coffee')) return;
      return awardWhere(ctx, event.player, (d) => d.trigger.kind === 'discarded');
    case 'salaryPaid':
      return awardWhere(ctx, event.player, (d) => d.trigger.kind === 'salaryPaid' && event.paid >= d.trigger.amount);
    case 'cashChanged':
      return checkCashMilestones(ctx, event.player);
    default:
      return;
  }
}

/**
 * "First to have $20 / $100": checked whenever cash changes during Dinnertime and at its end
 * (questions.md Q-B1). Cash outside phase 4 never counts.
 */
export function checkCashMilestones(ctx: HookContext, player: PlayerId): void {
  const s = ctx.state;
  if (s.phase.kind !== 'dinnertime') return;
  const cash = s.players[player]?.cash ?? 0;
  awardWhere(ctx, player, (d) => d.trigger.kind === 'cash' && cash >= d.trigger.amount);
}

/**
 * Start of Dinnertime (DLX p28): every player with a pricing or discount manager at work (a
 * price card that lowers the price) claims "First to Lower Prices", even if they sell nothing.
 * A luxuries manager alone raises the price and does not claim it; one also at work does not
 * prevent the claim.
 */
export function checkStartOfDinnertime(ctx: HookContext): void {
  const s = ctx.state;
  for (const player of s.turnOrder) {
    const p = s.players[player];
    if (!p || p.bankrupt) continue;
    const hasPriceCard = cardsAtWork(p).some((uid) => {
      const ability = defOf(ctx.content, p, uid)?.ability;
      return ability?.kind === 'price' && ability.delta < 0;
    });
    if (!hasPriceCard) continue;
    awardWhere(ctx, player, (d) => d.trigger.kind === 'startOfDinnertime' && d.trigger.condition === 'lowerPrices');
  }
}

/**
 * First Billboard Campaign (b): every campaign launched by its owner from the moment it is
 * earned — the triggering billboard included — is eternal. Earlier campaigns stay finite
 * (DLX p20, JD 1535067; audit.md top-10 #9).
 */
function applyEternal(ctx: HookContext, player: PlayerId, campaignId: string): void {
  const s = ctx.state;
  const camp = s.board.campaigns[campaignId];
  if (!camp || camp.owner !== player || camp.eternal) return;
  if (!ownsEternalEffect(ctx, player, camp.kind)) return;
  camp.eternal = true;
  camp.remaining = 1;
}

function ownsEternalEffect(ctx: HookContext, player: PlayerId, kind: string): boolean {
  return defs(ctx).some(
    (d) =>
      hasMilestone(ctx.state, player, d.id) &&
      d.effects.some((e) => e.kind === 'eternalCampaigns' && (!e.campaignKinds || e.campaignKinds.some((k) => k === kind))),
  );
}

/**
 * True if a campaign `player` launches now must be eternal (for the placement code): the player
 * owns an eternal-campaign milestone for this kind, or (with `goods`) this very campaign claims one
 * (First Billboard: the triggering billboard is eternal, DLX p20/p35), so `campaignPlaced`
 * already reports the campaign as it stands after the action.
 */
export function launchesEternal(ctx: HookContext, player: PlayerId, kind: string, goods?: FoodId[]): boolean {
  if (ownsEternalEffect(ctx, player, kind)) return true;
  if (!goods) return false;
  return defs(ctx).some(
    (d) =>
      milestoneAvailable(ctx.state, player, d.id) &&
      d.trigger.kind === 'campaignPlaced' &&
      (d.trigger.campaignKind === undefined || d.trigger.campaignKind === kind) &&
      matchesGood(d.trigger.good, goods) &&
      d.effects.some((e) => e.kind === 'eternalCampaigns' && (!e.campaignKinds || e.campaignKinds.some((k) => k === kind))),
  );
}

/**
 * Called by the reducer at the end of each player's working turn and at the end of each
 * automatic phase. Claims are immediate (see `onMilestoneEvent`), so this only re-checks
 * state-based conditions (cash during Dinnertime). Crossing out happens in Clean up step D
 * (`crossOutMilestones`), which is what makes same-round sharing work.
 */
export function finalizeMilestones(ctx: HookContext): void {
  for (const player of ctx.state.turnOrder) checkCashMilestones(ctx, player);
}

/**
 * Clean up step D (base.md §10): every milestone claimed this round becomes unavailable to
 * everyone else. Also removes unclaimed milestones whose `removeAfterRound` has come (Ketchup).
 */
export function crossOutMilestones(ctx: HookContext): void {
  const s = ctx.state;
  const removed: MilestoneId[] = [];
  for (const [id, m] of Object.entries(s.milestones) as [MilestoneId, NonNullable<GameState['milestones'][MilestoneId]>][]) {
    if (m.removed) continue;
    const claimed = m.claimedBy.length > 0;
    const expired = m.removeAfterRound !== null && s.round >= m.removeAfterRound;
    if (claimed || expired) {
      m.removed = true;
      removed.push(id);
    }
  }
  if (removed.length) ctx.emit({ type: 'milestonesRemoved', milestoneIds: removed });
}
