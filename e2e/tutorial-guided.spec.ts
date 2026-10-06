/**
 * L15 guided game and L16 free play (docs/tutorial-plan.md §2 L15–L16, WP-T3).
 *
 * L15: a scripted learner follows the coach (each step's canonical move, recomputed as the game
 * goes) through the real UI until the Easy bot game ends, then passes the check. Coach hint cards
 * must show up along the way. L16: the hub's free-play tile switches the coach on, starts hot-seat,
 * and leaving that game returns to the hub.
 */
import { expect, test, type Page } from '@playwright/test';
import { prepare, trackErrors } from './helpers';
import { openLesson, performAction, runLesson, tutorialState } from './tutorial';

async function fresh(page: Page): Promise<string[]> {
  await prepare(page, 'Learner');
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fcm.e2e.learn')) {
      localStorage.removeItem('fcm.learn');
      localStorage.removeItem('fcm.coach');
      sessionStorage.setItem('fcm.e2e.learn', '1');
    }
  });
  return trackErrors(page);
}

/** Plays the lesson's steps by following the coach's move one action at a time. Returns hint ids seen. */
async function followCoach(page: Page, maxRound = Infinity): Promise<{ hints: Set<string>; actions: number; skipped: string[] }> {
  const verbose = Boolean(process.env.E2E_VERBOSE);
  const t0 = Date.now();
  const hints = new Set<string>();
  const skipped: string[] = [];
  let actions = 0;
  for (let guard = 0; guard < 1500; guard++) {
    for (const id of await page.locator('[data-hint]').evaluateAll((els) => els.map((e) => e.getAttribute('data-hint') ?? ''))) hints.add(id);
    const s = await tutorialState(page);
    if (s.status !== 'steps') break;
    if (maxRound !== Infinity && Number(await page.locator('.topbar-round b').textContent({ timeout: 500 }).catch(() => '0')) > maxRound) break;
    const op = s.solution[0];
    if (verbose) console.log(`${Date.now() - t0}ms ${s.stepId} ${op ? ('tap' in op ? 'tap' : String(op.type)) : s.offersNext ? 'next' : 'wait'}`);
    if (!op) {
      if (s.offersNext) await page.locator('[data-coach="next"]').click();
      else await page.waitForTimeout(250); // Bo (Easy bot) is thinking
      continue;
    }
    if ('tap' in op) throw new Error(`unexpected tap in ${s.stepId}`);
    if (!(await performAction(page, op as { type: string } & Record<string, unknown>))) {
      skipped.push(`${s.stepId}: ${String(op.type)}`);
      throw new Error(`no UI path for ${String(op.type)} in ${s.stepId}`);
    }
    actions++;
    await expect
      .poll(async () => {
        const n = await tutorialState(page);
        return n.seq !== s.seq || n.index !== s.index || n.status !== 'steps';
      }, { timeout: 15_000, message: `${s.stepId}: ${String(op.type)} did not go through` })
      .toBe(true);
  }
  return { hints, actions, skipped };
}

/** Records every coach hint card shown (ids), even ones that appear and go between polls. */
async function recordHints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { __hintsSeen: Set<string> }).__hintsSeen = seen;
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-hint]')) seen.add(el.getAttribute('data-hint') ?? '');
    }).observe(document, { childList: true, subtree: true });
  });
}

test.describe('guided game', () => {
  test('L15: following the coach through the UI, then letting the coach play, finishes a game against the Easy bot', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const errors = await fresh(page);
    await recordHints(page);
    await openLesson(page, 'base.15');
    for (let i = 0; i < 2; i++) await page.locator('[data-tutorial="speed"]').dispatchEvent('click').catch(() => {});
    // Rounds 1–3 through the UI: reserve, structure, turn order, hiring, cooking, marketing, Payday.
    const { actions, skipped } = await followCoach(page, 3);
    expect(skipped).toEqual([]);
    expect(actions).toBeGreaterThan(15);
    // The rest of the game: Skip step lets the coach play the stretch (the same moves, applied for the learner).
    expect((await tutorialState(page)).stepId).toBe('play');
    await page.locator('[data-coach="skip"]').click();
    await expect.poll(async () => (await tutorialState(page)).stepId, { timeout: 15 * 60_000, intervals: [1000] }).toBe('result');
    const hints = await page.evaluate(() => [...(window as unknown as { __hintsSeen: Set<string> }).__hintsSeen]);
    // The coach spoke up at the listed triggers: turn order and the low bank.
    expect(hints).toEqual(expect.arrayContaining(['order_position', 'bank_low']));
    const done = await runLesson(page, 'base.15');
    expect(done.result?.passed).toBe(true);
    expect(done.result?.newBadges).toEqual(expect.arrayContaining(['lesson:base.15', 'magnate_apprentice']));
    expect(errors).toEqual([]);
  });
});

test.describe('free play with a coach', () => {
  test('L16: the hub tile turns the coach on, starts hot-seat, and leaving returns to the hub', async ({ page }) => {
    const errors = await fresh(page);
    await page.addInitScript(() => localStorage.setItem('fcm.coach', JSON.stringify({ level: 'off', dismissed: [] })));
    await page.goto('/#/learn');
    await page.locator('[data-free-play]').click();
    await expect(page).toHaveURL(/#\/hotseat$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fcm.coach') ?? '{}').level)).toBe('full');
    await page.getByRole('radiogroup', { name: 'Player count' }).getByRole('radio', { name: '2', exact: true }).click();
    await page.getByLabel('Player 2 is played by').selectOption('easy');
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.locator('.ppanel.is-bot')).toHaveCount(1, { timeout: 20_000 });
    const handoff = page.locator('.handoff button').first();
    if (await handoff.isVisible().catch(() => false)) await handoff.click();
    await page.getByRole('button', { name: 'Game menu' }).click();
    await page.getByRole('button', { name: 'End this game' }).click();
    await expect(page).toHaveURL(/#\/learn$/);
    expect(errors).toEqual([]);
  });
});
