/**
 * Coach layer (docs/tutorial-plan.md §4.3), mounted by the Table in tutorial mode: the spotlight
 * (SVG mask with a cutout per target, rings, edge arrows for off-screen board targets), the
 * narration strip (aria-live) with Back / Next / Continue / Skip step / What's this?, the quiz and
 * the lesson-done card. The spotlight never blocks input: the action gate does the constraining.
 */
import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import type { Action } from '@fcm/engine';
import { act } from '../../net/session.js';
import { view } from '../../state/store.js';
import { selection } from '../../state/interaction.js';
import { openSummary, sheetOpen } from '../../ui/uiState.js';
import { Button, IconButton } from '../../ui/common.js';
import { Icon } from '../../ui/icons.js';
import { LessonDone, QuizPanel } from '../../ui/learn/Quiz.js';
import { hasTerm } from '../../ui/glossary/index.js';
import { whatsThis } from '../../ui/glossary/api.js';
import type { Target } from '../dsl.js';
import { matchers } from '../machine.js';
import { activeTutorial, findUiTarget, type TutorialRunner } from '../runner.js';
import { describeTarget, isBoardTarget, targetUiNames } from '../targets.js';
import { useCutouts, type Cutout } from './spotlight.js';
import './coach.css';

export function CoachLayer({ onExit }: { onExit: () => void }) {
  const r = activeTutorial.value;
  if (!r) return null;
  return <Coach runner={r} onExit={onExit} />;
}

function Coach({ runner: r, onExit }: { runner: TutorialRunner; onExit: () => void }) {
  const status = r.status.value;
  const i = r.stepIndex.value;
  void r.tick.value;
  const step = r.lesson.steps[i];
  const hint = r.hintLevel.value;
  const targets: Target[] = status === 'steps' && step ? [...(step.show ?? []), ...(hint > 0 ? (step.hint?.show ?? []) : [])] : [];
  const cuts = useCutouts(targets, `${status}:${i}:${hint > 0}`);
  useDimming(r, status === 'steps' ? targets : []);
  useScrollTargets(targets, `${status}:${i}`);
  const strip = useRef<HTMLElement>(null);
  const top = useStripOnTop(cuts, strip);
  // Desktop: an open Summary card (replay walkthroughs) sits where the strip docks; move beside it.
  const landscape = typeof window !== 'undefined' && window.matchMedia('(max-width: 1180px) and (max-height: 520px) and (orientation: landscape)').matches;
  const beside = !top && !landscape && openSummary.value !== null && typeof window !== 'undefined' && !window.matchMedia('(max-width: 860px)').matches;
  // Landscape phones: the board is small, so the card sits over the dock column whenever the step
  // points at nothing in the dock (board steps, the quiz's tap questions, the lesson's end).
  const dock = landscape ? document.querySelector('.dock')?.getBoundingClientRect() : undefined;
  const inDock = (c: Cutout) => !!dock && c.x < dock.right && c.x + c.w > dock.left && c.y < dock.bottom && c.y + c.h > dock.top;
  const overDock = landscape && (status !== 'steps' || !cuts.some(inDock));
  return (
    <>
      {cuts.length > 0 && <Spotlight cuts={cuts} pulse={hint > 0} />}
      <section
        ref={strip}
        class={`coach-strip glass ${top && !overDock ? 'is-top' : ''} ${beside ? 'is-beside' : ''} ${overDock ? 'is-dock' : ''} ${status !== 'steps' ? 'is-wide' : ''}`}
        role="region"
        aria-label="Lesson coach"
        data-tutorial-strip
        data-lesson={r.lesson.id}
        data-step-id={status === 'steps' ? step?.id : status}
        data-step-index={i}
        data-status={status}
      >
        <header class="coach-head">
          <span class="coach-count">
            {r.lesson.title}
            {status === 'steps' && (
              <>
                {' '}
                · Step {i + 1} / {r.lesson.steps.length}
              </>
            )}
          </span>
          <IconButton icon="x" label="Leave the lesson" data-coach="exit" onClick={onExit} />
        </header>
        <div class="coach-progress" aria-hidden="true">
          <i style={{ width: `${(status === 'steps' ? i / r.lesson.steps.length : 1) * 100}%` }} />
        </div>
        {status === 'steps' && step && <StepBody runner={r} targets={targets} />}
        {status === 'quiz' && <QuizPanel runner={r} />}
        {status === 'done' && <LessonDone runner={r} onExit={onExit} />}
      </section>
    </>
  );
}

