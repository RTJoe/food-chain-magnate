/**
 * Top-down SVG board, shown while no 3D renderer is registered: no WebGL, or a WebGL context that
 * was lost and never restored (architecture §2: ui/ never imports three/).
 *
 * It honours the same contract as the 3D board (state/boardBridge.ts + state/interaction.ts):
 * - Every pick mode draws its candidates, off-board ones included (airplanes, rural billboards,
 *   freeways, extra map tiles, gourmet guides) and buyer routes as lines. A tap stages a spot
 *   (`pendingPlacement`; Rotate cycles its variants), then Place / Buy in the pick strip, a second
 *   tap or Enter commits. A mouse click on a single-variant spot commits at once. Escape backs out.
 * - A tap on a square with no legal spot publishes the engine's reason (`boardHover` →
 *   `placementReason`), which the pick strip shows.
 * - Outside picks, a tap on a piece selects it for the Inspect card.
 * - The controller's overlays (range, campaign reach) and rings (selection, related pieces, rail
 *   hover, lesson targets, the results strip's step) are drawn too.
 * The SVG keeps clear of the floating panels (state/tableInset.ts), as the 3D camera does.
 */
import { effect, untracked, useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Board, CellKind, Direction, FoodId, GameView, Placement } from '@fcm/engine';
import { COLORS, FOOD_COLORS } from '../theme.js';
import { describePlacement } from '../state/actions.js';
import { emitPick, interactionMode, isPickMode, type InteractionMode } from '../state/boardBridge.js';
import { rangeOverlay, reachOverlay } from '../state/boardOverlays.js';
import { boardFeedback } from '../state/feedback.js';
import {
  activeCandidate,
  boardHover,
  confirmRequest,
  cycleRequest,
  ghostOrientation,
  hoverPlacement,
  inspectIds,
  pendingPlacement,
  pendingVariants,
  rotateRequest,
  select,
  selection,
  selectionRelated,
  tutorialHighlight,
  type SelectionKind,
} from '../state/interaction.js';
import { watchTableInset } from '../state/tableInset.js';
import { view } from '../state/store.js';
import { FoodIcon } from './icons.js';

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

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bbox(cells: readonly { x: number; y: number }[]): Rect | null {
  if (!cells.length) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

// --- Off-board geometry (squares; the map is [0, w] x [0, h]) -------------------------------------

/** Margin around the map: square numbers, airplane strips, freeway stubs and guides. */
const MARGIN = 2.1;
/** Airplane strip: centre distance from the map edge and thickness. */
const AIR = 1.15;
const AIR_T = 0.8;
/** Rural area box: gap to the map and size. */
const RURAL_GAP = 2.6;
const RURAL = 5;

const hasRural = (b: Board) => Object.values(b.houses).some((h) => h.kind === 'rural');

/** Side the rural area sits on: where the first freeway is, else east (as on the 3D board). */
function ruralSide(b: Board): Direction {
  for (const e of Object.values(b.entities)) if (e.kind === 'freeway') return e.side;
  return 'E';
}

function ruralBox(b: Board): Rect {
  const s = ruralSide(b);
  if (s === 'N') return { x: b.w / 2 - RURAL / 2, y: -RURAL_GAP - RURAL, w: RURAL, h: RURAL };
  if (s === 'S') return { x: b.w / 2 - RURAL / 2, y: b.h + RURAL_GAP, w: RURAL, h: RURAL };
  if (s === 'W') return { x: -RURAL_GAP - RURAL, y: b.h / 2 - RURAL / 2, w: RURAL, h: RURAL };
  return { x: b.w + RURAL_GAP, y: b.h / 2 - RURAL / 2, w: RURAL, h: RURAL };
}

/** A strip beside map edge `side`, covering `width` squares from `offset`, centred `dist` out. */
function edgeRect(b: Board, side: Direction, offset: number, width: number, dist: number, thick: number): Rect {
  if (side === 'N') return { x: offset, y: -dist - thick / 2, w: width, h: thick };
  if (side === 'S') return { x: offset, y: b.h + dist - thick / 2, w: width, h: thick };
  if (side === 'W') return { x: -dist - thick / 2, y: offset, w: thick, h: width };
  return { x: b.w + dist - thick / 2, y: offset, w: thick, h: width };
}

function freewayRect(b: Board, side: Direction, offset: number): Rect {
  const len = hasRural(b) && side === ruralSide(b) ? RURAL_GAP : 1.6;
  return edgeRect(b, side, offset + 0.15, 0.7, len / 2, len);
}

/** Giant billboard on side `side` of the rural box. */
function ruralBillboardRect(b: Board, side: Direction): Rect {
  const r = ruralBox(b);
  if (side === 'N') return { x: r.x + 0.7, y: r.y - 0.9, w: 3.6, h: 0.7 };
  if (side === 'S') return { x: r.x + 0.7, y: r.y + r.h + 0.2, w: 3.6, h: 0.7 };
  if (side === 'W') return { x: r.x - 0.9, y: r.y + 0.7, w: 0.7, h: 3.6 };
  return { x: r.x + r.w + 0.2, y: r.y + 0.7, w: 0.7, h: 3.6 };
}

/** Gourmet guide spots: the four outer corners, then along the north rim (as on the 3D board). */
function guideRect(b: Board, i: number): Rect {
  const c: [number, number][] = [
    [-1.05, -1.05],
    [b.w + 1.05, -1.05],
    [b.w + 1.05, b.h + 1.05],
    [-1.05, b.h + 1.05],
  ];
  const [x, y] = c[i] ?? [2 + (i - 4) * 1.6, -1.05];
  return { x: x - 0.6, y: y - 0.5, w: 1.2, h: 1 };
}

function gardenRect(x: number, y: number, side: Direction): Rect {
  if (side === 'N') return { x, y: y - 1, w: 2, h: 1 };
  if (side === 'S') return { x, y: y + 2, w: 2, h: 1 };
  if (side === 'W') return { x: x - 1, y, w: 1, h: 2 };
  return { x: x + 2, y, w: 1, h: 2 };
}

/** Where a placement is drawn on the 2D board (off-board ones beside the map), or null (buyer routes). */
function shapeOf(b: Board | null | undefined, p: Placement): Rect | null {
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
    case 'garden':
    case 'lobbyistRoad':
      return bbox(p.cells);
    case 'mapTile':
      return { x: p.col * 5, y: p.row * 5, w: 5, h: 5 };
    case 'campaign': {
      const pl = p.placement;
      if (pl.kind === 'board') return { x: pl.x, y: pl.y, w: pl.w, h: pl.h };
      if (!b) return null;
      if (pl.kind === 'airplane') return edgeRect(b, pl.side, pl.offset, pl.width, AIR, AIR_T);
      if (pl.kind === 'rural') return ruralBillboardRect(b, pl.side);
      return guideRect(b, Object.values(b.campaigns).filter((c) => c.placement.kind === 'offBoard').length);
    }
    case 'freeway':
      return b ? freewayRect(b, p.side, p.offset) : null;
    default:
      return null;
  }
}

