/**
 * Canvas-drawn prints for the map tiles (docs/art-bible.md §5): the off-white tile ground with
 * speckles, smudges, a faint square grid and a bevelled edge; road squares (asphalt with
 * lengthwise streaks and yellow kerb lines, one texture per shape); the printed plates under the
 * minis (house, garden, park, apartment, drink suppliers) as one atlas; the wood table.
 * Drawn once per page and cached (they do not depend on the board).
 */
import * as THREE from 'three';
import { BOARD } from '../../boardPalette.js';

/** Seeded 0..1 random (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 8;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

const rgba = (hex: string, a: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------------------------------------------------------------------------
// Tile ground
// ---------------------------------------------------------------------------

/**
 * One 5x5 map tile print, `px` texels square. Every tile uses it, turned and mirrored per tile
 * (ground.ts) so the speckles do not repeat visibly.
 */
export function groundTileTexture(px = 1024): THREE.CanvasTexture {
  return cached(`ground:${px}`, () => {
    const [c, g] = canvas(px, px);
    const s = px / 5;
    const r = rng(9);
    g.fillStyle = BOARD.ground;
    g.fillRect(0, 0, px, px);
    // Faint smudges (large soft ellipses, ~3 % ink), as the printed card has.
    for (let i = 0; i < 9; i++) {
      const x = r() * px;
      const y = r() * px;
      const rad = (0.5 + r() * 1.3) * s;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, rgba('#3a352c', 0.035 + r() * 0.02));
      gr.addColorStop(1, rgba('#3a352c', 0));
      g.fillStyle = gr;
      g.save();
      g.translate(x, y);
      g.scale(1, 0.5 + r() * 0.6);
      g.translate(-x, -y);
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      g.restore();
    }
    // Speckles: 1-2 px dots, plus a few small grey flecks and scratches.
    const dot = Math.max(1, px / 400);
    g.fillStyle = BOARD.speck;
    for (let i = 0; i < 25 * 6; i++) {
      const d = dot * (1 + r() * 1.6);
      g.fillRect(r() * px, r() * px, d, d);
    }
    g.strokeStyle = rgba('#8f8a80', 0.55);
    g.lineWidth = dot * 1.2;
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const x = r() * px;
      const y = r() * px;
      const a = r() * Math.PI * 2;
      const l = dot * (3 + r() * 5);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.6, y + Math.sin(a + 1) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
      if (r() < 0.6) {
        g.fillStyle = rgba('#8f8a80', 0.5);
        g.fillRect(x + dot * 3, y - dot * 2, dot * 1.5, dot * 1.5);
      }
    }
    // Square grid (faint 1 px print line on every square boundary).
    g.fillStyle = BOARD.grid;
    const lw = Math.max(1.5, px / 340);
    for (let i = 1; i < 5; i++) {
      g.fillRect(i * s - lw / 2, 0, lw, px);
      g.fillRect(0, i * s - lw / 2, px, lw);
    }
    // Bevel: the chamfered card edge, 0.07 squares wide, darkest at the very edge.
    const bw = 0.07 * s;
    for (const [x0, y0, x1, y1] of [
      [0, 0, 0, bw],
      [0, px, 0, px - bw],
      [0, 0, bw, 0],
      [px, 0, px - bw, 0],
    ] as const) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, BOARD.bevel);
      gr.addColorStop(0.55, rgba(BOARD.bevel, 0.6));
      gr.addColorStop(1, rgba(BOARD.bevel, 0));
      g.fillStyle = gr;
      if (x0 === x1) g.fillRect(0, Math.min(y0, y1), px, bw);
      else g.fillRect(Math.min(x0, x1), 0, bw, px);
    }
    return tex(c, { aniso: 8 });
  });
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/**
 * Canonical road square shapes (local +z = south, +x = east; an instance turned by ANG[d] puts
 * the canonical south arm on side d): end = S; straight = N+S; corner = S+E; tee = E+S+W; cross.
 */
export type RoadTexShape = 'none' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';

/** Kerb line inset from the road edge and width (squares). */
const EDGE_IN = 0.05;
const EDGE_W = 0.06;

