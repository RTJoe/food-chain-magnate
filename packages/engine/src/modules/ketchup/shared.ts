/**
 * Helpers shared by the Ketchup modules (docs/rules/ketchup.md): card definitions, module state,
 * pending module choices, the garden/park price multiplier and the extra luxuries manager.
 *
 * Pending choices: modules push `PendingChoice`s with `pushChoice`. Each module registers a
 * feasibility test per choice kind (`registerChoiceKind`); `settleChoices` drops a non-optional
 * choice at the head of the queue that can no longer be resolved (no legal placement, no tile
 * left), so the game never waits on an impossible decision (e.g. a second First-pizza-sold radio
 * when the radio tiles ran out).
 */
import type { EmployeeAbility, EmployeeDef, EmployeeId, ModuleId } from '../../types/content.js';
import type { HookContext } from '../../types/module.js';
import type { Rejected } from '../../types/actions.js';
import type { Cell, ChoiceId, GameState, House, PendingChoice, PendingChoiceKind, PlayerId, PlayerState } from '../../types/state.js';
import { reject } from '../../core/errors.js';
import { cardsAtWork, defOf } from '../../core/cards.js';
import { contentFor } from '../registry.js';
import { DIRECTIONS, cellKey, houseSquares, rect, step } from '../../map/grid.js';

// ---------------------------------------------------------------------------
// Card definitions (employees.md §2)
// ---------------------------------------------------------------------------

type CardOpts = Partial<Pick<EmployeeDef, 'entry' | 'salary' | 'unique' | 'uniqueGroup' | 'mandatory' | 'trainsInto' | 'availability'>>;

