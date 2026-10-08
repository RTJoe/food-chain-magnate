/**
 * New Milestones (ketchup.md §3; DLX p17–19). Replaces every base milestone with 17 new ones
 * (module milestones of other Ketchup modules stay). Claims are immediate and shared by everyone
 * who qualifies in the same round (base rules/milestones.ts); others cross them out in Cleanup.
 * "Remove after turn 2" markers on First marketeer / trainer / recruiting girl used.
 *
 * "Used" (DLX p17): the card performed a printed function in Working, Dinnertime or Payday.
 * Trigger points: campaign placed by that marketeer (marketeers only count when they place a
 * campaign), hire by a recruiting girl, training by a trainer, a cart operator's haul, tips paid
 * (waitress), a discount manager at work when Dinnertime starts (its price modifier applies;
 * questions.md Q-K11). "Sold": a `sale` line of that good.
 *
 * Effects handled here (data-driven ones — CEO slots, stacked training, eternal radios, per-source
 * overrides, free cards — are applied by base code from `MilestoneDef.effects`):
 * - First marketeer used: +$5 per demand counter placed by your marketeers' campaigns, paid in
 *   Marketing; Dinnertime score −2.
 * - First campaign manager used: optional second tile of the same type, good and duration this
 *   turn (`secondCampaign` choice), linked to the first; the manager returns when both are gone.
 * - First brand manager used: the airplane that claims it may carry 2 different goods.
 * - First brand director used: radios placed from now on are eternal; the director keeps its
 *   salary (`cardSalaried`) and stays busy.
 * - First pizza sold: for each of the first 3 houses buying pizza from you this round (the
 *   triggering one included) place a pizza radio (base radio tile, 2 counters) on that house's tile
 *   (`pizzaRadio` choice, resolved after Dinnertime; forfeited without a legal square or tile).
 * - First lemonade sold: you may train cards at work into a card of the same colour; it stays in
 *   its slot and may act this turn only if the old card had not acted.
 * - First beer sold: pay salaries with goods (`payday.confirm.tokens`, 1 token = 1 salary,
 *   coffee excluded).
 * - First soda sold: freezer for 10 items.
 * - First recruiting girl used: an Executive VP (never paid) from the tray, else from the box.
 * - First trainer used: never forced to fire for unpaid salaries (pay what you can).
 * - First discount manager used: $100 leaves the game at the end of each Restructuring in which
 *   you discount by $3 or more (Night Shift doubling included); for the claiming turn, whose
 *   Restructuring is already over, it leaves when the milestone is claimed (questions.md Q-K5).
 * - First new restaurant: a free eternal mailbox in the new restaurant's block (`freeMailbox`).
 * - First waitress used: salaries $3 per salaried employee.
 * - First cart operator used: cart operators / zeppelins collect 4 per source, trucks 6 (the
 *   triggering haul included).
 * The three replacement airplanes (Q-K3) are identical to base #4–6 and are not modelled.
 */
