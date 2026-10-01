/** Modals and banners (architecture §5.4 Modals, HotseatHandoff): toasts, reconnect, handoff, game over, menu. */
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import type { PlayerId, Viewer } from '@fcm/engine';
import { navigate } from '../state/router.js';
import { connection, dismissToast, handoff, me, mode, prompt, reconnectAttempt, room, settings, toasts, updateSettings, view } from '../state/store.js';
import { acceptHandoff, endSession, leaveRoom, reconnectNow, resync, setDevViewer, undo } from '../net/session.js';
import { Button, IconButton, PlayerBadge, Toggle } from './common.js';
import { Icon, Logo } from './icons.js';
import { Standings } from './PromptPanel.js';
import { menuOpen, minimisedModal } from './uiState.js';

export function Toasts() {
  const list = toasts.value;
  if (!list.length) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast toast-${t.tone}`}>
          {t.tone === 'error' ? Icon.info({ size: 16 }) : Icon.check({ size: 16 })}
          <span>{t.text}</span>
          <IconButton icon="x" label="Dismiss" onClick={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}

/** Online only: connection lost / reconnecting. The game view stays visible but read-only. */
export function ConnectionBanner() {
  if (mode.value !== 'online') return null;
  const s = connection.value;
  if (s === 'open' || s === 'idle') return null;
  const text = s === 'connecting' ? 'Connecting to the server…' : s === 'reconnecting' ? `Connection lost. Reconnecting${reconnectAttempt.value > 1 ? ` (attempt ${reconnectAttempt.value})` : ''}…` : 'Disconnected from the server.';
  return (
    <div class={`conn-banner conn-${s}`} role="alert">
      {Icon.wifiOff({ size: 18 })}
      <span>{text}</span>
      {s !== 'connecting' && (
        <Button size="sm" variant="secondary" onClick={() => reconnectNow()}>
          Retry now
        </Button>
      )}
    </div>
  );
}

export function Modal({ title, children, onClose, wide, class: cls }: { title: ComponentChildren; children: ComponentChildren; onClose?: () => void; wide?: boolean; class?: string }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`modal glass ${wide ? 'is-wide' : ''} ${cls ?? ''}`} role="dialog" aria-modal="true">
        <header class="modal-head">
          <h2>{title}</h2>
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
  const p = v.players[h.to];
  return (
    <div class="handoff" style={{ '--pc': p?.color }}>
      <div class="handoff-card glass">
        <PlayerBadge view={v} id={h.to as PlayerId} size={72} />
        <p class="eyebrow">Pass the device to</p>
        <h1>{p?.name ?? h.to}</h1>
        <p class="muted">Everyone else, look away. Private choices are hidden until {p?.name ?? 'they'} confirm.</p>
        <Button variant="primary" size="lg" icon="hand" onClick={() => acceptHandoff()}>
          I’m {p?.name ?? h.to}: show my turn
        </Button>
      </div>
    </div>
  );
}

export function GameOverModal() {
  const v = view.value;
  const pr = prompt.value;
  if (!v || pr?.kind !== 'gameOver' || minimisedModal.value === 'gameOver') return null;
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
  if (mode.value === 'online' && room.value) leaveRoom();
  if (mode.value !== 'online') endSession();
  menuOpen.value = false;
  minimisedModal.value = null;
  navigate({ name: 'home' });
}

export function GameMenu() {
  if (!menuOpen.value) return null;
  const v = view.value;
  const close = () => (menuOpen.value = false);
  const m = mode.value;
  return (
    <Modal title={<><Logo size={28} /> Menu</>} onClose={close}>
      <div class="menu">
        {me.value && (
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
        {m === 'dev' && v && <DevViewer viewers={['spectator', ...v.turnOrder]} />}
        <Button variant="danger" icon="logout" onClick={() => leaveTable()}>
          {m === 'online' ? 'Leave the table' : 'End this game'}
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
