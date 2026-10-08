/**
 * The goods token glyphs (docs/art-bible.md §6.12): one silhouette per good, after the Special
 * Edition's screen-printed wooden tokens (burger = round bun, pizza = wedge, beer and soda =
 * bottles, lemonade = glass, coffee = cup, kimchi = square dish, sushi = roll, noodles = bowl), with
 * a flat print on top. Our own drawing; nothing is traced from the product.
 *
 * Plain data on a 24×24 grid (SVG path strings), so every layer can use it:
 * - the UI icons (ui/icons.tsx FoodIcon) and the 2D board render it as SVG;
 * - canvas code can draw it with `new Path2D(d)` (see `drawGoodGlyph`);
 * - the 3D tokens can extrude `outline` (three's SVGLoader / ShapePath) and print the layers on the
 *   top face as a decal (`goodGlyphSvg` → texture).
 * No DOM or framework imports here.
 */
import type { FoodId } from "@fcm/engine";

export interface GlyphLayer {
  /** SVG path data on the 24×24 grid. */
  d: string;
  fill: string;
  opacity?: number;
}

export interface GoodGlyph {
  /** Token silhouette (one or more closed subpaths, nonzero fill): the extrusion outline. */
  outline: string;
  /** Wooden token body colour (the sides of the 3D token, the base of the icon). */
  body: string;
  /** The print on the top face, back to front. */
  layers: readonly GlyphLayer[];
}

/** Edge line drawn round the silhouette in 2D (warm dark, never black). */
export const GLYPH_EDGE = "#3a2c22";

/** An ellipse as path data (Path2D / SVGLoader friendly). */
const ell = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

const BUN = "#d9963f";
const SHINE = "#ffffff";

