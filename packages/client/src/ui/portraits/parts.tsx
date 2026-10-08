/**
 * Building blocks for the employee-card portraits (docs/art-bible.md §4 "Employee cards"): our own
 * 1950s advertising-style half-length figures, cel-shaded (flat fill + one shade + one light), with
 * a thin warm-dark outline, on a low-contrast grey backdrop. Nothing here is traced from the
 * product art.
 *
 * Coordinates: every portrait draws in the card frame `viewBox="0 0 100 70"`. The visible window
 * is roughly x 4..96, y 10..61 (the title band, up to two lines, and the torn panel overlap the
 * edges). Figures are drawn inside `Stage` in stage units; the backdrop is drawn outside it.
 *
 * - `Stage` zooms and lowers the figure so the base layout below fills the visible window; see its
 *   doc for the safe zone.
 * - `Backdrop` fills the frame (kitchen / office / street / warehouse / studio; `dark` for CEO).
 * - `Torso` is placed at the base of the neck (x, y ≈ 41) and draws neck, body and outfit; it is
 *   about 40 wide and runs to the bottom of the frame.
 * - `HairBack` (before the torso) and `Head` (after it) take the same `HeadProps`; the head is
 *   about 16 wide x 21 tall around its centre (put it at y ≈ torso y − 15), turned three-quarters
 *   to the viewer's right (`facing: -1` mirrors it).
 * - `Arm` draws a jointed shoulder-elbow-wrist sleeve with cuff and `Hand`; `Limb` a plain stroke.
 *
 * No ids (no gradients, filters, clip paths): dozens of cards render on one page.
 */
import type { ComponentChildren } from "preact";

/** Outline colour and width (viewBox units). */
export const INK = "#3a2a22";
export const SW = 0.55;

// --- Palettes -------------------------------------------------------------------------------------

export interface Tone {
  base: string;
  shade: string;
  light: string;
}

export interface SkinTone extends Tone {
  cheek: string;
}

/** Skin tones; vary them across the roster. */
export const SKIN = {
  fair: { base: "#f4d0b1", shade: "#dea482", light: "#fde6d2", cheek: "#ea7f6e" },
  ruddy: { base: "#efbf9b", shade: "#cf8f69", light: "#f9d8bf", cheek: "#e06a58" },
  golden: { base: "#efc8a0", shade: "#cf9b6e", light: "#f8dcbc", cheek: "#e5806a" },
  olive: { base: "#d9a77b", shade: "#b47f55", light: "#ebc19c", cheek: "#d2705a" },
  tan: { base: "#c88c5f", shade: "#a26a42", light: "#dda97f", cheek: "#c5604a" },
  brown: { base: "#a26a45", shade: "#7c4c2f", light: "#bc875e", cheek: "#b4553f" },
  deep: { base: "#76492f", shade: "#57341f", light: "#93613f", cheek: "#9c4836" },
} satisfies Record<string, SkinTone>;
export type SkinKey = keyof typeof SKIN;

/** Hair colours. */
export const HAIR = {
  black: { base: "#2a2321", shade: "#161110", light: "#55494a" },
  dark: { base: "#3f2a1b", shade: "#26170d", light: "#6a4a32" },
  brown: { base: "#6e4629", shade: "#4b2d18", light: "#9a6c46" },
  auburn: { base: "#a4492a", shade: "#76311a", light: "#cf7448" },
  blonde: { base: "#dcb46c", shade: "#b38945", light: "#f3db9f" },
  grey: { base: "#c0bcb4", shade: "#948f87", light: "#e6e3dd" },
} satisfies Record<string, Tone>;
export type HairKey = keyof typeof HAIR;

