/**
 * WP-T2 UI paths for `performAction` (e2e/tutorial.ts): action types the early base lessons
 * (L2–L7) need that no other block handles. Restructuring, hiring, producing, campaigns and firing
 * are shared with the late lessons (e2e/tutorial-late.ts).
 */
import type { Page } from '@playwright/test';
import { openTurnSheet, selectWorkCard } from './tutorial-late';

type A = { type: string } & Record<string, unknown>;

const CLICK = { timeout: 10_000 };

/** Performs `a` through the UI when it is one of this block's types; false otherwise. */
export async function performEarly(page: Page, a: A): Promise<boolean> {
  switch (a.type) {
    case 'work.skip': {
      // Tap the card, then its "Skip <card>" button.
      await selectWorkCard(page, String(a.cardUid));
      const btn = page.locator('.card-actions button').filter({ hasText: /^\s*Skip\b/ }).first();
      await btn.waitFor({ state: 'visible', timeout: 10_000 });
      await btn.click(CLICK);
      return true;
    }
    case 'work.placeCampaign': {
      // The lesson opened the campaign flow in earlier steps (token, good): finish it from there.
      if (!(await page.locator('.campaign-flow').count())) return false;
      await openTurnSheet(page);
      if (!(await page.locator('.campaign-flow').first().isVisible().catch(() => false))) return false;
      const tok = page.locator(`[data-tutorial="token-${String(a.tileNumber)}"]`).first();
      if ((await tok.getAttribute('aria-checked')) !== 'true') await tok.click(CLICK);
      const good = (a.goods as string[])[0];
      const chip = page.locator(`[data-tutorial="good-${good ?? ''}"]`).first();
      if (good && (await chip.getAttribute('aria-pressed')) !== 'true') await chip.click(CLICK);
      const pl = a.placement as { kind: string; x: number; y: number; w: number; h: number };
      await page.locator('.campaign-flow .placement-btn').filter({ hasText: `Tile #${String(a.tileNumber)} · ${pl.w}×${pl.h} at ${pl.x},${pl.y}` }).first().click(CLICK);
      const launch = page.locator('.held-pick button').filter({ hasText: /Launch/ });
      if (await launch.isVisible().catch(() => false)) await launch.click(CLICK);
      return true;
    }
    default:
      return false;
  }
}
