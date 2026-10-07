/**
 * Pure campaign rules for the campaign flows (views only): milestones a launch would claim, eternal
 * launches and how many goods a campaign may carry. Mirrors engine rules/milestones.ts and the
 * Ketchup newMilestones `campaignGoods` hook.
 */
import type { CampaignKind, EmployeeId, FoodId, GameView, MilestoneDef, MilestoneId, Placement, PlayerId } from '@fcm/engine';
import type { Catalog } from './catalog.js';

/** Still claimable by `me`: in play, not crossed out, not owned, and unclaimed or claimed this round (same-round sharing). */
export function milestoneOpen(v: GameView, me: PlayerId, id: MilestoneId): boolean {
  const m = v.milestones[id];
  if (!m || m.removed) return false;
  return !m.claimedBy.includes(me) && !v.players[me]?.milestones[id] && (m.claimedBy.length === 0 || m.claimedRound === v.round);
}

/** What the campaign being launched looks like (the card and the goods chosen so far). */
export interface LaunchInfo {
  employeeId?: EmployeeId | null;
  goods?: readonly FoodId[];
}

function goodMatches(c: Catalog, want: string | undefined, goods: readonly FoodId[]): boolean {
  if (!want) return true;
  if (want === 'anyDrink') return goods.some((g) => c.foods[g]?.category === 'drink');
  return goods.includes(want as FoodId);
}

const eternalFor = (d: MilestoneDef, kind: CampaignKind) => d.effects.some((e) => e.kind === 'eternalCampaigns' && (!e.campaignKinds || e.campaignKinds.includes(kind)));

/** Open milestones this launch claims itself (placing the campaign, or using the card that places it). */
export function milestonesClaimedBy(c: Catalog, v: GameView, who: PlayerId | null, kind: CampaignKind, launch: LaunchInfo = {}): MilestoneDef[] {
  if (!who || !v.players[who]) return [];
  const out: MilestoneDef[] = [];
  for (const id of Object.keys(v.milestones) as MilestoneId[]) {
    const d = c.milestones[id];
    if (!d || !milestoneOpen(v, who, id)) continue;
    const t = d.trigger;
    const hit =
      (t.kind === 'campaignPlaced' && (t.campaignKind === undefined || t.campaignKind === kind) && goodMatches(c, t.good, launch.goods ?? [])) ||
      (t.kind === 'used' && Boolean(launch.employeeId) && t.employees.includes(launch.employeeId as EmployeeId));
    if (hit) out.push(d);
  }
  return out;
}

/**
 * Whether a `kind` campaign launched now is eternal: an owned eternal-campaigns milestone, or one
 * this very launch claims (DLX p20: "with the billboard you just placed to gain this milestone").
 * `claims` names the milestone the launch claims for the eternal effect (null when already owned).
 */
export function eternalLaunch(c: Catalog, v: GameView, who: PlayerId | null, kind: CampaignKind, launch: LaunchInfo = {}): { eternal: boolean; claims: MilestoneDef | null } {
  const p = who ? v.players[who] : undefined;
  if (!p) return { eternal: false, claims: null };
  const owned = (Object.keys(p.milestones) as MilestoneId[]).some((id) => {
    const d = c.milestones[id];
    return d ? eternalFor(d, kind) : false;
  });
  if (owned) return { eternal: true, claims: null };
  const claims = milestonesClaimedBy(c, v, who, kind, launch).find((d) => eternalFor(d, kind)) ?? null;
  return { eternal: Boolean(claims), claims };
}

export function launchesEternal(c: Catalog, v: GameView, who: PlayerId | null, kind: CampaignKind, launch: LaunchInfo = {}): boolean {
  return eternalLaunch(c, v, who, kind, launch).eternal;
}

/** One line for the duration slot when the launch itself claims the eternal milestone. */
export function eternalClaimLine(claim: MilestoneDef, kind: CampaignKind, marketeer: string): string {
  const kinds = claim.effects.find((e) => e.kind === 'eternalCampaigns');
  const what = kinds && kinds.kind === 'eternalCampaigns' && kinds.campaignKinds ? `${kind === 'giantBillboard' ? 'giant billboard' : kind.toLowerCase()}s` : 'campaigns';
  return `Claims ${claim.name}: this and all your later ${what} are eternal; your ${marketeer.toLowerCase()} stays busy for the rest of the game.`;
}

/**
 * Most goods one campaign may advertise (engine `campaignGoods`): 1, or 2 different goods for a
 * brand manager's airplane while "First brand manager used" is still available to the player (KX p18).
 */
export function maxCampaignGoods(v: GameView, who: PlayerId | null, employeeId: EmployeeId | null | undefined, kind: CampaignKind | null | undefined): number {
  if (!who || employeeId !== 'brand_manager' || kind !== 'airplane') return 1;
  if (!v.config.modules.includes('ketchup:newMilestones' as never)) return 1;
  const id = 'ketchup:first_brand_manager_used' as MilestoneId;
  const m = v.milestones[id];
  const p = v.players[who];
  return m && !m.removed && p && !p.milestones[id] ? 2 : 1;
}

/** Tap a good chip: single choice when `max` is 1; otherwise toggle, in pick order (A, then B), replacing B when full. */
export function toggleGood(current: readonly FoodId[], f: FoodId, max: number): FoodId[] {
  if (max <= 1) return [f];
  if (current.includes(f)) return current.filter((g) => g !== f);
  if (current.length < max) return [...current, f];
  return [...current.slice(0, max - 1), f];
}

/**
 * Campaign pick with a good to choose first. A board pick made before the good is held; choosing
 * the good never launches by itself (the player still sets the duration and confirms the held pick).
 */
export type PickStep = 'chooseGood' | 'confirmHeld' | 'pickSpot';

export function pickStep(hasGood: boolean, held: Placement | null): PickStep {
  if (held) return 'confirmHeld';
  return hasGood ? 'pickSpot' : 'chooseGood';
}

/** What a board pick does: hold it until a good is chosen, else launch. */
export function onPick(hasGood: boolean): 'hold' | 'commit' {
  return hasGood ? 'commit' : 'hold';
}
