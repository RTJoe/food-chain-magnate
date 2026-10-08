/** Recruiting and training (grey): recruiting girl / manager, HR director, trainer, coach, guru. */
import {
  Arm,
  Backdrop,
  CLOTH,
  Hand,
  HairBack,
  Head,
  INK,
  Limb,
  Stage,
  Torso,
  cloth,
  line,
  ol,
  type HeadProps,
  type Pt,
} from "./parts.js";
import type { PortraitSet } from "./types.js";

/** The light wash (parts.tsx WASH.light), for the training-room set below. */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

const CHALK = {
  // Organisation chart.
  org: "M14 10h10v5H14ZM7 22h8v4H7ZM16 22h8v4h-8ZM25 22h8v4h-8ZM19 15v3.5M11 22v-3.5h18v3.5M20 18.5v3.5",
  // Team play: crosses, rings and a run arrow.
  plays: "M8 11l3 3M11 11l-3 3M8 25l3 3M11 25l-3 3M30 12a1.6 1.6 0 1 0 0.01 0M30 26a1.6 1.6 0 1 0 0.01 0M12 14c6 4 10 6 15 5M24.6 17.4l2.4 1.6l-2.6 1.2",
  // Lesson notes with a star.
  notes: "M8 11h18M8 15h24M8 19h14M8 23h20M8 27h10M36 12l1 2.4l2.6 0.2l-2 1.6l0.8 2.6l-2.4 -1.4l-2.4 1.4l0.8 -2.6l-2 -1.6l2.6 -0.2Z",
} as const;

