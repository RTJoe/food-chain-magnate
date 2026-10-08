# Visual style

Goal: a warm, readable tabletop. Chunky low-poly miniatures on a clean board, like painted wooden and plastic game pieces. All designs are original. Do not copy or trace art, logos or chain branding from the published game or any other product.

Colour tokens live in `packages/client/src/theme.ts` and are shared by CSS (`--c-*`, `--player-N`, `--food-*`) and Three.js (`hex(COLORS.road)`). Change colours there, not in components.

## Palette

UI (docs/art-bible.md §2: the rulebook's flat print colours)

| Token | Hex | Use |
|---|---|---|
| paper | `#f7f5ed` | page background, with a fractal-noise grain and a corner vignette (CSS `--paper-grain`, `--paper-vignette`) |
| surface | `#fdfcfa` | cards, panels (never `#fff`) |
| surfaceSunk / surfaceWell | `#e9e7dd` / `#d9d7cc` | wells, inactive chips / recessed tray slots |
| panelTeal | `#e9f1ed` | "TV panel" fill (dock, dialogs, Home cards) with a 2 px `teal` outline |
| panelGreen | `#edf5e4` | tutorial and rules asides |
| ink | `#262626` | text (13.9:1 on paper) |
| inkMuted | `#5c5c5c` | secondary text (5.4:1 on surfaceSunk) |
| line / lineMid / lineStrong | `#cfcac0` / `#b5b0a5` / `#8f8a80` | hairlines / visible borders (2.6:1) / borders that must meet 3:1 (inputs) |
| labelBar | `#8a8a86` | "FOR EXAMPLE:" bars, white italic caps (large text only) |
| accent (coralInk) / accentHover / accentShadow | `#c9303c` / `#b8262f` / `#8e2a45` | primary buttons, active tab, active phase ribbon, selected chips (white text 5.3:1); accent text (5.2:1 on surface) |
| coral | `#e53d49` | logo, script titles (`h1`), ribbons, numbered circles: large text and non-text only (4.0:1) |
| coralSoft | `#f37368` | backgrounds only |
| teal | `#508488` | panel outlines, header bands, icons: large text and non-text only |
| tealInk / tealDark | `#356a80` / `#2b6a6e` | teal text, links, secondary buttons, eyebrows (4.8:1 on surfaceSunk) |
| cyan / cream / posterYellow | `#2deedd` / `#fcea98` / `#f0f04b` | billboard faces / tray felt, player setup / decorative |
| chromeLight / chrome / chromeMid / chromeShade | `#e6e7ea` / `#d8d9dc` / `#c2c4c9` / `#9a9ca2` | chrome trays: dock tab strip, rail-card rims, round icon buttons |
| focus | `#356a80` | focus rings and selection outlines (3:1 or more on every surface) |
| link | `#356a80` | link text and text buttons |
| ok / warn / danger | `#2f7a3f` / `#e8a530` / `#aa3839` | status (ok: white text 5.3:1; danger: white 6.3:1) |

Type (self-hosted woff2 in `packages/client/public/fonts`, `src/styles/fonts.css`; no CDN): Barlow
(body), Barlow Condensed 600/700 (headings, buttons, tabs, numbers, cash; caps, tracked), Yellowtail
(screen titles, chain wordmarks), Lilita One (logo lockup), Rye (banknotes). Radii: 10 px panels,
6 px buttons and chips, 4 px tiles; no pill buttons.

Contrast rule: text meets WCAG AA (4.5:1) on the background it sits on; focus rings and other
non-text cues meet 3:1. `packages/client/test/a11y.test.ts` checks the token pairs (`contrast()` in
theme.ts), so a token change that breaks AA fails the tests. Do not dim text with `opacity` to show
a state (done steps): use inkMuted plus a non-colour cue (a check mark, a strike-through) instead.

Board. The map tile print (art bible §2, §5) lives in `packages/client/src/boardPalette.ts`
(`BOARD`), shared by the 3D board and the 2D board; it reads a token from `theme.ts` when one of the
same name exists.

| BOARD | Hex | Use |
|---|---|---|
| ground / speck / grid | `#f5f2e8` / `#dcd8cc` / `#e3dfd3` | off-white tile print, speckles, faint square grid |
| bevel / core | `#cfcac0` / `#a8a398` | chamfered tile edge, cardboard sides |
| seam | `#8f8a80` | tile seam hairline on the print (3.1:1) |
| seamOnRoad | `#2f2d30` | the seam across roads and in the 2D board (3.1:1 on road) |
| road / roadEdge / roadDash | `#7c787b` / `#d9c35c` / `#f4f4f2` | asphalt, yellow kerb lines, white dashes and zebras |
| bridge / bridgeDark | `#8fd3a8` / `#5fae80` | lattice bridges |
| houseTile, apartmentTile / gardenTile / parkTile | `#b2658e` / `#5fb843` / `#537938` | printed plates under the minis |
| beer / lemonade / soda | `#3e8e4d` / `#e8cf3a` / `#d8262a` | printed drink suppliers |
| table / rim | `#6b4a2f` / `#ebe2c8` | wood table, cream coordinate band (chrome edge) |
| legal / bad / edge | `#2b8a7e` / `#aa3839` / `#ffffff` | legal-area tint, blocked square, white edge of range and blocked marks |

Board aliases still read by some 3D builders, mapped to the art-bible values (no pre-bible colours remain):

| Token | Hex | Use |
|---|---|---|
| grass | `#f5f2e8` | tile print ground (Ketchup ghost slabs, build animation slabs) |
| lot | `#e3dfd3` | plates under restaurants and marketing pieces |
| road / roadLine | `#7c787b` / `#f4f4f2` | asphalt, centre dashes (Ketchup ramps) |
| houseWall / houseRoof | `#7a2f48` / `#5e2236` | house plastic |
| apartment | `#b2658e` | apartment plates |
| garden / park | `#a9bd62` / `#537938` | garden plastic, park print |
| highlightOk / highlightBad | `#5ad17a` / `#e25b4b` | legal / illegal ghost placement |
| highlightLegal | `#ffc531` | tint on every legal spot during a board pick |
| shadow | `#1f1d26` | dimming of tiles outside the road range |

Printed pieces (WP2; `theme.ts`, `ui/cards.tsx`, `ui/Milestones.tsx`, `ui/money.tsx`). Every band
carries its title at 4.5:1 or better (`a11y.test.ts`):

| Card colour | Band | Title |
|---|---|---|
| ceo / black (managers) / grey (recruit, train) | `#494944` / `#353633` / `#5d5f5b` | white |
| purple / red / salmon (pricing, darkened) | `#8350a8` / `#aa3839` / `#b8503d` | white |
| blue (marketing) / oliveGreen (kitchen) / lightGreen (drinks) / teal (coffee) | `#3d6fb0` / `#2f7a3f` / `#557a1f` / `#2f6f73` | white |

Milestone bands: grey `#5d5f5b`, purple `#8350a8`, blue `#4a6fba`, red `#aa3839` (white titles);
green `#70c83f`, light green `#a9d46f`, salmon `#e07a66` (ink titles). Tick token `#5cb85c`, X token
`#d9534f`. Banknotes: $1 `#8fc9a0`, $5 `#b9c6e8`, $10 `#f2dc7e`, $20 `#9fd3cf`, $50 `#f3b4a4`,
$100 `#b8c4b0`, engraving ink `#3c3a36`.

Players (seat order = chain order; six for Ketchup). Base is the chain's plastic colour (minis, UI
badges), print the flat tile colour, felt the chrome-tray felt (rail cards).

