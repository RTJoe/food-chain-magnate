/**
 * `runLesson(page, lessonId)` (docs/tutorial-plan.md §4.8): plays a lesson through the real UI.
 * For each step it reads the coach strip and `window.__fcmTutorial.current()` (step id, canonical
 * moves), performs the moves the way a learner would (click the `data-tutorial` target, tap the
 * board piece at its projected position, use the Turn panel for actions), waits for the strip to
 * advance, then answers the quiz correctly. Content engineers extend `performAction` when a lesson
 * needs an action type it does not know yet (until then it falls back to Skip step and says so).
 */
import { expect, type Page } from '@playwright/test';

type Target = Record<string, unknown>;
type Op = { tap: Target } | ({ type: string } & Record<string, unknown>);

export interface TutorialState {
  lessonId: string;
  stepId: string;
  index: number;
  status: 'steps' | 'quiz' | 'done';
  offersNext: boolean;
  solution: Op[];
  seq: number;
  startSeq: number;
  quiz: { index: number; question: { kind: string; answer?: number; target?: Target; options?: string[] } | null; picked: unknown } | null;
  result: { correct: number; total: number; passed: boolean; newBadges: string[] } | null;
}

export interface RunLessonOptions {
  /** Stop before this step id (to test resume). */
  stopAt?: string;
  /** Click the speed button to 4× first (default true). */
  fast?: boolean;
  /** Called after each step advanced. */
  onStep?: (s: TutorialState) => Promise<void> | void;
  /** Steps that used Skip step because `performAction` does not know an action type. */
  skipped?: string[];
}

export const tutorialState = (page: Page): Promise<TutorialState> => page.evaluate(() => (window as unknown as { __fcmTutorial: { current(): TutorialState } }).__fcmTutorial.current());

const CLICK = { timeout: 10_000 };

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 860;

/** On a phone, open the bottom sheet so Turn-panel buttons can be clicked. */
async function openSheet(page: Page): Promise<void> {
  if (!isPhone(page)) return;
  if ((await page.locator('.dock.is-open').count()) === 0) {
    // While picking on the board the sheet hides behind the pick strip, which has its own toggle.
    const strip = page.locator('.pick-strip .pick-panel');
    if (await strip.isVisible().catch(() => false)) await strip.click(CLICK);
    else await page.locator('.sheet-handle').click(CLICK);
  }
  const tab = page.locator('[data-tutorial="tab-turn"]');
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click(CLICK);
}

async function clickVisible(page: Page, selector: string): Promise<void> {
  const all = page.locator(selector);
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    const el = all.nth(i);
    if (await el.isVisible()) {
      await el.click(CLICK);
      return;
    }
  }
  await all.first().click(CLICK);
}

