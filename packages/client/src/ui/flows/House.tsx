/**
 * New house (new business developer): pick the house number first (it sets the dinnertime order),
 * then the spot on the board; R / Rotate cycles the garden side at a spot.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { Placement } from '@fcm/engine';
import { boardModeFor, placementsFor } from '../../state/guidance.js';
import { catalog, manifest, me, view } from '../../state/store.js';
import { Icon } from '../icons.js';
import { BoardHint, commitPlacement, FlowHead, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

export function HouseFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const v = view.value;
  const numbers = v?.houseTiles ?? [];
  const order = useSignal<number | null>(legal.spec.houseOrder ?? (numbers.length === 1 ? (numbers[0] ?? null) : null));
  const engineDefault = legal.spec.houseOrder ?? numbers[0];
  const forOrder = useMemo(() => {
    if (order.value === null || !v) return [];
    if (order.value === engineDefault) return placements;
    return placementsFor(v, me.value, { ...legal.spec, houseOrder: order.value }, manifest.value, catalog.value);
  }, [order.value, placements]);
  const { onBoard, list } = splitPlacements(forOrder);
  const mode = useMemo(() => (onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor(), label: `House #${order.value}` }) : null), [forOrder]);
  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel: () => (numbers.length > 1 && order.value !== null ? (order.value = null) : onCancel()) });

  return (
    <div class="flow house-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      <div class="flow-step">
        <span class="field-label">1 · House number</span>
        <p class="muted small">Lower numbers are served first at dinnertime. A new house comes with a garden: cap 5, pays double.</p>
        <div class="chip-row" role="radiogroup" aria-label="House number">
          {numbers.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={order.value === n} class={`chip chip-lg house-chip ${order.value === n ? 'is-on' : ''}`} onClick={() => (order.value = order.value === n ? null : n)}>
              {Icon.home({ size: 18 })} #{n}
            </button>
          ))}
        </div>
      </div>
      {order.value !== null &&
        (forOrder.length === 0 ? (
          <NoSpots />
        ) : (
          <>
            <BoardHint count={onBoard.length}>2 · Pick a spot on the board; R or Rotate turns the garden.</BoardHint>
            <PlacementRows placements={list} onPick={pick} />
          </>
        ))}
    </div>
  );
}
