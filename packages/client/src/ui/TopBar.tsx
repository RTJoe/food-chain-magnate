import type { GameView } from '@fcm/engine';
import { PHASE_STEPS, phaseIndex, phaseLabel } from '../state/selectors.js';
import { connection, mode, view } from '../state/store.js';
import { IconButton, PlayerBadge } from './common.js';
import { MotionLayer, RollingCash } from './motion.js';
import { Icon, Logo } from './icons.js';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const v = view.value;
  if (!v) return null;
  const idx = phaseIndex(v.phase.kind);
  const setup = idx < 0;
  return (
    <header class="topbar glass" role="banner">
      <button type="button" class="topbar-brand" onClick={onMenu} aria-label="Game menu">
        <Logo size={34} />
      </button>
      <div class="topbar-round" title="Round">
        <span class="eyebrow">Round</span>
        <b>{v.round || '—'}</b>
      </div>
      <PhaseStepper view={v} idx={idx} setup={setup} />
      <BankChip view={v} />
      <TurnOrder view={v} />
      {mode.value === 'online' && (
        <span class={`conn conn-${connection.value}`} title={`Connection: ${connection.value}`}>
          {connection.value === 'open' ? Icon.wifi({ size: 16 }) : Icon.wifiOff({ size: 16 })}
        </span>
      )}
      <IconButton class="topbar-menu" icon="settings" label="Menu" onClick={onMenu} />
      <MotionLayer />
    </header>
  );
}

function PhaseStepper({ view: v, idx, setup }: { view: GameView; idx: number; setup: boolean }) {
  return (
    <nav class="phases" aria-label="Phases">
      <span class="phase-current">{phaseLabel(v.phase)}</span>
      {setup ? (
        <span class="phase-setup">{Icon.flag({ size: 16 })} Setup</span>
      ) : (
        <ol class="phase-steps">
          {PHASE_STEPS.map((s, i) => (
            <li key={s.label} class={i < idx ? 'is-done' : i === idx ? 'is-now' : ''} aria-current={i === idx ? 'step' : undefined} title={s.label}>
              {Icon[s.icon]({ size: 16 })}
              <span class="phase-name">{s.short}</span>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

function BankChip({ view: v }: { view: GameView }) {
  const b = v.bank;
  return (
    <div class={`bank ${b.breaks > 0 ? 'is-broken' : ''}`} data-flip="bank" title={`Bank: $${b.cash}${b.reserveOpened ? ' (reserve opened)' : ''}`}>
      {Icon.bank({ size: 18 })}
      <RollingCash amount={b.cash} />
      <span class="bank-breaks" aria-label={`${b.breaks} of 2 bank breaks`}>
        <i class={b.breaks >= 1 ? 'is-on' : ''} />
        <i class={b.breaks >= 2 ? 'is-on' : ''} />
      </span>
      {b.reserveOpened && <span class="bank-reserve">reserve in</span>}
    </div>
  );
}

function TurnOrder({ view: v }: { view: GameView }) {
  const active = new Set(v.awaiting.players);
  return (
    <ol class="turn-order" aria-label="Turn order">
      {v.turnOrder.map((id, i) => (
        <li key={id} class={active.has(id) ? 'is-active' : ''} data-flip={`order:${id}`} title={`${i + 1}. ${v.players[id]?.name ?? id}`}>
          <PlayerBadge view={v} id={id} size={28} ring={active.has(id)} />
        </li>
      ))}
    </ol>
  );
}