export const GOOD_GLYPHS: Record<FoodId, GoodGlyph> = {
  burger: {
    outline: ell(12, 12, 10.6),
    body: "#b07a3c",
    layers: [
      { d: ell(12, 12, 9.4), fill: "#f0d9a8" },
      { d: "M4.4 11.2C4.4 6.4 7.8 3.9 12 3.9S19.6 6.4 19.6 11.2Z", fill: BUN },
      {
        d: `${ell(9, 7.2, 0.7, 0.45)}${ell(12.2, 6, 0.7, 0.45)}${ell(15.2, 7.4, 0.7, 0.45)}${ell(10.6, 9.2, 0.7, 0.45)}${ell(13.9, 9.4, 0.7, 0.45)}`,
        fill: "#fbeac0",
      },
      {
        d: "M3.9 11.1q1.3 1.5 2.6 0t2.6 0 2.6 0 2.6 0 2.6 0 2.6 0v1.5H3.9Z",
        fill: "#5aa43a",
      },
      {
        d: "M4.3 12.5h15.4a1.4 1.4 0 0 1 0 2.8H4.3a1.4 1.4 0 0 1 0-2.8Z",
        fill: "#6b3a1e",
      },
      {
        d: "M4.8 15.8h14.4v.8a2.6 2.6 0 0 1-2.6 2.6H7.4a2.6 2.6 0 0 1-2.6-2.6Z",
        fill: BUN,
      },
    ],
  },
  pizza: {
    outline: "M12 22.6L2.5 6.2C5.1 3.6 8.4 2.3 12 2.3s6.9 1.3 9.5 3.9Z",
    body: "#d4883a",
    layers: [
      {
        d: "M2.5 6.2C5.1 3.6 8.4 2.3 12 2.3s6.9 1.3 9.5 3.9l-1.6 2.7C17.6 6.9 15 5.8 12 5.8S6.4 6.9 4.1 8.9Z",
        fill: "#b6570e",
      },
      {
        d: "M4.1 8.9C6.4 6.9 9 5.8 12 5.8s5.6 1.1 7.9 3.1L12 20.7Z",
        fill: "#f4c84a",
      },
      {
        d: `${ell(9.2, 10.2, 1.7)}${ell(14.6, 10.3, 1.6)}${ell(12, 14.8, 1.5)}`,
        fill: "#b8262f",
      },
    ],
  },
  beer: {
    outline:
      "M10 1.6h4v1.6h-.3v3.5c0 1.3 3.4 2.5 3.4 5.6v9.4a1.7 1.7 0 0 1-1.7 1.7H8.6a1.7 1.7 0 0 1-1.7-1.7v-9.4c0-3.1 3.4-4.3 3.4-5.6V3.2H10Z",
    body: "#5c8f5e",
    layers: [
      {
        d: "M10.3 3.2h3.4v3.5c0 1.3 3.4 2.5 3.4 5.6v9.4a1.7 1.7 0 0 1-1.7 1.7H8.6a1.7 1.7 0 0 1-1.7-1.7v-9.4c0-3.1 3.4-4.3 3.4-5.6Z",
        fill: "#3e8e4d",
      },
      { d: "M10 1.6h4v1.6h-4Z", fill: "#d9c35c" },
      { d: "M6.9 12.6h10.2v5.8H6.9Z", fill: "#f3ead0" },
      { d: ell(12, 15.5, 1.9, 1.5), fill: "#aa3839" },
      { d: "M8.5 12.2h.9v9.4h-.9Z", fill: SHINE, opacity: 0.35 },
    ],
  },
  soft_drink: {
    outline:
      "M10.2 1.6h3.6v2.3c0 1.6 1.7 2.6 1.7 5 0 1.6-.8 2.2-.8 3.4s1.4 2 1.4 4.4v4.9a1.7 1.7 0 0 1-1.7 1.7H9.6a1.7 1.7 0 0 1-1.7-1.7v-4.9c0-2.4 1.4-3.2 1.4-4.4s-.8-1.8-.8-3.4c0-2.4 1.7-3.4 1.7-5Z",
    body: "#d8262a",
    layers: [
      { d: "M10.2 1.6h3.6v1.4h-3.6Z", fill: "#c9c4cf" },
      {
        d: "M8.1 14.4c1.3-.9 2.6.9 3.9 0s2.6.9 3.9 0v1.9c-1.3.9-2.6-.9-3.9 0s-2.6-.9-3.9 0Z",
        fill: "#fdfcfa",
      },
      {
        d: "M9.6 17.6h.9v3.6h-.9ZM10.4 5.4h.8v4h-.8Z",
        fill: SHINE,
        opacity: 0.4,
      },
    ],
  },
  lemonade: {
    outline: `M5 5h14l-1.7 16.4a1.7 1.7 0 0 1-1.7 1.5H8.4a1.7 1.7 0 0 1-1.7-1.5Z${ell(17.6, 5.2, 3.3)}`,
    body: "#e8cf3a",
    layers: [
      {
        d: "M5 5h14l-1.7 16.4a1.7 1.7 0 0 1-1.7 1.5H8.4a1.7 1.7 0 0 1-1.7-1.5Z",
        fill: "#fff6c4",
      },
      {
        d: "M5.8 9h12.4l-1.3 12.2a1 1 0 0 1-1 .9H8.1a1 1 0 0 1-1-.9Z",
        fill: "#ffe23a",
      },
      { d: "M11.4 1.1l1 .2-1.6 9.6-1-.2Z", fill: "#c9303c" },
      { d: ell(17.6, 5.2, 3.3), fill: "#f2d12a" },
      { d: ell(17.6, 5.2, 2.3), fill: "#fff4a8" },
      { d: "M17.2 3h.8v4.4h-.8ZM15.4 4.8h4.4v.8h-4.4Z", fill: "#f2d12a" },
      { d: "M7.3 10.5h.9l.9 10h-.9Z", fill: SHINE, opacity: 0.55 },
    ],
  },
  coffee: {
    outline: `M3.8 8.4h13v6.1a5 5 0 0 1-5 5H8.8a5 5 0 0 1-5-5ZM16.6 10h1.3a2.7 2.7 0 0 1 0 5.4h-1.6v-1.8h1.6a.9.9 0 0 0 0-1.8h-1.3Z${ell(10.3, 20.2, 8.8, 2.3)}`,
    body: "#ece6da",
    layers: [
      { d: ell(10.3, 20.2, 8.8, 2.3), fill: "#fdfcfa" },
      {
        d: "M3.8 8.4h13v6.1a5 5 0 0 1-5 5H8.8a5 5 0 0 1-5-5Z",
        fill: "#fdfcfa",
      },
      { d: "M3.8 11.4h13v1.5h-13Z", fill: "#c9303c" },
      { d: ell(10.3, 8.4, 6.5, 1.6), fill: "#4a3226" },
      {
        d: "M7.6 6.2c-.8-1.2.8-1.8 0-3l.8-.4c.9 1.4-.7 2-.1 3.1ZM11.2 6.2c-.8-1.2.8-1.8 0-3l.8-.4c.9 1.4-.7 2-.1 3.1Z",
        fill: "#8a7a6a",
      },
    ],
  },
  kimchi: {
    outline:
      "M3.4 5.4a2 2 0 0 1 2-2h13.2a2 2 0 0 1 2 2v13.2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2Z",
    body: "#9cb575",
    layers: [
      {
        d: "M5.4 6.9a1.5 1.5 0 0 1 1.5-1.5h10.2a1.5 1.5 0 0 1 1.5 1.5v10.2a1.5 1.5 0 0 1-1.5 1.5H6.9a1.5 1.5 0 0 1-1.5-1.5Z",
        fill: "#d6e4bc",
      },
      {
        d: "M6.8 15.6c0-3.2 2.2-5.8 5.2-5.8s5.2 2.6 5.2 5.8c-1 1-2.1.6-3.1 1.2-1-.8-2.4-.6-3.4.2-1.2-.8-2.6-.2-3.9-1.4Z",
        fill: "#d84a2a",
      },
      {
        d: "M9.2 12.6c1-1.2 2.4-1.4 3.4-.4l-.5.6c-.8-.6-1.6-.4-2.3.3ZM13.2 14.2c.9-.9 2-.9 2.7 0l-.6.5c-.5-.5-1-.5-1.5 0Z",
        fill: "#f5d2a8",
      },
      {
        d: "M11.4 9.9c.3-1.3 1.2-2 2.3-2.1l.2.8c-.8.1-1.4.6-1.6 1.5Z",
        fill: "#5aa43a",
      },
    ],
  },
  sushi: {
    outline: ell(12, 12, 10),
    body: "#f1ece2",
    layers: [
      { d: ell(12, 12, 10), fill: "#262626" },
      { d: ell(12, 12, 7.6), fill: "#fdfcfa" },
      {
        d: `${ell(9.6, 9.8, 0.5, 0.35)}${ell(14.6, 9.4, 0.5, 0.35)}${ell(15.4, 14.2, 0.5, 0.35)}${ell(8.8, 14.6, 0.5, 0.35)}${ell(12, 16.6, 0.5, 0.35)}`,
        fill: "#e6e0d2",
      },
      { d: ell(12, 12, 3.6), fill: "#e98b8b" },
      { d: ell(13.1, 11.2, 1.3), fill: "#6aa84f" },
    ],
  },
  noodles: {
    outline:
      "M2.4 11h19.2a9.6 8.6 0 0 1-19.2 0ZM13.1 1.4l1 .3-2.3 9.6-1-.3ZM16.8 2.2l.9.5-4.1 9-.9-.5Z",
    body: "#5a3d7a",
    layers: [
      { d: "M3.1 11c2-2.4 15.8-2.4 17.8 0Z", fill: "#f2d79b" },
      {
        d: "M5 10.2c1.5-.8 2.5.6 4 0s2.5.6 4 0 2.5.6 4 0l.2.6c-1.5.8-2.7-.6-4.2 0s-2.5-.6-4 0-2.5-.6-4 0Z",
        fill: "#d8b46a",
      },
      {
        d: "M4 14.4h16a8.4 6 0 0 1-1.3 2.2H5.3A8.4 6 0 0 1 4 14.4Z",
        fill: "#e8dcc4",
      },
      {
        d: "M13.1 1.4l1 .3-2.3 9.6-1-.3ZM16.8 2.2l.9.5-4.1 9-.9-.5Z",
        fill: "#c98a4b",
      },
    ],
  },
};

