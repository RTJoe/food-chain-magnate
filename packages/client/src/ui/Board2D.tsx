/**
 * Lightweight top-down SVG board, shown while the 3D renderer is not registered (architecture §2:
 * ui/ never imports three/). It reads the same `interactionMode` the 3D layer gets through the
 * board bridge and reports picks with `emitPick`, so placement flows work with either board.
 */
import { useSignal } from '@preact/signals';
import type { CellKind, GameView, Placement } from '@fcm/engine';
import { COLORS, FOOD_COLORS } from '../theme.js';
import { describePlacement } from '../state/actions.js';
import { emitPick, interactionMode } from '../state/boardBridge.js';
import { view } from '../state/store.js';
import { Button } from './common.js';

const CELL_FILL: Record<CellKind, string> = {
  empty: COLORS.grass,
  road: COLORS.road,
  house: COLORS.houseWall,
  garden: COLORS.garden,
  apartment: COLORS.apartment,
  drink: COLORS.lot,
  restaurant: COLORS.lot,
  campaign: COLORS.lot,
  coffeeShop: COLORS.lot,
  park: COLORS.park,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bbox(cells: { x: number; y: number }[]): Rect | null {
  if (!cells.length) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/** Board footprint of a placement, or null when it has no square geometry (routes, airplanes, tiles). */
export function footprint(p: Placement): Rect | null {
  switch (p.kind) {
    case 'restaurant':
    case 'moveRestaurant':
    case 'house':
      return { x: p.x, y: p.y, w: 2, h: 2 };
    case 'coffeeShop':
    case 'pizzaRadio':
    case 'freeMailbox':
      return { x: p.x, y: p.y, w: 1, h: 1 };
    case 'park':
      return { x: p.x, y: p.y, w: p.w, h: p.h };
    case 'campaign':
      return p.placement.kind === 'board' ? { x: p.placement.x, y: p.placement.y, w: p.placement.w, h: p.placement.h } : null;
    case 'garden':
    case 'lobbyistRoad':
      return bbox(p.cells);
    default:
      return null;
  }
}

const CORNER: Record<string, [number, number]> = { NW: [0, 0], NE: [1, 0], SE: [1, 1], SW: [0, 1] };

export function Board2D() {
  const v = view.value;
  const mode = interactionMode.value;
  const spot = useSignal<string | null>(null);
  if (!v) return null;
  const b = v.board;
  const colorOf = (id: string) => v.players[id]?.color ?? COLORS.ink;

  const groups = new Map<string, { rect: Rect; options: Placement[] }>();
  if (mode.kind === 'place') {
    for (const p of mode.placements) {
      const r = footprint(p);
      if (!r) continue;
      const key = `${r.x},${r.y},${r.w},${r.h}`;
      const g = groups.get(key) ?? { rect: r, options: [] };
      g.options.push(p);
      groups.set(key, g);
    }
  }
  const chosen = spot.value ? groups.get(spot.value) : undefined;
  const pickGroup = (key: string) => {
    const g = groups.get(key);
    if (!g) return;
    const only = g.options[0];
    if (g.options.length === 1 && only) {
      spot.value = null;
      emitPick({ kind: 'placement', placement: only });
    } else spot.value = key;
  };

  return (
    <div class="board2d" aria-label="Board (2D)">
      <svg viewBox={`-0.5 -0.5 ${b.w + 1} ${b.h + 1}`} role="img" aria-label="Town map" preserveAspectRatio="xMidYMid meet">
        <rect x={-0.5} y={-0.5} width={b.w + 1} height={b.h + 1} rx={0.4} fill={COLORS.lot} />
        {b.cells.map((row, y) =>
          row.map((cell, x) => <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={cell.road?.underConstruction ? COLORS.warn : CELL_FILL[cell.kind] ?? COLORS.grass} />),
        )}
        {Array.from({ length: b.cols + 1 }, (_, i) => (
          <line key={`c${i}`} x1={i * 5} y1={0} x2={i * 5} y2={b.h} stroke={COLORS.tileEdge} stroke-width={0.06} />
        ))}
        {Array.from({ length: b.rows + 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={i * 5} x2={b.w} y2={i * 5} stroke={COLORS.tileEdge} stroke-width={0.06} />
        ))}
        {Object.values(b.houses).map((h) => {
          const r = bbox(h.cells);
          if (!r) return null;
          return (
            <g key={h.id}>
              <rect x={r.x + 0.08} y={r.y + 0.08} width={r.w - 0.16} height={r.h - 0.16} rx={0.15} fill={h.kind === 'apartment' ? COLORS.apartment : COLORS.houseWall} stroke={COLORS.houseRoof} stroke-width={0.12} />
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 0.05} class="b2d-label">
                {h.label}
              </text>
              {h.demand.slice(0, 6).map((d, i) => (
                <circle key={i} cx={r.x + 0.3 + (i % 3) * 0.5} cy={r.y + r.h - 0.3 - Math.floor(i / 3) * 0.4} r={0.18} fill={FOOD_COLORS[d.good] ?? COLORS.ink} stroke={COLORS.ink} stroke-width={0.04} />
              ))}
            </g>
          );
        })}
        {Object.values(b.drinkSources).map((s) => (
          <g key={s.id}>
            <circle cx={s.x + 0.5} cy={s.y + 0.5} r={0.38} fill={FOOD_COLORS[s.drink] ?? COLORS.ink} stroke={COLORS.ink} stroke-width={0.06} />
          </g>
        ))}
        {Object.values(b.campaigns).map((cp) =>
          cp.placement.kind === 'board' ? (
            <g key={cp.id}>
              <rect x={cp.placement.x + 0.1} y={cp.placement.y + 0.1} width={cp.placement.w - 0.2} height={cp.placement.h - 0.2} rx={0.12} fill={COLORS.surface} stroke={colorOf(cp.owner)} stroke-width={0.16} />
              <text x={cp.placement.x + cp.placement.w / 2} y={cp.placement.y + cp.placement.h / 2 + 0.05} class="b2d-label">
                {cp.number ?? ''}
              </text>
            </g>
          ) : null,
        )}
        {Object.values(b.restaurants).map((r) => {
          const [cx, cy] = CORNER[r.entrance] ?? [0, 0];
          return (
            <g key={r.id} opacity={r.status === 'derelict' ? 0.45 : 1}>
              <rect x={r.x + 0.08} y={r.y + 0.08} width={1.84} height={1.84} rx={0.3} fill={r.status === 'derelict' ? COLORS.inkMuted : colorOf(r.owner)} stroke={COLORS.ink} stroke-width={0.08} stroke-dasharray={r.status === 'comingSoon' ? '0.2 0.15' : undefined} />
              <circle cx={r.x + 0.3 + cx * 1.4} cy={r.y + 0.3 + cy * 1.4} r={0.22} fill={COLORS.surface} stroke={COLORS.ink} stroke-width={0.06} />
              {r.driveIn && <text x={r.x + 1} y={r.y + 1.15} class="b2d-label is-light">D</text>}
            </g>
          );
        })}
        {Object.values(b.entities).map((e) => {
          if (e.kind === 'coffeeShop') return <rect key={e.id} x={e.x + 0.12} y={e.y + 0.12} width={0.76} height={0.76} rx={0.2} fill={colorOf(e.owner)} stroke={COLORS.ink} stroke-width={0.06} />;
          if (e.kind === 'park') return <rect key={e.id} x={e.x + 0.06} y={e.y + 0.06} width={e.w - 0.12} height={e.h - 0.12} rx={0.2} fill={COLORS.park} stroke={COLORS.garden} stroke-width={0.08} />;
          if (e.kind === 'roadworks') return <circle key={e.id} cx={e.x + 0.5} cy={e.y + 0.5} r={0.25} fill={COLORS.warn} />;
          return null;
        })}
        {[...groups.entries()].map(([key, g]) => (
          <rect
            key={key}
            class={`b2d-ghost ${spot.value === key ? 'is-on' : ''}`}
            x={g.rect.x + 0.05}
            y={g.rect.y + 0.05}
            width={g.rect.w - 0.1}
            height={g.rect.h - 0.1}
            rx={0.2}
            fill={mode.kind === 'place' ? mode.color : COLORS.highlightOk}
            onClick={() => pickGroup(key)}
          >
            <title>{g.options.length > 1 ? `${g.options.length} options` : describePlacement(g.options[0] as Placement)}</title>
          </rect>
        ))}
      </svg>
      {mode.kind === 'place' && (
        <div class="b2d-bar glass">
          <span class="small">{mode.label}</span>
          {chosen ? (
            <div class="chip-row">
              {chosen.options.map((p, i) => (
                <button key={i} type="button" class="chip" onClick={() => ((spot.value = null), emitPick({ kind: 'placement', placement: p }))}>
                  {describePlacement(p)}
                </button>
              ))}
            </div>
          ) : (
            <span class="muted small">{groups.size ? `${groups.size} highlighted spots` : 'Pick from the list in the panel'}</span>
          )}
          <Button size="sm" variant="ghost" icon="x" onClick={() => ((spot.value = null), emitPick({ kind: 'cancel' }))}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/** Used by the shell to decide whether the 2D board is needed. */
export const hasBoard = (v: GameView | null): boolean => Boolean(v && v.board.w > 0 && v.board.cells.length > 0);
