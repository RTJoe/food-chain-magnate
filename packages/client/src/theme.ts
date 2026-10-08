/**
 * Colour tokens shared by CSS (as custom properties) and Three.js (as numbers).
 * See docs/art-bible.md §2 and docs/visual-style.md: the rulebook's flat print colours (paper,
 * coral and teal brand pair, chrome trays), sampled by eye; no product art is copied.
 */
import type { CardColour, ChainId, FoodId } from '@fcm/engine';

export const COLORS = {
  // UI surfaces and text
  /** Page background (rulebook paper), with grain and a vignette in CSS. */
  paper: '#f7f5ed',
  /** Cards and panels: near-white, never #fff. */
  surface: '#fdfcfa',
  /** Wells and track slots. */
  surfaceSunk: '#e9e7dd',
  /** Deeper wells (recessed tray slots). */
  surfaceWell: '#d9d7cc',
  /** "TV panel" fill (rulebook info boxes), with a 2 px `teal` outline. */
  panelTeal: '#e9f1ed',
  /** Module sidebars: tutorial and rules asides. */
  panelGreen: '#edf5e4',
  ink: '#262626',
  /** Secondary text: 5.4:1 on surfaceSunk, the darkest background it sits on (WCAG AA). */
  inkMuted: '#5c5c5c',
  /** Hairlines and rules (non-text, decorative). */
  line: '#cfcac0',
  /** Borders that must be seen on paper (2.6:1). */
  lineMid: '#b5b0a5',
  /** Borders that must meet 3:1 (3.6:1 on paper). */
  lineStrong: '#8f8a80',
  /** "FOR EXAMPLE:" label bars: white italic caps, large text only. */
  labelBar: '#8a8a86',
  /** Coral ink: primary buttons (white text 5.3:1) and accent text (5.2:1 on surface). */
  accent: '#c9303c',
  accentHover: '#b8262f',
  accentInk: '#ffffff',
  /** The pressed edge under primary buttons. */
  accentShadow: '#8e2a45',
  // Brand accents
  /** Logo coral: script titles and ribbons; large text (24 px, 19 px bold) and non-text only (4.0:1). */
  coral: '#e53d49',
  /** Coral for any text under 24 px and button fills (5.2:1 on paper; white on it 5.3:1). */
  coralInk: '#c9303c',
  /** Backgrounds only (table rows, warnings); ink on it 4.6:1. */
  coralSoft: '#f37368',
  /** Header bands, panel outlines, icons; large text and non-text only (4.1:1). */
  teal: '#508488',
  /** Teal text and links: 4.8:1 on surfaceSunk, 5.8:1 on surface; white on it 6.0:1. */
  tealInk: '#356a80',
  /** Teal text on wells. */
  tealDark: '#2b6a6e',
  /** Billboard sign faces, highlights; never text. */
  cyan: '#2deedd',
  /** Chrome-tray felt and player setup; ink on it 12.5:1. */
  cream: '#fcea98',
  /** Decorative only. */
  posterYellow: '#f0f04b',
  /** Chrome trays and bevels: highlight, mid, shade. */
  chromeLight: '#e6e7ea',
  chrome: '#d8d9dc',
  chromeMid: '#c2c4c9',
  chromeShade: '#9a9ca2',
  /** Focus rings and selection outlines (3:1 or better on every surface). */
  focus: '#356a80',
  /** Link text (teal ink). */
  link: '#356a80',
  /** Good / ready / done (card-band green): white text on it 5.3:1, as text on surface 5.2:1. */
  ok: '#2f7a3f',
  warn: '#e8a530',
  /** Red X / planning red: white text on it 6.3:1. */
  danger: '#aa3839',
  // Board. Aliases kept for the 3D builders that still read them, mapped to the art-bible print
  // and plastic values (docs/art-bible.md §2 "Map, houses, goods"): no pre-bible colours remain.
  /** Tile print ground (the off-white board; the pre-bible grass). */
  grass: '#f5f2e8',
  /** Plates under pieces (restaurant and marketing bases): the tile grid colour. */
  lot: '#e3dfd3',
  road: '#7c787b',
  /** Dashed centre line. */
  roadLine: '#f4f4f2',
  /** House plastic (Special Edition burgundy). */
  houseWall: '#7a2f48',
  houseRoof: '#5e2236',
  apartment: '#b2658e',
  /** Garden plastic (lime). */
  garden: '#a9bd62',
  park: '#537938',
  shadow: '#1f1d26',
  highlightOk: '#5ad17a',
  /** Legal-spot tint during board picks: saturated mustard, readable on grass and road alike. */
  highlightLegal: '#ffc531',
  highlightBad: '#e25b4b',
} as const;

