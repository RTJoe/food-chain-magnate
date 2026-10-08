/** Managers (black) and the CEO (charcoal card, dark wash). */
import {
  Arm,
  Backdrop,
  CLOTH,
  Hand,
  HairBack,
  Head,
  SKIN,
  Stage,
  Torso,
  cloth,
  line,
  ol,
  type HeadProps,
  type Pt,
} from "./parts.js";
import type { PortraitSet } from "./types.js";

/** The office backdrop's light wash (parts.tsx WASH.light), for the local sets below. */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

/** Office with a big sales chart on an easel board, rising to the top right. */
function ChartRoom() {
  return (
    <g>
      <rect width="100" height="70" fill={W.wall} />
      <path d="M4 4h30v36H4Z" fill={W.hi} />
      <path d="M4 8h30M4 12h30M4 16h30M4 20h30M4 24h30M4 28h30M4 32h30M4 36h30" {...line(W.line, 0.7)} />
      <path d="M4 4h30v36H4Z" fill="none" stroke={W.deep} stroke-width="1.2" />
      {/* Chart board */}
      <path d="M60 4h35v30H60Z" fill={W.hi} stroke={W.deep} stroke-width="0.9" />
      <path d="M64 30h4v-5h-4ZM70 30h4v-8h-4ZM76 30h4v-12h-4ZM82 30h4v-16h-4ZM88 30h4v-21h-4Z" fill={W.line} />
      <path d="M63 25l7 -4l6 1.6l14 -14" {...line(W.deep, 1.3)} />
      <path d="M92 6l-0.6 5.4l-4.6 -4.8Z" fill={W.deep} />
      <path d="M0 50h100v20H0Z" fill={W.wall2} opacity="0.7" />
    </g>
  );
}

/** The office after dark: blue-grey wash, window with a moon and stars, a wall clock at two. */
function NightOffice() {
  const n = { wall: "#c4cad4", wall2: "#b4bbc7", deep: "#8f98a8", sky: "#8792a8", glow: "#eceadb" };
  return (
    <g>
      <rect width="100" height="70" fill={n.wall} />
      <path d="M5 4h34v38H5Z" fill={n.sky} />
      <path d="M17 9.6a4.6 4.6 0 1 0 5.6 6.4a4 4 0 1 1 -5.6 -6.4Z" fill={n.glow} />
      <path d="M30 10h0.1M34 18h0.1M27 22h0.1M10 26h0.1M33 30h0.1" {...line(n.glow, 1)} />
      <path d="M22 4v38M5 23h34" {...line(n.deep, 1)} />
      <path d="M5 4h34v38H5Z" fill="none" stroke={n.deep} stroke-width="1.2" />
      {/* Wall clock */}
      <path d="M78 14a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z" fill={n.glow} stroke={n.deep} stroke-width="0.9" />
      <path d="M84 14v-4M84 14l3 -1.8" {...line(n.deep, 0.8)} />
      <path d="M0 50h100v20H0Z" fill={n.wall2} />
    </g>
  );
}

/** A turned-back cuff band across the arm at `t` (0..1) along elbow→wrist. */
function rolled(e: Pt, w: Pt, t: number, wid: number, len = 2.2): string {
  const dx = w[0] - e[0];
  const dy = w[1] - e[1];
  const L = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / L, dy / L];
  const [nx, ny] = [-uy * (wid / 2), ux * (wid / 2)];
  const c: Pt = [e[0] + dx * t, e[1] + dy * t];
  const a: Pt = [c[0] - (ux * len) / 2, c[1] - (uy * len) / 2];
  const b: Pt = [c[0] + (ux * len) / 2, c[1] + (uy * len) / 2];
  const f = (x: number) => Math.round(x * 100) / 100;
  return `M${f(a[0] + nx)} ${f(a[1] + ny)}L${f(b[0] + nx)} ${f(b[1] + ny)}L${f(b[0] - nx)} ${f(b[1] - ny)}L${f(a[0] - nx)} ${f(a[1] - ny)}Z`;
}

const NIGHT_SHIRT = cloth("#cdd9e4");
const LEATHER_DARK = "#4a2a18";

const vpHead: HeadProps = {
  x: 51,
  y: 27,
  skin: "olive",
  hair: "bob",
  hairColor: "dark",
  female: true,
  lips: "#a8323e",
  mouth: "smile",
  tilt: 4,
};

