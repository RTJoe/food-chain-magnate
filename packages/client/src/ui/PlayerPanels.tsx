import { useSignal } from '@preact/signals';
import type { GameView, MilestoneId, PlayerId, ReserveCard } from '@fcm/engine';
import { milestoneName } from '../state/catalog.js';
import { busyUids, cardsAtWork, standings } from '../state/selectors.js';
import { catalog, me, mode, room, view } from '../state/store.js';
import { companyPlayer, dockTab } from './uiState.js';
import { Cash, FoodChips, PlayerBadge } from './common.js';
import { Icon } from './icons.js';

export function PlayerPanels() {
  const v = view.value;
  if (!v) return null;
  const order = v.turnOrder;
  return (
    <aside class="rail" aria-label="Players">
      {order.map((id) => (
        <PlayerPanel key={id} view={v} id={id} />
      ))}
    </aside>
  );
}

function reserveLabel(r: ReserveCard | undefined | null): string | null {
  if (!r) return null;
  return r.kind === 'standard' ? `$${r.amount} · ${r.ceoSlots} slots` : `$${r.amount} · price $${r.basePrice}`;
}

function PlayerPanel({ view: v, id }: { view: GameView; id: PlayerId }) {
  const p = v.players[id];
  const open = useSignal(false);
  if (!p) return null;
  const isMe = me.value === id;
  const active = v.awaiting.players.includes(id);
  const seat = room.value?.seats.find((s) => s.playerId === id);
  const connected = mode.value === 'online' ? (seat?.connected ?? false) : null;
  const rank = standings(v).indexOf(id) + 1;
  const atWork = cardsAtWork(p).length;
  const total = Object.keys(p.employees).length;
  const milestones = Object.keys(p.milestones) as MilestoneId[];
  const reserve = reserveLabel(v.visibleReserves[id] ?? p.reserveCard);
  const submitted = v.submitted[id];
  const simultaneous = v.phase.kind === 'restructuring' || v.phase.kind === 'setup.reserve' || v.phase.kind === 'cleanup';
  const restaurantsOnBoard = Object.values(v.board.restaurants).filter((r) => r.owner === id).length;

  return (
    <article class={`ppanel glass ${active ? 'is-active' : ''} ${isMe ? 'is-me' : ''} ${p.bankrupt ? 'is-bankrupt' : ''}`} style={{ '--pc': p.color }}>
      <button type="button" class="ppanel-head" onClick={() => (open.value = !open.value)} aria-expanded={open.value}>
        <PlayerBadge view={v} id={id} size={34} ring={active} />
        <span class="ppanel-name">
          <b>{p.name}</b>
          <span class="ppanel-sub">
            {connected !== null && <span class={`dot ${connected ? 'is-on' : 'is-off'}`} aria-label={connected ? 'Online' : 'Offline'} />}
            {isMe ? 'You' : `#${rank} in cash`}
            {active && <span class="ppanel-turn"> · {simultaneous ? 'deciding' : 'playing'}</span>}
            {simultaneous && submitted && <span class="ppanel-ok"> · {Icon.check({ size: 12 })} done</span>}
          </span>
        </span>
        <Cash amount={p.cash} size="lg" />
      </button>
      <div class="ppanel-stats">
        <span title="Employees at work / owned">
          {Icon.briefcase({ size: 14 })} {atWork}/{total}
        </span>
        <span title={`${p.restaurantsRemaining} restaurants left to place; ${restaurantsOnBoard} on the board`}>
          {Icon.store({ size: 14 })}
          <span class="pips">
            {Array.from({ length: restaurantsOnBoard + p.restaurantsRemaining }, (_, i) => (
              <i key={i} class={i < restaurantsOnBoard ? 'is-on' : ''} />
            ))}
          </span>
        </span>
        {milestones.length > 0 && (
          <span title={milestones.map((m) => milestoneName(catalog.value, m)).join('\n')}>
            {Icon.star({ size: 14 })} {milestones.length}
          </span>
        )}
        {busyUids(p).length > 0 && <span title="Busy marketeers">{Icon.marketing({ size: 14 })} {busyUids(p).length}</span>}
      </div>
      <div class="ppanel-goods">
        <FoodChips counts={p.inventory} empty="No goods" size={18} />
        {Object.values(p.freezer).some((n) => (n ?? 0) > 0) && (
          <span class="freezer" title="Freezer">
            {Icon.snow({ size: 14 })}
            <FoodChips counts={p.freezer} size={16} />
          </span>
        )}
      </div>
      {open.value && (
        <div class="ppanel-more">
          {reserve && (
            <p class="small">
              {Icon.bank({ size: 14 })} Reserve: <b>{reserve}</b>
            </p>
          )}
          {milestones.length > 0 && (
            <ul class="mini-list">
              {milestones.map((m) => (
                <li key={m}>
                  {Icon.star({ size: 12 })} {milestoneName(catalog.value, m)}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            class="link-btn"
            onClick={() => {
              companyPlayer.value = id;
              dockTab.value = 'company';
            }}
          >
            View company {Icon.chevronRight({ size: 14 })}
          </button>
        </div>
      )}
    </article>
  );
}
