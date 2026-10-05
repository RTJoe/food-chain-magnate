/**
 * Default flow for placement kinds without a dedicated one (garden, coffee shop, pizza radio, free
 * mailbox, lobbyist pieces, freeway until WP5 registers its own): optional good → board pick →
 * action, with the list fallback.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { FoodId, Placement } from '@fcm/engine';
import { needsGoods } from '../../state/actions.js';
import { boardModeFor } from '../../state/guidance.js';
import { previewGood } from '../../state/interaction.js';
import { BoardHint, commitPlacement, FlowHead, GoodChips, marketableFoods, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode, useMirror } from './shared.js';
import type { FlowProps } from './types.js';

const HINTS: Partial<Record<Placement['kind'], string>> = {
  garden: 'A garden raises the house’s cap from 3 to 5 and doubles what it pays.',
  coffeeShop: 'One coffee shop per map tile, within range of your restaurants or coffee shops.',
  pizzaRadio: 'A pizza radio reaches every house on its 3×3 block of tiles.',
  freeMailbox: 'The mailbox reaches every house in its road-bounded block.',
};

export function GenericFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const wantsGoods = needsGoods(legal);
  const good = useSignal<FoodId | null>(null);
  useMirror(good.value, (g) => (previewGood.value = g), null);
  const ready = !wantsGoods || good.value !== null;
  const { onBoard, list } = splitPlacements(placements);
  const mode = useMemo(() => (ready && onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor() }) : null), [ready, placements]);

  const pick = (p: Placement) => {
    if (commitPlacement(legal, p, good.value ? { goods: [good.value] } : {})) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel });

  const hint = HINTS[legal.spec.kind];
  return (
    <div class="flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      {hint && <p class="muted small">{hint}</p>}
      {wantsGoods && (
        <div class="flow-options">
          <span class="field-label">Advertise</span>
          <GoodChips foods={marketableFoods()} value={good.value} onChange={(f) => (good.value = f)} />
        </div>
      )}
      {ready &&
        (placements.length === 0 ? (
          <NoSpots />
        ) : (
          <>
            <BoardHint count={onBoard.length} />
            <PlacementRows placements={list} onPick={pick} />
          </>
        ))}
    </div>
  );
}
