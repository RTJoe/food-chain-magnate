/**
 * Money graphics (docs/art-bible.md §4 "Money and cash displays"): engraved-style banknotes in the
 * denomination colours, the bank's note stack, and the small banknote bundle used as the salary
 * icon and next to cash figures. Our own design after the Special Edition notes: dark engraved
 * border bands, scalloped corners, Rye numerals, a food vignette in a guilloche rosette.
 */
import type { FoodId } from "@fcm/engine";
import { MONEY_COLORS, type Denomination } from "../theme.js";
import { GlyphPaths } from "./icons.js";

const WORDS: Record<Denomination, string> = {
  1: "One",
  5: "Five",
  10: "Ten",
  20: "Twenty",
  50: "Fifty",
  100: "Hundred",
};
const VIGNETTE: Record<Denomination, FoodId> = {
  1: "pizza",
  5: "burger",
  10: "lemonade",
  20: "beer",
  50: "soft_drink",
  100: "coffee",
};
const INK = MONEY_COLORS.ink;

/** Engraved frame: a rectangle with concave (scalloped) corners, inset by `i`. */
const frame = (w: number, h: number, i: number, r: number) =>
  `M${i + r} ${i}H${w - i - r}A${r} ${r} 0 0 0 ${w - i} ${i + r}V${h - i - r}A${r} ${r} 0 0 0 ${w - i - r} ${h - i}H${i + r}A${r} ${r} 0 0 0 ${i} ${h - i - r}V${i + r}A${r} ${r} 0 0 0 ${i + r} ${i}Z`;

/** Guilloche rosette: rays round a centre (engraving texture). */
function Rosette({
  cx,
  cy,
  r,
  n = 28,
}: {
  cx: number;
  cy: number;
  r: number;
  n?: number;
}) {
  const rays = Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return `M${(cx + Math.cos(a) * r * 0.55).toFixed(1)} ${(cy + Math.sin(a) * r * 0.55).toFixed(1)}L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join("");
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={INK}
        stroke-opacity="0.35"
        stroke-width="0.8"
        stroke-dasharray="1.6 1.2"
      />
      <path d={rays} stroke={INK} stroke-opacity="0.22" stroke-width="0.7" />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.55}
        fill="none"
        stroke={INK}
        stroke-opacity="0.45"
        stroke-width="0.8"
      />
    </g>
  );
}

/** A banknote, landscape 2:1. Decorative unless `label` is given. */
export function Banknote({
  value,
  width = 160,
  label,
  class: cls,
}: {
  value: Denomination;
  width?: number;
  label?: string;
  class?: string;
}) {
  const W = 200;
  const H = 100;
  const paper = MONEY_COLORS[value];
  const n = String(value);
  return (
    <svg
      class={`banknote ${cls ?? ""}`}
      width={width}
      height={width / 2}
      viewBox={`0 0 ${W} ${H}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <rect width={W} height={H} rx="3" fill={paper} />
      <path d={frame(W, H, 4, 9)} fill={INK} />
      <path d={frame(W, H, 13, 8)} fill={paper} />
      <ellipse
        cx={W / 2}
        cy={H / 2}
        rx="70"
        ry="30"
        fill="#fffdf4"
        opacity="0.4"
      />
      <path
        d={frame(W, H, 17, 6)}
        fill="none"
        stroke={INK}
        stroke-width="0.8"
        stroke-opacity="0.6"
      />
      <text
        x={W / 2}
        y="11.2"
        text-anchor="middle"
        font-family="'Barlow Condensed', sans-serif"
        font-weight="700"
        font-size="7.5"
        letter-spacing="0.6"
        fill={paper}
      >
        FOOD CHAIN MAGNATE
      </text>
      <text
        x={W / 2}
        y="96"
        text-anchor="middle"
        font-family="'Rye', Georgia, serif"
        font-size="8"
        fill={paper}
      >
        {WORDS[value]} Dollar{value === 1 ? "" : "s"}
      </text>
      <Rosette cx={W / 2} cy={H / 2 + 1} r={27} />
      <svg
        x={W / 2 - 17}
        y={H / 2 - 16}
        width="34"
        height="34"
        viewBox="0 0 24 24"
      >
        <GlyphPaths food={VIGNETTE[value]} />
      </svg>
      <Rosette cx={40} cy={H / 2 + 6} r={11} n={18} />
      <Rosette cx={160} cy={H / 2 + 6} r={11} n={18} />
      {(
        [
          [28, 30, "start"],
          [172, 30, "end"],
          [28, 84, "start"],
          [172, 84, "end"],
        ] as const
      ).map(([x, y, a], i) => (
        <text
          key={i}
          x={x}
          y={y}
          text-anchor={a}
          font-family="'Rye', Georgia, serif"
          font-size={i < 2 ? 15 : 10}
          fill={INK}
        >
          {n}
        </text>
      ))}
    </svg>
  );
}

/** The bank: three offset notes ($50, $10, $5) with engraved borders. */
export function BankStack({ size = 30 }: { size?: number }) {
  const note = (v: Denomination, x: number, y: number, rot: number) => (
    <g transform={`translate(${x} ${y}) rotate(${rot} 13 6.5)`}>
      <rect
        width="26"
        height="13"
        rx="1.2"
        fill={MONEY_COLORS[v]}
        stroke={INK}
        stroke-width="0.7"
      />
      <rect
        x="2"
        y="1.8"
        width="22"
        height="9.4"
        rx="0.8"
        fill="none"
        stroke={INK}
        stroke-width="0.45"
        stroke-opacity="0.7"
      />
      <circle
        cx="13"
        cy="6.5"
        r="2.6"
        fill="none"
        stroke={INK}
        stroke-width="0.5"
        stroke-opacity="0.7"
      />
      <rect x="2.6" y="2.4" width="3" height="2" fill={INK} opacity="0.45" />
      <rect x="20.4" y="8.6" width="3" height="2" fill={INK} opacity="0.45" />
    </g>
  );
  return (
    <svg
      class="bank-stack"
      width={size}
      height={size * 0.72}
      viewBox="0 0 32 23"
      aria-hidden="true"
    >
      {note(50, 4, 1, -6)}
      {note(10, 2.5, 5, 3)}
      {note(5, 1, 9, -2)}
    </svg>
  );
}

/** A banded bundle of green notes: the card salary icon and the cash-figure icon. */
export function NoteBundle({
  size = 22,
  title,
}: {
  size?: number;
  title?: string;
}) {
  return (
    <svg
      class="note-bundle"
      width={size}
      height={size * 0.68}
      viewBox="0 0 25 17"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
    >
      <rect
        x="2.5"
        y="1"
        width="21"
        height="11"
        rx="1"
        fill="#6fae80"
        stroke="#1f4a2b"
        stroke-width="0.8"
      />
      <rect
        x="1"
        y="4.5"
        width="21"
        height="11"
        rx="1"
        fill="#8fc9a0"
        stroke="#1f4a2b"
        stroke-width="0.8"
      />
      <rect
        x="2.8"
        y="6.1"
        width="17.4"
        height="7.8"
        rx="0.6"
        fill="none"
        stroke="#1f4a2b"
        stroke-width="0.5"
        stroke-opacity="0.7"
      />
      <circle
        cx="11.5"
        cy="10"
        r="2.2"
        fill="none"
        stroke="#1f4a2b"
        stroke-width="0.6"
      />
      <rect
        x="8.6"
        y="4.5"
        width="3.4"
        height="11"
        fill="#f3ead0"
        stroke="#1f4a2b"
        stroke-width="0.5"
      />
    </svg>
  );
}
