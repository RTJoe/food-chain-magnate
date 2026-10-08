/**
 * Board interaction (ux-plan WP6): buyer routes, campaign tokens, inspect cards and the phone strip,
 * all driven through real pointer input on the 3D board. States come from the dev fixtures
 * (`#/dev/<fixture>/<viewer>`): `working` has p2 ("Bo") in the marketing step with a cart operator
 * and a marketing trainee; `dinnertime` has houses with demand, sellers and campaigns.
 *
 * Board points come from the scene handle (`window.__fcmBoard`): `project` for board coordinates,
 * `routeAt` for ribbons, `internals.inter.spotList` for legal campaign spots.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectBoardSpots, prepare, trackErrors } from './helpers.js';

interface Pt {
  x: number;
  y: number;
}

async function openFixture(page: Page, fixture: string, viewer: string): Promise<void> {
  await prepare(page, 'E2E');
  await page.goto(`/#/dev/${fixture}/${viewer}`);
  await expect(page.locator('#board-root canvas').first()).toBeVisible();
}

/** Selects a work card (by employee id: card text also lists what it trains into) and starts its first action. */
async function startAction(page: Page, emp: string): Promise<void> {
  await page.locator(`.work-cards .emp[data-emp="${emp}"]`).click();
  await page.locator('.card-actions .action-list button:not(.btn-ghost)').first().click();
}

const projectPt = (page: Page, x: number, z: number, y = 0.1): Promise<Pt> =>
  page.evaluate(([px, pz, py]) => (window as unknown as { __fcmBoard: { project(x: number, z: number, y: number): Pt } }).__fcmBoard.project(px!, pz!, py!), [x, z, y]);

/** A campaign spot with two orientations (a 3×1 token): its anchor and the centre of its first variant. */
async function twoVariantSpot(page: Page): Promise<{ anchor: [number, number]; centre: Pt }> {
  const r = await page.evaluate(() => {
    const b = (window as unknown as { __fcmBoard: { project(x: number, z: number, y: number): Pt; internals: { inter: { spotList: { key: string; variants: unknown[]; rects: { x0: number; z0: number; x1: number; z1: number }[] }[] } } } }).__fcmBoard;
    const s = b.internals.inter.spotList.find((sp) => sp.variants.length === 2);
    if (!s) return null;
    const rc = s.rects[0]!;
    return { key: s.key, centre: b.project((rc.x0 + rc.x1) / 2, (rc.z0 + rc.z1) / 2, 0.1) };
  });
  expect(r, 'a spot with two variants').not.toBeNull();
  const m = /^campaign:(\d+),(\d+):#/.exec(r!.key);
  expect(m).not.toBeNull();
  return { anchor: [Number(m![1]), Number(m![2])], centre: r!.centre };
}

/** Waits until the camera has stopped moving (a board point projects to the same pixel twice, 250 ms apart). */
async function cameraSettled(page: Page): Promise<void> {
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await projectPt(page, 8, 3, 0));
      const same = now === last;
      last = now;
      if (!same) await page.waitForTimeout(250);
      return same;
    })
    .toBe(true);
}

const strip = (page: Page) => page.locator('.pick-strip');

