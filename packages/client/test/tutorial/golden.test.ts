/**
 * Golden replays (docs/tutorial-plan.md §4.8): each lesson's canonical walk (every action applied,
 * learner + scripted + bots) and its outcome are pinned in golden/<lesson>.json. An engine change
 * that alters a lesson fails here with a diff. Regenerate deliberately with UPDATE_GOLDEN=1.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { redactFor } from '@fcm/engine';
import { LESSONS } from '../../src/tutorial/catalog.js';
import { lessonStart, walkLesson } from '../../src/tutorial/headless.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');

describe('lesson golden replays', () => {
  for (const lesson of LESSONS.values()) {
    it(`${lesson.id} matches its golden walk`, () => {
      const r = walkLesson(lesson);
      expect(r.problems).toEqual([]);
      const start = lessonStart(lesson).state;
      const v = redactFor(r.state, lesson.scenario.learner);
      const golden = {
        lesson: lesson.id,
        steps: r.steps.map((s) => ({ id: s.id, ops: s.ops })),
        actions: r.actions,
        outcome: { seq: r.state.history.seq - start.history.seq, round: v.round, phase: v.phase.kind, cash: Object.fromEntries(Object.entries(v.players).map(([id, p]) => [id, p.cash])), bank: v.bank.cash },
      };
      const file = join(DIR, `${lesson.id}.json`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(file, `${JSON.stringify(golden, null, 2)}\n`);
      }
      expect(golden).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    });
  }
});