function StepBody({ runner: r, targets }: { runner: TutorialRunner; targets: Target[] }) {
  const step = r.step;
  const v = view.value;
  const then = r.thenText.value;
  const notice = r.notice.value;
  const hint = r.hintLevel.value;
  const say = r.say();
  const continueAllowed = step.allow === 'any' || matchers(step.allow).some((m) => m.type === 'tutorial.continue');
  const head = v?.pending[0];
  const paused = head?.kind === 'continue' && head.player === r.me;
  const whats = step.glossary && hasTerm(step.glossary) ? step.glossary : null;
  const board = targets.filter((t) => isBoardTarget(t));
  const described = v && board.length ? board.map((t) => describeTarget(v, t)).join('; ') : '';
  const sendContinue = () => {
    if (head?.kind !== 'continue') return;
    const a: Action = { type: 'tutorial.continue', playerId: r.me, choiceId: head.id };
    act(a);
  };
  return (
    <>
      {r.restarted.value && <p class="coach-notice">The game changed since your last visit, so this lesson starts over.</p>}
      {then && (
        <p class="coach-then">
          {Icon.check({ size: 16 })} {then}
        </p>
      )}
      <p class="coach-say" aria-live="polite" aria-atomic="true" data-coach="say">
        {say}
        {described && <span class="sr-only"> ({described})</span>}
      </p>
      {hint > 0 && (
        <p class="coach-hint" role="status">
          {Icon.info({ size: 16 })} {step.hint?.say ?? say}
        </p>
      )}
      {notice && (
        <p class="coach-notice" role="status" data-coach="notice">
          {notice}
        </p>
      )}
      <div class="coach-actions">
        <span class="coach-left">
          {r.canBack && (
            <Button variant="ghost" size="sm" icon="chevronLeft" data-coach="back" onClick={() => r.back()}>
              Back
            </Button>
          )}
          {whats && (
            <Button variant="ghost" size="sm" icon="info" data-coach="whats" onClick={(e) => whatsThis(whats, e.currentTarget as Element)}>
              What's this?
            </Button>
          )}
        </span>
        <span class="coach-right">
          <Button variant={r.skipHot.value ? 'secondary' : 'ghost'} size="sm" icon="forward" class={r.skipHot.value ? 'is-hot' : ''} busy={r.skipping.value} data-coach="skip" onClick={() => void r.skip()}>
            Skip step
          </Button>
          {continueAllowed && paused && (
            <Button variant="primary" size="sm" icon="play" data-tutorial="continue" data-coach="continue" onClick={sendContinue}>
              Continue
            </Button>
          )}
          {r.offersNext && (
            <Button variant="primary" size="sm" icon="arrowRight" data-coach="next" onClick={() => r.next()}>
              {step.nextLabel ?? 'Next'}
            </Button>
          )}
        </span>
      </div>
    </>
  );
}

