# Food Chain Magnate art bible

Goal: the digital game must read as *Food Chain Magnate*, specifically the Lucky Duck Games
Deluxe / Special Edition look (2024): 1950s American commercial illustration, cream paper, coral
and teal brand accents, script display type, and single-colour plastic miniatures sculpted by
Bryce Cook (Black Magic Inserts). We redraw and remodel everything ourselves in that style. We do
not ship Splotter / Lucky Duck artwork, logos, photos or scans. The reference images in this
document are research material only and are never bundled into `packages/client`.

Credits as printed in the rulebook (so we know whose style we are emulating): game graphic design
Ynze Moedt and Iris de Haan (original); Deluxe edition graphic design Matt Paquette & Co.; cover
art Kwanchai Moriya; additional art Amelia Półtoracka and Snow Conrad; 3D sculpting Bryce Cook.
Lucky Duck's own pitch for the edition: "Norman Rockwell-inspired marketing style that is the
hallmark of the 1950s".

Reference folders (see the list at the end):

- `docs/art/refs/` — Special Edition photos (`se-*.jpg`) and four rulebook page renders
  (`rb-*.png`). More pages: `pdftoppm -r 110 -f N -l N -png docs/rules/source/<pdf> out`.
- `docs/art/current/` — screenshots of the game as it is today (`cur-*.png`), for side-by-side
  comparison in acceptance checks.
- Rulebook PDFs in `docs/rules/source/` are the primary source for 2D art. Page numbers below are
  the printed page numbers ("Page N" at the foot); PDF page = printed page + 2 for the base book,
  + 1 for the Ketchup book.

---

## 1. What makes FCM look like FCM

### Era and subject

Mid-century America, roughly 1948–1962: diners with chrome trim, waitresses in teal uniforms with
white collars, cooks in paper hats, executives in grey flannel and narrow ties, a blue cab-over
delivery truck, a yellow-and-blue prop plane with a banner, a red-and-white lattice radio tower
(`rb-base-cover`, `rb-base-p07-card-anatomy-employee-types.png`, base rulebook p.20 and p.31).
Everything on screen should look like it belongs to a 1950s advertising campaign for a roadside
restaurant chain.

### Illustration style (people and props)

- Painterly, loose digital gouache: visible brush strokes, soft edges, warm skin tones, slightly
  over-saturated lips and cheeks, period hair (victory rolls, pompadours, pin curls). Figures are
  half-length or three-quarter, cut out against white with a thin halo of paper, or sitting on a
  lightly washed, desaturated diner/office backdrop (employee card portraits, base p.7–8).
- Props and food are rendered the same way but tighter: a burger with a glossy bun, a pizza slice
  with pulled cheese, a green beer bottle, a red soda bottle, a lemonade glass with a straw and
  a lemon wheel (`rb-base-p01-components.png`, items 13–17).
- Line work: no hard black outlines on people. Hard outlines only on the "flat" icon layer
  (phase icons, strategy icons, which are solid teal silhouettes, base p.14 and p.36).
- Shading: one warm key light from upper left, soft bounce, no dramatic rim light. Shadows are
  warm grey, never black.

### Graphic design conventions (the part the UI must copy closely)

- Paper: near-white cream with a faint vignette and paper grain (`rb-base-back-logo.png`).
  Nothing in the rulebook or on the cards is pure flat white; nothing is dark mode.
- Two brand accents and nothing else at the top level: coral red (logo, script headings, phase
  ribbons, "X" tokens) and teal (header bands, panel outlines, icon silhouettes, "check" tokens
  are green). Yellow and the chain colours appear only on components.
- Script display type with a white outline and a soft drop shadow for titles ("Components",
  "Game Overview", card titles, chain names). Condensed, tracked, all-caps grotesque for section
  headings and milestone titles. Light grotesque for body copy. See section 3.