/**
 * Where the 2D board shows a placement, or null when only the panel list can (buyer routes, errand
 * fetches, gourmet guides): flows split their placements between board and list with this.
 */
export function footprint(p: Placement, b: Board | null | undefined = view.peek()?.board): Rect | null {
  if (p.kind === 'campaign' && p.placement.kind === 'offBoard') return null;
  return shapeOf(b, p);
}

/** Bounding rectangle of a board piece by id (house, restaurant, campaign, source, entity), or null. */
function pieceRect(b: Board, id: string): Rect | null {
  const h = b.houses[id];
  if (h) return h.kind === 'rural' || !h.cells.length ? (hasRural(b) ? ruralBox(b) : null) : bbox(h.cells);
  const r = b.restaurants[id];
  if (r) return { x: r.x, y: r.y, w: 2, h: 2 };
  const c = b.campaigns[id];
  if (c) {
    if (c.placement.kind === 'offBoard') {
      const i = Object.values(b.campaigns).filter((x) => x.placement.kind === 'offBoard').indexOf(c);
      return guideRect(b, Math.max(0, i));
    }
    return shapeOf(b, { kind: 'campaign', campaignKind: c.kind, tileNumber: c.number ?? 0, placement: c.placement } as Placement);
  }
  const s = b.drinkSources[id];
  if (s) return { x: s.x, y: s.y, w: 1, h: 1 };
  const e = b.entities[id];
  if (!e) return null;
  if (e.kind === 'coffeeShop' || e.kind === 'roadworks') return { x: e.x, y: e.y, w: 1, h: 1 };
  if (e.kind === 'park') return { x: e.x, y: e.y, w: e.w, h: e.h };
  if (e.kind === 'lobbyistRoad') return bbox(e.cells);
  return freewayRect(b, e.side, e.offset);
}

const CORNER: Record<string, [number, number]> = { NW: [0, 0], NE: [1, 0], SE: [1, 1], SW: [0, 1] };
const ARROW: Record<Direction, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/** One spot: placements sharing a drawn rectangle (variants: entrances, garden sides, tile numbers, rotations). */
interface Spot {
  key: string;
  rect: Rect;
  variants: Placement[];
}

type RouteP = Extract<Placement, { kind: 'buyerRoute' }>;

/** Board points (square units) a buyer route passes through, start first. */
function routePoints(b: Board, p: RouteP): [number, number][] {
  const r = p.route;
  if (r.mode === 'errand') return [];
  const pts: [number, number][] = [];
  const from = r.from;
  if (from.kind === 'restaurant') {
    const rs = b.restaurants[from.restaurantId];
    const [cx, cy] = CORNER[from.corner] ?? [0, 0];
    if (rs) pts.push([rs.x + 0.5 + cx, rs.y + 0.5 + cy]);
  } else {
    const e = b.entities[from.entityId];
    if (e && 'x' in e) pts.push([e.x + 0.5, e.y + 0.5]);
  }
  if (r.mode === 'road') for (const c of r.path) pts.push([c.x + 0.5, c.y + 0.5]);
  else for (const t of r.tiles) pts.push([t.col * 5 + 2.5, t.row * 5 + 2.5]);
  return pts;
}

