import { expect, test, type Page } from '@playwright/test';
import { phaseLabel, playUntil, prepare, round, trackErrors } from './helpers.js';

async function sitAndReady(page: Page): Promise<void> {
  const seatMe = page.locator('.seat-me');
  if (!(await seatMe.locator('.toggle').count())) await page.getByRole('button', { name: 'Sit here' }).first().click();
  const ready = seatMe.locator('.toggle input');
  await expect(ready).toBeVisible();
  if (!(await ready.isChecked())) await seatMe.locator('.toggle').click();
  await expect(ready).toBeChecked();
}

test('online: create, join, sit, ready, start; a reload keeps the seat', async ({ browser }) => {
  // Two pages boot WebGL scenes on software GL at once (the second waits ~10–16 s for the GPU process), then play a round each.
  test.setTimeout(240_000);
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const hostErrors = trackErrors(host);
  const guestErrors = trackErrors(guest);
  await prepare(host, 'Hana');
  await prepare(guest, 'Gus');

  // Host creates a room and picks 2 players.
  await host.goto('/');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host).toHaveURL(/#\/room\/[A-Z0-9]{5}$/);
  const code = (await host.locator('.room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await host.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '2', exact: true }).click();

  // Guest follows the join link.
  await guest.goto(`/#/room/${code}`);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.locator('.room-code')).toHaveText(code);

  await sitAndReady(host);
  await sitAndReady(guest);
  await expect(host.locator('.seat-list .seat .seat-ready')).toHaveCount(2);
  await host.getByRole('button', { name: 'Start game' }).click();

  for (const p of [host, guest]) await expect(p.locator('.table')).toBeVisible({ timeout: 60_000 });
  await expect(guest.locator('.ppanel.is-me .ppanel-name')).toContainText('Gus');

  // Play through setup into round 1 with both browsers.
  await playUntil([host, guest], async () => (await round(host)) >= 1 && (await round(guest)) >= 1, { workActions: 1 });

  // Reload the guest: the session token re-attaches the same seat.
  const before = await phaseLabel(guest);
  await guest.reload();
  await expect(guest.locator('.table')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('.ppanel.is-me .ppanel-name')).toContainText('Gus');
  await expect(guest.locator('.ppanel.is-me')).toHaveCount(1);
  expect(await round(guest)).toBeGreaterThanOrEqual(1);
  expect(before).not.toBe('');
  await expect(host.locator('.ppanel', { hasText: 'Gus' }).locator('.dot.is-on')).toBeVisible({ timeout: 15_000 });

  // And the game carries on from both browsers after the reload.
  const r = await round(host);
  await playUntil([host, guest], async () => (await round(host)) > r, { workActions: 1 });

  expect(hostErrors).toEqual([]);
  expect(guestErrors).toEqual([]);
  await hostCtx.close();
  await guestCtx.close();
});
