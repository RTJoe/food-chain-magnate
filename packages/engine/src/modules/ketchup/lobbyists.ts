/**
 * Lobbyists (ketchup.md §2; DLX p15–17).
 *
 * - Lobbyist (x6, entry, salary, purple, road range 2). Its action is Working sub-step "3f½"
 *   (`lobbyists`, between houses and restaurants): place 1 road tile or 1 park tile on empty map
 *   squares. Pieces are limited; when none fit or remain the lobbyist does nothing.
 * - Piece footprints are not given by the rulebook (questions.md Q-K1). Placeholders: 8 straight
 *   roads (4 of length 2, 4 of length 3), 4 parks (2 of 1x3, 2 of 2x3); any orientation.
 * - Roads: placed under construction (unusable for every route). The arrows sit at the two ends,
 *   pointing outward along the road. One arrow must point at (A) the range origin `from` — an
 *   entrance corner square of one of your open restaurants or one of your coffee shops — or (B) a
 *   road square within road distance 2 of `from`. The other may point anywhere. Each road square
 *   an arrow points at gets a roadworks marker (+1 distance for every road route, Q-K2), unless
 *   it already has one. New roads connect to every road square they touch (map.md §2).
 * - Parks: adjacent to a road square within road range 2 of `from` (same measure as campaigns).
 *   Price effect (×2, ×3 with a garden) lives in `saleRevenue` via `houseMultiplier`.
 * - Clean up: roadworks removed, roads flipped to normal roads.
 * - "First Lobbyist Used" (module milestone): the first player(s) to place a road or park add one
 *   tile chosen from the leftover tiles, orthogonally adjacent to the map, any rotation (Q-K8), not
 *   where an airplane or freeway sits beside the map. The board grows (map/grid.ts `growBoard`).
 */
import type { LobbyistPlaceMapTile, LobbyistPlacePark, LobbyistPlaceRoad, RouteStart } from '../../types/actions.js';
import type { Direction, MilestoneDef, Rotation, TileDef, TileTemplateId } from '../../types/content.js';
import type { GameModule, HookContext, SaleBreakdown } from '../../types/module.js';
import type { Cell, GameState, PlayerId } from '../../types/state.js';
import type { LegalAction, Placement } from '../../types/view.js';
import { OK, reject } from '../../core/errors.js';
import { contentFor } from '../registry.js';
import { KETCHUP_TILES } from '../../map/tiles.js';
import { allEmpty, cellAt, cellKey, dirBetween, growBoard, onMap, paint, rect, relinkRoads, sameCell, step } from '../../map/grid.js';
import { distanceField, distanceToFootprint, fieldAt, playerRouteStarts, roadAt, routeStartOrigin, routeStartRoads, type DistanceField } from '../../map/pathfinding.js';
import { awardMilestone } from '../../rules/milestones.js';
import { advanceTo, canAct, cardCheck, spend, stageCheck, stageIndex, stagesFor } from '../../rules/working/stages.js';
import type { EngineCtx } from '../../core/context.js';
import { headChoice, houseMultiplier, isRejected, kcard, moduleState, pushChoice, registerChoiceKind, resolveHead } from './shared.js';

const ID = 'ketchup:lobbyists' as const;

/** Placeholder piece stock (Q-K1). Road key = length; park key = `${short}x${long}`. */
export const ROAD_PIECES: Readonly<Record<string, number>> = { '2': 4, '3': 4 };
export const PARK_PIECES: Readonly<Record<string, number>> = { '1x3': 2, '2x3': 2 };

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

const stock = (s: GameState): LobbyistState =>
  (s.moduleState[ID] as LobbyistState | undefined) ?? { roads: { ...ROAD_PIECES }, parks: { ...PARK_PIECES } };

const sameStart = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// Roads and parks
// ---------------------------------------------------------------------------