export function roadTexture(shape: RoadTexShape, px = 256): THREE.CanvasTexture {
  return cached(`road:${shape}:${px}`, () => {
    const [c, g] = canvas(px, px);
    const r = rng(shape.length * 31 + 7);
    g.fillStyle = BOARD.road;
    g.fillRect(0, 0, px, px);
    // Soft lengthwise streaks (±4 % value): along z on end/straight, both ways (fainter) on turns
    // and junctions.
    const along = shape === 'end' || shape === 'straight';
    for (let i = 0; i < 26; i++) {
      const k = along ? 1 : 0.55;
      g.fillStyle = r() < 0.5 ? rgba(BOARD.roadLight, (0.35 + r() * 0.3) * k) : rgba(BOARD.roadDark, (0.3 + r() * 0.3) * k);
      const w = px * (0.008 + r() * 0.025);
      if (along || i % 2) g.fillRect(r() * px, -2, w, px + 4);
      else g.fillRect(-2, r() * px, px + 4, w);
    }
    // Fine grain.
    for (let i = 0; i < px * 2; i++) {
      g.fillStyle = r() < 0.5 ? rgba('#ffffff', 0.06) : rgba('#000000', 0.06);
      g.fillRect(r() * px, r() * px, 1.2, 1.2);
    }
    const u = (v: number) => v * px;
    g.fillStyle = BOARD.roadEdge;
    const h = (v0: number, u0: number, u1: number) => g.fillRect(u(u0), u(v0), u(u1 - u0), u(EDGE_W));
    const v = (u0: number, v0: number, v1: number) => g.fillRect(u(u0), u(v0), u(EDGE_W), u(v1 - v0));
    const a = EDGE_IN;
    const b = 1 - EDGE_IN - EDGE_W;
    if (shape === 'end') {
      h(a, a, 1 - a);
      v(a, a, 1);
      v(b, a, 1);
    } else if (shape === 'straight') {
      v(a, 0, 1);
      v(b, 0, 1);
    } else if (shape === 'corner') {
      h(a, a, 1);
      v(a, a, 1);
      // Inner kerb at the south-east corner.
      v(b, b, 1);
      h(b, b, 1);
    } else if (shape === 'tee') {
      h(a, 0, 1);
    } else if (shape === 'cross') {
      // Faint manhole.
      g.strokeStyle = rgba('#4a474a', 0.45);
      g.lineWidth = px * 0.012;
      g.beginPath();
      g.arc(px / 2, px / 2, px * 0.09, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = rgba('#4a474a', 0.12);
      g.fill();
    }
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Printed plates (atlas)
// ---------------------------------------------------------------------------

export type PlateKind = 'house' | 'garden' | 'park' | 'apartment' | 'beer' | 'lemonade' | 'soft_drink';

/** Atlas cell [col, row, w, h] in 256 px cells on a 1024 atlas. */
const CELLS: Record<PlateKind, [number, number, number, number]> = {
  house: [0, 0, 1, 1],
  apartment: [1, 0, 1, 1],
  park: [2, 0, 1, 1],
  garden: [0, 1, 2, 1],
  beer: [2, 1, 1, 1],
  lemonade: [3, 1, 1, 1],
  soft_drink: [3, 0, 1, 1],
};
const CELL = 256;
const ATLAS = 1024;

/** UV rectangle [u0, v0, u1, v1] of a plate in the atlas (v up). */
export function plateUV(kind: PlateKind): [number, number, number, number] {
  const [cx, cy, w, h] = CELLS[kind];
  const pad = 2 / ATLAS;
  return [(cx * CELL) / ATLAS + pad, 1 - ((cy + h) * CELL) / ATLAS + pad, ((cx + w) * CELL) / ATLAS - pad, 1 - (cy * CELL) / ATLAS - pad];
}

export function plateAtlas(): THREE.CanvasTexture {
  return cached('plates', () => {
    const [c, g] = canvas(ATLAS, ATLAS);
    const r = rng(5);
    const cell = (kind: PlateKind, draw: (w: number, h: number) => void) => {
      const [cx, cy, w, h] = CELLS[kind];
      g.save();
      g.translate(cx * CELL, cy * CELL);
      g.beginPath();
      g.rect(0, 0, w * CELL, h * CELL);
      g.clip();
      draw(w * CELL, h * CELL);
      g.restore();
    };
    const vignette = (w: number, h: number, col: string, a: number) => {
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
      gr.addColorStop(0, rgba(col, 0));
      gr.addColorStop(1, rgba(col, a));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    };
    const plate = (w: number, h: number, fill: string) => {
      g.fillStyle = fill;
      g.fillRect(0, 0, w, h);
      vignette(w, h, '#2a0f1e', 0.28);
      // Thin light print border, as the cards' house squares have.
      g.strokeStyle = rgba('#ffffff', 0.35);
      g.lineWidth = 3;
      g.strokeRect(6, 6, w - 12, h - 12);
    };
    cell('house', (w, h) => plate(w, h, BOARD.houseTile));
    cell('apartment', (w, h) => plate(w, h, BOARD.apartmentTile));
    cell('park', (w, h) => {
      g.fillStyle = BOARD.parkTile;
      g.fillRect(0, 0, w, h);
      vignette(w, h, '#0f2008', 0.3);
      for (let i = 0; i < 7; i++) {
        const x = 30 + r() * (w - 60);
        const y = 30 + r() * (h - 60);
        g.fillStyle = rgba('#a8d27c', 0.35);
        g.beginPath();
        g.arc(x, y, 14 + r() * 16, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = rgba('#e9dfc4', 0.55);
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(0, h * 0.7);
      g.bezierCurveTo(w * 0.35, h * 0.55, w * 0.6, h * 0.85, w, h * 0.6);
      g.stroke();
    });
    cell('garden', (w, h) => {
      g.fillStyle = BOARD.gardenTile;
      g.fillRect(0, 0, w, h);
      vignette(w, h, '#123a0c', 0.25);
      // Hedge ring with a gate gap, a light path.
      g.strokeStyle = '#3f8a2c';
      g.lineWidth = 16;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = BOARD.gardenTile;
      g.fillRect(w / 2 - 22, h - 30, 44, 24);
      g.fillStyle = '#f4f1e6';
      g.fillRect(w / 2 - 20, h - 26, 40, 6);
      g.fillStyle = rgba('#e9dfc4', 0.7);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(w / 2, h - 40 - i * 22, 12, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      for (const fx of [0.22, 0.78]) {
        g.fillStyle = rgba('#e98bb8', 0.6);
        g.beginPath();
        g.ellipse(w * fx, h * 0.45, 26, 14, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    // Drink suppliers: a printed spot under the green mini (the 2D board draws the full print).
    const drink = (fill: string, ring: string) => (w: number, h: number) => {
      g.fillStyle = BOARD.ground;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fill;
      g.beginPath();
      g.roundRect(18, 18, w - 36, h - 36, 34);
      g.fill();
      g.strokeStyle = ring;
      g.lineWidth = 8;
      g.stroke();
      vignette(w, h, '#000000', 0.12);
    };
    cell('beer', drink(BOARD.beer, '#2a6436'));
    cell('lemonade', drink(BOARD.lemonade, '#a8901c'));
    cell('soft_drink', drink(BOARD.soda, '#8e1517'));
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/** Dark warm wood with a subtle grain (repeats; ~4 squares per repeat). */
export function woodTexture(): THREE.CanvasTexture {
  return cached('wood', () => {
    const W = 512;
    const H = 512;
    const [c, g] = canvas(W, H);
    const r = rng(77);
    g.fillStyle = BOARD.table;
    g.fillRect(0, 0, W, H);
    // Planks run along x; grain lines wander slightly.
    for (let i = 0; i < 90; i++) {
      const y0 = r() * H;
      g.strokeStyle = r() < 0.6 ? rgba(BOARD.tableGrain, 0.25 + r() * 0.35) : rgba('#8a6440', 0.15 + r() * 0.2);
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      const amp = 1 + r() * 4;
      const f = (1 + Math.floor(r() * 3)) * ((Math.PI * 2) / W);
      const ph = r() * 6;
      for (let x = 0; x <= W; x += 8) {
        const y = y0 + Math.sin(x * f + ph) * amp;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Plank joints.
    g.fillStyle = rgba('#2e1e12', 0.45);
    for (const y of [0, H / 2]) g.fillRect(0, y, W, 2);
    return tex(c, { repeat: true, aniso: 4 });
  });
}
