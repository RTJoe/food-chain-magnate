/** Pure derivations over a `GameView` for the UI. No signals here, so they are easy to test. */
import { FOODS, ownsUnique } from '@fcm/engine';
// The engine's own helpers, not client copies, so the 1x rule and the structure never drift.
export { cardsAtWork, ownsUnique } from '@fcm/engine';
import type {
  EmployeeDef,
  EmployeeId,
  FoodCounts,
  FoodId,
  GameEvent,
  GameView,
  HouseId,
  MilestoneId,
  Phase,
  PhaseKind,
  PlayerId,
  PlayerState,
  Uid,
  WorkStage,
} from '@fcm/engine';
import type { Catalog } from './catalog.js';

// ---------------------------------------------------------------------------
// Phases (base.md §3)
// ---------------------------------------------------------------------------

export interface PhaseStep {
  kinds: PhaseKind[];
  label: string;
  short: string;
  icon: 'restructure' | 'order' | 'work' | 'dinner' | 'payday' | 'marketing' | 'cleanup';
}

export const PHASE_STEPS: readonly PhaseStep[] = [
  { kinds: ['restructuring'], label: 'Restructuring', short: 'Restructure', icon: 'restructure' },
  { kinds: ['orderOfBusiness'], label: 'Order of Business', short: 'Order', icon: 'order' },
  { kinds: ['working'], label: 'Working 9–5', short: 'Work', icon: 'work' },
  { kinds: ['dinnertime'], label: 'Dinnertime', short: 'Dinner', icon: 'dinner' },
  { kinds: ['payday'], label: 'Payday', short: 'Payday', icon: 'payday' },
  { kinds: ['marketing'], label: 'Marketing', short: 'Marketing', icon: 'marketing' },
  { kinds: ['cleanup'], label: 'Cleanup', short: 'Cleanup', icon: 'cleanup' },
];

/** Index into PHASE_STEPS; -1 during setup, 7 after the game ends. */
export function phaseIndex(kind: PhaseKind): number {
  if (kind === 'gameOver') return PHASE_STEPS.length;
  return PHASE_STEPS.findIndex((s) => s.kinds.includes(kind));
}

export function phaseLabel(p: Phase): string {
  switch (p.kind) {
    case 'setup.restaurants':
      return 'Setup: first restaurants';
    case 'setup.reserve':
      return 'Setup: reserve cards';
    case 'gameOver':
      return 'Game over';
    default:
      return PHASE_STEPS[phaseIndex(p.kind)]?.label ?? p.kind;
  }
}

/** Working sub-steps (base.md §6.1; lobbyists between houses and restaurants, ketchup.md §2). */
export function workStages(view: GameView): WorkStage[] {
  const out: WorkStage[] = ['recruit', 'train', 'driveIns', 'marketing', 'food', 'houses'];
  if (view.config.modules.includes('ketchup:lobbyists')) out.push('lobbyists');
  out.push('restaurants');
  return out;
}

/** Bank breaks that end the game: 2, or 1 in the intro game (no reserve cards, DLX p5). */
export const bankBreaksToEnd = (v: Pick<GameView, 'config'>): number => (v.config.intro ? 1 : 2);
export const isFinalBreak = (breakNo: number, v: Pick<GameView, 'config'>): boolean => breakNo >= bankBreaksToEnd(v);

/**
 * One sentence for a bank break, without the leading "The bank breaks". Final break: the game
 * ends after this Dinnertime, or after the next one when it broke during Marketing (KX p18). First
 * break: the reserve refill and the new CEO slots, or the new base price with Reserve Prices (KX p28).
 */
export function bankBreakText(b: { breakNo: number; added: number; ceoSlots: number; basePrice: number }, v: Pick<GameView, 'config'>, phase?: string | null): string {
  if (isFinalBreak(b.breakNo, v)) {
    const again = b.breakNo === 2 ? ' a second time' : '';
    return phase === 'marketing'
      ? `${again} during Marketing: play continues until the next Dinnertime, then the game ends`
      : `${again}: the game ends after this Dinnertime (no Payday)`;
  }
  const after = v.config.modules.includes('ketchup:reservePrices' as GameView['config']['modules'][number]) ? `Base price is now $${b.basePrice}` : `CEO slots are now ${b.ceoSlots}`;
  return `! Reserves add $${b.added}. ${after}`;
}

