/**
 * Phase results (Dinnertime sales, Payday salaries, Marketing demand). Built from the events the
 * store collects per phase, so they also work for phases that resolve automatically.
 */
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';
import { employeeName, foodName } from '../state/catalog.js';
import { catalog, summaries, view, type PhaseSummary } from '../state/store.js';
import { Button, Cash, IconButton, PlayerBadge } from './common.js';
import { FoodIcon, Icon } from './icons.js';
import { openSummary, seenSummary } from './uiState.js';

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], t: T): Ev<T>[] => events.filter((e): e is Ev<T> => e.type === t);

const TITLES: Record<string, string> = { dinnertime: 'Dinnertime results', payday: 'Payday', marketing: 'Marketing results' };

/** Floating results card for the newest unseen summary (or one opened from the log). */
export function SummaryCard() {
  const v = view.value;
  const list = summaries.value;
  if (!v || !list.length) return null;
  const wanted = openSummary.value;
  const s = wanted !== null ? list.find((x) => x.id === wanted) : list.filter((x) => x.id > seenSummary.value && !isTrivial(x)).at(-1);
  if (!s) return null;
  const close = () => {
    seenSummary.value = Math.max(seenSummary.value, ...list.map((x) => x.id));
    openSummary.value = null;
  };
  return (
    <div class="summary-card glass" role="dialog" aria-label={TITLES[s.phase]}>
      <header class="summary-head">
        <span class="eyebrow">Round {s.round}</span>
        <h3>{TITLES[s.phase] ?? s.phase}</h3>
        <IconButton icon="x" label="Close" onClick={close} />
      </header>
      <div class="summary-body">
        <SummaryBody view={v} summary={s} />
      </div>
      <footer class="row end">
        <Button variant="primary" size="sm" onClick={close}>
          Got it
        </Button>
      </footer>
    </div>
  );
}

/** Nothing worth a popup: no sales, no salaries paid, no demand. */
function isTrivial(s: PhaseSummary): boolean {
  return !s.events.some(
    (e) =>
      e.type === 'sale' ||
      e.type === 'bankBroke' ||
      e.type === 'bankrupt' ||
      e.type === 'demandPlaced' ||
      e.type === 'employeeFired' ||
      (e.type === 'salaryPaid' && e.paid > 0),
  );
}

/** List of past summaries for the log tab. */
export function SummaryLinks() {
  const list = summaries.value;
  if (!list.length) return null;
  return (
    <div class="chip-row summary-links">
      {list
        .slice(-6)
        .reverse()
        .map((s) => (
          <button key={s.id} type="button" class="chip" onClick={() => (openSummary.value = s.id)}>
            R{s.round} {TITLES[s.phase] ?? s.phase}
          </button>
        ))}
    </div>
  );
}

function SummaryBody({ view: v, summary: s }: { view: GameView; summary: PhaseSummary }) {
  if (s.phase === 'dinnertime') return <Dinner view={v} events={s.events} />;
  if (s.phase === 'payday') return <Payday view={v} events={s.events} />;
  return <Marketing view={v} events={s.events} />;
}

function byPlayer(v: GameView, rows: Map<PlayerId, unknown>): PlayerId[] {
  return v.turnOrder.filter((id) => rows.has(id));
}

