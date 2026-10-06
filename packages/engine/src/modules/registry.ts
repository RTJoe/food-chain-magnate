/**
 * Module registration, content merging and hook pipelines (architecture §3.7).
 *
 * - `registerModule(m)`: add a module (Ketchup modules call this from their index).
 * - `resolveModules(ids)`: enabled modules in hook order: `base` first, then each module after
 *   its `requires`, otherwise in `config.modules` order.
 * - `moduleSetProblem(ids)`: unknown ids, missing requirements, conflicts.
 * - `contentFor(ids)`: merged content (memoized): employees (+ overrides, + career additions), milestones (base
 *   dropped if a module `replacesBaseMilestones`), foods, tiles, marketing tiles, placeable houses,
 *   extra supply.
 * - `pipe(ctx, name, value, args)`: run a pipeline hook through every enabled module in order.
 * - `lifecycle(ctx, name, ...)`: run a lifecycle hook (`onCreateGame`, `onPhaseEnter`, ...).
 * - `actionHandler(ids, type)`: module action handler for a `${moduleId}.${name}` action.
 */
import type { Action } from '../types/actions.js';
import type {
  EmployeeDef,
  EmployeeId,
  MarketingTileDef,
  MilestoneDef,
  ModuleId,
  PlaceableHouseDef,
  TileDef,
} from '../types/content.js';
import type { GameEvent } from '../types/events.js';
import type { ActionHandler, ContentIndex, GameModule, HookContext, Hooks, ModuleManifest } from '../types/module.js';
import type { Phase, PhaseKind } from '../types/state.js';
import type { GameView } from '../types/view.js';
import { BASE_MODULE } from './base.js';
import { KETCHUP_MODULES } from './ketchup/index.js';
import { TUTORIAL_MODULE } from './tutorial.js';

const REGISTRY = new Map<ModuleId, GameModule>([
  ['base', BASE_MODULE],
  ...KETCHUP_MODULES.map((m) => [m.id, m] as [ModuleId, GameModule]),
  ['tutorial', TUTORIAL_MODULE],
]);
const contentCache = new Map<string, EngineContent>();
const resolveCache = new Map<string, GameModule[]>();

export function registerModule(m: GameModule): void {
  REGISTRY.set(m.id, m);
  contentCache.clear();
  resolveCache.clear();
}

export function getModule(id: ModuleId): GameModule | undefined {
  return REGISTRY.get(id);
}

export function allModules(): GameModule[] {
  return [...REGISTRY.values()];
}

export function moduleSetProblem(ids: readonly ModuleId[]): string | null {
  const set = new Set<ModuleId>(['base', ...ids]);
  for (const id of set) {
    const m = REGISTRY.get(id);
    if (!m) return `Unknown or unavailable module: ${id}`;
    for (const r of m.requires ?? []) if (!set.has(r)) return `${id} requires ${r}`;
    for (const c of m.conflicts ?? []) if (set.has(c)) return `${id} cannot be combined with ${c}`;
  }
  return null;
}

export function resolveModules(ids: readonly ModuleId[]): GameModule[] {
  const key = ids.join(',');
  const hit = resolveCache.get(key);
  if (hit) return hit;
  const out: GameModule[] = [];
  const done = new Set<ModuleId>();
  const visit = (id: ModuleId) => {
    if (done.has(id)) return;
    done.add(id);
    const m = REGISTRY.get(id);
    if (!m) return;
    for (const r of m.requires ?? []) visit(r);
    out.push(m);
  };
  visit('base');
  for (const id of ids) visit(id);
  resolveCache.set(key, out);
  return out;
}

/** Content index plus the engine-only tables (marketing tiles, placeable houses, extra supply). */
export interface EngineContent extends ContentIndex {
  marketingTiles: Partial<Record<number, MarketingTileDef>>;
  placeableHouses: PlaceableHouseDef[];
  extraSupply: Partial<Record<EmployeeId, number>>;
}

