import { expect, test } from '@playwright/test';
import { prepare, trackErrors } from './helpers.js';

/**
 * Animation controls (animation-plan §1.4, §1.6): the speed cycle is 1× / 2× / 4×, and "Follow the
 * action" is off by default, toggles and is remembered on the device. The board canvas reports
 * `data-anim` so other specs can wait for idle.
 */
test('board controls: speed cycle and follow-the-action toggle (remembered)', async ({ page }) => {
  const errors = trackErrors(page);
  await prepare(page, 'Ada');
  await page.goto('/#/hotseat');
  await page.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.locator('.handoff button').click();
  await expect(page.locator('#board-root canvas')).toHaveAttribute('data-anim', /idle|playing/);

  const speed = page.locator('.speed-btn');
  await expect(speed).toHaveText('1×');
  await speed.click();
  await expect(speed).toHaveText('2×');
  await speed.click();
  await expect(speed).toHaveText('4×');
  await speed.click();
  await expect(speed).toHaveText('1×');

  const follow = page.getByRole('button', { name: 'Follow the action' });
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await follow.click();
  const stop = page.getByRole('button', { name: 'Stop following the action' });
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('fcm.followAction'))).toBe('1');
  await stop.click();
  await expect(page.getByRole('button', { name: 'Follow the action' })).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
