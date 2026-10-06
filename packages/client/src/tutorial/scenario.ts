/** A lesson's start state: the scenario built, the engine `tutorial` module enabled and settled. */
import type { GameEvent, GameState } from '@fcm/engine';
import { enableTutorial } from '@fcm/engine';
import type { Lesson } from './dsl.js';

export function lessonStart(lesson: Lesson): { state: GameState; events: GameEvent[] } {
  const sc = lesson.scenario;
  return enableTutorial(sc.build(), {
    player: sc.learner,
    pauseAfter: sc.pauseAfter,
    ...(sc.startPaused ? { startPaused: true } : {}),
    ...(sc.settle === false ? { settle: false } : {}),
  });
}
