/** Rules book (#/rules), glossary, "What's this?" popovers and coach hints in a real table. */
import { expect, test } from '@playwright/test';
import { prepare, trackErrors } from './helpers.js';

test('rules book: chapters by phase, anchors, search, glossary', async ({ page }) => {
  const errors = trackErrors(page);
  await prepare(page, 'E2E');
  await page.goto('/#/rules/dinnertime');
  await expect(page.locator('.rb-chapter h2')).toContainText('Dinnertime');
  await expect(page.locator('.rb-quick')).toContainText('Lowest unit price + distance wins');
  await expect(page.locator('.rb-chapter')).not.toContainText('DLX p');
  await page.locator('.rb-search input').fill('demand cap');
  await expect(page.locator('.rb-hit').first()).toContainText('Demand cap');
  await page.locator('.rb-hit').first().click();
  await expect(page).toHaveURL(/#\/rules\/glossary\/demand_cap$/);
  await expect(page.locator('#term-demand_cap')).toContainText('For example');
  await page.locator('#term-demand_cap .link-btn', { hasText: 'Read the rule' }).click();
  await expect(page).toHaveURL(/#\/rules\/base-phase-6-marketing$/);
  expect(errors).toEqual([]);
});

test('what’s this: card, milestone and phase open the glossary; the rule opens in a sheet over the game', async ({ page }) => {
  const errors = trackErrors(page);
  await prepare(page, 'E2E');
  await page.goto('/#/dev/working/p2');
  await expect(page.locator('#board-root canvas').first()).toBeVisible();
  await page.getByRole('tab', { name: /Staff/ }).click();
  await page.locator('.market .emp[data-emp="cart_operator"]').first().locator('.wt-btn').click();
  const pop = page.locator('.wt-pop');
  await expect(pop).toContainText('Cart Operator');
  await expect(pop).toContainText('For example');
  await pop.locator('.wt-chip', { hasText: 'Buyer route' }).click();
  await expect(pop.locator('h3')).toHaveText('Buyer route');
  await pop.getByRole('button', { name: 'Back' }).click();
  await expect(pop.locator('h3')).toHaveText('Cart Operator');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);

  await page.getByRole('tab', { name: /Milestones/ }).click();
  await page.locator('.milestone', { hasText: 'First to Train' }).locator('.wt-btn').click();
  await expect(pop).toContainText('$15 less salary');
  await pop.getByRole('button', { name: 'Read the rule' }).click();
  await expect(page.locator('.rules-sheet .rb-chapter h2')).toContainText('Milestones');
  await page.locator('.rules-sheet-head').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.rules-sheet')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/dev\/working\/p2$/); // never left the game

  await page.locator('.phase-steps li', { hasText: 'Dinner' }).click();
  await expect(pop.locator('h3')).toHaveText('Dinnertime');
  expect(errors).toEqual([]);
});

test('coach: menu sets the level; off hides hints', async ({ page }) => {
  const errors = trackErrors(page);
  await prepare(page, 'E2E');
  await page.goto('/#/dev/restructuring/p3');
  await expect(page.locator('.topbar')).toBeVisible();
  await page.locator('.topbar-menu').click();
  const coach = page.locator('.coach-setting');
  await expect(coach.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await coach.getByRole('radio', { name: 'Off' }).click();
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fcm.coach') ?? '{}').level)).toBe('off');
  expect(errors).toEqual([]);
});