| # | Chain (seat name) | Base | Dark | Light | Felt | Print |
|---|---|---|---|---|---|---|
| 0 | Fried Geese & Donkey | `#a6449c` | `#5a1f55` | `#e8d0e3` | `#bf96bc` | `#612e57` |
| 1 | Golden Duck Diner | `#f8e03c` | `#6b5300` | `#fcf5cc` | `#fce36c` | `#fded75` |
| 2 | Santa Maria Pizza | `#e4845a` | `#8a3a20` | `#f7dfd4` | `#f0aa9a` | `#d47a86` |
| 3 | Xango Blues Bar | `#6c9fe0` | `#24497a` | `#dae6f4` | `#8fb1f2` | `#007ab2` |
| 4 | Gluttony Inc. | `#c8d79c` | `#3f5a12` | `#f0f3e3` | `#e4f0c0` | `#7c9a1c` |
| 5 | Siap Faji | `#9cd9cf` | `#1f5d55` | `#e6f4f0` | `#b4e0c9` | `#86c2be` |

The seat colours are tuned for colour-blind players: simulated protanopia, deuteranopia and
tritanopia (Machado 2009) keep every pair of bases at CIEDE2000 distance 12.9 or more for six
seats and for five (worst pair: Santa Maria and Gluttony under deuteranopia; the art bible's
unadjusted plastics fell to 8.6, Fried Geese and Xango). Print colours keep 15.6 or more, felts 9.1
or more. `a11y.test.ts` checks the bases (`minCvdDistance`). `dark` is a text colour (4.5:1 on
`light`, surface and white); felt only ever carries ink text. Badge labels use white or ink,
whichever reads better on `base` (`inkOn`: white on Fried Geese, ink on the rest). Keep `base` in
sync with the session's `SEAT_COLORS`, the engine's `DEFAULT_PLAYER_COLORS` and the AI bench; the
client maps both earlier palettes (older servers, saved games) to these seats (`seatColor`).

