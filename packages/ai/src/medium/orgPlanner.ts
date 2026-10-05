/**
 * Org-chart planner (ai-strategy.md §3.2): matches owned cards against the archetype's build list,
 * then says what to hire and whom to train over the next rounds, within the slots the managers
 * provide and the salaries the chain can carry. Recomputed from the view on every call.
 */
import type { EmployeeId, FoodId, PlayerId, Uid } from '@fcm/engine';
import type { FoodCounts } from '@fcm/engine';
import { cardsAtWork, ceoSlotsFor, ownsUnique } from '@fcm/engine';
import { memo, type Ctx } from '../shared/ctx.js';
import { addCounts, capacityOf, formulaPrice, msOpen, ownedCards, salaryInfo, stockNow, type OwnedInfo } from '../shared/facts.js';
import { basePriceModel, houseViews, rivalStock, sellerOf, shadowDinner, structuresKnown, workedThisRound } from '../shared/market.js';
import { chooseArchetype, chooseFood, type ArchetypeInfo } from './archetype.js';

export interface MissingEntry {
  index: number;
  target: EmployeeId;
  /** An owned card that can be trained into the target. */
  inProgress?: { uid: Uid; path: EmployeeId[] };
  /** Entry-level card to hire and the training path from it (empty path = the target itself). */
  root?: { id: EmployeeId; path: EmployeeId[] };
  /** The target pays salary (and training into it starts paying). */
  salaried: boolean;
}

export interface OrgPlan {
  arch: ArchetypeInfo;
  /** Build index → owned uid covering it. */
  covered: Map<number, Uid>;
  missing: MissingEntry[];
  /** Entry-level cards to hire, best first (several copies possible). */
  hires: EmployeeId[];
  /** Owned cards to train, best first. */
  trains: { uid: Uid; path: EmployeeId[]; target: EmployeeId; priority: number; salaryAdded: boolean }[];
  /** Owned cards the plan has no use for. */
  extras: Uid[];
  /** More salaried cards the chain can carry next Payday. */
  salaryRoom: number;
  /** Cards that can be at work with the managers owned (best seating). */
  slotCapacity: number;
  /** Non-manager cards that want a slot next round (owned, not busy, plus planned hires). */
  slotDemand: number;
  /** Another management trainee would seat more cards. */
  mtHelps: boolean;
}

/** Shortest training path from `from` to `to` (excluding `from`), or null. */
export function trainPath(c: Ctx, from: EmployeeId, to: EmployeeId, maxSteps = 6): EmployeeId[] | null {
  if (from === to) return [];
  let frontier: { id: EmployeeId; path: EmployeeId[] }[] = [{ id: from, path: [] }];
  const seen = new Set<EmployeeId>([from]);
  for (let d = 0; d < maxSteps; d++) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const n of c.content.employees[f.id]?.trainsInto ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        const path = [...f.path, n];
        if (n === to) return path;
        next.push({ id: n, path });
      }
    }
    frontier = next;
  }
  return null;
}

/** Entry-level card that trains into `to` fastest (the card itself when entry-level). */
export function rootOf(c: Ctx, to: EmployeeId): { id: EmployeeId; path: EmployeeId[] } | null {
  const def = c.content.employees[to];
  if (!def) return null;
  if (def.entry) return { id: to, path: [] };
  let best: { id: EmployeeId; path: EmployeeId[] } | null = null;
  for (const e of Object.values(c.content.employees)) {
    if (!e?.entry || e.availability !== 'supply' || c.s.supply[e.id] === undefined) continue;
    const path = trainPath(c, e.id, to);
    if (path && (!best || path.length < best.path.length)) best = { id: e.id, path };
  }
  return best;
}

/** Can `pid` still obtain `to` (pile not empty, 1x not owned, CFO allowed)? */
export function obtainable(c: Ctx, to: EmployeeId, pid: PlayerId = c.me): boolean {
  const p = c.s.players[pid];
  if (!p) return false;
  if ((c.s.supply[to] ?? 0) <= 0) return false;
  if (ownsUnique(c.content, p, to)) return false;
  if (to === 'cfo' && p.milestones.first_100) return false;
  return true;
}