- Panels are rounded rectangles with a 2 px teal outline and a pale teal fill, like a 1950s
  television screen (base p.12 "Employees on the beach", p.14 "First Airplane Campaign
  Milestone"). Example boxes have a flat grey label bar with white italic caps ("FOR EXAMPLE:").
- Phase headings are coral ribbons with notched ends and white italic caps ("PHASE 4.
  DINNERTIME").
- Thin coral horizontal rules separate page sections; a double grey rule runs across the page
  foot with the page number in italic.
- Badges: numbered circles in coral (turn order 1–6), sage-green circles for callouts, starburst
  "SALE!" stickers, a 4-point sparkle for "entry level".
- Trays: milestone boards and the employee tray are drawn as brushed chrome with a bevelled rim
  and the chain name embossed in script (`se-milestone-boards.jpg`, base p.4 and p.35).
- Checks and crosses: a hand-painted green tick and a red X, both with a white halo, are the
  universal legal / illegal marks (base p.5, p.19, p.30).

### Component look

- Map tiles: off-white concrete with faint grid lines and specks; warm grey asphalt roads with
  yellow edge lines and white dashed centre lines; white zebra crossings where roads meet a tile
  edge; a pale green steel lattice for bridges (`se-map-tiles-dual-layer.jpg`, base p.5, p.22).
- Houses are printed as magenta squares with a painted suburban house and a white number; gardens
  are bright green squares with a hedge, gate and path (base p.24).
- Marketing tokens are grey-teal with a cyan sign face (base p.20, p.30).
- Food and drink are chunky wooden tokens with full-colour prints (`se-food-drink-tokens.jpg`).
- Money is engraved-style banknotes, one colour per denomination (`se-display.jpg`).
- The Special Edition miniatures are single-colour plastic: one colour per chain for restaurants
  and turn-order markers, burgundy houses, lime gardens, green drink suppliers, light-blue
  marketing pieces (`se-full-board-3x3.jpg`, `se-restaurants-five-chains.jpg`).

### What is wrong today (`docs/art/current/`)

- Bright grass-green tiles, orange-roofed cream houses, a rounded "friendly app" UI with a
  system rounded sans, pill buttons and a ketchup-red primary. It reads as a generic cosy town
  builder, not as FCM (`cur-table-dinnertime.png`, `cur-home.png`).
- Chain colours are wrong (Fried Geese & Donkey is red, Santa Maria is blue, Xango is teal,
  Gluttony is orchid). Every chain uses the same diner model.
- Marketing pieces are in player colour instead of the neutral marketing colour.
- Drink suppliers are multi-colour kiosks; the SE pieces are green plastic.
- No script type, no coral/teal brand pair, no chrome trays, no paper texture.

---

## 2. Palette

Hex values are sampled from the rulebook renders (flat print colours) and cross-checked against
the SE photos (plastic colours under room light, so those are approximate). "Role" is the token
the UI or scene should use; keep the names in `theme.ts` but change the values.

### UI surfaces and text

| Role | Hex | Source | Notes |
|---|---|---|---|
| `paper` (page background) | `#f7f5ed` | base p.1 components page bg | Add a 2–3 % noise texture and a radial vignette to `#ebe8dc` at the corners. |
| `surface` (cards, panels) | `#fdfcfa` | page white, card body `#fcfbef` | Near-white, never `#fff`. |
| `surfaceSunk` (wells, track slots) | `#e9e7dd` | turn-order track slots | Darker well `#d9d7cc` for recessed tray slots. |
| `panelTeal` (info panels) | `#e9f1ed` | base p.12 pale teal box | With a 2 px `#508488` outline. |
| `panelGreen` (module sidebars) | `#edf5e4` | Ketchup p.5 left column | Optional, for tutorial / rules asides. |
| `ink` | `#262626` | body text | 13.9:1 on paper. |
| `inkMuted` | `#5c5c5c` | captions | 5.4:1 on `surfaceSunk`, passes AA. |
| `line` | `#cfcac0` | tile borders, rules | Non-text, 1.8:1; use `#b5b0a5` (2.6:1) where a border must be seen on paper, `#8f8a80` (3.6:1) for anything that must meet 3:1. |
| `labelBar` | `#8a8a86` | "FOR EXAMPLE:" bars | White italic caps on it: 3.6:1, large text only. |

### Brand accents

| Role | Hex | Source | Contrast notes |
|---|---|---|---|
| `coral` (logo, script headings, ribbons) | `#e53d49` | logo, base back cover | 4.0:1 on paper: large text (24 px, or 19 px bold) only. White on it 4.1:1, also large only. |
| `coralInk` (accent text, primary button fill) | `#c9303c` | darkened coral | 5.2:1 on paper; white on it 5.6:1. Use this for buttons and any accent text under 24 px. |
| `coralSoft` (table rows, warnings) | `#f37368` | base p.10 table | Backgrounds only, ink on it 4.6:1. |
| `teal` (header bands, panel outlines, icons) | `#508488` | base p.12 header band | 4.1:1 on paper: large text and non-text only. |
| `tealInk` (teal text, links) | `#396f85` | base p.10 table header | 5.4:1 on paper; white on it 5.6:1. |
| `tealDark` | `#2b6a6e` | derived | 5.7:1 on paper, for teal text on `surfaceSunk`. |
| `cyan` (billboard sign faces, highlights) | `#2deedd` | base p.20 billboard | Ink on it 10.4:1. Never as text. |
| `cream` (chrome tray felt, player setup) | `#fcea98` | milestone tray | Ink on it 12.5:1. |
| `posterYellow` | `#f0f04b` | base p.2 | Decorative only (speech-bubble pages). |
| `ok` (green tick) | `#3e8e4d` | card band green / tick token | White on it 4.05:1 (AA for normal text, barely); as text on paper 4.6:1. |
| `danger` (red X) | `#aa3839` | planning card band / X token | White on it 6.3:1. |
| `focus` | `#396f85` | teal ink | 3:1 or better on every surface above. |

### Employee card families (title bands)

| Family | Hex | Cards | White text on band |
|---|---|---|---|
| Kitchen and drinks (green) | `#3e8e4d` (dark) / `#3ea655` (light) | Kitchen Trainee, cooks, chefs, Errand Boy, Cart Operator, Truck Driver, Zeppelin Pilot, baristas, sushi / noodle cooks | 4.05:1 on dark; use `#2f7a3f` (5.3:1) under the white script if it dips below 19 px. |
| Marketing (blue) | `#497dc0` | Marketing Trainee, Campaign Manager, Brand Manager, Brand Director, Mass / Rural Marketeer, Gourmet Food Critic | 4.2:1; use `#2f5f8f` (6.7:1) for small text. |
| Planning (red) | `#aa3839` | Local Manager, Regional Manager, Lobbyist | 6.3:1. |
| Waitress, New Business Developer, CFO, Movie Stars (purple) | `#8350a8` | | 5.7:1. |
| Management, recruiters, trainers (grey) | `#5d5f5b` | Management Trainee, VPs, Recruiting Girl, Trainer, Coach, Guru, HR Director | 6.5:1. |
| Pricing (salmon) | `#e07a66` | Pricing Manager, Discount Manager, Luxuries Manager | White fails (2.9:1); use ink `#262626` (5.2:1) or darken to `#b8503d` (4.9:1 white). |
| CEO (charcoal) | `#494944` | CEO, Executive VP | 8:1. |

### Milestone tile bands (base p.34–35)

Grey `#5d5f5b` (hiring / training / salaries), purple `#8350a8` (cash), green `#70c83f`
(production, drinks, freezer; ink text 9:1), blue `#587fc9` (marketing; white 4.1:1, large text),
salmon `#e07a66` (pricing; ink text). Claimed: green tick tile `#5cb85c`; gone: red X tile
`#d9534f`, both with a white hand-painted mark.

### Chains (restaurants, turn-order markers, coffee shops, milestone-tray felt)

Print colour is the restaurant tile in the rulebook; plastic colour is the SE mini. Use the
plastic colour for 3D pieces and UI badges, the print colour for flat 2D tiles.

| Chain | Print (tile) | Plastic (mini) | Badge text | Felt |
|---|---|---|---|---|
| Fried Geese & Donkey | plum `#612e57` | orchid `#b361af` | white 4.0:1 (large) or ink on a lightened `#d08fcc`; dark text `#5a1f55` | `#c9a3c4` |
| Golden Duck Diner | yellow `#fded75` | lemon `#e9d44a` | ink 9.5:1 | `#fcea98` |
| Santa Maria Pizza | pink `#dd7673` | salmon `#e58a66` | ink 5.4:1 | `#f3b4a4` |
| Xango Blues Bar | blue `#007cb0` | cornflower `#6f9fd8` | white on print 4.7:1; ink on plastic 6.9:1 | `#9cc0ea` |
| Gluttony Inc. | olive green `#7e9b48` | lime `#c6d48a` | ink 9.9:1 on plastic; white fails on print (3.2:1) | `#cde0a0` |
| Siap Faji (Ketchup) | teal `#88b6ac` | aqua `#99d1c6` | ink 6.7:1 | `#b9ddd5` |

Colour-blind note: the six plastics separate well under deuteranopia except orchid vs
cornflower; the game already shows a chain mark on every badge and each chain has a unique
building silhouette (section 6), so colour is never the only cue. Keep that rule.

### Map, houses, goods

| Role | Hex | Source |
|---|---|---|
| `tileGround` | `#f5f2e8` with specks `#dcd8cc` | base p.10, SE tiles |
| `tileGrid` (faint square lines) | `#e3dfd3` | SE tiles |
| `tileEdge` | `#cfcac0` top bevel, `#a8a398` seam | tile stacks |
| `road` | `#7c787b` with streaks `#8a8688` / `#6e6a6d` | base p.5, p.10 |
| `roadLine` (yellow edge) | `#d9c35c` | base p.5 |
| `roadDash` (white centre) | `#f4f4f2` | |
| `bridgeSteel` | `#8fd3a8` | base p.8 "F" |
| `houseTile` (printed square) | `#b2658e` | Ketchup p.4, base p.24 |
| `housePlastic` (SE mini) | `#7a2f48` | `se-houses-closeup-numbers.jpg` |
| `gardenTile` | `#5fb843` | base p.24 |
| `gardenPlastic` | `#a9bd62` | `se-house-with-garden.jpg` |
| `parkTile` | `#537938` | Ketchup p.4 |
| `apartmentTile` | `#b2658e` (same magenta) | Ketchup p.4 |
| `drinkPlastic` | `#4c8a3a` | SE beer / lemonade / soda suppliers |
| `marketingTile` | `#87a39f`, sign face `#2deedd` | base p.20 |
| `marketingPlastic` | `#9cc3d6` | `se-airplane-mini.jpg` |
| `ruralPlastic` | `#67ae86` | `se-rural-area-mini.jpg` |
| `chrome` (trays) | `#d8d9dc` highlight / `#9a9ca2` shade | `se-milestone-boards.jpg` |

Goods (token print colours, with the wooden token body colour for 3D):

| Good | Print | Token body |
|---|---|---|
| burger | bun `#c98a4b`, patty `#6b3a1e` | tan `#b07a3c` |
| pizza | crust `#b6570e`, cheese `#f4c84a`, pepperoni `#b8262f` | orange `#d4883a` |
| beer | bottle green `#3e8e4d`, label cream | green `#5c8f5e` |
| lemonade | yellow `#ffec46`, glass highlight white | yellow `#e8cf3a` |
| soda | red `#d8262a`, white script label | red `#d8262a` |
| coffee | cup white `#fdfcfa`, coffee `#4a3226` | white |
| kimchi | dish green `#9cb575`, kimchi `#d84a2a` | pale green |
| sushi | rice white, nori `#262626`, filling `#e98b8b` | white |
| noodles | bowl purple `#5a3d7a`, noodles `#f2d79b` | purple |

Money: $1 green `#8fc9a0`, $5 blue-lilac `#b9c6e8`, $10 yellow `#f2dc7e`, $20 teal `#9fd3cf`,
$50 pink `#f3b4a4`, $100 grey-green `#b8c4b0` (the $20 and $100 are our extrapolation; the
rulebook shows four denominations). Engraving ink `#3c3a36`.

---

## 3. Typography

Fonts embedded in the rulebook PDFs (`pdffonts`): **Burbank Script** (script titles: "Components",
"Rulebook", card titles), **Cinema Script** (logo "Magnate"), **American Purpose Casual 02**
(tracked all-caps section headings: "EMPLOYEE TYPES", "STARTING RESTAURANT PLACEMENT RULES"),
**Trade Gothic Next LT Pro** Light / Bold / Bold Italic / Heavy Italic (body, labels, milestone
titles, phase ribbons), **CC Meanwhile Italic** (comic speech bubbles, p.2 only). The logo
"FOOD CHAIN" is hand-lettered: a heavy, slightly extended sans with rounded corners, a chrome
bevel and a drop shadow.

Free equivalents (all Google Fonts, OFL). Load with `font-display: swap`, self-host the woff2
files under `packages/client/public/fonts/`.

| Role | Original | Use | Family | Weights |
|---|---|---|---|---|
| Logo wordmark | hand lettering | "FOOD CHAIN" lockup, splash | **Lilita One** | 400, uppercase, letter-spacing 0.02em, bevel via layered `text-shadow` |
| Script display | Burbank Script / Cinema Script | "Magnate", screen titles, card titles, chain names, milestone values ("+$5") | **Yellowtail** | 400; fallback **Kaushan Script** 400 |
| Headings | American Purpose Casual / Trade Gothic Bd | section headings, milestone titles, phase ribbons, dock tabs, table headers | **Barlow Condensed** | 600 and 700, uppercase, letter-spacing 0.06em (headings) / 0.03em (ribbons), italic 700 for ribbons and milestone titles |
| Body | Trade Gothic Next Light | rules text, card abilities, panel copy | **Barlow** | 400, 500; italic 400 for asides |
| Numbers | Trade Gothic Bd | cash, counts, badges | **Barlow Condensed** 700 with `font-variant-numeric: tabular-nums` |
| Money engraving | engraved serif on notes | banknote denominations only | **Rye** | 400 |
| Speech bubbles | CC Meanwhile | tutorial callouts (optional) | **Comic Neue** | 700 italic |

Sizes (desktop; phone scales by 0.9): body 15/22, small 13/18, h3 Barlow Condensed 700 18 px caps,
h2 20 px caps, screen titles Yellowtail 34–40 px, cash Barlow Condensed 700 22 px, card title
Yellowtail 20 px on a 56 mm-wide card equivalent (about 17 px at the UI's 180 px card width).

Script-title treatment (matches "Components"): `color: coral; -webkit-text-stroke: 0; text-shadow:
0 0 0 #fff, 1px 0 #fff, -1px 0 #fff, 0 1px #fff, 0 -1px #fff, 2px 3px 0 rgba(0,0,0,.18)`. A
cheaper approach is `paint-order: stroke fill; -webkit-text-stroke: 4px #fff` on SVG text.

---

## 4. UI component styling

Everything below is CSS-level guidance for `packages/client/src/styles/main.css` and the
components in `packages/client/src/ui/`. Keep the existing 44 px touch targets, focus rings and
reduced-motion rules.

### Page and shell

- `html { background: #f7f5ed url(paper-grain.png) }` (a 256 px tiling noise PNG we generate,
  4 % opacity) plus `body::before` radial vignette `rgba(120,110,90,.10)` at the edges.
- Remove the diagonal stripe background on Home. Replace with the paper, a coral script title
  "Food Chain Magnate" (Lilita One "FOOD CHAIN" over Yellowtail "Magnate" with two chrome rules
  either side, as in `rb-base-back-logo.png` but our own lettering), and a teal strapline in
  Barlow Condensed caps.
- Top bar: cream `#fdfcfa` with a 3 px coral bottom rule, phase steps as a ribbon strip (active
  phase = coral ribbon with white italic caps, done phases = teal tick + grey caps).
- Radii: 10 px for panels (not 12), 6 px for chips, 4 px for tiles. No pill buttons.
- Shadows: `0 1px 0 rgba(60,50,30,.08), 0 6px 14px rgba(60,50,30,.12)`.

### Panels (dock, rail cards, dialogs)

- "TV panel": `background: #e9f1ed; border: 2px solid #508488; border-radius: 10px;` with a
  1 px inner highlight `box-shadow: inset 0 0 0 1px #fdfcfa`. Headings inside are Barlow
  Condensed 700 caps in `tealInk`.
- Example / info callouts: cream `#fdfcfa` body with a flat grey label bar (`#8a8a86`, white
  italic caps 13 px, 6 px padding) across the top.
- Dock tabs: a chrome strip (`linear-gradient(#e6e7ea, #c2c4c9)`) with tab labels in Barlow
  Condensed 700 caps; the active tab is a coral ribbon tab with white text.
- Player rail cards: the chain's chrome tray in miniature — a `#d8d9dc`→`#b9bbc0` bevelled
  frame, felt interior in the chain felt colour, chain wordmark in Yellowtail, cash in Barlow
  Condensed 700 on a cream plate.

### Buttons

- Primary: `background: #c9303c; color: #fff; font: 700 15px/1 'Barlow Condensed'; text-transform:
  uppercase; letter-spacing: .06em; border-radius: 6px; padding: 0 18px; box-shadow: 0 2px 0
  #8e2a45`. Hover `#b8262f`. This is the phase-ribbon colour.
- Secondary: cream fill, 2 px `#508488` border, `tealInk` text.
- Ghost / text: `tealInk`, underline on hover.
- Danger: `#aa3839`. Ok: `#3e8e4d`.
- Icon buttons: round chrome (`#e6e7ea` with a 1 px `#9a9ca2` ring), teal icon.
- Chips (toggles): sage circle badge style, `#e9f1ed` fill, `#508488` ring, selected = coral
  fill with white.

### Employee cards (`rb-base-p07-card-anatomy-employee-types.png`, `se-employee-card-tray-kitchen-cards.jpg`)

Real layout, portrait, ratio 2:3 (render at 180×270 px desktop, 132×198 phone; min 96×144 in lists
with the portrait cropped to a head-and-shoulders band):

1. **Title band** (top 22 %): family colour (section 2), 6 px radius top corners. Card name in
   Yellowtail, white, 20 px, centred, with a 1 px white-to-transparent bottom highlight on the
   band. Top-left corner: 4-point sparkle (white) when entry-level. Top-right corner: range chip,
   a white rounded square with the number and a tiny car (road) or plane (air) glyph; infinity
   for unlimited; nothing for cards without a range.
2. **Portrait** (middle 48 %): our own painted half-length figure on a desaturated diner / office
   backdrop (grey-teal wash). Rendered as an `<img>` per card type; until art exists use a
   silhouette in the family colour on the wash.
3. **Ability panel** (bottom 30 %): cream `#fcfbef` with a torn-paper top edge (an SVG mask, 6–8
   irregular teeth). Ability text Barlow 400 13 px, centred, ink. "Do 2 times: …" lines stay
   centred too.
4. **Footer row** inside the panel: left, training options as a small list, each "▸ Name" in the
   target card's family colour, Barlow Condensed 600 10 px. Right, the salary icon (a banded
   banknote bundle, green) when the card is paid; above it the "1x" unique badge (teal circle,
   white italic "1x") when unique. Managers and the CEO show the work-slot org glyph (a bracket
   with numbered boxes) centred above the ability text.
5. **Back**: light blue `#9cc3d6` with a diagonal cream stripe pattern and a white badge carrying
   our logo lockup.
6. **States**: played = slight lift and a coral ribbon tab "WORKING"; on the beach = sand-coloured
   plate under the card; busy = teal ribbon "BUSY · #13" with the campaign number; selected =
   3 px `focus` ring outside the card; disabled = 60 % opacity plus a grey X stamp (never opacity
   alone).

### Milestone tiles (`rb-base-p35-milestone-list-tray.png`, `se-milestone-tray-xango-tiles-closeup.jpg`)

- Tile 3:2, 6 px radius. Band (top 38 %) in the milestone family colour with the title in Barlow
  Condensed 700 italic caps, white (ink on salmon and light green). Body cream with the key
  value in Yellowtail 22 px (`+$5`, `-$1`, `+2`) followed by Barlow 12 px, and a small
  illustration cut-out bottom right (our own: banknotes, burger, pizza, plane, radio tower).
- The milestone panel is a chrome tray: outer `linear-gradient(135deg,#eceef1,#b9bbc0)` 8 px
  rim with a 1 px dark seam, interior felt in the viewing player's chain felt colour, tiles laid
  in a 6-column grid (3 on phone) in rulebook order.
- Claimed by me: a green tick token (`#5cb85c`, white painted tick, slight rotation −6°) on the
  band. Claimed by another: that chain's mark on a cream token. No longer available: red X token
  (`#d9534f`).

### Money and cash displays

- Cash figures: Barlow Condensed 700, ink, with a small banknote icon. Changes animate as a
  banknote sliding under the figure (keep the existing `cash-float`, restyle it green/red with
  the new tokens).
- The bank: a stack of notes drawn as three offset rounded rectangles in $50 pink, $10 yellow,
  $5 blue with engraved borders; the reserve-card count as sage circle badges.
- Banknote graphic (for the bank panel, payday and the tutorial): landscape 2:1, engraved frame
  (double rule, scalloped corners), denomination numerals in Rye in all four corners, a central
  food vignette, "Food Chain Magnate" in small caps on the top edge, "Ten Dollars" in Rye along
  the bottom. Colour per denomination from section 2.

### Turn-order track (`rb-base-p14-turn-order-track.png`, `se-turn-order-track.jpg`)

- A cream strip with a chrome top edge, "FOOD CHAIN MAGNATE" in Lilita One in embossed grey
  (`#c4c2b8` with a white highlight), six recessed slots (`#e9e7dd` wells with a 1 px `#c4c2b8`
  inset) each topped by a coral numbered circle. A CEO figure cut-out sits at the left end on
  desktop.
- Markers: the chain's turn-order totem (section 6) rendered as a 3D sprite, or in 2D a round
  badge with the chain wordmark on the chain colour. Unavailable positions (fewer players) show
  the red X.

### Phase ribbon and badges

- Ribbon: coral background, white italic Barlow Condensed caps, notched ends via `clip-path:
  polygon(0 0,100% 0,calc(100% - 10px) 50%,100% 100%,0 100%,10px 50%)`.
- Numbered callouts: coral circle (`#e53d49`, white Barlow Condensed 700) for order, sage circle
  (`#9bbfb2` fill, cream ring, ink text) for references.
- Legal / illegal: green tick and red X icons with a 2 px white halo, 20 px, in place of the
  current dot indicators.

### Board HUD (2D overlays on the 3D board)

- House plaques: cream plate with a 2 px `#8f8a80` border, house number in Barlow Condensed 700,
  demand shown as the wooden token glyphs (section 6), capacity pips as before.
- Route and range overlays keep their behaviour; recolour to the chain's plastic colour with a
  white edge, and tile-border tick marks in ink as the rulebook draws them (base p.10).

---

## 5. Board

### Map tile (5×5 squares)

- Ground: `tileGround` `#f5f2e8` with a procedural speckle (1–2 px dots in `#dcd8cc`, 0.3 per
  square) and a few faint grey smudges (large soft ellipses at 3 % ink). A faint 1 px grid
  `#e3dfd3` on every square boundary, as the printed tiles have it
  (`se-map-tiles-dual-layer.jpg`).
- Tile edge: a 0.07-unit bevel in `#cfcac0` and a 0.03-unit seam line in `#a8a398`. Drop the
  current wide groove and raised lip; the real tiles butt together with a hairline gap. Keep the
  seam at least 1.25 px on screen so tile borders (which the rules count) stay visible, and keep
  the rim letters/numbers but restyle them in Barlow Condensed on a cream rim with a chrome edge.
- Roads: one square wide, `road` `#7c787b` with soft lengthwise streaks (±4 % value), a 0.06-unit
  yellow edge line `#d9c35c` on both sides inset 0.05 from the kerb, a white dashed centre line
  (dash 0.25, gap 0.25, width 0.04, `#f4f4f2`). At every point where a road crosses a tile edge,
  a zebra crossing: six white bars across the road, 0.08 wide. Junctions: the yellow lines stop
  at the junction, dashes stop 0.3 short, a faint manhole circle at the centre of 4-way junctions.
- Bridges: a pale green steel lattice (`#8fd3a8`, 0.04-wide bars in an X-braced truss) drawn
  over the crossing roads, flat, with the lower road's dashes hidden under it.
- Road ends at the map edge are open (no kerb).

### Printed locations on tiles (these are part of the tile texture, not minis)

- House square: 2×2 `houseTile` `#b2658e` plate with a soft inner vignette; a painted house
  (white clapboard, dark grey roof, lawn and a driveway) and the house number in white Barlow
  Condensed 700 in the top-right corner, rotated with the tile. In 3D the SE house mini sits on
  top of this plate (section 6), so the painted house is only seen in the 2D board.
- Garden: 2×1 `gardenTile` `#5fb843` plate with a hedge, a white gate and a path.
- Apartments: 3×3 magenta plate with "π" / "9¾" in white script; curved road ends touching it.
- Parks: 2×2 green plate `#537938` with trees and a bench.
- Drink suppliers (base tiles print them small, about one square): beer = a green keg on its
  side with a hop badge and a ladder; lemonade = two wooden crates heaped with lemons and a
  lemonade sign; soda = a red vending machine / red bottle crate with white script. The SE
  replaces them with green plastic minis; we show the printed version in 2D and the mini in 3D.

### Camera and light

- Keep the 50° default tilt. Warm key light from the upper left (colour `#fff4e0`, intensity
  2.2), cool fill from the right (`#dfe9f0`, 0.6), ambient `#f3eee2` 0.5. Soft shadows, radius 3.
  Tone mapping ACES at exposure 1.0 so the plastics do not blow out.
- The table outside the map: a dark warm wood `#6b4a2f` with a subtle grain, as in every SE
  photo, instead of the current cream apron. Keep the rim labels readable on a cream band.

---

## 6. Miniatures, piece by piece

**Painted minis (2026-10, supersedes the single-colour rule below).** Keep every SE sculpt, but
paint it like a quality hobby paint job. Player pieces (restaurants, totems, coffee kiosks) take
the player colour on walls and roofs with painted glass, frames, doors, signs and trim. Houses
use pale period walls and slate, shingle or dark terracotta roofs (never a player hue). Drink
suppliers keep their component base tones: beer green, lemonade yellow, soda red. Marketing
pieces are realistically painted on a light-blue plate. Roads are asphalt with kerbs and
markings; empty lots carry flat lawn, paving and car-park prints. Shared detail paints live in
`three/minis/paint.ts`. Where this section says "monochrome" or names a `*Plastic` colour, read
it as the base tone of the paint job.

Original rule: emulate the SE sculpt. One colour per piece family, matte
plastic with a slight sheen (`MeshStandardMaterial` roughness 0.55, metalness 0, plus a faint
clearcoat if `MeshPhysicalMaterial` is used: clearcoat 0.15, roughness 0.6). Flat shading, no
textures except decals listed below. Ambient occlusion baked into vertex colour (darken concave
areas 8–12 %). Every mini stands on a thin base plate 0.06 units high that fills its footprint
to the 0.075 margin, with the square count embossed as a faint grid on the plate. Keep the
vertex-colour single-draw-call pipeline in `three/minis/kit.ts`; the pieces below fit it.

Budgets: restaurants 900–1400 triangles (they are the hero pieces), houses 500–700, apartments
600, gardens 300, drink suppliers 300–400, marketing 250–500, tokens 60–120, turn-order totems
400–600. Instance everything that repeats (houses, gardens, tokens, campaign bases). Phone tier
may drop the embossed details (numbers, grid) and use the base plate's flat top.

Creative liberties we allow: a contrasting decal for the chain wordmark on the restaurant
rooftop sign and a lighter embossed house number so they read on screen; subtle animation
(radio pulse, plane bob, campaign duration pips) as today; vehicles (section 6.13).

### 6.1 Restaurants (one model per chain, 2×2)

SE reference: `se-restaurants-five-chains.jpg`, `se-restaurant-on-board-houses.jpg`,
`se-turn-order-track.jpg` (the totems are the same buildings as towers). Each restaurant is a
monochrome building on a square plate with the **entrance corner cut off at 45°** (that chamfer is
how players read the entrance), a "WELCOME" strip embossed along the chamfer, and a slot on the
roof that holds the drive-in sign.

Current: one generic rounded-corner diner in player colour with awnings and a round pole sign
(`cur-board-closeup.png`). Gap: wrong colours, no unique silhouette per chain, no entrance
chamfer, multi-colour.

Specs (plate 1.86×1.86, chamfer 0.5 on the entrance corner, plate height 0.06):

| Chain | Silhouette | Key details |
|---|---|---|
| Fried Geese & Donkey (orchid) | Low barn-like block, 0.75 high, with a single-pitch roof sloping up to the back at 20°, a boxy rooftop sign 0.45 high at the back edge | Two animal figures on the roof sign (a goose and a donkey, 0.3 tall, simplified), a long awning along the entrance side, a pair of double doors at the chamfer. Mini height 1.35. |
| Golden Duck Diner (lemon) | Streamlined 1950s diner: a low rounded box 0.6 high with horizontal chrome ribs (3 grooves), rounded corners r 0.2, flat roof | A sitting duck 0.35 long on the roof centre; a thin horizontal rooftop sign plate behind it; ribbon windows along both street sides. The lowest, widest profile of the five. Height 1.0. |
| Santa Maria Pizza (salmon) | Hacienda: a 0.7-high block with a long tiled pitched roof (ridge along the plate's diagonal away from the entrance), 30° pitch, deep eaves 0.1 | Roof tiles as 12 embossed rows; a square chimney / pizza-oven stack 0.3 above the ridge; an arched entrance at the chamfer; a bell-gable sign on the roof peak. Height 1.3. |
| Xango Blues Bar (cornflower) | Jukebox bar: a 0.8-high block with a barrel-vaulted roof (half-cylinder along the entrance axis) and a scalloped parapet on the street sides | A giant guitar 0.9 long lying on the vault, neck pointing at the entrance; neon-tube ribs along the vault edge (3 embossed lines); round porthole windows. Height 1.4 (guitar head). |
| Gluttony Inc. (lime) | Burger box: a square 0.85-high block with a scalloped (curtain) roofline and a square tower 0.5 above the back corner | A burger stack on the tower top (bun, patty, bun as three discs); striped awnings on two sides; big shop windows. Height 1.45. |
| Siap Faji (aqua, Ketchup) | Pagoda-eave kiosk: 0.7-high block with upturned corner eaves and a lantern on a pole | A noodle bowl with chopsticks on the roof; a bamboo-slat screen on one side. Height 1.35. |

States: *coming soon* = the same building with a cardboard-coloured (`#d9c7a3`) "COMING SOON" sign
standing in the roof slot and the building at 85 % value with a construction fence ring (replaces
the scaffold ghost). *Drive-in* = a white sign in the roof slot reading "DRIVE-IN OPEN" in coral,
plus the four corner arrows as now, recoloured white with a coral outline. *Derelict* = grey
`#9a948c` version of the chain model, no sign.

Chain wordmark decal: a flat rounded plate on the roof sign carrying the chain's own logo (section
7) as a two-colour decal (chain plastic colour + white). This is the one place a texture is used.

### 6.2 Houses (2×2) and gardens (2×1)

SE reference: `se-houses-closeup-numbers.jpg`, `se-house-with-garden.jpg`. Burgundy plastic
(`#7a2f48`) on a burgundy plate. Two house variants are visible: a side-gabled colonial with a
front porch and a cross-gabled house with an attached garage. The **house number is embossed on a
raised block** at the plate corner nearest the road (large, 0.35 tall digits), and footprints /
a path are embossed on the plate.

Current: cream walls with orange roofs, six variants, bushes, number as a sprite badge. Gap:
multi-colour, wrong roof colour, number only as a label.

Spec: plate 1.84², single colour `housePlastic`. Body 1.0×0.7 footprint, 0.55 high; gable roof
35°, ridge 0.95; chimney 0.12² on the back slope; porch 0.3 deep with 3 posts; 4 window recesses
0.12² each side and a door recess; garage wing on even variants (0.6×0.5, flat-pitch roof).
Number block 0.45×0.3×0.25 at the entrance corner with the digits embossed 0.03 and tinted 12 %
lighter so they read from the default camera; keep the sprite badge as the accessibility label
but let it hide at close zoom. Embossed path (5 ovals) from the door to the plate edge. Three
variants is enough; vary porch side and garage side.

Garden: plate 1.88×0.88 in `gardenPlastic`, a 0.14-high hedge ring with a gap on the long side
facing the house, two bushes (icosphere 0.18 r), a fountain basin (cylinder 0.25 r, 0.1 high)
or a bench, flower beds as 0.02 raised ovals. Monochrome lime.

When a garden is attached the two plates share the same plate colour junction: no gap, as the SE
"house + garden combo" tile.

### 6.3 Apartments (3×3, Ketchup)

Deluxe print: a 5-storey pink brick block with rows of windows and a wraparound ground-floor
shopfront (Ketchup p.4). SE: a burgundy or magenta block, same family as houses. Current: lilac
stepped block with a red canopy. Spec: plate 2.84² in `housePlastic`; main block 2.2×1.8, 2.2
high; 5 window rows × 8 recesses per face; a shallow pilaster every 0.4; a flat roof with a
parapet and a water tank; ground-floor shopfront band with 6 arched recesses; the name ("π" or
"9¾") embossed on a roof-top plaque 0.5 wide. Single colour, 600 tris.

### 6.4 Parks (Ketchup) and rural area

Park: Deluxe print is a green square with two trees and a bench (Ketchup p.4). Spec: plate in
`parkTile` green, three stylised round trees (cone trunk + 2 stacked icospheres), one bench, a
path. Monochrome park green; L/T/I joins as now.

Rural area: SE is a big green sculpted slab with a lake, a boathouse / shed, trees and a jetty
(`se-rural-area-mini.jpg`). Current: farm with a barn and silo. Spec: 5×5 plate in `ruralPlastic`
with a recessed lake (0.03 deep, same colour, smooth), a jetty of 6 planks, a slat shed 1.0×0.7
with a shallow pitched roof, 8 round trees and 3 pines, and an "∞" embossed in one corner.
Monochrome. The four rural marketing campaigns are long light-blue billboards (section 6.6)
placed along its sides. The freeway (section 6.11) connects it.

### 6.5 Drink suppliers (1×1)

Deluxe print (base p.21, p.22, Ketchup p.16): beer = a green keg on a stand; lemonade = crates of
lemons; soda = a red vending machine / bottle crate. SE: all three in green plastic, each a
different silhouette (`se-house-with-garden.jpg` shows the beer keg with a ladder). Current:
multi-colour kiosks. Spec, all in `drinkPlastic`:

- Beer: a horizontal keg (cylinder r 0.28, length 0.5) on two trestles, a tap at one end, a
  short ladder leaning on it, a hop-leaf badge embossed on the keg. Height 0.7.
- Lemonade: two stacked crates (0.5×0.35×0.2) heaped with lemons (12 spheres r 0.06), a small
  sign post with "LEMONADE" embossed. Height 0.75.
- Soda: a vending machine box 0.4×0.3×0.75 with a recessed front panel and a coin slot, two
  bottle crates beside it. Height 0.8.

### 6.6 Billboards (1×1 to 3×1)

Deluxe art: a grey-teal token with a cyan sign face held by a lattice of A-frame struts (base
p.20, p.30). SE: light-blue plastic, a flat sign panel on a lattice with the campaign number
embossed on the plate (`se-marketing-minis-tray.jpg`, `se-board-topdown-marketing-minis.jpg`).
Current: chain-coloured posts and frame. Spec: plate in `marketingPlastic`; sign panel 0.9×0.5
per square of width, 0.04 thick, top edge at 1.1; five A-frame struts under it; a catwalk ledge;
campaign number embossed on the plate's front edge. The sign face carries the good's token glyph
as a decal on a cyan `#2deedd` face (the one colour accent, matching the print). Giant rural
billboard: the same at 3.6 wide, 1.0 high face.

### 6.7 Mailboxes (1×1, 2×1)

Deluxe art: a US rural mailbox, red flag up, on a wooden post, with a letter (base p.31). SE: the
same in light blue. Current: chain-coloured box. Spec: `marketingPlastic`; post 0.08² × 0.6, box
half-cylinder 0.26 r × 0.45 long, door open 30°, flag up, three letters sticking out, campaign
number on the plate. Height 0.95. Larger mailboxes scale 1.4.

### 6.8 Airplanes (1×1, 3×1, 5×1 along the map edge)

Deluxe art: a yellow-and-blue low-wing prop plane with a pilot, towing a white banner (base p.31).
SE: a light-blue plane on a wavy banner stand, the banner is the token footprint
(`se-airplane-mini.jpg`). Current: white plane with a chain stripe. Spec: `marketingPlastic`
monochrome; a stand rising from the plate's far end to 1.4; a low-wing monoplane length 0.9,
span 1.0, with a 2-blade prop and a pilot bump; the banner a wavy ribbon (sine, 2 periods)
0.4 high running from the tail down to the plate, with the good's glyph decal. The plate is 1, 3
or 5 squares long and carries the campaign number. Keep the bob and prop spin.

### 6.9 Radio towers (1×1)

Deluxe art: a red-and-white lattice tower with a bulb on top (base p.20). SE: light-blue lattice
mast on a plate with a tiny hut. Current: chain-coloured mast with rings. Spec: `marketingPlastic`;
a 4-leg lattice mast tapering 0.5→0.12 over 1.9 units, 7 cross-brace levels, a sphere r 0.1 at
the top, a hut 0.3² at the base; three animated pulse rings as now but in `cyan` at 35 % opacity.

### 6.10 Coffee shops (1×1, Ketchup)

Deluxe tokens are 1×1 tiles in the chain colour with the chain logo and a cup. SE: small kiosks in
chain plastic colour (`se-ketchup-contents-spread.jpg`, left tray). Current: cream kiosk with a
cup. Spec: chain plastic colour; a 0.6² kiosk 0.55 high with a counter hatch, a conical roof,
and a cup-and-saucer on top (0.2 r). Monochrome with the chain mark decal on the hatch.

### 6.11 Lobbyist roads, roadworks, freeway, gourmet critic (Ketchup)

- Road tile (Ketchup p.15): flat printed road piece; "under construction" side shows orange and
  white chevrons and a works sign. Spec: a flat road quad using the road material; under
  construction = a chevron strip decal `#f08a3c`/`#fdfcfa` along both edges and two striped
  barriers.
- Roadwork token: an orange/white hazard-striped square with a warning triangle. Spec: a flat
  0.9² plate `#f08a3c` with white diagonal stripes and a small cone.
- Freeway: a green highway sign "FREEWAY" with arrows (Ketchup p.25). Spec: keep the ramp but
  make the gantry sign a green `#2f7a46` panel with white Barlow Condensed "FREEWAY" and two
  arrows; the deck in `road` with the yellow edge lines.
- Gourmet food critic: a cream token with a chef's hat and a book (Ketchup p.26). Spec: a cream
  `#e9e7dd` plate with a toque and an open book, 0.5 high, placed beside the map.

### 6.12 Food and drink tokens (demand on houses, stock in panels, campaign duration)

SE: screen-printed wooden shapes, 8 mm thick (`se-food-drink-tokens.jpg`): burger = a round bun
silhouette, pizza = a wedge, beer = a bottle silhouette, soda = a bottle silhouette, lemonade = a
glass silhouette, coffee = a cup, kimchi = a square dish, sushi = a roll, noodles = a bowl.
Current: detailed 3D foods on discs. Spec: an extruded 2D silhouette per good (0.18 thick in
world units at 1:1, 0.3 across), body in the token body colour, with the printed art as a decal
on the top face only (our own painting of the good, flat style). Stacks of five on houses; the
"5×" Ketchup large tokens are the same shape with a "5" decal. The same glyphs are reused as 2D
icons in the UI (plaques, stock panels, milestone tiles) so the token look is consistent in both.

### 6.13 Turn-order markers, busy markers, money

- Turn-order markers: SE uses a tower version of each chain's restaurant ("totem",
  `se-turn-order-track.jpg`): the same roof feature (goose and donkey, duck, oven stack, guitar,
  burger tower) on a 0.5² column 0.9 high in the chain plastic colour. Spec: build each from the
  restaurant parts; 400–600 tris; render as a sprite for the 2D track.
- Busy markers: Deluxe uses teal circle tokens numbered 1–16 (base p.1 item 18). Spec: a `teal`
  disc with a cream numeral, both as a 3D puck on the campaign and a 2D chip on the busy card.
- Money: never a 3D object on the board; use the 2D banknotes (section 4).

### 6.14 Vehicles (our addition)

Keep them as a creative liberty, but restyle: 1950s shapes (a cab-over box truck like the cover's
blue truck, a step van, a pickup) in the chain plastic colour, monochrome with a white decal of
the chain mark on the door. Remove the multi-colour cargo; carried goods are the wooden tokens.

---

## 7. Chains

The five base chains and the sixth Ketchup chain, as named in the game, with logo concepts we
draw ourselves in the 1950s sign-painter style (script plus condensed caps, a badge shape, two
colours: chain plastic colour and cream). None of these copy the printed logos.

| Chain | Colours (print / plastic) | Logo concept (ours) | Chain mark (single glyph for badges) |
|---|---|---|---|
| Fried Geese & Donkey | plum `#612e57` / orchid `#b361af` | A diagonal ribbon badge: "Fried Geese" in Yellowtail over "& DONKEY" in Barlow Condensed caps, a goose head and a donkey head facing each other above the ribbon, three motion lines. | goose silhouette |
| Golden Duck Diner | yellow `#fded75` / lemon `#e9d44a` | A starburst seal with a sitting duck silhouette, "Golden" in Yellowtail and "DUCK DINER" in Barlow Condensed caps beneath, gold on cream. | duck silhouette |
| Santa Maria Pizza | pink `#dd7673` / salmon `#e58a66` | A round badge shaped like a pizza (scalloped crust edge), "Santa Maria" in Yellowtail across the top, "PIZZA" in condensed caps on a banner across the middle, a sail (the ship) as a wedge-shaped slice. | pizza-sail wedge |
| Xango Blues Bar | blue `#007cb0` / cornflower `#6f9fd8` | A circular record-label badge: "Xango" in Yellowtail, "BLUES" in big condensed caps across the centre, "Bar" small; a guitar neck crossing the circle like a note stem. | guitar silhouette |
| Gluttony Inc. | olive `#7e9b48` / lime `#c6d48a` | A burger-shaped badge (bun top arc, two stripes for lettuce and patty): "Gluttony" in Yellowtail on the top bun, "INC." in condensed caps on the patty band. | burger stack |
| Siap Faji Asian Food | teal `#88b6ac` / aqua `#99d1c6` | A lantern-shaped badge: "Siap Faji" in Yellowtail, "ASIAN FOOD" in condensed caps, a noodle bowl with chopsticks and three steam curls. | noodle bowl |

Seat palette change: replace `PLAYER_COLORS` (Ketchup, Mustard, Blueberry, Pickle, Grape,
Tangerine) with the six chain plastic colours in chain order, and derive `dark` text colours that
pass 4.5:1 on `light` and `surface`: FGD `#5a1f55`, Golden Duck `#6b5300`, Santa Maria
`#8a3a20`, Xango `#24497a`, Gluttony `#3f5a12`, Siap Faji `#1f5d55`. Seat names become the chain
names. Keep the chain mark as the non-colour cue (section 2).

---

## 8. Work breakdown

Four packages, in priority order. Each has acceptance criteria that are checked by putting the
new screenshot next to the cited reference (`docs/art/refs/`) and the old screenshot
(`docs/art/current/`). All packages keep the a11y tests in `packages/client/test/a11y.test.ts`
green and update `docs/visual-style.md` tables to the new tokens.

### WP1 — UI theme and fonts (foundation; do first)

Scope: `theme.ts`, `styles/main.css`, `index.html` font loading, Home, TopBar, buttons, chips,
panels, dock tabs, player rail, cash display, logo lockup.

- Replace the token values with section 2 (keep names; add `coralInk`, `tealInk`, `panelTeal`,
  `chrome`, chain felt colours). Switch `PLAYER_COLORS` and `CHAIN_COLORS` to section 7 and
  update `SEAT_COLORS` / `DEFAULT_PLAYER_COLORS` / `seatColor` mapping.
- Self-host Lilita One, Yellowtail, Barlow, Barlow Condensed, Rye (woff2, latin subset).
- Paper background with grain and vignette; wood table around the board.
- Buttons, panels, tabs, ribbons, badges per section 4.

Acceptance:
- `cur-home.png` vs new Home: script "Magnate" title, coral and teal only, no stripes, no pills.
- Top bar phase strip reads as the rulebook's phase ribbon (base p.12).
- Every text token pair in the a11y test passes 4.5:1; `coral` and `teal` are only used at large
  text sizes (a test asserts no `.btn`, `.chip` or body text uses them).
- Phone layout (`cur-table-dinnertime-phone.png`) still has 44 px targets and no horizontal
  scroll.

### WP2 — Cards and panels

Scope: employee cards (Company, Staff, hand, tutorial), milestone tray, bank / money, turn-order
track, house plaques and 2D board icons.

- Employee card component implementing the section 4 layout with family colours, range chip,
  sparkle, torn-edge ability panel, training list, salary and 1x badges, card back.
- Milestone tray as a chrome tray with felt and tiles; tick / X tokens.
- Banknote graphic and bank stack; turn-order track strip.
- Token glyph set (9 goods) as SVG, shared with WP4 decals.

Acceptance:
- A Pizza Cook, a Brand Manager, a CEO and a Pricing Manager rendered side by side with
  `rb-base-p07-card-anatomy-employee-types.png` match in band position, title style, panel edge,
  footer icons. White-on-band text passes AA at the rendered size.
- Milestones panel vs `rb-base-p35-milestone-list-tray.png` and
  `se-milestone-tray-xango-tiles-closeup.jpg`: 6-column tray, band titles in condensed italic
  caps, values in script.
- Cards at 96 px wide stay legible (title and range chip) on a 390 px phone.

### WP3 — Board and tiles (cheap, biggest visual change)

Scope: `three/board/*` (ground, roads, seams, rim), 2D board, overlays recolour.

- Off-white speckled ground with faint grid; hairline tile seams with a small bevel; warm grey
  roads with yellow edge lines, white dashes and zebra crossings at tile edges; lattice bridges;
  printed magenta house plates, green garden plates, magenta apartment plates, park plates and
  printed drink suppliers under the minis; wood table.
- Light rig and tone mapping per section 5.

Acceptance:
- Top view of the dinnertime fixture next to `se-board-tiles-houses-minis.jpg` and
  `se-map-tiles-dual-layer.jpg`: ground is cream not green, roads have both line types,
  crossings at tile edges, house plates magenta.
- Tile borders remain countable at the furthest zoom on a phone (seam ≥ 1.25 px) and in
  high-contrast mode.
- Legal / illegal / range overlays still meet 3:1 against the new ground and road.

### WP4 — Miniatures (largest; split into four deliveries)

Scope: `three/minis/*`, `three/labels.ts` plaques, playground fixtures.

- 4a Restaurants and turn-order totems: six chain models with entrance chamfer, roof-sign decal,
  coming-soon / drive-in / derelict states; totems for the track.
- 4b Houses, gardens, apartments, parks, rural, drink suppliers: monochrome plastic set.
- 4c Marketing and Ketchup pieces: billboards, mailboxes, planes, radio, coffee shops, roads,
  roadworks, freeway, critic; cyan sign faces with token-glyph decals.
- 4d Tokens, busy markers, vehicles restyle; plaque and stock glyphs unified with WP2's SVG set.

Acceptance (per delivery, in the playground at `/dev/three-playground.html?fixture=dinnertime`
and `?fixture=ketchup`, default camera and top view):
- Each piece is identifiable by silhouette alone in greyscale at phone size (render with
  `?mono=1` or a greyscale CSS filter in the check).
- Side by side with `se-restaurants-five-chains.jpg`, `se-turn-order-track.jpg`,
  `se-house-with-garden.jpg`, `se-houses-closeup-numbers.jpg`, `se-airplane-mini.jpg`,
  `se-marketing-minis-tray.jpg`, `se-food-drink-tokens.jpg`, `se-rural-area-mini.jpg`: one
  colour per family, correct family colour, the SE's key detail present (chamfer and WELCOME
  strip, embossed house number block, keg with ladder, wavy banner, lattice mast, wooden token
  silhouettes).
