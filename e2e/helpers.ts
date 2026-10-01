/**
 * Shared E2E driver: plays the game through the real UI by clicking whatever legal action the
 * Turn panel offers. Board picks use the placement list (settings.placementList), so the driver
 * never needs canvas coordinates; the 3D board still has to publish its legal spots.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export const SETTINGS = (name: string) => JSON.stringify({ name, placementList: true });

/** Before any page script runs: player name + placement list, and auto-accept confirm() dialogs. */
export async function prepare(page: Page, name = 'E2E'): Promise<void> {
  await page.addInitScript((s) => {
    try {
      if (!localStorage.getItem('fcm.settings')) localStorage.setItem('fcm.settings', s);
    } catch {
      /* ignore */
    }
  }, SETTINGS(name));
  page.on('dialog', (d) => void d.accept());
}

/**
 * Collects uncaught page errors and error toasts (rejected actions) so a test can assert there were
 * none. Toasts are sampled by a MutationObserver in the page.
 */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[fcm-toast] ')) errors.push(t.slice(12));
  });
  void page.addInitScript(() => {
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of document.querySelectorAll('.toast-error')) {
        if (seen.has(el)) continue;
        seen.add(el);
        console.log(`[fcm-toast] ${el.textContent ?? ''}`);
      }
    };
    new MutationObserver(scan).observe(document, { childList: true, subtree: true });
  });
  return errors;
}

export async function round(page: Page): Promise<number> {
  const t = (await page.locator('.topbar-round b').textContent({ timeout: 2000 }).catch(() => null)) ?? '';
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function phaseLabel(page: Page): Promise<string> {
  return ((await page.locator('.phase-current').textContent({ timeout: 2000 }).catch(() => null)) ?? '').trim();
}

const visible = async (l: Locator) => (await l.count()) > 0 && (await l.first().isVisible().catch(() => false));

/** Clicks the first visible+enabled match. Returns false when there is none. */
async function clickFirst(l: Locator, pick: 'first' | 'random' = 'first'): Promise<boolean> {
  const n = await l.count();
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const el = l.nth(i);
    if ((await el.isVisible().catch(() => false)) && (await el.isEnabled().catch(() => false))) idx.push(i);
  }
  if (!idx.length) return false;
  const i = pick === 'random' ? idx[Math.floor(Math.random() * idx.length)]! : idx[0]!;
  await l.nth(i).click();
  return true;
}

export interface DriveOptions {
  /** Max card actions per working turn before ending it. */
  workActions?: number;
  /** In this round's payday, fire one card when possible (exercises the combined fire + pay flow). */
  fireInRound?: number;
}

/** Per-page memory for the working phase (actions taken this turn). */
const workBudget = new WeakMap<Page, { key: string; used: number; stuck: number }>();

/**
 * Performs one UI step. Returns a short label of what was done, or null when there was nothing to do
 * (waiting for another player or for an animation/round-trip).
 */