export const managers: PortraitSet = {
  // Confident older executive, fountain pen raised as if about to sign.
  ceo: () => (
    <g>
      <Backdrop kind="office" dark />
      <Stage>
        <Torso x={50} y={41} skin="fair" outfit="suit" main={CLOTH.navy} accent="#8e2a35" />
        {/* Fountain pen */}
        <path d="M55.6 38.6L57.8 39.8L53 47.8L52.2 49L52.2 47.6Z" fill="#1f1b1a" {...ol} />
        <path d="M56.4 39.6L55 42" {...line("#d9b25a", 0.6)} />
        <Arm s={[63, 47]} e={[67, 57]} w={[60, 50]} skin="fair" sleeve={CLOTH.navy} hand="pinch" handFlip />
        <Head x={50} y={27} skin="fair" shape="square" hair="older" hairColor="grey" older moustache mouth="smile" facing={-1} tilt={-3} />
      </Stage>
    </g>
  ),
  // Eager young trainee hugging a stack of company folders.
  management_trainee: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={50} y={41} skin="deep" outfit="suit" main={CLOTH.grey} accent="#2f4f7a" />
        {/* Folders */}
        <path d="M37.6 44.4l22 -2.4l1.6 9l-22 2.4Z" fill="#d9b86a" {...ol} />
        <path d="M38.2 46l21.6 -2.4M38.6 47.8l21.6 -2.4" {...line("#a8853f", 0.5)} />
        <path d="M39 42l21 -2.2l0.8 3.6l-21 2.2Z" fill="#c9a2a0" {...ol} />
        <Arm s={[36, 47]} e={[34, 56]} w={[42.6, 51.4]} skin="deep" sleeve={CLOTH.grey} hand="fist" handRot={20} />
        <Head x={50} y={27} skin="deep" shape="round" hair="crop" hairColor="black" tilt={4} />
      </Stage>
    </g>
  ),
  // Keen young executive proudly holding up his new briefcase.
  junior_vp: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={50} y={41} skin="golden" outfit="suit" main={CLOTH.denim} accent="#d3a238" />
        <Arm s={[64, 47]} e={[71, 54]} w={[61, 47]} skin="golden" sleeve={CLOTH.denim} hand={false} />
        {/* Briefcase */}
        <path d="M46 45.6a1.8 1.8 0 0 1 1.8 -1.8h14.4a1.8 1.8 0 0 1 1.8 1.8V55H46Z" fill="#7a4a2c" {...ol} />
        <path d="M59 43.8h3.2a1.8 1.8 0 0 1 1.8 1.8V55H59Z" fill="#5c3520" />
        <path d="M46.4 48.2h17.2" {...line(LEATHER_DARK, 0.5)} />
        <path d="M49.6 47h2.2v2.4h-2.2ZM58.2 47h2.2v2.4h-2.2Z" fill="#d9b25a" {...ol} />
        <path d="M52.8 43.8v-2a1.4 1.4 0 0 1 1.4 -1.4h2.2a1.4 1.4 0 0 1 1.4 1.4v2" fill="none" stroke={LEATHER_DARK} stroke-width="1.1" />
        <Hand x={55.4} y={45.6} skin="golden" pose="fist" rot={-6} />
        <Head x={50} y={27} skin="golden" hair="pompadour" hairColor="blonde" tilt={-5} />
      </Stage>
    </g>
  ),
  // Mid-career vice president taking a call, receiver at her ear.
  vice_president: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <HairBack {...vpHead} />
        <Torso x={51} y={41} skin="olive" outfit="suit" main={CLOTH.burgundy} accent="#efe5cc" bow width={0.92} />
        <Arm s={[38, 48]} e={[30, 46]} w={[39, 36]} skin="olive" sleeve={CLOTH.burgundy} cuff="#efe5cc" hand={false} />
        <Head {...vpHead} />
        {/* Telephone receiver */}
        <path d="M43 28.4L45.4 36" fill="none" stroke="#262220" stroke-width="2.4" stroke-linecap="round" />
        <path d="M40.4 26.4a2.2 2.8 -18 1 0 4.4 0a2.2 2.8 -18 1 0 -4.4 0Z" fill="#262220" {...ol} />
        <path d="M43.6 37.2a2.2 2.6 -18 1 0 4.4 0a2.2 2.6 -18 1 0 -4.4 0Z" fill="#262220" {...ol} />
        <Hand x={40.6} y={35.6} skin="olive" pose="fist" rot={28} />
      </Stage>
    </g>
  ),
  // Greying senior VP with glasses, presenting the bound annual report.
  senior_vp: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={48} y={41} skin="brown" outfit="suit" main={CLOTH.charcoal} accent="#9a3b2e" />
        <g transform="rotate(-8 64 43)">
          <path d="M55 33h18v20H55Z" fill="#34507a" {...ol} />
          <path d="M55 33h3v20h-3Z" fill="#22385a" {...ol} />
          <path d="M55.6 36h1.8M55.6 42h1.8M55.6 48h1.8" {...line("#d9d3c4", 0.9)} />
          <path d="M60.6 37h9.4v5.4h-9.4Z" fill="#efe5cc" {...ol} />
          <path d="M62 39h6.6M62 40.6h4.4" {...line("#8a8070", 0.45)} />
        </g>
        <Arm s={[62, 47]} e={[70, 55]} w={[68, 48]} skin="brown" sleeve={CLOTH.charcoal} hand="fist" handRot={-30} />
        <Head x={48} y={27} skin="brown" shape="square" hair="sidePart" hairColor="grey" glasses mouth="smirk" tilt={-3} />
      </Stage>
    </g>
  ),
  // The oldest executive, silver-haired, pointing proudly at the sales chart.
  executive_vp: () => (
    <g>
      <ChartRoom />
      <Stage>
        <Torso x={45} y={45} skin="ruddy" outfit="suit" main={CLOTH.brown} accent="#c9a03a" />
        {/* Pocket square */}
        <path d="M50.4 54.2l0.8 -2.6l1 1.4l1.2 -1.8l0.9 3Z" fill={CLOTH.white.base} {...ol} />
        <path d="M50 54.2h4.8" {...line(CLOTH.brown.shade, 0.6)} />
        <Arm s={[58, 52]} e={[69, 49]} w={[75, 39.4]} skin="ruddy" sleeve={CLOTH.brown} hand="point" />
        <Head x={44} y={31} skin="ruddy" shape="round" hair="slicked" hairColor="grey" older mouth="grin" tilt={-4} />
      </Stage>
    </g>
  ),
  // Night shift manager in shirtsleeves: cuffs rolled, tie loosened, coffee in hand.
  "ketchup:night_shift_manager": () => {
    const e: Pt = [73, 53];
    const w: Pt = [67.6, 44.6];
    return (
      <g>
        <NightOffice />
        <Stage>
          <Torso x={49} y={41} skin="tan" outfit="tee" main={NIGHT_SHIRT} />
          {/* Open collar, loosened tie */}
          <path d="M46.6 41.4L49 46.4L51.4 41.4Z" fill={SKIN.tan.shade} />
          <path d="M48.4 45.4l2.6 -0.2l0.4 2l-0.6 0.4l1.4 8.6l-2.2 2.6l-2.2 -2.8l0.8 -8.4l-0.6 -0.4Z" fill="#7c2633" {...ol} />
          <path d="M45.4 40.2L43.8 45.6L48.6 45.4L46.8 41.4ZM52.6 40.2L54.4 45.6L49.8 45.6L51.2 41.4Z" fill={NIGHT_SHIRT.light} {...ol} />
          <Arm s={[62, 47]} e={e} w={w} skin="tan" sleeve={NIGHT_SHIRT} sleeveTo={1.4} hand={false} />
          <path d={rolled(e, w, 0.4, 6.2)} fill={NIGHT_SHIRT.light} {...ol} />
          {/* Coffee mug */}
          <path d="M57.4 36.8h7.4v7a2.2 2.2 0 0 1 -2.2 2.2h-3a2.2 2.2 0 0 1 -2.2 -2.2Z" fill="#efe9dc" {...ol} />
          <path d="M57.4 39.2h7.4v1.6h-7.4Z" fill="#b8343a" />
          <path d="M57.8 36.8a3.3 0.9 0 1 0 6.6 0a3.3 0.9 0 1 0 -6.6 0Z" fill="#4a2e1e" {...ol} />
          <path d="M59.6 34.6c-1 -1.4 1 -2.2 0 -3.8M62.4 34.6c-1 -1.4 1 -2.2 0 -3.8" {...line("#f2f4f7", 0.6)} />
          <Hand x={67} y={44.8} skin="tan" pose="fist" rot={-8} />
          <Head x={49} y={27} skin="tan" shape="square" hair="slicked" hairColor="black" mouth="smirk" />
          {/* Tired eyes and a stray forelock */}
          <path d="M44.8 27.7C45.8 28.4 47.2 28.4 48 27.8M52 27.6C52.6 28.1 53.6 28.1 54.2 27.6" {...line(SKIN.tan.shade, 0.5)} />
          <path d="M49.4 19.4c-1.6 1.4 -1.6 3.6 -0.2 4.8c-0.2 -1.6 0.4 -2.8 1.6 -3.8Z" fill="#2a2321" {...ol} />
        </Stage>
      </g>
    );
  },
};

