/** Planning (red) and pricing (salmon): local / regional managers, pricing, discount and luxuries managers. */
import { Arm, Backdrop, CLOTH, Hand, Head, HairBack, Stage, Torso, cloth, line, ol, type HeadProps } from "./parts.js";
import type { PortraitSet } from "./types.js";

/** The light backdrop wash (same values as the shared backdrops). */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

/** A row of small beads (circles of radius r) along a quadratic curve a → (control c) → b. */
function beads(a: [number, number], c: [number, number], b: [number, number], n: number, r: number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0];
    const y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
    d += `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  return d;
}

/** Four-point twinkle star subpath. */
const twinkle = (x: number, y: number, r: number) => {
  const q = r * 0.22;
  return `M${x} ${y - r}L${x + q} ${y - q}L${x + r} ${y}L${x + q} ${y + q}L${x} ${y + r}L${x - q} ${y + q}L${x - r} ${y}L${x - q} ${y - q}Z`;
};

/** Grocery aisle: stocked shelves on both sides, with shelf-edge price labels. */
function Shelves() {
  return (
    <g>
      <rect width="100" height="70" fill={W.wall} />
      <path d="M0 24h30v1.6H0ZM0 40h30v1.6H0ZM70 24h30v1.6H70ZM70 40h30v1.6H70ZM0 56h100v14H0Z" fill={W.deep} />
      <path
        d="M3 24v-7h6v7ZM11 24v-9h5v9ZM18 24v-6h8v6ZM2 40v-8h7v8ZM11 40v-6h6v6ZM19 40v-9h6v9ZM73 24v-8h7v8ZM82 24v-6h5v6ZM89 24v-9h7v9ZM72 40v-6h8v6ZM82 40v-9h6v9ZM90 40v-7h6v7Z"
        fill={W.line}
      />
      <path d="M5 26h4v2H5ZM20 26h4v2h-4ZM4 42h4v2H4ZM20 42h4v2h-4ZM75 26h4v2h-4ZM90 26h4v2h-4ZM74 42h4v2h-4ZM90 42h4v2h-4Z" fill={W.hi} />
    </g>
  );
}

/** Our own restaurant's front: shop window, glazed door with a hanging sign, sidewalk. */
function Storefront() {
  return (
    <g>
      <rect width="100" height="70" fill={W.wall} />
      <path d="M0 14h100M0 19h100M0 24h100M0 29h100M0 34h100M0 39h100M0 44h100M0 49h100M0 54h100" {...line(W.line, 0.4)} />
      <path d="M3 18h36v36H3ZM70 14h24v44H70Z" fill={W.wall2} />
      <path d="M6 21h30v30H6ZM74 18h16v18H74Z" fill={W.hi} />
      <path d="M21 21v30M6 36h30" {...line(W.line, 0.8)} />
      <path d="M78 26h8v5h-8ZM82 22v4" fill={W.deep} stroke={W.deep} stroke-width="0.5" />
      <path d="M74 46h3v1.4h-3Z" fill={W.deep} />
      <path d="M0 58h100v12H0Z" fill={W.wall2} />
      <path d="M0 58h100" {...line(W.deep, 0.6)} />
    </g>
  );
}

// --- People ---------------------------------------------------------------------------------------

const luxHead: HeadProps = {
  x: 49,
  y: 27,
  skin: "deep",
  shape: "oval",
  hair: "pinCurls",
  hairColor: "grey",
  female: true,
  older: true,
  lips: "#8e2a3a",
  mouth: "smile",
  tilt: 4,
};

const priceHead: HeadProps = {
  x: 47,
  y: 27,
  skin: "fair",
  shape: "oval",
  hair: "sidePart",
  hairColor: "blonde",
  glasses: true,
  tilt: 3,
};

const discHead: HeadProps = {
  x: 53,
  y: 27,
  skin: "golden",
  shape: "round",
  hair: "ponytail",
  hairColor: "brown",
  female: true,
  ribbon: "#2f6a8a",
  lips: "#c8384a",
  mouth: "grin",
  facing: -1,
  tilt: -5,
};

const localHead: HeadProps = {
  x: 51,
  y: 27,
  skin: "deep",
  shape: "round",
  hair: "crop",
  hairColor: "black",
  facing: -1,
  tilt: -3,
};

const regionHead: HeadProps = {
  x: 58,
  y: 27,
  skin: "tan",
  hair: "bob",
  hairColor: "dark",
  female: true,
  lips: "#b8303a",
  mouth: "smile",
  facing: -1,
  tilt: -4,
};

export const planning: PortraitSet = {
  // Elegant grande dame in pearls, presenting a velvet ring box from the jeweller's window.
  luxuries_manager: () => (
    <g>
      <Backdrop kind="street" />
      <Stage>
        <Torso x={50} y={41} skin="deep" outfit="blouse" main={CLOTH.forest} accent="#d9b25a" />
        <path d={beads([43.6, 42], [50, 50], [56.4, 42], 11, 0.8)} fill="#f8f4ea" stroke={"#8a8070"} stroke-width="0.3" />
        <Arm s={[36, 47]} e={[33, 57]} w={[41, 50]} skin="deep" sleeve={CLOTH.forest} hand="pinch" handRot={30} />
        <Arm s={[64, 47]} e={[70, 57]} w={[66, 51.4]} skin="deep" sleeve={CLOTH.forest} hand="open" handRot={-84} />
        {/* Velvet ring box */}
        <path d="M57 43.6L58 35.6H69.6L70.6 43.6Z" fill="#33467e" {...ol} />
        <path d="M58.8 42.8L59.6 37H68L68.8 42.8Z" fill="#efe5cc" />
        <path d="M56.6 43.4H71V48.6H56.6Z" fill="#2a3a6a" {...ol} />
        <path d="M56.6 43.4H71" {...line("#d9b25a", 0.7)} />
        <path d="M63.8 41.6a1.8 1.8 0 1 0 0.01 0Z" fill="none" stroke="#d9b25a" stroke-width="0.8" />
        <path d={twinkle(63.8, 39, 1.3) + twinkle(67.6, 37.6, 0.8)} fill="#ffffff" stroke="#8db7d6" stroke-width="0.35" />
        <Head {...luxHead} />
      </Stage>
    </g>
  ),

  // Shop-floor pricing man in the aisle, holding up a fresh price tag.
  pricing_manager: () => (
    <g>
      <Shelves />
      <Stage>
        <Torso x={47} y={41} skin="fair" outfit="suit" main={CLOTH.tan} accent="#2f4f7a" />
        {/* Price tag */}
        <g transform="rotate(-8 74 22)">
          <path d="M63.4 22.4L67.6 15H84V30H67.6Z" fill="#fbf6e2" {...ol} />
          <path d="M66.6 22.4a1 1 0 1 0 0.01 0Z" fill={W.wall} {...ol} />
          <path d="M66.6 22.4C63 20 61 25 58 23" {...line("#b8343a", 0.5)} />
          <path
            d="M76.4 18.6C75.2 17.4 71.4 17.4 71.4 19.9C71.4 22.4 76.8 21.6 76.8 24.6C76.8 27.2 72.6 27.2 71 25.8M74 16.6v11"
            {...line("#b8343a", 1.1)}
          />
          <path d="M80.6 19.6a1 1 0 1 0 -2 0a1 1 0 1 0 2 0v2.6M83.2 19.6a1 1 0 1 0 -2 0a1 1 0 1 0 2 0v2.6M78.4 26.4h4.6" {...line("#3a2a22", 0.6)} />
        </g>
        <Arm s={[61, 47]} e={[71, 55]} w={[72.4, 38.6]} skin="fair" sleeve={CLOTH.tan} hand="pinch" />
        <Head {...priceHead} />
      </Stage>
    </g>
  ),

  // Thrifty go-getter snipping a coupon with big shears.
  discount_manager: () => (
    <g>
      <Backdrop kind="street" />
      <Stage>
        <HairBack {...discHead} />
        <Torso x={53} y={41} skin="golden" outfit="blouse" main={CLOTH.sky} accent="#b8343a" />
        {/* Coupon */}
        <path d="M24 39.4l20 -3l1.8 12l-20 3Z" fill="#fbf6e2" {...ol} />
        <path d="M25.6 40.6l17.2 -2.6l1.4 9.4l-17.2 2.6Z" fill="none" stroke="#7a7d80" stroke-width="0.45" stroke-dasharray="1 0.8" />
        <path d="M30 47.6l7.6 -8.6M30.6 41.6a1.4 1.4 0 1 0 0.01 0ZM36.6 45.4a1.4 1.4 0 1 0 0.01 0Z" {...line("#b8343a", 1)} />
        <path d="M38.6 42.6l3.6 -0.6M38.8 44.4l3.6 -0.6" {...line("#3a2a22", 0.5)} />
        <Arm s={[39, 47]} e={[30, 57]} w={[27, 47.4]} skin="golden" sleeve={CLOTH.sky} hand="fist" handRot={-8} />
        {/* Scissors */}
        <path d="M51 44.6L41.6 40.6L42.2 40L51.4 43.4ZM51 43.8L42 46.6L41.8 45.8L50.8 42.8Z" fill="#c6ccd2" {...ol} />
        <path d="M54.6 41.6a2.4 1.8 -20 1 0 0.01 0ZM55.2 46.8a2.4 1.8 20 1 0 0.01 0Z" fill="none" stroke="#3a2a22" stroke-width="2.2" />
        <path d="M54.6 41.6a2.4 1.8 -20 1 0 0.01 0ZM55.2 46.8a2.4 1.8 20 1 0 0.01 0Z" fill="none" stroke="#c8384a" stroke-width="1.1" />
        <path d="M51.2 43.6a0.6 0.6 0 1 0 0.01 0Z" fill="#3a2a22" />
        <Arm s={[67, 47]} e={[72, 57]} w={[62, 48.4]} skin="golden" sleeve={CLOTH.sky} hand="fist" handRot={-76} />
        <Head {...discHead} />
      </Stage>
    </g>
  ),

  // Proud local manager outside his restaurant, jingling the keys, clipboard tucked in.
  local_manager: () => (
    <g>
      <Storefront />
      <Stage>
        <Torso x={51} y={41} skin="deep" outfit="suit" main={CLOTH.brown} accent="#d3a238" />
        {/* Clipboard */}
        <path d="M26.6 36.4l13.6 -1.8l2.4 17l-13.6 1.8Z" fill="#a8743f" {...ol} />
        <path d="M28.2 38.4l10.8 -1.4l2 14l-10.8 1.4Z" fill="#fbf6e2" />
        <path d="M30 41.4l7.4 -1M30.4 44.4l7.4 -1M30.8 47.4l5.6 -0.8M28.6 41.4l0.6 0.6l1 -1.6" {...line("#7f9fc0", 0.45)} />
        <path d="M31 36.6l5 -0.6l0.4 2.6l-5 0.6Z" fill="#c6ccd2" {...ol} />
        <Arm s={[38, 47]} e={[31, 57]} w={[30.4, 49.4]} skin="deep" sleeve={CLOTH.brown} hand="fist" handRot={4} />
        <Arm s={[65, 47]} e={[75, 51]} w={[72, 33.4]} skin="deep" sleeve={CLOTH.brown} hand={false} />
        {/* Key ring and keys */}
        <path d="M69.6 26.4a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0Z" fill="none" stroke="#3a2a22" stroke-width="1.6" />
        <path d="M69.6 26.4a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0Z" fill="none" stroke="#d9b25a" stroke-width="0.7" />
        <path
          d="M70.6 29.6a1.8 1.8 0 1 1 1.4 2.6l-0.8 6.2l-1.2 0.2l0.2 -1l-1 -0.4l0.4 -1.2l-0.6 -0.4l0.8 -3.6a1.8 1.8 0 0 1 0.8 -2.4ZM75.6 29.8a1.8 1.8 0 1 1 -0.2 3.2l1.8 5.6l-1 0.6l-0.6 -0.8l-0.8 0.6l-0.6 -1.2l-0.8 0.2l-0.8 -4a1.8 1.8 0 0 1 3 -4.2Z"
          fill="#d3a238"
          {...ol}
        />
        <path d="M71.8 31a.5 .5 0 1 0 .01 0ZM75.4 31.4a.5 .5 0 1 0 .01 0Z" fill={W.wall} />
        <Hand x={72} y={32.6} skin="deep" pose="pinch" rot={-8} />
        <Head {...localHead} />
      </Stage>
    </g>
  ),

  // Regional manager at the territory map, pointer on the next pin.
  regional_manager: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        {/* Territory map */}
        <g transform="translate(0 3)">
        <path d="M14 13h28v30H14Z" fill="#a9cbd9" stroke="#8a5a32" stroke-width="1.4" />
        <path d="M15 20C19 17 24 19 27 16C31 14 36 17 41 15V36C37 39 33 35 28 38C24 41 19 37 15 40Z" fill="#e6dcb8" />
        <path d="M18 26C22 24 26 30 30 28S37 22 40 25M24 18L26 38M33 17L35 37" {...line("#c86a50", 0.5)} />
        <path d="M20 23.6v3M30 20.4v3M35.6 30.4v3M23.6 33v3" {...line("#3a2a22", 0.45)} />
        <path d="M18.8 23.6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0ZM28.8 20.4a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0ZM34.4 30.4a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0ZM22.4 33a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z" fill="#c8384a" {...ol} />
        </g>
        <HairBack {...regionHead} />
        <Torso x={58} y={41} skin="tan" outfit="blouse" main={CLOTH.mustard} accent="#2f4f7a" />
        {/* Pointer */}
        <path d="M45 45L30.6 28.4" {...line("#3a2a22", 1.4)} />
        <path d="M45 45L30.6 28.4" {...line("#b08050", 0.7)} />
        <Arm s={[45, 47]} e={[40, 57]} w={[43, 47.4]} skin="tan" sleeve={CLOTH.mustard} hand="fist" handRot={-36} />
        <Head {...regionHead} />
      </Stage>
    </g>
  ),
};