export async function step(page: Page, opts: DriveOptions = {}): Promise<string | null> {
  if (await visible(page.locator('.handoff'))) {
    await page.locator('.handoff button').first().click();
    return 'handoff';
  }
  if (await visible(page.locator('.summary-card'))) {
    await page.locator('.summary-card footer button').first().click();
    return 'summary';
  }
  if (await visible(page.locator('.modal.gameover'))) return 'gameOver';
  // Make sure the Turn tab is showing.
  if (!(await visible(page.locator('.prompt')))) {
    const tab = page.getByRole('tab', { name: /Turn/ });
    if (await visible(tab)) {
      await tab.click();
      return 'turn-tab';
    }
    return null;
  }
  const prompt = page.locator('.prompt').first();
  const cls = (await prompt.getAttribute('class')) ?? '';
  const kind = /prompt-(\w+)/.exec(cls)?.[1] ?? '';
  if (await page.locator('.prompt .spinner, .btn.is-busy').count()) return null;

  switch (kind) {
    case 'placeFirstRestaurant': {
      if (await clickFirst(page.locator('.placement-btn'), 'random')) return 'place restaurant';
      if (await clickFirst(page.getByRole('button', { name: 'Pick a spot' }))) return 'pick a spot';
      return null;
    }
    case 'chooseReserve':
      if (await visible(page.locator('.reserve .pill'))) return null; // chosen, waiting
      return (await clickFirst(page.locator('.reserve-card'))) ? 'reserve' : null;
    case 'restructure':
      return restructure(page);
    case 'chooseOrder':
      return (await clickFirst(page.locator('.order-slot.is-open'))) ? 'order' : null;
    case 'work':
      return work(page, opts);
    case 'payday': {
      if (opts.fireInRound !== undefined && (await round(page)) === opts.fireInRound) {
        const cards = page.locator('.payday .card-grid .emp.is-clickable');
        if ((await cards.count()) > 0 && (await page.locator('.payday .emp.is-selected').count()) === 0) {
          await cards.first().click();
        }
      }
      const pay = page.locator('.payday .row.end button');
      const label = (await pay.first().textContent().catch(() => '')) ?? '';
      if (!(await clickFirst(pay))) return null;
      return /^Fire \d+ and/.test(label.trim()) ? 'payday: fire+pay' : 'payday';
    }
    case 'freezer':
      return (await clickFirst(page.locator('.freezer-panel .row.end button'))) ? 'freezer' : null;
    case 'choice':
      return choice(page);
    case 'gameOver':
      return 'gameOver';
    default:
      return null; // waiting / spectating
  }
}

async function restructure(page: Page): Promise<string | null> {
  if (await visible(page.locator('.org.is-locked'))) return null; // submitted
  // Place hand cards into the first slot they fit, one card per step.
  const hand = page.locator('.org-hand .emp.is-clickable');
  const n = await hand.count();
  for (let i = 0; i < n; i++) {
    await hand.nth(i).click();
    const target = page.locator('.org-tree .slot.is-target');
    if ((await target.count()) > 0) {
      await target.first().click();
      return 'structure: place card';
    }
    await hand.nth(i).click().catch(() => {}); // deselect
  }
  const submit = page.locator('.org-actions button.btn-primary, .org-actions button').filter({ hasText: /Submit/ });
  return (await clickFirst(submit)) ? 'structure: submit' : null;
}

async function work(page: Page, opts: DriveOptions): Promise<string | null> {
  const budget = opts.workActions ?? 3;
  const turnKey = `${await round(page)}:${(await page.locator('.prompt-head h2').textContent()) ?? ''}:${await page.locator('.topbar .turn-order .is-active').getAttribute('title').catch(() => '')}`;
  let mem = workBudget.get(page);
  if (!mem || mem.key !== turnKey) {
    mem = { key: turnKey, used: 0, stuck: 0 };
    workBudget.set(page, mem);
  }

  // An open sub-flow (hire / train / cook / placement).
  const flow = page.locator('.work .flow, .prompt-work .flow');
  if (await visible(flow)) {
    if (mem.stuck++ > 6) {
      await clickFirst(flow.locator('.flow-head button'));
      mem.used = budget;
      return 'flow: give up';
    }
    const goods = flow.locator('.flow-options .chip-food');
    if ((await goods.count()) > 0 && (await flow.locator('.flow-options .chip-food.is-on').count()) === 0) {
      await goods.first().click();
      return 'flow: pick good';
    }
    if (await clickFirst(flow.locator('.placement-btn'), 'random')) return 'flow: placement';
    if (await clickFirst(flow.locator('.card-grid .emp.is-highlight'))) return 'flow: card';
    if (await clickFirst(flow.locator('.train-opt'))) return 'flow: train';
    if (await clickFirst(flow.locator('.chip-lg'))) return 'flow: cook';
    if (await visible(flow.locator('.empty'))) {
      await clickFirst(flow.locator('.flow-head button'));
      return 'flow: back';
    }
    return null;
  }
  mem.stuck = 0;

  if (mem.used < budget) {
    const open = page.locator('.card-actions .action-list button:not(.btn-ghost)');
    if (await visible(open)) {
      mem.used++;
      if (await clickFirst(open, 'random')) return 'work: action';
    }
    const ready = page.locator('.work-cards .emp.is-highlight');
    if ((await ready.count()) > 0) {
      // Rotate through ready cards so later ones get a go too.
      await ready.nth(mem.used % (await ready.count())).click();
      return 'work: select card';
    }
  }
  const end = page.locator('.work-foot button').filter({ hasText: 'End turn' });
  if (await clickFirst(end)) {
    mem.used = 0;
    return 'work: end turn';
  }
  return null;
}

