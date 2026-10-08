/**
 * Lobbyists (ketchup.md §2; DLX p15–17).
 *
 * - Lobbyist (x6, entry, salary, purple, road range 2). Its action is Working sub-step "3f½"
 *   (`lobbyists`, between houses and restaurants): place 1 road tile or 1 park tile on empty map
 *   squares. Pieces are limited; when none fit or remain the lobbyist does nothing.
 * - Pieces (questions.md Q-K1; KX p15 component photo, piece split from the licensed
 *   OnlineBoardGamers implementation): 8 road tiles = 4 straight 2-square, 2 straight 4-square,
 *   2 corner 3-square (an L with two 2-square arms); 4 park tiles = tetrominoes I, T, L, L,
 *   double-sided (KX p15), so mirrored shapes are allowed. Any rotation.
 * - Roads: placed under construction (unusable for every route). The arrows sit at the two free
 *   ends, pointing outward along the road. One arrow must point at (A) the range origin `from` — an
 *   entrance corner square of one of your open restaurants or one of your coffee shops — or (B) a
 *   road square within road distance 2 of `from`. The other may point anywhere. Each road square
 *   an arrow points at gets a roadworks marker (+1 distance for every road route, Q-K2), unless
 *   it already has one. New roads connect to every road square they touch (map.md §2).
 * - Parks: adjacent to a road square within road range 2 of `from` (same measure as campaigns).
 *   Price effect (×2, ×3 with a garden) lives in `saleRevenue` (shared `parkSaleRevenue`; New Districts applies it without Lobbyists).
 * - Cleanup: roadworks removed, roads flipped to normal roads.
 * - "First Lobbyist Used" (module milestone): the first player(s) to place a road or park add one
 *   tile chosen from the leftover tiles, orthogonally adjacent to the map, any rotation (Q-K8), not
 *   where an airplane or freeway sits beside the map. The board grows (map/grid.ts `growBoard`).
 */
import type { LobbyistPlaceMapTile, LobbyistPlacePark, LobbyistPlaceRoad, RouteStart } from '../../types/actions.js';
import type { Direction, MilestoneDef, Rotation, TileDef, TileTemplateId } from '../../types/content.js';
import type { GameModule, HookContext } from '../../types/module.js';
import type { Cell, GameState, PlayerId } from '../../types/state.js';
import type { LegalAction, Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { contentFor } from '../registry.js';
import { KETCHUP_TILES } from '../../map/tiles.js';
import { allEmpty, cellAt, cellKey, dirBetween, growBoard, onMap, opposite, paint, rect, relinkRoads, sameCell, step } from '../../map/grid.js';
import { distanceField, distanceToFootprint, fieldAt, playerRouteStarts, roadAt, routeStartOrigin, routeStartRoads, type DistanceField, sameRouteStart } from '../../map/pathfinding.js';
import { awardMilestone } from '../../rules/milestones.js';
import { advanceTo, canAct, cardCheck, spend, stageCheck, stageIndex, stagesFor } from '../../rules/working/stages.js';
import type { EngineCtx } from '../../core/context.js';
import { headChoice, isRejected, parkSaleRevenue, kcard, moduleState, pushChoice, registerChoiceKind, resolveHead } from './shared.js';

const ID = 'ketchup:lobbyists' as const;

/** Road tile stock (Q-K1): '2' / '4' straight, 'L3' corner (3 squares, arms of 2). */
export const ROAD_PIECES: Readonly<Record<string, number>> = { '2': 4, '4': 2, L3: 2 };
/** Park tile stock (Q-K1): tetrominoes; double-sided, so L covers its mirror image. */
export const PARK_PIECES: Readonly<Record<string, number>> = { I: 1, T: 1, L: 2 };
const PARK_SHAPES: Readonly<Record<string, readonly [number, number][]>> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [1, 0], [2, 0], [2, 1]],
};
const PIECE_NAMES: Readonly<Record<string, string>> = { '2': '2-square road', '4': '4-square road', L3: 'corner road', I: 'I park', T: 'T park', L: 'L park' };

interface LobbyistState {
  roads: Record<string, number>;
  parks: Record<string, number>;
}