function Spotlight({ cuts, pulse }: { cuts: Cutout[]; pulse: boolean }) {
  const visible = cuts.filter((c) => !c.arrow);
  return (
    <div class={`coach-spotlight ${pulse ? 'is-pulse' : ''}`} aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          <mask id="coach-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {visible.map((c) => (
              <rect key={c.key} x={c.x} y={c.y} width={c.w} height={c.h} rx={c.board ? 14 : 10} fill="black" />
            ))}
          </mask>
        </defs>
        <rect class="coach-dim" x="0" y="0" width="100%" height="100%" mask="url(#coach-mask)" />
        {visible.map((c) => (
          <rect key={`r${c.key}`} class="coach-ring" x={c.x} y={c.y} width={c.w} height={c.h} rx={c.board ? 14 : 10} />
        ))}
      </svg>
      {cuts
        .filter((c) => c.arrow)
        .map((c) => (
          <span key={`a${c.key}`} class="coach-arrow" style={{ left: `${c.arrow?.x}px`, top: `${c.arrow?.y}px`, transform: `translate(-50%, -50%) rotate(${c.arrow?.angle ?? 0}rad)` }}>
            {Icon.arrowRight({ size: 22 })}
          </span>
        ))}
    </div>
  );
}

/** Elements outside the step's UI targets get `data-tutorial-dim` (50%, still usable). */
function useDimming(r: TutorialRunner, targets: Target[]): void {
  const key = `${r.stepIndex.value}:${r.status.value}:${targets.length}`;
  useEffect(() => {
    const allow = r.step.allow;
    const names = new Set(targets.flatMap((t) => targetUiNames(t)));
    const active = names.size > 0 && allow !== 'any';
    const pass = () => {
      for (const el of document.querySelectorAll<HTMLElement>('.dock [data-tutorial], .board-controls [data-tutorial], .topbar [data-tutorial]')) {
        const name = el.getAttribute('data-tutorial') ?? '';
        const keep = !active || names.has(name) || [...names].some((n) => el.querySelector(`[data-tutorial="${CSS.escape(n)}"]`) || el.closest(`[data-tutorial="${CSS.escape(n)}"]`));
        if (keep) {
          if (el.hasAttribute('data-tutorial-dim')) {
            el.removeAttribute('data-tutorial-dim');
            if (el.title === 'Not part of this step') el.removeAttribute('title');
          }
        } else if (!el.hasAttribute('data-tutorial-dim')) {
          el.setAttribute('data-tutorial-dim', '');
          if (!el.title) el.title = 'Not part of this step';
        }
      }
    };
    pass();
    const t = setInterval(pass, 500);
    return () => {
      clearInterval(t);
      for (const el of document.querySelectorAll<HTMLElement>('[data-tutorial-dim]')) {
        el.removeAttribute('data-tutorial-dim');
        if (el.title === 'Not part of this step') el.removeAttribute('title');
      }
    };
  }, [key]);
}

/** UI targets scroll into view inside the dock when the step starts. */
function useScrollTargets(targets: Target[], key: string): void {
  useEffect(() => {
    const t = setTimeout(() => {
      for (const target of targets) if (!isBoardTarget(target)) findUiTarget(target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 260);
    return () => clearTimeout(t);
  }, [key]);
}

/** Phones: the strip moves to the top when a target sits in its way (portrait: or the sheet is open). */
function useStripOnTop(cuts: Cutout[], strip: { current: HTMLElement | null }): boolean {
  const top = useSignal(false);
  useEffect(() => {
    const el = strip.current;
    if (!el || typeof window === 'undefined') return;
    const phone = window.matchMedia('(max-width: 860px)').matches;
    // Landscape phones keep the dock beside the board: only a low target (or an Inspect card
    // over the board's corner) moves the strip.
    const landscape = window.matchMedia('(max-width: 1180px) and (max-height: 520px) and (orientation: landscape)').matches;
    if (!phone && !landscape) {
      top.value = false;
      return;
    }
    const h = window.innerHeight;
    const lowTarget = cuts.some((c) => !c.arrow && c.y + c.h > h * 0.55);
    if (landscape) {
      top.value = lowTarget;
      return;
    }
    // An open Inspect card sits at the bottom too: the step often talks about it.
    top.value = sheetOpen.value || lowTarget || openSummary.value !== null || selection.value !== null;
  }, [JSON.stringify(cuts), sheetOpen.value, openSummary.value, selection.value]);
  return top.value;
}
