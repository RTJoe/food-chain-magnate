/**
 * Phase results (Dinnertime sales, Payday salaries, Marketing demand). Built from the events the
 * store collects per phase, so they also work for phases that resolve automatically.
 *
 * ux-plan §2.3 (WP5): the results are a strip along the bottom of the board, not a card over it.
 * Dinnertime steps through the houses in resolution order: each step selects the house, frames it
 * and asks the board (`boardFeedback`) to draw the winning route with every chain's
 * "$price + distance = $total"; houses that stayed home say so. Marketing steps through the
 * campaigns in run order with their reach. While a phase animates, the board's live caption
 * (`phaseCaption`) shows at the top of the board.
 */
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import type { GameEvent, GameView, PlayerId } from '@fcm/engine';
import { employeeName, foodName } from '../state/catalog.js';
import { boardFeedback, campaignInfo, campaignSteps, dinnerFeedback, dinnerSteps, phaseCaption, type CampaignStep, type DinnerStep, type PhaseCaption } from '../state/feedback.js';
import { reachPreview } from '../state/guidance.js';
import { cameraCommand, select, selection } from '../state/interaction.js';
import { catalog, me, summaries, view, type PhaseSummary } from '../state/store.js';
import { Button, Cash, IconButton, PlayerBadge } from './common.js';
import { FoodIcon, Icon } from './icons.js';
import { openSummary, seenSummary, sheetOpen } from './uiState.js';
import '../styles/feedback.css';

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], t: T): Ev<T>[] => events.filter((e): e is Ev<T> => e.type === t);

const TITLES: Record<string, string> = { dinnertime: 'Dinnertime results', payday: 'Payday', marketing: 'Marketing results' };

const nameOf = (v: GameView, id: PlayerId | null | undefined) => (id ? (v.players[id]?.name ?? id) : 'Someone');
const houseLabel = (v: GameView, id: string) => v.board.houses[id]?.label ?? id;
const colorOf = (v: GameView, id: PlayerId | null | undefined) => (id ? v.players[id]?.color : undefined) ?? '#8f8b88';

/** Results strip for the newest unseen summary (or one opened from the log), plus the live phase caption. */
export function SummaryCard() {
  const v = view.value;
  const list = summaries.value;
  const wanted = openSummary.value;
  const s = v && list.length ? (wanted !== null ? list.find((x) => x.id === wanted) : list.filter((x) => x.id > seenSummary.value && !isTrivial(x)).at(-1)) : undefined;
  return (
    <>
      {v && <CaptionPill view={v} />}
      {v && s && <SummaryStrip key={s.id} view={v} summary={s} />}
    </>
  );
}