const FIRST_LOBBYIST: MilestoneDef = {
  id: 'ketchup:first_lobbyist_used',
  name: 'First lobbyist used',
  module: ID,
  trigger: { kind: 'used', employees: ['ketchup:lobbyist'] },
  effects: [{ kind: 'extraMapTile' }],
  timing: 'immediately',
  text: 'Place one extra map tile chosen from the leftover tiles next to the map.',
  rulesRef: 'ketchup.md §2; DLX p17',
};

const freshStock = (): LobbyistState => ({ roads: { ...ROAD_PIECES }, parks: { ...PARK_PIECES } });

/** Fill piece keys a game saved with the old placeholder stock does not have (in place). */
function withAllPieces(st: LobbyistState): LobbyistState {
  for (const [k, n] of Object.entries(ROAD_PIECES)) if (st.roads[k] === undefined) st.roads[k] = n;
  for (const [k, n] of Object.entries(PARK_PIECES)) if (st.parks[k] === undefined) st.parks[k] = n;
  return st;
}

const stock = (s: GameState): LobbyistState => {
  const st = s.moduleState[ID] as LobbyistState | undefined;
  return st ? withAllPieces({ roads: { ...st.roads }, parks: { ...st.parks } }) : freshStock();
};
const liveStock = (s: GameState): LobbyistState => withAllPieces(moduleState<LobbyistState>(s, ID, freshStock));


// ---------------------------------------------------------------------------
// Roads and parks
// ---------------------------------------------------------------------------

/**
 * The road tile a path of squares is: '2' / '4' straight, 'L3' corner (end, corner, end), or null.
 * Squares must be given in path order.
 */
export function roadPiece(cells: Cell[]): string | null {
  if (!Array.isArray(cells) || cells.length < 2) return null;
  const dirs: Direction[] = [];
  for (let i = 1; i < cells.length; i++) {
    const d = dirBetween(cells[i - 1] as Cell, cells[i] as Cell);
    if (!d) return null;
    dirs.push(d);
  }
  if (dirs.every((d) => d === dirs[0])) return String(cells.length) in ROAD_PIECES ? String(cells.length) : null;
  return cells.length === 3 && dirs[1] !== opposite(dirs[0] as Direction) ? 'L3' : null;
}

/** Arrows of a road tile: at its two free ends, pointing outward. Null if the squares are not a path. */
export function roadArrows(cells: Cell[]): { from: Cell; dir: Direction }[] | null {
  if (!Array.isArray(cells) || cells.length < 2) return null;
  for (let i = 1; i < cells.length; i++) if (!dirBetween(cells[i - 1] as Cell, cells[i] as Cell)) return null;
  if (new Set(cells.map(cellKey)).size !== cells.length) return null;
  const first = cells[0] as Cell;
  const last = cells[cells.length - 1] as Cell;
  return [
    { from: { x: first.x, y: first.y }, dir: dirBetween(cells[1] as Cell, first) as Direction },
    { from: { x: last.x, y: last.y }, dir: dirBetween(cells[cells.length - 2] as Cell, last) as Direction },
  ];
}

function startField(s: GameState, player: PlayerId, from: RouteStart): DistanceField | string {
  if (!from || !playerRouteStarts(s.board, player).some((st) => sameRouteStart(st, from))) return 'Range must start at an entrance of one of your open restaurants or a coffee shop';
  return distanceField(s.board, routeStartRoads(s.board, from));
}

/** Arrow target satisfies rule A (the origin square) or B (road within road distance `range`). */
function arrowAnchors(s: GameState, target: Cell, from: RouteStart, field: DistanceField, range: number): boolean {
  const origin = routeStartOrigin(s.board, from);
  if (origin && sameCell(origin, target)) return true;
  return Boolean(roadAt(s.board, target)) && fieldAt(field, target) <= range;
}

