/**
 * Interactive tutorial (docs/tutorial-plan.md §4.8, WP-T1): Home → Learn hub → Lesson 1 played by a
 * learner through the real UI on desktop and phone, resume after reload at the last checkpoint with
 * an identical history.seq, the badge on the hub, and the framework demo lesson (gate, scripted
 * opponent, paused phases with Continue), also with reduced motion.
 */
import { expect, test, type Page } from '@playwright/test';
import { prepare, trackErrors } from './helpers';
import { openLesson, runLesson, tutorialState } from './tutorial';

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

test.describe('tutorial: desktop', () => {
  test('Home links to the hub; Lesson 1 completes, resumes after reload, awards its badge', async ({ page }) => {
    const errors = await fresh(page);
    await page.goto('/#/');
    await page.locator('[data-learn-entry]').click();
    await expect(page).toHaveURL(/#\/learn$/);
    await expect(page.locator('[data-lesson-card="base.1"]')).toBeVisible();
    await page.locator('[data-start-lesson="base.1"]').click();
    await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });

    // Narration is announced (aria-live) and reaches the accessibility tree.
    const say = page.locator('[data-coach="say"]');
    await expect(say).toHaveAttribute('aria-live', 'polite');
    expect(await page.locator('[data-tutorial-strip]').ariaSnapshot()).toContain('This is a town of nine map tiles');

    // The spotlight rings the step's targets.
    await expect(page.locator('.coach-ring').first()).toBeVisible();

    // Play to just before "tap house 18": the last checkpoint is "distance".
    const seqAt: Record<string, number> = {};
    let s = await runLesson(page, 'base.1', { stopAt: 'tap-house-18', onStep: (st) => void (seqAt[st.stepId] = st.seq) });
    expect(s.stepId).toBe('tap-house-18');
    await page.reload();
    await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });
    s = await tutorialState(page);
    expect(s.stepId).toBe('distance');
    expect(s.startSeq).toBe(seqAt.distance ?? 0);

    const done = await runLesson(page, 'base.1');
    expect(done.result).toMatchObject({ correct: 3, total: 3, passed: true });
    expect(done.result?.newBadges).toContain('lesson:base.1');
    await page.locator('[data-coach="hub"]').click();
    await expect(page.locator('[data-lesson-card="base.1"].is-passed')).toBeVisible();
    await expect(page.locator('[data-badge="lesson:base.1"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('demo lesson: the gate refuses other moves, Bo is scripted, pauses wait for Continue', async ({ page }) => {
    const errors = await fresh(page);
    await openLesson(page, 'dev.demo');
    await page.locator('[data-coach="next"]').click();
    await expect(page.locator('[data-tutorial-strip]')).toHaveAttribute('data-step-id', 'place');
    // A legal spot that is not the one the step asks for: the gate keeps it back and says why.
    const other = page.locator('.placement-btn').filter({ hasNotText: 'Square 3,3 · entrance NW' }).first();
    await other.click();
    await expect(page.locator('[data-coach="notice"]')).toContainText('Not this one');
    expect((await tutorialState(page)).seq).toBe(0);
    const s = await runLesson(page, 'dev.demo');
    expect(s.result?.passed).toBe(true);
    // Bo (scripted) chose a reserve card and ended his turn; the game reached round 2 through two pauses.
    await expect(page.locator('.topbar-round b')).toHaveText('2');
    expect(errors).toEqual([]);
  });

  test('demo lesson with reduced motion; resume lands on the checkpoint with the same seq', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = await fresh(page);
    const seqAt: Record<string, number> = {};
    await runLesson(page, 'dev.demo', { stopAt: 'end-turn', onStep: (st) => void (seqAt[st.stepId] = st.seq) });
    await page.reload();
    await expect(page.locator('[data-tutorial-strip]')).toBeVisible({ timeout: 30_000 });
    const s = await tutorialState(page);
    expect(s.stepId).toBe('reserve');
    expect(s.startSeq).toBe(seqAt.reserve);
    expect((await runLesson(page, 'dev.demo')).result?.passed).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('tutorial: phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Lesson 1 on a 390 px phone', async ({ page }) => {
    const errors = await fresh(page);
    await page.goto('/#/learn');
    await page.locator('[data-start-lesson="base.1"]').click();
    const done = await runLesson(page, 'base.1');
    expect(done.result?.passed).toBe(true);
    expect(errors).toEqual([]);
  });

  test('demo lesson on a phone (Turn panel actions through the sheet)', async ({ page }) => {
    const errors = await fresh(page);
    expect((await runLesson(page, 'dev.demo')).result?.passed).toBe(true);
    expect(errors).toEqual([]);
  });
});
