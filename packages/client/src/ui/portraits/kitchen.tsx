/** Kitchen (olive green): kitchen trainee, burger and pizza cooks and chefs, Ketchup cooks. */
import type { ComponentChildren } from "preact";
import { Arm, Backdrop, CLOTH, Hand, HairBack, Head, INK, Stage, Torso, line, ol, type HeadProps } from "./parts.js";
import type { PortraitSet } from "./types.js";

/** Draw in a head's own frame (centre 0,0; same tilt and facing), e.g. a headband or a bun. */
function OnHead({ h, children }: { h: HeadProps; children: ComponentChildren }) {
  const f = (h.facing ?? 1) * (h.scale ?? 1);
  return <g transform={`translate(${h.x} ${h.y}) rotate(${h.tilt ?? 0}) scale(${f} ${h.scale ?? 1})`}>{children}</g>;
}

/** Rising steam: three soft wisps from (x, y). */
const Steam = ({ x, y }: { x: number; y: number }) => (
  <path
    d={`M${x - 3} ${y}c-1.4 -1.6 1.4 -2.8 0 -4.6M${x} ${y - 1}c-1.6 -1.8 1.6 -3 0 -5M${x + 3} ${y}c-1.4 -1.6 1.4 -2.8 0 -4.6`}
    {...line("#f4f6f5", 0.9)}
  />
);

const STEEL = { base: "#b9bfc3", shade: "#8e959a", light: "#e9edef" };
const WOOD = { base: "#c6955a", shade: "#9a6c3a", light: "#e0b984" };
const RICE = "#fbf8f0";

const trainee: HeadProps = { x: 40, y: 27, skin: "fair", hair: "ponytail", hairColor: "blonde", female: true, tilt: 5, ribbon: "#c8384a" };
const kimchiMaster: HeadProps = {
  x: 58, y: 27, skin: "golden", hair: "slicked", hairColor: "grey", shape: "round", female: true, older: true,
  mouth: "smile", facing: -1, tilt: -4, lips: "#a33a3a",
};
const sushiChef: HeadProps = { x: 46, y: 27, skin: "tan", hair: "crop", hairColor: "grey", shape: "square", older: true, mouth: "smile", tilt: 3 };
const noodleCook: HeadProps = { x: 58, y: 27, skin: "fair", hair: "bob", hairColor: "black", shape: "round", female: true, facing: -1, tilt: -4 };