Player colour appears on restaurant roofs and awnings, campaign frames, coffee shops, busy-marketeer chips and UI badges. Colour is never the only cue: each seat has one mark (`playerMark`: the name's initial, two letters when initials clash) shown on its UI badges and on its restaurant and coffee-shop signs and vans.

Goods (key print colour, `FOOD_COLORS`): burger `#c98a4b`, pizza `#d4883a`, beer `#3e8e4d`, lemonade `#ffec46`, soft drink `#d8262a`, coffee `#4a3226`, kimchi `#d84a2a`, sushi `#e98b8b`, noodles `#f2d79b`. Each good also has its own token silhouette and print (`src/goodsGlyphs.ts`: SVG path data shared by the UI icons, the 2D board and, later, the 3D token decals).

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

Map tiles are printed card slabs (5 x 5 units, 0.12 thick) butted together, so the tile boundary (which the rules count, e.g. "2 borders") is visible in both the tilted and the top view. From `three/board/ground.ts`, `seams.ts`, `roads.ts` and `textures.ts`:

| Layer | Value |
|---|---|
| Print | One canvas texture per tile (1024 px, 512 on phones), turned and mirrored per tile: `ground` with speckles, smudges, the faint `grid`, and a 0.07 `bevel` at the edge. Sides in `core`. |
| Gap | 0.02 units between slabs (`TILE_GAP`) over a dark base. |
| Seam line | Shader line on every tile edge at y 0.016, `seam`, alpha 0.92. Half-width 0.03 tilted, 0.05 in top view (blended by tilt). Never thinner than 1.25 px, so it survives zoom-out and phones. Across roads the same shader draws it in `seamOnRoad` just above the asphalt. |
| Roads | Flat printed squares at `ROAD_TOP`: one texture per shape (end, straight, corner, T, cross) with lengthwise streaks and yellow kerb lines (inset 0.05, 0.06 wide, stopped at junctions), white dashes (0.25 on / 0.25 off, 0.04 wide), a six-bar zebra on each side of every tile border a road crosses, a faint manhole on crossings. Roads run off the map edge open. |
| Bridges | Pale green steel through truss (X-braced sides and overhead bracing) on piers, deck at `BRIDGE_TOP` 0.56 with open steel ramps; the lower road runs on in the deck's shade. |
| Plates | Printed house / apartment / garden / park plates and drink-supplier spots under the minis (`decals.ts`, one atlas). |
| High contrast | Seam width doubles, the line turns ink and every other tile (checkerboard by row + col) is tinted 6% in ink. Follows the high-contrast setting. |
| Table and band | Dark wood table (canvas grain). A cream band 0.6-2.0 units out from the map, chrome edges, a tick per square and a peg at each tile boundary; column letters A, B, ... and row numbers in Barlow Condensed, turned with the camera yaw. |
| Light | Warm key `#fff4e0` 2.4 from the upper left (shadows), cool fill `#dfe9f0` 0.5 from the right, hemisphere ambient `#f3eee2` 0.85 plus the room environment at 0.15 (more sheen washes the plastics out); ACES tone mapping at exposure 1.0. Tuned so the print, asphalt and plastics match the SE photos. |

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
| Legal spots | A dot per spot: `ink` ring at 0.92 (3.5:1 on road) round a player-colour centre; map-tile and off-board areas tinted `legal` at 0.4. Illegal square under the pointer: `bad` with a white edge and a white X at 0.88 (3:1 on print and asphalt) and a reason in the pointer hint. A staged spot gets a `focus` ring; the hovered piece in idle gets a `surface` ring. |
| Road range | Road squares within range: a white edge (4.4:1 on the asphalt) round a colour fill whose alpha steps by distance in tile borders: 0 = 0.9, 1 = 0.68, 2 or more = 0.48. Start markers (disc with `surface` ring and centre pip, radius 0.26) on the roads a range begins on. Tiles with no road in range dimmed with `shadow` at 0.15. |
| Reach (campaigns) | Ring 0.14 thick on an `ink` outline around each reached house, radius 0.62 of its footprint, alpha 0.9, pulsing scale +8% and alpha 0.55-0.95; a "+1" chip with the good. Houses already at capacity: grey ring and a "full" chip. Airplane / band reach: whole band tinted at 0.14. |
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
