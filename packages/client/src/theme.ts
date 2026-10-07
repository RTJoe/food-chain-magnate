/**
 * Colour tokens shared by CSS (as custom properties) and Three.js (as numbers).
 * See docs/visual-style.md. Original palette: warm mid-century diner, not taken from any product art.
 */
import type { ChainId, FoodId } from '@fcm/engine';

export const COLORS = {
  // UI
  paper: '#f4ead5',
  surface: '#fffaf0',
  surfaceSunk: '#ebdfc6',
  ink: '#2b2a33',
  /** Secondary text: 5.0:1 on surfaceSunk, the darkest background it sits on (WCAG AA). */
  inkMuted: '#5f5b68',
  line: '#d4c6a8',
  /** Ketchup red: primary buttons (white text 5.1:1) and accent text (4.9:1 on surface). */
  accent: '#c4402f',
  accentHover: '#a93526',
  accentInk: '#ffffff',
  /** Focus rings and selection outlines only (3:1 against the surfaces); never text. */
  focus: '#2f7fc4',
  /** Link text: 6.4:1 on surface, 5.1:1 on surfaceSunk. */
  link: '#255f92',
  /** Good / ready / done: white text on it 5.3:1, as text on surface 5.0:1. */
  ok: '#2f7a46',
  warn: '#e8a530',
  danger: '#c0392b',
  // Board
  grass: '#a6d27c',
  lot: '#e9dfc4',
  road: '#5b5a63',
  roadLine: '#f4ead5',
  houseWall: '#f2e6cf',
  houseRoof: '#c8693f',
  apartment: '#b8b2c8',
  garden: '#5f9e4a',
  park: '#6fb35a',
  water: '#7cc4e0',
  tileEdge: '#cbbd9c',
  shadow: '#1f1d26',
  highlightOk: '#5ad17a',
  /** Legal-spot tint during board picks: saturated mustard, readable on grass and road alike. */
  highlightLegal: '#ffc531',
  highlightBad: '#e25b4b',
} as const;

export type ColorToken = keyof typeof COLORS;

export interface PlayerColor {
  id: string;
  name: string;
  /** Main body colour. */
  base: string;
  /** Darker trim (roofs, outlines). */
  dark: string;
  /** Light tint (UI backgrounds). */
  light: string;
}

/**
 * Seat colours, in seat order. Six for Ketchup's six-player game. Tuned to stay apart under
 * protanopia, deuteranopia and tritanopia (CIEDE2000 distance >= 10.8 for every pair of the six;
 * docs/visual-style.md), so Pickle is teal and Grape is orchid. `dark` is a text colour (>= 4.5:1
 * on `light` and on surface). Keep `base` in sync with SEAT_COLORS (packages/session/src/room.ts)
 * and DEFAULT_PLAYER_COLORS (packages/engine/src/testing/stateBuilder.ts); `seatColor` maps the
 * earlier palette, which saved games and older servers still send.
 */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  { id: 'red', name: 'Ketchup', base: '#b8352a', dark: '#8a2419', light: '#f5d5d0' },
  { id: 'yellow', name: 'Mustard', base: '#f2cf3f', dark: '#7a5c0c', light: '#fbf0c4' },
  { id: 'blue', name: 'Blueberry', base: '#2b62b8', dark: '#1f4a8a', light: '#d6e2f5' },
  { id: 'green', name: 'Pickle', base: '#5cc7b2', dark: '#1f6b5c', light: '#d4f1eb' },
  { id: 'purple', name: 'Grape', base: '#d77fc9', dark: '#86397a', light: '#f6def2' },
  { id: 'orange', name: 'Tangerine', base: '#ef8a2f', dark: '#9c4c10', light: '#fce2cc' },
];

/** The palette before the colour-blind retune, by seat (the server and saved games may still use it). */
const LEGACY_SEAT_COLORS = ['#d94f3d', '#e8b730', '#3f8fd2', '#4caf6a', '#9b5fc0', '#f08a3c'];

/** A seat colour from the game state, mapped to the current palette (other colours pass through). */
export function seatColor(c: string): string;
export function seatColor(c: string | undefined): string | undefined;
export function seatColor(c: string | undefined): string | undefined {
  const i = c ? LEGACY_SEAT_COLORS.indexOf(c.toLowerCase()) : -1;
  return i >= 0 ? PLAYER_COLORS[i]!.base : c;
}

export const CHAIN_COLORS: Record<ChainId, string> = {
  fried_geese_donkey: PLAYER_COLORS[0]!.base,
  golden_duck_diner: PLAYER_COLORS[1]!.base,
  santa_maria_pizza: PLAYER_COLORS[2]!.base,
  xango_blues_bar: PLAYER_COLORS[3]!.base,
  gluttony_inc: PLAYER_COLORS[4]!.base,
  siap_faji: PLAYER_COLORS[5]!.base,
};

/** Goods are also told apart by token shape (docs/visual-style.md), never by colour alone. */
export const FOOD_COLORS: Record<FoodId, string> = {
  burger: '#8d5a2b',
  pizza: '#ef6f3c',
  beer: '#e0b23a',
  lemonade: '#f5ec7a',
  soft_drink: '#6b2f2a',
  coffee: '#4a3226',
  kimchi: '#c8412f',
  sushi: '#e98b8b',
  noodles: '#f2d79b',
};

/** `#rrggbb` → 0xrrggbb for THREE.Color. */
export const hex = (css: string): number => Number.parseInt(css.slice(1), 16);

const channel = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of `#rrggbb`. */
export function luminance(css: string): number {
  const n = hex(css);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two `#rrggbb` colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Text colour for a label on `bg` (player badges): white, or ink on light seats such as Mustard. */
export function inkOn(bg: string): string {
  return contrast('#ffffff', bg) >= contrast(COLORS.ink, bg) ? '#ffffff' : COLORS.ink;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Writes tokens as CSS custom properties: --c-paper, --player-0, --food-burger, ... */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(COLORS)) root.style.setProperty(`--c-${kebab(k)}`, v);
  PLAYER_COLORS.forEach((p, i) => {
    root.style.setProperty(`--player-${i}`, p.base);
    root.style.setProperty(`--player-${i}-dark`, p.dark);
    root.style.setProperty(`--player-${i}-light`, p.light);
    root.style.setProperty(`--player-${i}-ink`, inkOn(p.base));
  });
  for (const [k, v] of Object.entries(FOOD_COLORS)) root.style.setProperty(`--food-${kebab(k)}`, v);
}