export const kitchen: PortraitSet = {
  // Proud chef in a toque presenting a plate of burgers.
  burger_chef: () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={48} y={44} skin="brown" outfit="chef" main={CLOTH.white} accent="#c0392b" />
        {/* Plate of burgers */}
        <path d="M50 48.2a12 3 0 1 0 24 0a12 3 0 1 0 -24 0Z" fill="#f4f1ea" {...ol} />
        <path d="M53 46.4C53 41.8 60 41.8 60 46.4ZM62 45.8C62 41.4 69 41.4 69 45.8Z" fill="#d79a46" {...ol} />
        <path d="M52.6 46.2h7.8v1.6h-7.8ZM61.6 45.6h7.8v1.6h-7.8Z" fill="#5a3320" {...ol} />
        <path d="M52.8 46l1 -0.8l1 0.8l1 -0.8l1 0.8l1 -0.8l1 0.8l1 -0.8l1 0.8M61.8 45.4l1 -0.8l1 0.8l1 -0.8l1 0.8l1 -0.8l1 0.8l1 -0.8l1 0.8" {...line("#5c9a3a", 0.8)} />
        <path d="M55 43.4h1M57 43h1M64 42.8h1M66 42.4h1" {...line("#f3e2b4", 0.6)} />
        <Arm s={[62, 51]} e={[68, 58]} w={[63.4, 51.6]} skin="brown" sleeve={CLOTH.white} cuff={false} hand="open" handRot={-84} />
        <Head x={48} y={30} skin="brown" shape="round" hair="crop" hairColor="black" hat="toque" moustache tilt={-4} />
      </Stage>
    </g>
  ),
  // Young cook in a paper cap and apron, showing off a fresh pizza on the peel.
  pizza_cook: () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={53} y={41} skin="olive" outfit="tee" main={CLOTH.white} apron />
        {/* Peel and pizza */}
        <path d="M40.6 55L33.4 41.6" {...line("#8a5a32", 2.2)} />
        <path d="M24 26C18 29 16.4 37 20.6 41.6C24.2 45.4 32 45 35.6 40.4C39.4 35.6 38 27.6 32.6 25.2C29.6 24 26.4 24.6 24 26Z" fill="#c69a5e" {...ol} />
        <path d="M19.6 34.4a8.2 7.4 -20 1 0 16.4 0a8.2 7.4 -20 1 0 -16.4 0Z" fill="#e8bd6a" {...ol} />
        <path d="M21 34.4a6.8 6 -20 1 0 13.6 0a6.8 6 -20 1 0 -13.6 0Z" fill="#c8402c" />
        <path d="M24 31a1.4 1.4 0 1 0 0.01 0ZM29.6 30a1.4 1.4 0 1 0 0.01 0ZM26.8 35.8a1.4 1.4 0 1 0 0.01 0ZM31.8 36.4a1.4 1.4 0 1 0 0.01 0ZM23.4 38a1.2 1.2 0 1 0 0.01 0Z" fill="#8a2a1e" />
        <path d="M25 33.4c1.6 -1 3 0 4.4 -0.6M28 39c1.4 -0.6 2.6 0 3.4 -0.8" {...line("#f6e6b8", 1)} />
        <Arm s={[38, 47]} e={[33, 56]} w={[36, 50.6]} skin="olive" sleeve={CLOTH.white} sleeveTo={0.45} hand="fist" handRot={-28} />
        <Head x={53} y={27} skin="olive" hair="pompadour" hairColor="dark" hat="paper" facing={-1} tilt={-5} />
      </Stage>
    </g>
  ),

  // Eager young trainee whisking batter in a mixing bowl held in the crook of her arm.
  kitchen_trainee: () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <HairBack {...trainee} />
        <Torso x={41} y={41} skin="fair" outfit="tee" main={CLOTH.sky} apron />
        <Arm s={[56, 48]} e={[69, 57]} w={[76, 47]} skin="fair" sleeve={CLOTH.sky} sleeveTo={0.4} hand={false} />
        {/* Bowl: batter, whisk, front */}
        <path d="M52 41a12 3 0 1 0 24 0a12 3 0 1 0 -24 0Z" fill="#f1dca0" {...ol} />
        <path d="M51 30.2L56 35.8" {...line("#8a5a32", 2.2)} />
        <path d="M55.6 35.4C59.4 34.4 65.4 39.6 65.4 43.6C61.6 44.4 55.4 39.2 55.6 35.4ZM55.6 35.4C59.6 36.8 63 41 62.6 43.8" {...line("#6f777c", 0.8)} />
        <path d="M52 41C52 47.4 57.4 51.6 64 51.6C70.6 51.6 76 47.4 76 41C76 43.2 70.6 44.6 64 44.6C57.4 44.6 52 43.2 52 41Z" fill="#efe5cc" {...ol} />
        <path d="M53.2 45.6C57 47.8 71 47.8 74.8 45.6" {...line("#c0392b", 1.3)} />
        <path d="M70 48.8C72.6 47.6 74.6 45.6 75.4 43" {...line("#c9bc9c", 1.2)} />
        <Hand x={76.4} y={46.6} skin="fair" pose="fist" rot={-28} />
        <Arm s={[26, 48]} e={[38, 61]} w={[52, 40.6]} skin="fair" sleeve={CLOTH.sky} sleeveTo={0.4} hand="fist" handRot={46} />
        <Head {...trainee} />
      </Stage>
    </g>
  ),
  // Short-order cook in a paper hat, flipping a patty high off his spatula.
  burger_cook: () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={57} y={41} skin="ruddy" outfit="tee" main={CLOTH.white} apron />
        {/* Spatula and flying patty */}
        <path d="M37.4 45.4L31.6 39.6" {...line("#5a3320", 2.2)} />
        <path d="M31.8 39.8L28.6 36.4" {...line(STEEL.shade, 1)} />
        <path d="M20.4 34.2L26.8 29.4L30.6 35.2L24.2 40Z" fill={STEEL.base} {...ol} />
        <path d="M22.2 34.4L26.6 31.2" {...line(STEEL.light, 0.7)} />
        <path d="M17.4 22.6C17 19.4 22.6 17.4 27.4 18.4C31.6 19.4 33.8 22.4 32.4 24.6C30.6 27.2 24.4 27.6 20.6 26.2C18.6 25.4 17.6 24 17.4 22.6Z" fill="#7a4428" {...ol} />
        <path d="M20.6 21.6l8 1.6M21 23.8l8 1.4" {...line("#4a2614", 0.8)} />
        <path d="M14.4 28.6c-1 -2.6 -0.4 -5 1 -7M35.6 20.8c1 2 1 4 0 6.2M24 31.6c-1.6 -0.4 -2.6 -1.4 -3.2 -2.6" {...line("#f4f6f5", 0.8)} />
        <Arm s={[42, 48]} e={[38, 58]} w={[38.6, 47.4]} skin="ruddy" sleeve={CLOTH.white} sleeveTo={0.4} hand="fist" handRot={-45} />
        <Head x={57} y={27} skin="ruddy" shape="square" hair="slicked" hairColor="auburn" hat="paper" facing={-1} tilt={-7} />
      </Stage>
    </g>
  ),
  // Proud chef in a tall toque showing off a whole pizza in its open box.
  pizza_chef: () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={42} y={42} skin="tan" outfit="chef" main={CLOTH.white} accent="#2f4f7a" />
        <Arm s={[57, 50]} e={[70, 59]} w={[78, 49]} skin="tan" sleeve={CLOTH.white} hand={false} />
        {/* Open pizza box */}
        <path d="M52.6 41L54.4 29.6H79.4L78.6 41Z" fill="#c9a26a" {...ol} />
        <path d="M55.2 39.6L56.4 31.4H77.4L76.8 39.6Z" fill="#dcc08e" />
        <path d="M60.6 33.4h11M62.4 36.6h7.4" {...line("#c0392b", 1)} />
        <path d="M52.6 41H78.6L81 48.4H50.2Z" fill="#dcc08e" {...ol} />
        <path d="M50.2 48.4H81V51.6H50.2Z" fill="#b08650" {...ol} />
        <path d="M53 44.6a12.6 3.2 0 1 0 25.2 0a12.6 3.2 0 1 0 -25.2 0Z" fill="#d79a46" {...ol} />
        <path d="M54.6 44.6a11 2.4 0 1 0 22 0a11 2.4 0 1 0 -22 0Z" fill="#c8402c" />
        <path d="M57.4 44.2a1.6 0.8 0 1 0 0.01 0ZM62.4 43.2a1.6 0.8 0 1 0 0.01 0ZM67.6 45.4a1.6 0.8 0 1 0 0.01 0ZM72.4 43.8a1.6 0.8 0 1 0 0.01 0ZM63 46.2a1.4 0.7 0 1 0 0.01 0Z" fill="#8a2a1e" />
        <path d="M58.6 45.6c2 -0.6 3.6 0 5 -0.4M68.6 43.2c1.6 -0.4 3 0 4 -0.4" {...line("#f6e6b8", 0.9)} />
        <Hand x={81.6} y={49} skin="tan" pose="fist" rot={-20} />
        <Arm s={[27, 50]} e={[36, 61]} w={[50, 49.6]} skin="tan" sleeve={CLOTH.white} hand="fist" handRot={10} />
        <Head x={42} y={30} skin="tan" shape="round" hair="crop" hairColor="black" hat="toque" moustache tilt={3} />
      </Stage>
    </g>
  ),
  // Kimchi master, an older cook in whites, hugging a glazed earthenware jar brimming with kimchi.
  "ketchup:kimchi_master": () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <OnHead h={kimchiMaster}>
          <path d="M-12.4 -8.4a3.8 3.6 0 1 0 7.6 0a3.8 3.6 0 1 0 -7.6 0Z" fill="#c0bcb4" {...ol} />
          <path d="M-11 -9.4c1.4 -1.2 3 -1.2 4.2 0" {...line("#948f87", 0.5)} />
        </OnHead>
        <Torso x={58} y={41} skin="golden" outfit="chef" main={CLOTH.white} accent="#b8343a" apron />
        <Arm s={[43, 48]} e={[34, 58]} w={[24.4, 45]} skin="golden" sleeve={CLOTH.white} hand={false} />
        {/* Onggi jar with kimchi spilling over the mouth */}
        <path d="M27 33.4C28.6 30.6 33.6 29.6 36.6 30.4C39.6 29.4 43.4 31 43.8 33.6C41 35 30 35 27 33.4Z" fill="#c8402c" {...ol} />
        <path d="M30.4 31.6c1.4 -1.4 3 -1.6 4.2 -0.4M37.6 31c1.2 -0.8 2.8 -0.6 3.6 0.6" {...line("#e8e29a", 0.8)} />
        <path d="M27.6 33.2C27 35 25 36.2 23.6 39C21.6 43 22.6 48.4 26 51.6H44.4C47.8 48.4 48.8 43 46.8 39C45.4 36.2 43.4 35 42.8 33.2C38.6 34.6 31.8 34.6 27.6 33.2Z" fill="#7a4a2c" {...ol} />
        <path d="M41 36C44.4 38.6 46 43.4 44.4 48C43.6 49.6 42.6 50.8 41.6 51.6H44.4C47.8 48.4 48.8 43 46.8 39C45.6 36.6 43.6 35.2 42.8 33.6Z" fill="#5e3720" />
        <path d="M26.4 38.6C26 41 26 43 26.6 45" {...line("#a77a55", 1.2)} />
        <path d="M24.6 42.4C30 44.8 40.6 44.8 46 42.4" {...line("#5e3720", 0.6)} />
        <path d="M30 44.2l1.6 2.2l1.6 -2.2M37 44.2l1.6 2.2l1.6 -2.2" {...line("#a77a55", 0.6)} />
        <Hand x={23.6} y={43.6} skin="golden" pose="fist" rot={30} flip />
        <Arm s={[72, 48]} e={[62, 59]} w={[47, 45]} skin="golden" sleeve={CLOTH.white} hand="fist" handRot={-40} />
        <Head {...kimchiMaster} />
      </Stage>
    </g>
  ),
  // Young sushi cook in whites, presenting nigiri on a wooden board with both hands.
  "ketchup:sushi_cook": () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={50} y={41} skin="golden" outfit="chef" main={CLOTH.white} accent="#2f3e5e" />
        {/* Board and nigiri */}
        <path d="M27.6 43.2H72.4L74.6 47.6H25.4Z" fill={WOOD.base} {...ol} />
        <path d="M25.4 47.6H74.6V50H25.4Z" fill={WOOD.shade} {...ol} />
        <path d="M31.6 44.6C30.6 41.4 32 39.4 35.6 39.4C39.4 39.4 40.8 41.4 39.8 44.6ZM45.8 44.6C44.8 41.4 46.2 39.4 49.8 39.4C53.6 39.4 55 41.4 54 44.6ZM60 44.6C59 41.4 60.4 39.4 64 39.4C67.8 39.4 69.2 41.4 68.2 44.6Z" fill={RICE} {...ol} />
        <path d="M31 41C31.6 37.6 39.4 37 41 40.4C38 41.6 33.6 41.8 31 41Z" fill="#ef8a5a" {...ol} />
        <path d="M45.2 41C45.8 37.6 53.6 37 55.2 40.4C52.2 41.6 47.8 41.8 45.2 41Z" fill="#c23a3e" {...ol} />
        <path d="M59.4 41C60 37.6 67.8 37 69.4 40.4C66.4 41.6 62 41.8 59.4 41Z" fill="#f2b28a" {...ol} />
        <path d="M33.6 39.8l1.4 -1.6M36 40.2l1.6 -1.8M38.4 40.2l1.4 -1.6M62 39.8l1.4 -1.6M64.4 40.2l1.6 -1.8M66.8 40.2l1.4 -1.6" {...line("#fdf3ea", 0.5)} />
        <Arm s={[35, 48]} e={[29, 59]} w={[24, 49.6]} skin="golden" sleeve={CLOTH.white} hand="fist" handRot={20} />
        <Arm s={[65, 48]} e={[71, 59]} w={[76, 49.6]} skin="golden" sleeve={CLOTH.white} hand="fist" handRot={-20} handFlip />
        <Head x={50} y={27} skin="golden" hair="crop" hairColor="black" tilt={3} />
      </Stage>
    </g>
  ),
  // Senior sushi chef in a headband, holding up a long board of nigiri on one palm.
  "ketchup:sushi_chef": () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={46} y={41} skin="tan" outfit="chef" main={CLOTH.white} accent="#2f3e5e" />
        {/* Board and nigiri */}
        <path d="M53 39.6H85L83.6 42.6H54.4Z" fill={WOOD.shade} {...ol} />
        <path d="M54 38.6H84V39.8H54Z" fill={WOOD.base} {...ol} />
        <path d="M56.2 38.8C55.6 36.4 56.6 35 59 35C61.6 35 62.6 36.4 62 38.8ZM63.6 38.8C63 36.4 64 35 66.4 35C69 35 70 36.4 69.4 38.8ZM71 38.8C70.4 36.4 71.4 35 73.8 35C76.4 35 77.4 36.4 76.8 38.8ZM78.4 38.8C77.8 36.4 78.8 35 81.2 35C83.8 35 84.8 36.4 84.2 38.8Z" fill={RICE} {...ol} />
        <path d="M55.6 36C56 33.6 61.6 33.2 62.8 35.6C60.6 36.4 57.4 36.6 55.6 36ZM70.4 36C70.8 33.6 76.4 33.2 77.6 35.6C75.4 36.4 72.2 36.6 70.4 36Z" fill="#ef8a5a" {...ol} />
        <path d="M63 36C63.4 33.6 69 33.2 70.2 35.6C68 36.4 64.8 36.6 63 36ZM77.8 36C78.2 33.6 83.8 33.2 85 35.6C82.8 36.4 79.6 36.6 77.8 36Z" fill="#c23a3e" {...ol} />
        <path d="M57.6 35l1 -1.2M59.6 35.2l1 -1.2M72.4 35l1 -1.2M74.4 35.2l1 -1.2" {...line("#fdf3ea", 0.5)} />
        <Arm s={[61, 48]} e={[71, 56]} w={[69, 45.6]} skin="tan" sleeve={CLOTH.white} hand="open" handRot={-84} />
        <Head {...sushiChef} />
        <OnHead h={sushiChef}>
          <path d="M-8.2 -7.4C-3 -9.2 3.4 -9 8.4 -6.6L8.2 -4.6C3.4 -6.8 -3 -7 -8 -5.4Z" fill="#f6f3ec" {...ol} />
          <path d="M-8.1 -6.4C-3 -8 3.4 -7.8 8.3 -5.6" {...line("#2f3e5e", 0.8)} />
          <path d="M-8.4 -6.6l-3.6 -2.4l0.4 2.6ZM-8.4 -6.4l-3 2.6l2.6 0.6Z" fill="#f6f3ec" {...ol} />
        </OnHead>
      </Stage>
    </g>
  ),
  // Noodle cook lifting a tangle of noodles from her bowl with chopsticks.
  "ketchup:noodle_cook": () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={58} y={41} skin="fair" outfit="chef" main={CLOTH.white} accent="#c0392b" />
        <Steam x={30} y={36} />
        {/* Bowl, broth, noodles, chopsticks */}
        <path d="M19 41a12 2.8 0 1 0 24 0a12 2.8 0 1 0 -24 0Z" fill="#c98a3c" {...ol} />
        <path d="M27.2 41.6C26.4 38 27.8 34.6 26.6 31.6M30 42C30.6 38.4 29.2 35 30.4 31.2M32.8 41.6C33.6 38 32.2 34.6 33.8 31.4M35.4 41.2C35 38.4 36.4 35.8 36 32.4" {...line("#f2d48a", 1)} />
        <path d="M25 31.2L44.6 33.6M25.6 32.4L44.4 36.2" {...line("#5a3320", 0.9)} />
        <path d="M19 41C19 47.6 24.4 51.6 31 51.6C37.6 51.6 43 47.6 43 41C43 43.2 37.6 44.4 31 44.4C24.4 44.4 19 43.2 19 41Z" fill="#f6f3ec" {...ol} />
        <path d="M20.6 46C24.6 47.8 37.4 47.8 41.4 46" {...line("#3f6ea8", 1.1)} />
        <path d="M27 48.8h1.2M30.4 49.2h1.2M33.8 48.8h1.2" {...line("#3f6ea8", 0.8)} />
        <Hand x={20.4} y={47} skin="fair" pose="fist" rot={30} flip />
        <Arm s={[73, 48]} e={[62, 59]} w={[47, 40.4]} skin="fair" sleeve={CLOTH.white} hand="pinch" handRot={-62} handFlip />
        <Head {...noodleCook} />
      </Stage>
    </g>
  ),
  // Senior noodle chef tossing noodles high from a flaming wok.
  "ketchup:noodle_chef": () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={58} y={41} skin="olive" outfit="chef" main={CLOTH.white} accent="#d3a238" />
        {/* Flames, wok, tossed noodles */}
        <path d="M22 51.6c-1 -2.4 0.6 -3.6 1.2 -5.2c0.8 1.6 1.6 2.4 2 0.6c1 1.6 1.6 2.8 1 4.6ZM31 51.6c-1 -2.4 0.6 -3.6 1.2 -5.2c0.8 1.6 1.6 2.4 2 0.6c1 1.6 1.6 2.8 1 4.6Z" fill="#f0a23a" {...ol} />
        <path d="M17.4 26C20.6 21.2 27 20.4 31.4 22.8M18.8 29C22 24.6 27.6 23.8 32.6 26.8M21.4 31.4C24.6 28.4 28.6 28 32 30M23.4 23C25.6 20.6 29.4 20.2 31.4 21.6" {...line(INK, 2.1)} />
        <path d="M17.4 26C20.6 21.2 27 20.4 31.4 22.8M18.8 29C22 24.6 27.6 23.8 32.6 26.8M21.4 31.4C24.6 28.4 28.6 28 32 30M23.4 23C25.6 20.6 29.4 20.2 31.4 21.6" {...line("#efc35a", 1.1)} />
        <path d="M21.4 24.4l2 -0.8l0.4 1.6ZM29.6 25.6l1.6 -1.2l0.8 1.4ZM25.4 28.4l1.8 0.2l-0.6 1.6Z" fill="#5c9a3a" />
        <path d="M27 23.2l1.6 0.4l-1 1.4Z" fill="#c8402c" />
        <path d="M14.4 32.6c-0.6 2.4 -0.4 4.6 0.6 6.6M36.4 25.6c1.4 1.4 2 3 2 5" {...line("#f4f6f5", 0.8)} />
        <path d="M12.6 37.6C14 44.6 19.6 47.6 26.6 47.6C33.6 47.6 39.6 43.6 40.6 37.6Z" fill="#4a4b4f" {...ol} />
        <path d="M12.6 37.6C20 39.4 33 39.4 40.6 37.6" {...line("#8a8d90", 0.9)} />
        <path d="M16 41C18.6 44.6 22.8 46 26 46" {...line("#71736e", 1)} />
        <path d="M40.4 38.6L52 44" {...line("#3a2a22", 1.6)} />
        <Arm s={[43, 48]} e={[43, 59]} w={[50, 47.6]} skin="olive" sleeve={CLOTH.white} hand="fist" handRot={-64} />
        <Head x={58} y={27} skin="olive" shape="square" hair="sidePart" hairColor="dark" moustache glasses mouth="grin" facing={-1} tilt={-5} />
      </Stage>
    </g>
  ),
  // Fry cook in a red paper hat, lifting a basket of golden fries from the fryer.
  "ketchup:fry_chef": () => (
    <g>
      <Backdrop kind="kitchen" />
      <Stage>
        <Torso x={44} y={41} skin="brown" outfit="work" main={CLOTH.cream} />
        {/* Fryer basket */}
        <path d="M55 45.4H66" {...line("#2a2321", 1.8)} />
        <path d="M66.6 36.4l1.2 -5.4l1.8 0.4l-0.8 5.2ZM69.6 36.4l2.2 -6.8l1.8 0.6l-1.6 6.4ZM73 36.6l0.8 -7.4l1.8 0.2l-0.4 7.2ZM76.2 36.6l2 -5.8l1.8 0.6l-1.6 5.4ZM78.8 37l2.4 -4.4l1.6 0.8l-2 3.8Z" fill="#f2c14e" {...ol} />
        <path d="M68.2 31.6l-0.6 3M71.8 30.4l-1.2 4M74.4 30l-0.4 4.6" {...line("#f8de8a", 0.6)} />
        <path d="M65 36.6H84.4L82.6 47.8H66.8Z" fill="#9aa0a4" fill-opacity="0.55" {...ol} />
        <path d="M65.6 40.4H84M66.2 44.2H83.2M69.4 36.8L70 47.6M73.4 36.8V47.6M77.4 36.8L77 47.6M81.2 36.8L80.2 47.6" {...line("#5f666b", 0.5)} />
        <path d="M64.6 36.4H84.8" {...line(STEEL.light, 1.2)} />
        <path d="M86.6 36c0.6 1.4 0.6 2.6 0 4M63 39.4c-0.8 1.2 -0.8 2.6 0 4" {...line("#f4f6f5", 0.7)} />
        <Arm s={[58, 48]} e={[64, 58]} w={[58.4, 49.4]} skin="brown" sleeve={CLOTH.cream} sleeveTo={0.5} hand="fist" />
        <Head x={44} y={27} skin="brown" hair="crop" hairColor="black" hat="paper" hatColor={CLOTH.red} tilt={4} />
      </Stage>
    </g>
  ),
};