- Triangle counts within the budgets in section 6; the dinnertime fixture draws no more calls
  than today (instancing kept); 60 fps on the "High" tier on a 2020 laptop, 30 fps on the phone
  tier.
- House numbers, campaign numbers and demand remain readable through the sprite badges at every
  zoom; the embossed versions are additive, not a replacement.

---

## Reference images

All in `docs/art/refs/` unless noted. Third-party photographs are research references only.

Special Edition photos (Talking Shelf Space review, Aug 2026; Everything Board Games review,
Mar 2026):

| File | Shows |
|---|---|
| `se-box-cover.jpg` | Box and rulebook cover art, the logo lockup, waitress, cab-over truck |
| `se-box-contents.jpg` | Base box with token tray, tile stacks, chrome card tray |
| `se-restaurants-five-chains.jpg` | The five chain restaurant minis: blue Xango (guitar), green Gluttony (scalloped roof, tower), salmon Santa Maria (tiled roof), yellow Golden Duck (duck on a low diner), orchid Fried Geese & Donkey (animals on the roof sign); entrance chamfers and roof slots |
| `se-turn-order-track.jpg` | Turn-order totems per chain on the cream track; milestone tray behind |
| `se-restaurant-on-board-houses.jpg` | Salmon restaurant on the board with burgundy houses, green drink suppliers, red soda and yellow lemonade minis, light-blue billboard, lattice bridge |
| `se-house-with-garden.jpg` | Burgundy house 6 with embossed number, lime garden with hedge and fountain, green beer kegs with ladders, light-blue radio mast and mailbox |
| `se-houses-closeup-numbers.jpg` | House number blocks, roof shingles, porch, embossed path; red soda vending machine |
| `se-airplane-mini.jpg` | Light-blue plane on a wavy banner stand, pizza tokens as duration counters, numbered plate |
| `se-marketing-minis-tray.jpg` | All marketing minis in their tray: planes, mailboxes, radio masts, billboards, lattice bridges, numbered bases |
| `se-full-board-3x3.jpg` | A whole 3×3 map with minis; token trays and chrome card tray |
| `se-board-tiles-houses-minis.jpg` | Top-down board: tile grid, roads, crossings, house plates, lattice bridge |
| `se-board-topdown-marketing-minis.jpg` | Top-down with campaign minis, pizza tokens, turn-order track and money |
| `se-map-tiles-dual-layer.jpg` | Tile stack close-up: printed house square, road lines, bridge, speckled ground |
| `se-food-drink-tokens.jpg` | Wooden token shapes and prints for burger, soda, lemonade, pizza, beer, busy tokens |
| `se-milestone-boards.jpg` | Chrome milestone tray with blue felt and tiles |
| `se-milestone-tray-xango-tiles-closeup.jpg` | Milestone tile layout, tick and X tokens, band colours |
| `se-employee-card-tray-kitchen-cards.jpg` | Card title bands, script titles, range chips, portraits, tray labels |
| `se-ceo-cards.jpg` | CEO cards: charcoal band, torn edge, work-slot glyph |
| `se-display.jpg` | Banknotes $1 green, $5 blue, $10 yellow, $50 pink |
| `se-ketchup-box-contents.jpg` | Ketchup insert: coffee-shop minis per chain, rural slab, apartments |
| `se-ketchup-contents-spread.jpg` | Ketchup components: 5× tokens, Siap Faji tray, milestone add-ons |
| `se-rural-area-mini.jpg` | Rural area slab: lake, shed, jetty, trees, "∞" |

