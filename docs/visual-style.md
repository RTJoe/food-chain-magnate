# Visual style

Goal: a warm, readable tabletop. Chunky low-poly miniatures on a clean board, like painted wooden and plastic game pieces. All designs are original. Do not copy or trace art, logos or chain branding from the published game or any other product.

Colour tokens live in `packages/client/src/theme.ts` and are shared by CSS (`--c-*`, `--player-N`, `--food-*`) and Three.js (`hex(COLORS.road)`). Change colours there, not in components.

## Palette

UI

| Token | Hex | Use |
|---|---|---|
| paper | `#f4ead5` | page background |
| surface | `#fffaf0` | panels, cards |
| surfaceSunk | `#ebdfc6` | wells, inactive chips |
| ink | `#2b2a33` | text |
| inkMuted | `#6b6774` | secondary text |
| line | `#d4c6a8` | borders |
| accent | `#d94f3d` | primary buttons |
| focus | `#3f8fd2` | focus rings, selection |
| ok / warn / danger | `#3f9a5c` / `#e8a530` / `#c0392b` | status |

Board

| Token | Hex | Use |
|---|---|---|
| grass | `#a6d27c` | empty squares |
| lot | `#e9dfc4` | building plots, board rim |
| road | `#5b5a63` | asphalt |
| roadLine | `#f4ead5` | centre dashes (tile-edge crossings at midpoints) |
| houseWall / houseRoof | `#f2e6cf` / `#c8693f` | houses |
| apartment | `#b8b2c8` | Ketchup apartments |
| garden / park | `#5f9e4a` / `#6fb35a` | hedges, trees, lawns |
| tileEdge | `#cbbd9c` | thin seam between map tiles |
| highlightOk / highlightBad | `#5ad17a` / `#e25b4b` | legal / illegal ghost placement |

Players (seat order; six for Ketchup)

| # | Name | Base | Dark | Light |
|---|---|---|---|---|
| 0 | Ketchup | `#d94f3d` | `#9e3326` | `#f7d6cf` |
| 1 | Mustard | `#e8b730` | `#a87f12` | `#f8ebc2` |
| 2 | Blueberry | `#3f8fd2` | `#255f92` | `#d3e5f5` |
| 3 | Pickle | `#4caf6a` | `#2f7a46` | `#d5eedb` |
| 4 | Grape | `#9b5fc0` | `#673d84` | `#e8d9f1` |
| 5 | Tangerine | `#f08a3c` | `#b05a1a` | `#fbe0cb` |

Player colour appears on restaurant roofs and awnings, campaign frames, coffee shops, busy-marketeer chips and UI badges. Pair colour with a player initial or chain emblem so colour is never the only cue.

Goods: burger `#8d5a2b`, pizza `#ef6f3c`, beer `#e0b23a`, lemonade `#f5ec7a`, soft drink `#6b2f2a`, coffee `#4a3226`, kimchi `#c8412f`, sushi `#e98b8b`, noodles `#f2d79b`. Each good also has its own token shape (below).

## Scale and units

- 1 board square = 1 world unit. A map tile = 5 x 5 units. Board origin (square 0,0) is the top-left (north-west) corner; +x is east, +z is south, +y is up.
- Ground plane at y = 0. Roads are inset 0.02 above ground.
- Heights: road 0.02; garden hedge 0.25; demand token 0.18; house 0.9 (roof peak 1.3); restaurant 1.1 (sign up to 1.6); apartment 2.4; billboard 1.2; radio mast 1.8; airplane flies at 2.5 beside the board edge; coffee shop 0.8.
- Minis fill about 85% of their footprint, leaving a 0.075 margin so neighbours read as separate pieces.
- Camera: default 50° tilt, yaw 0 (north up). The "top" toggle switches to a straight-down view.

## Mini style guide

- Low poly, flat shaded, no textures. 50–400 triangles per mini. Bevel big edges with one chamfer segment for a "chunky" look.
- Built procedurally in `three/minis/*.ts` from boxes, cylinders and cones. No imported models in C5.
- Materials: `MeshStandardMaterial`, roughness 0.8, metalness 0. Soft shadows from one directional light plus a warm hemisphere fill.
- Silhouette first: every piece must be identifiable from the default camera at phone size by shape alone.

Pieces

| Piece | Shape idea |
|---|---|
| House (2x2) | Box with a pitched roof and a chimney; door faces the nearest road. House number on a small roof plaque (CSS2D label). |
| Garden (2x1) | Low hedge border, two round tree tops, lawn inset. |
| Apartment (3x3) | Stepped block with window bands. |
| Restaurant (2x2) | Diner box with a rounded front, awning in player colour, tall sign on the entrance corner. Coming soon: scaffold frame plus a translucent sign. Derelict: grey, no sign. Drive-in: arrow markers on all four corners. |
| Drink source | Crate or tank on a pallet: barrel (beer), striped stand (lemonade), vending box (soft drink). |
| Billboard | Two posts with a framed board in player colour; the board shows the good's icon. |
| Mailbox | Rounded postbox with a flag. |
| Airplane | Small prop plane trailing a banner, hovering beside the board edge over the covered rows. |
| Radio | Mast with three ring pulses (animated when it runs). |
| Giant billboard / gourmet guide | Extra-wide billboard / open book on a stand. |
| Coffee shop (1x1) | Kiosk with a cup on the roof, awning in player colour. |
| Park | Lawn with 3–4 round trees and a bench. |
| Lobbyist road | Road piece; under construction shows cones and striped barriers. Roadworks marker = single cone. |
| Freeway | Raised ramp coming in from the board edge. |
| Demand tokens | Stacked discs above the house, one colour and shape per good: burger (bun-shaped disc), pizza (wedge), beer (mug), lemonade (glass with straw), soft drink (can), coffee (cup), kimchi (jar), sushi (roll), noodles (bowl). Up to 5 per house, then a "x N" label. |
| Campaign duration | Small pips on the campaign tile, one per remaining token; eternal campaigns show an infinity badge. |

## Motion

- Ease-out cubic, 250–400 ms per event; queue events and never block input longer than 1.5 s total.
- Sales: goods hop from the restaurant to the house, then a cash puff over the restaurant.
- Marketing: the campaign pulses, then demand tokens drop onto reached houses.
- Respect `prefers-reduced-motion`: skip tweens, keep final states.

## UI overlay

- Rounded, friendly sans (system `ui-rounded` fallback chain). Large numerals for cash.
- Panels on `surface` with 12 px radius and a 1 px `line` border. 44 px minimum touch targets.
- Mobile: bottom sheets over the board; the board stays interactive above the sheet.