function SummaryStrip({ view: v, summary: s }: { view: GameView; summary: PhaseSummary }) {
  const list = summaries.value;
  const close = () => {
    seenSummary.value = Math.max(seenSummary.value, ...list.map((x) => x.id));
    openSummary.value = null;
  };
  // Leaving the strip clears what it asked the board to show.
  useEffect(
    () => () => {
      boardFeedback.value = null;
    },
    [],
  );
  return (
    <div class="summary-card summary-strip glass" role="dialog" aria-label={TITLES[s.phase]}>
      <header class="summary-head sx-head">
        <h3>
          {TITLES[s.phase] ?? s.phase} <span class="eyebrow">Round {s.round}</span>
        </h3>
        <IconButton icon="x" label="Close" onClick={close} />
      </header>
      <div class="summary-body">
        <SummaryBody view={v} summary={s} />
      </div>
      <footer class="row end sx-foot">
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
      e.type === 'houseStayedHome' ||
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

// ---------------------------------------------------------------------------
// Step-through
// ---------------------------------------------------------------------------

/** ◀ "House 5 · 2 of 9" ▶, plus one chip per step to jump straight to it. */
function Stepper<T>({ steps, idx, go, label, chip, start }: { steps: T[]; idx: number; go: (i: number) => void; label: (s: T) => string; chip: (s: T, on: boolean, i: number) => JSX.Element; start: string }) {
  const n = steps.length;
  const cur = idx >= 0 ? steps[idx] : undefined;
  return (
    <div class="sx-steps">
      <div class="sx-nav">
        <IconButton icon="chevronLeft" label="Previous" disabled={n === 0} onClick={() => go(idx <= 0 ? n - 1 : idx - 1)} />
        {cur ? (
          <span class="sx-pos">
            {label(cur)} <span class="muted">· {idx + 1}/{n}</span>
          </span>
        ) : (
          <button type="button" class="sx-start" onClick={() => go(0)}>
            {Icon.play({ size: 14 })} {start}
          </button>
        )}
        <IconButton icon="chevronRight" label="Next" disabled={n === 0} onClick={() => go(idx >= n - 1 ? 0 : idx + 1)} />
      </div>
      <div class="sx-chips">{steps.map((s, i) => chip(s, i === idx, i))}</div>
    </div>
  );
}

/** Selects the house / campaign of a step, frames it and clears both when the strip goes. */
function useStepSelection(): (sel: { kind: 'house' | 'campaign'; id: string } | null, focus: string[]) => void {
  const mine = useSignal<string | null>(null);
  useEffect(
    () => () => {
      if (mine.value && selection.peek()?.id === mine.value) select(null);
    },
    [],
  );
  const framed = useSignal(false);
  return (sel, focus) => {
    mine.value = sel?.id ?? null;
    select(sel);
    // Phone: lower the bottom sheet so the board shows what the step points at.
    sheetOpen.value = false;
    // Frame the whole board once: routes can cross it and the chips keep a readable size at any
    // zoom. A close-up (`focus`) would hide competitors and sit under the panels.
    if (!framed.value) {
      framed.value = true;
      cameraCommand.value = focus.length ? { kind: 'reset' } : null;
    }
  };
}

// ---------------------------------------------------------------------------
// Dinnertime
// ---------------------------------------------------------------------------

function Dinner({ view: v, events }: { view: GameView; events: GameEvent[] }) {
  const sales = of(events, 'sale');
  const tips = of(events, 'tipsPaid');
  const cfo = of(events, 'cfoBonus');
  const coffee = of(events, 'coffeeSold');
  const breaks = of(events, 'bankBroke');
  const steps = dinnerSteps(events);
  const idx = useSignal(-1);
  const pickStep = useStepSelection();
  const totals = new Map<PlayerId, number>();
  const add = (p: PlayerId, n: number) => totals.set(p, (totals.get(p) ?? 0) + n);
  for (const s of sales) add(s.player, s.total);
  for (const t of tips) add(t.player, t.amount);
  for (const x of cfo) add(x.player, x.amount);
  for (const x of coffee) add(x.player, x.amount);
  const home = steps.filter((s) => s.stayedHome && !s.sale).length;
  const go = (i: number) => {
    const st = steps[i];
    if (!st) return;
    idx.value = i;
    boardFeedback.value = dinnerFeedback(st);
    pickStep(v.board.houses[st.houseId] ? { kind: 'house', id: st.houseId } : null, [st.houseId, ...(st.sale ? [st.sale.restaurantId] : [])]);
  };
  const cur = idx.value >= 0 ? steps[idx.value] : undefined;
  return (
    <>
      {totals.size === 0 && <p class="muted">No sales this round.</p>}
      {totals.size > 0 && (
        <ul class="summary-totals sx-totals">
          {byPlayer(v, totals).map((id) => (
            <li key={id}>
              <PlayerBadge view={v} id={id} size={22} />
              <span>{v.players[id]?.name}</span>
              <Cash amount={totals.get(id) ?? 0} size="sm" />
            </li>
          ))}
        </ul>
      )}
      {steps.length > 0 && (
        <Stepper
          steps={steps}
          idx={idx.value}
          go={go}
          start={`Step through ${steps.length} house${steps.length === 1 ? '' : 's'}`}
          label={(s) => `House ${houseLabel(v, s.houseId)}`}
          chip={(s, on, i) => (
            <button
              key={s.houseId}
              type="button"
              class={`sx-chip ${on ? 'is-on' : ''} ${s.sale ? '' : 'is-home'}`}
              style={s.sale ? { '--sx-c': colorOf(v, s.sale.player) } : undefined}
              title={s.sale ? `${nameOf(v, s.sale.player)} sells $${s.sale.total}` : 'Stayed home'}
              onClick={() => go(i)}
            >
              {houseLabel(v, s.houseId)}
            </button>
          )}
        />
      )}
      {cur && <DinnerDetail view={v} step={cur} />}
      {tips.length > 0 && <p class="small">Waitress tips: {tips.map((t) => `${nameOf(v, t.player)} $${t.amount}`).join(', ')}</p>}
      {cfo.length > 0 && <p class="small">CFO bonus: {cfo.map((t) => `${nameOf(v, t.player)} $${t.amount}`).join(', ')}</p>}
      {coffee.length > 0 && <p class="small">Coffee: {coffee.map((t) => `${nameOf(v, t.player)} $${t.amount}`).join(', ')}</p>}
      {home > 0 && !cur && (
        <p class="muted small">
          {home} house{home > 1 ? 's' : ''} with demand stayed home (marked “no seller” on the board until Marketing).
        </p>
      )}
      {breaks.map((b) => (
        <p key={b.breakNo} class="org-warn">
          {Icon.bank({ size: 16 })} The bank broke{b.breakNo === 2 ? ' again: the game ends after this round' : `: reserves revealed, $${b.added} added, CEO slots now ${b.ceoSlots}`}.
        </p>
      ))}
      {of(events, 'bankrupt').map((b) => (
        <p key={b.player} class="org-error">
          {nameOf(v, b.player)} went bankrupt.
        </p>
      ))}
    </>
  );
}

/** One house: who sold what for how much, and every chain's offer as Dinnertime ranked it. */
function DinnerDetail({ view: v, step: s }: { view: GameView; step: DinnerStep }) {
  const sale = s.sale;
  return (
    <div class="sx-detail" aria-live="polite">
      {sale ? (
        <p class="sx-line">
          <PlayerBadge view={v} id={sale.player} size={18} />
          <span>
            <b>{nameOf(v, sale.player)}</b> sells to house {houseLabel(v, s.houseId)}:{' '}
            {sale.lines.map((l) => (
              <span key={l.good} class="sale-good">
                <FoodIcon food={l.good} size={14} />
                {l.count}× ${l.each}
              </span>
            ))}
            {sale.bonuses.length > 0 && <span class="muted"> + bonuses ${sale.bonuses.reduce((n, b) => n + b.amount, 0)}</span>}
          </span>
          <b>${sale.total}</b>
        </p>
      ) : (
        <p class="sx-line">
          <span class="sx-dot" />
          <span>
            House {houseLabel(v, s.houseId)} stayed home:{' '}
            {s.offers.length ? 'no connected chain had the whole order.' : 'no restaurant is connected to it by road.'}
          </span>
        </p>
      )}
      {s.offers.length > 0 && (
        <ul class="sx-offers">
          {s.offers.map((o) => (
            <li key={o.player} class={`${o.won ? 'is-won' : ''} ${o.canSupply ? '' : 'is-out'}`} style={{ '--sx-c': colorOf(v, o.player) }}>
              <span class="sx-swatch" />
              <span>{nameOf(v, o.player)}</span>
              <span class="sx-math">
                ${o.unitPrice} + {o.distance} = <b>${o.score}</b>
              </span>
              {o.won ? <span class="sx-tag">wins</span> : !o.canSupply ? <span class="sx-tag">can’t supply</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payday
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------

function Marketing({ view: v, events }: { view: GameView; events: GameEvent[] }) {
  const c = catalog.value;
  const income = of(events, 'marketingIncome');
  const expired = of(events, 'campaignExpired');
  const placed = of(events, 'demandPlaced').filter((d) => !d.campaignId);
  const steps = campaignSteps(events);
  const idx = useSignal(-1);
  const pickStep = useStepSelection();
  const camp = (id: string) => campaignInfo(v, id);
  /** Houses in the campaign's reach that are full now and took nothing from this run. */
  const fullOf = (st: CampaignStep) => {
    const cm = camp(st.campaignId);
    if (!cm) return [];
    const got = new Set(st.drops.map((d) => d.houseId));
    const r = reachPreview(v, me.value, { kind: 'campaign', campaignKind: cm.kind, tileNumber: cm.number ?? 0, placement: cm.placement }, cm.goods[0] ?? null);
    return (r?.houses ?? []).filter((h) => h.full && !got.has(h.houseId)).map((h) => h.houseId);
  };
  const go = (i: number) => {
    const st = steps[i];
    if (!st) return;
    idx.value = i;
    const cm = camp(st.campaignId);
    boardFeedback.value = { kind: 'campaign', campaignId: st.campaignId, owner: cm?.owner ?? null, good: st.drops[0]?.goods[0] ?? cm?.goods[0] ?? null, houses: st.drops.map((d) => d.houseId), full: fullOf(st) };
    const live = !!v.board.campaigns[st.campaignId];
    pickStep(live ? { kind: 'campaign', id: st.campaignId } : null, [...(live ? [st.campaignId] : []), ...st.drops.map((d) => d.houseId)]);
  };
  const cur = idx.value >= 0 ? steps[idx.value] : undefined;
  const label = (st: CampaignStep) => {
    const cm = camp(st.campaignId);
    const name = cm?.number != null ? `Campaign #${cm.number}` : cm ? `${cm.kind} campaign` : 'Campaign';
    return st.expired ? `${name} (ended)` : name;
  };
  return (
    <>
      {steps.length === 0 && placed.length === 0 && <p class="muted">No demand placed.</p>}
      {steps.length > 0 && (
        <Stepper
          steps={steps}
          idx={idx.value}
          go={go}
          start={`Step through ${steps.length} campaign${steps.length === 1 ? '' : 's'} in run order`}
          label={label}
          chip={(st, on, i) => {
            const cm = camp(st.campaignId);
            return (
              <button
                key={st.campaignId}
                type="button"
                  class={`sx-chip ${on ? 'is-on' : ''} ${st.drops.length ? '' : 'is-home'}`}
                style={cm ? { '--sx-c': colorOf(v, cm.owner) } : undefined}
                onClick={() => go(i)}
              >
                {cm?.number != null ? `#${cm.number}` : i + 1}
              </button>
            );
          }}
        />
      )}
      {cur && (
        <div class="sx-detail" aria-live="polite">
          <p class="sx-line">
            {camp(cur.campaignId) ? <PlayerBadge view={v} id={camp(cur.campaignId)!.owner} size={18} /> : <span class="log-icon">{Icon.marketing({ size: 14 })}</span>}
            <span>
              {cur.drops.length ? (
                <>
                  {cur.drops[0]!.goods.slice(0, 1).map((g) => (
                    <FoodIcon key={g} food={g} size={14} />
                  ))}{' '}
                  {foodName(c, cur.drops[0]!.goods[0]!)} → house{cur.drops.length > 1 ? 's' : ''} {cur.drops.map((d) => `${houseLabel(v, d.houseId)}${d.goods.length > 1 ? ` (×${d.goods.length})` : ''}`).join(', ')}
                </>
              ) : (
                'reached no house with room'
              )}
              {(() => {
                const full = fullOf(cur);
                return full.length ? <span class="muted"> · full: {full.map((h) => houseLabel(v, h)).join(', ')}</span> : null;
              })()}
            </span>
            <span class="muted small">{cur.expired ? 'ended' : cur.remaining !== null ? `${cur.remaining} left` : ''}</span>
          </p>
        </div>
      )}
      {!cur && placed.length > 0 && (
        <ul class="summary-lines">
          {placed.map((d, i) => (
            <li key={i}>
              <span class="log-icon">{Icon.marketing({ size: 14 })}</span>
              <span>
                House {houseLabel(v, d.houseId)}:{' '}
                {d.tokens.map((t, j) => (
                  <FoodIcon key={j} food={t.good} size={14} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {income.length > 0 && <p class="small">Marketing income: {income.map((x) => `${nameOf(v, x.player)} $${x.amount}`).join(', ')}</p>}
      {expired.length > 0 && <p class="muted small">{expired.length} campaign{expired.length > 1 ? 's' : ''} ran out; their marketeers come back.</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Live caption (while the board animates a phase)
// ---------------------------------------------------------------------------

function captionText(v: GameView, c: PhaseCaption, food: (g: string) => string): string {
  switch (c.kind) {
    case 'sale': {
      const others = c.others.map((o) => `${nameOf(v, o.player)} $${o.score}${o.canSupply ? '' : ' (no stock)'}`).join(', ');
      return `${nameOf(v, c.player)} sells to house ${houseLabel(v, c.houseId)}: $${c.unitPrice} + ${c.distance} = $${c.unitPrice + c.distance}${others ? ` · beat ${others}` : ''}`;
    }
    case 'stayedHome':
      return `House ${houseLabel(v, c.houseId)} stays home: no seller`;
    case 'campaign': {
      const what = c.goods.map(food).join(' + ') || 'demand';
      const who = c.owner ? ` (${nameOf(v, c.owner)})` : '';
      const to = c.houses.length ? `houses ${c.houses.map((h) => houseLabel(v, h)).join(', ')}` : 'no house with room';
      const full = c.full.length ? ` · full: ${c.full.map((h) => houseLabel(v, h)).join(', ')}` : '';
      return `${c.number !== null ? `Campaign #${c.number}` : 'Campaign'}${who}: ${what} → ${to}${full}`;
    }
    case 'done':
      return c.phase === 'dinnertime'
        ? `Dinnertime: ${c.sales} house${c.sales === 1 ? '' : 's'} served${c.stayedHome ? `, ${c.stayedHome} stayed home` : ''}`
        : `Marketing: ${c.campaigns} campaign${c.campaigns === 1 ? '' : 's'} ran`;
  }
}

function CaptionPill({ view: v }: { view: GameView }) {
  const c = phaseCaption.value;
  const cat = catalog.value;
  if (!c) return null;
  const who = c.kind === 'sale' ? c.player : c.kind === 'campaign' ? c.owner : null;
  return (
    <div key={c.key} class={`phase-caption glass is-${c.kind}`} role="status" aria-live="polite" style={who ? { '--sx-c': colorOf(v, who) } : undefined}>
      {c.kind === 'campaign' || (c.kind === 'done' && c.phase === 'marketing') ? Icon.marketing({ size: 16 }) : Icon.dinner({ size: 16 })}
      <span>{captionText(v, c, (g) => foodName(cat, g as never).toLowerCase())}</span>
    </div>
  );
}
