/**
 * Lobby game settings without UI (online lobby and hot-seat setup): module toggles with
 * requires/conflicts, modules the settings need (Lobbyists at 5+ → New Districts, KX p15), the
 * KX p2 suggested scenarios, and modules that do nothing in an intro game.
 */
import type { ModuleId, ModuleManifest } from '@fcm/engine';
import type { RoomConfig } from '@fcm/protocol';

/** Applies a module toggle with `requires`/`conflicts` (sixPlayers needs newDistricts; hardChoices vs newMilestones). */
export function toggleModule(cfg: RoomConfig, mods: readonly ModuleManifest[], id: ModuleId, on: boolean): RoomConfig {
  const set = new Set(cfg.modules);
  const byId = new Map(mods.map((m) => [m.id, m]));
  if (on) {
    const add = (m: ModuleId) => {
      if (set.has(m)) return;
      set.add(m);
      for (const c of byId.get(m)?.conflicts ?? []) set.delete(c);
      for (const r of byId.get(m)?.requires ?? []) add(r);
    };
    add(id);
  } else {
    const drop = (m: ModuleId) => {
      set.delete(m);
      for (const other of mods) if (set.has(other.id) && other.requires.includes(m)) drop(other.id);
    };
    drop(id);
  }
  let seatCount = cfg.seatCount;
  if (!set.has('ketchup:sixPlayers') && seatCount > 5) seatCount = 5;
  return withRequiredModules({ ...cfg, modules: mods.map((m) => m.id).filter((m) => set.has(m)), seatCount }, mods);
}

export const ND: ModuleId = 'ketchup:newDistricts';

/** KX p15: Lobbyists at 5 or 6 players needs all six new map tiles, so New Districts joins (the engine does the same). */
export const lobbyistsNeedDistricts = (cfg: RoomConfig): boolean => cfg.seatCount >= 5 && cfg.modules.includes('ketchup:lobbyists');

/** Adds modules the settings need: New Districts for Lobbyists at 5+ players. */
export function withRequiredModules(cfg: RoomConfig, mods: readonly ModuleManifest[]): RoomConfig {
  if (!lobbyistsNeedDistricts(cfg) || cfg.modules.includes(ND) || !mods.some((m) => m.id === ND)) return cfg;
  const set = new Set<ModuleId>([...cfg.modules, ND]);
  return { ...cfg, modules: mods.map((m) => m.id).filter((m) => set.has(m)) };
}

/** Suggested scenarios (KX p2): module sets; Upmarket Area takes only the park tile from New Districts (Q-K26). */
export const SCENARIOS: readonly { id: string; name: string; modules: ModuleId[]; parkOnly?: boolean }[] = [
  { id: 'newMilestones', name: 'New Milestones', modules: ['ketchup:newMilestones'] },
  { id: 'firstCoffee', name: 'Your first cup of coffee', modules: ['ketchup:coffee'] },
  { id: 'koreanCity', name: 'Korean City', modules: [ND, 'ketchup:kimchi'] },
  { id: 'nightlife', name: 'Nightlife', modules: ['ketchup:newMilestones', 'ketchup:nightShift'] },
  { id: 'sustenance', name: 'Sustenance', modules: ['ketchup:coffee', 'ketchup:fryChefs'] },
  { id: 'upmarket', name: 'Upmarket Area', modules: ['ketchup:newMilestones', ND, 'ketchup:gourmetCritics', 'ketchup:sushi'], parkOnly: true },
  { id: 'cityBuilder', name: 'City Builder', modules: ['ketchup:lobbyists', ND, 'ketchup:ruralMarketeers'] },
  { id: 'asianFusion', name: 'Asian Fusion', modules: ['ketchup:sushi', 'ketchup:kimchi', 'ketchup:noodles', 'ketchup:ketchup'] },
  { id: 'firstMover', name: 'First Mover', modules: ['ketchup:hardChoices', 'ketchup:ketchup', 'ketchup:movieStars', 'ketchup:lobbyists', 'ketchup:reservePrices'] },
  { id: 'overtime', name: 'Overtime', modules: ['ketchup:nightShift', 'ketchup:massMarketeers', 'ketchup:ruralMarketeers', ND, 'ketchup:noodles', 'ketchup:reservePrices'] },
  {
    id: 'henriLo',
    name: 'Henri Lo menu',
    modules: [ND, 'ketchup:lobbyists', 'ketchup:newMilestones', 'ketchup:coffee', 'ketchup:kimchi', 'ketchup:sushi', 'ketchup:noodles', 'ketchup:ketchup', 'ketchup:fryChefs', 'ketchup:massMarketeers', 'ketchup:nightShift', 'ketchup:ruralMarketeers', 'ketchup:gourmetCritics', 'ketchup:reservePrices', 'ketchup:movieStars'],
  },
];

const ndTiles = (cfg: RoomConfig): string => String((cfg.options as Record<string, { tiles?: unknown } | undefined>)[ND]?.tiles ?? 'districts');

/** The scenario the settings match, or '' (6 Players, and New Districts it needs, may join any). */
export function scenarioOf(cfg: RoomConfig): string {
  if (cfg.intro) return '';
  const six = cfg.modules.includes('ketchup:sixPlayers');
  const on = cfg.modules.filter((m) => m !== 'ketchup:sixPlayers');
  const hit = SCENARIOS.find((sc) => {
    const want = new Set<ModuleId>(sc.modules);
    if (six || lobbyistsNeedDistricts(cfg)) want.add(ND);
    return want.size === on.length && on.every((m) => want.has(m)) && (!sc.modules.includes(ND) || (ndTiles(cfg) === 'park') === Boolean(sc.parkOnly));
  });
  return hit?.id ?? '';
}

/** Applies a KX p2 scenario: its modules (6 Players kept at 6 seats), a full game, New Districts' tiles. */
export function applyScenario(cfg: RoomConfig, mods: readonly ModuleManifest[], id: string): RoomConfig {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) return cfg;
  const set = new Set<ModuleId>(sc.modules);
  if (cfg.seatCount === 6) set.add('ketchup:sixPlayers').add(ND);
  const options = { ...(cfg.options as Record<string, Record<string, unknown> | undefined>) };
  const { tiles: _tiles, ...nd } = options[ND] ?? {};
  options[ND] = sc.parkOnly ? { ...nd, tiles: 'park' } : nd;
  const next: RoomConfig = { ...cfg, intro: false, introMilestones: false, modules: mods.map((m) => m.id).filter((m) => set.has(m)), options: options as RoomConfig['options'] };
  return withRequiredModules(next, mods);
}

/**
 * Why a module has no effect in this intro game, or null (DLX p5): no reserve cards, so Reserve
 * Prices does nothing; no milestones unless "…with milestones" is on.
 */
export function introIdle(cfg: Pick<RoomConfig, 'intro' | 'introMilestones'>, id: ModuleId): string | null {
  if (!cfg.intro) return null;
  if (id === 'ketchup:reservePrices') return 'Not in the intro game (no reserve cards).';
  if (!cfg.introMilestones && (id === 'ketchup:hardChoices' || id === 'ketchup:newMilestones' || id === 'ketchup:ketchup')) return 'Not in the intro game without milestones.';
  return null;
}
