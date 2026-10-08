/**
 * Overlay motion (animation-plan §2.1–2.4, 2.8, 2.10, rows marked U): card and counter motion in
 * the Preact layer, driven by the applied event batches (state/motion.ts).
 *
 * - FLIP: elements carry `data-flip="<key>"`. Before a batch renders, `onBeforeMotion` measures
 *   every keyed element; after it renders, keys that moved slide from their old box (turn order,
 *   rail panels, cards going to the beach). Keys an event names that disappeared leave a ghost
 *   clone that animates out (fired cards, spoiled goods).
 * - Entries: per-event effects on keyed elements (hired card drops in, trained card flips per
 *   step, recruiter nods, org charts flip on reveal, the bank shakes) and chips floating off the
 *   player's rail panel ("+ Waitress", "IOU $50").
 * - Banners: round, bank break, milestone, game over (with CSS confetti), in `MotionLayer`.
 * - `RollingCash`: the cash numeral rolls to `cash - claimed` (board steps settle claims when their
 *   coins land) with a "+$N" / "-$N" float.
 *
 * Every animation uses the Web Animations API on transforms / opacity only, never blocks input
 * (ghosts and chips are pointer-events: none), scales with the animation speed (1× / 2× / 4×),
 * finishes at once on Skip, and in reduced motion becomes a short fade (no travel).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameEvent, PlayerId } from '@fcm/engine';
import { boardRenderer } from '../state/boardBridge.js';
import { employeeName, milestoneName } from '../state/catalog.js';
import { animationSpeed, skipAnimations } from '../state/interaction.js';
import { boardPulse, cashClaims, motionBatch, onBeforeMotion, type MotionBatch } from '../state/motion.js';
import { catalog } from '../state/store.js';
import { announce } from '../state/announce.js';

// ---------------------------------------------------------------------------
// Timing, reduced motion, Skip
// ---------------------------------------------------------------------------

export function prefersReduced(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}
const reduced = () => prefersReduced() || animationSpeed.peek() <= 0;
/** Seconds at 1× → ms at the current speed. */
const ms = (s: number) => (s * 1000) / Math.max(1, animationSpeed.peek() || 1);

const running = new Set<Animation>();
let skipSeen = skipAnimations.peek();
skipAnimations.subscribe((n) => {
  if (n === skipSeen) return;
  skipSeen = n;
  for (const a of [...running]) {
    try {
      a.finish();
    } catch {
      a.cancel();
    }
  }
  running.clear();
  skipListeners.forEach((f) => f());
});
const skipListeners = new Set<() => void>();

/** Run a WAAPI animation (tracked for Skip). Reduced motion: opacity-only fade of `fade` s. */
function anim(el: Element, frames: Keyframe[], dur: number, opts: { delay?: number; easing?: string; fill?: FillMode; reducedFrames?: Keyframe[] } = {}): Animation | null {
  if (!(el as HTMLElement).animate) return null;
  const red = reduced();
  const a = (el as HTMLElement).animate(red ? (opts.reducedFrames ?? [{ opacity: 0.4 }, { opacity: 1 }]) : frames, {
    duration: red ? 120 : ms(dur),
    delay: red ? 0 : ms(opts.delay ?? 0),
    easing: opts.easing ?? 'cubic-bezier(.2,.8,.3,1)',
    fill: opts.fill ?? 'backwards',
  });
  running.add(a);
  a.onfinish = a.oncancel = () => running.delete(a);
  return a;
}

const OVERSHOOT = 'cubic-bezier(.3,1.5,.55,1)';

// ---------------------------------------------------------------------------
// FLIP snapshot
// ---------------------------------------------------------------------------

interface Snap {
  rect: DOMRect;
  el: HTMLElement;
}
let snapshot = new Map<string, Snap>();

function keyed(): HTMLElement[] {
  return typeof document === 'undefined' ? [] : [...document.querySelectorAll<HTMLElement>('[data-flip]')];
}

onBeforeMotion(() => {
  const m = new Map<string, Snap>();
  for (const el of keyed()) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    m.set(el.dataset.flip!, { rect: r, el });
  }
  snapshot = m;
});

const byKey = (k: string) => (typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(k)}"]`));
const panelOf = (p: PlayerId) => byKey(`panel:${p}`);

