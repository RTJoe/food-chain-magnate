/**
 * WP-T3 UI paths for `performAction` (e2e/tutorial.ts): the action types the late base lessons
 * (L8–L15) need, played the way a learner does: tap the card in the Turn panel, then the picker,
 * token, good, haul row or placement row. Kept in its own file so the lesson packages extending
 * `performAction` do not edit the same lines.
 */
import type { Page } from '@playwright/test';

type A = { type: string } & Record<string, unknown>;

const CLICK = { timeout: 10_000 };
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 860;

/** On a phone, open the bottom sheet on the Turn tab (the pick strip has its own toggle). */
export async function openTurnSheet(page: Page): Promise<void> {
  if (isPhone(page) && (await page.locator('.dock.is-open').count()) === 0) {
    const strip = page.locator('.pick-strip .pick-panel');
    if (await strip.isVisible().catch(() => false)) await strip.click(CLICK);
    else await page.locator('.sheet-handle').click(CLICK);
  }
  const tab = page.locator('[data-tutorial="tab-turn"]');
  if ((await tab.count()) && (await tab.getAttribute('aria-selected')) !== 'true') await tab.click(CLICK);
}

async function clickVisible(page: Page, selector: string): Promise<void> {
  const all = page.locator(selector);
  await all.first().waitFor({ state: 'attached', timeout: 10_000 });
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    const el = all.nth(i);
    if (await el.isVisible()) {
      await el.click(CLICK);
      return;
    }
  }
  await all.first().click(CLICK);
}

const visible = async (page: Page, selector: string) => {
  const l = page.locator(selector);
  return (await l.count()) > 0 && (await l.first().isVisible().catch(() => false));
};

/** Select a card at work (Turn panel) so its actions show; idempotent. */
export async function selectWorkCard(page: Page, uid: string): Promise<void> {
  await openTurnSheet(page);
  // A sub-flow left open by an earlier pick: back out to the card list.
  const back = page.locator('.work .flow .flow-head button');
  if (await back.first().isVisible().catch(() => false)) await back.first().click(CLICK);
  const card = page.locator(`[data-tutorial="work-card-${uid}"]`).first();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  if (!/is-selected/.test((await card.getAttribute('class')) ?? '')) await card.click(CLICK);
}

/** Click a placement row by its text; on a phone the board pick collapses the sheet, so reopen it first. */
export async function clickPlacement(page: Page, text: string): Promise<void> {
  const row = page.locator('.placement-btn').filter({ hasText: text }).first();
  if (!isPhone(page)) {
    await row.click(CLICK);
    return;
  }
  // Phones: the board pick collapses the sheet behind the pick strip (sometimes just after the list
  // showed). Reopen it and retry until the row takes the tap.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    if (!(await row.isVisible().catch(() => false))) await openTurnSheet(page);
    try {
      await row.click({ timeout: 2500 });
      return;
    } catch {
      /* the sheet moved: try again */
    }
  }
  await row.click(CLICK);
}

/** Click a button of the selected card's action list by its label. */
async function cardButton(page: Page, label: RegExp): Promise<void> {
  const btn = page.locator('.card-actions button').filter({ hasText: label }).first();
  await btn.waitFor({ state: 'visible', timeout: 10_000 });
  await btn.click(CLICK);
}