/** True when the game ended with every chain bankrupt: nobody wins (base.md §12). */
export const noWinner = (v: Pick<GameView, 'phase'>): boolean => v.phase.kind === 'gameOver' && v.phase.reason === 'allBankrupt';

export const STAGE_LABELS: Record<WorkStage, string> = {
  recruit: 'Hire',
  train: 'Train',
  driveIns: 'Drive-ins',
  marketing: 'Campaigns',
  food: 'Food & drinks',
  houses: 'Houses & gardens',
  lobbyists: 'Roads & parks',
  restaurants: 'Restaurants',
};

/** The working sub-step a card acts in, or null for passive/mandatory cards. */
export function cardStage(d: EmployeeDef | undefined): WorkStage | null {
  switch (d?.ability.kind) {
    case 'ceo':
    case 'recruit':
      return 'recruit';
    case 'train':
      return 'train';
    case 'marketing':
      return 'marketing';
    case 'produce':
      return d.ability.timing === 'working' ? 'food' : null;
    case 'buyDrinks':
      return 'food';
    case 'newBusiness':
      return 'houses';
    case 'lobbyist':
      return 'lobbyists';
    case 'restaurant':
      return 'restaurants';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Players and cards
// ---------------------------------------------------------------------------

export function player(view: GameView, id: PlayerId | null | undefined): PlayerState | undefined {
  return id ? view.players[id] : undefined;
}

export const busyUids = (p: PlayerState): Uid[] => Object.keys(p.busy);

/** Cards a player may put in their structure during Restructuring: everything but the CEO and busy marketeers. */
export function restructureCandidates(p: PlayerState): Uid[] {
  const busy = new Set(busyUids(p));
  return Object.keys(p.employees).filter((u) => u !== p.structure.ceo && !busy.has(u));
}

export function employeeIdOf(p: PlayerState, uid: Uid): EmployeeId | undefined {
  return p.employees[uid]?.employeeId;
}

export function foodList(counts: FoodCounts | undefined): [FoodId, number][] {
  if (!counts) return [];
  return FOODS.map((f) => [f.id, counts[f.id] ?? 0] as [FoodId, number]).filter(([, n]) => n > 0);
}

/** Players by cash (desc), ties to earlier turn order (base.md §12). */
export function standings(view: GameView): PlayerId[] {
  if (view.phase.kind === 'gameOver') return view.phase.ranking;
  const order = view.turnOrder;
  const out = (id: PlayerId) => (view.players[id]?.bankrupt ? 1 : 0);
  // Bankrupt chains are out and rank last, like the engine's rankPlayers.
  return [...order].sort((a, b) => out(a) - out(b) || (view.players[b]?.cash ?? 0) - (view.players[a]?.cash ?? 0) || order.indexOf(a) - order.indexOf(b));
}

/** Rail rank by cash: "#2 in cash", "tied #1 in cash" (equal cash shares a rank), "Out" when bankrupt. */
export function cashRankLabel(view: GameView, id: PlayerId): string {
  const p = view.players[id];
  if (!p) return '';
  if (p.bankrupt) return 'Out';
  const live = view.turnOrder.map((x) => view.players[x]).filter((x) => x && !x.bankrupt);
  const rank = live.filter((x) => (x?.cash ?? 0) > p.cash).length + 1;
  const tied = live.some((x) => x && x.id !== id && x.cash === p.cash);
  return `${tied ? 'tied ' : ''}#${rank} in cash`;
}

/** Seat index (config order) for `--player-N` colour tokens. */
export function seatIndex(view: GameView, id: PlayerId): number {
  return Math.max(0, view.config.players.findIndex((p) => p.id === id));
}

/** Cards that can be fired at Payday: everything but the CEO and busy marketeers (base.md §8). */
export function fireable(p: PlayerState): Uid[] {
  const busy = new Set(busyUids(p));
  return Object.keys(p.employees).filter((u) => u !== p.structure.ceo && !busy.has(u));
}

// ---------------------------------------------------------------------------
// Market: hiring and career paths (employees.md)
// ---------------------------------------------------------------------------

export interface HireOption {
  id: EmployeeId;
  supply: number;
  ok: boolean;
  reason?: string;
}

/** Entry-level cards in this game and whether `me` can hire them now (base.md §6.2). */
export function hireOptions(view: GameView, c: Catalog, me: PlayerId): HireOption[] {
  const p = view.players[me];
  const out: HireOption[] = [];
  for (const [id, n] of Object.entries(view.supply) as [EmployeeId, number][]) {
    const d = c.employees[id];
    if (!d?.entry) continue;
    if (p && ownsUnique(c, p, id)) out.push({ id, supply: n, ok: false, reason: 'You already own one (1x)' });
    else if (n <= 0) out.push({ id, supply: n, ok: false, reason: 'Pile is empty' });
    else out.push({ id, supply: n, ok: true });
  }
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || employeeSort(c, a.id, b.id));
}

const CATEGORY_ORDER = ['ceo', 'manager', 'service', 'pricing', 'restaurant', 'housing', 'finance', 'recruiting', 'training', 'buyer', 'marketing', 'kitchen', 'coffee', 'lobbying'];

export function employeeSort(c: Catalog, a: EmployeeId, b: EmployeeId): number {
  const da = c.employees[a];
  const db = c.employees[b];
  return CATEGORY_ORDER.indexOf(da?.category ?? '') - CATEGORY_ORDER.indexOf(db?.category ?? '') || (da?.name ?? a).localeCompare(db?.name ?? b);
}

/** Destinations reachable from `from` in 1..maxSteps training steps, with the path taken. */
export function trainingDestinations(c: Catalog, from: EmployeeId, maxSteps: number): { id: EmployeeId; steps: number; path: EmployeeId[] }[] {
  const out: { id: EmployeeId; steps: number; path: EmployeeId[] }[] = [];
  const seen = new Set<EmployeeId>([from]);
  let frontier: { id: EmployeeId; path: EmployeeId[] }[] = [{ id: from, path: [] }];
  for (let step = 1; step <= maxSteps; step++) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const to of c.employees[f.id]?.trainsInto ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        const path = [...f.path, to];
        out.push({ id: to, steps: step, path });
        next.push({ id: to, path });
      }
    }
    frontier = next;
  }
  return out;
}

