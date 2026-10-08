/**
 * Test-only HookContext for the C2 phase functions (dinnertime, marketing, payday, cleanup,
 * milestones, bank). Mirrors what the reducer provides: a mutable state, the base content index,
 * an event sink, deterministic ids and an optional `pipe` (module pipeline runner).
 */
import type { GameEvent, GameEventType, EventOf } from '../../src/types/events.js';
import type { HookContext } from '../../src/types/module.js';
import type { GameState } from '../../src/types/state.js';
import { allocId } from '../../src/core/ids.js';
import { randomInt, shuffle } from '../../src/core/rng.js';
import { staticContent } from '../../src/rules/pricing.js';
import { onMilestoneEvent } from '../../src/rules/milestones.js';

export type Pipe = (name: string, value: unknown, args: unknown) => unknown;

export interface TestCtx extends HookContext {
  events: GameEvent[];
  of<T extends GameEventType>(type: T): EventOf<T>[];
  pipe?: Pipe;
}

export function makeCtx(state: GameState, pipe?: Pipe): TestCtx {
  const events: GameEvent[] = [];
  const ctx: TestCtx = {
    state,
    content: staticContent(state),
    events,
    emit: (e) => {
      events.push(e);
      onMilestoneEvent(ctx, e); // as the reducer's context does (core/context.ts)
    },
    rng: {
      int: (n) => randomInt(state.rng, n),
      shuffle: (items) => shuffle(state.rng, items),
    },
    isEnabled: (m) => m === 'base' || state.config.modules.includes(m),
    id: (kind) => allocId(state, kind),
    of: (type) => events.filter((e) => e.type === type) as never,
  };
  if (pipe) ctx.pipe = pipe;
  return ctx;
}

/**
 * Standard 2-player test map (3x3 tiles: A L N / F O T / L R Q). Tile borders at x/y = 5, 10.
 *
 *     012345678901234
 *   0 ..#....#....#..
 *   1 ..#....#...D#..
 *   2 ###############
 *   3 HH#.....D......     house 2 = (0..1, 3..4) on tile (0,0)
 *   4 HH#............
 *   5 HH#...D#....#..     house 10 = (0..1, 5..6) on tile (1,0)
 *   6 HH#....#...D#..
 *   7 ###############
 *   8 .......#....#..
 *   9 .......#....#..
 *  10 ..#....#....#..
 *  11 ..#...D#....#..
 *  12 ###############
 *  13 ...D...#...D...
 *  14 .......#.......
 */
export const MAP: string[][] = [
  ['A', 'L', 'N'],
  ['F', 'O', 'T'],
  ['L', 'R', 'Q'],
];
