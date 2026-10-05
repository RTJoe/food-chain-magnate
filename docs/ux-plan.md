# UX plan: board-first decisions

Audit of the client (`packages/client/src/{ui,state,three}`) against every phase and decision of the base game and the Ketchup modules. Done by reading the code and by driving the real UI with Playwright (hot-seat game rounds 1–4 on desktop 1280×860 and phone 390×844; synthetic Working-phase states with every buyer, marketeer, developer and manager at work; Ketchup states with lobbyists, baristas, rural marketeers and every pending choice; the `three-playground` fixtures). Line numbers are as of commit `abb19e2`.

Scope: interaction and information design. Persistence is out of scope (fixed separately). Engine rules are assumed correct; where the engine does not yet give the client the data a good interaction needs, the gap is named precisely.

---

## 1. Design principles

1. **Every board choice is made on the board.** The list in the Turn panel is a fallback for accessibility, tests and no-WebGL, never the primary way to pick. Today buyer routes and off-board campaigns are list-only (`ui/Placement.tsx:20`).
2. **Choose the thing, then the place.** When a choice has a discrete "what" (campaign token, house tile, drink type) and a spatial "where", the what is picked in the panel and the where on the board, in that order, with the ghost showing the real footprint. Today the what is hidden inside the where (`engine/src/rules/working/index.ts:273-304` emits one placement per tile × orientation × square; the client groups by footprint rectangle, `three/layout.ts:205-208`).
3. **Preview before commit.** Hovering or staging a placement shows its consequence: route path and drinks collected, campaign reach, distance from a restaurant, demand the house will have. Nothing is committed on a bare click when a consequence can be shown.
4. **Highlights mean something.** A legal-square tint that covers 90% of the board (262 "options" for a billboard, 104 for a first restaurant) carries no information. Tint only where the choice is non-obvious, and layer range/reach overlays with distinct, documented styles.
5. **Everything on the board is inspectable.** Click or tap any house, restaurant, campaign, source or Ketchup piece in idle mode and get a card: who, what, demand, distance, price. The 3D layer already emits `{ kind: 'object', id }` picks and `boardHover` (`three/interaction.ts:344-346`, `state/interaction.ts:34`), and supports `inspect`/`focus` (`state/boardBridge.ts:39`, `state/interaction.ts:19`) but **no overlay component consumes any of them**.
6. **Say why not.** When an action is unavailable or a square is illegal, the UI says why in one line (out of range, pile empty, tile occupied, wrong sub-step). The engine already returns reasons (`campaignPlacementProblem`, `Rejected.message`); the client discards most of them.
7. **Phone first for the board.** A placement must be possible with the sheet collapsed and the board filling the screen; 44 px targets; tap-to-stage, tap-to-confirm. Today the bottom sheet re-opens over the board the moment a pick starts (`ui/Table.tsx:53-59` vs `ui/Placement.tsx:58`).
8. **The map tile is a first-class visual unit.** Distance, range, radio reach, one-restaurant-per-tile and the Ketchup extra tile are all tile-based, so tile seams must be readable from the default camera at phone size, in both tilted and top views.

---

## 2. Per-flow audit

Legend for the "engine data" column: **have** = already in `GameView`/`Placement`; **add** = new field or API listed in §4 (built by WP1).

### 2.1 Setup and round structure

| Flow | Current behaviour | Problem | Proposed interaction | Engine data |
| --- | --- | --- | --- | --- |
| First restaurant | `ui/PromptPanel.tsx:148-175` mounts `PlacementFlow`; board tints every legal 2×2 (`three/interaction.ts:209-234`), hover ghost + "R: 2 options here" bar at the bottom of the board (`ui/BoardControls.tsx:57-62`), list fallback "Square 0,0 · entrance NE" (`state/actions.ts:71-72`). | 104 options tint the whole map yellow, so the only real information (one restaurant per tile, entrance must touch a road) is invisible. The entrance corner is not visible on the ghost from the default camera. Ghost at (0,0) sits under the player rail. Hint text is far from the pointer. No way to see which houses the spot is connected to or at what distance. | Tint per **tile** (a tile is eligible or not), not per square; ghost with a bright door marker and a short road stub showing the entrance; on hover show a distance badge on every house reachable by road from that entrance ("0 / 1 / 2 borders"); hint follows the pointer (CSS2D label) instead of a fixed bar; the rail never overlaps the board (`contentRect` padding or rail as overlay with a board inset). Variant cycling by clicking the corner you want, not only `R`. | have: placements. add: `reachPreview(from)` → `{ houseId, distance }[]` (uses `map/pathfinding.ts:160-253`). |
| Pass in setup round 1 | Button under the flow (`PromptPanel.tsx:166-172`). | Fine. | Keep; show "you place in round 2, after everyone" inline. | — |
| Reserve card | Three cards `PromptPanel.tsx:182-214`. | Fine; the consequence (CEO slots are set by the majority) is explained. | Keep. Add other players' "chosen" ticks on their rail panel (exists: `ppanel-ok`). | have |
| Restructuring | `ui/OrgChart.tsx` editor: tap card, tap slot; validation and penalty warnings. | Works. Two gaps: cards show no ability text in the editor (only name/icons), so new players place blind; busy marketeers are missing from the hand with no note. | Long-press/`i` on a card opens the same detail card as the Staff tab (`ui/Market.tsx:37-47`). Show busy marketeers greyed in a "busy" row with the campaign number. Highlight their campaign on the board on hover (`inspect`). | have |
| Order of business | Slots `PromptPanel.tsx:222-257`. | Fine. "Earlier spots act first" but nothing says who else is still to choose after you or why you choose now. | Keep; add the queue with badges and "you choose now because you have N open slots". | have (`phase.queue`) |
| Waiting / spectating | `PromptPanel.tsx:88-122` with a one-line hint per automatic phase. | While another player works, the board shows their picks animated, but nothing tells you what they are doing (hire? campaign?). | Live caption under the title fed by the last `turnStarted`/`workStageChanged`/`campaignPlaced` events (already in the log). | have (events) |
| Hot-seat handoff | `ui/Overlays.tsx` full-screen card. | Fine. | Keep. | — |

