/** Marketing (blue): marketing trainee, campaign / brand managers, brand director, Ketchup marketeers. */
import type { ComponentChildren } from "preact";
import { Arm, Backdrop, CLOTH, Head, HairBack, INK, Limb, SKIN, Stage, Torso, cloth, line, ol, type HeadProps } from "./parts.js";
import type { PortraitSet } from "./types.js";

/** The light backdrop wash (same values as parts.tsx). */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

/** Draws `children` in head units (same transform as `Head`), for hats and face extras. */
function OnHead({ h, children }: { h: HeadProps; children: ComponentChildren }) {
  const s = h.scale ?? 1;
  return <g transform={`translate(${h.x} ${h.y}) rotate(${h.tilt ?? 0}) scale(${(h.facing ?? 1) * s} ${s})`}>{children}</g>;
}

/** Bold sign lettering. */
const LETTER = { "font-family": "Arial Black, Arial, Helvetica, sans-serif", "font-weight": 900, "text-anchor": "middle" } as const;

/** A printed handbill / mailer at (x, y), turned `rot` degrees. */
function Flyer({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M-2.6 -3.4h5.2v6.8h-5.2Z" fill="#f4ecd6" {...ol} />
      <path d="M-2.6 -3.4h5.2v2H-2.6ZM-1.6 0.4h3.2M-1.6 1.8h2.4" fill="#b8343a" stroke={W.deep} stroke-width="0.5" />
    </g>
  );
}

const traineeHead: HeadProps = {
  x: 44,
  y: 27,
  skin: "golden",
  shape: "round",
  hair: "bob",
  hairColor: "black",
  female: true,
  mouth: "o",
  tilt: -3,
};

const studioHead: HeadProps = {
  x: 45,
  y: 27.6,
  skin: "brown",
  shape: "round",
  hair: "victoryRolls",
  hairColor: "black",
  female: true,
  mouth: "o",
  tilt: 6,
};

const directorHead: HeadProps = {
  x: 59,
  y: 27,
  skin: "fair",
  shape: "square",
  hair: "older",
  hairColor: "grey",
  older: true,
  moustache: true,
  facing: -1,
  tilt: -4,
  mouth: "smile",
};

const flyerHead: HeadProps = {
  x: 46,
  y: 27.4,
  skin: "ruddy",
  shape: "oval",
  hair: "pinCurls",
  hairColor: "blonde",
  female: true,
  tilt: -5,
};

const ruralHead: HeadProps = {
  x: 38,
  y: 28,
  skin: "tan",
  shape: "square",
  hair: "slicked",
  hairColor: "brown",
  tilt: -2,
};

const criticHead: HeadProps = {
  x: 50,
  y: 27,
  skin: "olive",
  shape: "oval",
  hair: "slicked",
  hairColor: "dark",
  moustache: true,
  mouth: "smirk",
  tilt: 4,
};

const tweed = cloth("#7a5c42");
const denim = CLOTH.denim;
const straw = cloth("#dcc27e");
const dinner = cloth("#33343a");

