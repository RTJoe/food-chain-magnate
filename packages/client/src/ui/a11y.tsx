/**
 * Accessibility plumbing: the dialog focus hook (move, trap, restore; WCAG 2.4.3) and the
 * screen-reader announcer (one persistent polite region and one assertive region; WCAG 4.1.3).
 */
import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { assertiveSaid, politeSaid } from '../state/announce.js';

export { announce } from '../state/announce.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.closest('[inert]') && (e.offsetWidth > 0 || e.offsetHeight > 0 || e.getClientRects().length > 0));
}

/** Live regions and toasts stay reachable while a modal is open. */
const KEEP_LIVE = '[aria-live], [role=status], [role=alert], .toasts, .a11y-live';

/** Make everything outside `el` inert (siblings of each ancestor up to <body>); returns the undo. */
export function inertOutside(el: HTMLElement): () => void {
  const done: HTMLElement[] = [];
  for (let n: HTMLElement | null = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
    for (const sib of n.parentElement.children) {
      if (sib === n || !(sib instanceof HTMLElement) || sib.inert || /^(SCRIPT|STYLE|LINK)$/.test(sib.tagName) || sib.matches(KEEP_LIVE)) continue;
      sib.inert = true;
      done.push(sib);
    }
  }
  return () => {
    for (const s of done) s.inert = false;
  };
}

export interface DialogOptions {
  /** Trap Tab and make the rest of the page inert (default true). */
  modal?: boolean;
  /** Selector of the element to focus first (default: the first focusable control, else the dialog). */
  initial?: string;
  /** Focus this on close instead of the opener (read a tick later, once the page behind has updated). */
  returnTo?: () => HTMLElement | null;
}

/**
 * While mounted: focus the dialog, keep Tab inside it, make the page behind it inert, and on
 * unmount give focus back to the element that had it before (or `fallback`).
 */
export function useDialog(ref: RefObject<HTMLElement | null>, opts: DialogOptions = {}): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const modal = opts.modal ?? true;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const first = (opts.initial ? el.querySelector<HTMLElement>(opts.initial) : null) ?? focusables(el)[0] ?? el;
    if (first === el && !el.hasAttribute('tabindex')) el.tabIndex = -1;
    first.focus({ preventScroll: true });
    const undoInert = modal ? inertOutside(el) : () => {};
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modal) return;
      const list = focusables(el);
      const cur = document.activeElement;
      if (!list.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const a = list[0]!;
      const z = list[list.length - 1]!;
      if (!el.contains(cur)) {
        e.preventDefault();
        (e.shiftKey ? z : a).focus();
      } else if (e.shiftKey && cur === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && cur === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      undoInert();
      // Only take focus back when it was inside the dialog (or dropped to <body> as it unmounted).
      const lost = () => {
        const now = document.activeElement;
        return !now || now === document.body || el.contains(now);
      };
      if (!lost()) return;
      const returnTo = opts.returnTo;
      if (returnTo) {
        // The page behind may still be updating (a hot-seat snapshot arrives after the hand-off and can
        // replace the focused heading): for a moment, put focus back whenever it drops to <body>.
        let tries = 0;
        const attempt = () => {
          if (lost()) returnTo()?.focus({ preventScroll: true });
          if (++tries < 15) setTimeout(attempt, 100);
        };
        setTimeout(attempt, 0);
      }
      else if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Announcer
// ---------------------------------------------------------------------------

/**
 * The two live regions, mounted once in App and never re-keyed: a region inserted together with
 * its first message is often not read. The text node changes; a zero-width tail repeats a message.
 */
export function LiveRegions() {
  const p = politeSaid.value;
  const a = assertiveSaid.value;
  return (
    <div class="a11y-live sr-only">
      <div role="status" aria-live="polite" aria-atomic="true">
        {p.text}
        {p.n % 2 ? '\u200b' : ''}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {a.text}
        {a.n % 2 ? '\u200b' : ''}
      </div>
    </div>
  );
}
