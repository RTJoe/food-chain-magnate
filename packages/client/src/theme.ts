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
  inkMuted: '#6b6774',
  line: '#d4c6a8',
  accent: '#d94f3d',
  accentInk: '#ffffff',
  focus: '#3f8fd2',
  ok: '#3f9a5c',
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
 * Seat colours, in seat order. Six for Ketchup's six-player game; keep `base` values in sync with
 * DEFAULT_PLAYER_COLORS in packages/engine/src/testing/stateBuilder.ts.
 */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  { id: 'red', name: 'Ketchup', base: '#d94f3d', dark: '#9e3326', light: '#f7d6cf' },
  { id: 'yellow', name: 'Mustard', base: '#e8b730', dark: '#a87f12', light: '#f8ebc2' },
  { id: 'blue', name: 'Blueberry', base: '#3f8fd2', dark: '#255f92', light: '#d3e5f5' },
  { id: 'green', name: 'Pickle', base: '#4caf6a', dark: '#2f7a46', light: '#d5eedb' },
  { id: 'purple', name: 'Grape', base: '#9b5fc0', dark: '#673d84', light: '#e8d9f1' },
  { id: 'orange', name: 'Tangerine', base: '#f08a3c', dark: '#b05a1a', light: '#fbe0cb' },
];

export const CHAIN_COLORS: Record<ChainId, string> = {
  fried_geese_donkey: '#d94f3d',
  golden_duck_diner: '#e8b730',
  santa_maria_pizza: '#3f8fd2',
  xango_blues_bar: '#4caf6a',
  gluttony_inc: '#9b5fc0',
  siap_faji: '#f08a3c',
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

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Writes tokens as CSS custom properties: --c-paper, --player-0, --food-burger, ... */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(COLORS)) root.style.setProperty(`--c-${kebab(k)}`, v);
  PLAYER_COLORS.forEach((p, i) => {
    root.style.setProperty(`--player-${i}`, p.base);
    root.style.setProperty(`--player-${i}-dark`, p.dark);
    root.style.setProperty(`--player-${i}-light`, p.light);
  });
  for (const [k, v] of Object.entries(FOOD_COLORS)) root.style.setProperty(`--food-${kebab(k)}`, v);
}