/** Most cards that can be at work: seat the managers that maximise slots (simpleStructure logic). */
export function slotCapacity(managerSlots: number[], ceoSlots: number): number {
  const sorted = [...managerSlots].sort((a, b) => b - a);
  let best = ceoSlots;
  for (let k = 1; k <= Math.min(ceoSlots, sorted.length); k++) {
    const cap = ceoSlots - k + sorted.slice(0, k).reduce((a, n) => a + n, 0);
    best = Math.max(best, cap);
  }
  return best;
}

/** Conservative income guess for salary affordability: last Dinnertime, or a floor early on. */
export function incomeGuess(c: Ctx, pid: PlayerId = c.me): number {
  return memo(c, `income:${pid}`, () => {
    const p = c.s.players[pid];
    if (!p) return 0;
    const last = Math.max(0, p.earningsThisRound);
    // This round's sales with the stock I have plus what my cards (at work if known) make.
    const cards = structuresKnown(c.s) ? cardsAtWork(p) : Object.keys(p.employees).filter((u) => !p.busy[u]);
    const stock: Record<PlayerId, FoodCounts> = {};
    for (const id of c.s.turnOrder) stock[id] = id === pid ? addCounts(stockNow(c.s, pid), capacityOf(c, pid, workedThisRound(c, pid) ? [] : cards, chooseFood(c, pid))) : rivalStock(c, id);
    const forecast = shadowDinner(c, basePriceModel(c), stock, houseViews(c), pid).income[pid] ?? 0;
    return Math.max(last, forecast);
  });
}

export function orgPlan(c: Ctx, me: PlayerId = c.me): OrgPlan {
  return memo(c, `org:${me}`, () => buildOrgPlan(c, me));
}

