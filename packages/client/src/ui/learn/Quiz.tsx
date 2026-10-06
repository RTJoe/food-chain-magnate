/**
 * Check-yourself quiz and the lesson-done card (docs/tutorial-plan.md §4.1 `Quiz`, §4.5 badges),
 * rendered in the coach card once a lesson's steps are done.
 */
import { useSignal } from '@preact/signals';
import type { TutorialRunner } from '../../tutorial/runner.js';
import { COURSE_BADGES, lessonBadgeId, lessonBadgeLabel, nextEntry } from '../../tutorial/catalog.js';
import { navigate } from '../../state/router.js';
import { Button } from '../common.js';
import { Icon } from '../icons.js';

export function QuizPanel({ runner }: { runner: TutorialRunner }) {
  const idx = runner.quizIndex.value;
  const picked = runner.quizPicked.value;
  const q = runner.lesson.quiz.questions[idx];
  const typed = useSignal('');
  if (!q) return null;
  const total = runner.lesson.quiz.questions.length;
  return (
    <div class="quiz" data-quiz-index={idx}>
      <p class="coach-count">
        Check yourself · {idx + 1} / {total}
      </p>
      <p class="quiz-q" id={`quiz-q-${idx}`}>
        {q.q}
      </p>
      {q.kind === 'choice' && (
        <div class="quiz-options" role="group" aria-labelledby={`quiz-q-${idx}`}>
          {q.options.map((o, i) => {
            const state = picked ? (i === q.answer ? 'is-right' : picked.value === i ? 'is-wrong' : '') : '';
            return (
              <button key={i} type="button" class={`quiz-option ${state}`} data-quiz-option={i} disabled={Boolean(picked)} onClick={() => runner.answer(i)}>
                {o}
              </button>
            );
          })}
        </div>
      )}
      {q.kind === 'tap' && !picked && <p class="muted small">{Icon.hand({ size: 16 })} Tap it on the board.</p>}
      {q.kind === 'number' && !picked && (
        <form
          class="row gap"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(typed.value);
            if (Number.isFinite(n) && typed.value.trim() !== '') runner.answer(n);
          }}
        >
          <input class="input" inputMode="numeric" aria-labelledby={`quiz-q-${idx}`} value={typed.value} onInput={(e) => (typed.value = (e.currentTarget as HTMLInputElement).value)} data-quiz-number />
          <Button type="submit" variant="primary" size="sm">
            Check
          </Button>
        </form>
      )}
      {picked && (
        <p class={`quiz-why ${picked.correct ? 'is-right' : 'is-wrong'}`} role="status">
          {picked.correct ? Icon.check({ size: 16 }) : Icon.info({ size: 16 })} <b>{picked.correct ? 'Right.' : 'Not quite.'}</b> {q.why}
        </p>
      )}
      <div class="coach-actions">
        <span />
        <Button
          variant="primary"
          size="sm"
          icon="arrowRight"
          disabled={!picked}
          data-coach="quiz-next"
          onClick={() => {
            typed.value = '';
            runner.nextQuestion();
          }}
        >
          {idx + 1 >= total ? 'Finish' : 'Next question'}
        </Button>
      </div>
    </div>
  );
}

export function LessonDone({ runner, onExit }: { runner: TutorialRunner; onExit: () => void }) {
  const r = runner.result.value;
  if (!r) return null;
  const next = nextEntry(runner.lesson.id);
  const label = (id: string) => (id === lessonBadgeId(runner.lesson) ? lessonBadgeLabel(runner.lesson) : (COURSE_BADGES.find((b) => b.id === id)?.label ?? id));
  return (
    <div class="lesson-done" data-lesson-done={r.passed ? 'passed' : 'failed'}>
      <h3>
        {r.passed ? Icon.trophy({ size: 22 }) : Icon.info({ size: 22 })} {r.passed ? 'Lesson passed' : 'Almost there'}
      </h3>
      <p>
        {r.correct} of {r.total} right.{' '}
        {r.passed ? 'Well played.' : `You need ${runner.lesson.quiz.pass} to pass; the lesson stays open to retry.`}
      </p>
      {r.newBadges.length > 0 && (
        <ul class="badge-list" aria-label="New badges">
          {r.newBadges.map((b) => (
            <li key={b} class="badge is-new" data-badge={b}>
              {Icon.star({ size: 16 })} {label(b)}
            </li>
          ))}
        </ul>
      )}
      <div class="coach-actions">
        {!r.passed && (
          <Button variant="secondary" size="sm" icon="undo" onClick={() => runner.retryQuiz()}>
            Try the check again
          </Button>
        )}
        <Button variant="ghost" size="sm" icon="home" onClick={onExit} data-coach="hub">
          Learn hub
        </Button>
        {r.passed && next?.lesson && (
          <Button variant="primary" size="sm" icon="arrowRight" onClick={() => navigate({ name: 'learn', lesson: next.id })}>
            Next: {next.title}
          </Button>
        )}
      </div>
    </div>
  );
}