export type ColorToken = keyof typeof COLORS;

export interface PlayerColor {
  /** The seat's restaurant chain (seat i plays chain i). */
  id: ChainId;
  /** Default seat name: the chain's short name. */
  name: string;
  /** Main body colour: the chain's plastic (Special Edition minis, UI badges). */
  base: string;
  /** Darker trim and text colour (>= 4.5:1 on `light`, surface and white). */
  dark: string;
  /** Light tint (UI backgrounds). */
  light: string;
  /** Chrome-tray felt (rail cards, milestone tray). */
  felt: string;
  /** Flat print colour (2D restaurant tiles). */
  print: string;
}

/**
 * Seat colours, in seat order = chain order (docs/art-bible.md §7): the six chains' plastic
 * colours, nudged within each chain's identity so every pair stays apart under simulated
 * protanopia, deuteranopia and tritanopia (Machado 2009; CIEDE2000 >= 12.9 for the six seats and
 * for five; print >= 15.6; felt >= 9.1; docs/visual-style.md). Each seat also has a mark
 * (`playerMark`), shown with the colour everywhere, so colour is never the only cue. Keep `base` in
 * sync with SEAT_COLORS (packages/session/src/room.ts), DEFAULT_PLAYER_COLORS
 * (packages/engine/src/testing/stateBuilder.ts) and the bench colours (packages/ai/src/bench/game.ts);
 * `seatColor` maps the earlier palettes, which saved games and older servers still send.
 */
export const PLAYER_COLORS: readonly PlayerColor[] = [
  { id: 'fried_geese_donkey', name: 'Fried Geese', base: '#a6449c', dark: '#5a1f55', light: '#e8d0e3', felt: '#bf96bc', print: '#612e57' },
  { id: 'golden_duck_diner', name: 'Golden Duck', base: '#f8e03c', dark: '#6b5300', light: '#fcf5cc', felt: '#fce36c', print: '#fded75' },
  { id: 'santa_maria_pizza', name: 'Santa Maria', base: '#e4845a', dark: '#8a3a20', light: '#f7dfd4', felt: '#f0aa9a', print: '#d47a86' },
  { id: 'xango_blues_bar', name: 'Xango', base: '#6c9fe0', dark: '#24497a', light: '#dae6f4', felt: '#8fb1f2', print: '#007ab2' },
  { id: 'gluttony_inc', name: 'Gluttony', base: '#c8d79c', dark: '#3f5a12', light: '#f0f3e3', felt: '#e4f0c0', print: '#7c9a1c' },
  { id: 'siap_faji', name: 'Siap Faji', base: '#9cd9cf', dark: '#1f5d55', light: '#e6f4f0', felt: '#b4e0c9', print: '#86c2be' },
];

/** Earlier palettes by seat (the server, saved games and old fixtures may still send them). */
const LEGACY_SEAT_COLORS: readonly (readonly string[])[] = [
  // The first palette.
  ['#d94f3d', '#e8b730', '#3f8fd2', '#4caf6a', '#9b5fc0', '#f08a3c'],
  // The colour-blind retune (Ketchup, Mustard, Blueberry, Pickle, Grape, Tangerine).
  ['#b8352a', '#f2cf3f', '#2b62b8', '#5cc7b2', '#d77fc9', '#ef8a2f'],
];

/** A seat colour from the game state, mapped to the current palette (other colours pass through). */
export function seatColor(c: string): string;
export function seatColor(c: string | undefined): string | undefined;
export function seatColor(c: string | undefined): string | undefined {
  if (!c) return c;
  const lc = c.toLowerCase();
  for (const old of LEGACY_SEAT_COLORS) {
    const i = old.indexOf(lc);
    if (i >= 0) return PLAYER_COLORS[i]!.base;
  }
  return c;
}

/** Palette entry for a seat colour (current or earlier palette), or undefined for a custom colour. */
export function playerColorFor(c: string | undefined): PlayerColor | undefined {
  const base = seatColor(c)?.toLowerCase();
  return base ? PLAYER_COLORS.find((p) => p.base === base) : undefined;
}