const orientationOf = (p: Placement): 'landscape' | 'portrait' | 'square' | null => {
  if (p.kind !== 'campaign' || p.placement.kind !== 'board') return null;
  const { w, h } = p.placement;
  return w === h ? 'square' : w > h ? 'landscape' : 'portrait';
};

/** Group the mode's candidates into spots (campaign mode: one orientation at a time, as on the 3D board). */
export function spotsFor(b: Board, mode: InteractionMode, orient: string | null): Map<string, Spot> {
  const out = new Map<string, Spot>();
  if (mode.kind !== 'place' && mode.kind !== 'campaign') return out;
  for (const p of mode.placements as readonly Placement[]) {
    const o = orientationOf(p);
    if (orient && o && o !== 'square' && o !== orient) continue;
    const r = shapeOf(b, p);
    if (!r) continue;
    const key = `${p.kind}:${r.x},${r.y},${r.w},${r.h}`;
    const s = out.get(key) ?? { key, rect: r, variants: [] };
    s.variants.push(p);
    out.set(key, s);
  }
  return out;
}

const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * The spot under a board point, and the variant the point suggests. Spots overlap (every 2x2
 * restaurant spot around a square): the tapped square becomes a restaurant's door (the corner
 * nearest the point), a house's garden goes on the side the point leans to, and otherwise the
 * nearest spot centre wins. Campaign ghosts already show one orientation (`spotsFor`).
 */
export function spotAt(spots: Map<string, Spot>, x: number, y: number): { spot: Spot; idx: number } | null {
  let best: { spot: Spot; idx: number } | null = null;
  let bestD = Infinity;
  const cx0 = Math.floor(x);
  const cy0 = Math.floor(y);
  for (const s of spots.values()) {
    if (!contains(s.rect, x, y)) continue;
    const mx = s.rect.x + s.rect.w / 2;
    const my = s.rect.y + s.rect.h / 2;
    let d = (x - mx) ** 2 + (y - my) ** 2;
    let idx = 0;
    const first = s.variants[0];
    if (first && (first.kind === 'restaurant' || first.kind === 'moveRestaurant')) {
      const want = `${y < my ? 'N' : 'S'}${x < mx ? 'W' : 'E'}`;
      const i = s.variants.findIndex((v) => 'entrance' in v && v.entrance === want);
      if (i >= 0) {
        idx = i;
        // The door on the tapped square; a spot anchored there wins a tie.
        d -= 50 + (s.rect.x === cx0 && s.rect.y === cy0 ? 0.01 : 0);
      }
    } else if (first?.kind === 'house' && s.variants.length > 1) {
      const dx = x - mx;
      const dy = y - my;
      const want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
      const i = s.variants.findIndex((v) => v.kind === 'house' && v.gardenSide === want);
      if (i >= 0) idx = i;
    }
    if (d < bestD) {
      best = { spot: s, idx };
      bestD = d;
    }
  }
  return best;
}

/** Squares a staged variant adds to its spot's ghost (a new house's garden). */
function extraOf(p: Placement | undefined): Rect | null {
  return p?.kind === 'house' ? gardenRect(p.x, p.y, p.gardenSide) : null;
}

function Pips({ x, y, n, eternal, color }: { x: number; y: number; n: number; eternal: boolean; color: string }) {
  if (eternal)
    return (
      <text x={x} y={y + 0.05} class="b2d-label b2d-small">
        ∞
      </text>
    );
  const k = Math.min(n, 6);
  return (
    <g>
      {Array.from({ length: k }, (_, i) => (
        <circle key={i} cx={x + (i - (k - 1) / 2) * 0.26} cy={y} r={0.09} fill={color} />
      ))}
    </g>
  );
}

