/**
 * Late base lessons (docs/tutorial-plan.md §2 L8–L14, WP-T3) played by a learner through the real
 * UI on desktop and on a 390 px phone: every step's canonical move goes through the UI (no Skip
 * step), the quiz is passed, and nothing errors. One lesson also resumes after a reload.
 */
import { expect, test, type Page } from '@playwright/test';
import { prepare, trackErrors } from './helpers';
import { runLesson, tutorialState } from './tutorial';

const LESSONS = ['base.8', 'base.9', 'base.10', 'base.11', 'base.12', 'base.13', 'base.14'];

async function fresh(page: Page): Promise<string[]> {
  await prepare(page, 'Learner');
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fcm.e2e.learn')) {
      localStorage.removeItem('fcm.learn');
      sessionStorage.setItem('fcm.e2e.learn', '1');
    }
  });
  return trackErrors(page);
}

async function play(page: Page, id: string): Promise<void> {
  const errors = await fresh(page);
  const skipped: string[] = [];
  const done = await runLesson(page, id, { skipped });
  expect(skipped).toEqual([]);
  expect(done.result?.passed).toBe(true);
  expect(errors).toEqual([]);
}

test.describe('late lessons: desktop', () => {
  for (const id of LESSONS) test(`${id} completes through the UI`, async ({ page }) => play(page, id));

  test('base.9 resumes at its last checkpoint after a reload', async ({ page }) => {
    const errors = await fresh(page);
    const seqAt: Record<string, number> = {};
    const skipped: string[] = [];
    await runLesson(page, 'base.9', { stopAt: 'overfill', skipped, onStep: (st) => void (seqAt[st.stepId] = st.seq) });
    await page.reload();
    await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });
    const s = await tutorialState(page);
    expect(s.stepId).toBe('submit');
    expect(s.startSeq).toBe(seqAt.submit ?? 0);
    expect((await runLesson(page, 'base.9', { skipped })).result?.passed).toBe(true);
    expect(skipped).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('late lessons: phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const id of LESSONS) test(`${id} completes on a 390 px phone`, async ({ page }) => play(page, id));
});
