/** One course-map card (docs/tutorial-plan.md §4.5): status, minutes, concepts, Start / Resume, locks. */
import type { CourseEntry } from '../../tutorial/catalog.js';
import { entryById, lockedBy } from '../../tutorial/catalog.js';
import { learnProgress, markSkipped, restartLesson, type LessonProgress } from '../../tutorial/progress.js';
import { navigate } from '../../state/router.js';
import { hasTerm } from '../glossary/index.js';
import { whatsThis } from '../glossary/api.js';
import { Button, Pill } from '../common.js';
import { Icon } from '../icons.js';
import { startFreePlay } from '../hints/coach.js';

export function statusLabel(p: LessonProgress): { text: string; tone: 'neutral' | 'ok' | 'info' | 'warn' } {
  switch (p.status) {
    case 'passed':
      return { text: 'Passed', tone: 'ok' };
    case 'skipped':
      return { text: 'Skipped', tone: 'warn' };
    case 'started': {
      const pct = p.steps ? Math.round(((p.stepIndex ?? 0) / p.steps) * 100) : 0;
      return { text: `In progress ${pct}%`, tone: 'info' };
    }
    default:
      return { text: 'New', tone: 'neutral' };
  }
}

const shortName = (e: CourseEntry, i: number) => (e.course === 'base' ? `L${i + 1}` : `K${i + 1}`);

export function LessonCard({ entry: e, index }: { entry: CourseEntry; index: number }) {
  const progress = learnProgress.value;
  const p = progress.lessons[e.id] ?? { status: 'new' as const };
  const missing = lockedBy(e, progress);
  const locked = missing.length > 0;
  const lesson = e.lesson;
  const st = statusLabel(p);
  const open = () => navigate({ name: 'learn', lesson: e.id });
  return (
    <article class={`lesson-card glass ${locked ? 'is-locked' : ''} ${!lesson && !e.freePlay ? 'is-soon' : ''} is-${p.status}`} data-lesson-card={e.id}>
      <header class="lesson-card-head">
        <span class="lesson-num">{shortName(e, index)}</span>
        <h3>{e.title}</h3>
        {e.minutes > 0 && <span class="muted small">{e.minutes} min</span>}
      </header>
      {lesson && (
        <>
          <p class="muted small lesson-goal">{lesson.goal}</p>
          {lesson.concepts.length > 0 && (
            <div class="chip-row lesson-concepts">
              {lesson.concepts.map((c) =>
                hasTerm(c) ? (
                  <button key={c} type="button" class="chip chip-sm" onClick={(ev) => whatsThis(c, ev.currentTarget)}>
                    {c.replace(/_/g, ' ')}
                  </button>
                ) : (
                  <span key={c} class="chip chip-sm">
                    {c.replace(/_/g, ' ')}
                  </span>
                ),
              )}
            </div>
          )}
        </>
      )}
      <footer class="lesson-card-foot">
        {lesson ? (
          <>
            <Pill tone={st.tone}>{st.text}</Pill>
            {p.quizBest !== undefined && <span class="muted small">Quiz best {p.quizBest}%</span>}
            <span class="lesson-card-actions">
              {locked ? (
                <>
                  <span class="muted small">Needs {missing.map((id) => entryById(id)?.title ?? id).slice(0, 2).join(', ')}{missing.length > 2 ? '…' : ''}</span>
                  <Button size="sm" variant="ghost" onClick={() => markSkipped(missing)}>
                    Skip prerequisites
                  </Button>
                </>
              ) : (
                <>
                  {p.stepId && (
                    <Button size="sm" variant="ghost" onClick={() => (restartLesson(e.id), open())}>
                      Restart
                    </Button>
                  )}
                  {p.status === 'new' && (
                    <Button size="sm" variant="ghost" onClick={() => markSkipped([e.id])}>
                      Skip
                    </Button>
                  )}
                  <Button size="sm" variant="primary" icon="play" data-start-lesson={e.id} onClick={open}>
                    {p.stepId ? 'Resume' : p.status === 'passed' ? 'Replay' : 'Start'}
                  </Button>
                </>
              )}
            </span>
          </>
        ) : e.freePlay ? (
          <Button size="sm" variant="secondary" icon="robot" data-free-play onClick={() => (startFreePlay(), navigate({ name: 'hotseat' }))}>
            Play with the coach on
          </Button>
        ) : (
          <span class="muted small">{Icon.sparkle({ size: 14 })} Coming soon</span>
        )}
      </footer>
    </article>
  );
}
