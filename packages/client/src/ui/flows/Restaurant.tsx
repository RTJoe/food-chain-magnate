/**
 * Restaurants: first / new restaurant (board pick, range overlay from the spec) and the regional
 * manager's move in two steps: pick the restaurant (board click or button), then its target; R /
 * Rotate cycles the entrance at a spot.
 */
import { useSignal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import type { Placement, RestaurantId } from '@fcm/engine';
import { boardModeFor } from '../../state/guidance.js';
import { type InteractionMode } from '../../state/boardBridge.js';
import { inspectIds, select } from '../../state/interaction.js';
import { catalog, myPlayer, view } from '../../state/store.js';
import { Button } from '../common.js';
import { Icon } from '../icons.js';
import { BoardHint, commitPlacement, FlowHead, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

export function RestaurantFlow(props: FlowProps) {
  return props.spec.kind === 'moveRestaurant' ? <MoveRestaurantFlow {...props} /> : <PlaceRestaurantFlow {...props} />;
}

function PlaceRestaurantFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const c = catalog.value;
  const card = legal.cardUid ? myPlayer.value?.employees[legal.cardUid] : undefined;
  const ability = card ? c.employees[card.employeeId]?.ability : undefined;
  const { onBoard, list } = splitPlacements(placements);
  const mode = useMemo(() => (onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor() }) : null), [placements]);
  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel });
  const note =
    ability?.kind === 'restaurant'
      ? ability.mode === 'local'
        ? 'Within road range of an open restaurant. It shows COMING SOON and opens in Clean up.'
        : 'Anywhere legal. It opens at once with a drive-in.'
      : null;
  return (
    <div class="flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      {note && <p class="muted small">{note}</p>}
      {placements.length === 0 ? (
        <NoSpots />
      ) : (
        <>
          <BoardHint count={onBoard.length}>Pick a highlighted spot; R or Rotate cycles the entrance corner.</BoardHint>
          <PlacementRows placements={list} onPick={pick} />
        </>
      )}
    </div>
  );
}

function MoveRestaurantFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const v = view.value;
  const movable = useMemo(() => [...new Set(placements.flatMap((p) => (p.kind === 'moveRestaurant' ? [p.restaurantId] : [])))], [placements]);
  const chosen = useSignal<RestaurantId | null>(legal.spec.restaurantId ?? (movable.length === 1 ? (movable[0] ?? null) : null));
  const targets = useMemo(() => placements.filter((p) => p.kind === 'moveRestaurant' && p.restaurantId === chosen.value), [placements, chosen.value]);
  const { onBoard, list } = splitPlacements(targets);
  const at = (id: RestaurantId) => {
    const r = v?.board.restaurants[id];
    return r ? `${r.x},${r.y}` : id;
  };
  const mode = useMemo<InteractionMode | null>(() => {
    if (chosen.value === null) return movable.length ? { kind: 'inspect', ids: movable } : null;
    return onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor(), label: `Move the restaurant at ${at(chosen.value)}` }) : null;
  }, [chosen.value, targets]);
  // Step 2: keep the origin ringed.
  useEffect(() => {
    if (!chosen.value) return;
    inspectIds.value = [chosen.value];
    return () => (inspectIds.value = []);
  }, [chosen.value]);

  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  const back = () => (movable.length > 1 && chosen.value ? (chosen.value = null) : onCancel());
  useBoardMode(mode, {
    onPlacement: pick,
    onCancel: back,
    onObject: (id) => {
      if (chosen.value === null && movable.includes(id)) {
        select(null);
        chosen.value = id;
      }
    },
  });

  return (
    <div class="flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      {placements.length === 0 ? (
        <NoSpots />
      ) : chosen.value === null ? (
        <>
          <p class="flow-hint">
            {Icon.store({ size: 16 })} 1 · Tap the restaurant to move (ringed on the board), or pick it here.
          </p>
          <ul class="placement-list">
            {movable.map((id) => (
              <li key={id}>
                <button type="button" class="placement-btn" onMouseEnter={() => (inspectIds.value = [id])} onMouseLeave={() => (inspectIds.value = [])} onClick={() => (chosen.value = id)}>
                  {Icon.store({ size: 16 })} Restaurant at {at(id)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div class="row gap">
            <span class="small">
              Moving the restaurant at <b>{at(chosen.value)}</b>
            </span>
            {movable.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => (chosen.value = null)}>
                Change
              </Button>
            )}
          </div>
          <BoardHint count={onBoard.length}>2 · Pick the new spot; R or Rotate cycles the entrance (also in place).</BoardHint>
          <PlacementRows placements={list} onPick={pick} />
        </>
      )}
    </div>
  );
}
