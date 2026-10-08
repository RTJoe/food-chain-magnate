/**
 * Canvas-drawn prints for the map tiles (docs/art-bible.md §5): the off-white tile ground with
 * speckles, smudges, a faint square grid and a bevelled edge; road squares (asphalt with
 * pavements, kerbs and yellow edge lines, one texture per shape); the printed plates under the
 * minis (house, garden, park, apartment, drink suppliers) and the empty-lot paints as one atlas;
 * the wood table.
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

/** Canonical open sides of each shape (+z = south = canvas down). */
const OPEN: Record<RoadTexShape, readonly ('N' | 'E' | 'S' | 'W')[]> = {
  none: [],
  end: ['S'],
  straight: ['N', 'S'],
  corner: ['S', 'E'],
  tee: ['E', 'S', 'W'],
  cross: ['N', 'E', 'S', 'W'],
};

/** Street cross-section (squares, from the square's edge): pavement, kerb stone, gutter, line. */
const PAVE = 0.085;
const KERB = 0.02;
const GUTTER = 0.014;
const LINE_IN = 0.03;
const LINE_W = 0.02;
/** Radius of the kerb round a closed (outside) corner. */
const FILLET = 0.14;

/** Road texture size: 512 on desktop, 256 on phones (coarse pointer) to save memory. */
export function roadPx(): number {
  const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  return coarse ? 256 : 512;
}

/** Pavement slabs (repeating, aligned to the square so joints meet across squares). */
function slabPattern(g: CanvasRenderingContext2D, px: number): CanvasPattern | string {
  const n = Math.max(8, Math.round(px / 12));
  const [c, p] = canvas(n, n);
  p.fillStyle = BOARD.pavement;
  p.fillRect(0, 0, n, n);
  p.fillStyle = rgba('#8a8478', 0.35);
  p.fillRect(0, 0, n, Math.max(1, px / 512));
  p.fillRect(0, 0, Math.max(1, px / 512), n);
  return g.createPattern(c, 'repeat') ?? BOARD.pavement;
}

/**
 * Flat street square (canonical shape, canvas down = south): grainy asphalt with soft tyre wear,
 * a pavement of slabs on every closed side with a pale kerb stone and a dark gutter, rounded kerbs
 * at outside corners and kerb nubs between two open sides, a thin yellow edge line inside the kerb
 * (stopping at junctions), and a drain by the kerb. White dashes and zebras are separate meshes.
 */
