/** Service (purple): waitress, new business developer, CFO, Ketchup lobbyist and movie stars. */
import {
  Arm,
  Backdrop,
  CLOTH,
  Hand,
  Head,
  HairBack,
  INK,
  Limb,
  SKIN,
  Stage,
  Torso,
  cloth,
  line,
  ol,
  type HeadProps,
  type Tone,
} from "./parts.js";
import type { PortraitSet } from "./types.js";

/** The light backdrop wash (same values as the shared backdrops). */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

/** The same transform `Head` uses, for drawing extras (visor, sunglasses) in head space. */
const headT = (h: HeadProps) =>
  `translate(${h.x} ${h.y}) rotate(${h.tilt ?? 0}) scale(${(h.facing ?? 1) * (h.scale ?? 1)} ${h.scale ?? 1})`;

/** Four-point twinkle star subpath. */
const twinkle = (x: number, y: number, r: number) => {
  const q = r * 0.22;
  return `M${x} ${y - r}L${x + q} ${y - q}L${x + r} ${y}L${x + q} ${y + q}L${x} ${y + r}L${x - q} ${y + q}L${x - r} ${y}L${x - q} ${y - q}Z`;
};

const skinCloth = (k: keyof typeof SKIN): Tone => ({ base: SKIN[k].base, shade: SKIN[k].shade, light: SKIN[k].light });

/** City-hall portico: entablature, fluted columns, steps. */
function Civic() {
  return (
    <g>
      <rect width="100" height="70" fill={W.wall} />
      <path d="M0 6h100v9H0Z" fill={W.wall2} />
      <path d="M0 13h100M0 15h100" {...line(W.deep, 0.6)} />
      <path d="M5 15h9v43H5ZM20 15h9v43h-9ZM71 15h9v43h-9ZM86 15h9v43h-9Z" fill={W.hi} />
      <path
        d="M7.4 18v38M9.5 18v38M11.6 18v38M22.4 18v38M24.5 18v38M26.6 18v38M73.4 18v38M75.5 18v38M77.6 18v38M88.4 18v38M90.5 18v38M92.6 18v38"
        {...line(W.line, 0.5)}
      />
      <path d="M4 15h11v2.4H4ZM19 15h11v2.4H19ZM70 15h11v2.4H70ZM85 15h11v2.4H85Z" fill={W.deep} />
      <path d="M0 58h100v12H0Z" fill={W.wall2} />
      <path d="M0 58h100M0 62h100M0 66h100" {...line(W.deep, 0.6)} />
    </g>
  );
}

/** Movie-studio set: the shared studio wash plus a clapperboard leaning on the right. */
function StudioClapper({ dim = false }: { dim?: boolean }) {
  return (
    <g>
      <Backdrop kind="studio" />
      {dim && <rect width="100" height="70" fill={W.wall2} opacity="0.6" />}
      <path d="M79 41h16v15H79Z" fill="#4a4b4f" />
      <path d="M78.6 37.4l15.6 -3.6l0.8 3.4l-15.6 3.6Z" fill="#4a4b4f" />
      <path d="M81.4 36.8l2.4 2.6M85.4 35.8l2.4 2.6M89.4 34.9l2.4 2.6M81 45h11M81 49h8M81 53h10" {...line(W.hi, 0.9)} />
    </g>
  );
}

// --- People ---------------------------------------------------------------------------------------

const waitressHead: HeadProps = {
  x: 49,
  y: 27,
  skin: "fair",
  hair: "ponytail",
  hairColor: "auburn",
  female: true,
  hat: "waitress",
  ribbon: "#d9534f",
  tilt: 5,
};

const nbdHead: HeadProps = { x: 49, y: 27, skin: "brown", shape: "square", hair: "pompadour", hairColor: "black", tilt: 4 };

const cfoHead: HeadProps = {
  x: 50,
  y: 28,
  skin: "golden",
  shape: "round",
  hair: "bald",
  hairColor: "grey",
  older: true,
  glasses: true,
  mouth: "smile",
  facing: -1,
  tilt: -4,
};