function buildOrgPlan(c: Ctx, me: PlayerId): OrgPlan {
  const s = c.s;
  const arch = chooseArchetype(c, me);
  const owned = ownedCards(s, c.content, me);
  const build = withExpansion(c, me, arch.build).map((id) => usableMarketeer(c, id));
  const covered = new Map<number, Uid>();
  const used = new Set<Uid>();
  // Pass 1: exact matches.
  build.forEach((target, i) => {
    const o = owned.find((x) => !used.has(x.uid) && x.id === target);
    if (o) {
      covered.set(i, o.uid);
      used.add(o.uid);
    }
  });
  // Pass 2: owned cards that train into an uncovered target (busy cards cannot be trained).
  const missing: MissingEntry[] = [];
  // Price cuts beyond a $3 unit price only give money away.
  let cutRoom = formulaPrice(s, c.content, me, owned.filter((o) => o.def.ability.kind === 'price').map((o) => o.uid)) - 3;
  build.forEach((target, i) => {
    if (covered.has(i)) return;
    const def = c.content.employees[target];
    if (!def) return;
    if (def.ability.kind === 'price' && def.ability.delta < 0) {
      if (cutRoom + def.ability.delta < 0) return;
      cutRoom += def.ability.delta;
    }
    let best: { o: OwnedInfo; path: EmployeeId[] } | null = null;
    for (const o of owned) {
      if (used.has(o.uid) || o.place === 'busy') continue;
      const path = trainPath(c, o.id, target);
      if (path && path.length && (!best || path.length < best.path.length)) best = { o, path };
    }
    if (best) {
      used.add(best.o.uid);
      missing.push({ index: i, target, inProgress: { uid: best.o.uid, path: best.path }, salaried: def.salary });
      return;
    }
    const root = rootOf(c, target);
    missing.push({ index: i, target, ...(root ? { root } : {}), salaried: def.salary });
  });

  const sal = salaryInfo(c, me);
  const income = incomeGuess(c, me);
  // first_train takes $15 off this Payday already: the first training pays for itself.
  const trainBonus = msOpen(s, me, 'first_train') ? 3 : 0;
  const salaryRoom = Math.floor((sal.cash + 0.6 * income - sal.owed) / 5) + trainBonus;

  // Trains: in-progress cards in build order; training into a salaried card costs salary room.
  const trains: OrgPlan['trains'] = [];
  let room = salaryRoom;
  for (const m of missing) {
    if (!m.inProgress) continue;
    const fromDef = c.content.employees[owned.find((o) => o.uid === m.inProgress?.uid)?.id ?? 'ceo'];
    const salaryAdded = m.salaried && !fromDef?.salary;
    if (!obtainable(c, m.target, me) && !m.inProgress.path.slice(0, -1).some((id) => obtainable(c, id, me))) continue;
    if (salaryAdded && room <= 0) continue;
    if (salaryAdded) room--;
    trains.push({ uid: m.inProgress.uid, path: m.inProgress.path, target: m.target, priority: 100 - m.index, salaryAdded });
  }

  // Hires: roots of the first few missing entries without a card in progress.
  const hires: EmployeeId[] = [];
  const supplyLeft = new Map<EmployeeId, number>();
  const take = (id: EmployeeId): boolean => {
    const left = supplyLeft.get(id) ?? s.supply[id] ?? 0;
    if (left <= 0) return false;
    const p = s.players[me];
    if (p && ownsUnique(c.content, p, id)) return false;
    supplyLeft.set(id, left - 1);
    hires.push(id);
    return true;
  };
  let considered = 0;
  for (const m of missing) {
    if (considered >= 5) break;
    if (m.inProgress || !m.root) continue;
    if (!obtainable(c, m.target, me)) continue;
    considered++;
    // Entry-level roots are free; training them into a salaried card waits for salary room.
    const rootDef = c.content.employees[m.root.id];
    if (rootDef?.salary && room <= 0) continue;
    if (rootDef?.salary) room--;
    take(m.root.id);
  }

  // Slots: if more cards want work than the managers can seat, a management trainee comes first.
  const ceoSlots = ceoSlotsFor(s, c.content, me);
  const mgrSlots = owned.filter((o) => o.def.ability.kind === 'manager' && o.def.ability.slots > 0).map((o) => (o.def.ability.kind === 'manager' ? o.def.ability.slots : 0));
  const nonMgr = owned.filter((o) => o.place !== 'busy' && o.def.ability.kind !== 'manager').length;
  const plannedNonMgr = hires.slice(0, 2).filter((id) => c.content.employees[id]?.ability.kind !== 'manager').length;
  const cap = slotCapacity(mgrSlots, ceoSlots);
  const demand = nonMgr + plannedNonMgr;
  const mtSlots = c.content.employees.management_trainee?.ability.kind === 'manager' ? c.content.employees.management_trainee.ability.slots : 2;
  const helps = slotCapacity([...mgrSlots, mtSlots], ceoSlots) > cap;
  if (demand > cap && helps && !hires.slice(0, 2).includes('management_trainee') && (s.supply.management_trainee ?? 0) > 0) hires.unshift('management_trainee');

  const extras = owned.filter((o) => !used.has(o.uid)).map((o) => o.uid);
  return { arch, covered, missing, hires, trains, extras, salaryRoom, slotCapacity: cap, slotDemand: demand, mtHelps: helps && demand >= cap };
}

/**
 * Demand the chain cannot reach (houses not connected to me, or where a rival is much closer)
 * makes a new restaurant worth more than the next roster card: a local manager comes early,
 * a regional manager later.
 */
