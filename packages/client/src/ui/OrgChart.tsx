import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { GameView, PlayerState, Prompt, Uid } from '@fcm/engine';
import { isManager, managerSlots } from '../state/catalog.js';
import {
  draftFromStructure,
  emptyDraft,
  handUids,
  openSlots,
  placeCard,
  placementError,
  removeCard,
  toSubmission,
  validateDraft,
  type OrgDraft,
  type OrgRules,
  type SlotTarget,
} from '../state/orgChart.js';
import { busyUids, employeeIdOf, restructureCandidates } from '../state/selectors.js';
import { catalog, draft, me, view } from '../state/store.js';
import { act } from '../net/session.js';
import { Button, EmployeeCard, Empty, PlayerBadge, Pill, Segmented } from './common.js';
import { Icon } from './icons.js';
import { companyPlayer } from './uiState.js';

export function rulesFor(p: PlayerState, ceoSlots: number): OrgRules {
  const c = catalog.value;
  const def = (uid: Uid) => {
    const id = p.employees[uid]?.employeeId;
    return id ? c.employees[id] : undefined;
  };
  return { ceoSlots, isManager: (u) => isManager(def(u)), slotsOf: (u) => managerSlots(def(u)) };
}

/** Company tab: my editor during Restructuring, otherwise a read-only chart of any player. */
export function Company() {
  const v = view.value;
  if (!v) return null;
  const mine = me.value;
  const shown = companyPlayer.value ?? mine ?? v.turnOrder[0] ?? null;
  const p = shown ? v.players[shown] : undefined;
  return (
    <div class="company">
      <Segmented
        label="Whose company"
        value={shown ?? ''}
        onChange={(id) => (companyPlayer.value = id)}
        options={v.turnOrder.map((id) => ({
          value: id,
          label: (
            <span class="seg-player">
              <PlayerBadge view={v} id={id} size={20} />
              {id === mine ? 'You' : v.players[id]?.name}
            </span>
          ),
        }))}
      />
      {p && shown === mine && v.phase.kind === 'restructuring' ? <OrgChartEditor view={v} player={p} /> : p && <OrgChartView view={v} player={p} />}
    </div>
  );
}