Rulebook renders (from `docs/rules/source/*.pdf`, 110 dpi):

| File | Shows |
|---|---|
| `rb-base-back-logo.png` | Logo lockup on vignetted cream paper |
| `rb-base-p01-components.png` | Every base component: tiles, trays, cards, money, tokens, campaign tiles |
| `rb-base-p07-card-anatomy-employee-types.png` | Employee card anatomy A–H and the family colour bands |
| `rb-base-p35-milestone-list-tray.png` | Milestone bands, billboard art, radio tower art, the yellow Golden Duck tray |
| `rb-ketchup-p01-components.png` | Ketchup components: coffee / noodle / sushi / kimchi tokens, parks, roads, rural, freeway, critic |

Pages worth re-rendering when working on a package: base p.2 (card tray, item colours), p.3
(map and money), p.4 (player setup, menu, tray), p.5 and p.22 (tiles and roads), p.10 (distance
table colours), p.11 (counters on houses and campaigns), p.12 and p.14 (panel and ribbon styles,
turn-order track), p.20 and p.30–32 (campaign art), p.24 (houses and gardens); Ketchup p.3–4
(districts, apartments, parks), p.10 (coffee shops), p.15 (roads), p.25 (rural, freeway), p.30
(Siap Faji).

Current-state screenshots in `docs/art/current/`: `cur-home.png`, `cur-home-phone.png`,
`cur-table-dinnertime.png`, `cur-table-dinnertime-phone.png`, `cur-table-working.png`,
`cur-dock-company.png`, `cur-dock-staff.png`, `cur-dock-milestones.png`, `cur-board-closeup.png`,
`cur-playground-dinnertime.png`, `cur-playground-ketchup.png`, `cur-playground-vehicles.png`,
`cur-playground-vehicles-studio.png`.
