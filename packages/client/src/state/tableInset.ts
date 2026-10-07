/**
 * The free board area of the table layout (shared by the 3D camera and the 2D board): the
 * `.table-board` cell minus a fixed phone sheet and the panels floating over it. Neither board
 * layer imports the other; both import this.
 */
import { boardInset, type BoardInset } from './boardOverlays.js';

/** Panels floating over the board area that the home framing keeps clear of (camera bar, pick strip, results strip, Inspect card). */
/**
 * Panels floating over the board area that the home framing keeps clear of, and the sides they may
 * be carved from. Bars (camera bar, pick strip, results strip) are carved across their short side
 * only: a wide bar off the top or bottom, a tall one (the landscape phone camera bar) off a side.
 * Carving a centred wide bar off a side would throw away most of a wide, short board area.
 */
const FLOATING: { sel: string; sides: 'any' | 'bar' }[] = [
  { sel: '.board-controls', sides: 'bar' },
  { sel: '.pick-strip', sides: 'bar' },
  { sel: '.summary-strip', sides: 'bar' },
  { sel: '.inspect', sides: 'any' },
];

/**
 * Measure the canvas area the table layout leaves free for the board: `.table-board` (the grid
 * cell between rail, dock and top bar), on phones the collapsed bottom sheet (`.dock` when it is
 * `position: fixed`; while the sheet is open the last value is kept so the camera does not jump),
 * then every visible floating panel over that area (FLOATING). Each panel is carved off the side
 * that leaves the board the most room: a bottom strip trims the bottom, a tall side card the side;
 * a panel that would cost more than 65% of the board's size is left floating over it.
 * `aspect` is the board's on-screen width / height at the home pose. Skipped while `boardInset`
 * holds an explicit value.
 *
 * Panels are measured where they come to rest (`restingRect`): while the phone sheet slides shut
 * (or a card rises in), the live rectangle passes through in-between positions, and following those
 * would glide the board several times, moving a piece under the finger about to tap it.
 */
export function measureTableInset(el: HTMLElement, prev: BoardInset, aspect = 1.6): BoardInset | null {
  const area = document.querySelector<HTMLElement>('.table-board');
  if (!area) return null;
  const e = el.getBoundingClientRect();
  const a = area.getBoundingClientRect();
  if (a.width < 1 || a.height < 1) return null;
  const dock = document.querySelector<HTMLElement>('.dock');
  const fixedDock = !!dock && getComputedStyle(dock).position === 'fixed';
  if (fixedDock && dock!.classList.contains('is-open')) return prev;
  // Free rectangle in client px.
  const f = { l: Math.max(e.left, a.left), r: Math.min(e.right, a.right), t: Math.max(e.top, a.top), b: Math.min(e.bottom, a.bottom) };
  if (fixedDock) f.b = Math.min(f.b, restingRect(dock!).top);
  const score = (x: typeof f) => Math.min(Math.max(0, x.r - x.l) / aspect, Math.max(0, x.b - x.t));
  for (const { sel, sides } of FLOATING)
    for (const p of document.querySelectorAll<HTMLElement>(sel)) {
      const r = restingRect(p);
      if (r.width < 1 || r.height < 1 || getComputedStyle(p).visibility === 'hidden') continue;
      if (r.right <= f.l || r.left >= f.r || r.bottom <= f.t || r.top >= f.b) continue;
      const across = [
        { ...f, b: Math.min(f.b, r.top) },
        { ...f, t: Math.max(f.t, r.bottom) },
      ];
      const beside = [
        { ...f, l: Math.max(f.l, r.right) },
        { ...f, r: Math.min(f.r, r.left) },
      ];
      const options = sides === 'any' ? [...across, ...beside] : r.width >= r.height ? across : beside;
      let best = options[0]!;
      for (const o of options) if (score(o) > score(best)) best = o;
      // A panel that would leave the board too little room (an Inspect card beside the results
      // strip) floats over the board instead.
      if (score(best) >= 0.35 * score(f)) Object.assign(f, best);
    }
  return { left: f.l - e.left, right: e.right - f.r, top: f.t - e.top, bottom: e.bottom - f.b };
}

let transformProbe: HTMLDivElement | null = null;

/**
 * Translation (px) of a CSS transform value on `el`. Keyframes hold specified values
 * (`translateY(calc(100% - 104px))`): those resolve on a hidden probe of the element's size.
 * Null when it cannot be read.
 */
function translationOf(v: unknown, el: HTMLElement): { x: number; y: number } | null {
  if (v === undefined || v === null || v === '' || v === 'none') return { x: 0, y: 0 };
  if (typeof v !== 'string' || typeof DOMMatrixReadOnly === 'undefined') return null;
  const parse = (t: string) => {
    if (t === 'none') return { x: 0, y: 0 };
    const m = new DOMMatrixReadOnly(t);
    return { x: m.m41, y: m.m42 };
  };
  try {
    return parse(v);
  } catch {
    /* relative lengths: resolve below */
  }
  try {
    if (!transformProbe) {
      transformProbe = document.createElement('div');
      transformProbe.setAttribute('aria-hidden', 'true');
      transformProbe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;transition:none;animation:none;';
      document.body.appendChild(transformProbe);
    }
    transformProbe.style.width = `${el.offsetWidth}px`;
    transformProbe.style.height = `${el.offsetHeight}px`;
    transformProbe.style.transform = v;
    return parse(getComputedStyle(transformProbe).transform);
  } catch {
    return null;
  }
}

/**
 * Client rect of `el` once its running transform transitions / animations end: the live rect moved
 * by (final transform − current transform). Without the Web Animations API, or when the final
 * transform cannot be read, the live rect.
 */
function restingRect(el: HTMLElement): { top: number; bottom: number; left: number; right: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  const out = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  const anims = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
  for (const a of anims) {
    const fx = a.effect;
    if (a.playState === 'finished' || !(fx instanceof KeyframeEffect) || fx.target !== el) continue;
    const last = fx.getKeyframes().filter((k) => 'transform' in k).pop();
    if (!last || (last.computedOffset ?? last.offset ?? 0) < 1) continue;
    const end = translationOf(last.transform, el);
    const cur = translationOf(getComputedStyle(el).transform, el);
    if (!end || !cur) continue;
    const dx = end.x - cur.x;
    const dy = end.y - cur.y;
    out.top += dy;
    out.bottom += dy;
    out.left += dx;
    out.right += dx;
  }
  return out;
}

export function watchTableInset(el: HTMLElement, apply: (i: BoardInset) => void, aspect: () => number): () => void {
  let last: BoardInset = { left: 0, right: 0, top: 0, bottom: 0 };
  const tick = () => {
    if (boardInset.peek()) return;
    const i = measureTableInset(el, last, aspect());
    if (!i) return;
    last = i;
    apply(i);
  };
  tick();
  // Panels appear / disappear through DOM changes: measure on the next frame so the camera starts
  // moving at once; the interval catches CSS transitions and anything the observer misses.
  let raf = 0;
  const soon = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), tick()));
  };
  const mo = new MutationObserver(soon);
  const root = document.querySelector('#app') ?? document.body;
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const id = window.setInterval(tick, 250);
  window.addEventListener('resize', tick);
  // A sheet that finished sliding / a card that finished rising: measure the settled layout at once.
  document.addEventListener('transitionend', soon, true);
  document.addEventListener('animationend', soon, true);
  return () => {
    mo.disconnect();
    cancelAnimationFrame(raf);
    window.clearInterval(id);
    window.removeEventListener('resize', tick);
    document.removeEventListener('transitionend', soon, true);
    document.removeEventListener('animationend', soon, true);
  };
}