/** Restructuring: place the submitted structure with taps (hand card, then slot), then submit. */
async function submitStructure(page: Page, a: A): Promise<void> {
  await openTurnSheet(page);
  const s = a.structure as { ceoSubs: string[]; managerSubs: Record<string, string[]> };
  // The draft may already hold the structure (earlier steps built it): only place what is missing.
  const placed = async (uid: string) => (await page.locator(`.org-tree [data-tutorial="org-card-${uid}"]`).count()) > 0;
  const handCard = async (uid: string) => {
    const empId = await page.evaluate((u) => {
      const t = (window as unknown as { __fcmTutorial?: { employeeOf?(uid: string): string | null } }).__fcmTutorial;
      return t?.employeeOf?.(u) ?? null;
    }, uid);
    return page.locator(`.org-hand [data-tutorial="hand-card-${empId ?? ''}"]`).first();
  };
  for (const uid of s.ceoSubs) {
    if (await placed(uid)) continue;
    await (await handCard(uid)).click(CLICK);
    await page.locator('.org-tree .slot-ceo.is-target').first().click(CLICK);
  }
  for (const [m, subs] of Object.entries(s.managerSubs)) {
    for (const uid of subs) {
      if (await placed(uid)) continue;
      await (await handCard(uid)).click(CLICK);
      await page.locator(`[data-tutorial^="org-mslot-${m}-"]`).first().click(CLICK);
    }
  }
  await clickVisible(page, '[data-tutorial="submit-structure"]');
}

/**
 * Performs `a` through the UI when it is one of the late lessons' action types. Returns false for
 * any other type (the caller then presses Skip step and records it).
 */
