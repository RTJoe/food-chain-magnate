/**
 * Content index for the UI: employees, milestones and foods of the enabled modules, built from the
 * module manifest (architecture §3.7: the client renders content generically from it). Fallback
 * tables fill gaps while the engine's content is incomplete.
 */
import { FOODS } from '@fcm/engine';
import type { EmployeeDef, EmployeeId, FoodDef, FoodId, MilestoneDef, MilestoneId, ModuleId, ModuleManifest } from '@fcm/engine';
import { FALLBACK_EMPLOYEES, FALLBACK_MILESTONES } from './fallbackContent.js';

export interface Catalog {
  employees: Partial<Record<EmployeeId, EmployeeDef>>;
  milestones: Partial<Record<MilestoneId, MilestoneDef>>;
  foods: Partial<Record<FoodId, FoodDef>>;
}

const isOn = (module: ModuleId, enabled: readonly ModuleId[]) => module === 'base' || enabled.includes(module);

export function buildCatalog(manifest: readonly ModuleManifest[], enabled: readonly ModuleId[]): Catalog {
  const employees: Catalog['employees'] = {};
  const milestones: Catalog['milestones'] = {};
  const foods: Catalog['foods'] = {};
  // Fallbacks first (all modules: fixtures may hold cards of modules the config does not list).
  for (const e of FALLBACK_EMPLOYEES) employees[e.id] = e;
  for (const m of FALLBACK_MILESTONES) milestones[m.id] = m;
  for (const f of FOODS) foods[f.id] = f;
  const active = manifest.filter((m) => isOn(m.id, enabled));
  for (const m of active) {
    for (const e of m.content.employees ?? []) employees[e.id] = e;
    for (const ms of m.content.milestones ?? []) milestones[ms.id] = ms;
    for (const f of m.content.foods ?? []) foods[f.id] = f;
  }
  for (const m of active) {
    for (const [id, patch] of Object.entries(m.content.employeeOverrides ?? {}) as [EmployeeId, Partial<EmployeeDef>][]) {
      const base = employees[id];
      if (base) employees[id] = { ...base, ...patch, id };
    }
  }
  return { employees, milestones, foods };
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

/** Manager slot count (0 for non-managers and the night shift manager). */
export function managerSlots(d: EmployeeDef | undefined): number {
  return d?.ability.kind === 'manager' ? d.ability.slots : 0;
}

/** Managers (black cards incl. night shift manager) may only sit in CEO slots (base.md §4.4). */
export function isManager(d: EmployeeDef | undefined): boolean {
  return d?.category === 'manager';
}
