import { useSignal } from '@preact/signals';
import type { EmployeeId, FoodId, GameView, LegalAction, PlayerState, Uid } from '@fcm/engine';
import { employeeName, foodName } from '../state/catalog.js';
import { cardStage, cardsAtWork, employeeIdOf, hireOptions, STAGE_LABELS, trainableUids, trainOptions, workStages } from '../state/selectors.js';
import { catalog, legal, me, pending } from '../state/store.js';
import { act, undo } from '../net/session.js';
import { Button, EmployeeCard, Empty } from './common.js';
import { FoodIcon, Icon } from './icons.js';
import { PlacementFlow } from './Placement.js';
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
  const cards = cardsAtWork(p);
  const byCard = (uid: Uid) => all.filter((l) => cardOf(l) === uid && !(l.kind === 'ready' && l.action.type === 'work.skip'));
  const endTurn = all.find((l) => l.kind === 'ready' && l.action.type === 'work.endTurn');
  const general = all.filter((l) => cardOf(l) === undefined && l !== endTurn);
  const busy = Object.keys(pending.value).length > 0;
  const unused = cards.filter((u) => byCard(u).length > 0).length;

  if (sel.action) return <ActionFlow view={v} player={p} legal={sel.action} />;

  return (
    <div class="work">
      <ol class="stages" aria-label="Working sub-steps">
        {stages.map((s, i) => (
          <li key={s} class={i < now ? 'is-done' : i === now ? 'is-now' : ''}>
            {STAGE_LABELS[s]}
          </li>
        ))}
      </ol>
      <p class="muted small">Pick an employee to see what they can do. Sub-steps only move forward: acting in a later one closes the earlier ones.</p>
      <div class="work-cards">
        {cards.map((uid) => {
          const id = employeeIdOf(p, uid);
          if (!id) return null;
          const acts = byCard(uid);
          const uses = turn?.uses[uid];
          const stage = cardStage(c.employees[id]);
          const closed = stage !== null && stages.indexOf(stage) < now && (uses ?? 0) > 0;
          const status = acts.length ? 'ready' : closed ? 'closed' : uses === 0 ? 'spent' : stage === null ? 'auto' : 'idle';
          return (
            <EmployeeCard
              key={uid}
              id={id}
              compact
              selected={sel.cardUid === uid}
              dimmed={!acts.length}
              highlight={acts.length > 0}
              onClick={acts.length ? () => (workSelection.value = { cardUid: sel.cardUid === uid ? null : uid, action: null }) : undefined}
              badge={uses !== undefined && uses > 0 ? <span class="uses">{uses}</span> : undefined}
              footer={<span class={`emp-status st-${status}`}>{statusLabel(status)}</span>}
            />
          );
        })}
      </div>

      {sel.cardUid && (
        <div class="card-actions glass-inner">
          <h4>{employeeName(c, employeeIdOf(p, sel.cardUid) ?? 'ceo')}</h4>
          <div class="action-list">
            {byCard(sel.cardUid).map((l, i) => (
              <LegalButton key={i} legal={l} busy={busy} />
            ))}
            {all
              .filter((l) => l.kind === 'ready' && l.action.type === 'work.skip' && cardOf(l) === sel.cardUid)
              .map((l, i) => (
                <LegalButton key={`s${i}`} legal={l} busy={busy} variant="ghost" />
              ))}
          </div>
        </div>
      )}

      {general.length > 0 && (
        <div class="action-list">
          {general.map((l, i) => (
            <LegalButton key={i} legal={l} busy={busy} />
          ))}
        </div>
      )}

      <div class="work-foot">
        <Button variant="ghost" icon="undo" onClick={() => undo()} disabled={busy}>
          Undo
        </Button>
        {endTurn && endTurn.kind === 'ready' && (
          <Button
            variant="primary"
            icon="check"
            disabled={busy}
            onClick={() => {
              if (unused > 0 && !confirm(`${unused} employee${unused > 1 ? 's' : ''} can still act. End your turn?`)) return;
              resetWorkSelection();
              act(endTurn.action);
            }}
          >
            End turn
          </Button>
        )}
      </div>
    </div>
  );
}

const statusLabel = (s: string) => ({ ready: 'Can act', closed: 'Step passed', spent: 'Done', auto: 'Automatic', idle: 'No action' })[s] ?? s;

export function LegalButton({ legal: l, busy, variant }: { legal: LegalAction; busy?: boolean; variant?: 'primary' | 'secondary' | 'ghost' }) {
  if (l.kind === 'ready') {
    return (
      <Button variant={variant ?? 'secondary'} disabled={busy} onClick={() => act(l.action)}>
        {l.label}
      </Button>
    );
  }
  return (
    <Button variant={variant ?? 'secondary'} icon={l.kind === 'placement' ? 'pin' : 'arrowRight'} disabled={busy} onClick={() => (workSelection.value = { cardUid: cardOf(l) ?? null, action: l })}>
      {l.label}
    </Button>
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
                <EmployeeCard key={u} id={employeeIdOf(p, u) ?? 'ceo'} compact highlight onClick={() => (target.value = u)} />
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
