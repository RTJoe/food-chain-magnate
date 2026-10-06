/**
 * Lesson targets (dsl.ts `Target`) resolved against a view: board ids for rings and camera focus,
 * world rectangles for the spotlight, `data-tutorial` names for UI targets, plain-words
 * descriptions for screen readers. Pure; no DOM, no Three.
 */
import type { GameView, HouseId } from '@fcm/engine';
import type { Selection } from '../state/interaction.js';
import type { Target } from './dsl.js';

export interface WorldRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const isBoardTarget = (t: Target): boolean => !('ui' in t) && !('card' in t) && !('overlay' in t);

export function houseByNumber(view: GameView, n: number): HouseId | null {
  for (const h of Object.values(view.board.houses)) if (h.order === n) return h.id;
  return null;
}

/** Tile rim label ('B2': column letter, row number) of a square. */
export function tileLabelAt(x: number, y: number): string {
  return `${String.fromCharCode(65 + Math.floor(x / 5))}${Math.floor(y / 5) + 1}`;
}

function tileRC(label: string): { row: number; col: number } | null {
  const m = /^([A-Z])(\d+)$/.exec(label.trim().toUpperCase());
  if (!m) return null;
  return { col: (m[1] as string).charCodeAt(0) - 65, row: Number(m[2]) - 1 };
}

export function tileRect(label: string): WorldRect | null {
  const rc = tileRC(label);
  return rc ? { x0: rc.col * 5, z0: rc.row * 5, x1: rc.col * 5 + 5, z1: rc.row * 5 + 5 } : null;
}

export function seamRect(a: string, b: string): WorldRect | null {
  const p = tileRC(a);
  const q = tileRC(b);
  if (!p || !q) return null;
  const w = 0.3;
  if (p.row === q.row && Math.abs(p.col - q.col) === 1) {
    const x = Math.max(p.col, q.col) * 5;
    return { x0: x - w, x1: x + w, z0: p.row * 5, z1: p.row * 5 + 5 };
  }
  if (p.col === q.col && Math.abs(p.row - q.row) === 1) {
    const z = Math.max(p.row, q.row) * 5;
    return { x0: p.col * 5, x1: p.col * 5 + 5, z0: z - w, z1: z + w };
  }
  return null;
}

const cellsRect = (cells: readonly { x: number; y: number }[]): WorldRect | null => {
  if (!cells.length) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return { x0: Math.min(...xs), z0: Math.min(...ys), x1: Math.max(...xs) + 1, z1: Math.max(...ys) + 1 };
};

function sourceId(view: GameView, x: number, y: number): string | null {
  for (const s of Object.values(view.board.drinkSources)) if (s.x === x && s.y === y) return s.id;
  return null;
}

/** Board object ids a target names (houses, restaurants, campaigns, sources), for rings and focus. */
export function targetBoardIds(view: GameView, t: Target): string[] {
  if ('house' in t) {
    const id = houseByNumber(view, t.house);
    return id ? [id] : [];
  }
  if ('restaurant' in t) {
    if (view.board.restaurants[t.restaurant]) return [t.restaurant];
    return Object.values(view.board.restaurants)
      .filter((r) => r.owner === t.restaurant)
      .map((r) => r.id);
  }
  if ('campaign' in t) return view.board.campaigns[t.campaign] ? [t.campaign] : [];
  if ('source' in t) {
    const id = sourceId(view, t.source[0], t.source[1]);
    return id ? [id] : [];
  }
  return [];
}

