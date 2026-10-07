/**
 * Where board keyboard shortcuts may act (WCAG 2.1.1 and 2.1.4). Camera keys (arrows, WASD, Q/E,
 * +/-, T, Home) and pick keys ([ ] R Enter) act only while the board canvas has focus, or while
 * nothing has focus and the pointer is over the board. They never act on a focused button, link,
 * field or tab, while a modal dialog is open, or while the board is hidden (another screen).
 */

/** The parts of a KeyboardEvent the scope reads (a plain object in tests). */
export interface KeyLike {
  key: string;
  target: EventTarget | null;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/** Text fields keep every key, Escape included. */
export function isTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? '')));
}

export interface BoardKeyEnv {
  canvas: EventTarget;
  /** The page's body / root: "nothing focused". */
  body: EventTarget | null;
  root: EventTarget | null;
  pointerOver: boolean;
  /** The canvas is laid out (not display:none behind another screen). */
  visible: boolean;
  modalOpen: boolean;
}

/** True when a board shortcut may handle `e`. */
export function boardOwnsKey(e: KeyLike, env: BoardKeyEnv): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (!env.visible || env.modalOpen) return false;
  const t = e.target;
  if (t === env.canvas) return true;
  return env.pointerOver && (t === null || t === env.body || t === env.root);
}

/**
 * Escape cancels a pick or clears a selection from anywhere in the game view (it activates no
 * control), except from a text field or inside a dialog (the dialog closes instead).
 */
export function boardOwnsEscape(e: KeyLike, env: Pick<BoardKeyEnv, 'visible' | 'modalOpen'>): boolean {
  if (e.key !== 'Escape' || e.defaultPrevented || !env.visible || env.modalOpen) return false;
  if (isTextField(e.target)) return false;
  const el = e.target as Element | null;
  return !el?.closest?.('[role=dialog]');
}

/** Pointer-over tracking plus the live environment for one canvas. */
export class BoardKeyScope {
  private over = false;
  private readonly off: (() => void)[] = [];

  constructor(private readonly canvas: HTMLElement) {
    const enter = () => (this.over = true);
    const leave = () => (this.over = false);
    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('pointerleave', leave);
    this.off.push(
      () => canvas.removeEventListener('pointerenter', enter),
      () => canvas.removeEventListener('pointerleave', leave),
    );
  }

  env(): BoardKeyEnv {
    const doc = this.canvas.ownerDocument;
    return {
      canvas: this.canvas,
      body: doc.body,
      root: doc.documentElement,
      pointerOver: this.over,
      visible: this.canvas.isConnected && this.canvas.clientWidth > 2 && this.canvas.clientHeight > 2,
      modalOpen: doc.querySelector('[aria-modal="true"]') !== null,
    };
  }

  owns(e: KeyboardEvent): boolean {
    return boardOwnsKey(e, this.env());
  }

  ownsEscape(e: KeyboardEvent): boolean {
    return boardOwnsEscape(e, this.env());
  }

  dispose(): void {
    for (const f of this.off) f();
  }
}