test('route: pick a haul by clicking its ribbon on the board, then buy it', async ({ page }) => {
  const errors = trackErrors(page);
  await openFixture(page, 'working', 'p2');
  await startAction(page, 'cart_operator');
  await expect(page.locator('.haul-row')).toHaveCount(5);
  await expectBoardSpots(page);
  await expect(page.locator('.haul-row.is-active')).toContainText('6× beer'); // haul 1 is active by default
  await cameraSettled(page);

  // Hover a ribbon that is not haul 1's (ribbons overlap; routeAt returns the nearest). The camera
  // may still be settling, so scan, hover and check again until the hovered haul becomes active.
  let idx = 0;
  let pt: Pt = { x: 0, y: 0 };
  await expect(async () => {
    const hit = await page.evaluate(() => {
      const b = (window as unknown as { __fcmBoard: { routeAt(x: number, y: number): number | null } }).__fcmBoard;
      for (let x = 200; x < 1000; x += 3) {
        for (let y = 150; y < 700; y += 3) {
          const i = b.routeAt(x, y);
          // Only well inside a ribbon (neighbours agree), so a pixel or two of layout shift does not matter.
          if (i !== null && i > 0 && [-4, 4].every((d) => b.routeAt(x + d, y) === i && b.routeAt(x, y + d) === i)) return { idx: i, pt: { x, y } };
        }
      }
      return null;
    });
    expect(hit).not.toBeNull();
    ({ idx, pt } = hit!);
    await page.mouse.move(pt.x, pt.y);
    await expect(page.locator('.haul-row').nth(idx)).toHaveClass(/is-active/, { timeout: 1000 });
    // Click stages the hovered ribbon (a miss would unstage, so the whole sequence is retried).
    await page.mouse.click(pt.x, pt.y);
    await expect(strip(page)).toHaveClass(/is-staged/, { timeout: 1000 });
  }).toPass();
  const row = page.locator('.haul-row').nth(idx);
  await expect(strip(page)).toContainText(`Haul ${idx + 1} of 5`);
  const drinks = (await row.locator('.haul-drink').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()); // "3× beer"
  expect(drinks.length).toBeGreaterThan(0);

  // The strip's Buy commits that exact haul.
  await expect(strip(page)).toContainText(`Haul ${idx + 1} of 5`);
  await strip(page).getByRole('button', { name: 'Buy', exact: true }).click();
  await expect(strip(page)).toHaveCount(0);

  await page.getByRole('tab', { name: /Log/ }).click();
  const log = page.locator('.dock-body');
  for (const d of drinks) {
    const [n, name] = d.split('×').map((s) => s.trim());
    await expect(log).toContainText(`collects`);
    await expect(log).toContainText(`${n} ${name}`);
  }
  // The cart operator is spent; the other haul-1 drinks (lemonade) were not bought.
  await page.getByRole('tab', { name: /Turn/ }).click();
  await expect(page.locator('.work-cards .emp[data-emp="cart_operator"]')).toContainText('Done');
  expect(errors).toEqual([]);
});

test('campaign: token picker, board placement, rotate with R, confirm', async ({ page }) => {
  const errors = trackErrors(page);
  await openFixture(page, 'working', 'p2');
  await startAction(page, 'marketing_trainee');

  // Token picker: every token shows its legal spot count; #13 is the 3×1 (two orientations).
  const tokens = page.locator('.token-row .token-card');
  await expect(tokens).toHaveCount(4);
  await expect(page.locator('.token-card', { hasText: '#13' })).toContainText('Billboard 3×1');
  await page.locator('.token-card', { hasText: '#13' }).click();
  await expect(page.locator('.token-card.is-on')).toContainText('#13');
  await page.locator('.flow-options .chip-food', { hasText: 'Burger' }).click();
  expect(await expectBoardSpots(page)).toBeGreaterThan(0);
  await expect(strip(page)).toContainText('#13 billboard 3×1 (landscape)');

  await cameraSettled(page);
  let anchor: [number, number] = [0, 0];
  await expect(async () => {
    const spot = await twoVariantSpot(page);
    anchor = spot.anchor;
    await page.mouse.click(spot.centre.x, spot.centre.y);
    await expect(strip(page)).toHaveClass(/is-staged/, { timeout: 1000 });
  }).toPass();
  await expect(strip(page)).toContainText(`Tile #13 · 3×1 at ${anchor[0]},${anchor[1]} (landscape)`);

  await page.keyboard.press('r');
  await expect(strip(page)).toContainText(`Tile #13 · 1×3 at ${anchor[0]},${anchor[1]} (portrait)`);
  await strip(page).getByRole('button', { name: /Place/ }).click();
  await expect(strip(page)).toHaveCount(0);

  // The log names the token; the board piece (selected by clicking it) reports number and footprint.
  await page.getByRole('tab', { name: /Log/ }).click();
  await expect(page.locator('.dock-body')).toContainText('launches billboard #13 for burger');
  const centreNow = await projectPt(page, anchor[0] + 0.5, anchor[1] + 1.5, 0.3);
  await expect(async () => {
    await page.mouse.click(centreNow.x, centreNow.y);
    await expect(page.locator('.inspect')).toContainText('#13 Billboard', { timeout: 1000 });
  }).toPass();
  await expect(page.locator('.inspect')).toContainText(`1×3 at ${anchor[0]},${anchor[1]}`);
  expect(errors).toEqual([]);
});

