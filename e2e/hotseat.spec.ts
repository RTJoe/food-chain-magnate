import { expect, test } from '@playwright/test';
import { expectBoardSpots, playUntil, prepare, reservesThenRestaurant, round, trackErrors } from './helpers.js';

test('hot-seat: two players play several rounds through the UI', async ({ page }) => {
  const errors = trackErrors(page);
  await prepare(page, 'Ada');
  await page.goto('/#/hotseat');
  await page.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '2', exact: true }).click();
  await expect(page.locator('.seat-list .seat')).toHaveCount(2);
  await page.getByRole('button', { name: 'Start game' }).click();

  // First player takes the device.
  await page.locator('.handoff button').click();
  // Reserve cards first (DLX p4), then the restaurant spots light up on the 3D board.
  await reservesThenRestaurant(page, errors);
  expect(await expectBoardSpots(page)).toBeGreaterThan(0);

  const trail = await playUntil(page, async () => (await round(page)) >= 4, { workActions: 3, fireInRound: 3, errors });
  expect(trail.some((s) => s.includes('place restaurant'))).toBe(true);
  expect(trail.some((s) => s.includes('structure: submit'))).toBe(true);
  expect(trail.some((s) => s.includes('work: action'))).toBe(true);
  expect(trail.some((s) => s.includes('payday'))).toBe(true);
  expect(trail.some((s) => s.includes('fire+pay'))).toBe(true);
  expect(await round(page)).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});
