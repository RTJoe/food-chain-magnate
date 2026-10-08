import { expect, test } from '@playwright/test';
import { expectBoardSpots, phaseLabel, playUntil, prepare, reservesThenRestaurant, round, trackErrors } from './helpers.js';

test('hot-seat with Ketchup modules: the game starts, reaches Working 9–5 and plays on', async ({ page }) => {
  // Three seats, every module, five rounds through the UI on software GL: ~2 min unloaded.
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await prepare(page, 'Kim');
  await page.goto('/#/hotseat');
  await page.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '3', exact: true }).click();

  // Enable every module except 6 Players (Hard Choices then drops New Milestones: they conflict).
  const modules = page.locator('.module-list .module');
  const count = await modules.count();
  expect(count).toBeGreaterThanOrEqual(15);
  for (let i = 0; i < count; i++) {
    const m = modules.nth(i);
    const name = (await m.locator('.toggle-label').textContent())?.trim() ?? '';
    if (name === '6 Players' || name === 'Hard Choices') continue;
    if (!(await m.locator('input').isChecked())) await m.locator('.toggle').click();
  }
  const on = await page.locator('.module-list .module.is-on .toggle-label').allTextContents();
  expect(on).toEqual(expect.arrayContaining(['Coffee', 'Lobbyists', 'New Milestones', 'Kimchi', 'Rural Marketeers', 'New Districts']));
  await page.getByRole('button', { name: 'Start game' }).click();

  await page.locator('.handoff button').click();
  // Reserve cards first (DLX p4), then the restaurant spots light up on the 3D board.
  await reservesThenRestaurant(page, errors);
  expect(await expectBoardSpots(page)).toBeGreaterThan(0);

  await playUntil(page, async () => (await phaseLabel(page)).startsWith('Working'), { workActions: 2, errors });
  if (await page.locator('.handoff').isVisible()) await page.locator('.handoff button').click();
  await expect(page.locator('.prompt-work')).toBeVisible();

  // Ketchup content is live: the CEO can hire more than the 8 base entry-level cards.
  await page.locator('.work-cards .emp.is-highlight').first().click();
  const hires = page.locator('.card-actions .action-list button:not(.btn-ghost)');
  await expect(hires.first()).toBeVisible();
  expect(await hires.count()).toBeGreaterThan(8);

  // A few more rounds with random legal actions, so module flows (coffee, lobbyists, new
  // milestones, rural marketeers...) get exercised through the UI without errors.
  await playUntil(page, async () => (await round(page)) >= 5, { workActions: 4, fireInRound: 4, errors });
  expect(errors).toEqual([]);
});