export function kcard(
  id: EmployeeId,
  name: string,
  module: ModuleId,
  count: number,
  colour: EmployeeDef['colour'],
  category: EmployeeDef['category'],
  ability: EmployeeAbility,
  text: string,
  rulesRef: string,
  opts: CardOpts = {},
): EmployeeDef {
  return {
    id,
    name,
    module,
    count,
    entry: opts.entry ?? false,
    salary: opts.salary ?? false,
    unique: opts.unique ?? false,
    ...(opts.uniqueGroup ? { uniqueGroup: opts.uniqueGroup } : {}),
    colour,
    category,
    ability,
    mandatory: opts.mandatory ?? false,
    trainsInto: opts.trainsInto ?? [],
    availability: opts.availability ?? 'supply',
    text,
    rulesRef,
  };
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export const isOn = (s: GameState, id: ModuleId): boolean => s.config.modules.includes(id);

/** Module-private state (plain JSON), created on first use. Mutating the result mutates the state. */
export function moduleState<T extends object>(s: GameState, id: ModuleId, init: () => T): T {
  const cur = s.moduleState[id] as T | undefined;
  if (cur) return cur;
  const fresh = init();
  s.moduleState[id] = fresh;
  return fresh;
}

/** Read-only view of module state (never creates it). */
export const peekState = <T>(s: GameState, id: ModuleId): T | undefined => s.moduleState[id] as T | undefined;

/** Cards at work with their definitions. */
export function workDefs(s: GameState, p: PlayerState): { uid: string; def: EmployeeDef }[] {
  const content = contentFor(s.config.modules);
  const out: { uid: string; def: EmployeeDef }[] = [];
  for (const uid of cardsAtWork(p)) {
    const def = defOf(content, p, uid);
    if (def) out.push({ uid, def });
  }
  return out;
}

export const employeeOf = (s: GameState, player: PlayerId, uid: string | null | undefined): EmployeeId | undefined =>
  uid ? s.players[player]?.employees[uid]?.employeeId : undefined;

// ---------------------------------------------------------------------------
// Pending module choices
// ---------------------------------------------------------------------------

type Feasible = (s: GameState, choice: PendingChoice) => boolean;
const FEASIBLE = new Map<PendingChoiceKind, Feasible>();

export function registerChoiceKind(kind: PendingChoiceKind, feasible: Feasible): void {
  FEASIBLE.set(kind, feasible);
}

type NewChoice = PendingChoice extends infer C ? (C extends PendingChoice ? Omit<C, 'id'> : never) : never;

/** Queue a choice (FIFO) and emit `choicePending`. Impossible choices at the head are dropped. */
export function pushChoice(ctx: HookContext, choice: NewChoice): ChoiceId {
  const id = ctx.id('choice');
  const full = { ...choice, id } as PendingChoice;
  ctx.state.pending.push(full);
  ctx.emit({ type: 'choicePending', choiceId: id, kind: full.kind, player: full.player });
  settleChoices(ctx);
  return id;
}

/** Drop head choices that can no longer be resolved (declined automatically). */
export function settleChoices(ctx: HookContext): void {
  const s = ctx.state;
  for (let guard = 0; guard < 64; guard++) {
    const head = s.pending[0];
    if (!head) return;
    const feasible = FEASIBLE.get(head.kind);
    if (!feasible || feasible(s, head)) return;
    s.pending.shift();
    ctx.emit({ type: 'choiceResolved', choiceId: head.id, declined: true });
  }
}

/** Remove the head choice after its action resolved it. */
export function resolveHead(ctx: HookContext, choiceId: ChoiceId): void {
  const s = ctx.state;
  if (s.pending[0]?.id !== choiceId) return;
  s.pending.shift();
  ctx.emit({ type: 'choiceResolved', choiceId, declined: false });
  settleChoices(ctx);
}

/** The action resolves the head choice of this kind, owned by the acting player. */
export function headChoice<K extends PendingChoiceKind>(
  s: GameState,
  player: PlayerId,
  choiceId: ChoiceId,
  kind: K,
): Extract<PendingChoice, { kind: K }> | Rejected {
  const head = s.pending[0];
  if (!head || head.id !== choiceId || head.kind !== kind) return reject('ILLEGAL', 'No such pending choice');
  if (head.player !== player) return reject('NOT_YOUR_TURN', 'That choice belongs to another player');
  return head as Extract<PendingChoice, { kind: K }>;
}

export const isRejected = (x: unknown): x is Rejected => typeof x === 'object' && x !== null && (x as Rejected).ok === false;

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** Squares orthogonally adjacent to a set of squares (outside it). */
export function ring(cells: Cell[]): Set<string> {
  const own = new Set(cells.map(cellKey));
  const out = new Set<string>();
  for (const c of cells) for (const d of DIRECTIONS) {
    const k = cellKey(step(c, d));
    if (!own.has(k)) out.add(k);
  }
  return out;
}

/** House orthogonally adjacent to a park (house or garden squares; ketchup.md §2 Parks). */
export function nextToPark(s: GameState, house: House): boolean {
  if (house.kind === 'rural' || house.cells.length === 0) return false;
  const near = ring(houseSquares(house));
  for (const e of Object.values(s.board.entities)) {
    if (e.kind !== 'park') continue;
    if (rect(e.x, e.y, e.w, e.h).some((c) => near.has(cellKey(c)))) return true;
  }
  return false;
}

/**
 * Per-item price multiplier: ×2 with a garden; with a park ×2, or ×3 with garden and park
 * (ketchup.md §2 Parks; several parks count once). Used for food, drinks and coffee.
 */
export function houseMultiplier(s: GameState, house: House): number {
  const garden = house.garden !== null;
  if (nextToPark(s, house)) return garden ? 3 : 2;
  return garden ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

const LUXURY_MODULES: readonly ModuleId[] = ['ketchup:sushi', 'ketchup:kimchi', 'ketchup:coffee', 'ketchup:noodles'];

/**
 * ketchup.md §0: with any of Sushi, Kimchi, Coffee, Noodles add the expansion's single luxuries
 * manager once. Called from each of those modules' `onCreateGame`; only the first enabled one
 * (in `config.modules` order) adds it.
 */
export function addExtraLuxuriesManager(ctx: HookContext, self: ModuleId): void {
  const s = ctx.state;
  const first = s.config.modules.find((m) => LUXURY_MODULES.includes(m));
  if (first !== self || s.supply.luxuries_manager === undefined) return;
  s.supply.luxuries_manager += 1;
}
