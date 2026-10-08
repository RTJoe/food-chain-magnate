/**
 * WP-T4 UI paths for `performAction` (e2e/tutorial.ts): the Ketchup action types and the Ketchup
 * campaign kinds the Ketchup lessons need, played the way a learner does (card in the Turn panel,
 * then the piece / token / good, then the placement row; pending choices through the Turn panel's
 * choice button). Base work actions (train, produce, hire, billboards, restructure) are handled by
 * e2e/tutorial-late.ts. Tried before it; returns false for anything else.
 */
import type { Locator, Page } from '@playwright/test';
import { openTurnSheet, selectWorkCard } from './tutorial-late';

type A = { type: string } & Record<string, unknown>;
/** True once the action went through (the flow may commit by itself, e.g. a staged gourmet guide). */
type Done = () => Promise<boolean>;

const seqOf = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __fcmTutorial: { current(): { seq: number } } }).__fcmTutorial.current().seq);

const CLICK = { timeout: 10_000 };

/**
 * Click `l` once it is reachable. Phone: entering a board pick collapses the sheet behind the pick
 * strip a moment after a flow opens, so the sheet is reopened (pick strip toggle) and the click
 * retried until it lands.
 */
async function clickReached(page: Page, l: Locator, done: Done = async () => false): Promise<void> {
  for (let i = 0; i < 8; i++) {
    if (await done()) return;
    for (let j = 0; j < 8 && !(await l.isVisible().catch(() => false)); j++) {
      if (await done()) return;
      await page.waitForTimeout(250);
      await openTurnSheet(page);
    }
    try {
      await l.click({ timeout: 2000 });
      return;
    } catch {
      await page.waitForTimeout(300);
    }
  }
  await l.click(CLICK);
}

/** Click a placement row by its text (list fallback, settings.placementList). */
async function placementRow(page: Page, text: string, done?: Done): Promise<void> {
  await clickReached(page, page.locator('.placement-btn').filter({ hasText: text }).first(), done);
}

/**
 * A pending choice (coffee shop, map tile, freeway, pizza radio): open its placement flow from the
 * Turn panel's choice button and pick the row. The panel can re-render while Dinnertime or Working
 * feedback finishes (closing the flow), so the button is pressed again until the row is there.
 */
async function choiceRow(page: Page, label: RegExp, text: string, done: Done): Promise<void> {
  const btn = page.locator('.choice button').filter({ hasText: label }).first();
  const row = page.locator('.choice .placement-btn').filter({ hasText: text }).first();
  await openTurnSheet(page);
  for (let i = 0; i < 40; i++) {
    if (await done()) return;
    if (await row.isVisible().catch(() => false)) {
      try {
        await row.click({ timeout: 2000 });
        return;
      } catch {
        /* moved or hidden: look again */
      }
    } else if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
    } else {
      await openTurnSheet(page);
    }
    await page.waitForTimeout(300);
  }
  await row.click(CLICK);
}

/** The selected card's action button (Lobbyist: build a road / lay out a park; marketeers: place / launch). */
async function cardButton(page: Page, label: RegExp): Promise<void> {
  const btn = page.locator('.card-actions button').filter({ hasText: label }).first();
  await btn.waitFor({ state: 'attached', timeout: 15_000 });
  await clickReached(page, btn);
}

/** Lobbyist pieces: choose the shape chip ("3-square road", "1×3 park") when it is not the active one. */
async function pieceChip(page: Page, label: string): Promise<void> {
  const chip = page.locator('.kf-piece').filter({ hasText: label }).first();
  await chip.waitFor({ state: 'attached', timeout: 10_000 });
  if ((await chip.getAttribute('aria-checked')) !== 'true') await clickReached(page, chip);
}

/** Performs a Ketchup action through the UI. Returns false when `a` is not one this block handles. */
export async function performKetchup(page: Page, a: A): Promise<boolean> {
  const seq0 = await seqOf(page);
  const done: Done = async () => (await seqOf(page).catch(() => seq0)) > seq0;
  switch (a.type) {
    case 'work.placeCampaign': {
      const kind = String(a.campaignKind);
      if (kind !== 'gourmetGuide' && kind !== 'giantBillboard') return false;
      await selectWorkCard(page, String(a.cardUid));
      await cardButton(page, /campaign|gourmet|giant/i);
      const goods = a.goods as string[];
      if (kind === 'giantBillboard') {
        const tok = page.locator(`[data-tutorial="token-${String(a.tileNumber)}"]`).first();
        await tok.waitFor({ state: 'visible', timeout: 10_000 });
        if ((await tok.getAttribute('aria-checked')) !== 'true') await clickReached(page, tok);
        if (goods[0]) await clickReached(page, page.locator(`[data-tutorial="good-${goods[0]}"]`).first(), done);
        const side = (a.placement as { side: string }).side;
        await placementRow(page, `Tile #${String(a.tileNumber)} rural ${side}`, done);
        return true;
      }
      // Gourmet guide: good (and duration, which starts at the maximum), then the one "beside the board" row.
      if (goods[0]) await clickReached(page, page.locator(`[data-tutorial="good-${goods[0]}"]`).first(), done);
      await placementRow(page, `Tile #${String(a.tileNumber)} beside the board`, done);
      return true;
    }
    case 'ketchup:coffee.placeShop':
      await choiceRow(page, /coffee shop/i, `Coffee shop at ${String(a.x)},${String(a.y)}`, done);
      return true;
    case 'ketchup:lobbyists.placePark': {
      await selectWorkCard(page, String(a.cardUid));
      await cardButton(page, /park/i);
      const w = Number(a.w);
      const h = Number(a.h);
      await pieceChip(page, `${Math.min(w, h)}×${Math.max(w, h)} park`);
      await placementRow(page, `Park at ${String(a.x)},${String(a.y)}`, done);
      return true;
    }
    case 'ketchup:lobbyists.placeRoad': {
      await selectWorkCard(page, String(a.cardUid));
      await cardButton(page, /road/i);
      const cells = a.cells as { x: number; y: number }[];
      await pieceChip(page, `${cells.length}-square road`);
      await placementRow(page, `Road over ${cells.length} squares from ${cells[0]?.x},${cells[0]?.y}`, done);
      return true;
    }
    case 'ketchup:lobbyists.placeMapTile':
      await choiceRow(page, /map tile/i, `at row ${String(a.row)}, col ${String(a.col)} · turned ${Number(a.rotation) * 90}°`, done);
      return true;
    case 'ketchup:ruralMarketeers.placeFreeway':
      await choiceRow(page, /freeway/i, `Freeway ${String(a.side)} edge, offset ${a.lengthwise ? `${String(a.offset)}–${Number(a.offset) + 2} lengthwise` : `${String(a.offset)} ·`}`, done);
      return true;
    case 'ketchup:newMilestones.placePizzaRadio':
      await choiceRow(page, /pizza radio/i, `Square ${String(a.x)},${String(a.y)}`, done);
      return true;
    default:
      return false;
  }
}
