/**
 * `(config, seed, actions)` replay (architecture §3.8): the persistence, reconnection and
 * regression format. Throws if any action is rejected (a replay log must be legal).
 */
import type { Action } from '../types/actions.js';
import type { GameEvent } from '../types/events.js';
import type { GameConfig, GameState } from '../types/state.js';
import { createGame } from './createGame.js';
import { applyAction } from './reducer.js';

export function replay(config: GameConfig, seed: number, actions: Action[]): { state: GameState; events: GameEvent[][] } {
  let state = createGame(config, seed);
  const events: GameEvent[][] = [];
  actions.forEach((action, i) => {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`replay: action ${i} (${action.type}) rejected: ${r.code} ${r.message}`);
    state = r.state;
    events.push(r.events);
  });
  return { state, events };
}
