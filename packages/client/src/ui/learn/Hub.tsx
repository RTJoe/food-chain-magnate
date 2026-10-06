/**
 * Learn hub (#/learn, docs/tutorial-plan.md §4.5): Continue card, the base and Ketchup course maps,
 * badges, links to the rules reference and glossary, progress export / import.
 */
import { useSignal } from '@preact/signals';
import { COURSES, entryById, lockedBy, type CourseEntry } from '../../tutorial/catalog.js';
import { exportProgress, importProgress, learnProgress } from '../../tutorial/progress.js';
import { navigate } from '../../state/router.js';
import { Button } from '../common.js';
import { Icon, Logo } from '../icons.js';
import { Badges } from './Badges.js';
import { LessonCard, statusLabel } from './LessonCard.js';
import './learn.css';

/** The lesson to continue: the last opened unfinished one, else the first playable not passed. */
export function continueEntry(): CourseEntry | null {
  const p = learnProgress.value;
  const last = p.last ? entryById(p.last) : undefined;
  if (last?.lesson && p.lessons[last.id]?.status === 'started') return last;
  for (const e of [...COURSES.base, ...COURSES.ketchup]) {
    if (!e.lesson) continue;
    const s = p.lessons[e.id]?.status ?? 'new';
    if (s !== 'passed' && s !== 'skipped' && !lockedBy(e, p).length) return e;
  }
  return null;
}

function ContinueCard() {
  const e = continueEntry();
  if (!e) return null;
  const p = learnProgress.value.lessons[e.id] ?? { status: 'new' as const };
  const st = statusLabel(p);
  return (
    <section class="learn-continue glass" aria-label="Continue">
      <span class="home-card-icon tone-accent">{Icon.play({ size: 24 })}</span>
      <div>
        <p class="eyebrow">{p.stepId ? 'Pick up where you left off' : 'Next up'}</p>
        <h2>{e.title}</h2>
        <p class="muted small">
          {e.minutes} min · {st.text}
        </p>
      </div>
      <Button variant="primary" size="lg" icon="arrowRight" data-continue-lesson={e.id} onClick={() => navigate({ name: 'learn', lesson: e.id })}>
        {p.stepId ? 'Resume' : 'Start'}
      </Button>
    </section>
  );
}

function ProgressTools() {
  const msg = useSignal<string | null>(null);
  const download = () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fcm-learn-progress.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const upload = (e: Event) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    void f.text().then((t) => (msg.value = importProgress(t) ? 'Progress imported.' : 'That file is not a progress export.'));
  };
  return (
    <div class="learn-tools-row">
      <Button size="sm" variant="ghost" icon="copy" onClick={download}>
        Export progress
      </Button>
      <label class="btn btn-ghost btn-sm">
        {Icon.link({ size: 16 })}
        <span>Import progress</span>
        <input type="file" accept="application/json,.json" class="sr-only" onChange={upload} />
      </label>
      {msg.value && <span class="muted small" role="status">{msg.value}</span>}
    </div>
  );
}

export function LearnHub() {
  return (
    <main class="learn">
      <div class="home-bg" aria-hidden="true" />
      <header class="learn-hero">
        <a href="#/" class="learn-back" aria-label="Back home">
          {Icon.chevronLeft({ size: 18 })} Home
        </a>
        <div class="learn-title">
          <Logo size={56} />
          <div>
            <p class="eyebrow">Interactive tutorial</p>
            <h1>Learn to play</h1>
            <p class="lede">Short lessons on the real board, one idea at a time. Every lesson ends with a three-question check.</p>
          </div>
        </div>
      </header>
      <ContinueCard />
      <section class="learn-course" aria-labelledby="course-base">
        <h2 id="course-base">Base game</h2>
        <p class="muted small">About 2.5 hours in sessions as short as one lesson. Ends with a guided game against an Easy bot.</p>
        <div class="lesson-grid">
          {COURSES.base.map((e, i) => (
            <LessonCard key={e.id} entry={e} index={i} />
          ))}
        </div>
      </section>
      <section class="learn-course" aria-labelledby="course-ketchup">
        <h2 id="course-ketchup">Ketchup expansion</h2>
        <p class="muted small">One lesson per module, in any order once the base course is passed or skipped.</p>
        <div class="lesson-grid">
          {COURSES.ketchup.map((e, i) => (
            <LessonCard key={e.id} entry={e} index={i} />
          ))}
        </div>
      </section>
      <Badges />
      <section class="learn-tools glass" aria-label="Reference">
        <h2>Reference</h2>
        <div class="learn-tools-row">
          <a class="btn btn-secondary btn-sm" href="#/rules">
            {Icon.log({ size: 16 })}
            <span>Rules reference</span>
          </a>
          <a class="btn btn-secondary btn-sm" href="#/rules/glossary">
            {Icon.info({ size: 16 })}
            <span>Glossary</span>
          </a>
        </div>
        <ProgressTools />
      </section>
    </main>
  );
}
