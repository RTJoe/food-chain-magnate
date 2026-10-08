/** Bot-vs-bot game driver for tests: every seat is a bot that only sees its redacted view. */
import type { Action, GameConfig, GameState, ModuleId, PlayerId } from '@fcm/engine';
import { applyAction, createGame, engine, redactFor } from '@fcm/engine';
import { decisionSeed, runBotDetailed, type BotLevel } from '../src/index.js';

export const ALL_KETCHUP: ModuleId[] = [
  'ketchup:newDistricts',
  'ketchup:lobbyists',
  'ketchup:newMilestones',
  'ketchup:coffee',
  'ketchup:kimchi',
  'ketchup:sushi',
  'ketchup:noodles',
  'ketchup:ketchup',
  'ketchup:fryChefs',
  'ketchup:massMarketeers',
  'ketchup:nightShift',
  'ketchup:ruralMarketeers',
  'ketchup:gourmetCritics',
  'ketchup:reservePrices',
  'ketchup:movieStars',
];

export function gameConfig(players: number, extra: Partial<GameConfig> = {}): GameConfig {
  const colors = ['#d94f3d', '#e8b730', '#3f8fd2', '#4caf6a', '#9b5fc0', '#f08a3c'];
  const chains = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc', 'siap_faji'] as const;
  return {
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, chain: chains[i] ?? 'gluttony_inc', color: colors[i] ?? '#000' })),
    modules: [],
    options: {},
    intro: false,
    introMilestones: false,
    map: { kind: 'random' },
    ...extra,
  };
}

export interface BotGame {
  state: GameState;
  actions: Action[];
  rejected: string[];
  fellBack: string[];
  steps: number;
  maxMs: number;
  /** Thinking time of every decision (ms, wall clock), in step order. */
  ms: number[];
}

/** Play until game over or `maxRounds` completed rounds. Each seat's level comes from `levels`. */
export function playBots(config: GameConfig, seed: number, levels: Record<PlayerId, BotLevel>, maxRounds = 30, maxSteps = 6000, budgetMs = 1000): BotGame {
  let state = createGame(config, seed);
  const actions: Action[] = [];
  const rejected: string[] = [];
  const fellBack: string[] = [];
  let maxMs = 0;
  let steps = 0;
  const ms: number[] = [];
  while (state.phase.kind !== 'gameOver' && state.round <= maxRounds && steps < maxSteps) {
    const who = state.awaiting.players[0];
    if (!who) throw new Error(`nobody awaited in ${state.phase.kind}`);
    const r = runBotDetailed({ level: levels[who] ?? 'easy', view: redactFor(state, who), playerId: who, seed: decisionSeed(seed, state.history.seq, who), budgetMs }, engine);
    maxMs = Math.max(maxMs, r.ms);
    ms.push(r.ms);
    if (r.fellBack) fellBack.push(`step ${steps} r${state.round} ${state.phase.kind} ${who}: ${r.error ?? 'bot answer invalid'} -> ${r.action.type}`);
    else if (r.internalFallback) fellBack.push(`step ${steps} r${state.round} ${state.phase.kind} ${who}: no valid move of its own (internal fallback) -> ${r.action.type}`);
    const applied = applyAction(state, r.action);
    if (!applied.ok) {
      rejected.push(`step ${steps} r${state.round} ${state.phase.kind} ${who}: ${r.action.type} ${applied.code} ${applied.message}`);
      break;
    }
    state = applied.state;
    actions.push(r.action);
    steps++;
  }
  return { state, actions, rejected, fellBack, steps, maxMs, ms };
}

/**
 * Time decision `step` of a played game again (fastest of `tries`): a wall-clock outlier from a GC
 * pause or a busy machine does not repeat, a decision that is really slow does.
 */
export function retimeDecision(config: GameConfig, seed: number, levels: Record<PlayerId, BotLevel>, actions: Action[], step: number, budgetMs = 1000, tries = 3): number {
  let state = createGame(config, seed);
  for (const a of actions.slice(0, step)) {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(`replay failed at ${a.type}: ${r.message}`);
    state = r.state;
  }
  const who = state.awaiting.players[0] as PlayerId;
  let best = Infinity;
  for (let i = 0; i < tries; i++) {
    const r = runBotDetailed({ level: levels[who] ?? 'easy', view: redactFor(state, who), playerId: who, seed: decisionSeed(seed, state.history.seq, who), budgetMs }, engine);
    best = Math.min(best, r.ms);
  }
  return best;
}
