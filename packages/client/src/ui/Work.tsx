import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Action, EmployeeId, FoodId, GameView, LegalAction, PlayerState, Uid } from '@fcm/engine';
import { employeeName, foodName } from '../state/catalog.js';
import { cardStage, cardsAtWork, employeeIdOf, employeeSort, hireOptions, STAGE_LABELS, trainableUids, trainOptions, workStages, type TrainOption } from '../state/selectors.js';
import { catalog, legal, me, mode, pending } from '../state/store.js';
import { act, undo } from '../net/session.js';
import { Button, EmployeeCard, Empty } from './common.js';
import { FoodIcon, Icon } from './icons.js';
import { PlacementFlow } from './flows/index.js';
import { resetWorkSelection, workSelection } from './uiState.js';

/** The card a legal action belongs to (explicit `cardUid`, or inside a ready action). */
export function cardOf(l: LegalAction): Uid | undefined {
  if (l.kind !== 'ready' && l.cardUid) return l.cardUid;
  if (l.kind === 'ready') {
    const a = l.action as { cardUid?: Uid; trainerUid?: Uid };
    return a.cardUid ?? a.trainerUid;
  }
  if (l.kind === 'placement') return l.spec.cardUid;
  return undefined;
}

export function WorkPanel({ view: v, player: p }: { view: GameView; player: PlayerState }) {
  const c = catalog.value;
  const all = legal.value;
  const turn = v.turn;
  const stages = workStages(v);
  const now = turn ? stages.indexOf(turn.stage) : 0;
  const sel = workSelection.value;
  const confirmEnd = useSignal(false);
  const cards = cardsAtWork(p);
  const byCard = (uid: Uid) => all.filter((l) => cardOf(l) === uid && !(l.kind === 'ready' && l.action.type === 'work.skip'));
  const skipOf = (uid: Uid) => all.find((l) => l.kind === 'ready' && l.action.type === 'work.skip' && cardOf(l) === uid);
  const endTurn = all.find((l) => l.kind === 'ready' && l.action.type === 'work.endTurn');
  const general = all.filter((l) => cardOf(l) === undefined && l !== endTurn);
  const busy = Object.keys(pending.value).length > 0;
  const canAct = cards.filter((u) => byCard(u).length > 0);
  const selId = sel.cardUid ? employeeIdOf(p, sel.cardUid) : undefined;
  const selStage = selId ? cardStage(c.employees[selId]) : null;
  const selIdx = selStage ? stages.indexOf(selStage) : -1;

  if (sel.action) return <ActionFlow view={v} player={p} legal={sel.action} />;

  return (
    <div class="work">
      <ol class="stages" aria-label="Working sub-steps" data-tutorial="work-stages">
        {stages.map((s, i) => {
          const closing = selIdx > now && i >= now && i < selIdx;
          return (
            <li key={s} class={`${i < now ? 'is-done' : i === now ? 'is-now' : ''} ${i === selIdx ? 'is-sel' : ''} ${closing ? 'is-closing' : ''}`} title={closing ? `Acting in ${STAGE_LABELS[selStage!]} closes this step` : undefined}>
              {STAGE_LABELS[s]}
            </li>
          );
        })}
      </ol>
      <p class="muted small">
        {selIdx > now ? `Acting here closes ${stages.slice(now, selIdx).map((s) => STAGE_LABELS[s]).join(' and ')}.` : 'Pick an employee to see what they can do. Sub-steps only move forward: acting in a later one closes the earlier ones.'}
      </p>
      <div class="work-cards">
        {cards.map((uid) => {
          const id = employeeIdOf(p, uid);
          if (!id) return null;
          const acts = byCard(uid);
          const uses = turn?.uses[uid];
          const stage = cardStage(c.employees[id]);
          const closed = stage !== null && stages.indexOf(stage) < now && (uses ?? 0) > 0;
          const status = acts.length ? 'ready' : closed ? 'closed' : uses === 0 ? 'spent' : stage === null ? 'auto' : 'idle';
          const reason = status === 'idle' || status === 'closed' ? skipOf(uid)?.disabledReason : undefined;
          return (
            <EmployeeCard
              key={uid}
              id={id}
              flip={`card:${p.id}:${uid}`}
              tutorial={`work-card-${uid}`}
              compact
              selected={sel.cardUid === uid}
              dimmed={!acts.length}
              highlight={acts.length > 0}
              onClick={acts.length ? () => (workSelection.value = { cardUid: sel.cardUid === uid ? null : uid, action: null }) : undefined}
              badge={uses !== undefined && uses > 0 ? <span class="uses">{uses}</span> : undefined}
              title={reason}
              footer={
                <span class={`emp-status st-${status}`}>
                  {statusLabel(status)}
                  {reason && <span class="emp-reason">{reason}</span>}
                </span>
              }
            />
          );
        })}
      </div>

      {sel.cardUid && <CardActions view={v} player={p} uid={sel.cardUid} acts={byCard(sel.cardUid)} busy={busy} />}

      {general.length > 0 && (
        <div class="action-list">
          {general.map((l, i) => (
            <LegalButton key={i} legal={l} busy={busy} />
          ))}
        </div>
      )}

      <div class="work-foot">
        {confirmEnd.value && canAct.length > 0 ? (
          <div class="end-confirm">
            <span class="small">
              Still able to act: <b>{canAct.map((u) => employeeName(c, employeeIdOf(p, u) ?? 'ceo')).join(', ')}</b>
            </span>
            <div class="row gap end">
              <Button variant="ghost" onClick={() => (confirmEnd.value = false)}>
                Keep working
              </Button>
              {endTurn && endTurn.kind === 'ready' && (
                <Button
                  variant="primary"
                  icon="check"
                  data-tutorial="end-turn"
                  disabled={busy}
                  onClick={() => {
                    confirmEnd.value = false;
                    resetWorkSelection();
                    act(endTurn.action);
                  }}
                >
                  End turn
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {mode.value !== 'tutorial' && (
              <Button variant="ghost" icon="undo" data-tutorial="undo" onClick={() => undo()} disabled={busy}>
                Undo
              </Button>
            )}
            {endTurn && endTurn.kind === 'ready' && (
              <Button
                variant="primary"
                icon="check"
                data-tutorial="end-turn"
                disabled={busy}
                onClick={() => {
                  if (canAct.length > 0) {
                    confirmEnd.value = true;
                    return;
                  }
                  resetWorkSelection();
                  act(endTurn.action);
                }}
              >
                End turn
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const statusLabel = (s: string) => ({ ready: 'Can act', closed: 'Step passed', spent: 'Done', auto: 'Automatic', idle: 'No action' })[s] ?? s;

/** A ready action's label without the "Card name: " prefix (the card is the panel's heading). */
const shortLabel = (label: string) => {
  const s = label.replace(/^[^:]{1,40}:\s*/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Food / drink a ready action makes or fetches (for its icon). */
function actionFood(a: Action): FoodId | null {
  if (a.type === 'work.produce' && 'food' in a && a.food) return a.food;
  if (a.type === 'work.buyDrinks' && a.route.mode === 'errand') return a.route.drink as FoodId;
  return null;
}

export function LegalButton({ legal: l, busy, variant, tutorial }: { legal: LegalAction; busy?: boolean; variant?: 'primary' | 'secondary' | 'ghost'; tutorial?: string }) {
  if (l.kind === 'ready') {
    const food = actionFood(l.action);
    return (
      <Button variant={variant ?? 'secondary'} disabled={busy} onClick={() => act(l.action)}>
        {food && <FoodIcon food={food} size={20} />}
        {cardOf(l) ? shortLabel(l.label) : l.label}
      </Button>
    );
  }
  return (
    <Button variant={variant ?? 'secondary'} icon={l.kind === 'placement' ? 'pin' : 'arrowRight'} data-tutorial={tutorial} disabled={busy} onClick={() => (workSelection.value = { cardUid: cardOf(l) ?? null, action: l })}>
      {cardOf(l) ? shortLabel(l.label) : l.label}
    </Button>
  );
}

type ReadyLegal = Extract<LegalAction, { kind: 'ready' }>;
type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;
const isReady = (type: string) => (l: LegalAction): l is ReadyLegal => l.kind === 'ready' && l.action.type === type;

/** What the selected card can do: hire / train grids inline, one campaign entry, other actions as buttons. */
function CardActions({ view: v, player: p, uid, acts, busy }: { view: GameView; player: PlayerState; uid: Uid; acts: LegalAction[]; busy: boolean }) {
  const c = catalog.value;
  const recruits = acts.filter(isReady('work.recruit'));
  const trains = acts.filter(isReady('work.train'));
  const campaigns = acts.filter((l): l is PlacementLegal => l.kind === 'placement' && l.actionType === 'work.placeCampaign');
  const rest = acts.filter((l) => !recruits.includes(l as ReadyLegal) && !trains.includes(l as ReadyLegal) && !campaigns.includes(l as PlacementLegal));
  const campaign: PlacementLegal | null =
    campaigns.length > 1 && campaigns[0] ? { ...campaigns[0], label: 'Launch a campaign', spec: { kind: 'campaign', cardUid: uid } } : (campaigns[0] ?? null);
  // The card grid can be long: bring the actions into view when a card is picked.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [uid]);
  return (
    <div class="card-actions glass-inner" ref={box}>
      <h4>{employeeName(c, employeeIdOf(p, uid) ?? 'ceo')}</h4>
      <div class="action-list">
        {recruits.length > 0 && <HireGrid view={v} actions={recruits} busy={busy} />}
        {trains.length > 0 && <TrainGrid view={v} player={p} trainerUid={uid} actions={trains} busy={busy} />}
        {campaign && <LegalButton legal={campaign} busy={busy} tutorial="launch-campaign" />}
        {rest.map((l, i) => (
          <LegalButton key={i} legal={l} busy={busy} />
        ))}
      </div>
    </div>
  );
}

/** Hire grid from the engine's ready hire actions; cards that cannot be hired are shown dimmed with the reason. */
function HireGrid({ view: v, actions, busy }: { view: GameView; actions: ReadyLegal[]; busy: boolean }) {
  const c = catalog.value;
  const mine = me.value;
  const byId = new Map<EmployeeId, ReadyLegal>();
  for (const l of actions) if (l.action.type === 'work.recruit') byId.set(l.action.employeeId, l);
  const opts = mine ? hireOptions(v, c, mine) : [];
  const ids = [...new Set([...byId.keys(), ...opts.map((o) => o.id)])].sort((a, b) => Number(byId.has(b)) - Number(byId.has(a)) || employeeSort(c, a, b));
  return (
    <div class="inline-picker">
      <p class="muted small">New hires go to the beach: they work from next round, and can be trained this turn.</p>
      <div class="card-grid">
        {ids.map((id) => {
          const l = byId.get(id);
          const o = opts.find((x) => x.id === id);
          const supply = v.supply[id] ?? o?.supply ?? 0;
          const salary = c.employees[id]?.salary;
          return (
            <EmployeeCard
              key={id}
              id={id}
              flip={`market:${id}`}
              tutorial={`hire-${id}`}
              compact
              dimmed={!l}
              highlight={Boolean(l)}
              disabled={busy}
              onClick={l ? () => (act(l.action), resetWorkSelection()) : undefined}
              title={l ? c.employees[id]?.text : (o?.reason ?? 'Cannot hire now')}
              badge={<span class="supply">×{supply}</span>}
              footer={
                !l ? (
                  <span class="emp-status st-idle">{o?.reason ?? 'Cannot hire now'}</span>
                ) : salary ? (
                  <span class="emp-status">$5 salary</span>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** Train: pick a beach card, then a destination (engine ready actions; blocked ones dimmed with the reason). */
function TrainGrid({ view: v, player: p, trainerUid, actions, busy }: { view: GameView; player: PlayerState; trainerUid: Uid; actions: ReadyLegal[]; busy: boolean }) {
  const c = catalog.value;
  const mine = me.value;
  const target = useSignal<Uid | null>(null);
  const byTarget = new Map<Uid, ReadyLegal[]>();
  for (const l of actions) {
    if (l.action.type !== 'work.train') continue;
    const list = byTarget.get(l.action.targetUid) ?? [];
    list.push(l);
    byTarget.set(l.action.targetUid, list);
  }
  const targets = [...byTarget.keys()];
  const t = target.value && byTarget.has(target.value) ? target.value : targets.length === 1 ? (targets[0] ?? null) : null;
  if (!mine) return null;
  if (!t) {
    return (
      <div class="inline-picker">
        <p class="muted small">Train whom? Only cards on the beach can be trained (including this turn’s hires).</p>
        <div class="card-grid">
          {targets.map((u) => (
            <EmployeeCard key={u} id={employeeIdOf(p, u) ?? 'ceo'} flip={`card:${p.id}:${u}`} tutorial={`train-target-${u}`} compact highlight onClick={() => (target.value = u)} />
          ))}
        </div>
      </div>
    );
  }
  const trainerId = employeeIdOf(p, trainerUid);
  const ability = trainerId ? c.employees[trainerId]?.ability : undefined;
  const maxSteps = Math.min(ability?.kind === 'train' ? ability.maxStepsSameCard : 1, v.turn?.uses[trainerUid] ?? 1);
  const legalTo = new Map<EmployeeId, ReadyLegal>();
  for (const l of byTarget.get(t) ?? []) if (l.action.type === 'work.train') legalTo.set(l.action.toEmployeeId, l);
  const options = trainOptions(v, c, mine, t, maxSteps);
  const fromId = employeeIdOf(p, t) ?? 'ceo';
  // Engine destinations the client's career table does not list still get a row.
  const extra = [...legalTo.keys()].filter((id) => !options.some((o) => o.id === id)).map((id) => ({ id, steps: 1, path: [id], ok: true }) as TrainOption);
  return (
    <div class="inline-picker">
      <div class="row gap">
        <span class="small">
          Train <b>{employeeName(c, fromId)}</b> into…
        </span>
        {targets.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => (target.value = null)}>
            Someone else
          </Button>
        )}
      </div>
      <div class="train-options">
        {[...options, ...extra].map((o) => {
          const l = legalTo.get(o.id);
          const reason = l ? undefined : (o.reason ?? (o.steps > maxSteps ? 'Too many steps' : 'Not allowed now'));
          const coffee = c.employees[o.id]?.category === 'coffee';
          return (
            <button
              key={o.id}
              type="button"
              class="train-opt"
              data-tutorial={`train-${o.id}`}
              disabled={!l || busy}
              title={reason}
              onClick={() => {
                if (!l) return;
                act(l.action);
                resetWorkSelection();
              }}
            >
              <span class="train-path">
                {o.path.map((id, i) => (
                  <span key={id}>
                    {i > 0 && Icon.chevronRight({ size: 12 })}
                    {employeeName(c, id)}
                  </span>
                ))}
              </span>
              <span class="muted small">
                {o.steps} step{o.steps > 1 ? 's' : ''} · {v.supply[o.id] ?? 0} left
                {reason ? ` · ${reason}` : ''}
                {coffee && l ? ' · places a coffee shop' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Sub-flow for compose/placement actions. */
function ActionFlow({ view: v, player: p, legal: l }: { view: GameView; player: PlayerState; legal: LegalAction }) {
  const back = () => (workSelection.value = { cardUid: workSelection.value.cardUid, action: null });
  if (l.kind === 'placement') return <PlacementFlow legal={l} onDone={resetWorkSelection} onCancel={back} />;
  if (l.kind === 'compose' && l.cardUid) {
    if (l.actionType === 'work.recruit') return <HirePicker view={v} cardUid={l.cardUid} onBack={back} />;
    if (l.actionType === 'work.train') return <TrainPicker view={v} player={p} trainerUid={l.cardUid} onBack={back} />;
    if (l.actionType === 'work.produce') return <ProducePicker player={p} cardUid={l.cardUid} onBack={back} />;
  }
  return (
    <div class="flow">
      <div class="flow-head">
        <h4>{l.label}</h4>
        <Button size="sm" variant="ghost" icon="x" onClick={back}>
          Back
        </Button>
      </div>
      <Empty>This action is not supported by the client yet.</Empty>
    </div>
  );
}

function FlowHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div class="flow-head">
      <h4>{title}</h4>
      <Button size="sm" variant="ghost" icon="x" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

function HirePicker({ view: v, cardUid, onBack }: { view: GameView; cardUid: Uid; onBack: () => void }) {
  const mine = me.value;
  if (!mine) return null;
  const opts = hireOptions(v, catalog.value, mine);
  return (
    <div class="flow">
      <FlowHead title="Hire an entry-level employee" onBack={onBack} />
      <p class="muted small">New hires go to the beach: they work from next round, and can be trained this turn.</p>
      <div class="card-grid">
        {opts.map((o) => (
          <EmployeeCard
            key={o.id}
            id={o.id}
            flip={`market:${o.id}`}
            tutorial={`hire-${o.id}`}
            compact
            dimmed={!o.ok}
            highlight={o.ok}
            onClick={o.ok ? () => (act({ type: 'work.recruit', playerId: mine, cardUid, employeeId: o.id }), resetWorkSelection()) : undefined}
            title={o.reason ?? catalog.value.employees[o.id]?.text}
            badge={<span class="supply">×{o.supply}</span>}
          />
        ))}
      </div>
    </div>
  );
}

function TrainPicker({ view: v, player: p, trainerUid, onBack }: { view: GameView; player: PlayerState; trainerUid: Uid; onBack: () => void }) {
  const mine = me.value;
  const c = catalog.value;
  const target = useSignal<Uid | null>(null);
  if (!mine) return null;
  const trainerId = employeeIdOf(p, trainerUid);
  const ability = trainerId ? c.employees[trainerId]?.ability : undefined;
  const maxSteps = Math.min(ability?.kind === 'train' ? ability.maxStepsSameCard : 1, v.turn?.uses[trainerUid] ?? 1);
  const targets = trainableUids(v, c, mine);
  return (
    <div class="flow">
      <FlowHead title={target.value ? 'Train into…' : 'Train whom?'} onBack={target.value ? () => (target.value = null) : onBack} />
      {!target.value ? (
        targets.length ? (
          <>
            <p class="muted small">Only cards on the beach can be trained (including this turn’s hires).</p>
            <div class="card-grid">
              {targets.map((u) => (
                <EmployeeCard key={u} id={employeeIdOf(p, u) ?? 'ceo'} flip={`card:${p.id}:${u}`} tutorial={`train-target-${u}`} compact highlight onClick={() => (target.value = u)} />
              ))}
            </div>
          </>
        ) : (
          <Empty icon="beach">Nobody on the beach can be trained.</Empty>
        )
      ) : (
        <div class="train-options">
          {trainOptions(v, c, mine, target.value, maxSteps).map((o) => (
            <button
              key={o.id}
              type="button"
              class="train-opt"
              data-tutorial={`train-${o.id}`}
              disabled={!o.ok}
              title={o.reason}
              onClick={() => {
                act({ type: 'work.train', playerId: mine, trainerUid, targetUid: target.value as Uid, toEmployeeId: o.id, ...(o.steps > 1 ? { path: o.path } : {}) });
                resetWorkSelection();
              }}
            >
              <span class="train-path">
                {o.path.map((id, i) => (
                  <span key={id}>
                    {i > 0 && Icon.chevronRight({ size: 12 })}
                    {employeeName(c, id)}
                  </span>
                ))}
              </span>
              <span class="muted small">
                {o.steps} step{o.steps > 1 ? 's' : ''}
                {o.reason ? ` · ${o.reason}` : ''} · {v.supply[o.id] ?? 0} left
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProducePicker({ player: p, cardUid, onBack }: { player: PlayerState; cardUid: Uid; onBack: () => void }) {
  const c = catalog.value;
  const mine = me.value;
  const id = employeeIdOf(p, cardUid) as EmployeeId | undefined;
  const ability = id ? c.employees[id]?.ability : undefined;
  const foods: FoodId[] = ability?.kind === 'produce' ? ability.foods : [];
  if (!mine) return null;
  return (
    <div class="flow">
      <FlowHead title="What to cook?" onBack={onBack} />
      <div class="chip-row">
        {foods.map((f) => (
          <button
            key={f}
            type="button"
            class="chip chip-food chip-lg"
            data-tutorial={`produce-${f}`}
            onClick={() => {
              act({ type: 'work.produce', playerId: mine, cardUid, food: f });
              resetWorkSelection();
            }}
          >
            <FoodIcon food={f} size={26} />
            {ability?.kind === 'produce' ? ability.amount : 1} {foodName(c, f)}
          </button>
        ))}
      </div>
    </div>
  );
}
