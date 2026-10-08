/**
 * Lobbyist road and park (ux-plan §2.4, WP5): choose the piece first (road length / park shape,
 * with the legal spot count), then place it on the board and turn it with R / Rotate (both
 * orientations of a straight piece are one spot; bent pieces — corner road, T and L parks — get
 * one chip per orientation). The road ghost shows its arrows and the roadworks the
 * arrows cause; the board draws the lobbyist's road range.
 */
import { useSignal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import type { Placement } from '@fcm/engine';
import { boardModeFor } from '../../state/guidance.js';
import { rotatePlacement } from '../../state/interaction.js';
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
  /** Squares of a bent piece in this orientation (corner road, T / L park); straight pieces turn with R instead. */
  mask?: [number, number][];
  count: number;
}

const PIECE_LABELS: Record<string, string> = { L3: 'Corner road', I: '1×4 park', T: 'T park', L: 'L park' };

/** Squares relative to the piece's top-left corner, in reading order. */
function maskOf(cells: { x: number; y: number }[]): [number, number][] {
  const x0 = Math.min(...cells.map((c) => c.x));
  const y0 = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => [c.x - x0, c.y - y0] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

const shapeOf = (p: Piece): Omit<Shape, 'count'> => {
  const cells = p.kind === 'lobbyistRoad' ? p.cells : (p.cells ?? []);
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const w = cells.length ? Math.max(...xs) - Math.min(...xs) + 1 : p.kind === 'park' ? p.w : 1;
  const h = cells.length ? Math.max(...ys) - Math.min(...ys) + 1 : p.kind === 'park' ? p.h : 1;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  // Bent pieces (engine `piece` L3 / T / L): one chip per orientation, drawn square by square.
  if (short > 1 && cells.length && cells.length < w * h) {
    const mask = maskOf(cells);
    const label = PIECE_LABELS[p.piece ?? ''] ?? (p.kind === 'lobbyistRoad' ? 'Corner road' : 'Park');
    return { key: `${p.kind}:${p.piece ?? ''}:${mask.map((m) => m.join(',')).join(';')}`, label, long: w, short: h, mask };
  }
  if (p.kind === 'lobbyistRoad') return { key: `road:${p.cells.length}`, label: `${p.cells.length}-square road`, long: p.cells.length, short: 1 };
  return { key: `park:${short}x${long}`, label: PIECE_LABELS[p.piece ?? ''] ?? `${short}×${long} park`, long, short };
};

/** Footprint glyph: squares in a row (roads get outward arrows at both ends). */
export function PieceGlyph({ shape, road }: { shape: Pick<Shape, 'long' | 'short' | 'mask'>; road: boolean }) {
  const cell = 12;
  if (shape.mask) {
    // Bent piece: long = width, short = height in squares for this orientation.
    const w = shape.long * cell + 4;
    const h = shape.short * cell + 4;
    return (
      <svg class={`kf-glyph ${road ? 'is-road' : 'is-park'}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {shape.mask.map(([x, y]) => (
          <rect key={`${x},${y}`} x={2 + x * cell + 1} y={2 + y * cell + 1} width={cell - 2} height={cell - 2} rx="2" />
        ))}
      </svg>
    );
  }
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
    return [...by.values()].sort((a, b) => (a.mask?.length ?? a.long * a.short) - (b.mask?.length ?? b.long * b.short));
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
          <BoardHint count={onBoard.length}>2 · Place it on the board; R or Rotate turns it where both directions fit.</BoardHint>
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