test('inspect: clicking a house opens its card with demand, capacity and sellers', async ({ page }) => {
  const errors = trackErrors(page);
  await openFixture(page, 'dinnertime', 'p2');
  const card = page.locator('.inspect');
  // House 1 (a placed house with a garden at 10,3; 2×2).
  const pt = await projectPt(page, 11, 4, 0.8);
  await expect(async () => {
    await page.mouse.click(pt.x, pt.y);
    await expect(card.locator('h3')).toHaveText('House 1', { timeout: 1000 });
  }).toPass();
  await expect(card).toContainText('2/5 demand'); // 2 burgers; garden raises the cap to 5
  await expect(card).toContainText('Garden');
  await expect(card.locator('.inspect-goods img, .inspect-goods svg')).toHaveCount(2);
  await expect(card).toContainText('Who can sell');
  const sellers = card.locator('.inspect-list').first().locator('li');
  await expect(sellers).toHaveCount(2);
  await expect(card.locator('li.is-win')).toHaveCount(1);
  await expect(card.locator('li.is-win')).toContainText('Ada');
  await expect(sellers.filter({ hasText: 'Bo' })).toContainText('can’t supply');
  await expect(card).toContainText('Campaigns reaching it');
  // Esc clears the selection.
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('entering a placement collapses the sheet to the pick strip; place and confirm from it', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'working', 'p2');
    const dock = page.locator('.dock');
    await expect(dock).toHaveClass(/is-open/);
    await startAction(page, 'marketing_trainee');
    await expect(dock).toHaveClass(/is-open/); // the token picker lives in the sheet

    await page.locator('.token-card', { hasText: '#13' }).click();
    // Token chosen: the sheet stays open until the good is chosen too.
    await expect(dock).toHaveClass(/is-open/);
    await page.locator('.flow-options .chip-food', { hasText: 'Burger' }).tap();
    // The pick starts: sheet slides away, the strip is the only chrome at the bottom.
    await expect(dock).not.toHaveClass(/is-open/);
    await expect(page.locator('.table')).toHaveClass(/is-picking/);
    await expect(strip(page)).toBeVisible();
    await expect(strip(page)).toContainText('#13 billboard 3×1 (landscape)');
    await expectBoardSpots(page);
    await expect.poll(async () => (await dock.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(844);
    const box = (await strip(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);

    // The camera refits once the sheet is gone: re-project and tap until the pick is staged.
    let anchor: [number, number] = [0, 0];
    await expect(async () => {
      const spot = await twoVariantSpot(page);
      anchor = spot.anchor;
      await page.touchscreen.tap(spot.centre.x, spot.centre.y);
      await expect(strip(page)).toHaveClass(/is-staged/, { timeout: 1000 });
    }).toPass();
    await expect(strip(page)).toContainText(`3×1 at ${anchor[0]},${anchor[1]} (landscape)`);
    await strip(page).getByRole('button', { name: 'Rotate' }).tap();
    await expect(strip(page)).toContainText(`1×3 at ${anchor[0]},${anchor[1]} (portrait)`);
    await strip(page).getByRole('button', { name: /Place/ }).tap();

    // Placing launches straight away (the good was chosen first) and the sheet comes back.
    await expect(dock).toHaveClass(/is-open/);
    await page.getByRole('tab', { name: /Log/ }).tap();
    await expect(page.locator('.dock-body')).toContainText('launches billboard #13 for burger');
    expect(errors).toEqual([]);
  });
});