export function roadProblem(s: GameState, player: PlayerId, cells: Cell[], arrows: { from: Cell; dir: Direction }[], from: RouteStart, range: number, field?: DistanceField | string): string | null {
  if (!Array.isArray(cells) || !cells.every((c) => c && Number.isInteger(c.x) && Number.isInteger(c.y))) return 'Bad road squares';
  const piece = roadPiece(cells);
  const derived = roadArrows(cells);
  if (!piece || !derived) return 'Road tiles are straight 2 or 4 squares, or a 3-square corner';
  if ((stock(s).roads[piece] ?? 0) <= 0) return `No ${PIECE_NAMES[piece] ?? piece} tiles left`;
  if (!cells.every((c) => onMap(s.board, c))) return 'Roads may not hang off the map';
  if (!allEmpty(s.board, cells)) return 'Roads go on empty squares';
  const key = (a: { from: Cell; dir: Direction }) => `${cellKey(a.from)}:${a.dir}`;
  if (!Array.isArray(arrows) || arrows.length !== 2 || new Set(arrows.map(key)).size !== 2 || !arrows.every((a) => derived.some((d) => key(d) === key(a)))) {
    return 'The arrows are at the two ends of the road, pointing outward';
  }
  const f = field ?? startField(s, player, from);
  if (typeof f === 'string') return f;
  if (!derived.some((a) => arrowAnchors(s, step(a.from, a.dir), from, f, range))) {
    return 'One arrow must point at your entrance or at a road within road range 2 of it';
  }
  return null;
}

