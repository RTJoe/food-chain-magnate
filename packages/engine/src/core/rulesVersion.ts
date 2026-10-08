/**
 * Rules versions. A saved game is config + seed + action log and is restored by replaying the log,
 * so it must replay under the rules it was played with. `GameConfig.rulesVersion` records them;
 * `createGame` stamps the current version on new games.
 *
 * - 1 (legacy): games saved before versions existed (engine 0.2.0 and earlier). Differences, each
 *   marked `LEGACY(v1)` where it is kept:
 *   - first restaurants are placed before reserve cards are chosen (createGame);
 *   - an over-full structure always takes the penalty, never re-seated (restructuring.ts);
 *   - an empty-pile hire only needs one training action left and one available next card
 *     (recruit.ts), and training does not check other empty-pile hires (train.ts);
 *   - the billboard that claims First Billboard is not itself eternal (campaigns.ts);
 *   - a bankrupt chain may still claim milestones (milestones.ts);
 *   - intro game: the Payday phase is entered (no salaries) and First to Have $100 fires no CFO
 *     (phase.ts, payday.ts);
 *   - Lobbyists at 5+ players does not add New Districts (createGame).
 *   Ketchup module fixes of the same release are not versioned (no saved game used modules).
 * - 2: current rules.
 */
import type { GameConfig } from '../types/state.js';

export const RULES_VERSION = 2;

/** True for a game played under the version-1 rules. A config without a version is current. */
export function legacyRules(s: { config: Pick<GameConfig, 'rulesVersion'> }): boolean {
  return s.config.rulesVersion !== undefined && s.config.rulesVersion < 2;
}

/**
 * A config read back from storage (server room file, hot-seat save). One written before rules
 * versions existed was played under version 1.
 */
export function restoredConfig<C extends GameConfig>(config: C): C {
  return config.rulesVersion === undefined ? { ...config, rulesVersion: 1 } : config;
}
