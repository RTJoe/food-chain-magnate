/**
 * Base lessons L2–L7 (docs/tutorial-plan.md §2, WP-T2) played by a learner through the real UI on
 * desktop and on a 390 px phone: every step done the learner's way (no Skip step), every quiz
 * answered, the badge awarded, no page errors or error toasts. Plus resume: a lesson reopened after
 * a reload lands on its last checkpoint with the same history.seq, without replaying the setup
 * board build.
 */
import { expect, test, type Page } from '@playwright/test';
import { prepare, trackErrors } from './helpers';
import { runLesson, tutorialState } from './tutorial';

const LESSONS = ['base.2', 'base.3', 'base.4', 'base.5', 'base.6', 'base.7'];

async function fresh(page: Page): Promise<string[]> {
  await prepare(page, 'Learner');
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fcm.e2e.learn')) {
      localStorage.removeItem('fcm.learn');
      // Campaign spots as a list too (the accessible-picking path), so e2e can pick by coordinates.
      localStorage.setItem('fcm.settings', JSON.stringify({ name: 'Learner', placementList: true }));
      sessionStorage.setItem('fcm.e2e.learn', '1');
    }
  });
  return trackErrors(page);
}

async function playWhole(page: Page, id: string): Promise<void> {
  const errors = await fresh(page);
  const skipped: string[] = [];
  const done = await runLesson(page, id, { skipped });
  expect(skipped).toEqual([]);
  expect(done.result).toMatchObject({ correct: 3, total: 3, passed: true });
  expect(done.result?.newBadges).toContain(`lesson:${id}`);
  expect(errors).toEqual([]);
}

test.describe('tutorial L2–L7: desktop', () => {
  for (const id of LESSONS) test(`${id} completes with no skipped step`, async ({ page }) => playWhole(page, id));

  test('base.2 resumes at its checkpoint without replaying the board build', async ({ page }) => {
    const errors = await fresh(page);
    const seqAt: Record<string, number> = {};
    const s = await runLesson(page, 'base.2', { stopAt: 'neighbours', onStep: (st) => void (seqAt[st.stepId] = st.seq) });
    expect(s.stepId).toBe('neighbours');
    await page.reload();
    await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });
    const now = await tutorialState(page);
    expect(now.stepId).toBe('place');
    expect(now.startSeq).toBe(seqAt.place ?? -1);
    // The setup board build (2.5 s+) is not replayed on resume.
    await page.waitForTimeout(300);
    expect(await page.locator('#board-root canvas').first().getAttribute('data-anim')).not.toBe('playing');
    expect((await runLesson(page, 'base.2')).result?.passed).toBe(true);
    expect(errors).toEqual([]);
  });

  test('base.6 resumes on round 4 restructuring with the same seq', async ({ page }) => {
    const errors = await fresh(page);
    const seqAt: Record<string, number> = {};
    await runLesson(page, 'base.6', { stopAt: 'produce', onStep: (st) => void (seqAt[st.stepId] = st.seq) });
    await page.reload();
    await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });
    const now = await tutorialState(page);
    expect(now.stepId).toBe('restructure');
    // Bo's scripted submission may land before or after the checkpoint is read: within one move.
    expect(Math.abs(now.startSeq - (seqAt.restructure ?? -9))).toBeLessThanOrEqual(1);
    await expect(page.locator('.topbar-round b')).toHaveText('4');
    expect((await runLesson(page, 'base.6')).result?.passed).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('tutorial L2–L7: phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const id of LESSONS) test(`${id} on a 390 px phone`, async ({ page }) => playWhole(page, id));
});

