/**
 * Phase 4 — Dinnertime (base.md §7; DLX p26–28).
 *
 * Start: "First to Lower Prices" for every chain with a pricing/discount/luxuries manager at work.
 * Houses in ascending number. For each house with demand:
 *  - candidates = chains with an OPEN restaurant road-connected to the house (or its garden) that
 *    can deliver the WHOLE order from stock (no partial sales);
 *  - lowest (unit price + distance) wins; distance = tile borders crossed (base.md §14);
 *  - ties: most waitresses at work, then earlier in turn order;
 *  - income per item = unit price ×2 with a garden, + per-item milestone bonuses (not doubled).
 * After all houses: waitress tips ($3, $5 with First Waitress), then CFO +50% of everything
 * earned this Dinnertime, rounded up. Bank breaks are handled as payments happen (bank.ts); the
 * game ends here after the last break.
 *
 * Module pipelines: unitPrice (pricing.ts), houseDistance, dinnerCandidates, saleRevenue, tips.
 */
import type { MilestoneDef } from '../types/content.js';
import type { DinnerCandidate, HookContext, SaleBreakdown } from '../types/module.js';
import type { FoodCounts, FoodId, GameState, House, PlayerId, PlayerState } from '../types/index.js';
import { FOODS } from '../content/foods.js';
import { BASE_MILESTONES } from '../content/milestones.js';
import { endGameIfBankBroken, payFromBank, payToBank } from './bank.js';
import { checkCashMilestones, checkStartOfDinnertime } from './milestones.js';
import { defsAtWork, hasMilestone, hasMilestoneBefore, runPipeline, unitPrice } from './pricing.js';
import { chainHouseDistance } from '../map/pathfinding.js';

/** Phase 4: resolve all sales, CFO, bank payouts; may end the game. Emits events via ctx.emit. */
export function runDinnertime(ctx: HookContext): void {
  const s = ctx.state;
  const houses = Object.values(s.board.houses)
    .sort((a, b) => a.order - b.order)
    .map((h) => h.id);
  s.phase = { kind: 'dinnertime', houses, idx: 0 };
  s.awaiting = { kind: 'none', players: [] };
  for (const id of s.turnOrder) {
    const p = s.players[id];
    if (p) p.earningsThisRound = 0;
  }

  checkStartOfDinnertime(ctx);

  for (let i = 0; i < houses.length; i++) {
    s.phase.idx = i;
    const house = s.board.houses[houses[i] as string];
    if (house) resolveHouse(ctx, house);
  }
  s.phase.idx = houses.length;

  payTips(ctx);
  payCfo(ctx);
  for (const id of s.turnOrder) checkCashMilestones(ctx, id);
  endGameIfBankBroken(ctx);
}

// ---------------------------------------------------------------------------
// Houses
// ---------------------------------------------------------------------------

function demandCounts(house: House): FoodCounts {
  const out: FoodCounts = {};
  for (const t of house.demand) out[t.good] = (out[t.good] ?? 0) + 1;
  return out;
}

/** Stock = inventory + freezer (frozen items stay in stock, base.md §10). */
function stock(p: PlayerState): FoodCounts {
  const out: FoodCounts = { ...p.inventory };
  for (const [g, n] of Object.entries(p.freezer) as [FoodId, number][]) out[g] = (out[g] ?? 0) + n;
  return out;
}

function canDeliver(p: PlayerState, items: FoodCounts): boolean {
  const st = stock(p);
  return (Object.entries(items) as [FoodId, number][]).every(([g, n]) => (st[g] ?? 0) >= n);
}

function takeFromStock(p: PlayerState, items: FoodCounts): void {
  for (const [g, n0] of Object.entries(items) as [FoodId, number][]) {
    let n = n0;
    for (const src of [p.inventory, p.freezer]) {
      const have = src[g] ?? 0;
      const take = Math.min(have, n);
      if (take > 0) {
        if (have - take > 0) src[g] = have - take;
        else delete src[g];
        n -= take;
      }
    }
  }
}

/** Number of waitresses at work (tie-break and tips). */
function waitressesAtWork(ctx: HookContext, p: PlayerState): number {
  return defsAtWork(ctx.content, p).filter((x) => x.def.ability.kind === 'waitress').length;
}

/** Base candidates: every non-bankrupt chain with an open restaurant connected to the house. */
export function baseCandidates(ctx: HookContext, house: House): DinnerCandidate[] {
  const s = ctx.state;
  const items = demandCounts(house);
  const out: DinnerCandidate[] = [];
  for (const player of s.turnOrder) {
    const p = s.players[player];
    if (!p || p.bankrupt) continue;
    // Nearest OPEN restaurant connected by road (COMING SOON does not count, base.md §7.2).
    const best = runPipeline(ctx, 'houseDistance', chainHouseDistance(s.board, player, house), { player, house });
    if (!best) continue;
    const price = unitPrice(ctx, player);
    out.push({
      player,
      restaurantId: best.restaurantId,
      distance: best.distance,
      unitPrice: price,
      score: price + best.distance,
      waitresses: waitressesAtWork(ctx, p),
      movieStar: 0,
      tier: 0,
      items: { ...items },
    });
  }
  return out;
}

/** Winner order: tier, score, movie star, waitresses, turn order (base.md §7.5–7.7). */
export function compareCandidates(s: GameState, a: DinnerCandidate, b: DinnerCandidate): number {
  return (
    a.tier - b.tier ||
    a.score - b.score ||
    b.movieStar - a.movieStar ||
    b.waitresses - a.waitresses ||
    s.turnOrder.indexOf(a.player) - s.turnOrder.indexOf(b.player)
  );
}

