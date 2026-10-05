/**
 * Turn tab (architecture §5.4 PromptPanel): what the viewer must do now, one panel per prompt kind.
 * Every panel works from the prompt and legal actions in the store, so hot-seat == online.
 */
import { useSignal } from '@preact/signals';
import type { Action, FoodCounts, FoodId, GameView, LegalAction, PendingChoice, PlayerId, PlayerState, Prompt, ReserveCard, Uid } from '@fcm/engine';
import { foodName } from '../state/catalog.js';
import { employeeIdOf, fireable, foodList, phaseLabel, salaryEstimate, standings } from '../state/selectors.js';
import { catalog, isMyTurn, legal, manifest, me, mode, myPlayer, pending, prompt, room, view } from '../state/store.js';
import { actionProblem } from '../state/guidance.js';
import { act, actChain, undo } from '../net/session.js';
import { Button, Cash, EmployeeCard, Empty, PlayerBadge, Pill, Stepper } from './common.js';
import { FoodIcon, Icon } from './icons.js';
import { OrgChartEditor } from './OrgChart.js';
import { PlacementFlow } from './flows/index.js';
import { LegalButton, WorkPanel } from './Work.js';
import { SeatControl } from './PlayerPanels.js';

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

const busyNow = () => Object.keys(pending.value).length > 0;
const findPlacement = (all: LegalAction[]) => all.find((l): l is PlacementLegal => l.kind === 'placement');
const findReady = (all: LegalAction[], type: string) => all.find((l): l is Extract<LegalAction, { kind: 'ready' }> => l.kind === 'ready' && l.action.type === type);
const hasCompose = (all: LegalAction[], type: string) => all.some((l) => l.kind === 'compose' && l.actionType === type);

export function PromptPanel() {
  const v = view.value;
  const pr = prompt.value;
  if (!v || !pr) return <Empty>Waiting for the game…</Empty>;
  const p = myPlayer.value;
  return (
    <div class={`prompt prompt-${pr.kind} ${isMyTurn.value ? 'is-mine' : ''}`}>
      <header class="prompt-head">
        <span class="eyebrow">
          Round {v.round || '—'} · {phaseLabel(v.phase)}
        </span>
        <h2>{pr.title}</h2>
      </header>
      <PromptBody view={v} prompt={pr} player={p} />
      {pr.kind !== 'work' && pr.kind !== 'gameOver' && pr.kind !== 'spectating' && me.value && <UndoRow />}
    </div>
  );
}

function PromptBody({ view: v, prompt: pr, player: p }: { view: GameView; prompt: Prompt; player: PlayerState | undefined }) {
  switch (pr.kind) {
    case 'waiting':
    case 'spectating':
      return <WaitingPanel view={v} waitingFor={pr.waitingFor} spectating={pr.kind === 'spectating'} />;
    case 'placeFirstRestaurant':
      return <FirstRestaurantPanel canPass={pr.canPass} />;
    case 'chooseReserve':
      return <ReservePanel view={v} options={pr.options} />;
    case 'restructure':
      return p ? (
        <>
          <OrgChartEditor view={v} player={p} prompt={pr} />
          {pr.submitted && <StillDeciding view={v} />}
        </>
      ) : null;
    case 'chooseOrder':
      return <OrderPanel view={v} free={pr.freePositions} />;
    case 'work':
      return p ? <WorkPanel view={v} player={p} /> : null;
    case 'payday':
      return p ? <PaydayPanel player={p} owed={pr.owed} mustFire={pr.mustFire} /> : null;
    case 'freezer':
      return p ? <FreezerPanel player={p} capacity={pr.capacity} /> : null;
    case 'choice':
      return p ? <ChoicePanel player={p} choice={pr.choice} /> : null;
    case 'gameOver':
      return <Standings view={v} ranking={pr.ranking} />;
  }
}

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