/** Arrows of a straight road: at both ends, pointing outward along the road. */
export function roadArrows(cells: Cell[]): { from: Cell; dir: Direction }[] | null {
  if (cells.length < 2) return null;
  const d = dirBetween(cells[0] as Cell, cells[1] as Cell);
  if (!d) return null;
  for (let i = 1; i < cells.length; i++) if (dirBetween(cells[i - 1] as Cell, cells[i] as Cell) !== d) return null;
  const first = cells[0] as Cell;
  const last = cells[cells.length - 1] as Cell;
  return [
    { from: { x: first.x, y: first.y }, dir: dirBetween(cells[1] as Cell, first) as Direction },
    { from: { x: last.x, y: last.y }, dir: d },
  ];
}

function startField(s: GameState, player: PlayerId, from: RouteStart): DistanceField | string {
  if (!from || !playerRouteStarts(s.board, player).some((st) => sameStart(st, from))) return 'Range must start at an entrance of one of your open restaurants or a coffee shop';
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
  const len = String(cells.length);
  if (!(len in ROAD_PIECES)) return `Road tiles are ${Object.keys(ROAD_PIECES).join(' or ')} squares long`;
  if ((stock(s).roads[len] ?? 0) <= 0) return `No road tiles of length ${len} left`;
  const derived = roadArrows(cells);
  if (!derived) return 'A road tile is a straight line of squares';
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

const parkKey = (w: number, h: number) => `${Math.min(w, h)}x${Math.max(w, h)}`;

export function parkProblem(s: GameState, player: PlayerId, x: number, y: number, w: number, h: number, from: RouteStart, range: number, field?: DistanceField | string): string | null {
  if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1) return 'Bad park position';
  const key = parkKey(w, h);
  if (!(key in PARK_PIECES)) return `Park tiles are ${Object.keys(PARK_PIECES).join(' or ')}`;
  if ((stock(s).parks[key] ?? 0) <= 0) return `No ${key} park tiles left`;
  const cells = rect(x, y, w, h);
  if (!cells.every((c) => onMap(s.board, c))) return 'Parks go on the map';
  if (!allEmpty(s.board, cells)) return 'Parks go on empty squares';
  const f = field ?? startField(s, player, from);
  if (typeof f === 'string') return f;
  if (!(distanceToFootprint(s.board, f, cells) <= range)) return 'The park must be next to a road within road range 2 of your entrance';
  return null;
}

function lobbyistRange(s: GameState, player: PlayerId, uid: string): number {
  const card = s.players[player]?.employees[uid];
  const a = card ? contentFor(s.config.modules).employees[card.employeeId]?.ability : undefined;
  return a?.kind === 'lobbyist' ? a.range : 2;
}

function roadPlacements(s: GameState, player: PlayerId, range: number): Extract<Placement, { kind: 'lobbyistRoad' }>[] {
  const out: Extract<Placement, { kind: 'lobbyistRoad' }>[] = [];
  const seen = new Set<string>();
  const lengths = Object.keys(ROAD_PIECES).filter((k) => (stock(s).roads[k] ?? 0) > 0).map(Number);
  if (!lengths.length) return out;
  for (const from of playerRouteStarts(s.board, player)) {
    const field = distanceField(s.board, routeStartRoads(s.board, from));
    for (let y = 0; y < s.board.h; y++) {
      for (let x = 0; x < s.board.w; x++) {
        for (const len of lengths) {
          for (const [w, h] of [[len, 1], [1, len]] as [number, number][]) {
            const cells = rect(x, y, w, h);
            const k = cells.map(cellKey).join(';');
            if (seen.has(k)) continue;
            const arrows = roadArrows(cells);
            if (!arrows || roadProblem(s, player, cells, arrows, from, range, field)) continue;
            seen.add(k);
            out.push({ kind: 'lobbyistRoad', cells, arrows, from });
          }
        }
      }
    }
  }
  return out;
}

