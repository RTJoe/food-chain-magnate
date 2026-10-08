/**
 * Board ↔ world coordinates (docs/visual-style.md "Scale and units").
 * Square (x, y) covers world [x, x+1] × [y, y+1] on the ground plane: +x east, +z south, +y up.
 */
import type { Cell, Corner, Direction } from '@fcm/engine';

export const ROAD_TOP = 0.03;
/** Distance from the board edge to the centre line of the airplane strip. */
export const AIR_STRIP = 1.7;
export const RIM = 2.6;

export const cellCenter = (x: number, y: number): [number, number] => [x + 0.5, y + 0.5];

/** Rotation about +y that turns a mini's canonical front (+z, south) to face `d`. */
export function dirAngle(d: Direction): number {
  switch (d) {
    case 'S':
      return 0;
    case 'E':
      return Math.PI / 2;
    case 'N':
      return Math.PI;
    case 'W':
      return -Math.PI / 2;
  }
}

/** Rotation that turns a 2x2 mini built with its entrance at SE to the given corner. */
export function cornerAngle(c: Corner): number {
  switch (c) {
    case 'SE':
      return 0;
    case 'NE':
      return Math.PI / 2;
    case 'NW':
      return Math.PI;
    case 'SW':
      return -Math.PI / 2;
  }
}

export const DIRS: readonly Direction[] = ['N', 'E', 'S', 'W'];
export const DELTA: Record<Direction, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Bounding rectangle of a list of cells. */
export function cellsRect(cells: readonly Cell[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** World-space centre (x, z) of an airplane strip or freeway beside board edge `side`. */
export function edgeStrip(
  side: Direction,
  offset: number,
  width: number,
  boardW: number,
  boardH: number,
  dist = AIR_STRIP,
): { x: number; z: number; along: 'x' | 'z'; angle: number } {
  const mid = offset + width / 2;
  switch (side) {
    case 'N':
      return { x: mid, z: -dist, along: 'x', angle: Math.PI };
    case 'S':
      return { x: mid, z: boardH + dist, along: 'x', angle: 0 };
    case 'W':
      return { x: -dist, z: mid, along: 'z', angle: -Math.PI / 2 };
    case 'E':
      return { x: boardW + dist, z: mid, along: 'z', angle: Math.PI / 2 };
  }
}

/** Small deterministic hash in [0, 1) for decoration and colour jitter. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // murmur3 fmix32: FNV leaves the top bits nearly equal for ids that differ in the last digit
  // ("house-30", "house-36"), so `hashStr(id) * n` picked the same variant for every house.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
