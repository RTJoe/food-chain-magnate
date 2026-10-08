/**
 * Freeway (ux-plan §2.4, WP5): board pick on an outer edge; the ghost shows the ramp and a dotted
 * link to the rural area with its demand, so the connection is visible before committing. From
 * rules v4 the 3x1 piece also lies lengthwise along the edge: R / Rotate turns it (Q-K21).
 */
import { useMemo } from 'preact/hooks';
import type { Placement } from '@fcm/engine';
import { boardModeFor } from '../../state/guidance.js';
import { view } from '../../state/store.js';
import { BoardHint, commitPlacement, FlowHead, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

export function KetchupFreewayFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const v = view.value;
  const { onBoard, list } = splitPlacements(placements);
  const mode = useMemo(() => (onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor() }) : null), [placements]);
  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel });
  const rural = v ? Object.values(v.board.houses).find((h) => h.kind === 'rural') : undefined;
  const lengthwise = placements.some((p) => p.kind === 'freeway' && p.lengthwise);
  return (
    <div class="flow kf-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      <p class="muted small">
        The freeway joins the rural area to the road it touches at this edge: deliveries to the rural area count their distance from there.
        {lengthwise ? ' It is 3 squares long: end-on it touches one edge square, lengthwise up to 3. Rotate turns it.' : ''}
        {rural && rural.demand.length > 0 ? ` The rural area wants ${rural.demand.length} item${rural.demand.length === 1 ? '' : 's'} now.` : ''}
      </p>
      {placements.length === 0 ? (
        <NoSpots />
      ) : (
        <>
          <BoardHint count={onBoard.length}>Pick an edge road on the board; the dotted line shows the link.</BoardHint>
          <PlacementRows placements={list} onPick={pick} />
        </>
      )}
    </div>
  );
}
