/**
 * Lobbyist road and park (ux-plan §2.4, WP5): choose the piece first (road length / park shape,
 * with the legal spot count), then place it on the board and turn it with R / Rotate (both
 * orientations of a piece are one spot). The road ghost shows its arrows and the roadworks the
 * arrows cause; the board draws the lobbyist's road range.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { Placement } from '@fcm/engine';
import { boardModeFor } from '../../state/guidance.js';
import { ghostOrientation, rotatePlacement } from '../../state/interaction.js';
import { Button } from '../common.js';
import { BoardHint, commitPlacement, FlowHead, NoSpots, PlacementRows, playerColor, splitPlacements, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

type Piece = Extract<Placement, { kind: 'lobbyistRoad' | 'park' }>;

interface Shape {
  key: string;
  label: string;
  /** Long × short side in squares. */
  long: number;
  short: number;
  count: number;
}

const shapeOf = (p: Piece): Omit<Shape, 'count'> => {
  if (p.kind === 'lobbyistRoad') return { key: `road:${p.cells.length}`, label: `${p.cells.length}-square road`, long: p.cells.length, short: 1 };
  const long = Math.max(p.w, p.h);
  const short = Math.min(p.w, p.h);
  return { key: `park:${short}x${long}`, label: `${short}×${long} park`, long, short };
};

/** Footprint glyph: squares in a row (roads get outward arrows at both ends). */
export function PieceGlyph({ shape, road }: { shape: Pick<Shape, 'long' | 'short'>; road: boolean }) {
  const cell = 12;
  const pad = road ? 9 : 2;
  const w = shape.long * cell + pad * 2;
  const h = shape.short * cell + 4;
  return (
    <svg class={`kf-glyph ${road ? 'is-road' : 'is-park'}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {Array.from({ length: shape.long * shape.short }, (_, i) => (
        <rect key={i} x={pad + (i % shape.long) * cell + 1} y={2 + Math.floor(i / shape.long) * cell + 1} width={cell - 2} height={cell - 2} rx="2" />
      ))}
      {road && (
        <>
          <path d={`M${pad - 1} ${h / 2} l-7 0 m3 -3 l-3 3 l3 3`} class="kf-arrow" />
          <path d={`M${w - pad + 1} ${h / 2} l7 0 m-3 -3 l3 3 l-3 3`} class="kf-arrow" />
        </>
      )}
    </svg>
  );
}

export function KetchupPieceFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const road = legal.spec.kind === 'lobbyistRoad';
  const pieces = placements.filter((p): p is Piece => p.kind === 'lobbyistRoad' || p.kind === 'park');
  const shapes = useMemo(() => {
    const by = new Map<string, Shape>();
    for (const p of pieces) {
      const s = shapeOf(p);
      const cur = by.get(s.key);
      if (cur) cur.count++;
      else by.set(s.key, { ...s, count: 1 });
    }
    return [...by.values()].sort((a, b) => a.long * a.short - b.long * b.short);
  }, [placements]);
  // The first piece is picked up straight away, so the board is live; chips switch pieces.
  const chosen = useSignal<string | null>(shapes[0]?.key ?? null);
  const key = shapes.some((s) => s.key === chosen.value) ? chosen.value : (shapes[0]?.key ?? null);
  const forShape = useMemo(() => pieces.filter((p) => shapeOf(p).key === key), [placements, key]);
  const { onBoard, list } = splitPlacements(forShape);
  const shape = shapes.find((s) => s.key === key);
  const mode = useMemo(() => (onBoard.length ? boardModeFor(legal, onBoard, { color: playerColor(), label: shape ? `Place the ${shape.label}` : legal.label }) : null), [forShape]);
  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel });
  const orient = ghostOrientation.value;

  return (
    <div class="flow kf-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      <p class="muted small">
        {road
          ? 'One arrow must point at your entrance or a road within range. The arrows’ roads get roadworks: +1 distance for every route through them until clean up.'
          : 'Houses next to a park sell for double (triple with a garden).'}
      </p>
      {pieces.length === 0 ? (
        <NoSpots />
      ) : (
        <>
          <div class="kf-step">
            <span class="field-label">1 · {road ? 'Road tile' : 'Park tile'}</span>
            <div class="kf-pieces" role="radiogroup" aria-label={road ? 'Road length' : 'Park shape'}>
              {shapes.map((s) => (
                <button key={s.key} type="button" role="radio" aria-checked={s.key === key} class={`kf-piece ${s.key === key ? 'is-on' : ''}`} onClick={() => (chosen.value = s.key)}>
                  <PieceGlyph shape={s} road={road} />
                  <span class="kf-piece-label">{s.label}</span>
                  <span class="muted small">
                    {s.count} spot{s.count === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <BoardHint count={onBoard.length}>2 · Place it on the board; R or Rotate turns it{orient && orient !== 'square' ? ` (now ${orient === 'landscape' ? 'east–west' : 'north–south'})` : ''}.</BoardHint>
          {onBoard.length > 0 && (
            <div class="row">
              <Button size="sm" variant="ghost" icon="rotateRight" onClick={rotatePlacement}>
                Rotate
              </Button>
            </div>
          )}
          <PlacementRows placements={list} onPick={pick} />
        </>
      )}
    </div>
  );
}
