/** Pure derivations over a `GameView` for the UI. No signals here, so they are easy to test. */
import { FOODS } from '@fcm/engine';
import type {
  EmployeeDef,
  EmployeeId,
  FoodCounts,
  FoodId,
  GameView,
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
  { kinds: ['marketing'], label: 'Marketing Campaigns', short: 'Marketing', icon: 'marketing' },
  { kinds: ['cleanup'], label: 'Clean up', short: 'Clean up', icon: 'cleanup' },
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

/** Cards in the structure: CEO, CEO slots, then each manager's reports. */
export function cardsAtWork(p: PlayerState): Uid[] {
  const s = p.structure;
  return [s.ceo, ...s.ceoSubs, ...s.ceoSubs.flatMap((m) => s.managerSubs[m] ?? [])];
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

/** Owned employee ids (beach and busy included), for the 1x rule. */
export function ownedIds(p: PlayerState): Set<string> {
  return new Set(Object.values(p.employees).map((c) => c.employeeId));
}

function uniqueKey(c: Catalog, id: EmployeeId): string {
  return c.employees[id]?.uniqueGroup ?? id;
}

export function ownsUnique(c: Catalog, p: PlayerState, id: EmployeeId): boolean {
  const def = c.employees[id];
  if (!def?.unique) return false;
  const key = uniqueKey(c, id);
  return Object.values(p.employees).some((o) => c.employees[o.employeeId]?.unique && uniqueKey(c, o.employeeId) === key);
}

export function foodList(counts: FoodCounts | undefined): [FoodId, number][] {
  if (!counts) return [];
  return FOODS.map((f) => [f.id, counts[f.id] ?? 0] as [FoodId, number]).filter(([, n]) => n > 0);
}

export const foodTotal = (counts: FoodCounts | undefined): number => foodList(counts).reduce((n, [, c]) => n + c, 0);

/** Players by cash (desc), ties to earlier turn order (base.md §12). */
export function standings(view: GameView): PlayerId[] {
  if (view.phase.kind === 'gameOver') return view.phase.ranking;
  const order = view.turnOrder;
  return [...order].sort((a, b) => (view.players[b]?.cash ?? 0) - (view.players[a]?.cash ?? 0) || order.indexOf(a) - order.indexOf(b));
}

/** Seat index (config order) for `--player-N` colour tokens. */
export function seatIndex(view: GameView, id: PlayerId): number {
  return Math.max(0, view.config.players.findIndex((p) => p.id === id));
}

/** Salaried cards × $5 (busy and beach included; base.md §8). Display estimate; the engine computes the real total. */
export function salaryEstimate(c: Catalog, p: PlayerState, firing: readonly Uid[] = []): number {
  const fired = new Set(firing);
  let n = 0;
  for (const card of Object.values(p.employees)) {
    if (fired.has(card.uid) || card.salaryFree) continue;
    if (c.employees[card.employeeId]?.salary) n++;
  }
  return n * 5;
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
  available: boolean;
  removeAfterRound: number | null;
}

export function milestoneRows(view: GameView): MilestoneRow[] {
  return (Object.entries(view.milestones) as [MilestoneId, NonNullable<GameView['milestones'][MilestoneId]>][]).map(([id, m]) => ({
    id,
    claimedBy: m.claimedBy,
    removed: m.removed,
    available: !m.removed && m.claimedBy.length === 0,
    removeAfterRound: m.removeAfterRound,
  }));
}

/** Free positions on the turn order track (base.md §5), 0-based. */
export function freeOrderPositions(view: GameView): number[] {
  if (view.phase.kind !== 'orderOfBusiness') return [];
  const taken = new Set(Object.values(view.phase.picks));
  return view.turnOrder.map((_, i) => i).filter((i) => !taken.has(i));
}

export const initial = (name: string): string => (name.trim().charAt(0) || '?').toUpperCase();