/** Standalone SVG markup for one glyph (texture decals, `<img>` sources). */
export function goodGlyphSvg(food: FoodId, px = 64, edge = true): string {
  const g = GOOD_GLYPHS[food];
  const layers = g.layers
    .map(
      (l) =>
        `<path d="${l.d}" fill="${l.fill}"${l.opacity !== undefined ? ` fill-opacity="${l.opacity}"` : ""}/>`,
    )
    .join("");
  const stroke = edge
    ? `<path d="${g.outline}" fill="none" stroke="${GLYPH_EDGE}" stroke-width="1" stroke-linejoin="round"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><path d="${g.outline}" fill="${g.body}"/>${layers}${stroke}</svg>`;
}

/** Draw a glyph on a 2D canvas, centred at (x, y), `size` px across. */
export function drawGoodGlyph(
  ctx: CanvasRenderingContext2D,
  food: FoodId,
  x: number,
  y: number,
  size: number,
  edge = true,
): void {
  const g = GOOD_GLYPHS[food];
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  const outline = new Path2D(g.outline);
  ctx.fillStyle = g.body;
  ctx.fill(outline);
  for (const l of g.layers) {
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.fillStyle = l.fill;
    ctx.fill(new Path2D(l.d));
  }
  ctx.globalAlpha = 1;
  if (edge) {
    ctx.strokeStyle = GLYPH_EDGE;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.stroke(outline);
  }
  ctx.restore();
}
