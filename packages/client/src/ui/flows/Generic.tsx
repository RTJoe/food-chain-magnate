/**
 * Default flow for placement kinds without a dedicated one (garden, coffee shop, pizza radio, free
 * mailbox, lobbyist pieces, freeway until WP5 registers its own): optional good → board pick →
 * action, with the list fallback.
 */
import { useSignal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import type { FoodId, GameView, Placement } from '@fcm/engine';
import { needsGoods } from '../../state/actions.js';
import { boardModeFor } from '../../state/guidance.js';
import { inspectIds, previewGood } from '../../state/interaction.js';
import { view } from '../../state/store.js';
import { BoardHint, commitPlacement, FlowHead, GoodChips, marketableFoods, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode, useMirror } from './shared.js';
import type { FlowProps } from './types.js';

const HINTS: Partial<Record<Placement['kind'], string>> = {
  garden: 'A garden raises the house’s cap from 3 to 5 and doubles what it pays.',
  coffeeShop: 'One coffee shop per map tile.',
  pizzaRadio: 'A pizza radio reaches every house on its 3×3 block of tiles.',
  freeMailbox: 'The mailbox reaches every house in its road-bounded block.',
};

/** Hint and ringed board ids built from the pending choice (which house bought pizza, which restaurant is new). */
export function choiceHint(v: GameView | null, kind: Placement['kind']): { text: string; ring: string[] } | null {
  const head = v?.pending[0];
  if (kind === 'pizzaRadio' && head?.kind === 'pizzaRadio') {
    const h = v?.board.houses[head.houseId];
    const name = h ? `House ${h.label ?? h.order}` : 'The house';
    return { text: `${name} bought your pizza: place a 2-turn pizza radio on its tile (ringed). It reaches every house on its 3×3 block of tiles.`, ring: [head.houseId] };
  }
  if (kind === 'freeMailbox' && head?.kind === 'freeMailbox') {
    return { text: 'A free permanent mailbox in your new restaurant’s block (ringed). It reaches every house in that road-bounded block.', ring: [head.restaurantId] };
  }
  return null;
}

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

  const special = choiceHint(view.value, legal.spec.kind);
  const ringKey = special?.ring.join(',') ?? '';
  useEffect(() => {
    if (!special?.ring.length) return;
    inspectIds.value = special.ring;
    return () => (inspectIds.value = []);
  }, [ringKey]);
  const hint = special?.text ?? HINTS[legal.spec.kind];
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