function parkPlacements(s: GameState, player: PlayerId, range: number): Extract<Placement, { kind: 'park' }>[] {
  const out: Extract<Placement, { kind: 'park' }>[] = [];
  const seen = new Set<string>();
  const shapes = Object.keys(PARK_PIECES).filter((k) => (stock(s).parks[k] ?? 0) > 0).flatMap((k) => {
    const [a, b] = k.split('x').map(Number) as [number, number];
    return a === b ? [[a, b]] : [[a, b], [b, a]];
  }) as [number, number][];
  if (!shapes.length) return out;
  for (const from of playerRouteStarts(s.board, player)) {
    const field = distanceField(s.board, routeStartRoads(s.board, from));
    for (const [w, h] of shapes) {
      for (let y = 0; y + h <= s.board.h; y++) {
        for (let x = 0; x + w <= s.board.w; x++) {
          const k = `${x},${y},${w},${h}`;
          if (seen.has(k) || parkProblem(s, player, x, y, w, h, from, range, field)) continue;
          seen.add(k);
          out.push({ kind: 'park', x, y, w, h, from });
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
    pushChoice(ctx, { kind: 'extraMapTile', player, optional: false });
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
  // Not where an airplane or freeway sits beside the map (DLX p17).
  const beside: { side: Direction; from: number; to: number }[] = [];
  if (row === -1) beside.push({ side: 'N', from: col * 5, to: col * 5 + 4 });
  if (row === b.rows) beside.push({ side: 'S', from: col * 5, to: col * 5 + 4 });
  if (col === -1) beside.push({ side: 'W', from: row * 5, to: row * 5 + 4 });
  if (col === b.cols) beside.push({ side: 'E', from: row * 5, to: row * 5 + 4 });
  for (const zone of beside) {
    for (const c of Object.values(b.campaigns)) {
      const p = c.placement;
      if (p.kind === 'airplane' && p.side === zone.side && p.offset <= zone.to && p.offset + p.width - 1 >= zone.from) return 'An airplane is in the way';
    }
    for (const e of Object.values(b.entities)) {
      if (e.kind === 'freeway' && e.side === zone.side && e.offset >= zone.from && e.offset <= zone.to) return 'A freeway is in the way';
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
      { kind: 'lobbyistRoad', name: 'Road tile', module: ID, w: 1, h: 3, limit: { scope: 'total', count: 8 }, rulesRef: 'ketchup.md §2; Q-K1' },
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
        const st = moduleState<LobbyistState>(s, ID, () => ({ roads: { ...ROAD_PIECES }, parks: { ...PARK_PIECES } }));
        const len = String(a.cells.length);
        st.roads[len] = (st.roads[len] ?? 0) - 1;
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
        const problem = parkProblem(state, a.playerId, a.x, a.y, a.w, a.h, a.from, lobbyistRange(state, a.playerId, a.cardUid));
        return problem ? reject('ILLEGAL_PLACEMENT', problem) : OK;
      },
      apply(ctx, action) {
        const a = action as LobbyistPlacePark;
        const s = ctx.state;
        advanceTo(ctx as EngineCtx, 'lobbyists');
        const st = moduleState<LobbyistState>(s, ID, () => ({ roads: { ...ROAD_PIECES }, parks: { ...PARK_PIECES } }));
        const key = parkKey(a.w, a.h);
        st.parks[key] = (st.parks[key] ?? 0) - 1;
        const id = ctx.id('entity');
        paint(s.board, rect(a.x, a.y, a.w, a.h), 'park', id);
        const entity = { kind: 'park' as const, id, x: a.x, y: a.y, w: a.w, h: a.h, printed: false };
        s.board.entities[id] = entity;
        ctx.emit({ type: 'entityPlaced', player: a.playerId, entity: { ...entity } });
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
      moduleState<LobbyistState>(ctx.state, ID, () => ({ roads: { ...ROAD_PIECES }, parks: { ...PARK_PIECES } }));
    },
    onPhaseEnter(ctx, phase) {
      // Clean up: roadworks removed, roads finished (DLX p16).
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
    saleRevenue(bd: SaleBreakdown, ctx, { house, candidate }): SaleBreakdown {
      const multiplier = houseMultiplier(ctx.state, house);
      if (multiplier === bd.multiplier) return bd;
      const lines = bd.lines.map((l) => ({ ...l, each: candidate.unitPrice * multiplier }));
      const diff = lines.reduce((a, l) => a + l.count * l.each, 0) - bd.lines.reduce((a, l) => a + l.count * l.each, 0);
      return { ...bd, multiplier, lines, total: bd.total + diff };
    },
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
