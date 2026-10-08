/** Buyers (light green): errand boy, cart operator, truck driver, zeppelin pilot. */
import type { ComponentChildren } from "preact";
import { Arm, Backdrop, CLOTH, HairBack, Head, INK, Limb, Stage, Torso, cloth, line, ol, type HeadProps } from "./parts.js";
import type { PortraitSet } from "./types.js";

/** The light backdrop wash (same values as parts.tsx). */
const W = { wall: "#d7dddb", wall2: "#c6cecb", line: "#b5bfbc", deep: "#a1acaa", hi: "#e6eae8" };

/** Draws `children` in head units (same transform as `Head`), for hats and face extras. */
function OnHead({ h, children }: { h: HeadProps; children: ComponentChildren }) {
  const s = h.scale ?? 1;
  return <g transform={`translate(${h.x} ${h.y}) rotate(${h.tilt ?? 0}) scale(${(h.facing ?? 1) * s} ${s})`}>{children}</g>;
}

/** A soda bottle standing upright; (x, y) is the bottom of the bottle. */
function Bottle({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M-2.3 0C-2.8 -3 -2.8 -7 -2.1 -9C-1.4 -11 -0.9 -12.6 -0.9 -15.6H0.9C0.9 -12.6 1.4 -11 2.1 -9C2.8 -7 2.8 -3 2.3 0Z" fill="#5a3324" {...ol} />
      <path d="M-2.6 -6.4h5.2v2.6h-5.2Z" fill="#f2e4c0" {...ol} />
      <path d="M-1.3 -15.6V-17.2H1.3V-15.6Z" fill="#c9302c" {...ol} />
      <path d="M-1.2 -1.6V-3M-1.3 -8.4C-0.9 -10 -0.4 -11.4 -0.3 -14" {...line("#c99a82", 0.6)} />
    </g>
  );
}

const errandHead: HeadProps = {
  x: 50,
  y: 27.6,
  skin: "fair",
  shape: "round",
  hair: "crop",
  hairColor: "auburn",
  scale: 0.95,
  tilt: 3,
};

const cartHead: HeadProps = {
  x: 38,
  y: 28,
  skin: "deep",
  shape: "square",
  hair: "crop",
  hairColor: "black",
  moustache: true,
  hat: "cap",
  hatColor: CLOTH.white,
  tilt: 4,
};

const pilotHead: HeadProps = {
  x: 56,
  y: 27,
  skin: "olive",
  shape: "oval",
  hair: "bob",
  hairColor: "brown",
  female: true,
  facing: -1,
  tilt: -3,
  mouth: "smile",
};

const tweed = cloth("#7d7466");
const leather = cloth("#7a4a2c");

