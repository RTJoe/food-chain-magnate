/** Coffee (teal, Ketchup): barista trainee, barista, lead barista, at a 1950s coffee counter. */
import type { ComponentChildren } from "preact";
import { Arm, CLOTH, HairBack, Head, Stage, Torso, line, ol, type HeadProps } from "./parts.js";
import type { PortraitSet } from "./types.js";

/** Same light wash as the shared backdrops. */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

/** Coffee counter: menu board, wall clock, shelf of stacked cups, urn, chrome-edged counter. */
function CounterBackdrop() {
  return (
    <g>
      <rect width="100" height="70" fill={W.wall} />
      {/* Menu board */}
      <path d="M4 6h32v20H4Z" fill={W.hi} stroke={W.deep} stroke-width="1" />
      <path d="M8 11h14M8 15h18M8 19h12M8 23h16M28 11h4M30 15h3M28 19h4M29 23h3" {...line(W.line, 0.9)} />
      {/* Clock */}
      <path d="M44 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z" fill={W.hi} stroke={W.deep} stroke-width="0.9" />
      <path d="M49 12V8.8M49 12l2.2 1.4" {...line(W.deep, 0.7)} />
      {/* Shelf with stacked cups and an urn */}
      <path d="M60 24h40v1.6H60Z" fill={W.deep} />
      <path
        d="M63 24v-3h6v3ZM63.6 21v-3h4.8v3ZM73 24v-3h6v3ZM73.6 21v-3h4.8v3ZM85 24V12a4 4 0 0 1 8 0v12ZM88 8h2v-2h-2Z"
        fill={W.line}
      />
      {/* Wainscot and counter */}
      <path d="M0 44h100" {...line(W.line, 0.6)} />
      <path d="M0 56h100v14H0Z" fill={W.wall2} />
      <path d="M0 56h100v1.6H0Z" fill={W.hi} />
    </g>
  );
}

/** Draw in a head's own frame (centre 0,0; same tilt and facing). */
function OnHead({ h, children }: { h: HeadProps; children: ComponentChildren }) {
  const f = (h.facing ?? 1) * (h.scale ?? 1);
  return <g transform={`translate(${h.x} ${h.y}) rotate(${h.tilt ?? 0}) scale(${f} ${h.scale ?? 1})`}>{children}</g>;
}

const Steam = ({ x, y }: { x: number; y: number }) => (
  <path
    d={`M${x - 2.4} ${y}c-1.4 -1.6 1.4 -2.8 0 -4.6M${x} ${y - 1}c-1.6 -1.8 1.6 -3 0 -5M${x + 2.4} ${y}c-1.4 -1.6 1.4 -2.8 0 -4.6`}
    {...line("#f4f6f5", 0.9)}
  />
);

const CHROME = { base: "#c3c9cd", shade: "#8e959a", light: "#f4f7f8" };
const COFFEE = "#5a3320";

const trainee: HeadProps = { x: 50, y: 27, skin: "tan", hair: "pinCurls", hairColor: "dark", female: true, hat: "paper", tilt: 4 };
const lead: HeadProps = {
  x: 40, y: 27, skin: "deep", hair: "victoryRolls", hairColor: "black", female: true, mouth: "smile", lips: "#9c2a35", tilt: 3,
};