async function tapTarget(page: Page, t: Target): Promise<void> {
  if (typeof t.ui === 'string') {
    if (/^(tab-|end-turn|reserve-|order-pos-|payday-|hand-card-|work-card-|hire-)/.test(t.ui)) await openSheet(page);
    await clickVisible(page, `[data-tutorial="${t.ui}"]`);
    return;
  }
  const r = await page.evaluate((target) => (window as unknown as { __fcmTutorial: { targetRect(t: unknown): { x: number; y: number; w: number; h: number } | null } }).__fcmTutorial.targetRect(target), t);
  if (!r) throw new Error(`target not on screen: ${JSON.stringify(t)}`);
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  if (isPhone(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Performs a canonical action through the UI. Returns false when the type is not supported yet. */
export async function performAction(page: Page, a: { type: string } & Record<string, unknown>): Promise<boolean> {
  switch (a.type) {
    case 'tutorial.continue':
      await clickVisible(page, '[data-coach="continue"]');
      return true;
    case 'setup.placeRestaurant':
    case 'work.placeRestaurant': {
      await openSheet(page);
      await page.locator('.placement-btn').filter({ hasText: `Square ${a.x},${a.y} · entrance ${a.entrance}` }).first().click(CLICK);
      return true;
    }
    case 'setup.chooseReserve': {
      await openSheet(page);
      const card = a.card as { amount: number; kind: string; basePrice?: number };
      await clickVisible(page, `[data-tutorial="reserve-${card.amount}${card.kind === 'price' ? `-${card.basePrice}` : ''}"]`);
      return true;
    }
    case 'order.choosePosition':
      await openSheet(page);
      await clickVisible(page, `[data-tutorial="order-pos-${Number(a.position) + 1}"]`);
      return true;
    case 'work.endTurn': {
      await openSheet(page);
      await clickVisible(page, '[data-tutorial="end-turn"]');
      // "Still able to act" confirmation.
      const confirm = page.locator('.end-confirm [data-tutorial="end-turn"]');
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      return true;
    }
    case 'payday.confirm':
      await openSheet(page);
      await clickVisible(page, '[data-tutorial="payday-confirm"]');
      return true;
    default:
      return false;
  }
}

async function waitIdle(page: Page): Promise<void> {
  await page
    .locator('#board-root canvas')
    .first()
    .evaluate((c) => new Promise<void>((resolve) => {
      const t0 = Date.now();
      const tick = () => (c.getAttribute('data-anim') !== 'playing' || Date.now() - t0 > 8000 ? resolve() : setTimeout(tick, 50));
      tick();
    }))
    .catch(() => {});
}

/** Opens `#/learn/<lessonId>` (resuming at its checkpoint) and waits for the coach strip. */
export async function openLesson(page: Page, lessonId: string): Promise<void> {
  await page.goto(`/#/learn/${lessonId}`);
  await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });
  await waitIdle(page);
}

/** Plays the lesson from wherever it is to the end of the quiz. Returns the final state. */
export async function runLesson(page: Page, lessonId: string, opts: RunLessonOptions = {}): Promise<TutorialState> {
  if (!(await page.locator(`[data-tutorial-strip][data-lesson="${lessonId}"]`).count())) await openLesson(page, lessonId);
  if (opts.fast !== false) {
    // 1× → 2× → 4×.
    // dispatchEvent: on a phone the coach strip may sit over the camera bar.
    for (let i = 0; i < 2; i++) await page.locator('[data-tutorial="speed"]').dispatchEvent('click', undefined, { timeout: 3000 }).catch(() => {});
  }
  for (let guard = 0; guard < 200; guard++) {
    const s = await tutorialState(page);
    if (s.status !== 'steps') break;
    if (opts.stopAt === s.stepId) return s;
    if (s.solution.length === 0 && s.offersNext) {
      await page.locator('[data-coach="next"]').click(CLICK);
    } else {
      for (const op of s.solution) {
        if ('tap' in op) await tapTarget(page, op.tap as Target);
        else if (!(await performAction(page, op as { type: string } & Record<string, unknown>))) {
          opts.skipped?.push(`${s.stepId}: ${String(op.type)}`);
          await page.locator('[data-coach="skip"]').click(CLICK);
          break;
        }
        await page.waitForTimeout(150);
        await waitIdle(page);
      }
      // A Next-and-act step: press Next once the moves are done.
      if (s.offersNext && (await page.locator('[data-coach="next"]').isVisible().catch(() => false))) {
        const now = await tutorialState(page);
        if (now.index === s.index && now.status === 'steps') await page.locator('[data-coach="next"]').click();
      }
    }
    await expect
      .poll(async () => {
        const n = await tutorialState(page);
        return n.status !== 'steps' || n.index !== s.index;
      }, { timeout: 15_000, message: `step ${s.stepId} did not complete` })
      .toBe(true);
    await waitIdle(page);
    await opts.onStep?.(await tutorialState(page));
  }
  // Quiz: answer correctly.
  for (let guard = 0; guard < 20; guard++) {
    const s = await tutorialState(page);
    if (s.status !== 'quiz' || !s.quiz?.question) break;
    const q = s.quiz.question;
    if (q.kind === 'choice') await page.locator(`[data-quiz-option="${q.answer}"]`).click();
    else if (q.kind === 'tap' && q.target) await tapTarget(page, q.target);
    else if (q.kind === 'number') {
      const n = await page.evaluate(() => (window as unknown as { __fcmTutorial: { quizAnswer(): unknown } }).__fcmTutorial.quizAnswer());
      await page.locator('[data-quiz-number]').fill(String(n ?? 0));
      await page.locator('[data-quiz-number]').press('Enter');
    }
    await page.locator('[data-coach="quiz-next"]').click();
  }
  await expect(page.locator('[data-lesson-done]')).toBeVisible();
  return tutorialState(page);
}