const byChain = <K extends keyof PlayerColor>(k: K) => Object.fromEntries(PLAYER_COLORS.map((p) => [p.id, p[k]])) as Record<ChainId, PlayerColor[K]>;

/** Chain plastic colours (3D pieces, UI badges). */
export const CHAIN_COLORS: Record<ChainId, string> = byChain('base');
/** Chain print colours (flat 2D tiles). */
export const CHAIN_PRINT_COLORS: Record<ChainId, string> = byChain('print');
/** Chain felt colours (chrome trays). */
export const CHAIN_FELT_COLORS: Record<ChainId, string> = byChain('felt');
/** Chain names as the game prints them (rail wordmarks). */
export const CHAIN_NAMES: Record<ChainId, string> = {
  fried_geese_donkey: 'Fried Geese & Donkey',
  golden_duck_diner: 'Golden Duck Diner',
  santa_maria_pizza: 'Santa Maria Pizza',
  xango_blues_bar: 'Xango Blues Bar',
  gluttony_inc: 'Gluttony Inc.',
  siap_faji: 'Siap Faji',
};

/**
 * The key print colour of each good (docs/art-bible.md §2 "Goods"): bun, cheese, bottle green,
 * lemonade, soda red, coffee, kimchi, sushi filling, noodles. Goods are also told apart by token
 * shape (goodsGlyphs.ts), never by colour alone; the wooden token bodies are in GOOD_GLYPHS.
 */
export const FOOD_COLORS: Record<FoodId, string> = {
  burger: '#c98a4b',
  pizza: '#d4883a',
  beer: '#3e8e4d',
  lemonade: '#ffec46',
  soft_drink: '#d8262a',
  coffee: '#4a3226',
  kimchi: '#d84a2a',
  sushi: '#e98b8b',
  noodles: '#f2d79b',
};

/**
 * Employee card title bands by card colour (docs/art-bible.md §2 "Employee card families"), each
 * darkened where needed so the white script title passes WCAG AA (4.5:1) at every rendered size:
 * kitchen green, drinks (yellow) green, marketing blue, planning red, purple, recruiter / trainer
 * grey, manager black, pricing salmon (darkened), CEO charcoal, coffee teal.
 */
export const CARD_COLORS: Record<CardColour, string> = {
  ceo: '#494944',
  black: '#353633',
  grey: '#5d5f5b',
  purple: '#8350a8',
  red: '#aa3839',
  salmon: '#b8503d',
  blue: '#3d6fb0',
  oliveGreen: '#2f7a3f',
  lightGreen: '#557a1f',
  teal: '#2f6f73',
};

/** Milestone tile bands (base rulebook p.34–35) with their title text colour (AA at 11 px bold). */
export const MILESTONE_BANDS = {
  grey: { band: '#5d5f5b', ink: '#ffffff' },
  purple: { band: '#8350a8', ink: '#ffffff' },
  green: { band: '#70c83f', ink: '#262626' },
  lightGreen: { band: '#a9d46f', ink: '#262626' },
  blue: { band: '#4a6fba', ink: '#ffffff' },
  salmon: { band: '#e07a66', ink: '#262626' },
  red: { band: '#aa3839', ink: '#ffffff' },
} as const;
export type MilestoneBand = keyof typeof MILESTONE_BANDS;

/**
 * Banknote paper per denomination (docs/art-bible.md §2 "Money"; $20 and $100 are our
 * extrapolation) and the engraving ink, which reads at 7:1 or better on every note.
 */
export const MONEY_COLORS = {
  1: '#8fc9a0',
  5: '#b9c6e8',
  10: '#f2dc7e',
  20: '#9fd3cf',
  50: '#f3b4a4',
  100: '#b8c4b0',
  ink: '#3c3a36',
} as const;
export type Denomination = 1 | 5 | 10 | 20 | 50 | 100;

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

/** Text colour for a label on `bg` (player badges): white, or ink on light seats such as Golden Duck. */
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
    root.style.setProperty(`--player-${i}-felt`, p.felt);
    root.style.setProperty(`--player-${i}-ink`, inkOn(p.base));
  });
  for (const [k, v] of Object.entries(FOOD_COLORS)) root.style.setProperty(`--food-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(CARD_COLORS)) root.style.setProperty(`--card-${kebab(k)}`, v);
}
