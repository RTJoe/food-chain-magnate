/**
 * "What's this?" affordances and the popover they open.
 * - <WhatsThis id> : a small "?" (a span with role=button, so it can sit inside a card button).
 * - useWhatsThisPress(id): long-press on touch and the "?" key on a focused element.
 * - <WhatsThisLayer/>: mounted once (App); renders the popover and the rules sheet.
 */
import type { ComponentChildren, FunctionComponent } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EmployeeId, MilestoneId } from '@fcm/engine';
import { employeeName, managerSlots, milestoneName } from '../../state/catalog.js';
import { catalog } from '../../state/store.js';
import { Icon } from '../icons.js';
import { getTerm, GROUP_LABELS, type GlossaryEntry } from './index.js';
import { closeRules, closeWhatsThis, openGlossary, openRules, rulesSheet, whatsThis, whatsThisBack, whatsThisGo, whatsThisState, type RulesLoc } from './api.js';
import './glossary.css';

type SheetProps = { loc: RulesLoc; onClose: () => void };
let SheetImpl: FunctionComponent<SheetProps> | null = null;

/** The rules book (and its markdown) is a lazy chunk: loaded the first time a sheet opens. */
function LazyRulesSheet(props: SheetProps) {
  const [C, setC] = useState<FunctionComponent<SheetProps> | null>(() => SheetImpl);
  useEffect(() => {
    if (C) return;
    void import('../rules/RulesSheet.js').then((m) => {
      SheetImpl = m.RulesSheet;
      setC(() => m.RulesSheet);
    });
  }, []);
  return C ? <C {...props} /> : <div class="rules-sheet-backdrop" />;
}

const stop = (e: Event) => {
  e.stopPropagation();
  e.preventDefault();
};

/** Small "?" that opens the glossary entry. Safe inside buttons (it is a span); the glyph is CSS, so it adds no text to its parent. */
export function WhatsThis({ id, label, class: cls }: { id: string; label?: string; class?: string }) {
  const t = getTerm(id);
  if (!t) return null;
  const open = (e: Event) => {
    stop(e);
    whatsThis(id, e.currentTarget as Element);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      class={`wt-btn ${cls ?? ''}`}
      aria-label={`What’s this: ${label ?? t.term}`}
      title={`What’s this? ${label ?? t.term}`}
      data-wt={id}
      onClick={open}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') open(e);
      }}
    />
  );
}

/** Keyboard opener for a focusable element that opens a term on click: Enter, Space or "?". */
export function whatsThisKeys(id: string) {
  return {
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === '?') {
        stop(e);
        whatsThis(id, e.currentTarget as Element);
      }
    },
  };
}

const LONG_PRESS_MS = 500;

/**
 * Long-press (touch) and "?" key handlers for an element that has a glossary entry. Spread the
 * result on the element. A long-press swallows the click that follows it.
 */
export function useWhatsThisPress(id: string | null | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  if (!id || !getTerm(id)) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      if (e.pointerType !== 'touch') return;
      const el = e.currentTarget as Element;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        whatsThis(id, el);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e: Event) => {
      if (fired.current) e.preventDefault();
    },
    onClickCapture: (e: Event) => {
      if (fired.current) {
        fired.current = false;
        stop(e);
      }
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === '?') {
        stop(e);
        whatsThis(id, e.currentTarget as Element);
      }
    },
  };
}

export function WhatsThisLayer() {
  const loc = rulesSheet.value;
  return (
    <>
      <WhatsThisPopover />
      {loc && <LazyRulesSheet loc={loc} onClose={closeRules} />}
    </>
  );
}

const POP_W = 340;