export interface TrainOption {
  id: EmployeeId;
  steps: number;
  path: EmployeeId[];
  ok: boolean;
  reason?: string;
}

/** Training options for `targetUid` using a trainer that allows `maxSteps` on one card (base.md §6.3). */
export function trainOptions(view: GameView, c: Catalog, me: PlayerId, targetUid: Uid, maxSteps: number): TrainOption[] {
  const p = view.players[me];
  const from = p?.employees[targetUid]?.employeeId;
  if (!p || !from) return [];
  return trainingDestinations(c, from, maxSteps).map((d) => {
    const supply = view.supply[d.id] ?? 0;
    if (ownsUnique(c, p, d.id)) return { ...d, ok: false, reason: 'You already own one (1x)' };
    if (supply <= 0) return { ...d, ok: false, reason: 'Pile is empty' };
    return { ...d, ok: true };
  });
}

/** Cards that can be trained now: on the beach (incl. hired this turn), with a career path. */
export function trainableUids(view: GameView, c: Catalog, me: PlayerId): Uid[] {
  const p = view.players[me];
  if (!p) return [];
  return p.beach.filter((u) => (c.employees[p.employees[u]?.employeeId as EmployeeId]?.trainsInto.length ?? 0) > 0);
}

export interface CareerNode {
  id: EmployeeId;
  children: CareerNode[];
}

/**
 * Career-path forest of the cards in this game (employees.md "Career tree"). Roots are cards no
 * other card trains into. A card reachable from several parents (fry chef) appears under each.
 */