const AUTO_HINT: Partial<Record<GameView['phase']['kind'], string>> = {
  dinnertime: 'Houses buy from the cheapest, closest restaurant. This resolves on its own.',
  marketing: 'Campaigns place demand on houses in number order. This resolves on its own.',
  cleanup: 'Unsold goods are thrown away (unless frozen) and staff go back to hand.',
  orderOfBusiness: 'Players with the most open slots in their structure choose first.',
  restructuring: 'Everyone builds their structure in secret; they are revealed together.',
  payday: 'Everyone decides whom to fire at the same time, then pays salaries.',
};

function WaitingPanel({ view: v, waitingFor, spectating }: { view: GameView; waitingFor: PlayerId[]; spectating: boolean }) {
  const hint = AUTO_HINT[v.phase.kind];
  const online = mode.value === 'online';
  return (
    <div class="waiting">
      {spectating && (
        <p class="muted small">
          {Icon.eye({ size: 14 })} You are watching. Private choices are hidden.
        </p>
      )}
      {waitingFor.length > 0 ? (
        <ul class="waiting-list">
          {waitingFor.map((id) => {
            const seat = room.value?.seats.find((s) => s.playerId === id);
            const offline = online && seat && !seat.connected;
            return (
              <li key={id}>
                <PlayerBadge view={v} id={id} size={28} ring />
                <span>
                  <b>{v.players[id]?.name ?? id}</b>
                  <span class="muted small"> {offline ? (seat.clientId === null ? '· seat released, waiting for someone to take it' : '· offline, waiting for them to reconnect') : v.submitted[id] ? '· done' : '· thinking…'}</span>
                </span>
                {offline && <SeatControl playerId={id} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <div class="spinner-row">
          <span class="spinner" aria-hidden="true" /> Resolving…
        </div>
      )}
      {hint && <p class="hint">{hint}</p>}
    </div>
  );
}

function StillDeciding({ view: v }: { view: GameView }) {
  const left = v.awaiting.players.filter((id) => id !== me.value);
  if (!left.length) return null;
  return (
    <p class="muted small still-deciding">
      Still deciding: {left.map((id) => v.players[id]?.name ?? id).join(', ')}
    </p>
  );
}

function UndoRow() {
  return (
    <div class="undo-row">
      <Button size="sm" variant="ghost" icon="undo" disabled={busyNow()} onClick={() => undo()}>
        Undo my last action
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function FirstRestaurantPanel({ canPass }: { canPass: boolean }) {
  const all = legal.value;
  const place = findPlacement(all);
  const pass = findReady(all, 'setup.pass');
  const picking = useSignal(true);
  return (
    <div class="setup-restaurant">
      <p class="muted small">Your first restaurant goes on an empty 2×2 spot with its entrance on a road. At most one restaurant per map tile.</p>
      {place && picking.value ? (
        <PlacementFlow legal={place} onDone={() => (picking.value = false)} onCancel={() => (picking.value = false)} />
      ) : (
        place && (
          <Button variant="primary" icon="pin" onClick={() => (picking.value = true)}>
            Pick a spot
          </Button>
        )
      )}
      {canPass && pass && (
        <div class="row gap">
          <Button variant="ghost" disabled={busyNow()} onClick={() => act(pass.action)}>
            Pass this round
          </Button>
          <span class="muted small">You can place in the second round instead.</span>
        </div>
      )}
    </div>
  );
}

function reserveTitle(r: ReserveCard): string {
  return r.kind === 'standard' ? `${r.ceoSlots} CEO slots` : `Price $${r.basePrice}`;
}

function ReservePanel({ view: v, options }: { view: GameView; options: ReserveCard[] }) {
  const mine = me.value;
  const chosen = v.mine?.reserve ?? null;
  const done = Boolean(mine && v.submitted[mine]);
  return (
    <div class="reserve">
      <p class="muted small">Secret. When the bank first breaks, all cards are revealed: the bank gets the sum, and the most common choice sets everyone’s CEO slots.</p>
      <div class="reserve-cards">
        {options.map((o, i) => {
          const on = chosen !== null && chosen.kind === o.kind && chosen.amount === o.amount && (o.kind !== 'standard' || (chosen.kind === 'standard' && chosen.ceoSlots === o.ceoSlots));
          return (
            <button
              key={i}
              type="button"
              class={`reserve-card ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              disabled={busyNow() || !mine}
              onClick={() => mine && act({ type: 'setup.chooseReserve', playerId: mine, card: o })}
            >
              <Cash amount={o.amount} size="xl" />
              <span>{reserveTitle(o)}</span>
            </button>
          );
        })}
      </div>
      {done && (
        <Pill tone="ok" icon="check">
          Chosen. You can change it until everyone has picked.
        </Pill>
      )}
      <StillDeciding view={v} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order of business
// ---------------------------------------------------------------------------

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function OrderPanel({ view: v, free }: { view: GameView; free: number[] }) {
  const mine = me.value;
  const phase = v.phase.kind === 'orderOfBusiness' ? v.phase : null;
  const picks = phase?.picks ?? {};
  const byPos = new Map<number, PlayerId>();
  for (const [pid, pos] of Object.entries(picks)) if (pos !== undefined) byPos.set(pos, pid);
  return (
    <div class="order">
      <p class="muted small">Pick a free spot on the turn order track. Earlier spots act first in every phase this round.</p>
      <ol class="order-track">
        {v.turnOrder.map((_, i) => {
          const who = byPos.get(i);
          const open = free.includes(i);
          return (
            <li key={i}>
              <button
                type="button"
                class={`order-slot ${who ? 'is-taken' : ''} ${open ? 'is-open' : ''}`}
                disabled={!open || busyNow() || !mine}
                onClick={() => mine && act({ type: 'order.choosePosition', playerId: mine, position: i })}
              >
                <span class="order-pos">{ordinal(i + 1)}</span>
                {who ? <PlayerBadge view={v} id={who} size={26} /> : <span class="muted small">{open ? 'Take' : 'Free'}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {phase && phase.queue.length > 0 && (
        <p class="muted small">
          Choosing order: {phase.queue.map((id) => v.players[id]?.name ?? id).join(' → ')}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payday
// ---------------------------------------------------------------------------

function FirePicker({ player: p, selected, onToggle, locked, canPick }: { player: PlayerState; selected: Uid[]; onToggle: (u: Uid) => void; locked?: boolean; canPick?: (u: Uid) => boolean }) {
  const c = catalog.value;
  const list = fireable(p).filter((u) => !canPick || selected.includes(u) || canPick(u));
  if (!list.length) return <Empty icon="users">Nobody can be fired (the CEO and busy marketeers stay).</Empty>;
  return (
    <div class="card-grid">
      {list.map((u) => {
        const id = employeeIdOf(p, u);
        if (!id) return null;
        const on = selected.includes(u);
        return (
          <EmployeeCard
            key={u}
            id={id}
            compact
            selected={on}
            disabled={locked}
            onClick={() => onToggle(u)}
            badge={c.employees[id]?.salary && !p.employees[u]?.salaryFree ? <span class="salary">$5</span> : undefined}
            footer={on ? <span class="emp-status st-fire">Fire</span> : undefined}
          />
        );
      })}
    </div>
  );
}

function PaydayPanel({ player: p, owed, mustFire }: { player: PlayerState; owed: number; mustFire: boolean }) {
  const c = catalog.value;
  const all = legal.value;
  const selected = useSignal<Uid[]>([]);
  const canFire = hasCompose(all, 'payday.fire');
  const canConfirm = hasCompose(all, 'payday.confirm') || Boolean(findReady(all, 'payday.confirm'));
  const before = owed || salaryEstimate(c, p);
  const after = salaryEstimate(c, p, selected.value);
  const toggle = (u: Uid) => (selected.value = selected.value.includes(u) ? selected.value.filter((x) => x !== u) : [...selected.value, u]);
  const n = selected.value.length;
  const v = view.value;
  const fireAction = (uids: Uid[]): Action => ({ type: 'payday.fire', playerId: p.id, uids });
  const problem = v && n ? actionProblem(v, me.value, fireAction(selected.value), manifest.value) : null;
  const canPick = (u: Uid) => !v || !actionProblem(v, me.value, fireAction([...selected.value, u]), manifest.value);
  const owedNow = n ? after : before;
  const pay = after > p.cash ? 'pay what I can' : `pay $${owedNow}`;
  const payLabel = !canConfirm ? `Fire ${n}` : n ? `Fire ${n} and ${pay}` : pay.charAt(0).toUpperCase() + pay.slice(1);
  return (
    <div class="payday">
      <div class="payday-sum">
        <span>
          <span class="eyebrow">Cash</span>
          <Cash amount={p.cash} size="lg" />
        </span>
        <span>
          <span class="eyebrow">Salaries</span>
          <Cash amount={selected.value.length ? after : before} size="lg" />
        </span>
        {selected.value.length > 0 && <Pill tone="info">saves ${before - after}</Pill>}
      </div>
      {mustFire && <p class="org-warn">{Icon.info({ size: 16 })} You cannot pay everyone: fire salaried staff until you can.</p>}
      {canFire && (
        <>
          <h4>Fire anyone? <span class="muted small">Tap cards to select, then pay in one step.</span></h4>
          <FirePicker player={p} selected={selected.value} onToggle={toggle} canPick={canPick} />
        </>
      )}
      {problem && <p class="org-error" role="alert">{problem}</p>}
      <div class="row gap end">
        {(canConfirm || (canFire && n > 0)) && (
          <Button
            variant={n > 0 ? 'danger' : 'primary'}
            icon={n > 0 ? 'x' : 'check'}
            disabled={busyNow() || Boolean(problem)}
            onClick={() => {
              const steps: Action[] = [];
              if (n > 0) steps.push(fireAction(selected.value));
              if (canConfirm) steps.push({ type: 'payday.confirm', playerId: p.id });
              actChain(steps);
              selected.value = [];
            }}
          >
            {payLabel}
          </Button>
        )}
      </div>
      <p class="muted small">Salaried cards cost $5 each, wherever they are (at work, on the beach or busy). Recruiters with unused hires add $5 discounts.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clean up: freezer
// ---------------------------------------------------------------------------

function FreezerPanel({ player: p, capacity }: { player: PlayerState; capacity: number }) {
  const c = catalog.value;
  const keep = useSignal<FoodCounts>({});
  const goods = foodList(p.inventory);
  const total = Object.values(keep.value).reduce((n, x) => n + (x ?? 0), 0);
  return (
    <div class="freezer-panel">
      <p class="muted small">Unsold goods are thrown away. Your freezer keeps up to {capacity} for next round.</p>
      {goods.length === 0 ? (
        <Empty icon="snow">Nothing left to freeze.</Empty>
      ) : (
        <ul class="good-rows">
          {goods.map(([f, n]) => (
            <li key={f}>
              <FoodIcon food={f} size={24} />
              <span class="good-name">
                {foodName(c, f)} <span class="muted small">({n})</span>
              </span>
              <Stepper
                label={foodName(c, f)}
                value={keep.value[f] ?? 0}
                min={0}
                max={Math.min(n, (keep.value[f] ?? 0) + capacity - total)}
                onChange={(x) => (keep.value = { ...keep.value, [f]: x })}
              />
            </li>
          ))}
        </ul>
      )}
      <div class="row gap end">
        <span class="muted small">
          {total}/{capacity} frozen
        </span>
        <Button variant="primary" icon="snow" disabled={busyNow()} onClick={() => act({ type: 'cleanup.freezer', playerId: p.id, keep: keep.value })}>
          {total ? `Freeze ${total}` : 'Throw everything away'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending choices (forced fire, Ketchup placements, pay with goods)
// ---------------------------------------------------------------------------

function ChoicePanel({ player: p, choice }: { player: PlayerState; choice: PendingChoice }) {
  const all = legal.value;
  const place = findPlacement(all);
  const decline = findReady(all, 'choice.decline');
  const picking = useSignal(false);
  const selected = useSignal<Uid[]>([]);
  const tokens = useSignal<FoodCounts>({});
  const c = catalog.value;

  if (choice.kind === 'forcedFire') {
    const after = salaryEstimate(c, p, selected.value);
    const v = view.value;
    const fire = (uids: Uid[]): Action => ({ type: 'payday.fire', playerId: p.id, uids });
    // The engine decides who may go (salaried only, busy marketeers last, no more than needed).
    const problem = v && selected.value.length ? actionProblem(v, me.value, fire(selected.value), manifest.value) : null;
    const canPick = (u: Uid) => !v || !actionProblem(v, me.value, fire([...selected.value, u]), manifest.value);
    return (
      <div class="choice">
        <p class="org-warn">
          {Icon.info({ size: 16 })} You owe ${choice.owed} but have ${p.cash}. Fire salaried staff until you can pay.
        </p>
        <FirePicker player={p} selected={selected.value} canPick={canPick} onToggle={(u) => (selected.value = selected.value.includes(u) ? selected.value.filter((x) => x !== u) : [...selected.value, u])} />
        {problem && <p class="org-error" role="alert">{problem}</p>}
        <div class="row gap end">
          <span class="muted small">Salaries after: ${after}</span>
          <Button variant="danger" icon="x" disabled={busyNow() || !selected.value.length || Boolean(problem)} onClick={() => act(fire(selected.value))}>
            Fire {selected.value.length}
          </Button>
        </div>
      </div>
    );
  }

  if (choice.kind === 'payWithTokens') {
    const goods = foodList(p.inventory);
    return (
      <div class="choice">
        <p class="muted small">You may pay part of your ${choice.owed} salaries with goods ($5 each).</p>
        <ul class="good-rows">
          {goods.map(([f, n]) => (
            <li key={f}>
              <FoodIcon food={f as FoodId} size={24} />
              <span class="good-name">{foodName(c, f)}</span>
              <Stepper label={foodName(c, f)} value={tokens.value[f] ?? 0} min={0} max={n} onChange={(x) => (tokens.value = { ...tokens.value, [f]: x })} />
            </li>
          ))}
        </ul>
        <div class="row gap end">
          {decline && (
            <Button variant="ghost" disabled={busyNow()} onClick={() => act(decline.action)}>
              Pay in cash
            </Button>
          )}
          <Button variant="primary" icon="check" disabled={busyNow()} onClick={() => act({ type: 'payday.confirm', playerId: p.id, tokens: tokens.value })}>
            Pay with goods
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div class="choice">
      {place && picking.value ? (
        <PlacementFlow legal={place} onDone={() => (picking.value = false)} onCancel={() => (picking.value = false)} />
      ) : (
        <div class="action-list">
          {place && (
            <Button variant="primary" icon="pin" onClick={() => (picking.value = true)}>
              {place.label}
            </Button>
          )}
          {all
            .filter((l) => l.kind === 'ready' && l.action.type !== 'choice.decline')
            .map((l, i) => (
              <LegalButton key={i} legal={l} busy={busyNow()} />
            ))}
          {decline && (
            <Button variant="ghost" disabled={busyNow()} onClick={() => act(decline.action)}>
              {choice.optional ? 'No thanks' : 'Decline'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

export function Standings({ view: v, ranking }: { view: GameView; ranking: PlayerId[] }) {
  const order = ranking.length ? ranking : standings(v);
  const reason = v.phase.kind === 'gameOver' ? v.phase.reason : null;
  return (
    <div class="standings">
      {reason && <p class="muted small">{reason === 'bankBroke' ? 'The bank broke for the last time.' : 'Every chain went bankrupt.'} Most cash wins; ties go to the earlier turn order.</p>}
      <ol class="standings-list">
        {order.map((id, i) => {
          const p = v.players[id];
          if (!p) return null;
          const ms = Object.keys(p.milestones).length;
          return (
            <li key={id} class={`standing ${i === 0 ? 'is-winner' : ''} ${id === me.value ? 'is-me' : ''}`}>
              <span class="standing-rank">{i === 0 ? Icon.trophy({ size: 22 }) : i + 1}</span>
              <PlayerBadge view={v} id={id} size={32} />
              <span class="standing-name">
                <b>{p.name}</b>
                <span class="muted small">
                  {ms} milestone{ms === 1 ? '' : 's'} · {Object.values(v.board.restaurants).filter((r) => r.owner === id).length} restaurants
                  {p.bankrupt ? ' · bankrupt' : ''}
                </span>
              </span>
              <Cash amount={p.cash} size="lg" />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