async function choice(page: Page): Promise<string | null> {
  if (await clickFirst(page.locator('.choice .flow-options .chip-food:not(.is-on)'))) return 'choice: good';
  if (await clickFirst(page.locator('.choice .placement-btn'), 'random')) return 'choice: placement';
  if (await clickFirst(page.locator('.choice .card-grid .emp.is-clickable:not(.is-selected)'))) return 'choice: select';
  if (await clickFirst(page.locator('.choice button.btn-primary, .choice button.btn-danger'))) return 'choice: confirm';
  if (await clickFirst(page.locator('.choice .action-list button'))) return 'choice: action';
  return null;
}

/**
 * Steps until `done()` holds, round-robin over `pages` (one page for hot-seat, one per player
 * online). Throws with a trail of the last steps when nothing happened for `idleMs`.
 */
export async function playUntil(
  pages: Page | Page[],
  done: () => Promise<boolean>,
  opts: DriveOptions & { maxSteps?: number; idleMs?: number; /** From trackErrors: stop at the first one. */ errors?: string[] } = {},
): Promise<string[]> {
  const list = Array.isArray(pages) ? pages : [pages];
  const trail: string[] = [];
  const maxSteps = opts.maxSteps ?? 1500;
  const idleMs = opts.idleMs ?? 15_000;
  let idleSince = Date.now();
  for (let i = 0; i < maxSteps; i++) {
    if (opts.errors?.length) {
      const docks = await Promise.all(list.map(async (p) => (await p.locator('.dock').innerText().catch(() => '')).slice(0, 1200)));
      throw new Error(`Page error: ${opts.errors.join(' | ')}\n${trail.slice(-15).join('\n')}\n--- dock ---\n${docks.join('\n--- next page ---\n')}`);
    }
    if (await done()) return trail;
    let acted = false;
    for (const [n, page] of list.entries()) {
      const s = await step(page, opts);
      if (s === 'gameOver') {
        trail.push(s);
        return trail;
      }
      if (!s) continue;
      acted = true;
      trail.push(`${list.length > 1 ? `[${n}] ` : ''}${await round(page)}/${await phaseLabel(page)}: ${s}`);
      if (process.env.E2E_DEBUG) console.log(trail[trail.length - 1]);
    }
    if (acted) {
      idleSince = Date.now();
      await list[0]!.waitForTimeout(40);
      continue;
    }
    if (Date.now() - idleSince > idleMs) {
      const docks = await Promise.all(list.map(async (p) => (await p.locator('.dock').innerText().catch(() => '')).slice(0, 1200)));
      throw new Error(`UI driver stuck in "${await phaseLabel(list[0]!)}" (round ${await round(list[0]!)}):\n${trail.slice(-25).join('\n')}\n--- dock ---\n${docks.join('\n--- next page ---\n')}`);
    }
    await list[0]!.waitForTimeout(150);
  }
  throw new Error(`UI driver ran out of steps:\n${trail.slice(-25).join('\n')}`);
}

/** Waits until the 3D board is up and publishing legal spots for the current pick. */
export async function expectBoardSpots(page: Page): Promise<number> {
  const canvas = page.locator('#board-root canvas').first();
  await expect(canvas).toHaveAttribute('data-legal-spots', /^[1-9]\d*$/, { timeout: 20_000 });
  return Number(await canvas.getAttribute('data-legal-spots'));
}