/** Slide every keyed element that moved from its old box (staggered when `stagger`). */
function flipMoved(old: Map<string, Snap>, stagger: (key: string) => number): void {
  for (const el of keyed()) {
    const key = el.dataset.flip!;
    const s = old.get(key);
    if (!s) continue;
    const r = el.getBoundingClientRect();
    const dx = s.rect.left - r.left;
    const dy = s.rect.top - r.top;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) continue;
    if (Math.abs(dx) > innerWidth || Math.abs(dy) > innerHeight) continue;
    anim(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], 0.45, { delay: stagger(key), easing: OVERSHOOT });
  }
}

/** A clone of a vanished element animating out from its old box. */
function ghost(s: Snap, frames: Keyframe[], dur: number, delay = 0): void {
  const layer = ghostLayer();
  const c = s.el.cloneNode(true) as HTMLElement;
  c.removeAttribute('data-flip');
  c.classList.add('motion-ghost');
  Object.assign(c.style, { left: `${s.rect.left}px`, top: `${s.rect.top}px`, width: `${s.rect.width}px`, height: `${s.rect.height}px` });
  layer.appendChild(c);
  const a = anim(c, frames, dur, { delay, fill: 'forwards', reducedFrames: [{ opacity: 1 }, { opacity: 0 }] });
  const done = () => c.remove();
  if (a) a.finished.then(done, done);
  else done();
}

let layerEl: HTMLElement | null = null;
function ghostLayer(): HTMLElement {
  if (layerEl?.isConnected) return layerEl;
  layerEl = document.createElement('div');
  layerEl.className = 'motion-ghosts';
  layerEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layerEl);
  return layerEl;
}

// ---------------------------------------------------------------------------
// Rail chips
// ---------------------------------------------------------------------------

type Tone = 'ok' | 'danger' | 'info' | 'gold';

/** A chip that pops off a player's rail panel and floats away. */
function railChip(player: PlayerId, text: string, tone: Tone = 'info', delay = 0): void {
  const panel = panelOf(player);
  if (!panel) return;
  const r = panel.getBoundingClientRect();
  if (r.width < 1) return;
  const chip = document.createElement('div');
  chip.className = `motion-chip tone-${tone}`;
  chip.textContent = text;
  const layer = ghostLayer();
  // Stack chips of the same panel so several in one batch stay readable.
  const n = layer.querySelectorAll(`.motion-chip[data-p="${CSS.escape(player)}"]`).length;
  chip.dataset.p = player;
  // Lower half of the panel (keeps the name and cash readable), stacking upwards.
  Object.assign(chip.style, { left: `${r.left + Math.min(r.width - 24, 14)}px`, top: `${Math.max(4, r.top + Math.min(r.height, 96) - 30 - n * 26)}px` });
  layer.appendChild(chip);
  const a = anim(
    chip,
    [
      { transform: 'translateY(6px) scale(.6)', opacity: 0 },
      { transform: 'translateY(0) scale(1.05)', opacity: 1, offset: 0.15 },
      { transform: 'translateY(-2px) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translateY(-14px) scale(.95)', opacity: 0 },
    ],
    1.6,
    { delay, fill: 'both', easing: 'linear', reducedFrames: [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }] },
  );
  if (a) a.finished.then(() => chip.remove(), () => chip.remove());
  else setTimeout(() => chip.remove(), 1600);
}

// ---------------------------------------------------------------------------
// Per-event effects
// ---------------------------------------------------------------------------

const nod = (el: Element | null, delay = 0) =>
  el && anim(el, [{ transform: 'rotate(0)' }, { transform: 'rotate(-5deg) translateY(-2px)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0)' }], 0.4, { delay });
const shake = (el: Element | null, dur = 0.35, delay = 0) =>
  el && anim(el, [0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })), dur, { delay, easing: 'linear' });
const pop = (el: Element | null, delay = 0, k = 1.25) => el && anim(el, [{ transform: 'scale(1)' }, { transform: `scale(${k})` }, { transform: 'scale(1)' }], 0.35, { delay, easing: OVERSHOOT });
const flipIn = (el: Element | null, delay = 0) =>
  el && anim(el, [{ transform: 'perspective(600px) rotateY(90deg)', opacity: 0.3 }, { transform: 'perspective(600px) rotateY(0)', opacity: 1 }], 0.5, { delay, easing: OVERSHOOT });

function cardEl(player: PlayerId, uid: string): HTMLElement | null {
  return byKey(`card:${player}:${uid}`);
}

function name(id: string): string {
  return employeeName(catalog.peek(), id as never);
}

