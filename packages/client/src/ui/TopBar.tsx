import type { GameView } from '@fcm/engine';
import { PHASE_STEPS, phaseIndex, phaseLabel } from '../state/selectors.js';
import { connection, mode, view } from '../state/store.js';
import { IconButton, PlayerBadge } from './common.js';
import { MotionLayer, RollingCash } from './motion.js';
import { Icon, Logo } from './icons.js';
import { phaseTermId } from './glossary/index.js';
import { WhatsThis, whatsThisKeys } from './glossary/WhatsThis.js';
import { whatsThis } from './glossary/api.js';

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
      {v.round > 0 && (
        <div class="topbar-round" title="Round">
          <span class="eyebrow">Round</span>
          <b>{v.round}</b>
        </div>
      )}
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
      <span class="phase-current">
        {phaseLabel(v.phase)}
        <WhatsThis id={phaseTermId(v.phase.kind)} class="phase-wt wt-btn-light" />
      </span>
      {setup ? (
        <span class="phase-setup">{Icon.flag({ size: 16 })} Setup</span>
      ) : (
        <ol class="phase-steps">
          {PHASE_STEPS.map((s, i) => (
            <li
              key={s.label}
              class={`is-wt ${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}`}
              aria-current={i === idx ? 'step' : undefined}
              title={`${s.label}: what’s this?`}
              tabIndex={0}
              onClick={(e) => whatsThis(phaseTermId(s.kinds[0]!), e.currentTarget)}
              {...whatsThisKeys(phaseTermId(s.kinds[0]!))}
            >
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
    <div
      class={`bank is-wt ${b.breaks > 0 ? 'is-broken' : ''}`}
      data-tutorial="bank"
      data-flip="bank"
      title={`Bank: $${b.cash}${b.reserveOpened ? ' (reserve opened)' : ''}. What’s a bank break?`}
      tabIndex={0}
      onClick={(e) => whatsThis('bank_break', e.currentTarget)}
      {...whatsThisKeys('bank_break')}
    >
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
