/**
 * Ketchup course (docs/tutorial-plan.md §3, WP-T4): the hub locks every Ketchup lesson behind the
 * base course with a "Skip prerequisites" escape; lessons are played as a learner through the real
 * UI (every module action on the board or the Turn panel, nothing skipped) on desktop and phone.
 */
import { expect, test, type Page } from '@playwright/test';
import { prepare, trackErrors } from './helpers';
import { runLesson } from './tutorial';

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
  expect(done.result?.newBadges).toContain(`lesson:${id}`);
  expect(errors).toEqual([]);
}

test.describe('tutorial ketchup: hub', () => {
  test('Ketchup lessons are locked behind the base course; Skip prerequisites opens them', async ({ page }) => {
    const errors = await fresh(page);
    await page.goto('/#/learn');
    const card = page.locator('[data-lesson-card="ketchup.coffee"]');
    await expect(card).toHaveClass(/is-locked/);
    await expect(card.locator('[data-start-lesson]')).toHaveCount(0);
    await card.getByRole('button', { name: 'Skip prerequisites' }).click();
    await expect(card).not.toHaveClass(/is-locked/);
    // One escape opens the whole Ketchup course: the prerequisites are the same base lessons.
    await expect(page.locator('[data-lesson-card="ketchup.sixPlayers"]')).not.toHaveClass(/is-locked/);
    await card.locator('[data-start-lesson="ketchup.coffee"]').click();
    await expect(page.locator('[data-tutorial-strip][data-lesson="ketchup.coffee"]')).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});

/** The whole course in the plan's order (lessons/ketchup/index.ts). */
const COURSE = ['hardChoices', 'reservePrices', 'movieStars', 'fryChefs', 'nightShift', 'kimchi', 'sushi', 'noodles', 'coffee', 'newDistricts', 'lobbyists', 'massMarketeers', 'gourmetCritics', 'ruralMarketeers', 'ketchup', 'newMilestones', 'sixPlayers'].map((m) => `ketchup.${m}`);

test.describe('tutorial ketchup: desktop learner', () => {
  // Every lesson, every Ketchup action type and campaign kind through the UI.
  for (const id of COURSE) {
    test(`${id} as a learner`, async ({ page }) => {
      await play(page, id);
    });
  }
});

test.describe('tutorial ketchup: phone learner', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Board picks through the bottom sheet: a pending-choice placement (coffee shop, map tile) and lobbyist pieces.
  for (const id of ['ketchup.coffee', 'ketchup.lobbyists']) {
    test(`${id} on a 390 px phone`, async ({ page }) => {
      await play(page, id);
    });
  }
});
