import { useSignal } from '@preact/signals';
import type { GameView, MilestoneId, PlayerId, ReserveCard } from '@fcm/engine';
import { milestoneName } from '../state/catalog.js';
import { busyUids, cardsAtWork, standings } from '../state/selectors.js';
import { amHost, botSeats, botsThinking, catalog, clientId, me, mode, mySeat, room, view } from '../state/store.js';
import { cameraCommand, inspectIds } from '../state/interaction.js';
import { kick, sit } from '../net/session.js';
import { companyPlayer, dockTab } from './uiState.js';
import { Button, FoodChips, PlayerBadge } from './common.js';
import { RollingCash } from './motion.js';
import { Icon } from './icons.js';
import { BotBadge } from './bots.js';

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

/** Board pieces of a player (restaurants, campaigns, owned entities) for rail-hover rings and focus. */
export function playerPieceIds(v: GameView, id: PlayerId): string[] {
  const b = v.board;
  return [
    ...Object.values(b.restaurants).filter((r) => r.owner === id).map((r) => r.id),
    ...Object.values(b.campaigns).filter((c) => c.owner === id).map((c) => c.id),
    ...Object.values(b.entities).filter((e) => 'owner' in e && e.owner === id).map((e) => e.id),
  ];
}

/**
 * Online only: the host can release the seat of a disconnected player (`room.kick`), and a member
 * without a seat can take a released one over (`room.sit`); the seat keeps its in-game player.
 */
export function SeatControl({ playerId }: { playerId: PlayerId }) {
  if (mode.value !== 'online') return null;
  const r = room.value;
  const seat = r?.seats.find((s) => s.playerId === playerId);
  if (!r || !seat || r.status !== 'playing' || seat.bot) return null;
  if (seat.clientId === null) {
    if (mySeat.value) return <span class="muted small">Seat open: anyone in the room can take it over.</span>;
    return (
      <Button size="sm" variant="primary" icon="hand" onClick={() => sit(seat.index)}>
        Take over this seat
      </Button>
    );
  }
  if (!amHost.value || seat.connected || seat.clientId === clientId.value) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon="logout"
      title="Free this seat so the player (or someone else) can take it over from another device"
      onClick={() => {
        if (confirm(`Release ${seat.name ?? 'this player'}'s seat? They (or anyone in the room) can then take it over from another device.`)) kick(seat.index);
      }}
    >
      Release seat
    </Button>
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
  const bot = botSeats.value[id] ?? null;
  const thinking = Boolean(bot) && botsThinking.value.includes(id);
  const rank = standings(v).indexOf(id) + 1;
  const atWork = cardsAtWork(p).length;
  const total = Object.keys(p.employees).length;
  const milestones = Object.keys(p.milestones) as MilestoneId[];
  const reserve = reserveLabel(v.visibleReserves[id] ?? p.reserveCard);
  const submitted = v.submitted[id];
  const simultaneous = v.phase.kind === 'restructuring' || v.phase.kind === 'setup.reserve' || v.phase.kind === 'cleanup';
  const restaurantsOnBoard = Object.values(v.board.restaurants).filter((r) => r.owner === id).length;

  return (
    <article
      class={`ppanel glass ${active ? 'is-active' : ''} ${isMe ? 'is-me' : ''} ${p.bankrupt ? 'is-bankrupt' : ''} ${bot ? 'is-bot' : ''}`}
      style={{ '--pc': p.color }}
      data-flip={`panel:${id}`}
      data-tutorial={`rail-${id}`}
      onMouseEnter={() => (inspectIds.value = playerPieceIds(v, id))}
      onMouseLeave={() => (inspectIds.value = [])}
    >
      <button type="button" class="ppanel-head" onClick={() => (open.value = !open.value)} aria-expanded={open.value}>
        <PlayerBadge view={v} id={id} size={34} ring={active} />
        <span class="ppanel-name">
          <b>{p.name}</b>
          {bot && <BotBadge level={bot} thinking={thinking} />}
          <span class="ppanel-sub">
            {connected !== null && <span class={`dot ${connected ? 'is-on' : 'is-off'}`} aria-label={connected ? 'Online' : 'Offline'} />}
            {isMe ? 'You' : `#${rank} in cash`}
            {thinking ? <span class="ppanel-turn ppanel-thinking"> · thinking…</span> : active && <span class="ppanel-turn"> · {simultaneous ? 'deciding' : 'playing'}</span>}
            {simultaneous && submitted && <span class="ppanel-ok"> · {Icon.check({ size: 12 })} done</span>}
          </span>
        </span>
        <span data-tutorial={`cash-${id}`}>
          <RollingCash amount={p.cash} player={id} size="lg" flip={`cash:${id}`} />
        </span>
      </button>
      <div class="ppanel-stats">
        <span title="Employees at work / owned">
          {Icon.briefcase({ size: 14 })} {atWork}/{total}
        </span>
        <button
          type="button"
          class="stat-btn"
          title={`${p.restaurantsRemaining} restaurants left to place; ${restaurantsOnBoard} on the board. Click to show them.`}
          disabled={restaurantsOnBoard === 0}
          onClick={() => (cameraCommand.value = { kind: 'focus', ids: Object.values(v.board.restaurants).filter((r) => r.owner === id).map((r) => r.id) })}
        >
          {Icon.store({ size: 14 })}
          <span class="pips">
            {Array.from({ length: restaurantsOnBoard + p.restaurantsRemaining }, (_, i) => (
              <i key={i} class={i < restaurantsOnBoard ? 'is-on' : ''} />
            ))}
          </span>
        </button>
        {milestones.length > 0 && (
          <span title={milestones.map((m) => milestoneName(catalog.value, m)).join('\n')} data-flip={`stars:${id}`}>
            {Icon.star({ size: 14 })} {milestones.length}
          </span>
        )}
        {busyUids(p).length > 0 && <span title="Busy marketeers">{Icon.marketing({ size: 14 })} {busyUids(p).length}</span>}
      </div>
      {connected === false && <SeatControl playerId={id} />}
      <div class="ppanel-goods" data-flip={`goods:${id}`}>
        <FoodChips counts={p.inventory} empty="No goods" size={18} />
        {Object.values(p.freezer).some((n) => (n ?? 0) > 0) && (
          <span class="freezer" title="Freezer" data-flip={`freezer:${id}`}>
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
