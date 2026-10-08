/**
 * Unit price and shared phase helpers (base.md §7, §6.0).
 *
 * Unit price = base price ($10) − $1 per pricing manager − $3 per discount manager + $10 per
 * luxuries manager at work − $1 with "First to Lower Prices", then the `unitPrice` module
 * pipeline. **No minimum** (base.md §7.5; the legacy `Math.max(1, price)` was a bug, audit.md).
 */
import type { EmployeeDef, MilestoneId } from '../types/content.js';
import type { ContentIndex, HookContext, Hooks } from '../types/module.js';
import type { GameState, PlayerId, PlayerState, Uid } from '../types/state.js';
import { contentFor } from '../modules/registry.js';

// ---------------------------------------------------------------------------
// Module pipelines
// ---------------------------------------------------------------------------

type PipelineName = {
  [K in keyof Hooks]: Hooks[K] extends (value: infer _V, ctx: HookContext, args: infer _A) => infer _V ? K : never;
}[keyof Hooks];

/**
 * Run a module pipeline hook (architecture §3.7). The reducer's context may expose the registry
 * runner as `ctx.pipe(name, value, args)`; without it (base game only) the value passes through.
 */
export function runPipeline<K extends PipelineName>(
  ctx: HookContext,
  name: K,
  value: Parameters<Hooks[K]>[0],
  args: Parameters<Hooks[K]>[2],
): Parameters<Hooks[K]>[0] {
  const pipe = (ctx as HookContext & { pipe?: (n: string, v: unknown, a: unknown) => unknown }).pipe;
  return pipe ? (pipe(name, value, args) as Parameters<Hooks[K]>[0]) : value;
}

/**
 * Content index (base + enabled modules) for validators that only get `state` (no HookContext).
 * Must include module content: e.g. Payday's forced-firing validator has to recognise salaried
 * module cards, or a player who cannot pay could never fire them. The reducer's `ctx.content` is
 * authoritative wherever a context exists.
 */
export function staticContent(state: GameState): ContentIndex {
  return contentFor(state.config.modules);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Cards "at work" (played): CEO, CEO slots and manager slots (base.md §4). Not beach, not busy. */
export function cardsAtWork(p: PlayerState): Uid[] {
  const out = [p.structure.ceo, ...p.structure.ceoSubs];
  for (const subs of Object.values(p.structure.managerSubs)) out.push(...subs);
  return out;
}

export function defOf(content: ContentIndex, p: PlayerState, uid: Uid): EmployeeDef | undefined {
  const card = p.employees[uid];
  return card ? content.employees[card.employeeId] : undefined;
}

/** Defs of the cards at work. */
export function defsAtWork(content: ContentIndex, p: PlayerState): { uid: Uid; def: EmployeeDef }[] {
  const out: { uid: Uid; def: EmployeeDef }[] = [];
  for (const uid of cardsAtWork(p)) {
    const def = defOf(content, p, uid);
    if (def) out.push({ uid, def });
  }
  return out;
}

/** Number of cards at work whose ability is of this kind. */
export function countAbilityAtWork(content: ContentIndex, p: PlayerState, kind: EmployeeDef['ability']['kind']): number {
  return defsAtWork(content, p).filter((x) => x.def.ability.kind === kind).length;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export function hasMilestone(s: GameState, player: PlayerId, id: MilestoneId): boolean {
  return Boolean(s.players[player]?.milestones[id]);
}

/** Earned in an earlier round (effects that start "next Dinnertime" / "next Cleanup"). */
export function hasMilestoneBefore(s: GameState, player: PlayerId, id: MilestoneId): boolean {
  const m = s.players[player]?.milestones[id];
  return Boolean(m && m.round < s.round);
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

/** base.md §7.5 unit price for one chain, before distance. May be ≤ 0. */
export function unitPrice(ctx: HookContext, player: PlayerId): number {
  const s = ctx.state;
  const p = s.players[player];
  if (!p) throw new Error(`unitPrice: unknown player ${player}`);
  let price = s.basePrice;
  for (const { def } of defsAtWork(ctx.content, p)) if (def.ability.kind === 'price') price += def.ability.delta;
  if (hasMilestone(s, player, 'first_lower_prices')) price -= 1;
  return runPipeline(ctx, 'unitPrice', price, { player });
}