import type { NewMilestonesPlaceFreeMailbox, NewMilestonesPlacePizzaRadio, NewMilestonesPlaceSecondCampaign, PaydayConfirm } from '../../types/actions.js';
import type { EmployeeId, FoodId, MilestoneDef, MilestoneEffect, MilestoneId, MilestoneTrigger } from '../../types/content.js';
import type { GameModule, HookContext } from '../../types/module.js';
import type { Campaign, CampaignPlacement, FoodCounts, GameState, PendingChoice, PlayerId, PlayerState } from '../../types/state.js';
import type { LegalAction, Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { cardPlace, defOf } from '../../core/cards.js';
import { contentFor, pipe } from '../registry.js';
import { FOODS } from '../../content/foods.js';
import { allEmpty, cellKey, onMap, paint, rect, restaurantCells, tileOf, touchesRoad } from '../../map/grid.js';
import { mailboxArea } from '../../map/reach.js';
import { awardMilestone, launchesEternal, milestoneAvailable } from '../../rules/milestones.js';
import { hasMilestone, hasMilestoneBefore } from '../../rules/pricing.js';
import { burnFromBank, payFromBank } from '../../rules/bank.js';
import { campaignPlacementProblem, rangeField } from '../../rules/working/campaigns.js';
import { baseUses } from '../../rules/working/stages.js';
import { buyerStats } from '../../rules/working/buyDrinks.js';
import { salariedCards, salaryBreakdown } from '../../rules/payday.js';
import { nightShiftActive } from './nightShift.js';
import { headChoice, isRejected, moduleState, peekState, pushChoice, registerChoiceKind, resolveHead, workDefs } from './shared.js';

const ID = 'ketchup:newMilestones' as const;
const REF = 'ketchup.md §3; DLX p18–19';

const MARKETEERS: EmployeeId[] = ['marketing_trainee', 'campaign_manager', 'brand_manager', 'brand_director', 'ketchup:rural_marketeer', 'ketchup:gourmet_food_critic'];
const RADIOS = [1, 2, 3];
/** Free mailbox tiles, smallest first. */
const MAILBOXES = [9, 10, 7, 8];

const ms = (id: MilestoneId, name: string, trigger: MilestoneTrigger, effects: MilestoneEffect[], text: string, extra: Partial<MilestoneDef> = {}): MilestoneDef => ({
  id,
  name,
  module: ID,
  trigger,
  effects,
  timing: 'immediately',
  text,
  rulesRef: REF,
  ...extra,
});

export const NEW_MILESTONES: readonly MilestoneDef[] = [
  ms('ketchup:first_marketeer_used', 'First marketeer used', { kind: 'used', employees: MARKETEERS }, [{ kind: 'marketeerDemandCash', perToken: 5 }, { kind: 'dinnerScore', delta: -2 }], '+$5 per demand counter your marketeers place; Dinnertime price + distance − 2.', { removeAfterRound: 2 }),
  ms('ketchup:first_marketing_trainee_used', 'First marketing trainee used', { kind: 'used', employees: ['marketing_trainee'] }, [{ kind: 'gainEmployees', employees: [{ id: 'kitchen_trainee', count: 1 }, { id: 'errand_boy', count: 1 }], trainableThisTurn: false }], 'Take a Kitchen Trainee and an Errand Boy to the beach.'),
  ms('ketchup:first_campaign_manager_used', 'First campaign manager used', { kind: 'used', employees: ['campaign_manager'] }, [{ kind: 'secondCampaign' }], 'This turn that campaign manager may place a second tile of the same type, good and duration.'),
  ms('ketchup:first_brand_manager_used', 'First brand manager used', { kind: 'used', employees: ['brand_manager'] }, [{ kind: 'twoGoodAirplane' }], 'The airplane that claims this may advertise two different goods.'),
  ms('ketchup:first_brand_director_used', 'First brand director used', { kind: 'used', employees: ['brand_director'] }, [{ kind: 'eternalCampaigns', campaignKinds: ['radio'] }], 'Every radio you place from now on is eternal.'),
  ms('ketchup:first_burger_sold', 'First burger sold', { kind: 'sold', good: 'burger' }, [{ kind: 'ceoSlots', slots: 4 }], 'Your CEO has 4 slots for the rest of the game.'),
  ms('ketchup:first_pizza_sold', 'First pizza sold', { kind: 'sold', good: 'pizza' }, [{ kind: 'pizzaRadios', houses: 3, duration: 2 }], 'The first 3 houses buying your pizza this turn each get a 2-turn pizza radio on their tile.'),
  ms('ketchup:first_lemonade_sold', 'First lemonade sold', { kind: 'sold', good: 'lemonade' }, [{ kind: 'trainAtWorkSameColour' }], 'You may train employees at work into a card of the same colour.'),
  ms('ketchup:first_beer_sold', 'First beer sold', { kind: 'sold', good: 'beer' }, [{ kind: 'payWithTokens' }], 'You may pay salaries with food and drinks (1 item = 1 salary; not coffee).'),
  ms('ketchup:first_coke_sold', 'First soda sold', { kind: 'sold', good: 'soft_drink' }, [{ kind: 'freezer', capacity: 10 }], 'You may keep up to 10 items in Cleanup (not coffee).'),
  ms('ketchup:first_recruiting_girl_used', 'First recruiting girl used', { kind: 'used', employees: ['recruiting_girl'] }, [{ kind: 'gainEmployees', employees: [{ id: 'executive_vp', count: 1 }], trainableThisTurn: false, salaryFree: true }], 'Take an Executive VP to the beach; never pay its salary.', { removeAfterRound: 2 }),
  ms('ketchup:first_trainer_used', 'First trainer used', { kind: 'used', employees: ['trainer'] }, [{ kind: 'gainEmployees', employees: [{ id: 'trainer', count: 1 }], trainableThisTurn: false }, { kind: 'noForcedFiring' }], 'Take a Trainer to the beach. You never have to fire employees you cannot pay.', { removeAfterRound: 2 }),
  ms('ketchup:first_discount_manager_used', 'First discount manager used', { kind: 'used', employees: ['discount_manager'] }, [{ kind: 'bankBurn', amount: 100, minDiscount: 3 }], 'Each turn you discount by $3 or more, $100 leaves the bank at the end of Restructuring.'),
  ms('ketchup:first_house_built', 'First house built', { kind: 'houseBuilt' }, [{ kind: 'stackTraining' }], 'You may stack training actions on one employee.'),
  ms('ketchup:first_new_restaurant', 'First new restaurant', { kind: 'restaurantPlaced' }, [{ kind: 'freeMailbox' }], 'Build a free eternal mailbox in the new restaurant\'s block, any good.'),
  ms('ketchup:first_waitress_used', 'First waitress used', { kind: 'used', employees: ['waitress'] }, [{ kind: 'salaryPerEmployee', amount: 3 }], 'Your salaries are $3 per employee instead of $5.'),
  ms('ketchup:first_cart_operator_used', 'First cart operator used', { kind: 'used', employees: ['cart_operator'] }, [{ kind: 'buyerPerSourceOverride', values: { cart_operator: 4, zeppelin_pilot: 4, truck_driver: 6 } }], 'Cart operators and zeppelins collect 4 per source, truck drivers 6.'),
];

interface NewMilestonesState {
  /** First pizza sold: pizza radios still owed this round, per player. */
  pizza: Record<PlayerId, { round: number; left: number }>;
  /** First beer sold: goods declared at `payday.confirm`. */
  tokens: Record<PlayerId, FoodCounts>;
}

const state = (s: GameState) => moduleState<NewMilestonesState>(s, ID, () => ({ pizza: {}, tokens: {} }));
const has = (s: GameState, p: PlayerId, id: MilestoneId) => hasMilestone(s, p, id);

// ---------------------------------------------------------------------------
// Pizza radios
// ---------------------------------------------------------------------------

function houseTiles(s: GameState, houseId: string): Set<string> {
  const h = s.board.houses[houseId];
  return new Set((h?.cells ?? []).map((c) => tileOf(s.board, c)));
}

function pizzaRadioProblem(s: GameState, houseId: string, x: number, y: number): string | null {
  if (!RADIOS.some((n) => s.marketingTiles.includes(n))) return 'No radio tile left';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad coordinates';
  const c = { x, y };
  if (!onMap(s.board, c) || !allEmpty(s.board, [c])) return 'Radios go on empty squares';
  if (!touchesRoad(s.board, [c])) return 'The radio must be next to a road';
  if (!houseTiles(s, houseId).has(tileOf(s.board, c))) return 'The radio must be on the tile of that house';
  return null;
}

function pizzaRadioPlacements(s: GameState, houseId: string): Extract<Placement, { kind: 'pizzaRadio' }>[] {
  const out: Extract<Placement, { kind: 'pizzaRadio' }>[] = [];
  for (let y = 0; y < s.board.h; y++) for (let x = 0; x < s.board.w; x++) if (!pizzaRadioProblem(s, houseId, x, y)) out.push({ kind: 'pizzaRadio', x, y });
  return out;
}

registerChoiceKind('pizzaRadio', (s, c) => c.kind === 'pizzaRadio' && pizzaRadioPlacements(s, c.houseId).length > 0);

// ---------------------------------------------------------------------------
// Free mailbox
// ---------------------------------------------------------------------------

/** The mailbox tile (smallest available first) that fits at (x, y) in the restaurant's block, or a problem. */
function freeMailboxTile(s: GameState, restaurantId: string, x: number, y: number): { number: number; w: number; h: number } | string {
  const r = s.board.restaurants[restaurantId];
  if (!r) return 'That restaurant is gone';
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'Bad coordinates';
  const tiles = contentFor(s.config.modules).marketingTiles;
  const free = MAILBOXES.filter((n) => s.marketingTiles.includes(n) && tiles[n]?.kind === 'mailbox');
  if (!free.length) return 'No mailbox tile left';
  const block = mailboxArea(s.board, restaurantCells(r.x, r.y));
  for (const n of free) {
    const t = tiles[n];
    if (!t) continue;
    for (const [w, h] of t.w === t.h ? [[t.w, t.h]] : [[t.w, t.h], [t.h, t.w]]) {
      const cells = rect(x, y, w as number, h as number);
      if (cells.every((c) => onMap(s.board, c) && block.has(cellKey(c))) && allEmpty(s.board, cells) && touchesRoad(s.board, cells)) return { number: n, w: w as number, h: h as number };
    }
  }
  return 'The mailbox must be on empty squares next to a road in the new restaurant\'s block';
}

function freeMailboxPlacements(s: GameState, restaurantId: string): Extract<Placement, { kind: 'freeMailbox' }>[] {
  const out: Extract<Placement, { kind: 'freeMailbox' }>[] = [];
  for (let y = 0; y < s.board.h; y++) for (let x = 0; x < s.board.w; x++) if (typeof freeMailboxTile(s, restaurantId, x, y) !== 'string') out.push({ kind: 'freeMailbox', x, y });
  return out;
}

registerChoiceKind('freeMailbox', (s, c) => c.kind === 'freeMailbox' && freeMailboxPlacements(s, c.restaurantId).length > 0);

const marketable = (s: GameState, good: FoodId) => {
  const f = FOODS.find((x) => x.id === good);
  return Boolean(f?.marketable && (f.module === 'base' || s.config.modules.includes(f.module)));
};

// ---------------------------------------------------------------------------
// Second campaign (First campaign manager used)
// ---------------------------------------------------------------------------

function secondCampaignDef(s: GameState, camp: Campaign) {
  const content = contentFor(s.config.modules);
  const p = s.players[camp.owner];
  return (p && camp.marketeer ? defOf(content, p, camp.marketeer) : undefined) ?? content.employees.campaign_manager;
}

function secondCampaignProblem(s: GameState, choice: Extract<PendingChoice, { kind: 'secondCampaign' }>, tileNumber: number, placement: CampaignPlacement): string | null {
  const camp = s.board.campaigns[choice.campaignId];
  if (!camp) return 'The first campaign is gone';
  const def = secondCampaignDef(s, camp);
  if (!def) return 'No campaign manager';
  return campaignPlacementProblem(s, choice.player, def, camp.kind, tileNumber, placement);
}

function secondCampaignPlacements(s: GameState, choice: Extract<PendingChoice, { kind: 'secondCampaign' }>, limit = Infinity): Extract<Placement, { kind: 'campaign' }>[] {
  const camp = s.board.campaigns[choice.campaignId];
  const out: Extract<Placement, { kind: 'campaign' }>[] = [];
  if (!camp) return out;
  const def = secondCampaignDef(s, camp);
  if (!def || def.ability.kind !== 'marketing') return out;
  const field = def.ability.range === 'unlimited' ? undefined : rangeField(s, choice.player);
  if (typeof field === 'string') return out;
  const tiles = contentFor(s.config.modules).marketingTiles;
  for (const n of s.marketingTiles) {
    const t = tiles[n];
    if (!t || t.kind !== camp.kind || t.kind === 'airplane') continue;
    for (const [w, h] of t.w === t.h ? [[t.w, t.h]] : [[t.w, t.h], [t.h, t.w]]) {
      for (let y = 0; y + (h as number) <= s.board.h; y++) {
        for (let x = 0; x + (w as number) <= s.board.w; x++) {
          const placement = { kind: 'board' as const, x, y, w: w as number, h: h as number };
          if (!allEmpty(s.board, rect(x, y, w as number, h as number))) continue;
          if (campaignPlacementProblem(s, choice.player, def, camp.kind, n, placement, undefined, field)) continue;
          out.push({ kind: 'campaign', campaignKind: camp.kind, tileNumber: n, placement });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

registerChoiceKind('secondCampaign', (s, c) => c.kind === 'secondCampaign' && secondCampaignPlacements(s, c, 1).length > 0);

// ---------------------------------------------------------------------------
// Placing module campaigns
// ---------------------------------------------------------------------------

function addCampaign(ctx: HookContext, camp: Omit<Campaign, 'id'>): Campaign {
  const s = ctx.state;
  const id = ctx.id('campaign');
  const full: Campaign = { ...camp, id };
  if (full.placement.kind === 'board') paint(s.board, rect(full.placement.x, full.placement.y, full.placement.w, full.placement.h), 'campaign', id);
  s.board.campaigns[id] = full;
  if (full.number !== null) s.marketingTiles = s.marketingTiles.filter((n) => n !== full.number);
  ctx.emit({ type: 'campaignPlaced', player: full.owner, campaign: JSON.parse(JSON.stringify(full)) as Campaign });
  return full;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function onCampaignPlaced(ctx: HookContext, player: PlayerId, camp: Campaign): void {
  const s = ctx.state;
  if (camp.source !== 'marketeer' || !camp.marketeer) return;
  const emp = s.players[player]?.employees[camp.marketeer]?.employeeId;
  if (!emp) return;
  if (MARKETEERS.includes(emp)) awardMilestone(ctx, player, 'ketchup:first_marketeer_used');
  if (emp === 'marketing_trainee') awardMilestone(ctx, player, 'ketchup:first_marketing_trainee_used');
  if (emp === 'campaign_manager' && awardMilestone(ctx, player, 'ketchup:first_campaign_manager_used') && camp.kind !== 'airplane') {
    pushChoice(ctx, { kind: 'secondCampaign', player, campaignId: camp.id, optional: true });
  }
  if (emp === 'brand_manager') awardMilestone(ctx, player, 'ketchup:first_brand_manager_used');
  if (emp === 'brand_director') awardMilestone(ctx, player, 'ketchup:first_brand_director_used');
}

const SOLD: Partial<Record<FoodId, MilestoneId>> = {
  burger: 'ketchup:first_burger_sold',
  pizza: 'ketchup:first_pizza_sold',
  lemonade: 'ketchup:first_lemonade_sold',
  beer: 'ketchup:first_beer_sold',
  soft_drink: 'ketchup:first_coke_sold',
};

function onSale(ctx: HookContext, player: PlayerId, houseId: string, goods: FoodId[]): void {
  const s = ctx.state;
  for (const g of goods) {
    const id = SOLD[g];
    if (!id) continue;
    if (awardMilestone(ctx, player, id) && id === 'ketchup:first_pizza_sold') state(s).pizza[player] = { round: s.round, left: 3 };
  }
  if (!goods.includes('pizza')) return;
  const owed = peekState<NewMilestonesState>(s, ID)?.pizza[player];
  if (!owed || owed.round !== s.round || owed.left <= 0) return;
  owed.left -= 1;
  pushChoice(ctx, { kind: 'pizzaRadio', player, houseId, optional: false });
}

function onRecruitingGirlClaimed(ctx: HookContext, player: PlayerId): void {
  // The tray's Executive VP is taken by base code; if the tray has none, take one from the box.
  const s = ctx.state;
  if ((s.supply.executive_vp ?? 0) > 0) return;
  const p = s.players[player];
  if (!p) return;
  const uid = ctx.id('card');
  p.employees[uid] = { uid, employeeId: 'executive_vp', acquiredRound: s.round, salaryFree: true };
  p.beach.push(uid);
  ctx.emit({ type: 'employeeGained', player, uid, employeeId: 'executive_vp', reason: 'ketchup:first_recruiting_girl_used' });
}

function onCartHaul(ctx: HookContext, player: PlayerId, uid: string, collected: { sourceId: string | null; drink: FoodId; count: number }[]): void {
  const s = ctx.state;
  const p = s.players[player];
  const emp = p?.employees[uid]?.employeeId;
  if (!p || emp !== 'cart_operator') return;
  // KX p17: a card is "used" only if one of its effects resolves: a haul that collects nothing is not.
  if (!collected.some((c) => c.count > 0)) return;
  if (!awardMilestone(ctx, player, 'ketchup:first_cart_operator_used')) return;
  // The triggering haul already uses the new per-source amount (DLX p19).
  const def = contentFor(s.config.modules).employees[emp];
  if (!def) return;
  const per = buyerStats(s, player, def).perSource;
  const extra = collected.filter((c) => c.sourceId !== null && per > c.count).map((c) => ({ sourceId: c.sourceId, drink: c.drink as never, count: per - c.count }));
  if (!extra.length) return;
  for (const e of extra) p.inventory[e.drink as FoodId] = (p.inventory[e.drink as FoodId] ?? 0) + e.count;
  ctx.emit({ type: 'drinksBought', player, uid, path: [], collected: extra, reason: 'ketchup:first_cart_operator_used' });
}

/**
 * Total discount from price cards at work (positive number of dollars), as Dinnertime applies it:
 * under a Night Shift Manager a salary-free price card counts twice (KX p22, Q-K9).
 */
function discountAtWork(s: GameState, p: PlayerState): number {
  const night = nightShiftActive(s, p.id);
  return -workDefs(s, p).reduce((a, x) => {
    if (x.def.ability.kind !== 'price' || x.def.ability.delta >= 0) return a;
    return a + x.def.ability.delta * (night && !x.def.salary ? 2 : 1);
  }, 0);
}

function stockOf(p: PlayerState): FoodCounts {
  const out: FoodCounts = { ...p.inventory };
  for (const [g, n] of Object.entries(p.freezer) as [FoodId, number][]) out[g] = (out[g] ?? 0) + n;
  return out;
}

function takeTokens(p: PlayerState, goods: FoodCounts, max: number): void {
  let left = max;
  for (const [g, n0] of Object.entries(goods) as [FoodId, number][]) {
    let n = Math.min(n0, left);
    left -= n;
    for (const src of [p.inventory, p.freezer]) {
      const take = Math.min(src[g] ?? 0, n);
      if (take > 0) {
        src[g] = (src[g] ?? 0) - take;
        if (src[g] === 0) delete src[g];
        n -= take;
      }
    }
  }
}

const tokenCount = (t: FoodCounts | undefined) => Object.values(t ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0);

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const NEW_MILESTONES_MODULE: GameModule = {
  id: ID,
  name: 'New Milestones',
  description: 'Seventeen new milestones replace the base ones.',
  conflicts: ['ketchup:hardChoices'],
  content: { milestones: [...NEW_MILESTONES], replacesBaseMilestones: true },
  actions: {
    'ketchup:newMilestones.placePizzaRadio': {
      validate(s, action) {
        const a = action as NewMilestonesPlacePizzaRadio;
        const head = headChoice(s, a.playerId, a.choiceId, 'pizzaRadio');
        if (isRejected(head)) return head;
        const problem = pizzaRadioProblem(s, head.houseId, a.x, a.y);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as NewMilestonesPlacePizzaRadio;
        const s = ctx.state;
        const number = RADIOS.find((n) => s.marketingTiles.includes(n)) as number;
        const radio = addCampaign(ctx, {
          owner: a.playerId,
          number,
          kind: 'radio',
          goods: ['pizza'],
          placement: { kind: 'board', x: a.x, y: a.y, w: 1, h: 1 },
          remaining: 2,
          eternal: false,
          marketeer: null,
          source: 'pizzaRadio',
          linked: [],
          placedRound: s.round,
        });
        // Q-K14: never eternal, even with First brand director used (base `applyEternal` reacts to
        // every `campaignPlaced` of the owner, so undo it here).
        radio.eternal = false;
        radio.remaining = 2;
        resolveHead(ctx, a.choiceId);
        return { undoable: true };
      },
    },
    'ketchup:newMilestones.placeFreeMailbox': {
      validate(s, action) {
        const a = action as NewMilestonesPlaceFreeMailbox;
        const head = headChoice(s, a.playerId, a.choiceId, 'freeMailbox');
        if (isRejected(head)) return head;
        if (!marketable(s, a.good)) return reject('ILLEGAL', 'That good cannot be marketed');
        const tile = freeMailboxTile(s, head.restaurantId, a.x, a.y);
        return typeof tile === 'string' ? reject('ILLEGAL_PLACEMENT', tile) : OK;
      },
      apply(ctx, action) {
        const a = action as NewMilestonesPlaceFreeMailbox;
        const s = ctx.state;
        const head = s.pending[0];
        if (head?.kind !== 'freeMailbox') return { undoable: false };
        const tile = freeMailboxTile(s, head.restaurantId, a.x, a.y);
        if (typeof tile === 'string') return { undoable: false };
        addCampaign(ctx, {
          owner: a.playerId,
          number: tile.number,
          kind: 'mailbox',
          goods: [a.good],
          placement: { kind: 'board', x: a.x, y: a.y, w: tile.w, h: tile.h },
          remaining: 1,
          eternal: true,
          marketeer: null,
          source: 'freeMailbox',
          linked: [],
          placedRound: s.round,
        });
        resolveHead(ctx, a.choiceId);
        return { undoable: true };
      },
    },
    'ketchup:newMilestones.placeSecondCampaign': {
      validate(s, action) {
        const a = action as NewMilestonesPlaceSecondCampaign;
        const head = headChoice(s, a.playerId, a.choiceId, 'secondCampaign');
        if (isRejected(head)) return head;
        const problem = secondCampaignProblem(s, head, a.tileNumber, a.placement);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as NewMilestonesPlaceSecondCampaign;
        const s = ctx.state;
        const head = s.pending[0];
        const first = head?.kind === 'secondCampaign' ? s.board.campaigns[head.campaignId] : undefined;
        const p = s.players[a.playerId];
        if (!first || !p) return { undoable: false };
        const eternal = first.eternal || launchesEternal(ctx, a.playerId, first.kind);
        const second = addCampaign(ctx, {
          owner: a.playerId,
          number: a.tileNumber,
          kind: first.kind,
          goods: [...first.goods],
          placement: JSON.parse(JSON.stringify(a.placement)) as CampaignPlacement,
          remaining: eternal ? 1 : first.remaining,
          eternal,
          marketeer: first.marketeer,
          source: 'marketeer',
          linked: [first.id],
          placedRound: s.round,
        });
        first.linked.push(second.id);
        if (first.marketeer) p.busy[first.marketeer] = [...(p.busy[first.marketeer] ?? []), second.id];
        s.turn?.campaignsPlaced.push(second.id);
        resolveHead(ctx, a.choiceId);
        return { undoable: true };
      },
    },
  },
  hooks: {
    onEvent(ctx, event) {
      const s = ctx.state;
      switch (event.type) {
        case 'campaignPlaced':
          return onCampaignPlaced(ctx, event.player, event.campaign);
        case 'employeeHired':
          if (s.players[event.player]?.employees[event.by]?.employeeId === 'recruiting_girl') awardMilestone(ctx, event.player, 'ketchup:first_recruiting_girl_used');
          return;
        case 'milestoneClaimed':
          if (event.milestoneId === 'ketchup:first_recruiting_girl_used') onRecruitingGirlClaimed(ctx, event.player);
          return;
        case 'employeeTrained': {
          if (event.by.some((u) => s.players[event.player]?.employees[u]?.employeeId === 'trainer')) awardMilestone(ctx, event.player, 'ketchup:first_trainer_used');
          // First lemonade sold: a card trained at work may act only if the old card had not acted.
          const p = s.players[event.player];
          const turn = s.turn;
          const card = p?.employees[event.uid];
          if (!p || !turn || !card || cardPlace(p, event.uid) !== 'work') return;
          const def = contentFor(s.config.modules).employees[card.employeeId];
          if (turn.used.includes(event.uid) || !def) turn.uses[event.uid] = 0;
          else {
            const out = pipe(ctx, 'cardUses', { uid: event.uid, uses: baseUses(def) }, { player: event.player, card, def });
            turn.uses[event.uid] = out.uses;
          }
          return;
        }
        case 'drinksBought':
          return onCartHaul(ctx, event.player, event.uid, event.collected);
        case 'tipsPaid':
          if (event.waitresses > 0) awardMilestone(ctx, event.player, 'ketchup:first_waitress_used');
          return;
        case 'houseBuilt':
          awardMilestone(ctx, event.player, 'ketchup:first_house_built');
          return;
        case 'restaurantPlaced':
          if (s.phase.kind === 'working' && awardMilestone(ctx, event.player, 'ketchup:first_new_restaurant')) {
            pushChoice(ctx, { kind: 'freeMailbox', player: event.player, restaurantId: event.restaurantId, optional: true }); // KX p19 "allows you to" (Q-K36)
          }
          return;
        case 'sale':
          return onSale(ctx, event.player, event.houseId, event.lines.filter((l) => l.count > 0).map((l) => l.good));
        case 'demandPlaced': {
          const camp = event.campaignId ? s.board.campaigns[event.campaignId] : undefined;
          if (!camp || camp.source !== 'marketeer' || !has(s, camp.owner, 'ketchup:first_marketeer_used')) return;
          const n = event.tokens.filter((t) => t.by === camp.owner).length;
          if (n > 0) payFromBank(ctx, camp.owner, 5 * n, 'First marketeer used');
          return;
        }
        case 'structuresRevealed':
          // First discount manager used: $100 out of the game at the end of Restructuring (Q-K5).
          for (const id of s.turnOrder) {
            const p = s.players[id];
            if (!p || p.bankrupt || !hasMilestoneBefore(s, id, 'ketchup:first_discount_manager_used')) continue;
            if (discountAtWork(s, p) >= 3) burnFromBank(ctx, id, 100);
          }
          return;
        case 'salaryPaid': {
          const st = peekState<NewMilestonesState>(s, ID);
          const declared = st?.tokens[event.player];
          const p = s.players[event.player];
          if (!st || !declared || !p) return;
          const used = Math.min(tokenCount(declared), salariedCount(s, event.player));
          takeTokens(p, declared, used);
          delete st.tokens[event.player];
          return;
        }
        default:
          return;
      }
    },
    onPhaseEnter(ctx, phase) {
      const s = ctx.state;
      if (phase.kind === 'dinnertime') {
        for (const id of s.turnOrder) {
          const p = s.players[id];
          if (!p || p.bankrupt || !workDefs(s, p).some((x) => x.def.id === 'discount_manager')) continue;
          // KX p19: "each turn (including this one)" — this turn's Restructuring is over, so the
          // claiming turn's $100 leaves the bank now (Q-K5).
          if (awardMilestone(ctx, id, 'ketchup:first_discount_manager_used') && discountAtWork(s, p) >= 3) burnFromBank(ctx, id, 100);
        }
      }
      if (phase.kind === 'payday') state(s).tokens = {};
    },
    actionProblem(problem, ctx, { action }) {
      if (problem) return problem;
      const s = ctx.state;
      if (action.type === 'payday.confirm' && action.tokens && tokenCount(action.tokens) > 0) return tokenProblem(s, action);
      if (action.type === 'work.train' && action.trainerUid === action.targetUid && cardPlace(s.players[action.playerId] as PlayerState, action.targetUid) === 'work') {
        return 'A card cannot train itself';
      }
      return null;
    },
    // Recorded before the reducer applies `payday.confirm`: the last confirmation settles salaries
    // during dispatch, so the goods must already count by then.
    beforeAction(ctx, action) {
      if (action.type !== 'payday.confirm') return;
      if (action.tokens && tokenCount(action.tokens) > 0) {
        const clean: FoodCounts = {};
        for (const [g, n] of Object.entries(action.tokens) as [FoodId, number][]) if (n > 0) clean[g] = n;
        state(ctx.state).tokens[action.playerId] = clean;
      }
      obligatoryTokens(ctx.state, action.playerId);
    },
    campaignGoods(n, ctx, { player, def, kind }) {
      return def.id === 'brand_manager' && kind === 'airplane' && milestoneAvailable(ctx.state, player, 'ketchup:first_brand_manager_used') ? Math.max(n, 2) : n;
    },
    cardSalaried(salaried, ctx, { player, uid }) {
      if (salaried) return true;
      const s = ctx.state;
      const p = s.players[player];
      const card = p?.employees[uid];
      if (!p || !card || card.salaryFree || card.employeeId !== 'brand_director' || !has(s, player, 'ketchup:first_brand_director_used')) return salaried;
      // An eternal radio's brand director keeps its salary (DLX p19).
      return (p.busy[uid] ?? []).some((c) => s.board.campaigns[c]?.kind === 'radio' && s.board.campaigns[c]?.eternal);
    },
    salaryTotal(bd, ctx, { player }) {
      const s = ctx.state;
      const rate = has(s, player, 'ketchup:first_waitress_used') ? 3 : bd.rate;
      const discounts = [...bd.discounts];
      const declared = peekState<NewMilestonesState>(s, ID)?.tokens[player];
      const tokens = Math.min(tokenCount(declared), bd.salaried);
      if (tokens > 0 && has(s, player, 'ketchup:first_beer_sold')) discounts.push({ source: 'ketchup:first_beer_sold', amount: tokens * rate });
      if (rate === bd.rate && discounts.length === bd.discounts.length) return bd;
      const off = discounts.reduce((a, d) => a + d.amount, 0);
      return { ...bd, rate, discounts, total: Math.max(0, bd.salaried * rate - off) };
    },
    forcedFiring: (must, ctx, { player }) => must && !has(ctx.state, player, 'ketchup:first_trainer_used'),
    // First beer sold: a player with nobody to fire may still pay salaries with goods, so ask.
    paydayDecision: (ask, ctx, { player }) => ask || (has(ctx.state, player, 'ketchup:first_beer_sold') && salariedCount(ctx.state, player) > 0 && payableStock(ctx.state, player) > 0),
    freezerCapacity: (cap, ctx, { player }) => (has(ctx.state, player, 'ketchup:first_coke_sold') ? Math.max(cap, 10) : cap),
    trainAtWork(ok, ctx, { player, uid, toEmployeeId }) {
      if (ok) return ok;
      const s = ctx.state;
      const p = s.players[player];
      if (!p || uid === p.structure.ceo || !has(s, player, 'ketchup:first_lemonade_sold')) return false;
      const content = contentFor(s.config.modules);
      const from = defOf(content, p, uid);
      const to = content.employees[toEmployeeId];
      return Boolean(from && to && from.colour === to.colour);
    },
    dinnerCandidates(cands, ctx) {
      return cands.map((c) => (has(ctx.state, c.player, 'ketchup:first_marketeer_used') ? { ...c, score: c.score - 2 } : c));
    },
    legalActions(list, ctx, { player }) {
      const head = ctx.state.pending[0];
      if (!head || head.player !== player) return list;
      const extra: LegalAction[] = [];
      if (head.kind === 'pizzaRadio') extra.push({ kind: 'placement', label: 'Place a pizza radio', actionType: 'ketchup:newMilestones.placePizzaRadio', spec: { kind: 'pizzaRadio', choiceId: head.id } });
      if (head.kind === 'freeMailbox') extra.push({ kind: 'placement', label: 'Place your free mailbox', actionType: 'ketchup:newMilestones.placeFreeMailbox', spec: { kind: 'freeMailbox', choiceId: head.id } });
      if (head.kind === 'secondCampaign') extra.push({ kind: 'placement', label: 'Place a second campaign tile', actionType: 'ketchup:newMilestones.placeSecondCampaign', spec: { kind: 'campaign', choiceId: head.id } });
      return [...list, ...extra];
    },
    legalPlacements(list, ctx, { player, spec }) {
      const s = ctx.state;
      const head = s.pending[0];
      if (!head || head.player !== player || (spec.choiceId && spec.choiceId !== head.id)) return list;
      if (spec.kind === 'pizzaRadio' && head.kind === 'pizzaRadio') return [...list, ...pizzaRadioPlacements(s, head.houseId)];
      if (spec.kind === 'freeMailbox' && head.kind === 'freeMailbox') return [...list, ...freeMailboxPlacements(s, head.restaurantId)];
      if (spec.kind === 'campaign' && head.kind === 'secondCampaign') return [...list, ...secondCampaignPlacements(s, head)];
      return list;
    },
  },
};

function salariedCount(s: GameState, player: PlayerId): number {
  return salariedCards(s, contentFor(s.config.modules), player).length;
}

/** Goods in stock (inventory + freezer) that can pay salaries (not coffee). */
function payableStock(s: GameState, player: PlayerId): number {
  const p = s.players[player];
  if (!p) return 0;
  return (Object.entries(stockOf(p)) as [FoodId, number][]).reduce((a, [g, n]) => a + (FOODS.find((f) => f.id === g)?.payableAsSalary ? n : 0), 0);
}

/**
 * KX p19 (First beer sold + First trainer used): a player who does not have to fire and lacks the
 * cash is "obliged to pay your employees using the item counters" "if able". Goods the player did
 * not declare are added to the declared ones until the salaries are covered (burger, pizza, then
 * drinks; never coffee). Cash cannot change between the confirmation and the salary step.
 */
function obligatoryTokens(s: GameState, player: PlayerId): void {
  const p = s.players[player];
  if (!p || !has(s, player, 'ketchup:first_beer_sold') || !has(s, player, 'ketchup:first_trainer_used')) return;
  const content = contentFor(s.config.modules);
  const bd = salaryBreakdown(s, content, player);
  const shortfall = bd.total - Math.max(0, p.cash);
  if (shortfall <= 0 || bd.rate <= 0) return;
  const st = state(s);
  const declared: FoodCounts = { ...(st.tokens[player] ?? {}) };
  let need = Math.min(Math.ceil(shortfall / bd.rate), bd.salaried - tokenCount(declared));
  const stock = stockOf(p);
  for (const f of FOODS) {
    if (need <= 0) break;
    if (!f.payableAsSalary) continue;
    const free = (stock[f.id] ?? 0) - (declared[f.id] ?? 0);
    const n = Math.min(free, need);
    if (n <= 0) continue;
    declared[f.id] = (declared[f.id] ?? 0) + n;
    need -= n;
  }
  if (tokenCount(declared) > 0) st.tokens[player] = declared;
}

function tokenProblem(s: GameState, a: PaydayConfirm): string | null {
  const p = s.players[a.playerId];
  if (!p) return 'Unknown player';
  if (!has(s, a.playerId, 'ketchup:first_beer_sold')) return 'Paying salaries with goods needs "First beer sold"';
  const stock = stockOf(p);
  for (const [g, n] of Object.entries(a.tokens ?? {}) as [FoodId, number][]) {
    if (!Number.isInteger(n) || n < 0) return `Bad count for ${g}`;
    if (n === 0) continue;
    if (!FOODS.find((f) => f.id === g)?.payableAsSalary) return `${g} cannot pay salaries`;
    if (n > (stock[g] ?? 0)) return `Only ${stock[g] ?? 0} ${g} in stock`;
  }
  return null;
}