/** Play one batch's overlay motion (after the DOM shows the new view). */
function play(b: MotionBatch, old: Map<string, Snap>, pushBanner: (b: Banner) => void): void {
  const penalty = new Set(b.events.filter((e) => e.type === 'structurePenalty').map((e) => (e as { player: PlayerId }).player));
  // Moves: cards to the beach (staggered for a penalty), turn order chips, rail panels.
  let order = 0;
  flipMoved(old, (key) => {
    const [, p] = key.split(':');
    return key.startsWith('card:') && p && penalty.has(p) ? 0.06 * order++ : 0;
  });
  let chipDelay = 0;
  const chip = (p: PlayerId, text: string, tone?: Tone) => {
    railChip(p, text, tone, chipDelay);
    chipDelay += 0.12;
  };
  for (const e of b.events) effect(e, b, old, chip, pushBanner);
}

function effect(e: GameEvent, b: MotionBatch, old: Map<string, Snap>, chip: (p: PlayerId, text: string, tone?: Tone) => void, pushBanner: (b: Banner) => void): void {
  switch (e.type) {
    case 'roundStarted':
      if (e.round > 0) pushBanner({ text: `Round ${e.round}`, tone: 'info', icon: '●' });
      break;
    case 'turnStarted': {
      const p = panelOf(e.player);
      if (p) anim(p, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)', boxShadow: '0 10px 24px rgba(43,42,51,.25)' }, { transform: 'translateY(0)' }], 0.4);
      break;
    }
    case 'turnOrderSet':
    case 'orderChosen': {
      const players = e.type === 'orderChosen' ? [e.player] : [];
      for (const p of players) pop(byKey(`order:${p}`), 0.3, 1.3);
      break;
    }
    case 'structuresRevealed': {
      document.querySelectorAll('.org-tree').forEach((t) => flipIn(t));
      (b.view?.turnOrder ?? []).forEach((p, i) => flipIn(panelOf(p), i * 0.06));
      break;
    }
    case 'structurePenalty':
      shake(document.querySelector('.org-tree'));
      chip(e.player, 'Overfilled: staff to the beach', 'danger');
      break;
    case 'employeeHired': {
      const el = cardEl(e.player, e.uid);
      const from = old.get(`market:${e.employeeId}`);
      if (el && from) {
        // Cross-element FLIP: from the market card to the new slot.
        const r = el.getBoundingClientRect();
        anim(el, [{ transform: `translate(${from.rect.left - r.left}px, ${from.rect.top - r.top}px) scale(1.05)` }, { transform: 'none' }], 0.6, { easing: OVERSHOOT });
      } else if (el) anim(el, [{ transform: 'translateY(-26px) scale(.7) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 0.6, { easing: OVERSHOOT });
      nod(cardEl(e.player, e.by), 0.35);
      chip(e.player, `+ ${name(e.employeeId)}`, 'ok');
      break;
    }
    case 'employeeGained': {
      const el = cardEl(e.player, e.uid);
      if (el) {
        anim(el, [{ transform: 'translateY(-40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 0.5, { easing: OVERSHOOT });
        el.classList.add('motion-ribbon');
        setTimeout(() => el.classList.remove('motion-ribbon'), ms(1.0));
      }
      chip(e.player, `★ ${name(e.employeeId)}`, 'gold');
      break;
    }
    case 'employeeTrained': {
      const el = cardEl(e.player, e.uid);
      const steps = Math.max(1, e.steps);
      if (el)
        anim(
          el,
          Array.from({ length: steps * 2 + 1 }, (_, i) => ({ transform: `perspective(600px) rotateY(${i % 2 ? 90 : 0}deg)` })),
          0.4 + 0.2 * steps,
          { easing: 'ease-in-out' },
        );
      e.by.forEach((u, i) => nod(cardEl(e.player, u), 0.05 * i));
      chip(e.player, `↑ ${name(e.to)}`, 'ok');
      break;
    }
    case 'employeeFired': {
      const s = old.get(`card:${e.player}:${e.uid}`);
      if (s && !cardEl(e.player, e.uid)) {
        const frames: Keyframe[] = [
          ...(e.forced ? [0, -6, 6, -4, 0].map((x, i) => ({ transform: `translateX(${x}px)`, opacity: 1, offset: i * 0.08 })) : [{ transform: 'none', opacity: 1 }]),
          { transform: 'translateY(40px) rotate(8deg) scale(.8)', opacity: 0 },
        ];
        ghost(s, frames, e.forced ? 0.7 : 0.5);
      }
      chip(e.player, `− ${name(e.employeeId)}`, 'danger');
      break;
    }
    case 'reserveChosen':
      chip(e.player, 'Reserve chosen', 'info');
      break;
    case 'iouIssued': {
      const p = panelOf(e.player);
      if (p) anim(p, [{ boxShadow: '0 0 0 3px var(--c-danger)' }, { boxShadow: '0 0 0 0 transparent' }], 0.6, { reducedFrames: [{ opacity: 0.6 }, { opacity: 1 }] });
      chip(e.player, `IOU $${e.amount}`, 'danger');
      break;
    }
    case 'cfoBonus':
      chip(e.player, `CFO +$${e.amount}`, 'ok');
      break;
    case 'bankBurned':
      chip(e.player, `Burned $${e.amount}`, 'danger');
      break;
    case 'salaryPaid':
      if (e.paid > 0) coinsFrom(e.player);
      break;
    case 'bankrupt': {
      const p = panelOf(e.player);
      if (p) anim(p, [{ filter: 'grayscale(0)', opacity: 1 }, { filter: 'grayscale(.6)', opacity: 0.55 }], 0.8, { fill: 'none' });
      chip(e.player, 'Bankrupt', 'danger');
      break;
    }
    case 'foodProduced':
      // The board pulses the stock when its tokens land; without a 3D board, bounce now.
      if (boardRenderer.peek() !== '3d') bounce(byKey(`goods:${e.player}`));
      break;
    case 'foodDiscarded': {
      const s = old.get(`goods:${e.player}`);
      if (s) ghost(s, [{ transform: 'none', opacity: 0.9 }, { transform: 'translateY(16px) scale(.9)', opacity: 0 }], 0.8);
      break;
    }
    case 'foodFrozen': {
      const el = byKey(`freezer:${e.player}`);
      if (el) {
        pop(el, 0.1, 1.2);
        el.classList.add('motion-frost');
        setTimeout(() => el.classList.remove('motion-frost'), ms(0.8));
      }
      break;
    }
    case 'milestoneClaimed': {
      const n = milestoneName(catalog.peek(), e.milestoneId);
      const who = b.view?.players[e.player]?.name ?? e.player;
      pushBanner({ text: `${who}: ${n}`, tone: 'gold', icon: '★' });
      pop(byKey(`stars:${e.player}`), 0.3, 1.5);
      const li = byKey(`milestone:${e.milestoneId}`);
      if (li) anim(li, [{ transform: 'scale(1.12) rotate(-2deg)', boxShadow: '0 0 0 3px var(--c-warn)' }, { transform: 'none', boxShadow: '0 0 0 0 transparent' }], 0.8, { easing: OVERSHOOT });
      break;
    }
    case 'milestonesRemoved':
      for (const id of e.milestoneIds) {
        const li = byKey(`milestone:${id}`);
        if (li) anim(li, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.5, transform: 'scale(.96)' }], 0.4, { fill: 'none' });
      }
      break;
    case 'bankBroke': {
      const bank = byKey('bank');
      if (bank) {
        shake(bank, 0.6);
        bank.classList.add('motion-crack');
        setTimeout(() => bank.classList.remove('motion-crack'), ms(1.2));
      }
      pushBanner({ text: `Bank break ${e.breakNo}`, tone: 'danger', icon: '!' });
      break;
    }
    case 'gameEnded': {
      const w = b.view?.players[e.ranking[0] ?? ''];
      pushBanner({ text: w ? `${w.name} wins!` : 'Game over', tone: 'gold', icon: '🏆', confetti: true, hold: 4 });
      break;
    }
    default:
      break;
  }
}

function bounce(el: Element | null, delay = 0): void {
  if (el) anim(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], 0.45, { delay, easing: 'ease-out' });
}

/** A few coins drop out of a player's cash numeral (salaries). */
function coinsFrom(player: PlayerId): void {
  const cash = byKey(`cash:${player}`);
  if (!cash || reduced()) return;
  const r = cash.getBoundingClientRect();
  const layer = ghostLayer();
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('i');
    c.className = 'motion-coin';
    Object.assign(c.style, { left: `${r.left + r.width * (0.2 + i * 0.2)}px`, top: `${r.top + r.height / 2}px` });
    layer.appendChild(c);
    const a = anim(c, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${(i - 1.5) * 10}px, 34px) scale(.6)`, opacity: 0 }], 0.6, { delay: i * 0.04, fill: 'both', easing: 'cubic-bezier(.5,0,.8,.6)' });
    if (a) a.finished.then(() => c.remove(), () => c.remove());
    else c.remove();
  }
}

// ---------------------------------------------------------------------------
// Banners + director
// ---------------------------------------------------------------------------

interface Banner {
  text: string;
  tone: Tone;
  icon: string;
  confetti?: boolean;
  /** Seconds at 1× (default 1.6). */
  hold?: number;
}

/**
 * The motion director and banner strip. Mount once on the table (TopBar renders it). Plays each
 * batch after the overlay has rendered it, and the rail bounces the board pulses ask for.
 */
export function MotionLayer() {
  const [banners, setBanners] = useState<(Banner & { id: number })[]>([]);
  const next = useRef(0);
  useEffect(() => {
    const push = (b: Banner) => {
      const id = ++next.current;
      announce(b.text);
      setBanners((l) => [...l.slice(-2), { ...b, id }]);
      setTimeout(() => setBanners((l) => l.filter((x) => x.id !== id)), ms(b.hold ?? 1.6) + 300);
    };
    let lastN = 0;
    const stopBatch = motionBatch.subscribe((b) => {
      if (!b || b.n === lastN) return;
      lastN = b.n;
      const old = snapshot;
      // After Preact has rendered the new view (render is a microtask; rAF follows it).
      requestAnimationFrame(() => {
        try {
          play(b, old, push);
        } catch (err) {
          console.error('[motion] play failed', err);
        }
      });
    });
    let lastPulse = 0;
    const stopPulse = boardPulse.subscribe((p) => {
      if (!p || p.n === lastPulse) return;
      lastPulse = p.n;
      if (p.kind === 'goods') bounce(byKey(`goods:${p.player}`));
      else if (p.kind === 'star') pop(byKey(`stars:${p.player}`), 0, 1.4);
      else bounce(byKey(`cash:${p.player}`));
    });
    const clear = () => setBanners([]);
    skipListeners.add(clear);
    return () => {
      stopBatch();
      stopPulse();
      skipListeners.delete(clear);
    };
  }, []);
  if (!banners.length) return null;
  return (
    // Announced through the App's persistent live region (announce), so this strip is not one.
    <div class="motion-banners">
      {banners.map((b) => (
        <div key={b.id} class={`motion-banner tone-${b.tone} ${b.confetti ? 'has-confetti' : ''}`} style={{ '--hold': `${ms(b.hold ?? 1.6)}ms` }}>
          <span class="motion-banner-icon" aria-hidden="true">
            {b.icon}
          </span>
          <span>{b.text}</span>
          {b.confetti && !reduced() && (
            <span class="motion-confetti" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} style={{ '--i': i }} />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rolling cash
// ---------------------------------------------------------------------------

/**
 * Cash numeral that rolls to its value (0.4 s at 1×) and floats the change. With `player`, shows
 * `amount - claimed`: money a board step still has in flight lands with that step.
 */
export function RollingCash({ amount, player, size = 'md', flip }: { amount: number; player?: PlayerId; size?: 'sm' | 'md' | 'lg' | 'xl'; flip?: string }) {
  const claim = player ? (cashClaims.value[player] ?? 0) : 0;
  const target = amount - claim;
  const [shown, setShown] = useState(target);
  const [floats, setFloats] = useState<{ id: number; d: number }[]>([]);
  const cur = useRef(target);
  const fid = useRef(0);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const d = target - from;
    const id = ++fid.current;
    setFloats((l) => [...l.slice(-2), { id, d }]);
    const t1 = setTimeout(() => setFloats((l) => l.filter((x) => x.id !== id)), ms(1.1) + 200);
    if (reduced()) {
      cur.current = target;
      setShown(target);
      return () => clearTimeout(t1);
    }
    const dur = ms(0.4);
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      const v = Math.round(from + d * e);
      cur.current = k >= 1 ? target : v;
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const finish = () => {
      cancelAnimationFrame(raf);
      cur.current = target;
      setShown(target);
    };
    skipListeners.add(finish);
    return () => {
      // A newer target interrupts: keep the value reached so the next roll starts from it.
      cancelAnimationFrame(raf);
      skipListeners.delete(finish);
      clearTimeout(t1);
    };
  }, [target]);
  return (
    <span class={`cash cash-${size} cash-rolling`} data-flip={flip}>
      <span class="cash-sign">$</span>
      {shown.toLocaleString()}
      {floats.map((f) => (
        <span key={f.id} class={`cash-float ${f.d > 0 ? 'is-up' : 'is-down'}`} aria-hidden="true" style={{ animationDuration: `${ms(1.1)}ms` }}>
          {f.d > 0 ? '+' : '−'}${Math.abs(f.d).toLocaleString()}
        </span>
      ))}
    </span>
  );
}

