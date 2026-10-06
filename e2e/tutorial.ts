/**
 * `runLesson(page, lessonId)` (docs/tutorial-plan.md §4.8): plays a lesson through the real UI.
 * For each step it reads the coach strip and `window.__fcmTutorial.current()` (step id, canonical
 * moves), performs the moves the way a learner would (click the `data-tutorial` target, tap the
 * board piece at its projected position, use the Turn panel for actions), waits for the strip to
 * advance, then answers the quiz correctly. Content engineers extend `performAction` when a lesson
 * needs an action type it does not know yet (until then it falls back to Skip step and says so).
 */
import { expect, type Page } from '@playwright/test';
// --- WP-T3: late-lesson action paths (L8–L15) ---
import { clickPlacement, openRestaurantFlow, performLate } from './tutorial-late';
// --- WP-T4: Ketchup action paths ---
import { performKetchup } from './tutorial-ketchup';
// --- WP-T2: early-lesson action paths (L2–L7) ---
import { performEarly } from './tutorial-early';

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
    if (/^(tab-|end-turn|reserve-|order-pos-|payday-|hand-card-|work-card-|hire-|org-|submit-|train-|fire-|drink-|token-|good-|launch-)/.test(t.ui)) await openSheet(page);
    await clickVisible(page, `[data-tutorial="${t.ui}"]`);
    return;
  }
  type Rect = { x: number; y: number; w: number; h: number };
  const rectOf = () => page.evaluate((target) => (window as unknown as { __fcmTutorial: { targetRect(t: unknown): Rect | null } }).__fcmTutorial.targetRect(target), t);
  // The camera may still be gliding (step camera, phone sheet resizing the board): wait until the
  // projected rect holds still for a moment before tapping.
  let r = await rectOf();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120);
    const n = await rectOf();
    const still = r && n && Math.abs(n.x - r.x) < 1 && Math.abs(n.y - r.y) < 1 && Math.abs(n.w - r.w) < 1;
    r = n;
    if (still) break;
  }
  if (!r) throw new Error(`target not on screen: ${JSON.stringify(t)}`);
  // Phones: the bottom sheet or a card may still cover the board there; collapse the sheet and wait
  // until the board itself is under the point.
  {
    const px = r.x + r.w / 2;
    const py = r.y + r.h * (typeof t.house === 'number' ? 0.3 : 0.5);
    for (let i = 0; i < 10; i++) {
      const onBoard = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', [px, py] as const);
      if (onBoard) break;
      if (isPhone(page) && (await page.locator('.dock.is-open').count())) await page.locator('.sheet-handle').click(CLICK).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
  const x = r.x + r.w / 2;
  // Houses: aim at the far (upper) part of the footprint, so a billboard standing in front of the
  // house (nearer the camera) does not take the click.
  const y = r.y + r.h * (typeof t.house === 'number' ? 0.3 : 0.5);
  if (isPhone(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Tap a target until `done` holds (a touch on a gliding board can be lost), at most 3 times. */
async function tapUntil(page: Page, t: Target, done: () => Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 3; tries++) {
    await tapTarget(page, t);
    const ok = await expect
      .poll(done, { timeout: 2500 })
      .toBe(true)
      .then(() => true, () => false);
    if (ok) return;
  }
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
      await openRestaurantFlow(page, a); // WP-T3: Local / Regional Manager flow
      await clickPlacement(page, `Square ${a.x},${a.y} · entrance ${a.entrance}`); // WP-T3: phone-safe row pick
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
      // --- WP-T2: L2–L7 action types (e2e/tutorial-early.ts) ---
      if (await performEarly(page, a)) return true;
      // --- WP-T4: Ketchup action types and campaign kinds (e2e/tutorial-ketchup.ts), tried first ---
      if (await performKetchup(page, a)) return true;
      // --- WP-T3: L8–L15 action types (e2e/tutorial-late.ts) ---
      return performLate(page, a);
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
      // The strip can move as the step settles (phone: sheet opens, strip jumps to the top): if the
      // first press did not land, press again.
      for (let tries = 0; tries < 3; tries++) {
        if (tries > 0) {
          // Only press again when the same step still offers Next (it may be waiting on Bo).
          const again = await tutorialState(page);
          if (again.status !== 'steps' || again.index !== s.index) break;
          if (!(await page.locator('[data-coach="next"]').isVisible().catch(() => false))) break;
        }
        await page.locator('[data-coach="next"]').click(tries > 0 ? { timeout: 2000 } : CLICK).catch((e: unknown) => {
          if (tries === 0) throw e;
        });
        const moved = await expect
          .poll(async () => {
            const n = await tutorialState(page);
            return n.status !== 'steps' || n.index !== s.index;
          }, { timeout: 2500 })
          .toBe(true)
          .then(() => true, () => false);
        if (moved) break;
      }
    } else {
      for (const op of s.solution) {
        // One UI gesture may perform several canonical moves (e.g. "Fire 1 and pay"): stop once the step is done.
        const cur = await tutorialState(page);
        if (cur.status !== 'steps' || cur.index !== s.index) break;
        if ('tap' in op) {
          const target = op.tap as Target;
          const last = op === s.solution[s.solution.length - 1];
          // A board tap that should finish the step: retry if the touch did not register.
          if (last && typeof target.ui !== 'string') {
            await tapUntil(page, target, async () => {
              const n = await tutorialState(page);
              return n.status !== 'steps' || n.index !== s.index;
            });
          } else await tapTarget(page, target);
        }
        else if (
          !(await performAction(page, op as { type: string } & Record<string, unknown>).catch(async (e: unknown) => {
            // The step may have completed while the UI path was still looking for its last control.
            const n = await tutorialState(page);
            if (n.status !== 'steps' || n.index !== s.index) return true;
            throw e;
          }))
        ) {
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
    else if (q.kind === 'tap' && q.target) await tapUntil(page, q.target, async () => Boolean((await tutorialState(page)).quiz?.picked));
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