/** World rectangles to cut out of the spotlight for a board target (one per piece). */
export function targetWorldRects(view: GameView, t: Target): WorldRect[] {
  if ('house' in t) {
    const id = houseByNumber(view, t.house);
    const h = id ? view.board.houses[id] : undefined;
    const r = h ? cellsRect(h.cells) : null;
    return r ? [r] : [];
  }
  if ('restaurant' in t) {
    return targetBoardIds(view, t).flatMap((id) => {
      const r = view.board.restaurants[id];
      return r ? [{ x0: r.x, z0: r.y, x1: r.x + 2, z1: r.y + 2 }] : [];
    });
  }
  if ('campaign' in t) {
    const c = view.board.campaigns[t.campaign];
    const p = c?.placement;
    if (p && p.kind === 'board') return [{ x0: p.x, z0: p.y, x1: p.x + p.w, z1: p.y + p.h }];
    return [];
  }
  if ('source' in t) return [{ x0: t.source[0], z0: t.source[1], x1: t.source[0] + 1, z1: t.source[1] + 1 }];
  if ('cell' in t) return [{ x0: t.cell[0], z0: t.cell[1], x1: t.cell[0] + 1, z1: t.cell[1] + 1 }];
  if ('tile' in t) {
    const r = tileRect(t.tile);
    return r ? [r] : [];
  }
  if ('seam' in t) {
    const r = seamRect(t.seam[0], t.seam[1]);
    return r ? [r] : [];
  }
  return [];
}

/** `data-tutorial` names that may render a UI target (first match in the DOM wins). */
export function targetUiNames(t: Target): string[] {
  if ('ui' in t) return [t.ui];
  if ('card' in t) {
    const out: string[] = [];
    if (t.card.uid) out.push(`work-card-${t.card.uid}`, `org-card-${t.card.uid}`, `fire-${t.card.uid}`);
    if (t.card.employeeId) out.push(`hand-card-${t.card.employeeId}`, `hire-${t.card.employeeId}`);
    return out;
  }
  return [];
}

/** Whether a board selection is (one of) the target's pieces. */
export function selectionMatches(view: GameView, t: Target, sel: Selection | null): boolean {
  if (!sel) return false;
  return targetBoardIds(view, t).includes(sel.id);
}

/** Selection a tap on a board target produces (the first piece), or null. */
export function selectionFor(view: GameView, t: Target): Selection | null {
  const id = targetBoardIds(view, t)[0];
  if (!id) return null;
  if (view.board.houses[id]) return { kind: 'house', id };
  if (view.board.restaurants[id]) return { kind: 'restaurant', id };
  if (view.board.campaigns[id]) return { kind: 'campaign', id };
  if (view.board.drinkSources[id]) return { kind: 'source', id };
  return null;
}

const FOOD_WORD: Record<string, string> = { soft_drink: 'soda' };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Plain words for a target (aria descriptions): "House 18, tile A2, demand 2 burgers". */
export function describeTarget(view: GameView, t: Target): string {
  if ('house' in t) {
    const id = houseByNumber(view, t.house);
    const h = id ? view.board.houses[id] : undefined;
    if (!h) return `House ${t.house}`;
    const c = h.cells[0];
    const counts = new Map<string, number>();
    for (const d of h.demand) counts.set(d.good, (counts.get(d.good) ?? 0) + 1);
    const demand = counts.size ? [...counts].map(([g, n]) => plural(n, FOOD_WORD[g] ?? g)).join(', ') : 'no demand';
    return `House ${t.house}, tile ${c ? tileLabelAt(c.x, c.y) : '?'}, ${demand}`;
  }
  if ('restaurant' in t) {
    const ids = targetBoardIds(view, t);
    const r = ids[0] ? view.board.restaurants[ids[0]] : undefined;
    const who = r ? (view.players[r.owner]?.name ?? r.owner) : t.restaurant;
    return r ? `${who}'s restaurant, tile ${tileLabelAt(r.x, r.y)}` : `${who}'s restaurant`;
  }
  if ('source' in t) {
    const id = sourceId(view, t.source[0], t.source[1]);
    const s = id ? view.board.drinkSources[id] : undefined;
    const kind = s ? (FOOD_WORD[s.drink] ?? s.drink) : 'drink';
    return `The ${kind} source on tile ${tileLabelAt(t.source[0], t.source[1])}`;
  }
  if ('campaign' in t) return `Campaign ${t.campaign}`;
  if ('cell' in t) return `Square ${t.cell[0]}, ${t.cell[1]} on tile ${tileLabelAt(t.cell[0], t.cell[1])}`;
  if ('tile' in t) return `Tile ${t.tile}`;
  if ('seam' in t) return `The border between tiles ${t.seam[0]} and ${t.seam[1]}`;
  if ('ui' in t) return t.ui;
  if ('card' in t) return t.card.employeeId ?? t.card.uid ?? 'card';
  return 'overlay';
}