function resolveHouse(ctx: HookContext, house: House): void {
  const s = ctx.state;
  if (house.demand.length === 0) return;
  const candidates = runPipeline(ctx, 'dinnerCandidates', baseCandidates(ctx, house), { house });
  // Full-order rule: only chains that can deliver everything (base.md §7.2b).
  const eligible = candidates.filter((c) => {
    const p = s.players[c.player];
    return p && !p.bankrupt && canDeliver(p, c.items);
  });
  ctx.emit({ type: 'houseConsidered', houseId: house.id, candidates: eligible.map((c) => c.player) });
  if (eligible.length === 0) {
    ctx.emit({ type: 'houseStayedHome', houseId: house.id });
    return;
  }
  const winner = [...eligible].sort((a, b) => compareCandidates(s, a, b))[0] as DinnerCandidate;
  const p = s.players[winner.player] as PlayerState;

  const bd = runPipeline(ctx, 'saleRevenue', baseRevenue(ctx, house, winner), { house, candidate: winner });
  takeFromStock(p, winner.items);
  // The demand is removed after the `sale` event so module hooks can see who created it (Ketchup §8).
  ctx.emit({
    type: 'sale',
    houseId: house.id,
    player: winner.player,
    restaurantId: winner.restaurantId,
    distance: winner.distance,
    unitPrice: winner.unitPrice,
    lines: bd.lines,
    bonuses: bd.bonuses,
    total: bd.total,
  });
  house.demand = [];
  p.earningsThisRound += bd.total;
  if (bd.total >= 0) payFromBank(ctx, winner.player, bd.total, `sale to house ${house.label}`);
  else payToBank(ctx, winner.player, -bd.total, `sale to house ${house.label}`);
  checkCashMilestones(ctx, winner.player);
}

const isDrink = (g: FoodId) => FOODS.find((f) => f.id === g)?.category === 'drink';

/**
 * base.md §7 "Selling": unit price × 2 with a garden per item, plus per-item milestone bonuses
 * ("First X Marketed" +$5), which are never doubled.
 */
export function baseRevenue(ctx: HookContext, house: House, c: DinnerCandidate): SaleBreakdown {
  const multiplier = house.garden ? 2 : 1;
  const lines = (Object.entries(c.items) as [FoodId, number][])
    .filter(([, n]) => n > 0)
    .map(([good, count]) => ({ good, count, each: c.unitPrice * multiplier }));
  const bonuses: SaleBreakdown['bonuses'] = [];
  for (const d of milestoneDefs(ctx)) {
    if (!hasMilestone(ctx.state, c.player, d.id)) continue;
    for (const e of d.effects) {
      if (e.kind !== 'saleBonus') continue;
      const n = lines.filter((l) => (e.good === 'anyDrink' ? isDrink(l.good) : l.good === e.good)).reduce((a, l) => a + l.count, 0);
      if (n > 0) bonuses.push({ source: d.id, amount: n * e.amount });
    }
  }
  const total = lines.reduce((a, l) => a + l.count * l.each, 0) + bonuses.reduce((a, b) => a + b.amount, 0);
  return { player: c.player, houseId: house.id, multiplier, lines, bonuses, total };
}

function milestoneDefs(ctx: HookContext): MilestoneDef[] {
  const list = Object.values(ctx.content.milestones).filter((d): d is MilestoneDef => Boolean(d));
  return list.length ? list : [...BASE_MILESTONES];
}

// ---------------------------------------------------------------------------
// After the houses
// ---------------------------------------------------------------------------

/** base.md §7 after-houses 1: $3 per waitress at work (+$2 with First Waitress), even with no sales. */
function payTips(ctx: HookContext): void {
  const s = ctx.state;
  for (const player of s.turnOrder) {
    const p = s.players[player];
    if (!p || p.bankrupt) continue;
    const extra = milestoneDefs(ctx)
      .filter((d) => hasMilestone(s, player, d.id))
      .flatMap((d) => d.effects)
      .reduce((a, e) => a + (e.kind === 'waitressTip' ? e.amount : 0), 0);
    let waitresses = 0;
    let amount = 0;
    for (const { def } of defsAtWork(ctx.content, p)) {
      if (def.ability.kind !== 'waitress') continue;
      waitresses += 1;
      amount += def.ability.tip + extra;
    }
    ({ waitresses, amount } = runPipeline(ctx, 'tips', { waitresses, amount }, { player }));
    if (waitresses === 0 && amount === 0) continue;
    ctx.emit({ type: 'tipsPaid', player, waitresses, amount });
    p.earningsThisRound += amount;
    payFromBank(ctx, player, amount, 'waitress tips');
    checkCashMilestones(ctx, player);
  }
}

/**
 * base.md §7 after-houses 2: a CFO at work — or the CEO with "First to Have $100" earned in an
 * earlier round — adds 50% of everything earned this Dinnertime, rounded up (Math.ceil; on
 * negative income this is toward zero, questions.md Q-B8).
 */
function payCfo(ctx: HookContext): void {
  const s = ctx.state;
  for (const player of s.turnOrder) {
    const p = s.players[player];
    if (!p || p.bankrupt) continue;
    const cfo = defsAtWork(ctx.content, p).find((x) => x.def.ability.kind === 'cfo')?.def.ability;
    const percent = cfo?.kind === 'cfo' ? cfo.percent : hasMilestoneBefore(s, player, 'first_100') ? 50 : 0;
    if (percent === 0 || p.earningsThisRound === 0) continue;
    const amount = Math.ceil((p.earningsThisRound * percent) / 100);
    if (amount === 0) continue;
    ctx.emit({ type: 'cfoBonus', player, amount });
    p.earningsThisRound += amount;
    if (amount > 0) payFromBank(ctx, player, amount, 'CFO bonus');
    else payToBank(ctx, player, -amount, 'CFO bonus');
    checkCashMilestones(ctx, player);
  }
}
