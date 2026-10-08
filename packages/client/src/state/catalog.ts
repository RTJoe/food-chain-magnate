/**
 * Content index for the UI: employees, milestones, foods, marketing tiles and map tiles of the
 * enabled modules, built from the
 * module manifest (architecture §3.7: the client renders content generically from it). Fallback
 * tables fill gaps while the engine's content is incomplete.
 */
import { FOODS } from '@fcm/engine';
import type { EmployeeDef, EmployeeId, FoodDef, FoodId, MarketingTileDef, MilestoneDef, MilestoneId, ModuleId, ModuleManifest, TileDef, TileTemplateId } from '@fcm/engine';
import { FALLBACK_EMPLOYEES, FALLBACK_MILESTONES } from './fallbackContent.js';

export interface Catalog {
  employees: Partial<Record<EmployeeId, EmployeeDef>>;
  milestones: Partial<Record<MilestoneId, MilestoneDef>>;
  foods: Partial<Record<FoodId, FoodDef>>;
  /** Marketing tiles by number (token picker: size, kind). */
  marketingTiles: Partial<Record<number, MarketingTileDef>>;
  /** Map tile templates by id (extra map tile picker previews). */
  tiles: Partial<Record<TileTemplateId, TileDef>>;
}

const isOn = (module: ModuleId, enabled: readonly ModuleId[]) => module === 'base' || enabled.includes(module);

export function buildCatalog(manifest: readonly ModuleManifest[], enabled: readonly ModuleId[]): Catalog {
  const employees: Catalog['employees'] = {};
  const milestones: Catalog['milestones'] = {};
  const foods: Catalog['foods'] = {};
  const marketingTiles: Catalog['marketingTiles'] = {};
  const tiles: Catalog['tiles'] = {};
  // Fallbacks first (all modules: fixtures may hold cards of modules the config does not list).
  for (const e of FALLBACK_EMPLOYEES) employees[e.id] = e;
  for (const m of FALLBACK_MILESTONES) milestones[m.id] = m;
  for (const f of FOODS) foods[f.id] = f;
  const active = manifest.filter((m) => isOn(m.id, enabled));
  for (const m of active) {
    for (const e of m.content.employees ?? []) employees[e.id] = e;
    for (const ms of m.content.milestones ?? []) milestones[ms.id] = ms;
    for (const f of m.content.foods ?? []) foods[f.id] = f;
    for (const t of m.content.marketingTiles ?? []) marketingTiles[t.number] = t;
    for (const t of m.content.tiles ?? []) tiles[t.id] = t;
  }
  for (const m of active) {
    for (const [id, patch] of Object.entries(m.content.employeeOverrides ?? {}) as [EmployeeId, Partial<EmployeeDef>][]) {
      const base = employees[id];
      if (base) employees[id] = { ...base, ...patch, id };
    }
  }
  // Module career paths (sushi / noodle cooks, fry chef, movie stars ...), merged as the engine does (registry contentFor).
  for (const m of active) {
    for (const [id, extra] of Object.entries(m.content.careerAdditions ?? {}) as [EmployeeId, EmployeeId[]][]) {
      const def = employees[id];
      if (def) employees[id] = { ...def, trainsInto: [...new Set([...def.trainsInto, ...extra])] };
    }
  }
  return { employees, milestones, foods, marketingTiles, tiles };
}

/** Readable name for an unknown id: `ketchup:fry_chef` → `Fry chef`. */
export function humanize(id: string): string {
  const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const words = bare.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const employeeName = (c: Catalog, id: EmployeeId): string => c.employees[id]?.name ?? humanize(id);
export const milestoneName = (c: Catalog, id: MilestoneId): string => c.milestones[id]?.name ?? humanize(id);
export const foodName = (c: Catalog, id: FoodId): string => c.foods[id]?.name ?? humanize(id);

/** "a Burger Cook", "an Errand Boy". */
export const withArticle = (name: string): string => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;

/** Goods that do not take a plural "s". */
const UNCOUNTED = new Set(['kimchi', 'sushi', 'noodles']);

/** "3 burgers", "1 beer", "2 kimchi" (lower case, as in running text). */
export function foodCount(c: Catalog, id: FoodId, n: number): string {
  const name = foodName(c, id).toLowerCase();
  return `${n} ${n === 1 || UNCOUNTED.has(id) ? name : `${name}s`}`;
}

/** Manager slot count (0 for non-managers and the night shift manager). */
export function managerSlots(d: EmployeeDef | undefined): number {
  return d?.ability.kind === 'manager' ? d.ability.slots : 0;
}

/** Managers (black cards incl. night shift manager) may only sit in CEO slots (base.md §4.4). */
export function isManager(d: EmployeeDef | undefined): boolean {
  return d?.category === 'manager';
}
