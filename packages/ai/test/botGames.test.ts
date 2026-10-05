/**
 * Bot-vs-bot games (docs/ai.md): every seat is a bot that sees only its redacted view. Across many
 * seeds, base game and every combinable Ketchup module, games must reach game over (or the round
 * cap) with zero illegal actions and without the bot ever needing the safety fallback.
 */
import { describe, expect, it } from 'vitest';
import type { ModuleId, PlayerId } from '@fcm/engine';
import { BOT_LEVELS, type BotLevel } from '../src/index.js';
import { ALL_KETCHUP, gameConfig, playBots } from './helpers.js';

const ROUNDS = 25;
const seats = (n: number, level: BotLevel | ((i: number) => BotLevel)): Record<PlayerId, BotLevel> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, typeof level === 'function' ? level(i) : level]));

function expectClean(g: ReturnType<typeof playBots>): void {
  expect(g.rejected).toEqual([]);
  expect(g.fellBack).toEqual([]);
  expect(g.state.phase.kind === 'gameOver' || g.state.round > ROUNDS).toBe(true);
}

describe.each(BOT_LEVELS)('%s bots (Hard falls back to Easy for now)', (level) => {
  it.each([1, 2, 3, 4, 5, 6])('base game, 3 players, seed %i', (seed) => {
    expectClean(playBots(gameConfig(3), seed, seats(3, level), ROUNDS));
  }, 30_000);

  it.each([11, 12, 13, 14])('all Ketchup modules, 3 players, seed %i', (seed) => {
    expectClean(playBots(gameConfig(3, { modules: ALL_KETCHUP }), seed, seats(3, level), ROUNDS));
  }, 30_000);
});

describe('player counts and variants', () => {
  it.each([2, 4, 5])('base game with %i players', (n) => {
    expectClean(playBots(gameConfig(n), 100 + n, seats(n, 'easy'), ROUNDS));
  });

  it('6 players with every Ketchup module (mixed levels)', () => {
    expectClean(playBots(gameConfig(6, { modules: [...ALL_KETCHUP, 'ketchup:sixPlayers'] }), 66, seats(6, (i) => BOT_LEVELS[i % 3] as BotLevel), ROUNDS));
  }, 60_000);

  it('Hard Choices (conflicts with New Milestones)', () => {
    const modules: ModuleId[] = [...ALL_KETCHUP.filter((m) => m !== 'ketchup:newMilestones'), 'ketchup:hardChoices'];
    expectClean(playBots(gameConfig(3, { modules }), 77, seats(3, 'easy'), ROUNDS));
  });

  it('intro game (no reserve, no salaries) reaches game over', () => {
    const g = playBots(gameConfig(3, { intro: true }), 5, seats(3, 'easy'), 60);
    expectClean(g);
    expect(g.state.phase.kind).toBe('gameOver');
  });

  it('Easy bots finish base games (bank breaks) within 40 rounds', () => {
    let over = 0;
    for (const seed of [21, 22, 23]) if (playBots(gameConfig(3), seed, seats(3, 'easy'), 40).state.phase.kind === 'gameOver') over++;
    expect(over).toBeGreaterThanOrEqual(2);
  });

  it('decisions are fast (Easy has no lookahead)', () => {
    expect(playBots(gameConfig(4, { modules: ALL_KETCHUP }), 9, seats(4, 'easy'), 10).maxMs).toBeLessThan(500);
  });
});
