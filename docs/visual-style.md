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
| tileEdge | `#cbbd9c` | groove floor and raised lip between map tiles (the seam line is a darker shade, below) |
| highlightOk / highlightBad | `#5ad17a` / `#e25b4b` | legal / illegal ghost placement |
| highlightLegal | `#ffc531` | tint on every legal spot during a board pick (mustard: reads on grass and asphalt) |
| shadow | `#1f1d26` | dimming of tiles outside the road range |

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

## Tile seams

Map tiles are separate 5 x 5 slabs so the tile boundary (which the rules count, e.g. "2 borders") is visible in both the tilted and the top view. Three layers, from `three/board/ground.ts` and `three/board/seams.ts`:

| Layer | Value |
|---|---|
| Groove | 0.12 units between slabs (`TILE_GAP`); the gap floor is `tileEdge` darkened 42%. |
| Lip | Light raised strip around each tile's top edge: 0.07 wide, 0.014 high, `tileEdge`. |
| Seam line | Shader line on every tile edge at y 0.016, colour `tileEdge` darkened 58% (at least 3:1 against grass), alpha 0.92. Half-width 0.03 tilted, 0.05 in top view (blended by tilt). Never thinner than 1.25 px, so it survives zoom-out and phones. Roads and minis cover it. |
| High contrast | Seam width doubles and every other tile (checkerboard by row + col) is tinted 6% in ink. Follows the high-contrast setting. |
| Rim | Frame around the board with a tick per square and a peg (`tileEdge` darkened 30%) at each tile boundary; column letters A, B, ... and row numbers on the rim, turned with the camera yaw. |

## Roof plaques (house demand)

Each house with demand carries a plaque above its number badge (`three/labels.ts` `plaqueTexture`, `three/minis/tokens.ts`). It is a sprite, so it always faces the camera.

- Body `surface` with a 5 px `ink` border and a soft shadow; one cell per good (food glyph, count beside it when more than 1), ordered by food order.
- Capacity rail underneath: one dot per slot, filled `ink` for a demand token, hollow (`surfaceSunk` fill, `line` outline) for free capacity. Unlimited houses (apartments, rural) show a bar and an infinity sign.
- Full house: border turns `warn` (9 px) and filled dots turn `#b9781a`.
- No seller: a grey dot (`#8f8b88`, `surface` rim) in the top-right corner, set from the last dinnertime (`houseStayedHome`).
- World height 0.74 at close zoom, never smaller than 58 css px per world unit (badge: 40), so it stays readable on phones. The token stack stays as scaled-down (0.7) "stock" behind the plaque.

## Board overlays

Drawn flat just above the ground by `three/overlays/`, one layer per kind (range, reach, routes) so they can be shown together and cleared separately. Colours are the acting player's colour unless noted.

| Overlay | Style |
|---|---|
| Legal spots | `highlightLegal`, opacity 0.32 pulsing by +-0.08. Illegal square under the pointer: `highlightBad` at 0.45 and a reason in the pointer hint. A staged spot gets a `focus` ring; the hovered piece in idle gets a `surface` ring. |
| Road range | Road squares within range tinted by distance in tile borders: 0 = alpha 0.62, 1 = 0.42, 2 or more = 0.24. Start markers (disc with `surface` ring and centre pip, radius 0.26) on the roads a range begins on. Tiles with no road in range dimmed with `shadow` at 0.15. |
| Reach (campaigns) | Ring 0.14 thick around each reached house, radius 0.62 of its footprint, alpha 0.9, pulsing scale +8% and alpha 0.55-0.95; a "+1" chip with the good. Houses already at capacity: grey ring and a "full" chip. Airplane / band reach: whole band tinted at 0.14. |
| Route candidates | Faint: 0.24 wide, 0.5 alpha, on an ink hairline (0.30 wide, 0.28 alpha). Active: 0.56 wide, solid colour at 0.99 on a `surface` edge (+0.12, 0.98) and an `ink` outline (+0.22, 0.92), raised to y 0.11, with animated chevrons (ink or `surface`, whichever contrasts), a start marker, a tick with a running count on each tile border crossed, and a drink chip on each source collected. |
| Selection | Inspected piece: `focus` ring. Related pieces (sellers, reaching campaigns, reached houses): `focus` at 0.45. Rail-panel hover (`inspectIds`): `ink` at 0.6. Candidate footprints of a staged campaign / pick: fill 0.6 with an `ink` (0.9) and `surface` outline. |

Rules: every overlay is drawn with `toneMapped: false`, `depthWrite: false` and a render order above the board, so colours match the tokens above. Overlays never replace a cue with colour alone: ranges also carry numbers on tile borders, reach chips carry text, ribbons carry chevrons.

## Motion

- Ease-out cubic, 250–400 ms per event; queue events and never block input longer than 1.5 s total.
- Sales: goods hop from the restaurant to the house, then a cash puff over the restaurant.
- Marketing: the campaign pulses, then demand tokens drop onto reached houses.
- Respect `prefers-reduced-motion`: skip tweens, keep final states.

## UI overlay

- Rounded, friendly sans (system `ui-rounded` fallback chain). Large numerals for cash.
- Panels on `surface` with 12 px radius and a 1 px `line` border. 44 px minimum touch targets.
- Mobile: bottom sheets over the board; the board stays interactive above the sheet.
