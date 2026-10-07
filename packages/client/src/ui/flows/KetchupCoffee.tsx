/**
 * Coffee shop (ux-plan §2.4, WP5). With shops left in the supply: board pick straight away (the
 * board draws the range from your restaurants and coffee shops). With all three placed: first
 * choose the shop to move (tap it on the board, where they are ringed, or use its chip), then
 * its new square.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { Placement } from '@fcm/engine';
import type { InteractionMode } from '../../state/boardBridge.js';
import { boardModeFor } from '../../state/guidance.js';
import { view } from '../../state/store.js';
import { BoardHint, commitPlacement, listAllPlacements, FlowHead, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

type Shop = Extract<Placement, { kind: 'coffeeShop' }>;

export function KetchupCoffeeFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const v = view.value;
  const shopsP = placements.filter((p): p is Shop => p.kind === 'coffeeShop');
  const movable = useMemo(() => [...new Set(shopsP.flatMap((p) => (p.moveFrom ? [p.moveFrom] : [])))], [placements]);
  const moving = movable.length > 0;
  const from = useSignal<string | null>(movable.length === 1 ? (movable[0] ?? null) : null);
  const target = useMemo(() => (moving ? (from.value ? shopsP.filter((p) => p.moveFrom === from.value) : []) : shopsP), [placements, from.value]);
  const { onBoard, list } = splitPlacements(target);
  const mode = useMemo<InteractionMode | null>(() => {
    if (moving && !from.value) return { kind: 'inspect', ids: movable };
    return onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor(), label: moving ? 'New square for the coffee shop' : legal.label }) : null;
  }, [target, from.value]);
  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  const choose = (id: string) => {
    from.value = id;
  };
  useBoardMode(mode, {
    onPlacement: pick,
    onCancel: () => (moving && movable.length > 1 && from.value ? (from.value = null) : onCancel()),
    onObject: (id) => {
      if (moving && !from.value && movable.includes(id)) choose(id);
    },
  });
  const where = (id: string) => {
    const e = v?.board.entities[id];
    return e && 'x' in e ? `${e.x},${e.y}` : id;
  };

  return (
    <div class="flow kf-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      <p class="muted small">One coffee shop per map tile, within range of your restaurants or coffee shops. Routes past it sell coffee.</p>
      {shopsP.length === 0 ? (
        <NoSpots />
      ) : (
        <>
          {moving && (
            <div class="kf-step">
              <span class="field-label">1 · All three are out: which one moves?</span>
              <div class="kf-pieces" role="radiogroup" aria-label="Coffee shop to move">
                {movable.map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={from.value === id} class={`kf-piece ${from.value === id ? 'is-on' : ''}`} onClick={() => choose(id)}>
                    <span class="kf-piece-label">Shop at {where(id)}</span>
                  </button>
                ))}
              </div>
              {!from.value && <p class="flow-hint">Tap the coffee shop to move on the board (ringed).</p>}
            </div>
          )}
          {(!moving || from.value) && <BoardHint count={onBoard.length}>{moving ? '2 · Pick its new square.' : undefined}</BoardHint>}
          <PlacementRows placements={moving && !from.value ? (listAllPlacements() ? shopsP : []) : list} onPick={pick} />
        </>
      )}
    </div>
  );
}