/** A training room: chalkboard on the left, wall clock, wainscot. */
function TrainingRoom({ chalk }: { chalk: keyof typeof CHALK }) {
  return (
    <g>
      <rect width="100" height="70" fill={W.wall} />
      <path d="M3 5h46v33H3Z" fill={W.deep} />
      <path d="M5 7h42v29H5Z" fill="#9ba7a2" />
      <path d={CHALK[chalk]} {...line(W.hi, 0.55)} />
      <path d="M2 38h48v1.8H2Z" fill={W.line} />
      <path d="M80 13a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z" fill={W.hi} stroke={W.deep} stroke-width="0.9" />
      <path d="M86 13v-4M86 13l3 1.4" {...line(W.deep, 0.8)} />
      <path d="M0 50h100v20H0Z" fill={W.wall2} opacity="0.7" />
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

const LAVENDER = cloth("#a99cc4");
const OATMEAL = cloth("#a8875e");

const recruiterHead: HeadProps = {
  x: 49,
  y: 27,
  skin: "tan",
  hair: "victoryRolls",
  hairColor: "black",
  female: true,
  mouth: "smile",
  facing: -1,
  tilt: -4,
};

const managerHead: HeadProps = {
  x: 50,
  y: 27,
  skin: "deep",
  hair: "pinCurls",
  hairColor: "black",
  female: true,
  lips: "#9c2a3a",
  mouth: "smile",
  facing: -1,
  tilt: -3,
};

const hrHead: HeadProps = {
  x: 50,
  y: 27,
  skin: "ruddy",
  hair: "victoryRolls",
  hairColor: "grey",
  female: true,
  older: true,
  glasses: true,
  lips: "#b04a5a",
  mouth: "smile",
  tilt: 3,
};

const coachHead: HeadProps = {
  x: 50,
  y: 27,
  skin: "brown",
  hair: "ponytail",
  hairColor: "black",
  female: true,
  ribbon: "#f4f1ea",
  mouth: "grin",
  tilt: -3,
};

export const people: PortraitSet = {
  // Cheerful recruiter holding up her hiring clipboard.
  recruiting_girl: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <HairBack {...recruiterHead} />
        <Torso x={49} y={41} skin="tan" outfit="blouse" main={CLOTH.coral} accent="#f2d27a" width={0.92} />
        {/* Clipboard */}
        <path d="M57.4 35.4l12.6 -2l2.6 16.6l-12.6 2Z" fill="#a8743e" {...ol} />
        <path d="M58.8 36.8l10.4 -1.6l2.2 13.8l-10.4 1.6Z" fill="#fbf8ee" />
        <path d="M61.4 34l5 -0.8l0.6 2.6l-5 0.8Z" fill="#b8b6b0" {...ol} />
        <path d="M61.6 40l7 -1.1M62 42.6l7 -1.1M62.4 45.2l4.4 -0.7" {...line("#8a8a8a", 0.5)} />
        <path d="M59.8 39.8l0.6 0.8l1 -1.4M60.2 42.4l0.6 0.8l1 -1.4" {...line("#c0392b", 0.5)} />
        <Arm s={[62, 47]} e={[66, 56]} w={[61, 50.6]} skin="tan" sleeve={CLOTH.coral} cuff={CLOTH.coral.light} width={6.2} hand="fist" handRot={-15} />
        <Head {...recruiterHead} />
      </Stage>
    </g>
  ),
  // Recruiting manager signing a stack of application forms with her fountain pen.
  recruiting_manager: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={50} y={41} skin="deep" outfit="suit" main={CLOTH.forest} accent="#d9a33a" bow width={0.92} />
        {/* Application forms */}
        <path d="M33.6 44.6l17 -1.6l1 8l-17 1.6ZM34.2 43.2l17 -1.6l1 8l-17 1.6Z" fill="#ece6d6" {...ol} />
        <path d="M34.8 41.8l17 -1.6l1 8l-17 1.6Z" fill="#fbf8ee" {...ol} />
        <path d="M37 41.9l6 -0.6" {...line("#2f4f7a", 0.9)} />
        <path d="M37.2 44.2l11 -1M37.4 46l11 -1M37.6 47.8l7 -0.6" {...line("#9a9a9a", 0.45)} />
        <Arm s={[36, 48]} e={[31, 56]} w={[36.4, 49.4]} skin="deep" sleeve={CLOTH.forest} hand="fist" handRot={10} />
        {/* Fountain pen */}
        <path d="M53.6 37.6L55.8 38.8L51 46.8L50.2 48L50.2 46.6Z" fill="#7c2633" {...ol} />
        <path d="M54.4 38.6L53 41" {...line("#d9b25a", 0.6)} />
        <Arm s={[63, 47]} e={[67, 57]} w={[58, 49]} skin="deep" sleeve={CLOTH.forest} hand="pinch" handFlip />
        <Head {...managerHead} />
      </Stage>
    </g>
  ),
  // Senior HR director, glasses on a chain, pulling a card from her index box.
  hr_director: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <HairBack {...hrHead} />
        <Torso x={50} y={41} skin="ruddy" outfit="sweater" main={LAVENDER} width={0.92} />
        {/* Index card box */}
        <path d="M41.4 43v-2.6h15v2.6Z" fill="#fbf8ee" {...ol} />
        <path d="M43 40.4v-1.6h3.2v1.6ZM50.6 40.4v-1.6h3.2v1.6Z" fill="#8db7d6" {...ol} />
        <path d="M40 43h18v9H40Z" fill="#b08250" {...ol} />
        <path d="M53.6 43H58v9h-4.4Z" fill="#8a6038" />
        <path d="M46.4 45.6h5.2v2.6h-5.2Z" fill="#efe5cc" {...ol} />
        <Arm s={[36, 48]} e={[32, 56]} w={[40.6, 50]} skin="ruddy" sleeve={LAVENDER} cuff={LAVENDER.light} hand="fist" handRot={18} />
        {/* The card she has pulled */}
        <path d="M57.6 33.2l8.6 -1.2l0.8 5.6l-8.6 1.2Z" fill="#fbf8ee" {...ol} />
        <path d="M59 35.2l6 -0.8M59.3 36.8l4 -0.6" {...line("#9a9a9a", 0.45)} />
        <Arm s={[63, 47]} e={[69, 55]} w={[64.6, 44]} skin="ruddy" sleeve={LAVENDER} cuff={LAVENDER.light} hand="pinch" handFlip handRot={-14} />
        <Head {...hrHead} />
        {/* Spectacle chain */}
        <path d="M43.4 25.6C41.4 31 42.4 37.6 47 40.2C51 41.8 55.4 39.4 57 34.4" fill="none" stroke="#c9a03a" stroke-width="0.5" stroke-dasharray="0.4 0.5" />
      </Stage>
    </g>
  ),
  // Trainer in rolled shirtsleeves, pointer stick on the chalkboard.
  trainer: () => {
    const e: Pt = [33, 50];
    const w: Pt = [30.6, 38];
    return (
      <g>
        <TrainingRoom chalk="org" />
        <Stage>
          <Torso x={56} y={41} skin="fair" outfit="vest" main={CLOTH.olive} accent="#b8343a" bow />
          <Arm s={[44, 48]} e={e} w={w} skin="fair" sleeve={CLOTH.white} sleeveTo={1.4} hand={false} />
          <path d={rolled(e, w, 0.4, 6.2)} fill={CLOTH.white.light} {...ol} />
          <Limb d="M35.4 37.4L17.4 16" w={1.1} color="#a8743e" />
          <Hand x={w[0]} y={w[1]} skin="fair" pose="fist" rot={50} />
          <Head x={56} y={27} skin="fair" hair="crop" hairColor="auburn" facing={-1} tilt={-4} />
        </Stage>
      </g>
    );
  },
  // Sporty coach with a whistle on a lanyard, checking her stopwatch.
  coach: () => (
    <g>
      <TrainingRoom chalk="plays" />
      <Stage>
        <HairBack {...coachHead} />
        <Torso x={50} y={41} skin="brown" outfit="sweater" main={CLOTH.red} width={0.94} />
        {/* Whistle on a lanyard */}
        <path d="M46.2 41.8C46.8 44 47.6 45.6 49 46.6M53.8 41.8C53.2 44 52.4 45.6 51 46.6" {...line("#2f3e5e", 0.8)} />
        <path d="M47.6 46.4h4.6a1.5 1.5 0 0 1 0 3h-4.6ZM52.2 46.6h2v1.2h-2Z" fill="#c9ccd0" {...ol} />
        <Arm s={[63, 47]} e={[72, 52]} w={[68, 42]} skin="brown" sleeve={CLOTH.red} cuff={CLOTH.red.light} hand={false} />
        {/* Stopwatch */}
        <path d="M66.6 27.4h2v1.8h-2Z" fill="#9a9da2" {...ol} />
        <path d="M63.2 33.4a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0 -8.8 0Z" fill="#c9ccd0" {...ol} />
        <path d="M64.4 33.4a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0Z" fill="#fbf8ee" />
        <path d="M67.6 33.4l1.6 -2M67.6 30.6v0.6M70.4 33.4h-0.6M67.6 36.2v-0.6M64.8 33.4h0.6" {...line(INK, 0.5)} />
        <Hand x={67.4} y={42.4} skin="brown" pose="fist" rot={-6} />
        <Head {...coachHead} />
      </Stage>
    </g>
  ),
  // Calm older mentor in a cardigan, reading from an open book with a gentle smile.
  guru: () => (
    <g>
      <TrainingRoom chalk="notes" />
      <Stage>
        <Torso x={51} y={41} skin="deep" outfit="sweater" main={OATMEAL} shirt={CLOTH.cream} />
        <path d="M47.9 46.4a.7 .7 0 1 0 0.01 0Z" fill="none" stroke={OATMEAL.shade} stroke-width="1.3" />
        {/* Open book */}
        <path d="M37.2 44.2v7.4c4.6 -1.4 9.2 -1.2 13.8 0.8c4.6 -2 9.2 -2.2 13.8 -0.8v-7.4Z" fill="#7c2633" {...ol} />
        <path d="M38 43.4c4.4 -1.2 8.6 -1 13 1v6.6c-4.4 -2 -8.6 -2.2 -13 -1ZM64 43.4c-4.4 -1.2 -8.6 -1 -13 1v6.6c4.4 -2 8.6 -2.2 13 -1Z" fill="#fbf6e8" {...ol} />
        <path d="M40 45.2c3 -0.6 6 -0.4 9 0.8M40 47.2c3 -0.6 6 -0.4 9 0.8M53 46c3 -1.2 6 -1.4 9 -0.8M53 48c3 -1.2 6 -1.4 9 -0.8" {...line("#a8a294", 0.45)} />
        <Arm s={[37, 48]} e={[31, 56]} w={[37.4, 50.6]} skin="deep" sleeve={OATMEAL} cuff={OATMEAL.light} hand="fist" handRot={30} />
        <Arm s={[65, 48]} e={[71, 56]} w={[64.6, 50.6]} skin="deep" sleeve={OATMEAL} cuff={OATMEAL.light} hand="fist" handRot={-30} handFlip />
        <Head x={51} y={27} skin="deep" shape="round" hair="older" hairColor="grey" older moustache mouth="smile" tilt={5} />
      </Stage>
    </g>
  ),
};