/** Mix `#rrggbb` toward white (t > 0) or black (t < 0). */
export function tint(css: string, t: number): string {
  const n = Number.parseInt(css.slice(1), 16);
  const ch = (sh: number) => {
    const v = (n >> sh) & 255;
    return Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** A cloth colour with derived shade and light. */
export const cloth = (base: string, shade = -0.28, light = 0.22): Tone => ({
  base,
  shade: tint(base, shade),
  light: tint(base, light),
});

/** Period cloth colours (never the card's family colour). */
export const CLOTH = {
  white: { base: "#f6f3ec", shade: "#d6d1c6", light: "#ffffff" },
  navy: cloth("#2f3e5e"),
  charcoal: cloth("#4a4b4f"),
  grey: cloth("#8a8d90"),
  tan: cloth("#b59a72"),
  brown: cloth("#6e4a33"),
  red: cloth("#b8343a"),
  burgundy: cloth("#7c2633"),
  mustard: cloth("#d3a238"),
  mint: cloth("#9fcfbf"),
  sky: cloth("#8db7d6"),
  pink: cloth("#e7a3a8"),
  coral: cloth("#e07a5a"),
  forest: cloth("#3e6a4c"),
  denim: cloth("#4f6f97"),
  cream: cloth("#efe5cc"),
  olive: cloth("#7b7a45"),
} satisfies Record<string, Tone>;

/** Outline props for a filled shape. */
export const ol = { stroke: INK, "stroke-width": SW, "stroke-linejoin": "round" } as const;
/** Props for a thin detail line. */
export const line = (color: string = INK, w = 0.45) =>
  ({
    fill: "none",
    stroke: color,
    "stroke-width": w,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }) as const;

// --- Backdrops ------------------------------------------------------------------------------------

export type BackdropKind = "kitchen" | "office" | "street" | "warehouse" | "studio";

const WASH = {
  light: { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" },
  dark: { wall: "#5a5c58", wall2: "#4b4d49", line: "#686a65", deep: "#3d3f3b", hi: "#71736e" },
};

/** The washed-out set behind the figure. `dark` is the charcoal wash for the CEO. */
export function Backdrop({ kind, dark = false }: { kind: BackdropKind; dark?: boolean }) {
  const c = dark ? WASH.dark : WASH.light;
  const base = <rect width="100" height="70" fill={c.wall} />;
  switch (kind) {
    case "kitchen":
      return (
        <g>
          {base}
          {/* Tiled wall */}
          <path
            d="M0 30h100M0 36h100M0 42h100M0 48h100M0 54h100M6 30v26M18 30v26M30 30v26M42 30v26M54 30v26M66 30v26M78 30v26M90 30v26"
            {...line(c.line, 0.4)}
          />
          {/* Range hood */}
          <path d="M8 0h30v9l7 9H1l7-9Z" fill={c.wall2} />
          <path d="M1 18h44v2H1Z" fill={c.deep} />
          {/* Shelf with pots and jars */}
          <path d="M62 21h38v1.6H62Z" fill={c.deep} />
          <path
            d="M65 21v-6h8v6ZM64 15h10v-1H64ZM77 21v-8a2 2 0 0 1 4 0v8ZM84 21v-5h5v5ZM91 21v-9h4v9Z"
            fill={c.line}
          />
          {/* Counter */}
          <path d="M0 56h100v14H0Z" fill={c.wall2} />
          <path d="M0 56h100v1.4H0Z" fill={c.hi} />
        </g>
      );
    case "office":
      return (
        <g>
          {base}
          {/* Window with venetian blinds */}
          <path d="M5 4h34v38H5Z" fill={c.hi} />
          <path
            d="M5 7h34M5 10h34M5 13h34M5 16h34M5 19h34M5 22h34M5 25h34M5 28h34M5 31h34M5 34h34M5 37h34M5 40h34"
            {...line(c.line, 0.7)}
          />
          <path d="M5 4h34v38H5Z" fill="none" stroke={c.deep} stroke-width="1.2" />
          {/* Framed sales chart */}
          <path d="M66 8h14v11H66Z" fill={c.hi} stroke={c.deep} stroke-width="0.8" />
          <path d="M68 17l3-3 3 2 4-6" {...line(c.deep, 0.6)} />
          {/* Filing cabinet */}
          <path d="M74 28h22v42H74Z" fill={c.wall2} />
          <path d="M74 41h22M74 54h22" {...line(c.deep, 0.6)} />
          <path d="M82 33h6v1.4h-6ZM82 46h6v1.4h-6ZM82 59h6v1.4h-6Z" fill={c.deep} />
          {/* Wainscot */}
          <path d="M0 50h74v20H0Z" fill={c.wall2} opacity="0.7" />
        </g>
      );
    case "street":
      return (
        <g>
          {base}
          {/* Striped awning over a shop window */}
          <path d="M0 4h100v9H0Z" fill={c.hi} />
          <path
            d="M0 4h8v9H0ZM16 4h8v9h-8ZM32 4h8v9h-8ZM48 4h8v9h-8ZM64 4h8v9h-8ZM80 4h8v9h-8ZM96 4h4v9h-4Z"
            fill={c.line}
          />
          <path
            d="M0 13q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 8 0q4 3 4 0Z"
            fill={c.line}
          />
          <path d="M4 20h40v32H4ZM58 20h38v32H58Z" fill={c.hi} />
          <path d="M24 20v32M77 20v32" {...line(c.line, 0.8)} />
          <path d="M4 20h40v32H4ZM58 20h38v32H58Z" fill="none" stroke={c.deep} stroke-width="1" />
          {/* Sidewalk */}
          <path d="M0 56h100v14H0Z" fill={c.wall2} />
          <path d="M0 56h100" {...line(c.deep, 0.6)} />
        </g>
      );
    case "warehouse":
      return (
        <g>
          {base}
          {/* Roll-up door */}
          <path d="M2 8h44v48H2Z" fill={c.wall2} />
          <path
            d="M2 13h44M2 18h44M2 23h44M2 28h44M2 33h44M2 38h44M2 43h44M2 48h44"
            {...line(c.line, 0.6)}
          />
          <path d="M2 8h44v48H2Z" fill="none" stroke={c.deep} stroke-width="1" />
          {/* Stacked crates */}
          <path d="M70 20h28v18H70ZM62 38h36v18H62Z" fill={c.hi} />
          <path
            d="M70 20h28v18H70ZM62 38h36v18H62ZM70 20l28 18M98 20l-28 18M62 38l18 18M80 38v18M80 38l18 18"
            {...line(c.deep, 0.6)}
          />
          {/* Loading-dock floor */}
          <path d="M0 56h100v14H0Z" fill={c.deep} opacity="0.55" />
          <path d="M0 56h100" {...line(c.hi, 0.8)} />
        </g>
      );
    case "studio":
      return (
        <g>
          {base}
          {/* Curtain folds */}
          <path
            d="M0 0h100v70H0ZM8 0v70M20 0v70M34 0v70M66 0v70M80 0v70M92 0v70"
            fill="none"
            stroke={c.line}
            stroke-width="1.6"
          />
          {/* Spotlight pools */}
          <path d="M30 0h40l14 70H16Z" fill={c.hi} opacity="0.75" />
          <path d="M0 58h100v12H0Z" fill={c.wall2} />
          <path d="M16 58l-2 12M84 58l2 12" {...line(c.line, 0.6)} />
        </g>
      );
  }
}

// --- Head -----------------------------------------------------------------------------------------

export type HairStyle =
  | "pompadour"
  | "sidePart"
  | "slicked"
  | "older"
  | "bald"
  | "victoryRolls"
  | "pinCurls"
  | "ponytail"
  | "bob"
  | "crop";

export type HatStyle = "none" | "toque" | "cap" | "waitress" | "paper" | "fedora";

/** Head shapes: oval (narrow, default), square (broad jaw), round (soft, full cheeks). */
export type FaceShape = "oval" | "square" | "round";

/** Expressions: toothy grin (default), closed smile, one-sided smirk, open "o" (calling, surprise). */
export type Mouth = "grin" | "smile" | "smirk" | "o";

export interface HeadProps {
  /** Head centre in viewBox units (chin is ~10 below, crown ~12 above). */
  x: number;
  y: number;
  skin: SkinKey;
  hair: HairStyle;
  hairColor: HairKey;
  /** 1 = turned three-quarters to the viewer's right; -1 mirrors. */
  facing?: 1 | -1;
  scale?: number;
  /** Tilt in degrees (positive = clockwise). */
  tilt?: number;
  /** Head shape (default "oval"). */
  shape?: FaceShape;
  /** Lashes, defined lipstick lips, finer brows. */
  female?: boolean;
  /** Lipstick colour (female); default cherry red. */
  lips?: string;
  /** Age marks: forehead lines, crow's feet, eye bags, deeper smile lines, jowl. */
  older?: boolean;
  moustache?: boolean;
  glasses?: boolean;
  /** Expression (default "grin"). */
  mouth?: Mouth;
  hat?: HatStyle;
  /** Hat colour (cap, paper hat, fedora). */
  hatColor?: Tone;
  /** Ribbon / band colour (ponytail bow, fedora band). */
  ribbon?: string;
}

const headTransform = (h: HeadProps) =>
  `translate(${h.x} ${h.y}) rotate(${h.tilt ?? 0}) scale(${(h.facing ?? 1) * (h.scale ?? 1)} ${h.scale ?? 1})`;

const FACES: Record<FaceShape, { face: string; shade: string }> = {
  oval: {
    face: "M-7 -3C-7.4 -9.4 6.6 -11 7.6 -4.2C8.2 -1.6 7.6 0.8 8 2.4C7.7 6.2 5 9.6 1.4 10.3C-2.2 10.7 -5.6 7.6 -6.7 3.6C-7.2 1.2 -7.2 -1 -7 -3Z",
    shade: "M5.4 -6C7.4 -3.6 7.8 -1 7.6 2.4C7.3 6 4.8 9.4 1.4 10.3C3.6 8 5 5.4 5.3 2.6C5.6 -0.4 5 -3.2 5.4 -6Z",
  },
  square: {
    face: "M-7.3 -3C-7.7 -9.6 6.8 -11.2 7.8 -4.2C8.3 -1.6 7.9 0.8 8.2 2.6C8.3 5.6 6.8 8.4 4 9.9C2 10.9 -1.4 11 -3.6 9.9C-6 8.6 -7 5.8 -7.2 3C-7.4 0.8 -7.4 -1 -7.3 -3Z",
    shade: "M5.6 -6C7.6 -3.6 8 -1 8 2.6C8 5.6 6.6 8.4 4 9.9C5.2 8 5.7 5.6 5.7 2.8C5.7 -0.4 5.2 -3.2 5.6 -6Z",
  },
  round: {
    face: "M-7.3 -3C-7.6 -9.4 6.9 -11 7.9 -4.2C8.6 -1.4 8.7 1.4 8.4 3.4C7.7 7.2 4.8 9.6 1.2 9.8C-2.6 10 -6.1 7.6 -7.1 3.8C-7.6 1.4 -7.6 -1 -7.3 -3Z",
    shade: "M5.8 -6C7.8 -3.4 8.5 -0.6 8.3 3.4C7.7 7 4.6 9.4 1.2 9.8C4 8 5.7 5.6 5.9 2.8C6.1 -0.4 5.4 -3.2 5.8 -6Z",
  },
};
const FACE_LIGHT =
  "M-5.4 1.6C-5.2 -0.2 -4 -0.6 -3 0.2C-3.8 0.6 -4.6 1.2 -5.4 2.4ZM1.2 -1.6L2.3 2.2L1.6 2.4Z";

/** Back-of-head hair that hangs behind the neck and shoulders (draw before the torso). */
export function HairBack(h: HeadProps) {
  const c = HAIR[h.hairColor];
  let d: string | null = null;
  let s: string | null = null;
  switch (h.hair) {
    case "victoryRolls":
      d =
        "M-8.8 -5C-12.6 -1 -12.6 7 -10.6 11.6C-9.2 14.4 -5.4 14.6 -3.4 12.4L-3 6C2 7 6 6 9.2 3C10.6 -1 10 -6 8 -8Z";
      s = "M-10.6 11.6C-9.2 14.4 -5.4 14.6 -3.4 12.4L-3.2 9C-5 10.6 -8 11 -10.6 11.6Z";
      break;
    case "bob":
      d =
        "M-8.6 -6C-11 -2 -11 4 -9.8 8.8C-8.4 10.6 -5.4 10.6 -3.8 9.6L-3.6 4C1 5 6 5 9 2.4C9.6 -1 9.4 -5 8 -8Z";
      s = "M-9.8 8.8C-8.4 10.6 -5.4 10.6 -3.8 9.6L-3.8 7.6C-5.6 8.6 -7.8 8.8 -9.8 8.8Z";
      break;
    case "ponytail":
      d =
        "M-6.4 -9.6C-11 -10.4 -13.6 -6 -13.4 -1C-13.2 3.6 -11.6 7.4 -12.8 12C-9.8 11 -8.4 7 -8.4 2.6C-8.4 -1.6 -8 -5 -6 -7.6Z";
      s = "M-13.4 -1C-13.2 3.6 -11.6 7.4 -12.8 12C-11 10 -10.4 6 -10.8 1.6Z";
      break;
    default:
      return null;
  }
  return (
    <g transform={headTransform(h)}>
      <path d={d} fill={c.base} {...ol} />
      <path d={s} fill={c.shade} />
    </g>
  );
}

interface HairShape {
  front: string;
  shade?: string;
  light?: string;
  lines?: string;
}

const HAIRS: Record<HairStyle, HairShape | null> = {
  pompadour: {
    front:
      "M-7.6 2C-8.2 -1 -8.4 -4 -7.8 -6.6C-6.6 -11.4 -1.8 -13.8 3 -13.4C6.6 -13.2 9.2 -11 8.8 -7.8C8.6 -6 8.2 -5 7.7 -4.2C6.6 -6.2 4.6 -7.4 2.2 -7.6C-0.8 -7.8 -3.6 -6.4 -5.2 -4C-5.4 -2 -5.4 0 -5.6 2Z",
    shade: "M-7.6 2C-8.2 -1 -8.4 -4 -7.8 -6.6C-7 -4.4 -6.6 -1 -6.2 2Z",
    light: "M-4 -11C-1 -12.8 3.4 -12.8 6.6 -11.2C3.4 -11.6 -0.4 -11.4 -4 -11Z",
    lines: "M-6.2 -5.6C-4.4 -9.4 -0.4 -10.8 4 -10.6M-6.8 -2.4C-6.2 -4.8 -4.8 -7.2 -2.2 -8.4",
  },
  sidePart: {
    front:
      "M-7.6 2C-8.4 -2 -8.4 -6 -7 -8.6C-5 -11.8 0 -12.6 4 -12C7 -11.4 8.4 -9 8 -6.6C7.9 -5.8 7.8 -5 7.6 -4.4C6.4 -6.8 3 -8.2 -0.6 -7.8C-3 -7.6 -4.8 -6 -5.4 -4C-5.6 -2 -5.4 0 -5.6 2Z",
    shade: "M-7.6 2C-8.4 -2 -8.4 -6 -7 -8.6C-6.8 -5.6 -6.4 -1.6 -6.2 2Z",
    light: "M-2 -11.2C1 -11.8 4.6 -11.4 6.6 -9.6C4 -10.4 1 -10.6 -2 -11.2Z",
    lines: "M-3.6 -11.4C-3.4 -10 -3.6 -8.8 -4.6 -7.2M-3 -10.4C0 -10.4 4 -9.8 6.6 -7.6",
  },
  slicked: {
    front:
      "M-7.6 2C-8.6 -3 -8 -8.4 -4.6 -10.6C-1 -12.6 5 -12 7.4 -8.6C8 -7.4 8 -5.8 7.6 -4.4C6.2 -6.6 3 -7.4 0 -7.2C-2.8 -7 -4.8 -5.8 -5.4 -3.8C-5.6 -1.8 -5.4 0 -5.6 2Z",
    shade: "M-7.6 2C-8.6 -3 -8 -8.4 -4.6 -10.6C-6.4 -7.6 -6.6 -2 -6.2 2Z",
    light: "M-4.6 -9C-2 -11 2.4 -11.4 5.4 -9.8C2.4 -10.2 -1.4 -9.8 -4.6 -9Z",
    lines: "M-6.4 -4C-4.6 -7.4 0 -9 5 -8.2",
  },
  older: {
    front:
      "M-7.8 2C-8.8 -2 -8.8 -6.6 -6.8 -9.4C-4.4 -12.4 0.8 -12.8 4.6 -11.8C7 -11.2 8.4 -9.6 8.1 -7.4C7 -8.6 5.4 -9.2 3.6 -9C1.4 -8.8 -0.6 -7.8 -2 -6.6C-3.4 -5.8 -4.6 -5 -5.1 -3.4C-5.3 -1.4 -5.2 0.2 -5.4 2Z",
    shade: "M-7.8 2C-8.8 -2 -8.8 -6.6 -6.8 -9.4C-6.8 -6 -6.6 -2 -6.2 2Z",
    light: "M-3.4 -10.8C0 -12 4 -11.6 6.4 -10.2C3.6 -10.6 0.4 -10.4 -3.4 -10.8Z",
    lines: "M-6.2 -5.4C-4.6 -7.6 -2.6 -8.6 0 -9.4M-6.6 -1.6C-6.4 -3.4 -5.8 -4.4 -5 -5.2",
  },
  bald: {
    front: "M-7.8 2C-8.4 -0.6 -8.4 -3 -7.6 -5.2C-6.8 -3.6 -5.8 -1 -5.4 2Z",
  },
  crop: {
    front:
      "M-7.6 2C-8.4 -2 -8.4 -6.4 -6.4 -9C-4 -11.6 1.4 -12.2 5 -11C7.2 -10.2 8.4 -8.4 8 -6.4C7.9 -5.6 7.8 -5 7.6 -4.4C6.2 -6.4 3.2 -7.4 0 -7.2C-2.6 -7 -4.6 -5.8 -5.3 -3.8C-5.5 -1.8 -5.4 0 -5.6 2Z",
    shade: "M-7.6 2C-8.4 -2 -8.4 -6.4 -6.4 -9C-6.6 -5.6 -6.4 -1.6 -6.2 2Z",
    light: "M-2.6 -10.6C0.4 -11.4 3.6 -11 5.6 -9.8C3.2 -10.2 0.4 -10.2 -2.6 -10.6Z",
  },
  victoryRolls: {
    front:
      "M-7.8 2C-8.8 -3 -8.6 -7 -6.6 -8.6L-7.4 -10.2C-7.6 -14.6 -1 -15.4 -0.4 -11.2C0.4 -15.6 7.8 -15 7.6 -10.4L8.2 -8C8.6 -6.6 8.4 -5.6 7.8 -4.2C6.2 -6.4 3.4 -7.2 0.6 -7C-2.6 -6.8 -4.8 -5.6 -5.4 -3.8C-5.6 -1.8 -5.4 0 -5.6 2Z",
    shade: "M-6.6 -8.6C-4.4 -9.2 -1.6 -9.6 0.2 -9.6C3 -9.6 6 -9.2 8.2 -8C6.2 -8.2 3 -8.4 0 -8.4C-2.4 -8.4 -4.6 -8.4 -6.6 -8.6Z",
    light: "M-5.8 -12.6C-4.6 -14 -2.6 -14 -1.8 -12.8C-3 -13.4 -4.4 -13.2 -5.8 -12.6ZM1.6 -13C2.8 -14.4 5 -14.4 6 -13C4.6 -13.6 3 -13.6 1.6 -13Z",
    lines: "M-3.6 -10.6a1.4 1.4 0 1 1 1.6 1.2M3.6 -10.8a1.4 1.4 0 1 1 1.6 1.2",
  },
  pinCurls: {
    front:
      "M-7.8 2.4a1.8 1.8 0 0 1 -0.8 -3.2a1.8 1.8 0 0 1 0 -3.4a2 2 0 0 1 1.6 -3.2a2 2 0 0 1 2.8 -2a2 2 0 0 1 3.4 -0.6a2 2 0 0 1 3.2 0.6a2 2 0 0 1 2.2 2.6a1.8 1.8 0 0 1 0.6 3.4C6 -6.6 3.4 -7.2 0.6 -7C-2.6 -6.8 -4.8 -5.6 -5.4 -3.8C-5.6 -1.8 -5.4 0 -5.6 2Z",
    shade: "M-7.8 2.4a1.8 1.8 0 0 1 -0.8 -3.2a1.8 1.8 0 0 1 0 -3.4C-7.6 -2.6 -6.6 0 -6.2 2.2Z",
    light: "M-4.6 -9.6a1.2 1.2 0 0 1 2 -0.6ZM0.6 -10.6a1.2 1.2 0 0 1 2 0Z",
    lines: "M-5 -7.6a1.2 1.2 0 1 1 1.6 1M0 -9.4a1.2 1.2 0 1 1 1.6 1M4.6 -8.6a1.1 1.1 0 1 1 1.4 1",
  },
  ponytail: {
    front:
      "M-7.6 2C-8.6 -3 -8 -8.4 -4.6 -10.6C-1 -12.6 5 -12 7.4 -8.6C8 -7.4 8 -5.8 7.6 -4.4C6.4 -5.4 5.4 -5.2 4.6 -6.4C3.2 -5.6 1.6 -5.8 0.6 -6.8C-1.6 -6.4 -4.4 -5.6 -5.4 -3.8C-5.6 -1.8 -5.4 0 -5.6 2Z",
    shade: "M-7.6 2C-8.6 -3 -8 -8.4 -4.6 -10.6C-6.4 -7.6 -6.6 -2 -6.2 2Z",
    light: "M-3.6 -10C-0.6 -11.4 3 -11.2 5.4 -9.6C2.6 -10 -0.6 -9.8 -3.6 -10Z",
    lines: "M-6 -4C-4.6 -7.6 -1 -9.4 2.6 -9.6",
  },
  bob: {
    front:
      "M-8.6 4C-10 -2 -9 -9 -4.6 -11.4C-0.6 -13.2 5.4 -12.6 8 -9C9.4 -7 9.6 -3.6 9.2 0C9 3 8.6 5.6 7.6 7C6.6 7.6 5.8 7.2 5.6 6.4C6.6 3.4 6.8 -0.6 6.8 -3.6C5.8 -4.4 4 -5 2.4 -5.4C0 -5.6 -2.8 -5 -4.6 -4C-5.4 -2 -5.4 1.4 -5.2 4.4Z",
    shade: "M5.6 6.4C6.6 3.4 6.8 -0.6 6.8 -3.6C7.8 -1 7.8 3 7.6 7C6.6 7.6 5.8 7.2 5.6 6.4ZM-8.6 4C-10 -2 -9 -9 -4.6 -11.4C-7 -8 -7.2 -2 -6.4 4.2Z",
    light: "M-3.6 -10.6C-0.4 -11.8 3.8 -11.4 6.4 -9.4C3.4 -10.2 0 -10.2 -3.6 -10.6Z",
    lines: "M-4.6 -4C-3 -7 0.6 -8.4 4.4 -8M2.4 -5.4C4.6 -6.4 6.8 -6 8.2 -4.6",
  },
};

interface HatShape {
  /** Main fill shape (hat colour); `white` hats use the cloth white. */
  body: string;
  shade?: string;
  /** Band or brim drawn over the body. */
  band?: string;
  lines?: string;
}

const HATS: Record<Exclude<HatStyle, "none">, HatShape> = {
  toque: {
    body: "M-7.6 -8.6C-11 -10.4 -10.6 -15.6 -6 -15.4C-5 -18.8 3.6 -19.4 5.4 -15.6C10 -16 11.4 -11 8.2 -8.6Z",
    shade: "M5.4 -15.6C10 -16 11.4 -11 8.2 -8.6L4.8 -8.6C7.2 -10.8 7.4 -13.6 5.4 -15.6Z",
    band: "M-7.8 -5.6C-3 -7.4 4 -7.6 8.4 -5.4L8.2 -9C3.6 -10.4 -3.2 -10.4 -7.6 -9Z",
    lines: "M-3.2 -10C-3.6 -12.6 -3.2 -15 -1.8 -16.8M2 -10C2.6 -12.6 2.8 -14.4 2.4 -16.8",
  },
  cap: {
    body: "M-7.9 -4C-8.8 -10 -4.2 -13.2 1 -13.2C6 -13.2 9 -10.2 8.6 -5.4Z",
    shade: "M-7.9 -4C-8.8 -10 -4.2 -13.2 1 -13.2C-3.4 -12 -6.4 -8.6 -6.4 -4.2Z",
    band: "M2.4 -5.6C7 -6.4 11.6 -6 13.8 -4.6C12.8 -3.2 9 -2.8 4.4 -3.2C3 -3.4 2.2 -4.4 2.4 -5.6Z",
    lines: "M1 -13.2C0.6 -10 0.8 -7.4 1.2 -5.2M0.3 -13.4h1.4",
  },
  waitress: {
    body: "M-5.8 -10.2C-2 -12.4 3.8 -12.4 7 -10.2L6.6 -13.6C3 -16.2 -2.6 -16 -5.4 -13.8Z",
    lines: "M-3 -11.6l0.2 -3.4M0.6 -12l0 -3.6M4 -11.6l-0.2 -3.4",
  },
  paper: {
    body: "M-7.2 -7.4C-2 -9.2 4 -9.2 8 -7.6L6.2 -13.8C2 -12.4 -2 -12.8 -5.2 -13.6Z",
    shade: "M-7.2 -7.4C-2 -9.2 4 -9.2 8 -7.6L7.6 -9.2C3.6 -10.4 -2.4 -10.4 -6.8 -9Z",
  },
  fedora: {
    body: "M-7.4 -7C-7.8 -12 -4 -15 1 -15C6 -15 8.6 -12 8.4 -7Z",
    shade: "M-7.4 -7C-7.8 -12 -4 -15 1 -15C-3 -13.4 -5.6 -10.4 -5.8 -7Z",
    band: "M-12 -6.6C-6 -8.6 8 -8.8 14 -6.2C12 -4.6 9 -4.6 7.6 -5.2C2 -6.6 -4 -6.4 -9 -5C-10.6 -4.8 -11.6 -5.4 -12 -6.6Z",
    lines: "M-1.6 -14.4C0 -13 2 -13 3.4 -14.4",
  },
};

/** The face, front hair and hat. Draw after the torso. */
export function Head(h: HeadProps) {
  const sk = SKIN[h.skin];
  const hc = HAIR[h.hairColor];
  const hair = HAIRS[h.hair];
  const hat = h.hat && h.hat !== "none" ? HATS[h.hat] : null;
  const hatTone =
    h.hat === "toque" || h.hat === "waitress" ? CLOTH.white : (h.hatColor ?? CLOTH.white);
  const female = h.female ?? false;
  const mouth = h.mouth ?? "grin";
  const lips = h.lips ?? "#b8303a";
  const lid = female ? 0.75 : 0.55;
  const face = FACES[h.shape ?? "oval"];
  return (
    <g transform={headTransform(h)}>
      <path d={face.face} fill={sk.base} {...ol} />
      <path d={face.shade} fill={sk.shade} />
      <path d={FACE_LIGHT} fill={sk.light} />
      {/* Shadow cast by the hair along the hairline */}
      {h.hair !== "bald" && (
        <path
          d="M-5.4 -3.8C-4.6 -5.8 -2.4 -7 0.6 -7C3.4 -7.2 6.2 -6.4 7.8 -4.2L7.7 -2.8C6 -4.6 3.4 -5.4 0.6 -5.4C-2 -5.4 -4.2 -4.4 -5.5 -2.4Z"
          fill={sk.shade}
          opacity="0.75"
        />
      )}
      {/* Rosy cheeks */}
      <path
        d="M-5.9 3.4a2 1.3 0 1 0 4 0a2 1.3 0 1 0 -4 0ZM4.4 3a1.4 1.1 0 1 0 2.8 0a1.4 1.1 0 1 0 -2.8 0Z"
        fill={sk.cheek}
        opacity="0.42"
      />
      {/* Eyes: whites, irises (glancing right), upper lids */}
      <path
        d="M-4.5 -0.5C-3.7 -1.8 -1.6 -1.8 -0.8 -0.6C-1.8 0.1 -3.5 0.2 -4.5 -0.5ZM2.8 -0.7C3.4 -1.8 4.9 -1.8 5.5 -0.9C4.9 -0.3 3.6 -0.2 2.8 -0.7Z"
        fill="#fbf7f0"
      />
      <path
        d="M-2.95 -0.75a.8 .8 0 1 0 1.6 0a.8 .8 0 1 0 -1.6 0ZM3.8 -0.85a.68 .72 0 1 0 1.36 0a.68 .72 0 1 0 -1.36 0Z"
        fill="#2c1e18"
      />
      <path d="M-1.85 -1.05a.3 .3 0 1 0 0.01 0ZM4.72 -1.12a.26 .26 0 1 0 0.01 0Z" fill="#ffffff" />
      <path
        d={
          female
            ? "M-4.9 -0.2C-4 -2 -1.6 -2 -0.7 -0.6M-4.7 -0.6l-1 -0.4M-4.3 -1.2l-0.8 -0.8M2.6 -0.6C3.4 -2 5 -1.9 5.7 -0.9M5.6 -1.1l0.9 -0.4M5.2 -1.5l0.6 -0.8"
            : "M-4.6 -0.4C-3.7 -1.9 -1.6 -1.9 -0.8 -0.6M2.7 -0.6C3.4 -1.9 4.9 -1.8 5.6 -0.9"
        }
        {...line(INK, lid)}
      />
      {/* Brows */}
      <path
        d="M-5.2 -3.3C-4 -4.8 -1.7 -4.8 -0.6 -3.7M2.8 -3.9C3.8 -4.8 5.4 -4.6 6.3 -3.3"
        {...line(hc.shade, female ? 0.55 : 0.9)}
      />
      {/* Nose */}
      <path d="M1 -0.2C1.4 1.4 2.4 2.6 3 3.4C2.6 4.2 1.6 4.3 0.9 3.8C1.1 2.4 0.6 1 1 -0.2Z" fill={sk.shade} />
      <path d="M1.1 0.2C1.5 1.6 2.4 2.6 3 3.4C2.6 4.2 1.6 4.3 0.9 3.8" {...line(INK, 0.45)} />
      {/* Mouth */}
      {mouth === "grin" && (
        <>
          <path
            d="M-2.2 5.3C-0.2 6 2.8 5.9 4.6 5C4.2 7.2 2.6 8.2 1 8.2C-0.8 8.2 -1.8 7 -2.2 5.3Z"
            fill="#6b2420"
            stroke={female ? lips : INK}
            stroke-width={female ? 0.85 : 0.45}
            stroke-linejoin="round"
          />
          <path d="M-1.9 5.5C-0.1 6.2 2.6 6.1 4.3 5.3L4 6.2C2.4 6.7 -0.1 6.7 -1.6 6.4Z" fill="#fdfbf6" />
        </>
      )}
      {(mouth === "smile" || mouth === "smirk") &&
        (female ? (
          <path
            d={
              mouth === "smile"
                ? "M-2 5.6C-0.8 5.1 0.4 5.3 1.1 5.7C1.9 5.1 3.3 5 4.5 5.3C3.8 7 2.4 7.6 1.1 7.6C-0.3 7.6 -1.4 6.8 -2 5.6ZM-2 5.6C-0.2 6.4 2.6 6.4 4.5 5.3"
                : "M-1.2 6.2C-0.2 5.6 0.8 5.6 1.4 5.9C2.2 5.2 3.6 4.8 4.8 4.6C4.2 6.4 2.8 7.2 1.4 7.2C0.2 7.2 -0.6 6.8 -1.2 6.2ZM-1.2 6.2C0.6 6.6 2.8 6 4.8 4.6"
            }
            fill={lips}
            stroke={INK}
            stroke-width="0.35"
            stroke-linejoin="round"
          />
        ) : (
          <path
            d={mouth === "smile" ? "M-2.4 5.6C-0.2 6.8 3 6.6 4.8 5.2" : "M-1.2 6.4C0.6 6.8 2.8 6.2 4.8 4.4M4.4 4.2l0.8 0.8"}
            {...line(INK, 0.6)}
          />
        ))}
      {mouth === "o" && (
        <path
          d="M-0.2 6.6a1.6 1.9 0 1 0 3.2 0a1.6 1.9 0 1 0 -3.2 0Z"
          fill="#6b2420"
          stroke={female ? lips : INK}
          stroke-width={female ? 0.85 : 0.45}
        />
      )}
      {/* Lid creases, smile lines, age marks */}
      <path
        d={`M-4.2 -2C-3.2 -2.7 -1.8 -2.6 -1 -1.9M3 -1.9C3.6 -2.5 4.8 -2.5 5.4 -1.9${
          mouth === "o" ? "" : "M-3.6 4C-4.2 5.2 -3.8 6.6 -2.8 7.2M5.8 3.6C6.4 4.6 6.2 5.6 5.6 6.2"
        }${
          h.older
            ? "M-4.6 -6.2C-2 -7 1 -7 4 -6.4M-4 -5.2C-1.6 -5.8 1 -5.8 3.4 -5.4M6.2 -0.6l1.2 -0.6M6.2 0.4l1.2 0.2M-5.4 -0.2l-0.8 -0.6M-4.2 0.7C-3.2 1.4 -1.8 1.4 -1 0.8M3 0.6C3.6 1.1 4.6 1.1 5.2 0.6M-4.4 3.4C-5.2 5.4 -4.6 7.4 -3.2 8.2M-5.6 6.6C-5 8.4 -3.6 9.6 -2 10"
            : ""
        }`}
        {...line(sk.shade, 0.5)}
      />
      {h.moustache && (
        <path
          d="M-0.6 4.6C0.6 3.7 2.2 3.7 3.1 4.3C4 3.8 5.2 3.9 5.8 4.8C4.8 5.3 3.6 5.2 3 4.9C2 5.5 0.4 5.6 -0.6 4.6Z"
          fill={hc.base}
          {...ol}
        />
      )}
      {/* Hair */}
      {hair && (
        <>
          <path d={hair.front} fill={hc.base} {...ol} />
          {hair.shade && <path d={hair.shade} fill={hc.shade} />}
          {hair.light && <path d={hair.light} fill={hc.light} />}
          {hair.lines && <path d={hair.lines} {...line(hc.shade, 0.45)} />}
        </>
      )}
      {/* Ear (over the side hair) */}
      <path d="M-6.2 -1.8C-8.8 -3.4 -9.8 2.4 -6.8 3.8C-6.4 2.4 -6.2 0 -6.2 -1.8Z" fill={sk.base} {...ol} />
      <path d="M-7.1 -0.6C-8.1 0 -7.9 1.6 -7.1 2.2" {...line(sk.shade, 0.5)} />
      {h.hair === "ponytail" && (
        <path
          d="M-6.6 -9.4l-2.6 -2.4l-0.4 3.4ZM-6.6 -9.4l2 -2.8l0.8 3Z"
          fill={h.ribbon ?? "#c8384a"}
          {...ol}
        />
      )}
      {h.glasses && (
        <path
          d="M-5 -2h4.8v2.8h-4.8ZM2.4 -2h3.8v2.6h-3.8ZM-0.2 -1.2h2.6M-5 -1.4l-2 -0.6"
          {...line(INK, 0.6)}
        />
      )}
      {hat && (
        <>
          <path d={hat.body} fill={hatTone.base} {...ol} />
          {hat.shade && <path d={hat.shade} fill={hatTone.shade} />}
          {hat.band && (
            <path
              d={hat.band}
              fill={h.hat === "fedora" ? hatTone.shade : hatTone.base}
              {...ol}
            />
          )}
          {hat.lines && <path d={hat.lines} {...line(hatTone.shade, 0.5)} />}
          {h.hat === "fedora" && (
            <path d="M-7.4 -7.4C-3 -8.6 4 -8.6 8.4 -7.4L8.3 -9C4 -10 -3 -10 -7.5 -9Z" fill={h.ribbon ?? "#3a2a22"} />
          )}
        </>
      )}
    </g>
  );
}

// --- Torso ----------------------------------------------------------------------------------------

export type Outfit =
  | "suit"
  | "chef"
  | "waitress"
  | "vest"
  | "work"
  | "overalls"
  | "blouse"
  | "sweater"
  | "tee";

export interface TorsoProps {
  /** Base of the neck in viewBox units. */
  x: number;
  y: number;
  skin: SkinKey;
  outfit: Outfit;
  /** Main garment colour (jacket, dress, vest, sweater, overalls). */
  main: Tone;
  /** Tie, neckerchief, bow, apron trim. */
  accent?: string;
  /** Shirt / blouse under the main garment. */
  shirt?: Tone;
  /** Width factor (1 = ~40 units at the hem). */
  width?: number;
  /** Apron over the outfit (tee, vest, waitress). */
  apron?: boolean;
  /** Bow tie instead of a long tie (suit, vest). */
  bow?: boolean;
}

const BODY =
  "M-20 31C-20.4 20 -19 11 -15 7.6C-12 5.4 -7.4 4 -3.8 1.4L3.8 1.4C7.4 4 12 5.4 15 7.6C19 11 20.4 20 20 31Z";
const BODY_SHADE = "M8.6 4.6C12 5.8 15 7.4 16.6 9.8C19.4 15 20.2 22 20 31L13.2 31C13.8 22 12.6 12 8.6 4.6Z";
const BODY_LIGHT = "M-15 7.6C-12 5.4 -8.4 4.4 -6 3.4C-8 5.4 -11.6 7.4 -15.4 10.6Z";
const ARM_SEAMS = "M-13.4 9C-15 16 -15 23 -14.6 31M13.4 9C15 16 15 23 14.6 31";

/** Neck, body and outfit, anchored at the base of the neck. */
export function Torso(t: TorsoProps) {
  const sk = SKIN[t.skin];
  const m = t.main;
  const shirt = t.shirt ?? CLOTH.white;
  const acc = t.accent ?? "#b8343a";
  const w = t.width ?? 1;
  const tie = t.bow ? (
    <path d="M-3.2 2.2l3.2 1.4l3.2 -1.4v3.2l-3.2 -1.4l-3.2 1.4Z" fill={acc} {...ol} />
  ) : (
    <path d="M-1.2 2.6h2.4l0.5 2.2l-0.6 0.4l1.1 9.6l-2.2 2.8l-2.2 -2.8l1.1 -9.6l-0.6 -0.4Z" fill={acc} {...ol} />
  );
  const shirtCollar = (
    <path d="M-4.2 0.6L-1.6 5.2L0 2.6L1.6 5.2L4.2 0.6L3.8 -0.6C1.5 0.8 -1.5 0.8 -3.8 -0.6Z" fill={shirt.base} {...ol} />
  );
  let outfit: ComponentChildren = null;
  switch (t.outfit) {
    case "suit":
      outfit = (
        <>
          <path d="M-4.4 1.2L0 19L4.4 1.2Z" fill={shirt.base} />
          {tie}
          {shirtCollar}
          <path d="M-4.6 1.2L-0.3 19L-3.4 12.4L-7.8 7.2L-5.6 5.6Z" fill={m.shade} {...ol} />
          <path d="M4.6 1.2L0.3 19L3.4 12.4L7.8 7.2L5.6 5.6Z" fill={m.shade} {...ol} />
          <path d="M-12.6 11.6l3.4 -1l1 2.2l-4 0.6Z" fill={shirt.base} />
          <path d="M0.4 22.4a.8 .8 0 1 0 0.01 0Z" fill={INK} />
        </>
      );
      break;
    case "chef":
      outfit = (
        <>
          <path d="M-1.6 4C2.4 10 5 18 5.4 31" {...line(m.shade, 0.6)} />
          <path
            d="M-4.4 13a.7 .7 0 1 0 0.01 0ZM-4.6 19a.7 .7 0 1 0 0.01 0ZM-4.8 25a.7 .7 0 1 0 0.01 0ZM8.6 13a.7 .7 0 1 0 0.01 0ZM9 19a.7 .7 0 1 0 0.01 0ZM9.2 25a.7 .7 0 1 0 0.01 0Z"
            fill="none"
            stroke={m.shade}
            stroke-width="1.3"
          />
          <path d="M-4.6 -0.4C-2 2 2 2 4.6 -0.4L5 2.4C2 4.6 -2 4.6 -5 2.4Z" fill={acc} {...ol} />
          <path d="M0.6 3.4L4.4 9.2L-0.4 7Z" fill={acc} {...ol} />
        </>
      );
      break;
    case "waitress":
      outfit = (
        <>
          <path d="M0 6v25" {...line(m.shade, 0.5)} />
          <path d="M0.8 9a.7 .7 0 1 0 0.01 0ZM0.8 14a.7 .7 0 1 0 0.01 0Z" fill="none" stroke={CLOTH.white.base} stroke-width="1.3" />
          {/* Puff sleeves */}
          <path d="M-20 15C-21.4 9 -18.6 6 -14.6 6.8C-13 9 -13 13 -14.2 16Z" fill={m.base} {...ol} />
          <path d="M20 15C21.4 9 18.6 6 14.6 6.8C13 9 13 13 14.2 16Z" fill={m.shade} {...ol} />
          {/* Peter Pan collar */}
          <path
            d="M-4.4 0.8C-7.2 1.6 -8.8 4.4 -7.2 6.6C-4.6 7.2 -1.8 5.6 0 3.4C1.8 5.6 4.6 7.2 7.2 6.6C8.8 4.4 7.2 1.6 4.4 0.8C2 2.4 -2 2.4 -4.4 0.8Z"
            fill={CLOTH.white.base}
            {...ol}
          />
        </>
      );
      break;
    case "vest":
      outfit = (
        <>
          {tie}
          {shirtCollar}
          <path d="M-11.4 6.4C-8 5.2 -5.4 3.4 -4 1.6L0 17L4 1.6C5.4 3.4 8 5.2 11.4 6.4L12.4 31H-12.4Z" fill={m.base} {...ol} />
          <path d="M6 6L4 1.6L0 17L1 31H12.4L11.4 6.4C9.2 6 7.6 5.4 6 6Z" fill={m.shade} opacity="0.6" />
          <path d="M0.8 20a.7 .7 0 1 0 0.01 0ZM1 25a.7 .7 0 1 0 0.01 0Z" fill="none" stroke={INK} stroke-width="1.2" />
        </>
      );
      break;
    case "work":
      outfit = (
        <>
          <path d="M-3.6 1.4L0 7L3.6 1.4Z" fill={shirt.base} {...ol} />
          <path d="M-4 0.6L-7.8 4.6L-3 9L0 7ZM4 0.6L7.8 4.6L3 9L0 7Z" fill={m.light} {...ol} />
          <path d="M0 7V31" {...line(m.shade, 0.7)} />
          <path d="M-12 12h7v6h-7ZM-12 12l3.5 2l3.5 -2" fill="none" stroke={m.shade} stroke-width="0.6" stroke-linejoin="round" />
        </>
      );
      break;
    case "overalls":
      outfit = (
        <>
          {shirtCollar}
          <path d="M-10 31V16C-6 15 6 15 10 16V31Z" fill={m.base} {...ol} />
          <path d="M-9.6 16L-11.6 5.6M9.6 16L11.6 5.6" {...line(m.base, 2.2)} />
          <path d="M-8.4 17a1 1 0 1 0 0.01 0ZM8.4 17a1 1 0 1 0 0.01 0Z" fill="#d9c27a" {...ol} />
          <path d="M-4 20h8v5h-8Z" fill="none" stroke={m.shade} stroke-width="0.6" />
        </>
      );
      break;
    case "blouse":
      outfit = (
        <>
          <path d="M-4.6 0.6C-6 3 -6.6 6 -5 8.4L0 4L5 8.4C6.6 6 6 3 4.6 0.6C2 2.6 -2 2.6 -4.6 0.6Z" fill={m.light} {...ol} />
          <path d="M0 4V31" {...line(m.shade, 0.5)} />
          <path d="M0 5.6a1.2 1.2 0 1 0 0.01 0Z" fill={acc} {...ol} />
        </>
      );
      break;
    case "sweater":
      outfit = (
        <>
          <path d="M-4.6 1.2L0 11L4.6 1.2Z" fill={shirt.base} />
          {shirtCollar}
          <path d="M-5.2 1L0 11.6L5.2 1" {...line(m.shade, 1.4)} />
        </>
      );
      break;
    case "tee":
      outfit = <path d="M-4.4 0.8C-3 3.8 3 3.8 4.4 0.8" {...line(m.shade, 1)} />;
      break;
  }
  const apron =
    t.apron &&
    (t.outfit === "waitress" ? (
      <path d="M-8.4 16.4C-4 17.2 4 17.2 8.4 16.4L9 31H-9Z" fill={CLOTH.white.base} {...ol} />
    ) : (
      <>
        <path d="M-8 9.4h16L10 31H-10Z" fill={CLOTH.white.base} {...ol} />
        <path d="M-7.6 9.6L-4.2 1.6M7.6 9.6L4.2 1.6" {...line(CLOTH.white.shade, 1)} />
      </>
    ));
  return (
    <g transform={`translate(${t.x} ${t.y}) scale(${w} 1)`}>
      <path d="M-4 -9V2C-1.6 3.6 1.6 3.6 4 2V-9Z" fill={sk.base} {...ol} />
      <path d="M-4 -3.6C-1 -1.4 2 -1.4 4 -3.6V-9H-4Z" fill={sk.shade} />
      <path d={BODY} fill={m.base} {...ol} />
      <path d={BODY_SHADE} fill={m.shade} />
      <path d={BODY_LIGHT} fill={m.light} />
      <path d={ARM_SEAMS} {...line(m.shade, 0.5)} />
      {outfit}
      {apron}
    </g>
  );
}

// --- Hands ----------------------------------------------------------------------------------------

/**
 * Hand poses. Each is drawn with the wrist at the bottom (0, 3.6) and the fingers toward −y, about
 * 7 wide and 9 tall: fist (knuckles to the viewer, thumb across, grips a handle running left-right),
 * open (flat, fingers together, thumb out; turn it 90° to carry a plate on the palm), pinch (pen or
 * pencil between thumb and index), thumb (thumbs-up), point (index finger up).
 */
export type HandPose = "fist" | "open" | "pinch" | "thumb" | "point";

const FIST =
  "M-3.2 3.4C-3.6 1 -3.8 -2 -3 -3.4C-1.6 -4.6 2 -4.6 3.2 -3.6C4 -2.4 4 0.6 3.4 2.4C2.8 3.8 -2.4 4.2 -3.2 3.4Z";

const HANDS: Record<HandPose, { fill: string; thumb: string; lines: string }> = {
  fist: {
    fill: FIST,
    thumb: "M-3.5 -0.6C-1.6 -1.6 1.6 -1.4 2.8 -0.2C2.8 0.9 1.6 1.4 0.4 1.1C-1 0.8 -2.4 1.1 -3.4 1.5Z",
    lines: "M-1.4 -4.3C-1.6 -2.8 -1.6 -1.8 -1.4 -1M0.4 -4.5C0.2 -3 0.2 -2 0.4 -1.2M2.1 -4.1C1.9 -2.9 1.9 -1.9 2.1 -0.9",
  },
  open: {
    fill: "M-2.8 3.6C-3.2 1.6 -3.2 -0.4 -3 -2.4C-2.9 -4.6 -2.6 -6.4 -1.2 -6.8C0.6 -7.2 2.4 -6.8 2.8 -5.4C3.2 -3.6 3.2 -1 3 1.4C2.8 3 -2.2 4.2 -2.8 3.6Z",
    thumb: "M-2.9 1C-4.8 0.2 -5.8 -1.6 -5.2 -2.6C-4.4 -3.1 -3.2 -2 -2.8 -1.2Z",
    lines: "M-1.3 -6.5V-2.8M0.4 -6.9V-2.8M1.9 -6.5V-2.8M-1.6 1C-0.4 1.8 1 1.6 2 0.8",
  },
  pinch: {
    fill: "M-3.2 3.4C-3.6 1 -3.8 -2 -3 -3.4C-2.2 -4.2 -0.8 -4.4 0.4 -4.2L2.6 -6.6C3.4 -7.2 4.4 -6.4 3.8 -5.6L2.8 -3.6C3.9 -2.4 3.9 0.6 3.4 2.4C2.8 3.8 -2.4 4.2 -3.2 3.4Z",
    thumb: "M-3.4 -0.6C-1.6 -1.8 0.4 -3.2 1.9 -4.4C2.5 -3.4 1.8 -2 0.6 -1.1C-0.6 -0.3 -2 0.2 -3.3 0.6Z",
    lines: "M-0.4 0.8C0.8 1 2 1.2 3.4 1M-0.8 2.2C0.4 2.4 1.8 2.6 3.1 2.4M-1.6 -3.9V-2.2",
  },
  thumb: {
    fill: FIST,
    thumb: "M-2.8 -3.2C-3 -5.8 -2.6 -7.8 -1.2 -8C0 -8 0.3 -6.2 0.1 -3.8Z",
    lines: "M-3.4 -1.6H3.6M-3.6 0.2H3.8M-3.4 1.9H3.4",
  },
  point: {
    fill: "M-3.2 3.4C-3.6 1 -3.8 -2 -3 -3.4C-2.4 -4 -1.4 -4.3 -0.6 -4.3L-0.6 -8.8C-0.6 -10 1.4 -10 1.4 -8.8L1.4 -4.3C2.2 -4.2 2.8 -4 3.2 -3.6C4 -2.4 4 0.6 3.4 2.4C2.8 3.8 -2.4 4.2 -3.2 3.4Z",
    thumb: "M-3.5 -0.6C-1.6 -1.6 1.6 -1.4 2.8 -0.2C2.8 0.9 1.6 1.4 0.4 1.1C-1 0.8 -2.4 1.1 -3.4 1.5Z",
    lines: "M1.4 -3.6V-1.2M2.8 -3.2V-1M-0.6 -4.2V-1.4",
  },
};

/** A hand with its wrist at (x, y), fingers pointing `rot` degrees clockwise from straight up. */
export function Hand({
  x,
  y,
  skin,
  pose,
  rot = 0,
  flip = false,
  scale = 1,
}: {
  x: number;
  y: number;
  skin: SkinKey;
  pose: HandPose;
  rot?: number;
  /** Mirror left-right (a left hand). */
  flip?: boolean;
  scale?: number;
}) {
  const s = SKIN[skin];
  const h = HANDS[pose];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -scale : scale} ${scale}) translate(0 -3.6)`}>
      <path d={h.fill} fill={s.base} {...ol} />
      <path d={h.lines} {...line(INK, 0.4)} />
      <path d={h.thumb} fill={s.light} {...ol} />
    </g>
  );
}

// --- Arms -----------------------------------------------------------------------------------------

export type Pt = readonly [number, number];

const r1 = (n: number) => Math.round(n * 100) / 100;

/** A tapered quad from a (width wa) to b (width wb), always wound clockwise on screen. */
function seg(a: Pt, b: Pt, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Pt[] = [
    [a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2],
    [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2],
    [b[0] - (nx * wb) / 2, b[1] - (ny * wb) / 2],
    [a[0] - (nx * wa) / 2, a[1] - (ny * wa) / 2],
  ];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % 4]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area < 0) pts.reverse();
  return `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join("L")}Z`;
}

/** The shaded outer third of a tapered segment, on the side facing right / down. */
function strip(a: Pt, b: Pt, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx + ny * 0.5 < 0) {
    nx = -nx;
    ny = -ny;
  }
  const p = (c: Pt, w: number, f: number): string => `${r1(c[0] + (nx * w * f) / 2)} ${r1(c[1] + (ny * w * f) / 2)}`;
  return `M${p(a, wa, 0.25)}L${p(b, wb, 0.25)}L${p(b, wb, 1)}L${p(a, wa, 1)}Z`;
}

/** A clockwise circle subpath. */
const dot = (c: Pt, r: number) =>
  `M${r1(c[0] - r)} ${r1(c[1])}A${r1(r)} ${r1(r)} 0 1 1 ${r1(c[0] + r)} ${r1(c[1])}A${r1(r)} ${r1(r)} 0 1 1 ${r1(c[0] - r)} ${r1(c[1])}Z`;

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Shoulder-elbow-wrist outline (union of round joints and tapered segments) up to `to` (0..2). */
function armShape(s: Pt, e: Pt, w: Pt, ws: number, we: number, ww: number, to = 2): string {
  if (to <= 1) {
    const p = lerp(s, e, to);
    return dot(s, ws / 2) + seg(s, p, ws, ws + (we - ws) * to);
  }
  const p = lerp(e, w, to - 1);
  return dot(s, ws / 2) + seg(s, e, ws, we) + dot(e, we / 2) + seg(e, p, we, we + (ww - we) * (to - 1));
}

/** One outlined silhouette: an ink layer slightly fatter than the fill layer, so joints merge. */
function Solid({ d, fill }: { d: string; fill: string }) {
  return (
    <>
      <path d={d} fill={INK} stroke={INK} stroke-width={SW * 2} stroke-linejoin="round" />
      <path d={d} fill={fill} />
    </>
  );
}

export interface ArmProps {
  /** Shoulder, elbow, wrist (viewBox units, inside the Stage). */
  s: Pt;
  e: Pt;
  w: Pt;
  skin: SkinKey;
  /** Sleeve cloth; omit for a bare arm. */
  sleeve?: Tone;
  /** How far the sleeve runs along shoulder→elbow (0..1) →wrist (1..2). Default 2 (long sleeve). */
  sleeveTo?: number;
  /** Cuff colour at the end of a long sleeve; false for none. Default shirt white. */
  cuff?: string | false;
  /** Upper-arm width (default 7); the elbow and wrist taper from it. */
  width?: number;
  /** Hand at the wrist; false for none (e.g. hidden behind a prop). */
  hand?: HandPose | false;
  /** Hand angle override in degrees (default: along the forearm). */
  handRot?: number;
  handFlip?: boolean;
  handScale?: number;
}

/** A jointed arm with tapered sleeve, cel shade, cuff and hand. Draw after the torso. */
export function Arm(a: ArmProps) {
  const ws = a.width ?? 7;
  const we = ws * 0.82;
  const ww = ws * 0.62;
  const sk = SKIN[a.skin];
  const to = a.sleeve ? Math.min(a.sleeveTo ?? 2, 2) : 0;
  const longSleeve = to >= 2;
  const dx = a.w[0] - a.e[0];
  const dy = a.w[1] - a.e[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const rot = a.handRot ?? (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  const cuffA: Pt = [a.w[0] - ux * 1.8, a.w[1] - uy * 1.8];
  // Shade strip along the edge of each segment away from the light (upper left).
  const shade = strip(a.s, a.e, ws, we) + strip(a.e, a.w, we, longSleeve ? ww : we);
  return (
    <g>
      {to < 2 && <Solid d={armShape(a.s, a.e, a.w, ws * 0.92, we * 0.9, ww * 0.9)} fill={sk.base} />}
      {a.sleeve && (
        <>
          <Solid d={armShape(a.s, a.e, a.w, ws, we, ww, to)} fill={a.sleeve.base} />
          {longSleeve && <path d={shade} fill={a.sleeve.shade} />}
        </>
      )}
      {longSleeve && a.cuff !== false && (
        <path d={seg(cuffA, a.w, ww + 0.4, ww + 0.4)} fill={a.cuff ?? CLOTH.white.base} {...ol} />
      )}
      {a.hand && (
        <Hand x={a.w[0]} y={a.w[1]} skin={a.skin} pose={a.hand} rot={rot} flip={a.handFlip} scale={a.handScale ?? 1} />
      )}
    </g>
  );
}

/** A simple outlined round-capped stroke along `d` (straps, handles, quick sleeves). */
export function Limb({ d, w = 6.5, color }: { d: string; w?: number; color: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} stroke-width={w + SW * 2} stroke-linecap="round" stroke-linejoin="round" />
      <path d={d} fill="none" stroke={color} stroke-width={w} stroke-linecap="round" stroke-linejoin="round" />
    </>
  );
}

// --- Stage ----------------------------------------------------------------------------------------

/**
 * The figure layer. Draw inside it in "stage" units: head at (50, 27), torso at (x, 41). It maps
 * stage (x, y) to frame (50 + (x − 50)·s, 30 + (y − 27)·s), s = 1.22, which fills the visible
 * window and keeps hats and hair below the title band (two-line titles at 96 and 180 px).
 *
 * Safe zone in stage units: x 13..87; y ≥ 11 for anything that must show (hair, hats: keep the
 * head's topmost point ≥ 16 above its centre, toque heads at y ≈ 30); y ≤ 51 for props (the
 * panel hides the rest). Faces sit at y 17..38.
 */
export function Stage({ s = 1.22, children }: { s?: number; children: ComponentChildren }) {
  return <g transform={`translate(50 30) scale(${s}) translate(-50 -27)`}>{children}</g>;
}

// --- Frame ----------------------------------------------------------------------------------------

/** The old flat silhouette, kept as the fallback for ids without a portrait. */
export function Silhouette({ color, dark }: { color: string; dark: boolean }) {
  const head = tint(color, 0.62);
  const hair = tint(color, -0.35);
  const wash = dark ? ["#5b5c57", "#43443f"] : ["#e3e7e4", "#c4ccc9"];
  const ln = dark ? "#6c6d68" : "#d3d9d6";
  const prop = dark ? "#3a3b37" : "#b4bcb9";
  return (
    <g>
      <rect width="100" height="70" fill={wash[1]} />
      <rect width="100" height="44" fill={wash[0]} opacity="0.85" />
      <path d="M6 6h22v24H6ZM31 6h22v24H31Z" fill="none" stroke={ln} stroke-width="1.6" />
      <path d="M17 6v24M6 18h22M42 6v24M31 18h22" stroke={ln} stroke-width="0.8" />
      <path d="M62 22h34M62 34h34" stroke={ln} stroke-width="1.4" />
      <path d="M0 56h100v14H0Z" fill={prop} opacity="0.45" />
      <path d="M24 70c1-12 9-20 26-21 17 1 25 9 26 21Z" fill={color} />
      <path d="M45.5 41h9v8.5c-3 2.4-6 2.4-9 0Z" fill={tint(head, -0.12)} />
      <ellipse cx="50" cy="31" rx="10.5" ry="12.5" fill={head} />
      <path
        d="M39.4 30c-.6-9 4.4-13.6 10.6-13.6S61.2 21 60.6 30c-1.6-4.4-4.4-7-10.6-7.4-6.2.4-9 3-10.6 7.4Z"
        fill={hair}
      />
    </g>
  );
}
