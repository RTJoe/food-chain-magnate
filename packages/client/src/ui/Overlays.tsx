/** Modals and banners (architecture §5.4 Modals, HotseatHandoff): toasts, reconnect, handoff, game over, menu. */
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import type { PlayerId, Viewer } from '@fcm/engine';
import { navigate } from '../state/router.js';
import { connection, dismissToast, handoff, holdToast, me, mode, prompt, reconnectAttempt, reloadRequired, room, settings, toasts, updateSettings, view } from '../state/store.js';
import { acceptHandoff, endSession, leaveRoom, reconnectNow, replacedElsewhere, resync, setDevViewer, undo } from '../net/session.js';
import { connectionBanner, END_HOTSEAT_CONFIRM, hotseatAtRisk } from '../state/connection.js';
import { Button, IconButton, PlayerBadge, Toggle } from './common.js';
import { Icon, Logo } from './icons.js';
import { Standings } from './PromptPanel.js';
import { hasUnseenSummary } from './Summary.js';
import { menuOpen, minimisedModal } from './uiState.js';
import { GameMenuExtras } from './hints/CoachHints.js';
import { takeFreePlayReturn } from './hints/coach.js';
import { useDialog } from './a11y.js';

/** Toast text is read through the App's live regions (pushToast announces it), so this list is not one. */
export function Toasts() {
  const list = toasts.value;
  if (!list.length) return null;
  return (
    <div class="toasts">
      {list.map((t) => (
        <div key={t.id} class={`toast toast-${t.tone}`} onPointerEnter={() => holdToast(t.id, true)} onPointerLeave={() => holdToast(t.id, false)} onFocusIn={() => holdToast(t.id, true)} onFocusOut={() => holdToast(t.id, false)}>
          {t.tone === 'error' ? Icon.info({ size: 16 }) : Icon.check({ size: 16 })}
          <span>{t.text}</span>
          <IconButton icon="x" label="Dismiss" onClick={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}

/** Online only: connection lost / reconnecting, or the game was taken over by another tab. The game view stays visible but read-only. */
export function ConnectionBanner() {
  if (mode.value !== 'online') return null;
  const s = connection.value;
  const b = connectionBanner(s, reconnectAttempt.value, s === 'closed' && replacedElsewhere());
  if (!b) return null;
  return (
    <div class={`conn-banner conn-${s} ${b.tone === 'info' ? 'conn-elsewhere' : ''}`} role="alert">
      {Icon.wifiOff({ size: 18 })}
      <span>{b.text}</span>
      {b.action && (
        <Button size="sm" variant={b.tone === 'info' ? 'primary' : 'secondary'} onClick={() => reconnectNow()}>
          {b.action}
        </Button>
      )}
    </div>
  );
}

/**
 * Online: the server runs a newer build than this tab (M259). Old rules in this tab would show
 * wrong prompts and moves, so nothing else is usable until the page is reloaded.
 */
export function ReloadRequired() {
  if (!reloadRequired.value) return null;
  return (
    <Modal title="A new version is out" class="reload-required">
      <p>The game was updated since this page was opened. Reload to keep playing; your seat and your games are kept.</p>
      <div class="row gap end">
        <Button variant="primary" icon="undo" onClick={() => location.reload()}>
          Reload
        </Button>
      </div>
    </Modal>
  );
}

export function Modal({ title, children, onClose, wide, class: cls }: { title: ComponentChildren; children: ComponentChildren; onClose?: () => void; wide?: boolean; class?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} class={`modal glass ${wide ? 'is-wide' : ''} ${cls ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header class="modal-head">
          <h2 id={titleId}>{title}</h2>
          {onClose && <IconButton icon="x" label="Close" onClick={onClose} />}
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Hot-seat: cover the screen until the next player has the device. */
export function HotseatHandoff() {
  const h = handoff.value;
  const v = view.value;
  if (!h || !v) return null;
  return <HandoffCover key={h.to} to={h.to as PlayerId} />;
}

/** Then the new player's turn heading takes focus (the dock's prompt title, else the open panel's heading). */
const promptHeading = (): HTMLElement | null => {
  const h = document.querySelector<HTMLElement>('.prompt-head h2') ?? document.querySelector<HTMLElement>('.dock-body h2, .dock-body h3');
  if (h) h.tabIndex = -1;
  return h;
};

function HandoffCover({ to }: { to: PlayerId }) {
  const v = view.value!;
  const p = v.players[to];
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Modal: the table under the cover is inert, and its private choices stay out of reach.
  useDialog(ref, { initial: '.btn-primary', returnTo: promptHeading });
  return (
    <div ref={ref} class="handoff" style={{ '--pc': p?.color }} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div class="handoff-card glass">
        <PlayerBadge view={v} id={to} size={72} hidden />
        <p class="eyebrow">Pass the device to</p>
        <h1 id={titleId}>{p?.name ?? to}</h1>
        <p class="muted">Everyone else, look away. Private choices stay hidden until {p?.name ? `${p.name} confirms` : 'they confirm'}.</p>
        <Button variant="primary" size="lg" icon="hand" onClick={() => acceptHandoff()}>
          I’m {p?.name ?? to}: show my turn
        </Button>
      </div>
    </div>
  );
}

export function GameOverModal() {
  const v = view.value;
  const pr = prompt.value;
  if (!v || pr?.kind !== 'gameOver' || minimisedModal.value === 'gameOver') return null;
  // In a lesson the coach card tells the result; a modal would block it.
  if (mode.value === 'tutorial') return null;
  // One end sequence: the final round's results strip first, then the standings once it is closed.
  if (hasUnseenSummary()) return null;
  const winner = v.players[pr.ranking[0] ?? ''];
  return (
    <Modal title={<>{Icon.trophy({ size: 22 })} Game over</>} onClose={() => (minimisedModal.value = 'gameOver')} class="gameover">
      {winner && (
        <p class="gameover-winner">
          <b>{winner.name}</b> {winner.id === me.value ? '(you!) ' : ''}runs the town’s biggest food chain.
        </p>
      )}
      <Standings view={v} ranking={pr.ranking} />
      <div class="row gap end">
        <Button variant="ghost" onClick={() => (minimisedModal.value = 'gameOver')}>
          Look at the board
        </Button>
        <Button variant="primary" icon="home" onClick={() => leaveTable()}>
          Back home
        </Button>
      </div>
    </Modal>
  );
}

export function leaveTable(): void {
  // Lessons and L16 free play (launched from the Learn hub) return to the hub.
  const lesson = mode.value === 'tutorial' || (mode.value === 'hotseat' && takeFreePlayReturn());
  if (mode.value === 'online' && room.value) leaveRoom();
  if (mode.value !== 'online') endSession();
  menuOpen.value = false;
  minimisedModal.value = null;
  navigate(lesson ? { name: 'learn', lesson: null } : { name: 'home' });
}

/** Warn before a reload or navigation throws away a running hot-seat game (it lives only in memory). */
function useHotseatUnloadGuard(): void {
  const atRisk = hotseatAtRisk(mode.value, Boolean(view.value), prompt.value?.kind === 'gameOver');
  useEffect(() => {
    if (!atRisk) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [atRisk]);
}

export function GameMenu() {
  // Always mounted with the table, so the unload guard lives here (before the closed-menu early return).
  useHotseatUnloadGuard();
  if (!menuOpen.value) return null;
  const v = view.value;
  const close = () => (menuOpen.value = false);
  const m = mode.value;
  return (
    <Modal title={<><Logo size={28} /> Menu</>} onClose={close}>
      <div class="menu">
        {me.value && m !== 'tutorial' && (
          <Button variant="secondary" icon="undo" onClick={() => (undo(), close())}>
            Undo my last action
          </Button>
        )}
        {m === 'online' && (
          <Button variant="secondary" icon="link" onClick={() => (resync(), close())}>
            Reload game state
          </Button>
        )}
        {m === 'online' && room.value && (
          <p class="muted small">
            Room <b class="room-code-sm">{room.value.id}</b>. Rejoin any time from this device: your seat is kept.
          </p>
        )}
        <Toggle checked={settings.value.placementList} onChange={(b) => updateSettings({ placementList: b })} label="List placements" description="Also show board spots as a list under placement prompts." />
        <GameMenuExtras />
        {m === 'dev' && v && <DevViewer viewers={['spectator', ...v.turnOrder]} />}
        <Button variant="danger" icon="logout" onClick={() => (!hotseatAtRisk(m, Boolean(v), prompt.value?.kind === 'gameOver') || window.confirm(END_HOTSEAT_CONFIRM)) && leaveTable()}>
          {m === 'online' ? 'Leave the table' : m === 'tutorial' ? 'Leave the lesson' : 'End this game'}
        </Button>
      </div>
    </Modal>
  );
}

function DevViewer({ viewers }: { viewers: Viewer[] }) {
  const v = view.value;
  return (
    <div class="field">
      <span class="field-label">View as</span>
      <div class="chip-row">
        {viewers.map((id) => (
          <button key={id} type="button" class={`chip ${(me.value ?? 'spectator') === id ? 'is-on' : ''}`} onClick={() => setDevViewer(id)}>
            {id === 'spectator' ? 'Spectator' : (v?.players[id]?.name ?? id)}
          </button>
        ))}
      </div>
    </div>
  );
}