const lobbyHead: HeadProps = {
  x: 50,
  y: 28,
  skin: "olive",
  shape: "square",
  hair: "slicked",
  hairColor: "black",
  moustache: true,
  mouth: "smirk",
  hat: "fedora",
  hatColor: cloth("#6a5a48"),
  ribbon: "#2a2321",
  tilt: -6,
};

const bHead: HeadProps = {
  x: 50,
  y: 27,
  skin: "fair",
  hair: "victoryRolls",
  hairColor: "blonde",
  female: true,
  lips: "#c0283a",
  mouth: "grin",
  tilt: -7,
};

const cHead: HeadProps = {
  x: 52,
  y: 27,
  skin: "tan",
  hair: "sidePart",
  hairColor: "black",
  moustache: true,
  mouth: "grin",
  facing: -1,
  tilt: 6,
};

const dHead: HeadProps = {
  x: 48,
  y: 27,
  skin: "ruddy",
  hair: "bob",
  hairColor: "auburn",
  female: true,
  older: true,
  lips: "#c0506a",
  mouth: "smirk",
  tilt: 4,
};

export const service: PortraitSet = {
  // Bright diner waitress taking an order on her pad.
  waitress: () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <HairBack {...waitressHead} />
        <Torso x={50} y={41} skin="fair" outfit="waitress" main={CLOTH.mint} apron width={0.92} />
        {/* Order pad */}
        <path d="M58.4 39.6l8.6 -1.4l1.6 10l-8.6 1.4Z" fill="#fbf6e2" {...ol} />
        <path d="M60 42.4l6 -1M60.4 44.6l6 -1M60.8 46.8l4 -0.7" {...line("#7f9fc0", 0.45)} />
        <path d="M58.4 39.6l8.6 -1.4l0.3 1.8l-8.6 1.4Z" fill="#d9534f" {...ol} />
        <Arm s={[65, 47]} e={[69, 56]} w={[65.6, 50.4]} skin="fair" sleeve={CLOTH.mint} sleeveTo={0.4} width={6.4} hand="fist" handRot={-20} />
        {/* Pencil */}
        <path d="M52.6 50.4L59.4 43.6" {...line("#e9b949", 1.1)} />
        <path d="M59.4 43.6l0.9 -0.9" {...line("#e7a3a8", 1.1)} />
        <Arm s={[35, 47]} e={[37, 58]} w={[50.4, 51]} skin="fair" sleeve={CLOTH.mint} sleeveTo={0.4} width={6.4} hand="pinch" handRot={30} />
        <Head {...waitressHead} />
      </Stage>
    </g>
  ),

  // Go-getter with a rolled blueprint under one hand and a model house on the other palm.
  new_business_developer: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={50} y={41} skin="brown" outfit="sweater" main={CLOTH.forest} />
        {/* Blueprint roll */}
        <g transform="translate(31 39) rotate(-24)">
          <path d="M-3 -13h6v26h-6Z" fill="#3f6fa6" {...ol} />
          <path d="M1.2 -13h1.8v26h-1.8Z" fill="#2f5684" />
          <path d="M-3 -7h6M-3 -1h6M-0.6 -13v26" {...line("#cfe0f2", 0.4)} />
          <path d="M-3 -13a3 1.2 0 1 0 6 0a3 1.2 0 1 0 -6 0Z" fill="#e8f0f8" {...ol} />
          <path d="M0 -13.2a1.2 .5 0 1 1 -.8 .5" {...line("#3f6fa6", 0.4)} />
        </g>
        <Arm s={[36, 47]} e={[30, 57]} w={[32.6, 47.6]} skin="brown" sleeve={CLOTH.forest} hand="fist" handRot={66} />
        <Arm s={[64, 47]} e={[70, 57]} w={[64.6, 51.4]} skin="brown" sleeve={CLOTH.forest} hand="open" handRot={-84} />
        {/* Model house */}
        <path d="M56 41.6h9.4v6.8H56Z" fill="#f2e6c8" {...ol} />
        <path d="M62.6 41.6h2.8v6.8h-2.8Z" fill="#d9c8a0" />
        <path d="M62.2 37.6v-3h1.8v4.6Z" fill="#9a5a3c" {...ol} />
        <path d="M54.6 42.2L60.7 36.4L66.8 42.2Z" fill="#c8483e" {...ol} />
        <path d="M59.4 48.4v-3.6h2.4v3.6ZM57 43.4h1.8v1.6H57Z" fill="#6f8fb0" {...ol} />
        <Head {...nbdHead} />
      </Stage>
    </g>
  ),

  // Bookkeeper in a green eyeshade, dropping a coin on the pile beside the open ledger.
  cfo: () => (
    <g>
      <Backdrop kind="office" />
      <Stage>
        <Torso x={50} y={41} skin="golden" outfit="vest" main={CLOTH.brown} accent="#2f4f7a" />
        {/* Ledger */}
        <path d="M27 46.4L41 43.4L55 45.2V53L41 51.2L27 54Z" fill="#2f5a3e" {...ol} />
        <path d="M28.2 45.6L41 42.8V50.4L28.2 53ZM41 42.8L53.8 44.4V52L41 50.4Z" fill="#fbf6e2" {...ol} />
        <path d="M30 47.6l9 -1.9M30 49.6l9 -1.9M43 46.1l9 1.1M43 48.1l9 1.1" {...line("#9aa7b4", 0.4)} />
        <path d="M35.6 44.4v7.4M48.6 45v7.2" {...line("#c0504d", 0.45)} />
        {/* Coin stacks */}
        <path d="M63 40.6h8v10.6h-8ZM71.6 44.6h7v6.6h-7Z" fill="#d3a238" {...ol} />
        <path
          d="M63 42.2h8M63 43.8h8M63 45.4h8M63 47h8M63 48.6h8M63 50.2h8M71.6 46.2h7M71.6 47.8h7M71.6 49.4h7"
          {...line("#9c7424", 0.4)}
        />
        <path d="M63 40.6a4 1.3 0 1 0 8 0a4 1.3 0 1 0 -8 0ZM71.6 44.6a3.5 1.2 0 1 0 7 0a3.5 1.2 0 1 0 -7 0Z" fill="#efcf74" {...ol} />
        {/* Pencil */}
        <path d="M49.6 47.4L55.4 40.2" {...line("#e9b949", 1.1)} />
        <path d="M55.4 40.2l0.8 -1" {...line("#e7a3a8", 1.1)} />
        <Arm s={[64, 47]} e={[66, 57]} w={[55.4, 50.6]} skin="golden" sleeve={CLOTH.white} cuff={false} hand="pinch" handRot={-34} handFlip />
        <Head {...cfoHead} />
        {/* Green eyeshade visor */}
        <g transform={headT(cfoHead)}>
          <path d="M-7.8 -4.6C-3 -7.2 4 -7.4 8.4 -5.2L8.2 -7.2C4 -9.4 -3 -9.2 -7.8 -6.6Z" fill="#2f6a46" {...ol} />
          <path
            d="M-4.6 -5.4C0 -6.8 5 -6.6 8.6 -5L13.4 -1.8C9 -0.8 3.4 -1.4 -0.6 -2.8C-2.6 -3.4 -4 -4.2 -4.6 -5.4Z"
            fill="#3e9a62"
            opacity="0.8"
            {...ol}
          />
        </g>
      </Stage>
    </g>
  ),

  // Sly fixer on the city-hall steps: tips his fedora, briefcase raised.
  "ketchup:lobbyist": () => (
    <g>
      <Civic />
      <Stage>
        <Torso x={50} y={41} skin="olive" outfit="suit" main={CLOTH.charcoal} accent="#c9a23a" />
        <Arm s={[36, 47]} e={[27, 46]} w={[33.6, 32.6]} skin="olive" sleeve={CLOTH.charcoal} hand="pinch" />
        <Arm s={[64, 47]} e={[71, 56]} w={[64, 44]} skin="olive" sleeve={CLOTH.charcoal} hand={false} />
        <Head {...lobbyHead} />
        {/* Briefcase */}
        <path d="M60 41.4v-2.6c0-1.8 6-1.8 6 0v2.6" {...line(INK, 2.4)} />
        <path d="M60 41.4v-2.6c0-1.8 6-1.8 6 0v2.6" {...line("#5a3520", 1.2)} />
        <rect x="52" y="41" width="22" height="11" rx="1.4" fill="#7a4a2a" {...ol} />
        <path d="M52.6 47.6H73.4V51.4H52.6Z" fill="#5a3520" />
        <path d="M52 44.6h22" {...line("#5a3520", 0.6)} />
        <path d="M56 43.6h2.4v2.4H56ZM67.6 43.6h2.4v2.4h-2.4Z" fill="#d9b25a" {...ol} />
        <Hand x={63} y={43.4} skin="olive" pose="fist" />
      </Stage>
    </g>
  ),

  // A-list glamour: platinum starlet in a red gown and white fur, waving to the flashbulbs.
  "ketchup:b_movie_star": () => (
    <g>
      <Backdrop kind="studio" />
      <path d={twinkle(14, 22, 3.4) + twinkle(86, 18, 3) + twinkle(20, 44, 2.2) + twinkle(83, 42, 2.4) + twinkle(30, 14, 1.8)} fill="#fff8de" stroke="#d9b25a" stroke-width="0.5" stroke-linejoin="round" />
      <Stage>
        <HairBack {...bHead} />
        <Torso x={50} y={41} skin="fair" outfit="tee" main={cloth("#b8283a")} />
        <path d="M45.4 41.2L50 49.4L54.6 41.2C53 43 47 43 45.4 41.2Z" fill={SKIN.fair.base} {...ol} />
        <Arm s={[65, 48.4]} e={[74, 46]} w={[71, 33.4]} skin="fair" hand="open" />
        {/* Fur stole */}
        <Limb d="M31.4 58C31.6 52 34.6 48.6 40.4 47.6M59.6 47.6C65.4 48.6 68.4 52 68.6 58" w={6.4} color="#f6f3ec" />
        <path d="M33 54.6c1 -0.8 2 -0.6 2.6 0M36 50.6c1 -0.6 2 -0.4 2.4 0.2M62 50.8c0.8 -0.6 1.8 -0.6 2.4 0M64.6 54.6c0.8 -0.8 1.8 -0.8 2.4 0" {...line("#d6d1c6", 0.5)} />
        {/* Diamond necklace */}
        <path d="M45.6 42.4C47.6 45 52.4 45 54.4 42.4" {...line("#e6eef4", 0.9)} />
        <path d={twinkle(50, 45.4, 1.6) + twinkle(47, 44.2, 0.9) + twinkle(53, 44.2, 0.9)} fill="#ffffff" stroke="#8db7d6" stroke-width="0.35" />
        <Head {...bHead} />
      </Stage>
    </g>
  ),

  // Second-billing heart-throb in a white dinner jacket, signing an autograph book.
  "ketchup:c_movie_star": () => (
    <g>
      <StudioClapper />
      <Stage>
        <Torso x={52} y={41} skin="tan" outfit="suit" main={CLOTH.cream} accent="#1f1b1a" bow />
        {/* Autograph book */}
        <path d="M29 41.2L37.6 39.4L46.6 41.4V49.6L37.6 47.6L29 49.4Z" fill="#a4363e" {...ol} />
        <path d="M30 40.6L37.6 39V47L30 48.6ZM37.6 39L45.6 40.8V48.8L37.6 47Z" fill="#fbf6e2" {...ol} />
        <path d="M38.8 43.4c0.8 -2 1.4 0.6 2 -0.6s0.8 1.2 1.6 0.2s0.6 0.8 1.4 0.4M39 45.6l4.6 1" {...line("#2f4f7a", 0.45)} />
        <Arm s={[38, 47]} e={[31, 57]} w={[31, 49]} skin="tan" sleeve={CLOTH.cream} hand="fist" handRot={14} />
        {/* Fountain pen */}
        <path d="M49.6 37.6L51.4 39.2L45.2 44.6L44.2 45.4L44.6 44Z" fill="#1f1b1a" {...ol} />
        <Arm s={[66, 47]} e={[67, 57]} w={[52.6, 48.4]} skin="tan" sleeve={CLOTH.cream} hand="pinch" handRot={-34} handFlip />
        <Head {...cHead} />
      </Stage>
    </g>
  ),

  // Faded diva in cat-eye sunglasses and a tired boa, still admiring herself in a hand mirror.
  "ketchup:d_movie_star": () => (
    <g>
      <StudioClapper dim />
      {/* Cobweb */}
      <path d="M4 10L17 10M4 10V23M4 10L14 20M4 10L16 15M4 10L9 22M8 10C8 12 6 14 4 14M12 10C12 14 8 18 4 18M15.6 10C15.6 16 10 21 4 21.6" {...line(W.deep, 0.35)} />
      <Stage>
        <HairBack {...dHead} />
        <Torso x={48} y={41} skin="ruddy" outfit="blouse" main={cloth("#a98a9a")} accent="#d9b25a" />
        {/* Feather boa */}
        <path d="M30 58C31 50 37 47 42 46.4C46 46 54 46 58 46.6C63 47.4 66 50 67 58" fill="none" stroke={INK} stroke-width="5.2" stroke-linecap="round" stroke-dasharray="0.1 2" />
        <path d="M30 58C31 50 37 47 42 46.4C46 46 54 46 58 46.6C63 47.4 66 50 67 58" fill="none" stroke="#c9a3b4" stroke-width="4.2" stroke-linecap="round" stroke-dasharray="0.1 2" />
        {/* Hand mirror */}
        <Limb d="M70.4 35.4L69.6 43" w={2} color="#c9a24a" />
        <path d="M64.6 28.6a6 7 -8 1 0 12 0a6 7 -8 1 0 -12 0Z" fill="#c9a24a" {...ol} />
        <path d="M66 28.6a4.6 5.6 -8 1 0 9.2 0a4.6 5.6 -8 1 0 -9.2 0Z" fill="#cfe3ea" />
        <path d="M68 25.4l2.6 -1.6M68.2 28l4.4 -3" {...line("#ffffff", 0.7)} />
        <Arm s={[62, 47]} e={[71, 56]} w={[66, 44.4]} skin="ruddy" sleeve={cloth("#a98a9a")} hand="fist" handRot={84} />
        <Head {...dHead} />
        {/* Cat-eye sunglasses */}
        <g transform={headT(dHead)}>
          <path
            d="M-5.6 -2.4C-3.6 -2.8 -1.6 -2.6 -0.2 -2.2C-0.4 0.2 -1.6 1 -2.8 1C-4.4 1 -5.4 -0.4 -5.6 -2.4ZM2.4 -2.4C3.8 -2.7 5.4 -2.7 6.8 -2.4C6.6 -0.4 5.6 0.6 4.4 0.6C3.2 0.6 2.6 -0.6 2.4 -2.4Z"
            fill="#2b2420"
            {...ol}
          />
          <path d="M-5.6 -2.4l-1.2 -1.4M6.8 -2.4l0.9 -1.3M-0.2 -1.9h2.6" {...line(INK, 0.7)} />
          <path d="M-4.6 -1.6l1.6 -0.3M3.2 -1.7l1.4 -0.2" {...line("#8a8d90", 0.5)} />
        </g>
      </Stage>
    </g>
  ),
};