export const coffee: PortraitSet = {
  // Soda-fountain trainee in a paper cap and bow tie, carefully carrying her first cup of coffee.
  "ketchup:barista_trainee": () => (
    <g>
      <CounterBackdrop />
      <Stage>
        <Torso x={50} y={41} skin="tan" outfit="suit" main={CLOTH.white} accent="#b8343a" bow />
        {/* Cup and saucer */}
        <Steam x={68} y={33} />
        <path d="M60 44.4a8 2 0 1 0 16 0a8 2 0 1 0 -16 0Z" fill="#f6f3ec" {...ol} />
        <path d="M73 37.6c3.2 -0.6 4 3.6 0.4 4.4" {...line("#3a2a22", 1.8)} />
        <path d="M73 37.6c3.2 -0.6 4 3.6 0.4 4.4" {...line("#f6f3ec", 0.9)} />
        <path d="M62.8 35.4H73.2L72 43.2C70 44.6 66 44.6 64 43.2Z" fill="#f6f3ec" {...ol} />
        <path d="M63.2 38.2H72.8" {...line("#b8343a", 1)} />
        <path d="M62.8 35.4a5.2 1.2 0 1 0 10.4 0a5.2 1.2 0 1 0 -10.4 0Z" fill={COFFEE} {...ol} />
        <Arm s={[64, 48]} e={[73, 56]} w={[70, 47.8]} skin="tan" sleeve={CLOTH.white} hand="open" handRot={-84} />
        <Head {...trainee} />
        <OnHead h={trainee}>
          <path d="M-6.8 -9.4C-2.4 -10.8 3.6 -10.8 7.6 -9.4" {...line("#b8343a", 0.9)} />
        </OnHead>
      </Stage>
    </g>
  ),
  // Counter barista in a vest and bow tie, holding up a fresh pot of coffee.
  "ketchup:barista": () => (
    <g>
      <CounterBackdrop />
      <Stage>
        <Torso x={56} y={41} skin="fair" outfit="vest" main={CLOTH.brown} accent="#b8343a" bow apron />
        {/* Glass coffee pot */}
        <Steam x={24} y={26} />
        <path d="M36.6 31.4C41.6 30.6 42.6 38 38.6 39.6" {...line("#1f1b1a", 2.2)} />
        <path d="M24.8 31C22 33.4 20 37 20 40.6C20 45.6 24.4 49.4 30 49.4C35.6 49.4 40 45.6 40 40.6C40 37 38 33.4 35.2 31Z" fill="#e3ebec" fill-opacity="0.8" {...ol} />
        <path d="M20.6 38.4C25.6 39.6 34.4 39.6 39.4 38.4C39.9 39.2 40 40 40 40.6C40 45.6 35.6 49.4 30 49.4C24.4 49.4 20 45.6 20 40.6C20 40 20.1 39.2 20.6 38.4Z" fill={COFFEE} {...ol} />
        <path d="M22.6 35.4C23.4 34 24.4 33 25.4 32.4" {...line("#ffffff", 1)} />
        <path d="M33.4 41.6C34.8 43 35 45 34.2 46.6" {...line("#8a5a3a", 1)} />
        <path d="M23.6 28H36.4L35.6 31.6H24.4ZM23.6 28L21.4 27.2L22.4 29.4Z" fill="#c0392b" {...ol} />
        <Arm s={[41, 48]} e={[40, 58]} w={[42.2, 41.4]} skin="fair" sleeve={CLOTH.white} hand="fist" handRot={-20} />
        <Head x={56} y={27} skin="fair" shape="square" hair="pompadour" hairColor="brown" facing={-1} tilt={-4} />
      </Stage>
    </g>
  ),
  // Head barista pulling a shot on a gleaming chrome lever espresso machine.
  "ketchup:lead_barista": () => (
    <g>
      <CounterBackdrop />
      <Stage>
        <HairBack {...lead} />
        <Torso x={40} y={41} skin="deep" outfit="vest" main={CLOTH.burgundy} accent="#d3a238" bow />
        {/* Espresso machine: cups warming on top, two levers, chrome body */}
        <path d="M61 31.6l0.6 -3.6h5.2l0.6 3.6ZM68.6 31.6l0.6 -3.6h5.2l0.6 3.6ZM76.2 31.6l0.6 -3.6h5.2l0.6 3.6Z" fill="#fbf8ee" {...ol} />
        <path d="M58.4 31.6H85.6V51.6H58.4Z" fill={CHROME.base} {...ol} />
        <path d="M80 31.6H85.6V51.6H80Z" fill={CHROME.shade} />
        <path d="M60.8 33.4v16.6M63 33.4v9" {...line(CHROME.light, 1.2)} />
        <path d="M58.4 37.2H85.6" {...line("#b8343a", 1.4)} />
        <path d="M63.6 40.4h6.4v2.8h-6.4ZM75 40.4h6.4v2.8H75Z" fill="#4a4b4f" {...ol} />
        <path d="M64.6 47.4h4.6l-0.5 3.6h-3.6ZM76 47.4h4.6l-0.5 3.6h-3.6Z" fill="#fbf8ee" {...ol} />
        <path d="M66.8 43.4V47M78.2 43.4V47" {...line(COFFEE, 0.8)} />
        <path d="M66.8 41L59.6 30.6M78.2 41L79.4 22.4" {...line("#1f1b1a", 1.5)} />
        <path d="M77.6 22.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0 -3.8 0Z" fill="#1f1b1a" {...ol} />
        <path d="M84.4 22.6l0.7 2l2 0.7l-2 0.7l-0.7 2l-0.7 -2l-2 -0.7l2 -0.7Z" fill="#ffffff" {...ol} />
        <Arm s={[55, 48]} e={[63, 58]} w={[59.4, 35]} skin="deep" sleeve={CLOTH.white} hand="fist" handRot={-38} />
        <Head {...lead} />
      </Stage>
    </g>
  ),
};