function WhatsThisPopover() {
  const st = whatsThisState.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;

  useEffect(() => {
    if (!st) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWhatsThis();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current && t && !ref.current.contains(t) && !t.closest?.('.wt-btn')) closeWhatsThis();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [Boolean(st)]);

  useLayoutEffect(() => {
    if (!st || phone) return setPos(null);
    const h = ref.current?.offsetHeight ?? 260;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = st.anchor ?? { x: vw / 2 - POP_W / 2, y: vh / 3, w: POP_W, h: 0 };
    const left = Math.min(Math.max(8, a.x + a.w / 2 - POP_W / 2), vw - POP_W - 8);
    const below = a.y + a.h + 8;
    const top = below + h <= vh - 8 ? below : Math.max(8, a.y - h - 8);
    setPos({ left, top });
  }, [st?.id, st?.anchor, phone]);

  // Give focus back to the "?" (or card) that opened the popover once it closes.
  useEffect(() => {
    if (!st) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    return () => {
      const now = document.activeElement;
      const lost = !now || now === document.body || !now.isConnected;
      if (lost && opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, [Boolean(st)]);

  useEffect(() => {
    if (st) ref.current?.querySelector<HTMLElement>('.wt-pop-title')?.focus();
  }, [st?.id]);

  if (!st) return null;
  const t = getTerm(st.id);
  if (!t) return null;
  return (
    <>
      {phone && <div class="wt-scrim" onClick={closeWhatsThis} />}
      <div
        ref={ref}
        class={`wt-pop glass ${phone ? 'is-sheet' : ''}`}
        role="dialog"
        aria-label={`What’s this: ${t.term}`}
        style={phone ? undefined : { left: `${pos?.left ?? -9999}px`, top: `${pos?.top ?? 0}px`, width: `${POP_W}px` }}
      >
        <TermBody entry={t} trail={st.trail.length > 0} />
      </div>
    </>
  );
}

/** Popover / glossary card body for one entry. */
export function TermBody({ entry: t, trail, inline }: { entry: GlossaryEntry; trail?: boolean; inline?: boolean }) {
  return (
    <div class="wt-body">
      <header class="wt-head">
        {trail && (
          <button type="button" class="icon-btn wt-back" aria-label="Back" onClick={whatsThisBack}>
            {Icon.chevronLeft({ size: 18 })}
          </button>
        )}
        <span class="wt-titles">
          <span class="eyebrow">
            {GROUP_LABELS[t.group]}
            {t.module && t.group !== 'ketchup' ? ' · Ketchup' : ''}
          </span>
          <h3 class="wt-pop-title" tabIndex={-1}>
            {t.term}
          </h3>
        </span>
        {!inline && (
          <button type="button" class="icon-btn" aria-label="Close" onClick={closeWhatsThis}>
            {Icon.x({ size: 18 })}
          </button>
        )}
      </header>
      <p class="wt-short">{t.short}</p>
      {t.employee && <CardFacts id={t.employee} />}
      {t.milestone && <MilestoneFacts id={t.milestone} />}
      <p class="wt-example">
        <span class="wt-example-label">For example</span>
        {t.example}
      </p>
      {t.related.length > 0 && (
        <div class="wt-related">
          <span class="eyebrow">See also</span>
          <div class="chip-row">
            {t.related.map((r) => {
              const e = getTerm(r);
              return e ? (
                <button key={r} type="button" class="chip wt-chip" onClick={() => (inline ? openGlossary(r) : whatsThisGo(r))}>
                  {e.term}
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
      {!inline && (
        <footer class="wt-foot">
          {t.rule && (
            <button type="button" class="link-btn" onClick={() => openRules(t.rule ?? null)}>
              {Icon.log({ size: 16 })} Read the rule
            </button>
          )}
          <button type="button" class="link-btn" onClick={() => openGlossary(t.id)}>
            All terms {Icon.chevronRight({ size: 16 })}
          </button>
        </footer>
      )}
    </div>
  );
}

function Fact({ children }: { children: ComponentChildren }) {
  return <span class="wt-fact">{children}</span>;
}

function CardFacts({ id }: { id: EmployeeId }) {
  const c = catalog.value;
  const d = c.employees[id];
  if (!d) return null;
  const from = (Object.values(c.employees) as NonNullable<(typeof c.employees)[EmployeeId]>[]).filter((x) => x.trainsInto.includes(id)).map((x) => employeeName(c, x.id));
  const slots = managerSlots(d);
  return (
    <div class="wt-facts">
      <div class="wt-fact-row">
        {d.entry && <Fact>{Icon.sparkle({ size: 12 })} Entry level</Fact>}
        <Fact>{d.salary ? '$5 salary' : 'No salary'}</Fact>
        {d.unique && <Fact>1x</Fact>}
        {slots > 0 && <Fact>{slots} slots</Fact>}
        {d.mandatory && <Fact>Auto</Fact>}
      </div>
      {d.text && <p class="wt-card-text">“{d.text}”</p>}
      {(d.trainsInto.length > 0 || from.length > 0) && (
        <p class="small muted">
          {from.length > 0 && <>Trained from {from.join(' or ')}. </>}
          {d.trainsInto.length > 0 ? <>Trains into {d.trainsInto.map((x) => employeeName(c, x)).join(', ')}.</> : <>Cannot be trained further.</>}
        </p>
      )}
    </div>
  );
}

function MilestoneFacts({ id }: { id: MilestoneId }) {
  const c = catalog.value;
  const d = c.milestones[id];
  if (!d?.text) return null;
  return (
    <div class="wt-facts">
      <p class="wt-card-text">
        <b>{milestoneName(c, id)}:</b> {d.text}
      </p>
    </div>
  );
}