export async function performLate(page: Page, a: A): Promise<boolean> {
  switch (a.type) {
    case 'restructure.submit':
      await submitStructure(page, a);
      return true;
    case 'work.recruit':
      await selectWorkCard(page, String(a.cardUid));
      await clickVisible(page, `[data-tutorial="hire-${String(a.employeeId)}"]`);
      return true;
    case 'work.train': {
      await selectWorkCard(page, String(a.trainerUid));
      const target = `[data-tutorial="train-target-${String(a.targetUid)}"]`;
      if (await visible(page, target)) await clickVisible(page, target);
      await clickVisible(page, `[data-tutorial="train-${String(a.toEmployeeId)}"]`);
      return true;
    }
    case 'work.produce': {
      await selectWorkCard(page, String(a.cardUid));
      const chip = `[data-tutorial="produce-${String(a.food ?? '')}"]`;
      if (a.food && (await visible(page, chip))) {
        await clickVisible(page, chip);
        return true;
      }
      if (a.food) {
        // Kitchen trainee: a ready button per food ("Make burger") or a picker.
        const named = page.locator('.card-actions button').filter({ hasText: new RegExp(String(a.food).replace('_', '.'), 'i') });
        if (await named.first().isVisible().catch(() => false)) {
          await named.first().click(CLICK);
          if (await visible(page, chip)) await clickVisible(page, chip);
          return true;
        }
      }
      await page.locator('.card-actions button').first().click(CLICK);
      if (a.food && (await visible(page, chip))) await clickVisible(page, chip);
      return true;
    }
    case 'work.buyDrinks': {
      await selectWorkCard(page, String(a.cardUid));
      const route = a.route as { mode: string; drink?: string };
      if (route.mode === 'errand') {
        await cardButton(page, new RegExp(`get ${route.drink}`, 'i'));
        return true;
      }
      const drinks = await page.evaluate((act) => (window as unknown as { __fcmTutorial: { haul(a: unknown): { drink: string; count: number }[] | null } }).__fcmTutorial.haul(act), a);
      await cardButton(page, /drinks|route|haul/i);
      // Phones: picking a route collapses the sheet behind the pick strip; reopen it for the haul list.
      if (isPhone(page)) {
        await page.locator('.pick-strip').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await openTurnSheet(page);
      }
      let rows = page.locator('.haul-row');
      for (const d of drinks ?? []) rows = rows.filter({ hasText: new RegExp(`${d.count}× ${d.drink.replace('_', ' ')}`, 'i') });
      const row = rows.first();
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      // A tap makes the haul active (ribbon on the board); tapping the active haul buys it.
      // (Hovering also activates it on desktop.)
      if (!isPhone(page)) await row.hover();
      if ((await row.getAttribute('aria-pressed')) !== 'true') await row.click(CLICK);
      if (await row.isVisible().catch(() => false)) await row.click(CLICK);
      return true;
    }
    case 'work.placeCampaign': {
      await selectWorkCard(page, String(a.cardUid));
      await cardButton(page, /campaign|billboard|mailbox|airplane|radio/i);
      const tile = `[data-tutorial="token-${String(a.tileNumber)}"]`;
      const tok = page.locator(tile).first();
      await tok.waitFor({ state: 'visible', timeout: 10_000 });
      if ((await tok.getAttribute('aria-checked')) !== 'true') await tok.click(CLICK);
      const goods = a.goods as string[];
      if (goods[0]) await clickVisible(page, `[data-tutorial="good-${goods[0]}"]`);
      // Duration: the stepper starts at the maximum; step down to the action's value.
      const dur = page.locator('[data-tutorial="duration"]');
      if (await dur.isVisible().catch(() => false)) {
        const down = dur.locator('button').first();
        for (let i = 0; i < 6; i++) {
          const val = Number.parseInt((await dur.locator('output, .stepper-value, [aria-live]').first().textContent().catch(() => '')) ?? '', 10);
          if (!Number.isFinite(val) || val <= Number(a.duration)) break;
          await down.click(CLICK);
        }
      }
      const pl = a.placement as { kind: string; x: number; y: number; w: number; h: number };
      const text = pl.kind === 'board' ? `Tile #${String(a.tileNumber)} · ${pl.w}×${pl.h} at ${pl.x},${pl.y}` : `Tile #${String(a.tileNumber)}`;
      await clickPlacement(page, text);
      // "Held" pick (good chosen after the spot): launch it.
      const launch = page.locator('.held-pick button').filter({ hasText: /Launch/ });
      if (await launch.isVisible().catch(() => false)) await launch.click(CLICK);
      return true;
    }
    case 'work.placeGarden': {
      await selectWorkCard(page, String(a.cardUid));
      await cardButton(page, /garden/i);
      const label = await page.evaluate((hid) => (window as unknown as { __fcmTutorial: { houseLabel?(id: string): string | null } }).__fcmTutorial.houseLabel?.(hid) ?? null, String(a.houseId));
      await clickPlacement(page, `Garden for house ${label ?? ''} · side ${String(a.side)}`);
      return true;
    }
    case 'work.placeHouse': {
      await selectWorkCard(page, String(a.cardUid));
      await cardButton(page, /house/i);
      const chip = page.locator('.house-chip').filter({ hasText: new RegExp(`^\\s*#${String(a.houseOrder)}(?!\\d)`) }).first();
      if ((await chip.count()) && (await chip.getAttribute('aria-checked')) !== 'true') await chip.click(CLICK);
      await clickPlacement(page, `House #${String(a.houseOrder)} at ${String(a.x)},${String(a.y)} · garden ${String(a.gardenSide)}`);
      return true;
    }
    case 'payday.fire': {
      await openTurnSheet(page);
      for (const u of a.uids as string[]) {
        const card = page.locator(`[data-tutorial="fire-${u}"]`).first();
        if (!/is-selected/.test((await card.getAttribute('class')) ?? '')) await card.click(CLICK);
      }
      // Forced firing has its own "Fire N" button; voluntary firing pays in the same click.
      const forced = page.locator('.choice button').filter({ hasText: /^\s*Fire \d/ });
      if (await forced.first().isVisible().catch(() => false)) await forced.first().click(CLICK);
      else await clickVisible(page, '[data-tutorial="payday-confirm"]');
      return true;
    }
    case 'cleanup.freezer':
      await openTurnSheet(page);
      await clickVisible(page, '.freezer-panel .row.end button');
      return true;
    default:
      return false;
  }
}

/** Opens the card's restaurant placement flow (Local / Regional Manager) before the placement row is picked. */
export async function openRestaurantFlow(page: Page, a: A): Promise<void> {
  if (a.type !== 'work.placeRestaurant' || (await visible(page, '.placement-btn'))) return;
  await selectWorkCard(page, String(a.cardUid));
  await cardButton(page, /restaurant/i);
}