const normalise = (cells: readonly (readonly [number, number])[]): [number, number][] => {
  const mx = Math.min(...cells.map(([x]) => x));
  const my = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const shapeKey = (cells: readonly (readonly [number, number])[]) => normalise(cells).map(([x, y]) => `${x},${y}`).join(';');

/** Every orientation of a park tile (4 rotations, both sides), normalised to (0,0), deduplicated. */
function parkOrientations(piece: string): [number, number][][] {
  const base = PARK_SHAPES[piece];
  if (!base) return [];
  const out = new Map<string, [number, number][]>();
  for (const flip of [false, true]) {
    let cur: [number, number][] = base.map(([x, y]) => [flip ? -x : x, y]);
    for (let r = 0; r < 4; r++) {
      out.set(shapeKey(cur), normalise(cur));
      cur = cur.map(([x, y]) => [-y, x]);
    }
  }
  return [...out.values()];
}

/** The park tile `cells` form (any rotation or side), or null. */
export function parkPiece(cells: Cell[]): string | null {
  if (!Array.isArray(cells) || !cells.length || !cells.every((c) => c && Number.isInteger(c.x) && Number.isInteger(c.y))) return null;
  if (new Set(cells.map(cellKey)).size !== cells.length) return null;
  const key = shapeKey(cells.map((c) => [c.x, c.y]));
  return Object.keys(PARK_SHAPES).find((p) => parkOrientations(p).some((o) => shapeKey(o) === key)) ?? null;
}

const bbox = (cells: Cell[]) => {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
};

export function parkProblem(s: GameState, player: PlayerId, cells: Cell[], from: RouteStart, range: number, field?: DistanceField | string): string | null {
  const piece = parkPiece(cells);
  if (!piece) return 'Park tiles are I, T and L shapes of 4 squares';
  if ((stock(s).parks[piece] ?? 0) <= 0) return `No ${PIECE_NAMES[piece] ?? piece} tiles left`;
  if (!cells.every((c) => onMap(s.board, c))) return 'Parks go on the map';
  if (!allEmpty(s.board, cells)) return 'Parks go on empty squares';
  const f = field ?? startField(s, player, from);
  if (typeof f === 'string') return f;
  if (!(distanceToFootprint(s.board, f, cells) <= range)) return 'The park must be next to a road within road range 2 of your entrance';
  return null;
}

/** The park squares of an action: its `cells`, else the first legal piece orientation filling its box. */
function actionParkCells(s: GameState, a: LobbyistPlacePark, range: number): { cells: Cell[] } | { problem: string } {
  if (a.cells !== undefined) {
    if (!Array.isArray(a.cells)) return { problem: 'Bad park squares' };
    const cells = a.cells.map((c) => ({ x: c?.x, y: c?.y }) as Cell);
    return { cells };
  }
  if (![a.x, a.y, a.w, a.h].every(Number.isInteger)) return { problem: 'Bad park position' };
  let first: string | null = null;
  for (const piece of Object.keys(PARK_SHAPES)) {
    for (const o of parkOrientations(piece)) {
      const cells = o.map(([dx, dy]) => ({ x: a.x + dx, y: a.y + dy }));
      const b = bbox(cells);
      if (b.w !== a.w || b.h !== a.h) continue;
      const problem = parkProblem(s, a.playerId, cells, a.from, range);
      if (!problem) return { cells };
      first ??= problem;
    }
  }
  return { problem: first ?? 'Park tiles are I, T and L shapes of 4 squares' };
}

function lobbyistRange(s: GameState, player: PlayerId, uid: string): number {
  const card = s.players[player]?.employees[uid];
  const a = card ? contentFor(s.config.modules).employees[card.employeeId]?.ability : undefined;
  return a?.kind === 'lobbyist' ? a.range : 2;
}

/** Every road tile footprint anchored at (x, y), in path order. */
function roadShapesAt(x: number, y: number, pieces: string[]): Cell[][] {
  const out: Cell[][] = [];
  for (const piece of pieces) {
    if (piece === 'L3') {
      // Corner at (x, y), arms turning through it: end, corner, end.
      const corner = { x, y };
      for (const [a, b] of [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']] as [Direction, Direction][]) out.push([step(corner, a), corner, step(corner, b)]);
    } else {
      const len = Number(piece);
      out.push(rect(x, y, len, 1), rect(x, y, 1, len));
    }
  }
  return out;
}

function roadPlacements(s: GameState, player: PlayerId, range: number): Extract<Placement, { kind: 'lobbyistRoad' }>[] {
  const out: Extract<Placement, { kind: 'lobbyistRoad' }>[] = [];
  const seen = new Set<string>();
  const pieces = Object.keys(ROAD_PIECES).filter((k) => (stock(s).roads[k] ?? 0) > 0);
  if (!pieces.length) return out;
  for (const from of playerRouteStarts(s.board, player)) {
    const field = distanceField(s.board, routeStartRoads(s.board, from));
    for (let y = 0; y < s.board.h; y++) {
      for (let x = 0; x < s.board.w; x++) {
        for (const cells of roadShapesAt(x, y, pieces)) {
          const k = cells.map(cellKey).sort().join(';');
          if (seen.has(k)) continue;
          const arrows = roadArrows(cells);
          if (!arrows || roadProblem(s, player, cells, arrows, from, range, field)) continue;
          seen.add(k);
          out.push({ kind: 'lobbyistRoad', cells, arrows, from, piece: roadPiece(cells) ?? undefined });
        }
      }
    }
  }
  return out;
}

function parkPlacements(s: GameState, player: PlayerId, range: number): Extract<Placement, { kind: 'park' }>[] {
  const out: Extract<Placement, { kind: 'park' }>[] = [];
  const seen = new Set<string>();
  const shapes = Object.keys(PARK_PIECES)
    .filter((k) => (stock(s).parks[k] ?? 0) > 0)
    .flatMap((piece) => parkOrientations(piece).map((o) => ({ piece, o })));
  if (!shapes.length) return out;
  for (const from of playerRouteStarts(s.board, player)) {
    const field = distanceField(s.board, routeStartRoads(s.board, from));
    for (const { piece, o } of shapes) {
      for (let y = 0; y < s.board.h; y++) {
        for (let x = 0; x < s.board.w; x++) {
          const cells = o.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
          const k = cells.map(cellKey).join(';');
          if (seen.has(k) || parkProblem(s, player, cells, from, range, field)) continue;
          seen.add(k);
          out.push({ kind: 'park', ...bbox(cells), cells, piece, from });
        }
      }
    }
  }
  return out;
}

function lobbyistCheck(s: GameState, player: PlayerId, uid: string) {
  return cardCheck(s, player, uid, ['lobbyist'], 'lobbyists');
}

function afterUse(ctx: HookContext, player: PlayerId): void {
  if (awardMilestone(ctx, player, 'ketchup:first_lobbyist_used') && ctx.state.tilePool.length) {
    pushChoice(ctx, { kind: 'extraMapTile', player, optional: true }); // KX p17 "allows you to" (Q-K36)
  }
}

// ---------------------------------------------------------------------------
// Extra map tile
// ---------------------------------------------------------------------------

/** Why a leftover tile cannot go at grid (row, col) (null = legal). */
export function mapTileProblem(s: GameState, row: number, col: number, rotation: Rotation, templateId: TileTemplateId | undefined): string | null {
  const b = s.board;
  if (![row, col].every(Number.isInteger) || ![0, 1, 2, 3].includes(rotation)) return 'Bad tile position';
  const t = templateId ?? s.tilePool[0];
  if (!t || !s.tilePool.includes(t)) return 'That tile is not among the leftover tiles';
  if (row < -1 || col < -1 || row > b.rows || col > b.cols) return 'The tile must be next to the map';
  const taken = new Set(b.tiles.map((x) => `${x.row},${x.col}`));
  if (taken.has(`${row},${col}`)) return 'There is already a tile there';
  if (![[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].some(([r, c]) => taken.has(`${r},${c}`))) return 'The tile must be orthogonally adjacent to the map';
  // KX p17: not against the edge of a map tile that has an airplane or freeway aligned with any
  // part of it. Checked per neighbouring tile, so it also holds once the board is no rectangle.
  const S = b.tileSize;
  const DELTA: Record<Direction, [number, number]> = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };
  // The first map square in from board side `side` along line `i` (column for N/S, row for E/W).
  const firstOnMap = (side: Direction, i: number): Cell | null => {
    const len = side === 'N' || side === 'S' ? b.h : b.w;
    for (let k = 0; k < len; k++) {
      const c = side === 'N' ? { x: i, y: k } : side === 'S' ? { x: i, y: b.h - 1 - k } : side === 'W' ? { x: k, y: i } : { x: b.w - 1 - k, y: i };
      if (onMap(b, c)) return c;
    }
    return null;
  };
  const inTile = (c: Cell | null, tr: number, tc: number) => Boolean(c && Math.floor(c.y / S) === tr && Math.floor(c.x / S) === tc);
  for (const d of ['N', 'S', 'W', 'E'] as Direction[]) {
    const [dr, dc] = DELTA[d];
    const tr = row + dr;
    const tc = col + dc;
    if (!taken.has(`${tr},${tc}`)) continue;
    const side = opposite(d); // the neighbour's edge that faces the new tile
    const from = side === 'N' || side === 'S' ? tc * S : tr * S;
    const to = from + S - 1;
    // Lines of that edge on which the neighbour is the outermost tile (nothing between it and the side).
    const exposed = (i: number) => i >= from && i <= to && inTile(firstOnMap(side, i), tr, tc);
    for (const c of Object.values(b.campaigns)) {
      const p = c.placement;
      if (p.kind !== 'airplane' || p.side !== side) continue;
      for (let i = p.offset; i < p.offset + p.width; i++) if (exposed(i)) return 'An airplane is in the way';
    }
    for (const e of Object.values(b.entities)) {
      // A lengthwise freeway (rules v4) lies along 3 lines of the edge, end-on along 1.
      if (e.kind === 'freeway' && e.side === side && [0, 1, 2].slice(0, e.lengthwise ? 3 : 1).some((k) => exposed(e.offset + k))) return 'A freeway is in the way';
    }
  }
  return null;
}

export function mapTilePlacements(s: GameState): Extract<Placement, { kind: 'mapTile' }>[] {
  // Every leftover tile may be chosen (DLX p17), at every legal position and rotation.
  const out: Extract<Placement, { kind: 'mapTile' }>[] = [];
  for (const templateId of s.tilePool) {
    for (let row = -1; row <= s.board.rows; row++) {
      for (let col = -1; col <= s.board.cols; col++) {
        for (const rotation of [0, 1, 2, 3] as Rotation[]) if (!mapTileProblem(s, row, col, rotation, templateId)) out.push({ kind: 'mapTile', row, col, rotation, templateId });
      }
    }
  }
  return out;
}

registerChoiceKind('extraMapTile', (s) => s.tilePool.length > 0 && mapTilePlacements(s).length > 0);

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const LOBBYISTS_MODULE: GameModule = {
  id: ID,
  name: 'Lobbyists',
  description: 'Lobbyists build roads (with roadworks) and parks; parks raise prices.',
  content: {
    employees: [
      kcard('ketchup:lobbyist', 'Lobbyist', ID, 6, 'purple', 'lobbying', { kind: 'lobbyist', range: 2 }, 'Place 1 road or park tile. Road range 2.', 'employees.md §2; ketchup.md §2', {
        entry: true,
        salary: true,
      }),
    ],
    // Tile Z (two printed parks) is a Lobbyists component (ketchup.md §1–2).
    tiles: KETCHUP_TILES.filter((t) => t.id === 'Z'),
    milestones: [FIRST_LOBBYIST],
    entities: [
      { kind: 'lobbyistRoad', name: 'Road tile', module: ID, w: 1, h: 4, limit: { scope: 'total', count: 8 }, rulesRef: 'ketchup.md §2; Q-K1' },
      { kind: 'park', name: 'Park tile', module: ID, w: 2, h: 3, limit: { scope: 'total', count: 4 }, rulesRef: 'ketchup.md §2; Q-K1' },
      { kind: 'roadworks', name: 'Roadworks', module: ID, w: 1, h: 1, limit: { scope: 'total', count: 8 }, rulesRef: 'ketchup.md §2' },
    ],
  },
  actions: {
    'ketchup:lobbyists.placeRoad': {
      validate(state, action) {
        const a = action as LobbyistPlaceRoad;
        const c = lobbyistCheck(state, a.playerId, a.cardUid);
        if (!c.ok) return c;
        const problem = roadProblem(state, a.playerId, a.cells, a.arrows, a.from, lobbyistRange(state, a.playerId, a.cardUid));
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as LobbyistPlaceRoad;
        const s = ctx.state;
        advanceTo(ctx as EngineCtx, 'lobbyists');
        const st = liveStock(s);
        const piece = roadPiece(a.cells) as string;
        st.roads[piece] = (st.roads[piece] ?? 0) - 1;
        const id = ctx.id('entity');
        const cells = a.cells.map((c) => ({ x: c.x, y: c.y }));
        const arrows = roadArrows(cells) ?? [];
        paint(s.board, cells, 'road', id);
        for (const c of cells) {
          const cell = cellAt(s.board, c);
          if (cell) cell.road = { links: [], bridge: false, underConstruction: true, roadworks: 0, lobbyistRoad: id };
        }
        const entity = { kind: 'lobbyistRoad' as const, id, owner: a.playerId, cells, underConstruction: true, arrows };
        s.board.entities[id] = entity;
        ctx.emit({ type: 'entityPlaced', player: a.playerId, entity: JSON.parse(JSON.stringify(entity)) as typeof entity });
        for (const arrow of arrows) {
          const t = step(arrow.from, arrow.dir);
          const road = roadAt(s.board, t);
          if (!road) continue;
          if (Object.values(s.board.entities).some((e) => e.kind === 'roadworks' && e.x === t.x && e.y === t.y)) continue;
          const rid = ctx.id('entity');
          const rw = { kind: 'roadworks' as const, id: rid, x: t.x, y: t.y, road: id };
          s.board.entities[rid] = rw;
          road.roadworks += 1;
          ctx.emit({ type: 'entityPlaced', player: a.playerId, entity: { ...rw } });
        }
        relinkRoads(s.board);
        spend(ctx as EngineCtx, a.cardUid);
        afterUse(ctx, a.playerId);
        return { undoable: true };
      },
    },
    'ketchup:lobbyists.placePark': {
      validate(state, action) {
        const a = action as LobbyistPlacePark;
        const c = lobbyistCheck(state, a.playerId, a.cardUid);
        if (!c.ok) return c;
        const range = lobbyistRange(state, a.playerId, a.cardUid);
        const park = actionParkCells(state, a, range);
        const problem = 'problem' in park ? park.problem : parkProblem(state, a.playerId, park.cells, a.from, range);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as LobbyistPlacePark;
        const s = ctx.state;
        advanceTo(ctx as EngineCtx, 'lobbyists');
        const park = actionParkCells(s, a, lobbyistRange(s, a.playerId, a.cardUid));
        if ('problem' in park) return { undoable: true };
        const cells = park.cells.map((c) => ({ x: c.x, y: c.y }));
        const st = liveStock(s);
        const piece = parkPiece(cells) as string;
        st.parks[piece] = (st.parks[piece] ?? 0) - 1;
        const id = ctx.id('entity');
        paint(s.board, cells, 'park', id);
        const entity = { kind: 'park' as const, id, ...bbox(cells), printed: false, cells };
        s.board.entities[id] = entity;
        ctx.emit({ type: 'entityPlaced', player: a.playerId, entity: JSON.parse(JSON.stringify(entity)) as typeof entity });
        spend(ctx as EngineCtx, a.cardUid);
        afterUse(ctx, a.playerId);
        return { undoable: true };
      },
    },
    'ketchup:lobbyists.placeMapTile': {
      validate(state, action) {
        const a = action as LobbyistPlaceMapTile;
        const head = headChoice(state, a.playerId, a.choiceId, 'extraMapTile');
        if (isRejected(head)) return head;
        const problem = mapTileProblem(state, a.row, a.col, a.rotation, a.templateId);
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as LobbyistPlaceMapTile;
        const s = ctx.state;
        const templateId = a.templateId ?? (s.tilePool[0] as TileTemplateId);
        const def = contentFor(s.config.modules).tiles[templateId] as TileDef;
        s.tilePool = s.tilePool.filter((t) => t !== templateId);
        const ids = { nextId: s.nextId };
        const at = growBoard(s.board, def, a.row, a.col, a.rotation, ids);
        s.nextId = ids.nextId;
        ctx.emit({ type: 'mapTileAdded', player: a.playerId, templateId, row: at.row, col: at.col, rotation: a.rotation });
        resolveHead(ctx, a.choiceId);
        return { undoable: true };
      },
    },
  },
  hooks: {
    onCreateGame(ctx) {
      moduleState<LobbyistState>(ctx.state, ID, freshStock);
    },
    onPhaseEnter(ctx, phase) {
      // Cleanup: roadworks removed, roads finished (DLX p16).
      if (phase.kind !== 'cleanup') return;
      const s = ctx.state;
      let changed = false;
      for (const e of Object.values(s.board.entities)) {
        if (e.kind === 'roadworks') {
          const road = cellAt(s.board, e)?.road;
          if (road) road.roadworks = Math.max(0, road.roadworks - 1);
          delete s.board.entities[e.id];
          ctx.emit({ type: 'entityRemoved', entityId: e.id, kind: e.kind });
        } else if (e.kind === 'lobbyistRoad' && e.underConstruction) {
          e.underConstruction = false;
          for (const c of e.cells) {
            const road = cellAt(s.board, c)?.road;
            if (road) road.underConstruction = false;
          }
          changed = true;
          ctx.emit({ type: 'entityPlaced', player: e.owner, entity: JSON.parse(JSON.stringify(e)) as typeof e });
        }
      }
      if (changed) relinkRoads(s.board);
    },
    saleRevenue: parkSaleRevenue,
    legalActions(list, ctx, { player }) {
      const s = ctx.state;
      const head = s.pending[0];
      if (head) {
        if (head.kind !== 'extraMapTile' || head.player !== player) return list;
        return [...list, { kind: 'placement', label: 'Place the extra map tile', actionType: 'ketchup:lobbyists.placeMapTile', spec: { kind: 'mapTile', choiceId: head.id } }];
      }
      const turn = s.turn;
      if (s.phase.kind !== 'working' || !turn || turn.player !== player) return list;
      const p = s.players[player];
      if (!p) return list;
      const stages = stagesFor(s, player);
      if (stageIndex(stages, turn.stage) > stageIndex(stages, 'lobbyists') || !stageCheck(s, turn, 'lobbyists').ok) return list;
      const extra: LegalAction[] = [];
      const st = stock(s);
      for (const [uid, left] of Object.entries(turn.uses)) {
        if (left <= 0 || !canAct(p, turn, uid) || !lobbyistCheck(s, player, uid).ok) continue;
        if (Object.values(st.roads).some((n) => n > 0)) extra.push({ kind: 'placement', label: 'Lobbyist: build a road', actionType: 'ketchup:lobbyists.placeRoad', cardUid: uid, spec: { kind: 'lobbyistRoad', cardUid: uid } });
        if (Object.values(st.parks).some((n) => n > 0)) extra.push({ kind: 'placement', label: 'Lobbyist: lay out a park', actionType: 'ketchup:lobbyists.placePark', cardUid: uid, spec: { kind: 'park', cardUid: uid } });
      }
      return [...list, ...extra];
    },
    legalPlacements(list, ctx, { player, spec }) {
      const s = ctx.state;
      if (spec.kind === 'mapTile') {
        const head = s.pending[0];
        return head?.kind === 'extraMapTile' && head.player === player ? [...list, ...mapTilePlacements(s)] : list;
      }
      if ((spec.kind !== 'lobbyistRoad' && spec.kind !== 'park') || !spec.cardUid || !lobbyistCheck(s, player, spec.cardUid).ok) return list;
      const range = lobbyistRange(s, player, spec.cardUid);
      return [...list, ...(spec.kind === 'park' ? parkPlacements(s, player, range) : roadPlacements(s, player, range))];
    },
  },
};