export function contentFor(ids: readonly ModuleId[]): EngineContent {
  const key = ids.join(',');
  const hit = contentCache.get(key);
  if (hit) return hit;
  const mods = resolveModules(ids);
  const replaceMilestones = mods.some((m) => m.content?.replacesBaseMilestones);
  const employees: Partial<Record<EmployeeId, EmployeeDef>> = {};
  const milestones: ContentIndex['milestones'] = {};
  const foods: ContentIndex['foods'] = {};
  const tiles: ContentIndex['tiles'] = {};
  const marketingTiles: EngineContent['marketingTiles'] = {};
  const placeable = new Map<number, PlaceableHouseDef>();
  const extraSupply: EngineContent['extraSupply'] = {};
  for (const m of mods) {
    const c = m.content;
    if (!c) continue;
    for (const e of c.employees ?? []) employees[e.id] = { ...e };
    for (const md of c.milestones ?? []) {
      if (replaceMilestones && m.id === 'base') continue;
      milestones[md.id] = md as MilestoneDef;
    }
    for (const f of c.foods ?? []) foods[f.id] = f;
    for (const t of c.tiles ?? []) tiles[t.id] = t as TileDef;
    for (const t of c.marketingTiles ?? []) marketingTiles[t.number] = t;
    for (const h of c.placeableHouses ?? []) placeable.set(h.order, h);
    for (const [id, n] of Object.entries(c.extraSupply ?? {}) as [EmployeeId, number][]) extraSupply[id] = (extraSupply[id] ?? 0) + n;
  }
  for (const m of mods) {
    for (const [id, patch] of Object.entries(m.content?.employeeOverrides ?? {}) as [EmployeeId, Partial<EmployeeDef>][]) {
      const base = employees[id];
      if (base) employees[id] = { ...base, ...patch, id };
    }
  }
  for (const m of mods) {
    for (const [id, extra] of Object.entries(m.content?.careerAdditions ?? {}) as [EmployeeId, EmployeeId[]][]) {
      const def = employees[id];
      if (def) employees[id] = { ...def, trainsInto: [...new Set([...def.trainsInto, ...extra])] };
    }
  }
  const out: EngineContent = {
    employees,
    milestones,
    foods,
    tiles,
    marketingTiles,
    placeableHouses: [...placeable.values()].sort((a, b) => a.order - b.order),
    extraSupply,
  };
  contentCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

type LifecycleName = 'onCreateGame' | 'onPhaseEnter' | 'onPhaseExit' | 'afterPhase' | 'onEvent' | 'beforeAction' | 'onAction';
export type PipelineName = Exclude<keyof Hooks, LifecycleName | 'redact'>;
type PipeValue<K extends PipelineName> = Parameters<Hooks[K]>[0];
type PipeArgs<K extends PipelineName> = Parameters<Hooks[K]>[2];

export function pipe<K extends PipelineName>(ctx: HookContext, name: K, value: PipeValue<K>, args: PipeArgs<K>): PipeValue<K> {
  let v = value;
  for (const m of resolveModules(ctx.state.config.modules)) {
    const hook = m.hooks?.[name] as ((value: PipeValue<K>, ctx: HookContext, args: PipeArgs<K>) => PipeValue<K>) | undefined;
    if (hook) v = hook(v, ctx, args);
  }
  return v;
}

export function lifecycle(ctx: HookContext, name: 'onCreateGame'): void;
export function lifecycle(ctx: HookContext, name: 'onPhaseEnter' | 'onPhaseExit', phase: Phase): void;
export function lifecycle(ctx: HookContext, name: 'afterPhase', finished: PhaseKind): void;
export function lifecycle(ctx: HookContext, name: 'onEvent', event: GameEvent): void;
export function lifecycle(ctx: HookContext, name: 'beforeAction' | 'onAction', action: Action): void;
export function lifecycle(ctx: HookContext, name: LifecycleName, arg?: Phase | PhaseKind | GameEvent | Action): void {
  for (const m of resolveModules(ctx.state.config.modules)) {
    const hook = m.hooks?.[name] as ((ctx: HookContext, arg?: unknown) => void) | undefined;
    if (hook) hook(ctx, arg);
  }
}

export function redactHooks(ids: readonly ModuleId[], view: GameView, args: Parameters<Hooks['redact']>[1]): GameView {
  let v = view;
  for (const m of resolveModules(ids)) if (m.hooks?.redact) v = m.hooks.redact(v, args);
  return v;
}

export function actionHandler(ids: readonly ModuleId[], type: Action['type']): ActionHandler | undefined {
  for (const m of resolveModules(ids)) {
    const h = m.actions?.[type];
    if (h) return h as ActionHandler;
  }
  return undefined;
}

export function manifestOf(m: GameModule): ModuleManifest {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    requires: m.requires ?? [],
    conflicts: m.conflicts ?? [],
    options: m.options ?? {},
    content: m.content ?? {},
  };
}