function Dinner({ view: v, events }: { view: GameView; events: GameEvent[] }) {
  const sales = of(events, 'sale');
  const tips = of(events, 'tipsPaid');
  const cfo = of(events, 'cfoBonus');
  const coffee = of(events, 'coffeeSold');
  const home = of(events, 'houseStayedHome').length;
  const breaks = of(events, 'bankBroke');
  const totals = new Map<PlayerId, number>();
  const add = (p: PlayerId, n: number) => totals.set(p, (totals.get(p) ?? 0) + n);
  for (const s of sales) add(s.player, s.total);
  for (const t of tips) add(t.player, t.amount);
  for (const x of cfo) add(x.player, x.amount);
  for (const x of coffee) add(x.player, x.amount);
  const houseLabel = (id: string) => v.board.houses[id]?.label ?? id;
  return (
    <>
      {totals.size === 0 && <p class="muted">No sales this round.</p>}
      <ul class="summary-totals">
        {byPlayer(v, totals).map((id) => (
          <li key={id}>
            <PlayerBadge view={v} id={id} size={24} />
            <span>{v.players[id]?.name}</span>
            <Cash amount={totals.get(id) ?? 0} />
          </li>
        ))}
      </ul>
      {sales.length > 0 && (
        <ul class="summary-lines">
          {sales.map((s, i) => (
            <li key={i}>
              <PlayerBadge view={v} id={s.player} size={18} />
              <span>
                House {houseLabel(s.houseId)}:{' '}
                {s.lines.map((l) => (
                  <span key={l.good} class="sale-good">
                    <FoodIcon food={l.good} size={14} />
                    {l.count}× ${l.each}
                  </span>
                ))}
                {s.bonuses.length > 0 && <span class="muted"> + bonuses ${s.bonuses.reduce((n, b) => n + b.amount, 0)}</span>}
                <span class="muted"> · {s.distance} away</span>
              </span>
              <b>${s.total}</b>
            </li>
          ))}
        </ul>
      )}
      {tips.length > 0 && <p class="small">Waitress tips: {tips.map((t) => `${v.players[t.player]?.name} $${t.amount}`).join(', ')}</p>}
      {cfo.length > 0 && <p class="small">CFO bonus: {cfo.map((t) => `${v.players[t.player]?.name} $${t.amount}`).join(', ')}</p>}
      {home > 0 && <p class="muted small">{home} house{home > 1 ? 's' : ''} with demand stayed home.</p>}
      {breaks.map((b) => (
        <p key={b.breakNo} class="org-warn">
          {Icon.bank({ size: 16 })} The bank broke{b.breakNo === 2 ? ' again: the game ends after this round' : `: reserves revealed, $${b.added} added, CEO slots now ${b.ceoSlots}`}.
        </p>
      ))}
      {of(events, 'bankrupt').map((b) => (
        <p key={b.player} class="org-error">
          {v.players[b.player]?.name} went bankrupt.
        </p>
      ))}
    </>
  );
}

function Payday({ view: v, events }: { view: GameView; events: GameEvent[] }) {
  const c = catalog.value;
  const paid = of(events, 'salaryPaid');
  const fired = of(events, 'employeeFired');
  return (
    <>
      <ul class="summary-totals">
        {paid.map((p) => (
          <li key={p.player}>
            <PlayerBadge view={v} id={p.player} size={24} />
            <span>
              {v.players[p.player]?.name}
              {p.discounts > 0 && <span class="muted small"> (−${p.discounts} discounts)</span>}
            </span>
            <Cash amount={p.paid} />
          </li>
        ))}
      </ul>
      {paid.length === 0 && <p class="muted">No salaries this round.</p>}
      {fired.length > 0 && (
        <ul class="summary-lines">
          {fired.map((f) => (
            <li key={f.uid}>
              <PlayerBadge view={v} id={f.player} size={18} />
              <span>
                fired {employeeName(c, f.employeeId)}
                {f.forced ? ' (could not pay)' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Marketing({ view: v, events }: { view: GameView; events: GameEvent[] }) {
  const c = catalog.value;
  const demand = of(events, 'demandPlaced');
  const income = of(events, 'marketingIncome');
  const expired = of(events, 'campaignExpired');
  return (
    <>
      {demand.length === 0 && <p class="muted">No demand placed.</p>}
      <ul class="summary-lines">
        {demand.map((d, i) => {
          const owner = d.campaignId ? v.board.campaigns[d.campaignId]?.owner : undefined;
          return (
            <li key={i}>
              {owner ? <PlayerBadge view={v} id={owner} size={18} /> : <span class="log-icon">{Icon.marketing({ size: 14 })}</span>}
              <span>
                House {v.board.houses[d.houseId]?.label ?? d.houseId}:{' '}
                {d.tokens.map((t, j) => (
                  <FoodIcon key={j} food={t.good} size={14} />
                ))}{' '}
                <span class="muted">{d.tokens.map((t) => foodName(c, t.good)).filter((x, j, a) => a.indexOf(x) === j).join(', ')}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {income.length > 0 && <p class="small">Marketing income: {income.map((x) => `${v.players[x.player]?.name} $${x.amount}`).join(', ')}</p>}
      {expired.length > 0 && <p class="muted small">{expired.length} campaign{expired.length > 1 ? 's' : ''} ran out; their marketeers come back.</p>}
    </>
  );
}
