import { expect, test } from '@playwright/test';
import { playUntil, prepare, round, trackErrors } from './helpers.js';

test('online: host adds two Easy bots, starts, and plays rounds while the bots act', async ({ page }) => {
  const errors = trackErrors(page);
  await prepare(page, 'Hana');
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page).toHaveURL(/#\/room\/[A-Z0-9]{5}$/);
  await page.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '3', exact: true }).click();

  // Sit and get ready.
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  const ready = page.locator('.seat-me .toggle input');
  await expect(ready).toBeVisible();
  await page.locator('.seat-me .toggle').click();
  await expect(ready).toBeChecked();

  // Two Easy bots on the open seats.
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Add bot/ }).first().click();
    await page.getByRole('menuitem', { name: /Easy/ }).click();
  }
  await expect(page.locator('.seat.is-bot')).toHaveCount(2);
  await expect(page.locator('.seat.is-bot .bot-badge').first()).toContainText('Easy');
  await expect(page.locator('.seat-list .seat .seat-ready')).toHaveCount(3);

  // Remove one and add it back (host controls).
  await page.getByRole('button', { name: /Remove bot from seat/ }).first().click();
  await expect(page.locator('.seat.is-bot')).toHaveCount(1);
  await page.getByRole('button', { name: /Add bot/ }).first().click();
  await page.getByRole('menuitem', { name: /Easy/ }).click();
  await expect(page.locator('.seat.is-bot')).toHaveCount(2);

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.table')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ppanel.is-bot')).toHaveCount(2);
  await expect(page.locator('.ppanel.is-bot .bot-badge').first()).toContainText('Easy');

  // The human plays; the bots answer on their own (the driver only ever clicks for the human).
  let sawThinking = false;
  const watch = setInterval(() => {
    void page
      .locator('.ppanel-thinking')
      .count()
      .then((n) => {
        if (n > 0) sawThinking = true;
      })
      .catch(() => {});
  }, 100);
  try {
    await playUntil(page, async () => (await round(page)) >= 3, { workActions: 2, errors, idleMs: 20_000 });
  } finally {
    clearInterval(watch);
  }
  expect(await round(page)).toBeGreaterThanOrEqual(3);
  expect(sawThinking).toBe(true);
  // Bots built something: each owns a restaurant on the board.
  const pips = page.locator('.ppanel.is-bot .pips i.is-on');
  expect(await pips.count()).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('hot-seat: a bot seat plays itself in a Web Worker; no handoff to it', async ({ page }) => {
  const errors = trackErrors(page);
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await prepare(page, 'Solo');
  await page.goto('/#/hotseat');
  await page.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '2', exact: true }).click();
  await page.getByLabel('Player 2 is played by').selectOption('easy');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.ppanel.is-bot')).toHaveCount(1, { timeout: 20_000 });
  const trail = await playUntil(page, async () => (await round(page)) >= 2, { workActions: 2, errors, idleMs: 20_000 });
  // Only the start-of-game handoff to the human; never one for the bot.
  expect(trail.filter((t) => t.endsWith('handoff')).length).toBeLessThanOrEqual(1);
  expect(workers.some((u) => u.includes('botWorker'))).toBe(true);
  expect(errors).toEqual([]);
});