function withExpansion(c: Ctx, me: PlayerId, build: EmployeeId[]): EmployeeId[] {
  const p = c.s.players[me];
  if (!p || c.s.round < 3) return build;
  if (p.restaurantsRemaining <= 0) return shortfallTargets(c, me, build);
  let stranded = 0;
  for (const h of houseViews(c)) {
    const weight = h.nDemand + h.campaigns.length;
    if (!weight) continue;
    const mine = sellerOf(h, me);
    const best = h.sellers.find((x) => x.player !== me);
    if (!mine) stranded += weight;
    else if (best && best.distance + 2 <= mine.distance) stranded += weight * 0.5;
  }
  const out = shortfallTargets(c, me, build);
  if (stranded < 4) return out;
  const at = Math.min(out.length, stranded >= 8 ? 3 : 6);
  if (!out.includes('local_manager')) out.splice(at, 0, 'local_manager');
  if (stranded >= 6 && !out.includes('regional_manager')) out.splice(Math.min(out.length, at + 5), 0, 'regional_manager');
  return out;
}

/**
 * Goods I would sell but cannot supply (shadow Dinnertime with everything my cards can make):
 * drinks shortfall asks for buyers, food shortfall for cooks, placed near the front.
 */
function shortfallTargets(c: Ctx, me: PlayerId, build: EmployeeId[]): EmployeeId[] {
  const p = c.s.players[me];
  if (!p) return build;
  const cards = Object.keys(p.employees).filter((u) => !p.busy[u]);
  const food = chooseFood(c, me);
  const stock: Record<PlayerId, FoodCounts> = {};
  for (const id of c.s.turnOrder) stock[id] = id === me ? addCounts(stockNow(c.s, me), capacityOf(c, me, cards, food)) : rivalStock(c, id);
  const short = shadowDinner(c, basePriceModel(c), stock, houseViews(c), me).shortfall;
  const drinks = (short.beer ?? 0) + (short.lemonade ?? 0) + (short.soft_drink ?? 0);
  const out = [...build];
  const at = Math.min(2, out.length);
  if (drinks >= 5) out.splice(at, 0, 'truck_driver');
  if (drinks >= 2) out.splice(at, 0, 'cart_operator');
  if (drinks >= 1) out.splice(at, 0, 'errand_boy');
  // Each food short: a chef / cook of that food, or a kitchen trainee for an odd item (mixed orders).
  for (const g of ['burger', 'pizza'] as const) {
    const n = short[g] ?? 0;
    if (!n) continue;
    if (n >= 6 && g === food) out.splice(at, 0, g === 'pizza' ? 'pizza_chef' : 'burger_chef');
    if (n >= 3) out.splice(at, 0, g === 'pizza' ? 'pizza_cook' : 'burger_cook');
    else out.splice(at, 0, 'kitchen_trainee');
  }
  return out;
}

/** Marketing tiles of these kinds are still in the supply. */
export function tilesLeft(c: Ctx, kinds: readonly string[]): boolean {
  const tiles = c.content.marketingTiles;
  return c.s.marketingTiles.some((n) => kinds.includes(tiles[n]?.kind ?? ''));
}

/** A marketeer whose campaign kinds have no tiles left is replaced by the next card up its career. */
function usableMarketeer(c: Ctx, id: EmployeeId): EmployeeId {
  let cur = id;
  for (let i = 0; i < 4; i++) {
    const a = c.content.employees[cur]?.ability;
    if (a?.kind !== 'marketing' || tilesLeft(c, a.campaigns)) return cur;
    const next = c.content.employees[cur]?.trainsInto.find((n) => c.content.employees[n]?.ability.kind === 'marketing');
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

/** Value of hiring `id` now for the plan: position in the hire list (higher = sooner). */
export function hireRank(plan: OrgPlan, id: EmployeeId): number {
  const i = plan.hires.indexOf(id);
  return i < 0 ? -1 : 20 - i * 3;
}

/** The archetype's main food (for flexible cooks and campaigns). */
export const planFood = (plan: OrgPlan): FoodId => plan.arch.food;

/** first_hire_3 is open and reachable with this many hire actions. */
export function hire3Open(c: Ctx, hiresAvailable: number, me: PlayerId = c.me): boolean {
  return hiresAvailable >= 3 && msOpen(c.s, me, 'first_hire_3');
}