export const marketing: PortraitSet = {
  // Trainee calling out the day's special through a megaphone.
  marketing_trainee: () => (
    <g>
      <Backdrop kind="street" />
      <Stage>
        <HairBack {...traineeHead} />
        <Torso x={44} y={41} skin="golden" outfit="sweater" main={CLOTH.mustard} width={0.92} />
        {/* Megaphone */}
        <path d="M51.4 34.2L54.6 33.4L68 23L71 36L56 37.4Z" fill="#e6e1d4" {...ol} />
        <path d="M68 23a2.2 6.6 -12 1 0 3 13a2.2 6.6 -12 1 0 -3 -13Z" fill="#c0392b" {...ol} />
        <path d="M54 37L68.6 32.2" {...line("#bdb6a6", 0.8)} />
        <Arm s={[56, 47]} e={[64, 50]} w={[59, 41.6]} skin="golden" sleeve={CLOTH.mustard} cuff={CLOTH.mustard.shade} width={6.2} hand="fist" handRot={-8} />
        <Head {...traineeHead} />
        <path d="M74 24.6l3.4 -1.8M74.4 29.6h3.8M74 34.4l3.4 1.8" {...line("#ffffff", 1)} />
      </Stage>
    </g>
  ),

  // Ad man in shirt sleeves unrolling a fresh billboard poster.
  campaign_manager: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={50} y={40.5} skin="golden" outfit="vest" main={CLOTH.grey} accent={CLOTH.navy.base} />
        {/* Poster sheet between a small roll (left) and the big roll (right) */}
        <path d="M24 37h50v15H24Z" fill="#f3ead2" {...ol} />
        <path d="M24 37h50v3.6H24Z" fill="#b8343a" {...ol} />
        <path d="M42.6 46.4C42.6 42.4 55.4 42.4 55.4 46.4ZM42.4 48.8h13.2v1.8c0 .8 -13.2 .8 -13.2 0Z" fill="#d3a238" {...ol} />
        <path d="M42 46.6h14v2.2H42Z" fill="#6e4a33" {...ol} />
        <path d="M30 44.6h7M31 47.6h6M61 44.6h7M61 47.6h6" {...line("#b8343a", 1)} />
        <path d="M21.4 36.4h4v15.6h-4Z" fill="#e8dcbc" {...ol} />
        <path d="M72.6 35.6h5.6v16.4h-5.6Z" fill="#e8dcbc" {...ol} />
        <path d="M75.4 35.6v16.4" {...line("#c9b98f", 0.8)} />
        <Arm s={[36.6, 47]} e={[29, 53]} w={[23.4, 47.6]} skin="golden" sleeve={CLOTH.white} sleeveTo={1.55} width={6.4} hand="fist" handFlip />
        <Arm s={[63.4, 47]} e={[71, 53]} w={[75.4, 47.6]} skin="golden" sleeve={CLOTH.white} sleeveTo={1.55} width={6.4} hand="fist" />
        <Head x={50} y={26.4} skin="golden" shape="oval" hair="sidePart" hairColor="black" glasses />
      </Stage>
    </g>
  ),

  // Radio host leaning in to a ribbon microphone under the ON AIR light.
  brand_manager: () => (
    <g>
      {/* Studio: acoustic tiles and the ON AIR sign */}
      <rect width="100" height="70" fill={W.wall} />
      <path d="M0 18h100M0 30h100M0 42h100M12 0v56M28 0v56M44 0v56M60 0v56M76 0v56M92 0v56" {...line(W.line, 0.6)} />
      <path d="M62 11.4h28v10.4H62Z" fill="#c25a50" stroke={W.deep} stroke-width="1" />
      <text x="76" y="19.2" font-size="6.6" fill="#f6efe2" {...LETTER}>
        ON AIR
      </text>
      <path d="M0 56h100v14H0Z" fill={W.wall2} />
      <Stage>
        <HairBack {...studioHead} />
        <Torso x={45} y={41} skin="brown" outfit="blouse" main={CLOTH.sky} accent="#b8343a" width={0.9} />
        {/* Script */}
        <g transform="rotate(-10 29 38)">
          <path d="M23.6 31.6h10.4v12.6H23.6Z" fill={CLOTH.white.base} {...ol} />
          <path d="M25.4 34.4h6.8M25.4 36.6h6.8M25.4 38.8h5" {...line(W.deep, 0.6)} />
        </g>
        <Arm s={[33.4, 47]} e={[28, 52]} w={[30.4, 45]} skin="brown" sleeve={CLOTH.sky} cuff={CLOTH.white.base} width={6} hand="pinch" handRot={-6} handFlip />
        {/* Ribbon microphone on a stand */}
        <Limb d="M66 40V58" w={1.6} color={CLOTH.charcoal.base} />
        <path d="M61.2 34.6C61.2 40 70.8 40 70.8 34.6" {...line(INK, 1.4)} />
        <path d="M62.4 28C62.4 24.4 69.6 24.4 69.6 28V36.6C69.6 40.2 62.4 40.2 62.4 36.6Z" fill={CLOTH.grey.light} {...ol} />
        <path d="M62.4 31.2h7.2v2.4h-7.2Z" fill={CLOTH.charcoal.base} {...ol} />
        <path d="M63.6 27.2h4.8M63.4 29.4h5.2M63.4 35.6h5.2M63.6 37.8h4.8" {...line(CLOTH.grey.shade, 0.6)} />
        <Arm s={[56.6, 47]} e={[63, 52]} w={[64.4, 47]} skin="brown" sleeve={CLOTH.sky} cuff={CLOTH.white.base} width={6} hand="fist" handRot={-4} />
        <Head {...studioHead} />
      </Stage>
    </g>
  ),

  // Silver-haired director flying a model plane that trails an advertising banner.
  brand_director: () => (
    <g>
      {/* Airfield: sky, a hangar and a windsock */}
      <rect width="100" height="70" fill={W.wall} />
      <path d="M44 22c2-4 8-4 10-1c3-2 8 0 7 3H43c-1-1 0-2 1-2Z" fill={W.hi} />
      <path d="M0 50h100v20H0Z" fill={W.wall2} />
      <path d="M2 50V40C2 31 30 31 30 40V50Z" fill={W.line} />
      <path d="M10 50V42h12v8M16 34V50" {...line(W.deep, 0.6)} />
      <path d="M88 50V24" {...line(W.deep, 0.9)} />
      <path d="M88 24.4L97 26.6L96.6 30L88 30.4Z" fill={W.deep} />
      <Stage>
        <Torso x={59} y={41} skin="fair" outfit="suit" main={tweed} accent={CLOTH.burgundy.base} />
        {/* Banner on its tow line */}
        <path d="M14 21.4C18 20.2 22 21.8 26 20.6V27.4C22 28.6 18 27 14 28.2Z" fill="#f4ecd6" {...ol} />
        <text x="20" y="26.4" font-size="4.6" fill="#b8343a" transform="rotate(-3 20 24.6)" {...LETTER}>
          EAT!
        </text>
        <path d="M26 21L30.4 24.6L26 27.2" {...line(INK, 0.4)} />
        {/* Model monoplane */}
        <path d="M30 24.4L32.2 19.8L34 20L34.4 23.4C38 22.8 42 22.8 44.6 24.2C45.4 24.8 45.4 25.8 44.6 26.4C42 27.6 36 27.6 30.6 26.4Z" fill="#b8343a" {...ol} />
        <path d="M33.6 25.6C36 24.6 40 24.6 42 25.4C41 27.4 35 27.4 33.6 25.6Z" fill="#f4ecd6" {...ol} />
        <path d="M37.6 22.8C38.4 21.6 41 21.6 41.6 22.8Z" fill="#b9cbd3" {...ol} />
        <path d="M45.4 21.6C46.2 23.6 46.2 26.8 45.4 28.8" {...line(INK, 0.9)} />
        <Arm s={[46, 48]} e={[39.4, 41.6]} w={[38.4, 33.6]} skin="fair" sleeve={tweed} width={6.6} hand="fist" handRot={6} handFlip />
        <Head {...directorHead} />
      </Stage>
    </g>
  ),

  // Ketchup: flinging a fan of mailers into the air, a bundle more under her arm.
  "ketchup:mass_marketeer": () => (
    <g>
      <Backdrop kind="street" />
      <Stage>
        <Torso x={46} y={41} skin="ruddy" outfit="blouse" main={CLOTH.pink} accent="#b8343a" width={0.9} />
        {/* Bundle of mailers */}
        <path d="M30.8 41.4l11.6 -1.4l1.2 9.6l-11.6 1.4Z" fill="#f4ecd6" {...ol} />
        <path d="M31.2 44.4l11.6 -1.4M31.6 47.2l11.6 -1.4M30.8 41.4l6.4 4.2l5.2 -5.6" {...line(W.deep, 0.5)} />
        <Arm s={[34.4, 47]} e={[30, 52]} w={[37.4, 50]} skin="ruddy" sleeve={CLOTH.pink} cuff={CLOTH.white.base} width={6} hand="fist" handRot={-70} handFlip />
        <Flyer x={62} y={15} rot={-24} />
        <Flyer x={71} y={13.6} rot={6} />
        <Flyer x={79.4} y={17.6} rot={28} />
        <Flyer x={83.4} y={26} rot={52} />
        <Flyer x={70} y={21.4} rot={-10} />
        <Arm s={[57.6, 47]} e={[67, 43]} w={[71.4, 33.6]} skin="ruddy" sleeve={CLOTH.pink} cuff={CLOTH.white.base} width={6} hand="open" />
        <Head {...flyerHead} />
      </Stage>
    </g>
  ),

  // Ketchup: farmer in a straw hat holding up a hand-painted roadside sign.
  "ketchup:rural_marketeer": () => (
    <g>
      {/* Country road: fields, a far hill and a rail fence */}
      <rect width="100" height="70" fill={W.wall} />
      <path d="M0 36C18 30 36 34 54 31C72 28 88 32 100 30V70H0Z" fill={W.wall2} />
      <path d="M0 44C30 42 70 42 100 44M0 50C30 48 70 48 100 50" {...line(W.line, 0.7)} />
      <path d="M0 47h100M0 53h100M8 43v14M30 43v14M52 43v14M74 43v14M96 43v14" {...line(W.deep, 1.2)} />
      <Stage>
        <Torso x={39} y={41} skin="tan" outfit="work" main={CLOTH.red} shirt={CLOTH.red} />
        {/* Overall bib and braces */}
        <path d="M30.6 72V48.4C35 47.6 43 47.6 47.4 48.4V72Z" fill={denim.base} {...ol} />
        <Limb d="M31.4 48.8L29 45.4M46.6 48.8L49 45.4" w={2} color={denim.base} />
        <path d="M32.4 50a1 1 0 1 0 0.01 0ZM45.6 50a1 1 0 1 0 0.01 0Z" fill="#d9c27a" {...ol} />
        {/* Roadside sign */}
        <Limb d="M70.4 30V60" w={2.6} color={CLOTH.brown.base} />
        <path d="M56 13.4h30v16.4H56Z" fill="#ece0c4" {...ol} />
        <path d="M56 21.6h30" {...line("#c9b98f", 0.6)} />
        <text x="69.4" y="21.8" font-size="7.4" fill="#b8343a" {...LETTER}>
          EATS
        </text>
        <path d="M60 25.2h18v-1.8l4 3l-4 3v-1.8H60Z" fill="#b8343a" />
        <Arm s={[52, 48]} e={[60, 52]} w={[68.4, 45.6]} skin="tan" sleeve={CLOTH.red} cuff={CLOTH.red.shade} width={6.6} hand="fist" handRot={2} />
        <Head {...ruralHead} />
        <OnHead h={ruralHead}>
          {/* Straw hat */}
          <path d="M-15.4 -5.6C-15.6 -8.8 16 -9.4 16.6 -6C16.8 -3.8 -14.6 -3 -15.4 -5.6Z" fill={straw.base} {...ol} />
          <path d="M-14 -4.8C-6 -4 6 -4.2 15.6 -5" {...line(straw.shade, 0.5)} />
          <path d="M-7.8 -6.8C-8.4 -12 -6 -15.4 0.6 -15.6C7 -15.6 9 -12 8.6 -6.8C3 -8 -3 -8 -7.8 -6.8Z" fill={straw.base} {...ol} />
          <path d="M-7.8 -6.8C-8.4 -12 -6 -15.4 0.6 -15.6C-3.6 -14 -5.8 -10.6 -5.8 -7.2Z" fill={straw.shade} />
          <path d="M-8.1 -9.2C-3 -10.4 4 -10.4 8.7 -9.2L8.6 -7C4 -8.2 -3 -8.2 -7.9 -7Z" fill={CLOTH.red.base} {...ol} />
        </OnHead>
      </Stage>
    </g>
  ),

  // Ketchup: monocled critic, napkin tucked in, fork raised over his notebook.
  "ketchup:gourmet_food_critic": () => (
    <g>
      {/* Dining room: panelled wall, a framed still life and a sconce */}
      <rect width="100" height="70" fill={W.wall} />
      <path d="M0 40h100v30H0Z" fill={W.wall2} />
      <path d="M0 40h100M6 44h22v10H6ZM72 44h22v10H72Z" {...line(W.deep, 0.7)} />
      <path d="M8 12h20v18H8Z" fill={W.hi} stroke={W.deep} stroke-width="1.2" />
      <path d="M11 26c2-6 12-6 14 0ZM14 21a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z" fill={W.line} />
      <path d="M84 30V22M80 22h8l-1 -6h-6Z" fill={W.hi} stroke={W.deep} stroke-width="0.8" />
      <Stage>
        <Torso x={50} y={41} skin="olive" outfit="suit" main={dinner} accent={CLOTH.burgundy.base} bow />
        {/* Napkin tucked into the collar */}
        <path d="M43.2 42.6C46 44.2 54 44.2 56.8 42.6L58.6 46L50 56L41.4 46Z" fill={CLOTH.white.base} {...ol} />
        <path d="M50 44.6V54M45.4 46.6L49 50.6" {...line(CLOTH.white.shade, 0.6)} />
        {/* Notebook */}
        <g transform="rotate(-8 30 38)">
          <path d="M25 31.6h10v12.4H25Z" fill="#f4ecd6" {...ol} />
          <path d="M25 31.6h10v1.8H25Z" fill={CLOTH.burgundy.base} {...ol} />
          <path d="M26.6 35.8h6.6M26.6 38h6.6M26.6 40.2h4.4" {...line(W.deep, 0.5)} />
        </g>
        <Arm s={[37.4, 48]} e={[30, 52]} w={[31.4, 46]} skin="olive" sleeve={dinner} cuff={CLOTH.white.base} width={6.4} hand="fist" handFlip />
        {/* Fork with a morsel */}
        <Limb d="M68.8 45L69.4 31.6" w={1} color="#c9ccd0" />
        <path d="M67.4 31.4C67.4 33.4 71.2 33.4 71.2 31.4L71 28.6M67.6 28.6L67.4 31.4M69.3 28.4V31" {...line(INK, 0.5)} />
        <path d="M66.8 28.6c0 -2.4 4.8 -2.8 5 -0.4c0 1.6 -5 2 -5 0.4Z" fill="#8a4b2a" {...ol} />
        <Arm s={[62.6, 48]} e={[70, 52]} w={[69, 44.6]} skin="olive" sleeve={dinner} cuff={CLOTH.white.base} width={6.4} hand="fist" handRot={-2} />
        <Head {...criticHead} />
        <OnHead h={criticHead}>
          {/* One eyebrow raised */}
          <path d="M2.8 -3.9C3.8 -4.8 5.4 -4.6 6.3 -3.3" {...line(SKIN.olive.shade, 1.5)} />
          <path d="M2.4 -4.4C3.2 -6.4 5.4 -6.6 6.6 -4.8" {...line("#26170d", 0.95)} />
          {/* Monocle on a chain */}
          <path d="M-5.4 -0.8a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0 -5.5 0Z" fill="#dfeef2" fill-opacity="0.35" stroke="#b08a4a" stroke-width="0.7" />
          <path d="M-5.2 0.6C-6.2 4 -5.6 8 -3.6 12" {...line("#b08a4a", 0.45)} />
        </OnHead>
      </Stage>
      {/* Table */}
      <path d="M0 57h100v13H0Z" fill={CLOTH.white.base} {...ol} />
      <path d="M36 59.6c0 -2.6 28 -2.6 28 0c0 2.6 -28 2.6 -28 0Z" fill={CLOTH.white.light} {...ol} />
    </g>
  ),
};