export function OrgChartEditor({ view: v, player: p, prompt }: { view: GameView; player: PlayerState; prompt?: Prompt }) {
  const ceoSlots = prompt?.kind === 'restructure' ? prompt.ceoSlots : v.ceoSlots;
  const submitted = Boolean(v.submitted[p.id] || v.mine?.structureDraft);
  const rules = rulesFor(p, ceoSlots);
  const candidates = restructureCandidates(p);
  const keep = (u: Uid) => candidates.includes(u);

  useEffect(() => {
    if (draft.value) return;
    const src = v.mine?.structureDraft ?? (p.structure.ceoSubs.length ? p.structure : null);
    draft.value = src ? draftFromStructure(src, keep) : emptyDraft();
  }, [v.round, v.phase.kind]);

  const d: OrgDraft = submitted && v.mine?.structureDraft ? draftFromStructure(v.mine.structureDraft) : (draft.value ?? emptyDraft());
  const selected = useSignal<Uid | null>(null);
  const error = useSignal<string | null>(null);
  const check = validateDraft(d, rules);
  const hand = handUids(candidates, d);
  const locked = submitted;

  const set = (next: OrgDraft) => {
    draft.value = next;
    selected.value = null;
  };
  const dropTo = (uid: Uid, target: SlotTarget) => {
    if (locked) return;
    const why = placementError(d, uid, target, rules);
    if (why) {
      error.value = why;
      return;
    }
    error.value = null;
    set(placeCard(d, uid, target, rules));
  };
  const clickSlot = (target: SlotTarget) => {
    if (selected.value) dropTo(selected.value, target);
  };
  const clickCard = (uid: Uid) => {
    if (locked) return;
    error.value = null;
    selected.value = selected.value === uid ? null : uid;
  };
  const toHand = (uid: Uid) => !locked && set(removeCard(d, uid));
  const sel = selected.value;
  const canGo = (target: SlotTarget) => Boolean(sel) && !placementError(d, sel as Uid, target, rules);

  const dropProps = (target: SlotTarget) => ({
    onDragOver: (e: DragEvent) => {
      if (!locked) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const uid = e.dataTransfer?.getData('text/fcm-uid');
      if (uid) dropTo(uid, target);
    },
  });

  const card = (uid: Uid, where: 'slot' | 'hand') => {
    const id = employeeIdOf(p, uid);
    if (!id) return null;
    return (
      <EmployeeCard
        key={uid}
        id={id}
        flip={`card:${p.id}:${uid}`}
        compact
        tutorial={where === 'hand' ? `hand-card-${id}` : `org-card-${uid}`}
        selected={sel === uid}
        onClick={() => (where === 'slot' && sel === uid ? toHand(uid) : clickCard(uid))}
        draggableUid={locked ? undefined : uid}
        title={where === 'slot' ? 'Tap to select, tap again to return to hand' : 'Tap, then tap a slot (or drag)'}
      />
    );
  };

  const ceoTarget: SlotTarget = { kind: 'ceo' };
  const ceoEmpty = Math.max(0, check.ceo.capacity - check.ceo.used);
  const managers = d.ceoSubs.filter((u) => rules.isManager(u));

  return (
    <div class={`org ${locked ? 'is-locked' : ''}`}>
      <div class="org-status">
        <Pill tone={check.ceo.used > check.ceo.capacity ? 'danger' : 'neutral'} icon="crown">
          CEO {check.ceo.used}/{check.ceo.capacity}
        </Pill>
        {check.managers.map((m) => (
          <Pill key={m.uid} tone={m.used > m.capacity ? 'danger' : 'neutral'} icon="restructure">
            {catalog.value.employees[employeeIdOf(p, m.uid) ?? 'ceo']?.name.replace('Vice President', 'VP')} {m.used}/{m.capacity}
          </Pill>
        ))}
        <Pill tone="info">{openSlots(check)} open slots</Pill>
      </div>

      <div class="org-tree">
        <div class="org-ceo" data-tutorial="org-ceo">
          <EmployeeCard id="ceo" compact badge={Icon.crown({ size: 14 })} />
        </div>
        <ol class="org-row" aria-label="CEO slots">
          {d.ceoSubs.map((uid) => (
            <li key={uid} class="org-node">
              {card(uid, 'slot')}
              {rules.isManager(uid) && (
                <ol class="org-subs" aria-label="Manager slots">
                  {(d.managerSubs[uid] ?? []).map((s) => (
                    <li key={s}>{card(s, 'slot')}</li>
                  ))}
                  {Array.from({ length: Math.max(0, rules.slotsOf(uid) - (d.managerSubs[uid] ?? []).length) }, (_, i) => {
                    const t: SlotTarget = { kind: 'manager', managerUid: uid };
                    return (
                      <li key={`e${i}`}>
                        <button type="button" data-tutorial={`org-mslot-${uid}-${i + 1}`} class={`slot ${canGo(t) ? 'is-target' : ''}`} disabled={locked} onClick={() => clickSlot(t)} {...dropProps(t)} aria-label="Empty manager slot">
                          {Icon.plus({ size: 16 })}
                        </button>
                      </li>
                    );
                  })}
                  {sel && canGo({ kind: 'manager', managerUid: uid }) && (d.managerSubs[uid] ?? []).length >= rules.slotsOf(uid) && (
                    <li>
                      <button type="button" class="slot is-over" onClick={() => clickSlot({ kind: 'manager', managerUid: uid })} {...dropProps({ kind: 'manager', managerUid: uid })}>
                        Overfill
                      </button>
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
          {Array.from({ length: ceoEmpty }, (_, i) => (
            <li key={`c${i}`} class="org-node">
              <button type="button" data-tutorial={`org-slot-${d.ceoSubs.length + i + 1}`} class={`slot slot-ceo ${canGo(ceoTarget) ? 'is-target' : ''}`} disabled={locked} onClick={() => clickSlot(ceoTarget)} {...dropProps(ceoTarget)} aria-label="Empty CEO slot">
                {Icon.plus({ size: 18 })}
                <span>CEO slot</span>
              </button>
            </li>
          ))}
          {sel && ceoEmpty === 0 && (
            <li class="org-node">
              <button type="button" class="slot slot-ceo is-over" onClick={() => clickSlot(ceoTarget)} {...dropProps(ceoTarget)}>
                Overfill
              </button>
            </li>
          )}
        </ol>
      </div>

      {error.value && <p class="org-error" role="alert">{error.value}</p>}
      {check.errors.map((e) => (
        <p key={e} class="org-error" role="alert">
          {e}
        </p>
      ))}
      {check.overfilled && (
        <p class="org-warn" role="alert">
          {Icon.info({ size: 16 })} Overfilled: if you submit this, every card except your CEO goes to the beach this round.
        </p>
      )}

      {!locked && (
        <div class="org-hand" data-tutorial="org-hand" {...dropProps({ kind: 'ceo' })} onDrop={(e) => {
          e.preventDefault();
          const uid = e.dataTransfer?.getData('text/fcm-uid');
          if (uid) toHand(uid);
        }}>
          <h4>
            {Icon.hand({ size: 16 })} In hand <span class="muted">({hand.length}) · unplaced cards go to the beach</span>
          </h4>
          {hand.length ? <div class="card-grid">{hand.map((u) => card(u, 'hand'))}</div> : <Empty icon="check">Every card is placed.</Empty>}
          {managers.length === 0 && hand.some((u) => rules.isManager(u)) && <p class="hint">Managers go in CEO slots; then put other staff under them.</p>}
        </div>
      )}

      {busyUids(p).length > 0 && (
        <div class="org-busy">
          <h4>{Icon.marketing({ size: 16 })} On a campaign (busy)</h4>
          <div class="card-grid">{busyUids(p).map((u) => <EmployeeCard key={u} id={employeeIdOf(p, u) ?? 'ceo'} flip={`card:${p.id}:${u}`} compact dimmed />)}</div>
        </div>
      )}

      <div class="org-actions">
        {locked ? (
          <>
            <Pill tone="ok" icon="check">
              Submitted
            </Pill>
            <Button variant="ghost" icon="undo" onClick={() => act({ type: 'restructure.retract', playerId: p.id })}>
              Retract
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => set(emptyDraft())} disabled={check.placed === 0}>
              Clear
            </Button>
            <Button
              variant={check.overfilled ? 'danger' : 'primary'}
              icon="check"
              data-tutorial="submit-structure"
              disabled={check.errors.length > 0}
              onClick={() => act({ type: 'restructure.submit', playerId: p.id, structure: toSubmission(d) })}
            >
              {check.overfilled ? 'Submit anyway' : 'Submit structure'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Read-only company: structure tree, beach and busy marketeers. */
export function OrgChartView({ view: v, player: p }: { view: GameView; player: PlayerState }) {
  const s = p.structure;
  const hidden = v.phase.kind === 'restructuring';
  const beach = p.beach;
  const busy = busyUids(p);
  const uses = v.turn?.player === p.id ? v.turn.uses : null;
  const usesBadge = (uid: Uid) => (uses && uses[uid] !== undefined ? <span class={`uses ${uses[uid] ? '' : 'is-spent'}`}>{uses[uid]}</span> : undefined);
  return (
    <div class="org is-locked">
      {hidden && <p class="muted small">{Icon.eyeOff({ size: 14 })} Structures are secret until everyone has submitted.</p>}
      <div class="org-tree">
        <div class="org-ceo">
          <EmployeeCard id="ceo" compact badge={usesBadge(s.ceo) ?? Icon.crown({ size: 14 })} />
        </div>
        {s.ceoSubs.length > 0 ? (
          <ol class="org-row">
            {s.ceoSubs.map((uid) => (
              <li key={uid} class="org-node">
                <EmployeeCard id={employeeIdOf(p, uid) ?? 'ceo'} flip={`card:${p.id}:${uid}`} compact badge={usesBadge(uid)} />
                {(s.managerSubs[uid] ?? []).length > 0 && (
                  <ol class="org-subs">
                    {(s.managerSubs[uid] ?? []).map((sub) => (
                      <li key={sub}>
                        <EmployeeCard id={employeeIdOf(p, sub) ?? 'ceo'} flip={`card:${p.id}:${sub}`} compact badge={usesBadge(sub)} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon="restructure">Only the CEO is at work.</Empty>
        )}
      </div>
      <div class="org-hand">
        <h4>
          {Icon.beach({ size: 16 })} On the beach <span class="muted">({beach.length})</span>
        </h4>
        {beach.length ? <div class="card-grid">{beach.map((u) => <EmployeeCard key={u} id={employeeIdOf(p, u) ?? 'ceo'} flip={`card:${p.id}:${u}`} compact dimmed />)}</div> : <p class="muted small">Nobody is on the beach.</p>}
      </div>
      {busy.length > 0 && (
        <div class="org-busy">
          <h4>{Icon.marketing({ size: 16 })} On a campaign</h4>
          <div class="card-grid">{busy.map((u) => <EmployeeCard key={u} id={employeeIdOf(p, u) ?? 'ceo'} flip={`card:${p.id}:${u}`} compact dimmed />)}</div>
        </div>
      )}
    </div>
  );
}

