/**
 * Bot registry: one factory per level. Medium and Hard fall back to Easy until they are
 * registered (docs/ai.md). Registering replaces the fallback everywhere bots run (server worker,
 * session inline runner, client Web Worker), because they all call `createBot`.
 */
import type { Bot, BotLevel } from './types.js';
import { createEasyBot } from './easy.js';

export type BotFactory = () => Bot;

const factories = new Map<BotLevel, BotFactory>([['easy', createEasyBot]]);

/** Register (or replace) the factory for a level. */
export function registerBot(level: BotLevel, factory: BotFactory): void {
  factories.set(level, factory);
}

/** True when `level` has its own implementation (not the Easy fallback). */
export function hasBot(level: BotLevel): boolean {
  return factories.has(level);
}

/**
 * A bot for `level`. Unregistered levels get the Easy bot, wrapped so `level` still reports the
 * requested level (seats and logs stay truthful about what was asked for).
 */
export function createBot(level: BotLevel): Bot {
  const own = factories.get(level);
  if (own) return own();
  const easy = createEasyBot();
  return { level, choose: (input) => easy.choose(input) };
}
