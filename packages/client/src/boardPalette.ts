/**
 * Map tile print colours (docs/art-bible.md §2 "Map, houses, goods" and §5), shared by the 3D board
 * (three/board/*) and the 2D board (ui/Board2D.tsx). Read from theme.ts when it defines the token,
 * else the bible value. Contrast notes are WCAG ratios against `ground` / `road`.
 */
import { COLORS } from './theme.js';

const T = COLORS as unknown as Record<string, string | undefined>;
const tok = (k: string, fallback: string): string => T[k] ?? fallback;

export const BOARD = {
  /** Off-white tile print. */
  ground: tok('tileGround', '#f5f2e8'),
  /** Speckles and smudges in the print. */
  speck: tok('tileSpeck', '#dcd8cc'),
  /** Faint square grid on every tile. */
  grid: tok('tileGrid', '#e3dfd3'),
  /** Chamfered top edge of the cardboard. */
  bevel: tok('tileBevel', '#cfcac0'),
  /** Cardboard core seen on the tile sides. */
  core: '#a8a398',
  /**
   * Tile seam hairline: 3.1:1 on `ground` (non-text 3:1), so the tile borders the rules count stay
   * visible. High contrast draws it in ink.
   */
  seam: tok('tileSeam', '#8f8a80'),
  /** Seam across a road (and in the 2D board): near-ink, 3.6:1 on `road`. */
  seamOnRoad: '#1c1c1f',
  /**
   * Asphalt (painted-mini street palette, minis/paint.ts, lifted to a mid grey so ink marks and
   * route outlines keep 3:1 on it: ink 3.2:1, seamOnRoad 3.6:1).
   */
  road: tok('tileRoad', '#707378'),
  /** Aggregate flecks and patches in the asphalt. */
  roadLight: '#80838a',
  roadDark: '#5f6267',
  /** Pavement strip along the closed sides of a road square, and its kerb stone. */
  pavement: '#d3cec3',
  kerb: '#ebe7dd',
  /** Yellow edge lines (just inside the kerb), as the printed tiles' yellow lines. */
  roadEdge: tok('tileRoadLine', '#e8c547'),
  /** White centre dashes and zebra crossings: 4.1:1 on `road`. */
  roadDash: tok('tileRoadDash', '#f1eee6'),
  /** Lobbyist road under construction. */
  gravel: '#b3a68c',
  /**
   * Empty lots (flat, pale paint under nothing): lawn, paving, gravel, concrete. Kept light
   * (luminance 0.54 or more) so `legal` (3.2:1+) and `bad` (3.5:1+) still read on them, and far from
   * the lime garden / dark park plates.
   */
  lotLawn: '#bccb9e',
  lotLawnStripe: '#b1c292',
  lotHedge: '#93a97a',
  lotPaving: '#dcd6ca',
  lotGravel: '#dccfb4',
  lotConcrete: '#d9d6cf',
  lotSoil: '#b59a7c',
  bridge: tok('bridgeSteel', '#8fd3a8'),
  bridgeDark: '#5fae80',
  houseTile: tok('houseTile', '#b2658e'),
  gardenTile: tok('gardenTile', '#5fb843'),
  parkTile: tok('parkTile', '#537938'),
  apartmentTile: tok('apartmentTile', '#b2658e'),
  /** Table under the board. */
  table: tok('table', '#6b4a2f'),
  tableGrain: '#5a3d26',
  /** Rim band with the tile names, chrome edge. */
  rim: tok('rim', '#ebe2c8'),
  rimInk: '#4a463f',
  chrome: tok('chrome', '#d8d9dc'),
  chromeShade: tok('chromeShade', '#9a9ca2'),
  /** Printed drink suppliers (2D board and the decal under the 3D mini). */
  beer: '#3e8e4d',
  lemonade: '#e8cf3a',
  soda: '#d8262a',
  /**
   * Legal-area tint: deep teal, 5.1:1 on `ground` and 3.2:1 or more on the lot paints (the legal-spot
   * dots carry an ink ring, 3.2:1 on `road`).
   */
  legal: '#227268',
  /** Illegal / blocked: planning red, 5.6:1 on `ground`; on `road` its white edge carries it (4.8:1). */
  bad: '#aa3839',
  /** White edge around range squares and blocked marks: 4.8:1 on `road`. */
  edge: '#ffffff',
} as const;

export type BoardColor = keyof typeof BOARD;
