import { useSignal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import type { FoodId, LegalAction, Placement } from '@fcm/engine';
import { actionFromPlacement, describePlacement, needsGoods } from '../state/actions.js';
import { boardBridge, boardRenderer } from '../state/boardBridge.js';
import { foodName } from '../state/catalog.js';
import { realEngineReady } from '../state/engine.js';
import { placementsFor } from '../state/guidance.js';
import { catalog, manifest, me, myPlayer, settings, view } from '../state/store.js';
import { act } from '../net/session.js';
import { footprint } from './Board2D.js';
import { sheetOpen } from './uiState.js';
import { Button, Empty, Stepper } from './common.js';
import { FoodIcon, Icon } from './icons.js';

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

/** Placement kinds that have no board geometry (picked from a list). */
/** Placements the 3D board does not draw (buyer routes, off-board campaigns): picked from the list. */
const listOnly = (p: Placement) => p.kind === 'buyerRoute' || (p.kind === 'campaign' && p.placement.kind === 'offBoard');

/**
 * Board pick flow for one placement `LegalAction`: options (good, duration) → board pick through
 * the board bridge (with a list fallback) → action.
 */
export function PlacementFlow({ legal, onDone, onCancel }: { legal: PlacementLegal; onDone: () => void; onCancel: () => void }) {
  const v = view.value;
  const c = catalog.value;
  const card = legal.cardUid ? myPlayer.value?.employees[legal.cardUid] : undefined;
  const ability = card ? c.employees[card.employeeId]?.ability : undefined;
  const maxDuration = ability?.kind === 'marketing' ? ability.maxDuration : 1;
  const marketable = useMemo(
    () => (Object.values(c.foods).filter((f) => f && f.marketable && (f.module === 'base' || v?.config.modules.includes(f.module))) as { id: FoodId }[]).map((f) => f.id),
    [c, v?.config.modules.join()],
  );
  const wantsGoods = needsGoods(legal);
  const good = useSignal<FoodId | null>(null);
  const duration = useSignal(maxDuration);
  const ready = !wantsGoods || good.value !== null;

  const placements = useMemo(() => (v && ready ? placementsFor(v, me.value, legal.spec, manifest.value, c) : []), [v, ready, legal]);

  const pick = (p: Placement) => {
    const me_ = me.value;
    if (!me_) return;
    const a = actionFromPlacement(legal, p, me_, { ...(good.value ? { goods: [good.value] } : {}), duration: duration.value });
    if (!a) return;
    act(a);
    boardBridge.setInteractionMode({ kind: 'idle' });
    onDone();
  };

  useEffect(() => {
    if (!ready || placements.length === 0) return;
    const boardable = placements.filter((p) => !listOnly(p));
    if (boardable.length) {
      // Mobile: lower the bottom sheet so the board is free for picking.
      sheetOpen.value = false;
      boardBridge.setInteractionMode({
        kind: 'place',
        placementKind: legal.spec.kind,
        placements: boardable,
        label: legal.label,
        color: myPlayer.value?.color ?? '#d94f3d',
      });
    }
    const off = boardBridge.onPick((e) => {
      if (e.kind === 'placement') pick(e.placement);
      else if (e.kind === 'cancel') cancel();
    });
    return () => {
      off();
      boardBridge.setInteractionMode({ kind: 'idle' });
    };
  }, [ready, placements]);

  const cancel = () => {
    boardBridge.setInteractionMode({ kind: 'idle' });
    onCancel();
  };

  // The 3D board can show every placement with geometry; the 2D fallback only rectangular ones.
  const onBoard = placements.filter((p) => (boardRenderer.value === '3d' ? !listOnly(p) : footprint(p) !== null));
  const listItems = settings.value.placementList ? placements : placements.filter((p) => !onBoard.includes(p));

  return (
    <div class="flow">
      <div class="flow-head">
        <h4>{legal.label}</h4>
        <Button size="sm" variant="ghost" icon="x" onClick={cancel}>
          Cancel
        </Button>
      </div>
      {wantsGoods && (
        <div class="flow-options">
          <span class="field-label">Advertise</span>
          <div class="chip-row">
            {marketable.map((f) => (
              <button key={f} type="button" class={`chip chip-food ${good.value === f ? 'is-on' : ''}`} aria-pressed={good.value === f} onClick={() => (good.value = f)}>
                <FoodIcon food={f} size={18} /> {foodName(c, f)}
              </button>
            ))}
          </div>
          {legal.actionType === 'work.placeCampaign' && maxDuration > 1 && (
            <label class="field-inline">
              <span class="field-label">Duration</span>
              <Stepper label="turns" value={duration.value} min={1} max={maxDuration} onChange={(n) => (duration.value = n)} />
              <span class="muted small">max {maxDuration}</span>
            </label>
          )}
        </div>
      )}
      {ready &&
        (placements.length === 0 ? (
          <Empty icon="map">{realEngineReady() ? 'No legal spot for this right now.' : 'Board placements need the rules engine (still being built).'}</Empty>
        ) : (
          <>
            {onBoard.length > 0 && (
              <p class="flow-hint">
                {Icon.pin({ size: 16 })} Pick a highlighted spot on the board. {onBoard.length} option{onBoard.length === 1 ? '' : 's'}.
              </p>
            )}
            {listItems.length > 0 && (
              <ul class="placement-list">
                {listItems.slice(0, 60).map((p, i) => (
                  <li key={i}>
                    <button type="button" class="placement-btn" onClick={() => pick(p)}>
                      {p.kind === 'buyerRoute' && p.route.mode === 'errand' ? <FoodIcon food={p.route.drink} size={18} /> : Icon.pin({ size: 16 })}
                      {describePlacement(p, v)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}
    </div>
  );
}