export const buyers: PortraitSet = {
  // Young lad in a newsboy cap holding up a soda bottle in each hand.
  errand_boy: () => (
    <g>
      <Backdrop kind="street" />
      <Stage>
        <Torso x={50} y={42} skin="fair" outfit="work" main={CLOTH.cream} shirt={CLOTH.cream} width={0.86} />
        {/* Braces */}
        <Limb d="M43.4 45.2L44.2 60M56.6 45.2L55.8 60" w={1.5} color={CLOTH.brown.base} />
        <Bottle x={29} y={42} rot={-8} />
        <Bottle x={71} y={42} rot={8} />
        <Arm s={[39.4, 48]} e={[31, 53]} w={[29, 44]} skin="fair" sleeve={CLOTH.cream} cuff={CLOTH.cream.shade} width={6.2} hand="fist" handRot={-4} handFlip />
        <Arm s={[60.6, 48]} e={[69, 53]} w={[71, 44]} skin="fair" sleeve={CLOTH.cream} cuff={CLOTH.cream.shade} width={6.2} hand="fist" handRot={4} />
        <Head {...errandHead} />
        <OnHead h={errandHead}>
          {/* Newsboy cap: soft eight-panel crown, button, short peak */}
          <path d="M-8.8 -3.6C-11 -8.4 -8 -14.4 0.4 -14.6C7.6 -14.8 11.2 -11 10 -6.6C9.4 -5.4 8.6 -4.8 7.8 -4.4C5 -6.6 2 -7.2 -0.6 -7C-3.4 -6.8 -5.6 -5.8 -6.6 -3.6Z" fill={tweed.base} {...ol} />
          <path d="M-8.8 -3.6C-11 -8.4 -8 -14.4 0.4 -14.6C-5 -13.4 -7.6 -9 -6.6 -3.6Z" fill={tweed.shade} />
          <path d="M0.4 -14.4C-0.4 -11.4 -1.4 -8.6 -2.6 -6.8M0.6 -14.4C3.4 -12 5.6 -9.4 6.8 -5.4" {...line(tweed.shade, 0.5)} />
          <path d="M2.6 -5.8C6.6 -6.8 10.8 -6.2 12.8 -4.6C11.6 -3.4 7.8 -3.2 4.2 -3.8C3 -4 2.2 -4.8 2.6 -5.8Z" fill={tweed.shade} {...ol} />
          <path d="M-0.5 -14.6a0.95 0.95 0 1 0 1.9 0a0.95 0.95 0 1 0 -1.9 0Z" fill={tweed.shade} {...ol} />
        </OnHead>
      </Stage>
    </g>
  ),

  // Street vendor pushing a little drinks handcart loaded with crates of soda.
  cart_operator: () => (
    <g>
      <Backdrop kind="street" />
      <Stage>
        <Torso x={38} y={42} skin="deep" outfit="vest" main={CLOTH.forest} accent={CLOTH.red.base} bow />
        {/* Handcart: crates of bottles, painted box, wheel, push bar */}
        <path d="M58.6 32.6C58.6 29.4 59.6 28.2 60.8 28.2C62 28.2 63 29.4 63 32.6ZM63.8 32.6C63.8 29.4 64.8 28.2 66 28.2C67.2 28.2 68.2 29.4 68.2 32.6ZM74 34C74 30.8 75 29.6 76.2 29.6C77.4 29.6 78.4 30.8 78.4 34ZM79.2 34C79.2 30.8 80.2 29.6 81.4 29.6C82.6 29.6 83.6 30.8 83.6 34Z" fill="#5f8f6a" {...ol} />
        <path d="M60.1 28.2v-2.2h1.4v2.2ZM65.3 28.2v-2.2h1.4v2.2ZM75.5 29.6v-2.2h1.4v2.2ZM80.7 29.6v-2.2h1.4v2.2Z" fill="#c9302c" {...ol} />
        <path d="M57 32h14v8H57ZM72 33.4h13.6V40H72Z" fill="#c98f52" {...ol} />
        <path d="M57 35.2h14M72 36.4h13.6" {...line("#a8703a", 0.7)} />
        <path d="M54.6 40h32v14h-32Z" fill={CLOTH.cream.base} {...ol} />
        <path d="M54.6 43.4h32v3.4h-32Z" fill={CLOTH.red.base} {...ol} />
        <path d="M54 39.2h33.2v1.8H54Z" fill={CLOTH.brown.base} {...ol} />
        <path d="M73.6 52a6.2 6.2 0 1 1 12.4 0a6.2 6.2 0 1 1 -12.4 0Z" fill={CLOTH.charcoal.base} {...ol} />
        <path d="M76.6 52a3.2 3.2 0 1 1 6.4 0a3.2 3.2 0 1 1 -6.4 0Z" fill={CLOTH.grey.light} {...ol} />
        <Limb d="M55 42.2L29 44.4" w={1.7} color={CLOTH.brown.base} />
        <Arm s={[25.4, 48]} e={[27, 54]} w={[34.6, 48.6]} skin="deep" sleeve={CLOTH.white} cuff={false} width={6.4} sleeveTo={1.45} hand="fist" handRot={-4} handFlip />
        <Arm s={[50.6, 48]} e={[56, 54]} w={[50.4, 48.2]} skin="deep" sleeve={CLOTH.white} cuff={false} width={6.4} sleeveTo={1.45} hand="fist" handRot={-6} />
        <Head {...cartHead} />
      </Stage>
    </g>
  ),

  // Delivery driver in a peaked cap with a crate of soda on his shoulder.
  truck_driver: () => (
    <g>
      <Backdrop kind="warehouse" />
      <Stage>
        <Torso x={47} y={41} skin="ruddy" outfit="work" main={CLOTH.tan} shirt={CLOTH.sky} />
        {/* Crate of bottles resting on the shoulder */}
        <g transform="translate(0 9) rotate(-6 68 36)">
          <path d="M58.4 29.6C58.4 25.6 60 24.2 61.4 24.2C62.8 24.2 64.4 25.6 64.4 29.6ZM65.4 29.6C65.4 25.6 67 24.2 68.4 24.2C69.8 24.2 71.4 25.6 71.4 29.6ZM72.4 29.6C72.4 25.6 74 24.2 75.4 24.2C76.8 24.2 78.4 25.6 78.4 29.6Z" fill="#5f8f6a" {...ol} />
          <path d="M60.6 24.2v-3h1.6v3ZM67.6 24.2v-3h1.6v3ZM74.6 24.2v-3h1.6v3Z" fill="#c9302c" {...ol} />
          <path d="M56 29h25v11H56Z" fill="#c98f52" {...ol} />
          <path d="M56 29h25v2.6H56Z" fill="#a8703a" />
          <path d="M61 33.6h15v3.4H61Z" fill="#f2e4c0" {...ol} />
        </g>
        <Arm s={[63, 48]} e={[73, 56]} w={[75, 49]} skin="ruddy" sleeve={CLOTH.tan} cuff={CLOTH.tan.shade} hand="fist" handRot={-10} />
        <Head x={46} y={27} skin="ruddy" shape="square" hair="crop" hairColor="brown" hat="cap" hatColor={CLOTH.red} facing={-1} tilt={-4} />
      </Stage>
    </g>
  ),

  // Aviatrix in a leather flying helmet, goggles pushed up, pointing out her zeppelin.
  zeppelin_pilot: () => (
    <g>
      {/* Grey sky with a zeppelin over a low horizon */}
      <rect width="100" height="70" fill={W.wall} />
      <path d="M58 16c2-4 8-4 10-1c3-2 8 0 7 3H57c-1-1 0-2 1-2ZM70 30c2-3 6-3 8-1c2-1 6 0 5 2H69Z" fill={W.hi} />
      <path d="M0 52C20 49 40 51 60 49C78 47 90 50 100 49V70H0Z" fill={W.wall2} />
      <path d="M8.6 18.6C10 13.6 18 11.6 26 11.8C34 12 40 14.6 41 18.4C40 22.4 34 25 26 25.2C18 25.4 10 23.6 8.6 18.6Z" fill={W.line} stroke={W.deep} stroke-width="0.7" />
      <path d="M9.4 18.6C16 19.6 34 19.8 40.8 18.6M14 13.8C13 17 13 21 14 24M22 12.2C21 16 21 21 22 25M30 12.2C31 16 31 21 30 25" {...line(W.deep, 0.5)} />
      <path d="M10.4 15.8L5.4 12.4L6.8 18.6L5.4 24.6L10.4 21.4Z" fill={W.deep} />
      <path d="M21 25.2h8l-1 2.4h-6Z" fill={W.deep} />
      <Stage>
        <HairBack {...pilotHead} />
        <Torso x={55} y={41} skin="olive" outfit="work" main={leather} shirt={CLOTH.cream} width={0.9} />
        {/* Silk scarf, the tail streaming in the wind */}
        <path d="M60 41.6C66 39.6 72 41.4 79 37.2L80.4 41.6C74 45.6 67.4 44.8 61.4 45.8Z" fill={CLOTH.white.base} {...ol} />
        <path d="M48.6 39.2C51.4 42.4 58.6 42.4 61.6 39.2L62.4 42.8C59 46 51 46 47.8 42.8Z" fill={CLOTH.white.base} {...ol} />
        <path d="M66 42.6C70 42 74 41.4 78.6 39.2" {...line(CLOTH.white.shade, 0.6)} />
        <Arm s={[43.4, 48]} e={[35, 44]} w={[28.6, 36.4]} skin="olive" sleeve={leather} cuff={leather.shade} width={6.4} hand="open" handRot={-58} />
        <Head {...pilotHead} />
        <OnHead h={pilotHead}>
          {/* Leather flying helmet with ear flaps and chin strap */}
          <path d="M-8.6 3.4C-10 -3 -9.6 -9.4 -5.6 -12.4C-1.6 -15 4.8 -14.8 8 -11.2C9.6 -9.2 9.4 -6.6 8.6 -4.4C6.2 -6.4 3.2 -7.4 0.2 -7.2C-2.6 -7 -4.8 -6 -5.6 -3.8C-5.8 -1.4 -5.6 1.2 -5.4 3.6Z" fill={leather.base} {...ol} />
          <path d="M-8.6 3.4C-10 -3 -9.6 -9.4 -5.6 -12.4C-7.6 -8.4 -7.8 -2.4 -6.8 3.4Z" fill={leather.shade} />
          <path d="M-4.8 -3.6C-4 1 -4.2 4.4 -5.6 6.6C-7.4 7.2 -9.4 6 -9.8 3.6C-10.2 0 -10 -3.4 -8.8 -5.6Z" fill={leather.base} {...ol} />
          <path d="M-5.4 6.2C-3.8 8.6 -1 10.2 1.6 10.4" {...line(INK, 0.6)} />
          {/* Goggles pushed up on the brow */}
          <path d="M-7.6 -9.6C-4 -10.8 4 -10.8 8.6 -9.2" {...line(leather.shade, 1.4)} />
          <path d="M-5.2 -9.4a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0ZM1.6 -9.4a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0Z" fill="#b9cbd3" stroke="#b08a4a" stroke-width="0.9" />
          <path d="M-0.2 -9.5h1.8" {...line("#b08a4a", 0.9)} />
        </OnHead>
      </Stage>
    </g>
  ),
};