export function roadTexture(shape: RoadTexShape, px = 256): THREE.CanvasTexture {
  return cached(`road:${shape}:${px}`, () => {
    const [c, g] = canvas(px, px);
    const r = rng(shape.length * 31 + 7);
    const u = (v: number) => v * px;
    const open = new Set(OPEN[shape]);
    const along = shape === 'end' || shape === 'straight';
    // Asphalt base: aggregate flecks, soft patches, tyre wear in each lane.
    g.fillStyle = BOARD.road;
    g.fillRect(0, 0, px, px);
    for (let i = 0; i < 7; i++) {
      const x = r() * px;
      const y = r() * px;
      const rad = u(0.12 + r() * 0.25);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.5 ? BOARD.roadLight : BOARD.roadDark;
      gr.addColorStop(0, rgba(col, 0.35));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (along)
      for (const x of [0.3, 0.7]) {
        const gr = g.createLinearGradient(u(x - 0.09), 0, u(x + 0.09), 0);
        gr.addColorStop(0, rgba(BOARD.roadDark, 0));
        gr.addColorStop(0.5, rgba(BOARD.roadDark, 0.3));
        gr.addColorStop(1, rgba(BOARD.roadDark, 0));
        g.fillStyle = gr;
        g.fillRect(u(x - 0.09), 0, u(0.18), px);
      }
    const fleck = Math.max(1, px / 256);
    for (let i = 0; i < px * 7; i++) {
      const k = r();
      g.fillStyle = k < 0.45 ? rgba('#a5a8ad', 0.35) : k < 0.9 ? rgba('#3d3f43', 0.3) : rgba('#c9c6bd', 0.45);
      g.fillRect(r() * px, r() * px, fleck, fleck);
    }

    // Non-asphalt region at depth d from the closed sides (strips, outside-corner fillets, and the
    // kerb nubs where two open sides meet).
    // Each piece is its own path (filled one by one: mixed windings would cancel under nonzero).
    const region = (d: number, nubs: boolean): Path2D[] => {
      const out: Path2D[] = [];
      const rect = (x: number, y: number, w: number, h: number) => {
        const q = new Path2D();
        q.rect(x, y, w, h);
        out.push(q);
      };
      if (!open.has('N')) rect(0, 0, px, u(d));
      if (!open.has('S')) rect(0, u(1 - d), px, u(d));
      if (!open.has('W')) rect(0, 0, u(d), px);
      if (!open.has('E')) rect(u(1 - d), 0, u(d), px);
      const corners = [
        ['N', 'W', 0, 0],
        ['N', 'E', 1, 0],
        ['S', 'E', 1, 1],
        ['S', 'W', 0, 1],
      ] as const;
      for (const [a, b2, cx, cz] of corners) {
        const sx = cx ? -1 : 1;
        const sz = cz ? -1 : 1;
        if (!open.has(a) && !open.has(b2)) {
          // Outside corner: fill the square between the strips and a circle of radius FILLET.
          const f = FILLET;
          const ox = u(cx + sx * (d + f));
          const oz = u(cz + sz * (d + f));
          const sub = new Path2D();
          sub.moveTo(u(cx), u(cz));
          sub.lineTo(ox, u(cz));
          sub.lineTo(ox, oz - sz * u(f));
          const a0 = Math.atan2(-sz, 0);
          const a1 = Math.atan2(0, -sx);
          sub.arc(ox, oz, u(f), a0, a1, sx * sz > 0);
          sub.lineTo(u(cx), oz);
          sub.closePath();
          out.push(sub);
        } else if (nubs && open.has(a) && open.has(b2)) {
          const sub = new Path2D();
          sub.moveTo(u(cx), u(cz));
          sub.arc(u(cx), u(cz), u(d), 0, Math.PI * 2);
          out.push(sub);
        }
      }
      return out;
    };
    const fill = (ctx: CanvasRenderingContext2D, paths: Path2D[]) => {
      for (const q of paths) ctx.fill(q);
    };
    // Yellow edge line: the band between two depths, on the closed sides only.
    const band = (d0: number, d1: number) => {
      const [lc, lg] = canvas(px, px);
      lg.fillStyle = BOARD.roadEdge;
      fill(lg, region(d1, false));
      lg.globalCompositeOperation = 'destination-out';
      fill(lg, region(d0, false));
      g.drawImage(lc, 0, 0);
    };
    if (open.size < 4) band(PAVE + KERB + LINE_IN, PAVE + KERB + LINE_IN + LINE_W);
    // Gutter shadow, kerb stone, pavement slabs.
    g.fillStyle = rgba('#2a2b2e', 0.4);
    fill(g, region(PAVE + KERB + GUTTER, true));
    g.fillStyle = BOARD.kerb;
    fill(g, region(PAVE + KERB, true));
    // Pavement slabs with a little weathering, on their own layer.
    const [pc, pg] = canvas(px, px);
    pg.fillStyle = slabPattern(pg, px);
    fill(pg, region(PAVE, true));
    pg.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < px * 2; i++) {
      pg.fillStyle = r() < 0.5 ? rgba('#ffffff', 0.18) : rgba('#6f6a60', 0.14);
      pg.fillRect(r() * px, r() * px, fleck, fleck);
    }
    g.drawImage(pc, 0, 0);
    // A drain grate by the kerb on straight runs and dead ends.
    if (along) {
      const x = u(1 - PAVE - KERB - GUTTER - 0.07);
      const y = u(0.62);
      g.fillStyle = '#3a3b3f';
      g.fillRect(x, y, u(0.07), u(0.11));
      g.fillStyle = rgba('#9a9da3', 0.7);
      for (let i = 1; i < 5; i++) g.fillRect(x, y + (i * u(0.11)) / 5, u(0.07), Math.max(1, px / 256));
    }
    if (shape === 'cross') {
      // Manhole cover.
      g.strokeStyle = rgba('#3a3b3f', 0.7);
      g.lineWidth = u(0.012);
      g.beginPath();
      g.arc(px / 2, px / 2, u(0.075), 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = rgba('#3a3b3f', 0.25);
      g.fill();
    }
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Printed plates (atlas)
// ---------------------------------------------------------------------------

/** Empty-lot paints (flat, pale; drawn under nothing): lawns, paving, parking, gravel, yards. */
export const LOT_KINDS = ['lot0', 'lot1', 'lot2', 'lot3', 'lot4', 'lot5', 'lot6', 'lot7'] as const;
export type LotKind = (typeof LOT_KINDS)[number];
export type PlateKind = 'house' | 'garden' | 'park' | 'apartment' | 'beer' | 'lemonade' | 'soft_drink' | LotKind;

/** Atlas cell [col, row, w, h] in 256 px cells on a 1024 atlas. */
const CELLS: Record<PlateKind, [number, number, number, number]> = {
  house: [0, 0, 1, 1],
  apartment: [1, 0, 1, 1],
  park: [2, 0, 1, 1],
  garden: [0, 1, 2, 1],
  beer: [2, 1, 1, 1],
  lemonade: [3, 1, 1, 1],
  soft_drink: [3, 0, 1, 1],
  lot0: [0, 2, 1, 1],
  lot1: [1, 2, 1, 1],
  lot2: [2, 2, 1, 1],
  lot3: [3, 2, 1, 1],
  lot4: [0, 3, 1, 1],
  lot5: [1, 3, 1, 1],
  lot6: [2, 3, 1, 1],
  lot7: [3, 3, 1, 1],
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
    drawLots(g, cell, r);
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Empty lots
// ---------------------------------------------------------------------------

/**
 * Eight pale, flat lot paints in the atlas (rows 2-3): striped lawns, a lawn with a flower bed,
 * paving with a planter, a small car park, gravel with stepping stones, a cross-mown lawn with
 * flat shrub dots, a concrete yard. Low detail and light values on purpose: they must never read as
 * a garden, park or other game piece, and the board marks keep 3:1 on them.
 */
function drawLots(g: CanvasRenderingContext2D, cell: (kind: PlateKind, draw: (w: number, h: number) => void) => void, r: () => number): void {
  const specks = (w: number, h: number, n: number, light: string, dark: string, a: number, size = 2) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? rgba(light, a) : rgba(dark, a);
      const d = size * (0.6 + r() * 0.8);
      g.fillRect(r() * w, r() * h, d, d);
    }
  };
  const soften = (w: number, h: number) => {
    // Soft darker rim so the lot sits in the print, plus a paint grain.
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    gr.addColorStop(0, rgba('#3a3a2a', 0));
    gr.addColorStop(1, rgba('#3a3a2a', 0.1));
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    specks(w, h, 500, '#ffffff', '#4a4636', 0.08, 1.6);
  };
  const lawn = (w: number, h: number, stripes: 'v' | 'd' | 'x') => {
    g.fillStyle = BOARD.lotLawn;
    g.fillRect(0, 0, w, h);
    g.fillStyle = BOARD.lotLawnStripe;
    const n = 6;
    const sw = w / n;
    if (stripes === 'v') for (let i = 0; i < n; i += 2) g.fillRect(i * sw, 0, sw, h);
    else if (stripes === 'x') for (let i = 0; i < n; i++) for (let j = (i % 2); j < n; j += 2) g.fillRect(i * sw, j * sw, sw, sw);
    else {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 4);
      for (let i = -n; i < n; i += 2) g.fillRect(i * sw, -w, sw, w * 2);
      g.restore();
    }
    specks(w, h, 900, '#d8e3bd', '#8fa476', 0.35, 2);
    // Thin flat hedge-line border (paint only).
    g.strokeStyle = BOARD.lotHedge;
    g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, w - 5, h - 5);
  };
  const shrub = (x: number, y: number, rad: number) => {
    g.fillStyle = rgba('#5a6a46', 0.35);
    g.beginPath();
    g.arc(x + 2, y + 3, rad, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#93ab78';
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgba('#c7d8a8', 0.8);
    g.beginPath();
    g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.4, 0, Math.PI * 2);
    g.fill();
  };
  const flowers = ['#d8484a', '#f1cf4a', '#f6f2ea', '#c46aa0'];

  // Striped lawn.
  cell('lot0', (w, h) => {
    lawn(w, h, 'v');
    soften(w, h);
  });
  // Lawn with a flower bed along one side and two flat shrubs.
  cell('lot1', (w, h) => {
    lawn(w, h, 'v');
    g.fillStyle = BOARD.lotSoil;
    g.fillRect(14, 14, w - 28, 44);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = flowers[i % flowers.length]!;
      g.beginPath();
      g.arc(20 + r() * (w - 40), 20 + r() * 32, 2.5 + r() * 2, 0, Math.PI * 2);
      g.fill();
    }
    shrub(w * 0.25, h * 0.72, 16);
    shrub(w * 0.75, h * 0.72, 16);
    soften(w, h);
  });
  // Paving slabs with a round planter.
  cell('lot2', (w, h) => {
    g.fillStyle = BOARD.lotPaving;
    g.fillRect(0, 0, w, h);
    const s = w / 6;
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 6; col++) {
        g.fillStyle = rgba(r() < 0.5 ? '#ffffff' : '#8a8274', 0.06 + r() * 0.06);
        g.fillRect(col * s, row * s, s, s);
      }
    g.fillStyle = rgba('#7d7668', 0.45);
    for (let i = 0; i <= 6; i++) {
      g.fillRect(i * s - 1, 0, 2, h);
      g.fillRect(0, i * s - 1, w, 2);
    }
    g.fillStyle = BOARD.lotSoil;
    g.beginPath();
    g.arc(w * 0.68, h * 0.32, 34, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c8c0b0';
    g.lineWidth = 6;
    g.stroke();
    shrub(w * 0.68, h * 0.32, 20);
    soften(w, h);
  });
  // Small car park: three bays with wheel stops.
  cell('lot3', (w, h) => {
    g.fillStyle = BOARD.lotConcrete;
    g.fillRect(0, 0, w, h);
    specks(w, h, 1400, '#ffffff', '#7a776f', 0.25, 2);
    g.fillStyle = '#f6f4ee';
    for (let i = 0; i <= 3; i++) g.fillRect(16 + (i * (w - 32)) / 3 - 2.5, 14, 5, h * 0.55);
    g.fillStyle = '#a9a59b';
    for (let i = 0; i < 3; i++) g.fillRect(16 + ((i + 0.5) * (w - 32)) / 3 - 18, 24, 36, 7);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = rgba('#5e5b55', 0.12);
      g.beginPath();
      g.ellipse(30 + r() * (w - 60), h * 0.3 + r() * h * 0.2, 8 + r() * 10, 5 + r() * 6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    soften(w, h);
  });
  // Gravel with stepping stones.
  cell('lot4', (w, h) => {
    g.fillStyle = BOARD.lotGravel;
    g.fillRect(0, 0, w, h);
    specks(w, h, 4000, '#f4ecdc', '#9c8f76', 0.45, 2.4);
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      g.fillStyle = rgba('#6e6658', 0.25);
      g.beginPath();
      g.ellipse(w * (0.2 + t * 0.6) + 2, h * (0.85 - t * 0.7) + 3, 20, 14, 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ece8df';
      g.beginPath();
      g.ellipse(w * (0.2 + t * 0.6), h * (0.85 - t * 0.7), 20, 14, 0.4, 0, Math.PI * 2);
      g.fill();
    }
    shrub(w * 0.2, h * 0.22, 14);
    soften(w, h);
  });
  // Diagonal-mown lawn with a curved path.
  cell('lot5', (w, h) => {
    lawn(w, h, 'd');
    g.strokeStyle = BOARD.lotPaving;
    g.lineWidth = 22;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(w * 0.5, h);
    g.bezierCurveTo(w * 0.5, h * 0.6, w * 0.15, h * 0.5, w * 0.2, 0);
    g.stroke();
    g.strokeStyle = rgba('#8a8274', 0.35);
    g.lineWidth = 2;
    g.stroke();
    soften(w, h);
  });
  // Cross-mown lawn with a row of flat shrubs.
  cell('lot6', (w, h) => {
    lawn(w, h, 'x');
    for (let i = 0; i < 4; i++) shrub(w * (0.18 + i * 0.213), h * 0.8, 13);
    soften(w, h);
  });
  // Concrete yard: four slabs with joints, a drain and a few stains.
  cell('lot7', (w, h) => {
    g.fillStyle = BOARD.lotConcrete;
    g.fillRect(0, 0, w, h);
    specks(w, h, 1200, '#ffffff', '#7a776f', 0.22, 2);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = rgba(r() < 0.5 ? '#ffffff' : '#7a776f', 0.08);
      g.fillRect((i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
    }
    g.fillStyle = rgba('#6e6b64', 0.5);
    g.fillRect(w / 2 - 1.5, 0, 3, h);
    g.fillRect(0, h / 2 - 1.5, w, 3);
    g.fillStyle = '#6a6862';
    g.fillRect(w / 2 - 12, h / 2 - 12, 24, 24);
    g.fillStyle = rgba('#d0cdc5', 0.8);
    for (let i = 1; i < 5; i++) g.fillRect(w / 2 - 12, h / 2 - 12 + i * 4.8, 24, 1.5);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = rgba('#5e5b55', 0.1);
      g.beginPath();
      g.ellipse(30 + r() * (w - 60), 30 + r() * (h - 60), 10 + r() * 14, 6 + r() * 8, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    soften(w, h);
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