### 2.2 Working 9–5

| Flow | Current behaviour | Problem | Proposed interaction | Engine data |
| --- | --- | --- | --- | --- |
| Work overview | `ui/Work.tsx:23-119`: stage chips, a card grid with status, actions appear under the selected card. | The stage chips do not advance until you act, so the title says "recruit" while you launch campaigns. Cards say "No action" with no reason (seen: Trainer with a trainable barista on the beach, Rural Marketeer, Gourmet Critic). "Skip X" is a separate ghost button per card and is pointless when End turn exists. | Stage chips highlight the stage of the selected card's action, and dim stages that would be closed by it ("acting here closes Hire and Train"). "No action" gets a reason tooltip from the engine. Drop per-card Skip. | add: `LegalAction` gains optional `disabledReason` entries for cards with nothing legal (engine `workingLegalActions`, `rules/working/index.ts:186-232`). |
| Recruit | Engine returns one `ready` action per hireable card (`rules/working/index.ts` recruit case) → a pile of pill buttons "CEO: hire Waitress" (`ui/Work.tsx:123-136`). The nicer `HirePicker` card grid with supply counts and reasons (`ui/Work.tsx:171-195`) is only reached by the compose fallback. | Pills carry no supply count, salary, ability text, or "pile empty, must train" state. 8–16 pills on a phone. | Always route `work.recruit` through `HirePicker` (group engine `ready` actions by `cardUid`): card grid with ×supply, $ salary, 1x badge, ability text on long-press, and empty-pile cards shown with "hire & train now" when a training step is still available. | have (`view.supply`, catalog) |
| Train | Engine `ready` per (target, destination) → pills "Trainer: train Errand Boy → Cart Operator". `TrainPicker` (`Work.tsx:197-254`) only in fallback. | Same as recruit; with a coach/guru the pill list explodes (targets × 2-step destinations). | Route through `TrainPicker`: pick the beach card, then a mini career tree (the `careerForest` renderer from the Staff tab) with reachable nodes lit, steps shown as hops, and the barista/coffee-shop consequence flagged. | have |
| Produce | `ready` per food. | Fine for cooks. Kitchen trainee shows two pills; OK. | Keep; show current stock next to the choice. | have |
| Errand boy | Three `ready` actions "get beer/lemonade/soft_drink". | Fine. | Keep, with drink icons. | have |
| **Cart / truck / zeppelin routes** | **List-only**: `ui/Placement.tsx:20` excludes `buyerRoute` from the board; `three/interaction.ts:592-594` builds no ghost; list items say "Route of 9 steps" (`state/actions.ts:84-85`). | See §3.1. The list carries no path, no start restaurant, no drinks collected, no range used. Route length is meaningless to the player. | §3.1: routes drawn on the board, hover to highlight, cycle candidates, drink chips per source. | have: `Placement.buyerRoute.route.path/tiles`, `collects[]`, `route.from`. add: `range`, `bordersUsed` on the placement (cheap, from the enumerator). |
| **Campaigns** | Good + duration chosen first in the panel (`Placement.tsx:94-111`), then the board tints every legal square for every tile of that kind (`rules/working/index.ts:273-304`; 262–288 "options"). Tile number is whatever the engine emitted first for the footprint under the pointer; `R` cycles tile numbers that share a footprint (e.g. #7↔#8), **not** orientation (2×1 vs 1×2 are different footprints, so different spots). The list is capped at 60 and shows only tile #11. | See §3.2. Token size/number is not a choice, rotation is impossible, no range or reach is shown, the airplane edge strip is an orange band with no covered-rows hint. | §3.2: token picker first (number, size, duration, good), then a rotating ghost with a reach overlay and a range overlay for road-range marketeers. | have: `spec.tileNumber` filter already supported; `content.marketingTiles` in the module manifest (`types/content.ts:582`) but not in the client catalog. add: `campaignReach` and `rangeOverlay` APIs (§5). |
| Drive-ins | Automatic in the engine; the restaurant mini gets corner markers. | No notice that drive-ins opened and what that means (routes may start from any corner). | A one-line note in the work panel when a local/regional manager is at work, and a pulse on the restaurants (`animate.ts:89-91` already pulses). | have |
| New house | Board tints every 2×2 with a garden side variant; `R` cycles garden side; ghost shows house + garden (`three/interaction.ts:543-548`). Which house tile (number) is `spec.houseOrder ?? houseTiles[0]`. | The house **number** (dinnertime order) is a real strategic choice and is never offered. Garden side defaults to the pointer direction, which is good, but the ghost shows "S" facing regardless. No reach preview for existing campaigns that would hit the new house. | Tile picker chips (numbers left in `view.houseTiles`) above the board hint, then board pick; ghost faces the road. Hover shows which campaigns will reach the new house and its demand cap (5). | have (`view.houseTiles`). add: `campaignReach` for a hypothetical house (cells) — same API as §5 with `houseCells` parameter. |
| New garden | Board tints garden sides of houses without a garden. | OK. No note that it raises the cap to 5 and doubles price. | Hover badge on the house: "cap 3 → 5, price ×2". | have |
| Local manager restaurant | Same flow as setup; range 3 from an open restaurant is enforced by the engine but invisible. | Nothing shows the road range the engine used; "COMING SOON" consequence (opens at cleanup) is not stated. | Range overlay (same as campaigns) when the flow opens; ghost in scaffold style; hover shows reachable houses with distance. | add: `rangeOverlay(cardUid)`. |
| Regional manager move | `moveRestaurant` placements, ghost at the target (seen: "221 options", and "R or Rotate: 6 options here" at one spot = 3 restaurants × 2 entrances). | Which restaurant moves is encoded per placement, not chosen first; the origin is not highlighted; rotating in place is a different spot; `R` cycles restaurant *and* entrance in one list. | Two-step: tap the restaurant to move (ring it, `inspect`), then the board shows targets; rotate-in-place via the corner buttons on the staged ghost. | have (`spec.restaurantId` filter exists). |
| End turn | Confirm dialog counts unused cards (`Work.tsx:108`). | `confirm()` is a native dialog; it does not say which cards. | In-panel confirm listing the cards that can still act. | have |
| Undo | Button + ⌘Z. | Fine. | Keep. | — |

### 2.3 Automatic phases and feedback

| Flow | Current behaviour | Problem | Proposed interaction | Engine data |
| --- | --- | --- | --- | --- |
| Dinnertime | Engine resolves; `three/animate.ts:86-88` hops goods and coins; `ui/Summary.tsx:89-151` lists sales per house with "· 2 away". | While it plays, nothing on the board shows *which restaurants competed* for a house and why one won (price + distance). Houses that stay home only appear as a count. The summary card covers part of the board. | Per-house resolution caption on the board: ring the house, draw the winning route (restaurant → house along the road), show "$9 + 1 = $10" vs the loser's number as small badges; stayed-home houses get a grey "no seller" badge that persists until marketing. Summary card becomes a bottom strip with "step through houses" (uses `houseConsidered`, `sale`, `houseStayedHome`). | have (events). add: `sale.candidates: { player, unitPrice, distance }[]` so the losers' numbers can be shown (engine knows them in `houseConsidered`). |
| Payday | `PromptPanel.tsx:290-349`: cash, salaries, fire picker, one button. | Good. Fired-card consequences (lost unique) not stated. | Keep. | have |
| Marketing phase | Engine runs campaigns in number order; `animate.ts:80-85` pulses the campaign and drops tokens; Summary lists demand per house. | Order of campaigns is invisible; a campaign that reached nothing or hit full houses gives no feedback; tokens ticking down is a tiny pip change. | Caption "Campaign #11 (Bo): burgers → houses 5, 12" with the reach overlay flashed for that campaign; "house 7 full" badge; pip removal animated with a count label. | have (events + `campaignReach`). |
| Clean up / freezer | `FreezerPanel` steppers. | Only shown to players with a freezer. "Throw everything away" is the primary verb when nothing is kept, which reads as destructive. | Keep; relabel "Done (nothing frozen)". Show COMING SOON restaurants opening and campaigns expiring as board pulses. | have |
| Pending choices (forced fire, pay with tokens) | `ChoicePanel` `PromptPanel.tsx:400-486`. | Fine. | Keep. | have |
| Game over | `Standings` + modal. | Fine. Final board is hidden behind the modal. | Minimisable modal exists (`minimisedModal`); default to a top strip so the board stays visible. | have |
| Log | Text lines. | House/restaurant/campaign names are not clickable; the board cannot be asked "where is house 12". | Make ids in log lines focus the camera (`cameraCommand: focus`) and ring the piece. | have |
| Player rail hover | `PlayerPanels.tsx:238-328` static. | Architecture promises "highlight a player's restaurants when hovering their panel"; nothing calls `inspect`. | Hover/tap a panel → `inspect` all pieces of that player; tap a restaurant pip → focus. | have |

### 2.4 Ketchup placements

| Flow | Current behaviour | Problem | Proposed interaction | Engine data |
| --- | --- | --- | --- | --- |
| Coffee shop (training) | Training a barista triggers a `coffeeShop` pending choice; `ChoicePanel` → board tints 1×1 squares, ghost kiosk. | Range 2 from restaurants/coffee shops is invisible; "one per tile" is invisible without tile seams; move-instead-of-place (all 3 placed) is only a list string. | Tile-level tint (eligible tiles) plus square ghost; range overlay; when moving, first tap the shop to move. | have. add: `rangeOverlay`. |
| Lobbyist road | Placements carry `cells` + `arrows`; board tints 49 covered squares; ghost shows the road with cones. | The arrow direction (which road it connects to) is the whole point and is only visible on the ghost; roadworks consequence (+1 distance for everyone) is not shown. Rotations/lengths are separate spots. | Pick length (tile shape chips, from the placements' distinct `cells.length`/orientation), then board ghost with `R` to rotate and arrow glyphs; hover highlights the road squares that will get roadworks. | have (`arrows`). |
| Lobbyist park | Rect placements. | Park effect (×2/×3 price for adjacent houses) is not shown. | Hover badges on affected houses. | have |
| Extra map tile (First lobbyist) | `mapTile` placements: row/col/rotation(/templateId); ghost is a plain slab (`three/interaction.ts:586-591`). | Rotation and template are invisible on the ghost; the leftover tile choice is only in the list string. | Template picker (mini ASCII/SVG preview of each leftover tile from the catalog), then board ghost rendering the real roads/houses of the tile; `R` rotates. | have (`view.tilePool`, placements). add: tile templates in the client catalog (manifest `content.tiles`). |
| Freeway | Edge strip placements. | No link shown to the rural area it connects. | Ghost ramp + dotted link to the rural area; show rural demand on hover. | have |
| Rural giant billboard | Rural marketeer showed **"No action"** in the synthetic state; when legal, the placement is `rural` side N/E/S/W off-board. | No way to see which side is free; off-board pieces are cropped by the rail. | Four side targets drawn around the rural area; camera content rect includes the rural area with the rail not covering it. | have |
| Gourmet guide | `offBoard` placement, list-only (`Placement.tsx:20`). | A list item "beside the board" for a one-option action. | Auto-pick when there is one placement; show the guide stand on the rim as a staged ghost with Confirm. | have |
| Pizza radio / free mailbox | Pending choices → 1×1 board picks; free mailbox asks for a good first. | Same as campaigns: no reach preview. | Reach overlay on hover (radio 3×3 tiles, mailbox flood fill). | add: `campaignReach`. |
| Second campaign (campaign manager) | `secondCampaign` choice → campaign placement with the same kind/good/duration. | Nothing says it must match the first; the first tile is not highlighted. | Ring the first campaign; token picker limited to the same kind. | have (`choice.campaignId`). |

### 2.5 Cross-cutting

| Area | Current | Problem | Proposal |
| --- | --- | --- | --- |
| Mobile board | `.dock` fixed, `height: min(78vh, 680px)`, opens on `isMyTurn` (`ui/Table.tsx:53-59`); `PlacementFlow` lowers it (`Placement.tsx:58`) but the Table effect runs afterwards. | On a 390×844 phone the sheet covers the board the moment a pick starts; `hoverLegalSpot` found no canvas to hover; the player can only pick from the list. | Picking collapses the sheet to a 56 px strip with the instruction and Confirm/Rotate/Cancel, and the Table effect must not reopen it while `interactionMode.kind === 'place'`. Stage/confirm on tap already exists (`three/interaction.ts:335-342`). |
| Desktop layout | Rail overlaps the board's west columns and any off-board pieces (rural area, airplanes on the W edge, gourmet guides at the NW rim). | Pieces and ghosts hide under panels. | Pass a padding inset (rail width, dock width) to `cam.setContent` so `contentRect` fits the visible area. |
| Legality reasons | Illegal squares get a red cursor (`three/interaction.ts:310-313`); nothing says why. Engine rejections surface as toasts. | Players cannot learn the rule from the UI. | Hover an illegal square in place mode → label with the engine's reason. Needs `placementProblem(spec, candidate)` (§5). |
| Tile borders | Thin 0.025 inset between tile slabs (`three/board/ground.ts:69-90`), rim pegs at tile boundaries (`:66-67`), grid off by default. | Invisible in the tilted view, faint in top view (confirmed in screenshots). | §3.4. |
| Demand readability | Stacked tokens 0.2 high at y ≈ 1.95 above the house (`three/minis/tokens.ts:100-127`, `three/reconcile.ts:58`); a ×N badge beyond 5. | Goods are unreadable at default zoom; nothing says how many more the house can take. | §3.3. |

---

## 3. Specs for the four reported items

### 3.1 Buyer routes on the board

**Data.** Each `Placement { kind: 'buyerRoute' }` already has `route.from` (restaurant corner or coffee shop), `route.path: Cell[]` (road) or `route.tiles` (air), and `collects: { sourceId, count }[]` (`types/view.ts:46`). The engine de-duplicates routes by collected-source set (`rules/working/index.ts:252-258`), so the candidate list is "distinct hauls", which is exactly what the player wants to choose between. Add to the placement (WP1): `range` (borders allowed) and `bordersUsed`, and for air routes nothing more.

**Panel (ui/).** Replace the "Route of N steps" list with a **haul list**: one row per candidate, sorted by total drinks desc, showing drink chips with counts ("2× beer, 2× lemonade"), the start restaurant mark, and `bordersUsed/range`. The row is the fallback picker and also the keyboard focus for cycling. Errand boy keeps its three chips.

**Board (three/).** New `RouteLayer` in `OverlayGroup`:

- All candidates are drawn faintly (player colour at 25% alpha, 0.18 wide ribbon on the road centre, y = 0.05). The active candidate (hovered row, or cycled with `[`/`]`, Tab, or swipe on the hint strip) is drawn solid with a chevron pattern animated along the travel direction, plus a start marker at the entrance corner.
- Each collected source gets a floating chip (CSS2D or badge sprite) "+2 🍺" in the player colour; non-collected sources on the path get no chip.
- Tile borders the route crosses get a short perpendicular tick on the seam with the running count (1, 2, 3), which teaches the range rule.
- Air routes: the tiles are tinted in order with a dashed arc from tile centre to tile centre and the zeppelin ghost at the end; sources on entered tiles get chips.
- Hover over a ribbon on the board selects that candidate (hit-test the ribbon meshes, nearest first); click/tap stages it; Confirm commits. Esc/Cancel as today.
- When two candidates share most of their path, the active one is drawn last and 2× wider so it reads on top.

**Selection model.** `interactionMode` gains `{ kind: 'route', placements, label, color }` handled by `three/interaction.ts` (new branch) and mirrored into `state/interaction.ts` as `activeCandidate: signal<number>` so panel rows and board ribbons stay in sync. Keyboard: `[`/`]` cycle, Enter confirm, Esc cancel.

**Acceptance.** With the synthetic "cart operator at (8,3)" state, hovering row 1 draws a ribbon that leaves the NW corner, chips appear on two sources, and the committed action equals the hovered placement object. On phone the strip shows "Haul 2 of 5 · 2 beer, 2 lemonade" with ◀ ▶ buttons.

### 3.2 Campaign token picker, rotating ghost, range overlay

**Order of choices.** Marketeer card → **token** (number + size + kind) → good → duration → place on board with rotation → confirm. Good/duration stay in the panel and can be changed while the ghost is staged (they do not affect legality, `actionFromPlacement` reads them at commit, `state/actions.ts:30-42`).

**Token picker (ui/).** A row of tile cards built from the catalog's `marketingTiles` filtered by `view.marketingTiles` (available numbers) and the card's allowed kinds. Each card shows the number, a footprint glyph (3×2, 2×2, 3×1, 2×1, 1×1, airplane 1/3/5 wide, radio 1×1), kind icon, and a "0 legal spots" dimmed state. Duration max comes from the card ability (`maxDuration`); eternal flag shown when the player has the eternal milestone. The picker is also where the engine's "no legal spot for #11" reason is shown.

**Legal placements per token.** Call `legalPlacements({ kind: 'campaign', cardUid, campaignKind, tileNumber })` (the `tileNumber` filter already exists, `rules/working/index.ts:278`). The 3D layer groups the result by **anchor square and orientation**: spot key = `(x, y, tileNumber)`; variants = orientations (w×h vs h×w) at that anchor. `R`/Rotate cycles orientation only. For airplanes the spot key is `(side, offset)` and there is one variant; for rural giant billboards the four sides.

**Ghost.** The real mini from `three/minis/marketing.ts` (billboard, mailbox, radio, airplane) at 55% alpha in the player colour with the number badge, as today, plus:

- a footprint outline on the ground showing w×h squares and the square that must touch a road (door-side marker);
- an orientation handle: a small curved arrow at the corner; clicking it rotates (touch-friendly, no keyboard needed);
- **reach overlay**: houses the campaign would reach get a pulsing ring and a "+1 🍔" chip (billboard: adjacent houses; mailbox: the flood-fill region tinted; airplane: the covered rows/columns as a translucent band across the whole board; radio: the 3×3 tile block tinted). Houses at cap show a grey "full" chip. Computed by WP1's `campaignReach(view, candidatePlacement)`.

**Range overlay (road-range marketeers, local manager, lobbyists, coffee shop placement).** When the flow opens, before any hover: road squares within range are drawn with the player colour at three alpha levels by distance (0, 1, 2/3 borders), the entrance corner(s) used get a start marker, and tiles outside range are dimmed 15%. Legal campaign squares are tinted only where they touch an in-range road. This replaces the whole-board yellow tint. Source: WP1 `rangeOverlay(cardUid, from?)` → `{ roads: { x, y, distance }[], starts: RouteStart[], range }` built from `distanceField` (`map/pathfinding.ts:160`).

**Fallback list.** Rows become "Tile #11 · 3×2 at 10,3 (landscape)", grouped under the chosen token; no 60-row cap, virtualised.

**Acceptance.** Brand director: picker shows #4/#5/#6 airplanes, #1–3 radios, #7–10 mailboxes, #11/#13/#14 billboards with sizes; choosing #13 and hovering (10,3) shows a 3×1 ghost, `R` turns it into 1×3 at the same anchor, the two houses adjacent to it ring up with burger chips; placing commits `tileNumber: 13, placement: { x: 10, y: 3, w: 1, h: 3 }`. Campaign manager: the overlay shows roads at distance ≤ 3 from the entrance only.

### 3.3 House demand: roof badge, inspect panel, selection model

**Roof badge (three/).** Replace the floating stack as the primary signal with a **roof plaque** on every house/apartment/rural area: a flat CSS2D-free sprite board (canvas texture, cached by content as in `three/labels.ts`) lying on the roof slope facing the camera tilt, showing:

- up to 5 good glyphs in a row (the same icons as `drawFood`), ordered by good, each with a small count when >1 ("🍔×2 🍺");
- a capacity rail underneath: N filled pips of `capacity` (3, 5 with garden, ∞ for apartments/rural shown as a bar without pips), so "room left" is readable;
- the house number stays on its own plaque (`buildHouse`, `three/minis/buildings.ts:102-105`).
The token stack stays as the animation target for drops and sales (keep `buildDemandStack`), scaled down 30% and placed behind the plaque so it reads as "stock" rather than the primary readout. Badge size ≈ 1.1 units wide; legible at phone size with 2+ goods.

Colour: plaque background `surface`, pips in `ink`/`line`, good glyphs full colour; a house that is **full** gets a thin `warn` border; a house with demand and **no road-connected seller** (from the last dinnertime `houseStayedHome`) gets a grey "no seller" dot until marketing runs.

**Inspect panel (ui/).** Tap/click a house in idle mode (object pick already emitted by `three/interaction.ts:344-346`) → `inspect` signal `{ kind: 'house', id }` → a floating **Inspect card** anchored to the dock (desktop: top of the dock; phone: a 1-row strip above the sheet handle) with:

- house number, kind (printed / new / apartment / rural), garden yes/no, capacity and current demand as chips;
- **who can sell**: every chain with a road connection, their unit price + distance = total, sorted as dinnertime would (uses WP1 `houseOutlook(houseId)`), with "cannot supply 🍺" flags against stock;
- **who reaches it**: campaigns whose reach includes this house (number, owner, good, turns left);
- buttons: Focus camera, Close. Esc closes.
Clicking a restaurant shows the mirror card (owner, status, drive-in, entrance, houses in range with distances, routes available). Clicking a campaign shows reach and remaining pips; clicking a source shows which routes could collect it.

**Selection model (state/).** One signal `selection: signal<{ kind: 'house' | 'restaurant' | 'campaign' | 'source' | 'entity'; id: string } | null>` in `state/interaction.ts`. Rules: setting it rings the piece (`highlight([id])`) and rings related pieces faintly (sellers' restaurants, reaching campaigns); entering a `place`/`route` mode clears it; picking an object while placing is ignored (placement wins); Esc clears. Hovering a rail panel sets a transient `inspectIds` (player's pieces) without touching `selection`. Log entries and summary rows set `selection` on click.

**Acceptance.** Dinnertime fixture at default camera on a 390 px phone: every house with demand shows readable good glyphs and pips; tapping house 5 shows "cap 5 (garden), demand 🍺🍔🍕🍔🍋 (full)", sellers "Ada $9+2=$11, Bo $10+0=$10 ← wins", campaigns "#11 Bo burgers (∞)".

### 3.4 Tile borders

Three layers, all driven from `board.tiles` (`three/board/ground.ts`), consistent with `visual-style.md` (tileEdge `#cbbd9c`, tiles as separate slabs):

1. **Ground gap + kerb.** Widen the inset between tile slabs from 0.025 to **0.12 units** (a visible 12 cm groove), with the slab side face in `shade(grass, -0.25)` as now and the gap floor in `tileEdge`. Each slab gets a 0.06-high chamfered lip so the tilted camera sees a light edge on the near side and a shadow on the far side. This alone makes tiles read as separate wooden pieces in the tilted view.
2. **Seam line (shader).** A `ShaderMaterial`/`onBeforeCompile` on the ground mesh draws a 0.05-wide line in `shade(tileEdge, -0.3)` at every multiple of 5 in world x/z, anti-aliased with `fwidth`, visible at any zoom and not dependent on geometry. The existing optional square grid (`ground.ts:99-111`) stays available but off by default; the tile seam is always on. In top view the seam darkens to 0.09 wide.
3. **Roads across seams.** Road asphalt gets a short lighter band (0.3 long, `shade(road, 0.18)`) centred on each tile crossing, and the centre dash is interrupted there (`three/board/roads.ts:85` places dashes per link; skip the dash whose centre lies on a seam). This is the cue players use when counting borders along a route, and the route overlay's tick marks (§3.1) sit on the same spot.

Rim pegs at tile boundaries (`ground.ts:66-67`) stay; add a small tile coordinate label (A1…) on the rim in top view for table talk and for the fallback list ("Tile #13 at 10,3 (tile B3)").

Accessibility: seam contrast ≥ 3:1 against grass; also expose a "high-contrast tiles" toggle in Settings that doubles the seam width and adds a checkerboard 4% tint per tile.

---

## 4. Engine/view additions needed (summary)

All are pure functions over `GameState`/`GameView` in `packages/engine` and run on the client through `pseudoState` like `legalPlacements` does (`state/guidance.ts:300-305`), so hot-seat and online behave the same.

| Addition | Where | Used by |
| --- | --- | --- |
| `Placement.buyerRoute.range`, `.bordersUsed` | `types/view.ts`, `rules/working/index.ts:248-271` | §3.1 haul rows |
| `campaignReach(state, placement, kind) → HouseId[]` and `houseCellsReach(state, cells)` | export from `map/reach.ts:36-110` through `index.ts` | §3.2 reach overlay, marketing captions, house inspect |
| `rangeOverlay(state, player, cardUid, from?) → { roads: {x,y,distance}[], starts, range }` | wrap `rangeField` (`rules/working/campaigns.ts:36`) and `distanceField` | §3.2, local manager, lobbyists, coffee shop |
| `houseOutlook(state, houseId) → { capacity, sellers: { player, restaurantId, unitPrice, distance, canSupply }[], campaigns: CampaignId[] }` | new `rules/outlook.ts` using `chainHouseDistance` (`map/pathfinding.ts:237`), pricing (`rules/pricing.ts`), `baseDemandCapacity` (`rules/marketing.ts:49`) + `demandCapacity` pipeline | §3.3 inspect card, roof pips |
| `placementProblem(state, player, spec, candidate) → string \| null` | thin wrapper over the existing `*PlacementProblem` functions | legality reasons on hover |
| `sale.candidates` on the `sale` event (and `houseConsidered.offers`) | `types/events.ts:103-112`, `rules/dinnertime.ts` | dinnertime captions |
| `LegalAction` `disabledReason` for cards with no legal action | `rules/working/index.ts` | work overview |
| Client catalog indexes `content.marketingTiles` and `content.tiles` from the manifest | `state/catalog.ts` (client, not engine) | token picker, map tile picker |

Nothing here changes rules or actions; `PlacementSpec.tileNumber` and `restaurantId` filters already exist.

---

## 5. Work packages

Ordered by dependency. Each owns a disjoint set of files; interfaces between packages are the signals in `state/interaction.ts`, the `InteractionMode` union in `state/boardBridge.ts`, and the engine exports in `packages/engine/src/index.ts`. One engineer agent each.

### WP1 — Engine view additions (`packages/engine`)

Files: `src/types/view.ts`, `src/types/events.ts`, `src/index.ts`, `src/map/reach.ts`, `src/rules/working/index.ts`, new `src/rules/outlook.ts`, `src/rules/dinnertime.ts`, tests under `src/**/__tests__`.
Deliver the table in §4. Acceptance:

- `engine.campaignReach`, `engine.rangeOverlay`, `engine.houseOutlook`, `engine.placementProblem` exported and typed on `EngineApi`; module hooks respected (giant billboard, gourmet guide reach via the `campaignReach` pipeline; coffee shops as range starts).
- `buyerRoute` placements carry `range` and `bordersUsed`; `sale` events carry `candidates`.
- Unit tests: billboard/mailbox/airplane/radio reach on the dinnertime fixture; range overlay distances match `marketingRangeProblem`; `houseOutlook` ranking equals the dinnertime winner on the fixture; no change to any existing test.
- `npm run lint && npm test` green; `docs/architecture.md §3` updated with the new API lines.

### WP2 — Board foundations: tiles, demand badges, overlay layer, layout inset (`packages/client/src/three`)

Files: `three/board/ground.ts`, `three/board/roads.ts`, `three/minis/tokens.ts`, `three/minis/buildings.ts`, `three/labels.ts`, `three/reconcile.ts`, `three/layout.ts` (`contentRect` inset), `three/camera.ts` (`setContent` padding), new `three/overlays/{ranges,reach,badges}.ts`, `three/scene.ts` (OverlayGroup sub-groups). Depends on nothing (uses only `GameView`); WP4 feeds it data later.
Acceptance:

- §3.4 seams visible in tilted and top view at 390 px (screenshot in `three-playground` for `dinnertime` and `ketchup`), roads interrupted at seams, high-contrast toggle wired to a signal.
- §3.3 roof plaques on every house kind with glyphs, counts and capacity pips (capacity passed in by the reconciler from `houseOutlook` when available, else 3/5/∞ derived locally); token stack reduced and kept as the animation target; `animate.ts` still passes its tests.
- Reusable overlay primitives: `drawRangeOverlay(data)`, `drawReach(houseIds, good, full[])`, `drawRouteRibbons(candidates, activeIdx)`, `clearOverlays(kind)`; a playground button exercises each with fixture data.
- Camera content rect accepts an inset `{ left, right, top, bottom }` in CSS px; rail and dock never cover pieces at 1280×860.

### WP3 — Interaction model: route mode, token-anchored campaign spots, selection, mobile sheet contract (`packages/client/src/state` + `three/interaction.ts`)

Files: `state/interaction.ts`, `state/boardBridge.ts`, `state/actions.ts`, `state/guidance.ts`, `three/interaction.ts`. Depends on WP1 (data) and WP2 (overlay primitives).
Acceptance:

- `InteractionMode` gains `route` and `campaign` variants (`{ kind: 'campaign', tileNumber, placements, ... }`), spot keys for campaigns are `(x, y, tileNumber)` with orientation variants, `R`/rotate cycles orientation only; airplanes/rural keyed by side/offset.
- `selection`, `activeCandidate`, `inspectIds`, `placementReason` signals exist with the rules in §3.3; object picks in idle mode set `selection`; place/route mode clears it; hovering an illegal square publishes the engine reason.
- Route mode: ribbons drawn via WP2, hover/tap selects a candidate, Enter/Confirm commits the exact `Placement` object; `[`/`]` cycle.
- Campaign ghost shows footprint outline, rotate handle, reach overlay (WP1 `campaignReach`), and the range overlay is drawn on mode entry.
- The board publishes `data-legal-spots` as before so e2e keeps working; `pendingPlacement`/confirm flow unchanged for touch.

### WP4 — Turn-panel flows: token picker, haul list, pickers for hire/train, inspect card, mobile sheet (`packages/client/src/ui` + `state/catalog.ts`)

Files: `ui/Placement.tsx` (split into `ui/flows/{Campaign,Route,House,Restaurant,MapTile}.tsx`), `ui/Work.tsx`, `ui/PromptPanel.tsx`, new `ui/Inspect.tsx`, `ui/BoardControls.tsx`, `ui/Table.tsx`, `ui/PlayerPanels.tsx`, `ui/Log.tsx`, `styles/main.css`, `state/catalog.ts` (marketing tiles + map tiles in the catalog). Depends on WP3's signals.
Acceptance:

- Campaign flow order per §3.2; token cards show number/size/kind; dimmed tokens show the engine reason; good/duration editable while staged; fallback list grouped and uncapped.
- Route flow shows haul rows with drink chips, start mark and borders used; rows and board ribbons stay in sync both ways.
- Hire and train always use the card-grid pickers; "No action" cards show the reason.
- New house flow offers the tile number first; regional move is two-step (pick restaurant, then target).
- Inspect card for house/restaurant/campaign/source/entity per §3.3; rail hover rings the player's pieces; log ids focus the camera.
- Phone: entering any place/route mode collapses the sheet to a 56 px strip with instruction + Rotate/Confirm/Cancel; `Table.tsx` no longer reopens the sheet while a board mode is active; hover hint follows the pointer on desktop.
- Playwright e2e still passes with `placementList: true` (list fallback preserved).

### WP5 — Phase feedback: dinnertime and marketing captions, Ketchup placement polish (`three/animate.ts`, `ui/Summary.tsx`, Ketchup flows)

Files: `three/animate.ts`, `three/minis/ketchup.ts`, `three/minis/marketing.ts`, `ui/Summary.tsx`, `ui/flows/{Ketchup*}.tsx`, `state/log.ts`. Depends on WP1 (events, reach) and WP2/3 (overlays, selection).
Acceptance:

- Dinnertime: per-house caption with the winning route drawn, price+distance badges for every candidate, stayed-home badge persists; summary becomes a step-through strip that selects houses on the board.
- Marketing: campaign order caption, reach flash per campaign, "full" chips, pip tick animation with count.
- Ketchup: lobbyist road length picker + rotating ghost with arrow glyphs and roadworks preview; map tile template picker with real tile ghost; rural billboard side targets; freeway link; gourmet guide auto-stage; coffee shop move-first flow.
- Reduced motion respected; nothing blocks input > 1.5 s.

### WP6 — Verification and docs (`e2e/`, `docs/`)

Files: `e2e/*.spec.ts`, `e2e/helpers.ts`, `docs/visual-style.md`, `docs/architecture.md §5`. Depends on WP2–WP5.
Acceptance:

- New e2e: route pick via board ribbon (not list) on the synthetic cart-operator state; campaign token picker + rotation; house inspect card content; phone viewport placement with the sheet collapsed.
- `docs/visual-style.md` gains the seam, roof plaque and overlay styles (colours, widths, alphas); `architecture.md §5.2` documents the new modes and signals.

---

## 6. Evidence index

Screenshots used for this audit (not committed): `scratchpad/shots/` — `desk-*` hot-seat rounds 1–4, `mob-*` phone pass, `w-*` synthetic working state (routes, every campaign kind, houses, restaurants, idle click), `k-*` Ketchup fixture and flows, `k-40-playground-*` fixtures. Key confirmations:

- Routes: list items "Route of 9/6/2/11/1 steps", `data-legal-spots=0` for cart, truck and zeppelin.
- Campaigns: 262–288 "options", hover at (0,0) gives tile #14 2×1 with `variants: 1` (`R` does nothing); mailbox at (0,0) `variants: 2` and `R` switches #7 → #8, not orientation; airplane edge strip tinted as a whole band, ghost hidden under the player rail.
- Demand: stacks on houses 5 and 12 unreadable at default zoom; no capacity cue. In top view (the view players use to count) a stack shows only its top token, so a 5-token house reads as one good (`w-64-top-view-zoomed`).
- Tiles: seams invisible in the tilted view, faint in top view.
- Phone: sheet open over the board during the first-restaurant pick; no hoverable canvas found.
- Idle board clicks and `boardHover` have no consumer in `ui/` (grep).
- Houses: "62 options", ghost for house #1 at (3,0) rendered under the player rail; `houseOrder` always 1 (first available), never offered.
- Hire: clicking "CEO: hire Waitress" commits immediately (engine `ready` action); the card-grid `HirePicker` never appears in a real game.
- Lobbyist road: 49 spots, each orientation/length its own spot (`variants: 1`); the 2-square ghost at (16,1) is barely visible and the hint "Road over 2 squares" sits at the bottom of the board.
- Ketchup synthetic state: Rural Marketeer, Gourmet Food Critic and Trainer (barista trainee on the beach) all show "No action" with no reason.
- Pending freeway choice: 28 edge strips tinted as long translucent bands that run across the whole board; no link to the rural area.
- Extra map tile choice: "104 options" (13 spots), the surround is tinted as a sea of 5×5 orange squares with no template preview, no rotation cue, and no indication of the airplane/freeway adjacency rule; one spot has `variants: 8` (2 leftover templates × 4 rotations) cycled blind with `R` on a featureless slab ghost.
- Idle click on house `house-30` in the working state: no panel, no ring, no camera move (screenshot `w-61-idle-click-house`).

---

## 7. Signals for WP4

Built by WP3. The UI uses only these (ui/ never imports three/). Files: `state/boardBridge.ts` (B), `state/interaction.ts` (I), `state/guidance.ts` (G), `state/actions.ts` (A), `state/boardOverlays.ts` (O).

### Entering a board mode

| Name | Type | Use |
| --- | --- | --- |
| `boardModeFor` (G) | `(legal: PlacementLegal, placements: Placement[], opts: { color: string; label?: string; tileNumber?: number \| null }) => InteractionMode` | Build the mode for a placement action: buyer routes (road/air) → `route`; campaigns → `campaign` (narrowed to `tileNumber`, the token picked); else `place`. Carries `spec`, which turns on the range overlay and illegal-square reasons. Pass the result to `boardBridge.setInteractionMode`. |
| `InteractionMode` (B) | `idle` \| `place { placementKind, placements, label, color, spec? }` \| `campaign { tileNumber: number \| null, placements, label, color, spec? }` \| `route { placements, label, color, spec? }` \| `inspect { ids }` | `setInteractionMode({ kind: 'idle' })` ends picking. Entering place/campaign/route clears `selection`. |
| `isPickMode` (B) | `(m: InteractionMode) => boolean` | True for place / campaign / route (show the strip, collapse the sheet). |
| `interactionMode` (B) | `Signal<InteractionMode>` | Current mode (BoardControls today checks `kind === 'place'`; widen to `isPickMode`). |
| `boardBridge.onPick` (B) | `(l: (p: BoardPick) => void) => () => void` | `BoardPick = { kind: 'placement'; placement } \| { kind: 'cancel' } \| { kind: 'object'; id; objectKind? }`. The placement is the exact object from `mode.placements`; build the action with `actionFromPlacement`. |
| `placementsFor` (G) | `(view, me, spec, manifest, catalog) => Placement[]` | Legal placements (unchanged). |
| `placementsByToken` (G) | `(placements: Placement[]) => Map<number, CampaignPlacementT[]>` | Token picker: legal spot count per tile number (0 / missing = dim the token). |
| `orientationOf` (G) | `(p: Placement) => 'landscape' \| 'portrait' \| 'square' \| null` | Fallback list rows and the strip text. |
| `isBoardRoute` (G) | `(p: Placement) => p is RoutePlacementT` | Errand fetches stay chips; road/air routes go to route mode. |

### Candidate, staging and confirm

| Name | Type | Use |
| --- | --- | --- |
| `activeCandidate` (I) | `Signal<number>` | Index into `mode.placements` shown as active: route = the solid ribbon (starts at 0), campaign = the ghost (-1 = none). The board writes it on hover and `[` / `]`. Highlight the matching haul / list row. |
| `setActiveCandidate(i)` (I) | `(i: number) => void` | Row hover / tap: the board shows that ribbon or ghost (and moves the staged pick if one is staged). |
| `cycleCandidate(by)` (I) | `(by: -1 \| 1) => void` | ◀ ▶ on the phone strip ("Haul 2 of 5"). Same as `[` / `]`. |
| `pendingPlacement` (I) | `Signal<Placement \| null>` | Staged pick (click in route/campaign mode, tap anywhere). Show the confirm strip while non-null. |
| `pendingVariants` (I) | `Signal<number>` | Variants at the staged spot (> 1: show Rotate). |
| `hoverPlacement` (I) | `Signal<{ placement; variants } \| null>` | Placement under the pointer (route: the active candidate). Hint text. |
| `confirmPlacement()` (I) | `() => void` | Confirm button. Commits the staged pick; in route mode the active candidate if nothing is staged. |
| `rotatePlacement()` (I) | `() => void` | Rotate button. Campaign: flips orientation only (sticky across spots). |
| `ghostOrientation` (I) | `Signal<'landscape' \| 'portrait' \| 'square' \| null>` | Campaign mode orientation ("3×1 landscape"); null outside campaign modes. |
| `previewGood` (I) | `Signal<FoodId \| null>` | Set when the player picks the campaign good; reach chips show it. Changeable while staged. |
| `placementReason` (I) | `Signal<string \| null>` | Engine `placementProblem` for the square under the pointer when it is not a legal spot (place / campaign modes with `spec`). Show next to the pointer / in the strip. |
| `emitPick({ kind: 'cancel' })` (B) | | Cancel button (as today). Esc on the board does the same when nothing is staged. |

Keyboard (handled by the board): `[` / `]` cycle, `R` rotate, Enter commit, Esc unstage → cancel; Esc in idle clears the selection.

### Selection and inspect

| Name | Type | Use |
| --- | --- | --- |
| `selection` (I) | `Signal<{ kind: 'house' \| 'restaurant' \| 'campaign' \| 'source' \| 'entity'; id: string } \| null>` | Set by idle-mode board clicks (gardens select their house); cleared by pick modes, Esc, a click on empty ground, or the piece disappearing. Drives the Inspect card. Log ids / summary rows call `select(...)`. |
| `select(s)` (I) | `(s: Selection \| null) => void` | Set or clear the selection from the UI. |
| `selectedOutlook` (I) | `Signal<HouseOutlook \| null>` | For a selected house: capacity, demand, sellers ranked as dinnertime (`unitPrice`, `distance`, `score`, `canSupply`), `winner`, reaching `campaigns`. |
| `selectionRelated` (I) | `Signal<readonly string[]>` | Pieces ringed faintly with the selection (house: sellers' restaurants + reaching campaigns; campaign: reached houses). |
| `inspectIds` (I) | `Signal<readonly string[]>` | Transient rings (rail panel hover = the player's pieces). Does not touch `selection`. |
| `cameraCommand` (I) | `Signal<CameraCommand \| null>` | `{ kind: 'focus', ids }` for the Inspect card's Focus button and log links. |
| `outlookFor`, `campaignReachIds`, `reachPreview` (G) | `(view, me, id) => …` | Extra Inspect data (restaurant / campaign cards). |

### Descriptions and overlays

| Name | Type | Use |
| --- | --- | --- |
| `describePlacement(p, view)` (A) | `string` | Rows: "Tile #13 · 3×1 at 10,3 (landscape)", routes "6 beer, 3 lemonade · 2/2 borders". |
| `haulDrinks(p, view)` / `describeHaul(p, view)` (A) | `{ drink; count }[]` / `string` | Haul rows: drink chips sorted by count, `bordersUsed/range`. |
| `rangeOverlay`, `reachOverlay`, `routeOverlay` (O) | signals | Written by the board controller (boardBridge.ts) from the mode; the UI does not need to write them. |
| `houseBoardInfo` (O) | `Signal<Record<HouseId, { capacity?; noSeller? }>>` | Fed from `houseOutlook` on every view and from the last dinnertime's `houseStayedHome`. Read-only for the UI. |
| `LegalAction.disabledReason` (engine) | `string?` | "No action" reason on a card's `work.skip` entry. |

Test hook: `window.__fcmBoard` (the scene handle) has `project(x, z, y?) → { x, y }` client px and `routeAt(clientX, clientY)`, so e2e (WP6) can hover and click ribbons, ghosts and houses.