export function careerForest(c: Catalog, inGame: readonly EmployeeId[]): CareerNode[] {
  const ids = new Set(inGame);
  const hasParent = new Set<EmployeeId>();
  for (const id of ids) for (const to of c.employees[id]?.trainsInto ?? []) if (ids.has(to)) hasParent.add(to);
  const build = (id: EmployeeId, depth: number): CareerNode => ({
    id,
    children: depth > 6 ? [] : (c.employees[id]?.trainsInto ?? []).filter((t) => ids.has(t)).map((t) => build(t, depth + 1)),
  });
  return [...ids]
    .filter((id) => !hasParent.has(id) && id !== 'ceo')
    .sort((a, b) => employeeSort(c, a, b))
    .map((id) => build(id, 0));
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export interface MilestoneRow {
  id: MilestoneId;
  claimedBy: PlayerId[];
  removed: boolean;
  /** `me` can still claim it: not gone, not theirs, and unclaimed or first claimed this round (DLX p11). */
  available: boolean;
  removeAfterRound: number | null;
}

export function milestoneRows(view: GameView, me: PlayerId | null = null): MilestoneRow[] {
  return (Object.entries(view.milestones) as [MilestoneId, NonNullable<GameView['milestones'][MilestoneId]>][]).map(([id, m]) => ({
    id,
    claimedBy: m.claimedBy,
    removed: m.removed,
    available: !m.removed && !(me && m.claimedBy.includes(me)) && (m.claimedBy.length === 0 || (me !== null && (m.claimedRound === null || m.claimedRound === view.round))),
    removeAfterRound: m.removeAfterRound,
  }));
}

/** Free positions on the turn order track (base.md §5), 0-based. */
export function freeOrderPositions(view: GameView): number[] {
  if (view.phase.kind !== 'orderOfBusiness') return [];
  const taken = new Set(Object.values(view.phase.picks));
  // One slot per chooser: bankrupt chains are not in the queue (engine orderOfBusiness).
  return view.phase.queue.map((_, i) => i).filter((i) => !taken.has(i));
}

export const initial = (name: string): string => (name.trim().charAt(0) || '?').toUpperCase();

/**
 * The seat's mark, shared by the board (restaurant and coffee-shop signs, vans) and every player
 * badge, so pieces can be matched to players without colour: the name's initial; its first two
 * letters when another player has the same initial ("Ad", "Al"); initial and seat number when
 * those clash too ("P1", "P2").
 */
export function playerMark(view: Pick<GameView, 'players'> & { config?: { players: readonly { id: string }[] } }, id: string): string {
  const name = (view.players[id]?.name ?? id).trim();
  const one = initial(name);
  const others = Object.entries(view.players).filter(([o]) => o !== id).map(([o, p]) => (p?.name ?? o).trim());
  if (!others.some((n) => initial(n) === one)) return one;
  const two = (s: string) => s.charAt(0).toUpperCase() + s.charAt(1).toLowerCase();
  if (name.length > 1 && !others.some((n) => two(n) === two(name))) return two(name);
  const seat = view.config?.players.findIndex((p) => p.id === id) ?? -1;
  return `${one}${seat >= 0 ? seat + 1 : ''}`;
}

/** "Garden: pays ×2", "Park: pays ×2", "Garden + park: pays ×3" (KX p17), or null at ×1. */
export function housePaysLabel(garden: boolean, park: number): string | null {
  const mult = garden ? Math.max(2, park) : park;
  if (mult <= 1) return null;
  const why = garden && park > 1 ? 'Garden + park' : garden ? 'Garden' : 'Park';
  return `${why}: pays ×${mult}`;
}

/** Who sold to `house` in this round's Dinnertime (its demand is gone, so say why). */
export function servedBy(list: readonly { round: number; phase: string; events: readonly GameEvent[] }[], round: number, house: HouseId): PlayerId | null {
  for (const s of list) {
    if (s.round !== round || s.phase !== 'dinnertime') continue;
    for (const e of s.events) if (e.type === 'sale' && e.houseId === house) return e.player;
  }
  return null;
}