function Good({ food, x, y, s }: { food: FoodId; x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x - s / 2} ${y - s / 2}) scale(${s})`} class="b2d-food">
      <FoodIcon food={food} size={1} />
    </g>
  );
}

export function Board2D() {
  const v = view.value;
  const mode = interactionMode.value;
  const orient = ghostOrientation.value;
  /** Staged spot (key + variant), or route index while staged. */
  const staged = useSignal<{ key: string; idx: number } | null>(null);
  const stagedRoute = useSignal<number | null>(null);
  const pad = useSignal({ left: 0, right: 0, top: 0, bottom: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerType = useRef('mouse');
  const hoverKey = useSignal<string | null>(null);

  const b = v?.board ?? null;
  const spots = b ? spotsFor(b, mode, mode.kind === 'campaign' || (mode.kind === 'place' && mode.placementKind === 'campaign') ? orient : null) : new Map<string, Spot>();

  // Latest render state for the long-lived listeners below.
  const ctl = useRef({ mode, spots, b });
  ctl.current = { mode, spots, b };

  const unstage = () => {
    staged.value = null;
    stagedRoute.value = null;
    pendingPlacement.value = null;
    pendingVariants.value = 0;
  };
  const commit = (p: Placement) => {
    unstage();
    hoverPlacement.value = null;
    emitPick({ kind: 'placement', placement: p });
  };
  const stage = (s: Spot, idx: number) => {
    staged.value = { key: s.key, idx };
    stagedRoute.value = null;
    pendingPlacement.value = s.variants[idx] ?? null;
    pendingVariants.value = s.variants.length;
    const m = ctl.current.mode;
    if (isPickMode(m)) {
      const i = (m.placements as readonly Placement[]).indexOf(s.variants[idx] as Placement);
      if (i >= 0) activeCandidate.value = i;
    }
  };
  const stageRoute = (i: number) => {
    const m = ctl.current.mode;
    if (m.kind !== 'route') return;
    staged.value = null;
    stagedRoute.value = i;
    activeCandidate.value = i;
    pendingPlacement.value = m.placements[i] ?? null;
    pendingVariants.value = 0;
  };
  const confirm = () => {
    const m = ctl.current.mode;
    if (m.kind === 'route') {
      const i = stagedRoute.peek() ?? activeCandidate.peek();
      const p = m.placements[i];
      if (p) commit(p);
      return;
    }
    const st = staged.peek();
    const s = st && ctl.current.spots.get(st.key);
    const p = s?.variants[st!.idx];
    if (p) commit(p);
  };
  const rotate = () => {
    const m = ctl.current.mode;
    const st = staged.peek();
    const s = st && ctl.current.spots.get(st.key);
    if (s && s.variants.length > 1) return stage(s, (st!.idx + 1) % s.variants.length);
    // Campaigns: flip the orientation the ghosts use (sticky, as on the 3D board).
    if (m.kind === 'campaign' || (m.kind === 'place' && m.placementKind === 'campaign')) {
      const o = ghostOrientation.peek();
      if (o === 'landscape' || o === 'portrait') {
        unstage();
        ghostOrientation.value = o === 'landscape' ? 'portrait' : 'landscape';
      }
    }
  };
  const cycle = (by: number) => {
    const m = ctl.current.mode;
    if (m.kind !== 'route' || !m.placements.length) return;
    const n = m.placements.length;
    const cur = stagedRoute.peek() ?? Math.max(0, activeCandidate.peek());
    const next = (((cur + by) % n) + n) % n;
    if (stagedRoute.peek() !== null) stageRoute(next);
    else activeCandidate.value = next;
  };

  // Mode change: drop the stage; campaign modes pick a starting orientation; a lone off-board spot
  // (gourmet guide) is staged so Confirm is all that is left.
  useEffect(() => {
    unstage();
    hoverPlacement.value = null;
    const m = mode;
    const oriented = m.kind === 'campaign' || (m.kind === 'place' && m.placementKind === 'campaign');
    if (oriented) {
      const os = new Set((m.placements as readonly Placement[]).map(orientationOf));
      ghostOrientation.value = os.has('landscape') ? (ghostOrientation.peek() === 'portrait' && os.has('portrait') ? 'portrait' : 'landscape') : os.has('portrait') ? 'portrait' : null;
    } else ghostOrientation.value = null;
    const cur = ctl.current.b ? spotsFor(ctl.current.b, m, ghostOrientation.peek()) : new Map<string, Spot>();
    const only = cur.size === 1 ? [...cur.values()][0] : undefined;
    const p = only?.variants[0];
    if (only && p?.kind === 'campaign' && p.placement.kind === 'offBoard') stage(only, 0);
  }, [mode]);

  // Pick strip buttons (Place / Rotate / previous-next) and the keyboard.
  useEffect(() => {
    const offs = [
      onBump(() => confirmRequest.value, confirm),
      onBump(() => rotateRequest.value, rotate),
      onBump(() => cycleRequest.value, () => cycle(cycleRequest.peek().by)),
    ];
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const m = ctl.current.mode;
      if (e.key === 'Escape') {
        if (staged.peek() || stagedRoute.peek() !== null) unstage();
        else if (isPickMode(m)) emitPick({ kind: 'cancel' });
        else if (selection.peek()) select(null);
        else return;
      } else if (!isPickMode(m)) return;
      else if (e.key === 'Enter') confirm();
      else if ((e.key === 'r' || e.key === 'R') && m.kind !== 'route') rotate();
      else if (e.key === '[' || e.key === ']') cycle(e.key === ']' ? 1 : -1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => {
      for (const off of offs) off();
      window.removeEventListener('keydown', key);
      unstage();
      hoverPlacement.value = null;
      boardHover.value = null;
    };
  }, []);

  // Keep clear of the floating panels and the phone sheet, as the 3D camera does.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return watchTableInset(el, (i) => {
      const cur = pad.peek();
      if (Math.abs(cur.left - i.left) + Math.abs(cur.right - i.right) + Math.abs(cur.top - i.top) + Math.abs(cur.bottom - i.bottom) > 1) pad.value = { ...i };
    }, () => 1.2);
  }, []);

  if (!v || !b) return null;
  const colorOf = (id: string) => v.players[id]?.color ?? COLORS.ink;
  const picking = isPickMode(mode);

  /** Board point (square units) under a client point. */
  const pointAt = (cx: number, cy: number): { x: number; y: number } | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  /** Board square under a client point (or null outside the map). */
  const cellAt = (cx: number, cy: number): { x: number; y: number } | null => {
    const p = pointAt(cx, cy);
    if (!p) return null;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    return x >= 0 && y >= 0 && x < b.w && y < b.h ? { x, y } : null;
  };

  const tapSpot = (s: Spot, idx: number) => {
    const st = staged.peek();
    if (st?.key === s.key) return confirm();
    if (pointerType.current === 'mouse' && s.variants.length === 1) return commit(s.variants[0] as Placement);
    stage(s, idx);
  };
  /** Picks: the spot under a client point (overlapping spots: see `spotAt`), else the square's reason. */
  const onBoardTap = (e: MouseEvent) => {
    if (!picking || mode.kind === 'route') return;
    const p = pointAt(e.clientX, e.clientY);
    const hit = p ? spotAt(spots, p.x, p.y) : null;
    if (hit) {
      boardHover.value = null;
      return tapSpot(hit.spot, hit.idx);
    }
    // A tap on a square with no legal spot: publish it so the strip can say why not.
    const cell = cellAt(e.clientX, e.clientY);
    boardHover.value = cell ? { id: null, cell } : null;
  };
  const tapRoute = (i: number) => {
    if (stagedRoute.peek() === i) return confirm();
    stageRoute(i);
  };
  const tapPiece = (id: string, kind: SelectionKind) => {
    if (picking) return;
    emitPick({ kind: 'object', id, objectKind: kind });
  };

  // --- Extents (viewBox) ----------------------------------------------------------------------
  let x0 = -MARGIN;
  let y0 = -MARGIN;
  let x1 = b.w + MARGIN;
  let y1 = b.h + MARGIN;
  const grow = (r: Rect | null, m = 0.4) => {
    if (!r) return;
    x0 = Math.min(x0, r.x - m);
    y0 = Math.min(y0, r.y - m);
    x1 = Math.max(x1, r.x + r.w + m);
    y1 = Math.max(y1, r.y + r.h + m);
  };
  const rural = hasRural(b);
  if (rural) grow(ruralBox(b), 1.4);
  for (const s of spots.values()) grow(s.rect);

  // --- Rings ------------------------------------------------------------------------------------
  const rings: { id: string; cls: string }[] = [];
  const fb = boardFeedback.value;
  if (fb?.kind === 'dinner') {
    rings.push({ id: fb.houseId, cls: 'is-step' });
    if (fb.winner) rings.push({ id: fb.winner.restaurantId, cls: 'is-win' });
  } else if (fb?.kind === 'campaign') {
    rings.push({ id: fb.campaignId, cls: 'is-step' });
    for (const h of fb.houses) rings.push({ id: h, cls: 'is-rel' });
  }
  for (const id of selectionRelated.value) rings.push({ id, cls: 'is-rel' });
  for (const id of inspectIds.value) rings.push({ id, cls: 'is-inspect' });
  if (selection.value) rings.push({ id: selection.value.id, cls: 'is-sel' });
  for (const id of tutorialHighlight.value) rings.push({ id, cls: 'is-coach' });

  const range = picking ? rangeOverlay.value : null;
  const reach = reachOverlay.value;
  const active = activeCandidate.value;
  const st = staged.value;
  const offBoardCampaigns = Object.values(b.campaigns).filter((c) => c.placement.kind === 'offBoard');
  const p = pad.value;

  return (
    <div class="board2d" ref={rootRef} aria-label="Board (2D)" style={{ padding: `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` }}>
      <svg
        ref={svgRef}
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        role="img"
        aria-label="Town map"
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => (pointerType.current = e.pointerType || 'mouse')}
        onClick={onBoardTap}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || !picking || mode.kind === 'route') return;
          const p = pointAt(e.clientX, e.clientY);
          const hit = p ? spotAt(spots, p.x, p.y) : null;
          const key = hit ? `${hit.spot.key}#${hit.idx}` : null;
          if (key !== hoverKey.peek()) {
            hoverKey.value = key;
            hoverPlacement.value = hit ? { placement: hit.spot.variants[hit.idx] as Placement, variants: hit.spot.variants.length } : null;
          }
          const cell = hit ? null : cellAt(e.clientX, e.clientY);
          const cur = boardHover.peek()?.cell ?? null;
          if (cell?.x !== cur?.x || cell?.y !== cur?.y) boardHover.value = cell ? { id: null, cell } : null;
        }}
        onPointerLeave={() => {
          boardHover.value = null;
          hoverPlacement.value = null;
          hoverKey.value = null;
        }}
      >
        <rect x={-0.5} y={-0.5} width={b.w + 1} height={b.h + 1} rx={0.4} fill={COLORS.lot} />
        <g class="b2d-map">
          {b.cells.map((row, y) =>
            row.map((cell, x) => <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={cell.road?.underConstruction ? COLORS.warn : CELL_FILL[cell.kind] ?? COLORS.grass} />),
          )}
        </g>
        {Array.from({ length: b.cols + 1 }, (_, i) => (
          <line key={`c${i}`} x1={i * 5} y1={0} x2={i * 5} y2={b.h} stroke={COLORS.tileEdge} stroke-width={0.06} />
        ))}
        {Array.from({ length: b.rows + 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={i * 5} x2={b.w} y2={i * 5} stroke={COLORS.tileEdge} stroke-width={0.06} />
        ))}
        {/* Square numbers on the rim (list rows say "at x,y") and tile names (lessons say "tile B2"). */}
        <g class="b2d-axis" aria-hidden="true">
          {Array.from({ length: b.w }, (_, i) => (
            <text key={`ax${i}`} x={i + 0.5} y={-0.38}>
              {i}
            </text>
          ))}
          {Array.from({ length: b.h }, (_, i) => (
            <text key={`ay${i}`} x={-0.42} y={i + 0.52}>
              {i}
            </text>
          ))}
        </g>
        <g class="b2d-tilenames" aria-hidden="true">
          {b.tiles.length
            ? Array.from({ length: b.rows * b.cols }, (_, i) => {
                const r = Math.floor(i / b.cols);
                const c = i % b.cols;
                return (
                  <text key={`t${i}`} x={c * 5 + 0.12} y={r * 5 + 0.42}>
                    {String.fromCharCode(65 + c)}
                    {r + 1}
                  </text>
                );
              })
            : null}
        </g>

        {range && (
          <g class="b2d-range" aria-hidden="true">
            {range.roads.map((r) => (
              <rect key={`${r.x},${r.y}`} x={r.x + 0.1} y={r.y + 0.1} width={0.8} height={0.8} rx={0.15} fill={range.color ?? COLORS.focus} />
            ))}
          </g>
        )}

        {rural && (
          <g class="b2d-piece" onClick={() => {
            const h = Object.values(b.houses).find((x) => x.kind === 'rural');
            if (h) tapPiece(h.id, 'house');
          }}>
            {(() => {
              const r = ruralBox(b);
              const h = Object.values(b.houses).find((x) => x.kind === 'rural');
              return (
                <>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={0.4} fill={COLORS.grass} stroke={COLORS.garden} stroke-width={0.12} />
                  <text x={r.x + r.w / 2} y={r.y + 0.6} class="b2d-label">
                    Rural area
                  </text>
                  {h?.demand.slice(0, 15).map((d, i) => (
                    <circle key={i} cx={r.x + 0.7 + (i % 5) * 0.9} cy={r.y + 1.6 + Math.floor(i / 5) * 0.9} r={0.3} fill={FOOD_COLORS[d.good] ?? COLORS.ink} stroke={COLORS.ink} stroke-width={0.05} />
                  ))}
                </>
              );
            })()}
          </g>
        )}

        {Object.values(b.houses).map((h) => {
          const r = bbox(h.cells);
          if (!r) return null;
          return (
            <g key={h.id} class="b2d-piece" data-id={h.id} onClick={() => tapPiece(h.id, 'house')}>
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
          <g key={s.id} class="b2d-piece" data-id={s.id} onClick={() => tapPiece(s.id, 'source')}>
            <circle cx={s.x + 0.5} cy={s.y + 0.5} r={0.42} fill={COLORS.surface} stroke={COLORS.ink} stroke-width={0.06} />
            <Good food={s.drink as FoodId} x={s.x + 0.5} y={s.y + 0.5} s={0.62} />
          </g>
        ))}
        {Object.values(b.campaigns).map((cp) => {
          const r = cp.placement.kind === 'offBoard' ? guideRect(b, offBoardCampaigns.indexOf(cp)) : pieceRect(b, cp.id);
          if (!r) return null;
          const small = Math.min(r.w, r.h);
          const goods = cp.goods.slice(0, 2);
          const icon = Math.min(0.9, small * 0.55);
          return (
            <g key={cp.id} class="b2d-piece b2d-campaign" data-id={cp.id} onClick={() => tapPiece(cp.id, 'campaign')}>
              <rect x={r.x + 0.08} y={r.y + 0.08} width={r.w - 0.16} height={r.h - 0.16} rx={0.12} fill={COLORS.surface} stroke={colorOf(cp.owner)} stroke-width={0.14} />
              {cp.number !== null && (
                <text x={r.x + 0.32} y={r.y + 0.36} class="b2d-label b2d-small">
                  {cp.number}
                </text>
              )}
              {cp.placement.kind === 'offBoard' && (
                <text x={r.x + 0.3} y={r.y + 0.34} class="b2d-label b2d-small">
                  G
                </text>
              )}
              {goods.map((g, i) => (
                <Good key={g} food={g} x={r.x + r.w / 2 + (goods.length > 1 ? (i - 0.5) * icon : 0)} y={r.y + r.h / 2 - (small >= 1.5 ? 0.1 : 0)} s={icon} />
              ))}
              {small >= 0.75 && <Pips x={r.x + r.w / 2} y={r.y + r.h - 0.22} n={cp.remaining} eternal={cp.eternal} color={colorOf(cp.owner)} />}
            </g>
          );
        })}
        {Object.values(b.restaurants).map((r) => {
          const [cx, cy] = CORNER[r.entrance] ?? [0, 0];
          return (
            <g key={r.id} class="b2d-piece" data-id={r.id} opacity={r.status === 'derelict' ? 0.45 : 1} onClick={() => tapPiece(r.id, 'restaurant')}>
              <rect x={r.x + 0.08} y={r.y + 0.08} width={1.84} height={1.84} rx={0.3} fill={r.status === 'derelict' ? COLORS.inkMuted : colorOf(r.owner)} stroke={COLORS.ink} stroke-width={0.08} stroke-dasharray={r.status === 'comingSoon' ? '0.2 0.15' : undefined} />
              <circle cx={r.x + 0.3 + cx * 1.4} cy={r.y + 0.3 + cy * 1.4} r={0.22} fill={COLORS.surface} stroke={COLORS.ink} stroke-width={0.06} />
              {r.driveIn && (
                <text x={r.x + 1} y={r.y + 1.15} class="b2d-label is-light">
                  D
                </text>
              )}
            </g>
          );
        })}
        {Object.values(b.entities).map((e) => {
          const tap = () => tapPiece(e.id, 'entity');
          if (e.kind === 'coffeeShop') return <rect key={e.id} class="b2d-piece" data-id={e.id} onClick={tap} x={e.x + 0.12} y={e.y + 0.12} width={0.76} height={0.76} rx={0.2} fill={colorOf(e.owner)} stroke={COLORS.ink} stroke-width={0.06} />;
          if (e.kind === 'park' && e.cells?.length)
            return (
              <g key={e.id} class="b2d-piece" data-id={e.id} onClick={tap}>
                {e.cells.map((q) => (
                  <rect key={`${q.x},${q.y}`} x={q.x + 0.06} y={q.y + 0.06} width={0.88} height={0.88} rx={0.2} fill={COLORS.park} stroke={COLORS.garden} stroke-width={0.08} />
                ))}
              </g>
            );
          if (e.kind === 'park') return <rect key={e.id} class="b2d-piece" data-id={e.id} onClick={tap} x={e.x + 0.06} y={e.y + 0.06} width={e.w - 0.12} height={e.h - 0.12} rx={0.2} fill={COLORS.park} stroke={COLORS.garden} stroke-width={0.08} />;
          if (e.kind === 'roadworks') return <circle key={e.id} class="b2d-piece" data-id={e.id} onClick={tap} cx={e.x + 0.5} cy={e.y + 0.5} r={0.25} fill={COLORS.warn} />;
          if (e.kind === 'lobbyistRoad')
            return (
              <g key={e.id} class="b2d-piece" data-id={e.id} onClick={tap}>
                {e.cells.map((q) => (
                  <rect key={`${q.x},${q.y}`} x={q.x + 0.04} y={q.y + 0.04} width={0.92} height={0.92} fill={e.underConstruction ? COLORS.warn : COLORS.road} stroke={colorOf(e.owner)} stroke-width={0.08} />
                ))}
                {e.arrows.map((a, i) => {
                  const [dx, dy] = ARROW[a.dir];
                  const cx = a.from.x + 0.5 + dx * 0.3;
                  const cy = a.from.y + 0.5 + dy * 0.3;
                  return <path key={i} d={`M${cx + dx * 0.25} ${cy + dy * 0.25} L${cx - dy * 0.18} ${cy + dx * 0.18} L${cx + dy * 0.18} ${cy - dx * 0.18} Z`} fill={COLORS.surface} />;
                })}
              </g>
            );
          if (e.kind === 'freeway') {
            const r = freewayRect(b, e.side, e.offset);
            return <rect key={e.id} class="b2d-piece" data-id={e.id} onClick={tap} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.15} fill={COLORS.road} stroke={colorOf(e.owner)} stroke-width={0.12} />;
          }
          return null;
        })}

        {reach && (
          <g class="b2d-reach" aria-hidden="true">
            {reach.cells?.map((c) => <rect key={`${c.x},${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={reach.color ?? COLORS.focus} opacity={0.22} />)}
            {reach.band && (
              <rect
                x={reach.band.axis === 'col' ? reach.band.from : 0}
                y={reach.band.axis === 'row' ? reach.band.from : 0}
                width={reach.band.axis === 'col' ? reach.band.to - reach.band.from + 1 : b.w}
                height={reach.band.axis === 'row' ? reach.band.to - reach.band.from + 1 : b.h}
                fill={reach.color ?? COLORS.focus}
                opacity={0.14}
              />
            )}
            {reach.houseIds.map((id) => {
              const r = pieceRect(b, id);
              const full = reach.full?.includes(id);
              return r ? <rect key={id} class={`b2d-reach-house ${full ? 'is-full' : ''}`} x={r.x - 0.1} y={r.y - 0.1} width={r.w + 0.2} height={r.h + 0.2} rx={0.25} stroke={full ? COLORS.highlightBad : reach.color ?? COLORS.focus} /> : null;
            })}
          </g>
        )}

        {mode.kind === 'route' && (
          <g class="b2d-routes">
            {mode.placements.map((p, i) => {
              if (i === active) return null;
              const pts = routePoints(b, p).map((q) => q.join(',')).join(' ');
              return (
                <g key={i} onClick={(e) => (e.stopPropagation(), tapRoute(i))} onPointerEnter={(e) => e.pointerType === 'mouse' && stagedRoute.peek() === null && (activeCandidate.value = i)}>
                  <polyline points={pts} class="b2d-route-hit" />
                  <polyline points={pts} class="b2d-route" stroke={mode.color} />
                </g>
              );
            })}
            {mode.placements[active] &&
              (() => {
                const p = mode.placements[active]!;
                const pts = routePoints(b, p);
                return (
                  <g onClick={(e) => (e.stopPropagation(), tapRoute(active))}>
                    <polyline points={pts.map((q) => q.join(',')).join(' ')} class="b2d-route-hit" />
                    <polyline points={pts.map((q) => q.join(',')).join(' ')} class={`b2d-route is-active ${stagedRoute.value === active ? 'is-staged' : ''}`} stroke={mode.color} />
                    {pts[0] && <circle cx={pts[0][0]} cy={pts[0][1]} r={0.22} fill={mode.color} stroke={COLORS.ink} stroke-width={0.05} />}
                    {p.collects.map((c) => {
                      const s = b.drinkSources[c.sourceId];
                      return s ? <circle key={c.sourceId} cx={s.x + 0.5} cy={s.y + 0.5} r={0.55} class="b2d-collect" stroke={mode.color} /> : null;
                    })}
                  </g>
                );
              })()}
          </g>
        )}

        {[...spots.values()].map((s) => {
          const on = st?.key === s.key;
          const shown = s.variants[on ? st!.idx : 0];
          const extra = on ? extraOf(shown) : null;
          const fill = mode.kind === 'place' || mode.kind === 'campaign' ? mode.color : COLORS.highlightOk;
          const tile = shown?.kind === 'mapTile' ? shown.templateId : null;
          return (
            <g key={s.key} class={`b2d-ghost ${on ? 'is-on' : ''} ${hoverKey.value?.startsWith(`${s.key}#`) ? 'is-hover' : ''}`}>
              <rect x={s.rect.x + 0.05} y={s.rect.y + 0.05} width={s.rect.w - 0.1} height={s.rect.h - 0.1} rx={0.2} fill={fill} />
              {on && shown && (shown.kind === 'restaurant' || shown.kind === 'moveRestaurant') && (
                <circle cx={shown.x + 0.3 + (CORNER[shown.entrance]?.[0] ?? 0) * 1.4} cy={shown.y + 0.3 + (CORNER[shown.entrance]?.[1] ?? 0) * 1.4} r={0.24} fill={COLORS.surface} stroke={COLORS.ink} stroke-width={0.06} />
              )}
              {extra && <rect class="b2d-ghost-extra" x={extra.x + 0.08} y={extra.y + 0.08} width={extra.w - 0.16} height={extra.h - 0.16} rx={0.15} fill={COLORS.garden} />}
              {tile && (
                <text x={s.rect.x + s.rect.w / 2} y={s.rect.y + s.rect.h / 2} class="b2d-label">
                  {tile}
                </text>
              )}
              <title>{s.variants.length > 1 ? `${s.variants.length} options` : describePlacement(s.variants[0] as Placement, v)}</title>
            </g>
          );
        })}

        {rings.map(({ id, cls }, i) => {
          const r = pieceRect(b, id);
          return r ? <rect key={`${id}-${i}`} class={`b2d-ring ${cls}`} data-ring={id} x={r.x - 0.12} y={r.y - 0.12} width={r.w + 0.24} height={r.h + 0.24} rx={0.3} /> : null;
        })}
      </svg>
    </div>
  );
}

/** Run `fn` (untracked) each time `read()` changes after the first run. Returns the disposer. */
function onBump(read: () => unknown, fn: () => void): () => void {
  let first = true;
  let last: unknown;
  return effect(() => {
    const now = read();
    if (first || now === last) {
      first = false;
      last = now;
      return;
    }
    last = now;
    untracked(fn);
  });
}

/** Used by the shell to decide whether the 2D board is needed. */
export const hasBoard = (v: GameView | null): boolean => Boolean(v && v.board.w > 0 && v.board.cells.length > 0);
