# Code Audit vs Rules Spec

Scope: `constants.js`, `engine.js`, `map.js` (as of this audit). Rule references point to `base.md`, `employees.md`, `milestones.md`, `map.md`. A few related problems in `ui.js` / `main.js` are listed at the end because the engine depends on them.

**Revision 2026-10-01:** rules re-based on the Deluxe rulebooks (see `CHANGES.md`). Findings changed by that are marked **[rev]**.

Severity: **S1** breaks core play / wrong game. **S2** wrong result in common situations. **S3** edge case or minor.

## Top 10 (most serious)

| # | Sev | Location | Code does | Rule |
|---|---|---|---|---|
| 1 | S1 | constants.js:155–269 | Career tree is invented: no Vice President card; management trainee trains into pricing/discount/CFO/local manager; recruiting girl → recruiting manager → HR director; trainer → coach → guru; local → regional manager. | Tree is MT → {NBD, Luxuries, JVP}; JVP → {VP, Local, Discount, Recruiting Mgr, Coach}; VP → {SVP, Regional, Guru}; SVP → {EVP, CFO, HR Director}. Recruiting girl, trainer, waitress, pricing manager cannot be trained. Vice President (4 slots, 6 copies) exists. (`employees.md` §1) |
| 2 | S1 | map.js:445–474 (`roadDistance`), engine.js:841–854, map.js:557–602 | Distance and range count road **squares** stepped. | Distance/range = number of **tile borders crossed** along roads; 0 within a tile. (`base.md` §14) |
| 3 | S1 | map.js:7–228, 247–305, 292–375; constants.js:327–334 | 20 invented tiles; houses are single cells numbered 1..n in generation order; no gardens on map; no bridges; `ensureRoadConnectivity` adds road squares at tile borders. | Use the 20 official tiles (`map.md` §4): 2x2 houses with fixed numbers (2,4,5,7,8,10,12,13,15,16,18), 13 drink sources, 2 bridges. Never add roads. **[rev]** Cross-tile links: any orthogonally adjacent road squares connect (DLX), not only edge midpoints; bridges still don't connect. |
| 4 | S1 | engine.js:1215, 1219, 1263–1268 | Milestone has one `owner`; first claimant locks all copies immediately. | Every player meeting the condition in the same turn gets it; unclaimed copies are removed in phase 7. (`milestones.md` general rule 2–3) |
| 5 | S1 | engine.js:497–521, 590–597; constants.js:242, 248 | Recruiting manager / HR director give one recruit action; `recruits` field unused; a skip adds only one $5 discount. | Recruiting manager = 2 actions, HR director = 4. Each unused action = $5 discount. (`base.md` §6.2) |
| 6 | S1 | engine.js:523–541, 604–619 | Any training card may train any number of steps (`canTrainThrough`); `trainActions` unused; target supply not checked or decremented; old card not returned to supply; no 1x ownership check; successful train never advances `workingStep`. | Trainer 1 step; coach 2 actions; guru 3; no stacking without milestone; final card must be in supply; old card returns; max one copy of each 1x card; no CFO after "First to have $100". (`base.md` §6.3) |
| 7 | S1 | constants.js:338–339 | 3p map 4x4; 4p map 4x5. | 3p 3x4; 4p 4x4. (`base.md` §2.1) |
| 8 | S2 | engine.js:387–390 | Working order: place_house, pricing, cfo, recruit, train, campaign, produce, buy_drink, place_restaurant. | Strict order: hire → train → **open drive-ins [rev]** → marketing → food & drinks → houses/gardens → restaurants. (`base.md` §6.1) |
| 9 | S2 | constants.js:283–284; engine.js:956–967, 1033 | "First billboard" only makes campaigns permanent; applies to **all** of the owner's campaigns, including ones placed before the milestone; marketeer salaries still charged. | Also waives salaries of campaign manager, brand manager, brand director. Eternal only for campaigns placed from the milestone onward (including the triggering billboard). (`milestones.md`) |
| 10 | S2 | engine.js:791, 895–903, 909 | Intro mode: first break does not end the game. Second break: players receive only what the bank holds. Bank at exactly $0 triggers a break (and may double-trigger after `payFromBank`). | Intro: game ends at first break. Second break: pay all income (IOUs), game ends after phase 4. **[rev]** Break = bank reaches $0 (DLX p28), so the $0 trigger itself is correct; only the possible double-trigger remains a bug. (`base.md` §12–13) |

## constants.js

| Line | Sev | Code | Rule |
|---|---|---|---|
| 89–99, 121–126, 147–151, 175–179, 195–199, 203–207, 225–230, 245–250, 265–270 | S2 | 1x cards have `supply: 3`, used for every player count (engine.js:53–55). Luxuries manager has `supply: 6` and no 1x flag. | 1x copies in play: 1 (2–3p), 2 (4p), 3 (5p). Luxuries manager is 1x with 3 in box. |
| 147–151 | S2 | Brand director `maxDuration: 4`. | 5. |
| 155–161 | S1 | Management trainee `supply: 12`. | 18. |
| 163–167 | S1 | Junior VP `supply: 6`, `trainsTo: [senior_vp, coach]`. | 12 copies; trains to VP, local, discount, recruiting manager, coach. |
| 169–173 | S1 | Senior VP from junior VP; trains only to EVP. | From VP; trains to EVP, CFO, HR director. |
| (missing) | S1 | No `vice_president`. | VP: 4 slots, salary, 6 copies. |
| 183–187 | S1 | Pricing manager not entry level, salary 5, 6 copies, from MT. | Entry level, no salary, 12 copies, untrainable. |
| 189–193 | S2 | Discount manager from MT. | From JVP. |
| 203–207 | S2 | CFO from MT. | From SVP. |
| 219–230 | S2 | Local manager from MT, trains to regional; regional from local. | Local from JVP, no career; regional from VP. |
| 233–250 | S1 | Recruiting girl → recruiting manager → HR director. | Recruiting girl untrainable; recruiting manager from JVP; HR director from SVP. |
| 253–270 | S1 | Trainer → coach → guru. | Trainer untrainable; coach from JVP; guru from VP. |
| 285–286 | — | `first_train` OK. | — |
| 295–296 | — | `first_errand_boy` OK. | — |
| 305–308 | S2 | Two milestones `first_throw_food` and `first_throw_drink`. | One milestone, "First to throw away drink/food". 18 milestones total, not 19. |
| 282–321 | S2 | `trigger` strings shared one-to-one with owner model. | See audit item 4. |
| 327–334 | S1 | `CELL` has no garden, bridge, apartment/park, or per-tile exit data; houses one cell. | Houses 2x2 (+2x1 garden); bridges need directional road links. |
| 336–341 | S1 | See top-10 #7. | — |

## engine.js

| Line | Sev | Code | Rule |
|---|---|---|---|
| 16–20, 86–88 | S2 | Initial turn order = player index order. | Shuffle markers: random initial order. |
| 161–186 (18) | S2 | No pass in initial placement; `setupPassedPlayers` unused; no second round. | Reverse order with optional pass; second round in turn order for passers. |
| 188–206 | S3 | Reserve choice is sequential and visible in hot-seat. | Secret, simultaneous (UI concern). |
| 227–289 | S2 | Validates only CEO slot count. No check of manager capacity, managers placed under managers, busy marketeers placed, duplicates. Overfill only detected on CEO slots. | Managers only in CEO slots; manager slots hold non-managers up to capacity; busy marketeers never placed; any overfill → whole structure to beach except CEO. |
| 337–375 | S2 | Turn order auto-sorted by open slots. | Players with most open slots **choose** any free position, in that order (ties: previous order). |
| 384 | — | CEO hire OK (optional with skip). | — |
| 439, 501 | S3 | Hire requires `supply > 0`. | May hire from an empty pile if trained up immediately this turn. |
| 458–477 | — | Production OK (all or nothing). | — |
| 479–488 | — | Errand boy +1 with milestone OK. | — |
| 621–660 | S1 | Buyers: picks the "best" result of an area flood fill; collects every source reachable in any branch; range in squares; zeppelin explores an area. | One route, no immediate reversal (revisits allowed), tile-border range, collect each supplier adjacent to traversed road once; zeppelin = path of ≤ range+1 distinct tiles incl. start tile. Must take all passed sources. **[rev]** Full range not required (DLX). |
| 662–698 | S3 | Drive-in corner keeps only the first adjacent road found (`break`). | An entrance may touch two roads (e.g., at a bridge); either may be used. |
| 723–757 | S1 | Distance via `roadDistance` from the house's single cell. Garden not used for connection. | Start at any road adjacent to any house or garden square; distance in tile borders. |
| 772 | S3 | CFO bonus only if earnings > 0. | Applies to all income, including negative (JD 1473813). |
| 779–781, 890–903 | S3 | Income paid per player after all houses. | Bank break is checked as payments happen. Order matters only for when reserves arrive; total unchanged. |
| 786–787 | — | $20/$100 checks OK for base. | — |
| 838 | S2 | `Math.max(1, price)`. | No minimum. Price may be ≤ $0; chain pays the bank; bankruptcy if it can't. |
| 860–888 | — | Garden doubling and per-item bonuses OK. | — |
| 909 | S2 | See top-10 #10 (intro). | — |
| 928–934 | — | CEO slot tie → highest OK. | — |
| 956–1004 | S2 | No voluntary firing step; auto-fires on shortfall; busy marketeers never fireable; if still short after firing, pays nothing (998–1001); no billboard salary waiver. | Players fire first (**[rev]** simultaneously, DLX p29). Salary for all salaried cards incl. busy marketeers (except under First Billboard). Must fire until payable; a busy marketeer may be fired only after all others. Always pay what is owed. |
| 1006–1017 | S3 | `fireEmployee` does not remove the card from `structure` or `busyMarketeers`. | A fired busy marketeer's campaign stays; the card leaves the player. |
| 1029 | S2 | Run order by `campaign.number`, which ui.js:900 sets as a placement counter. | Run by printed tile number: radios 1–3, airplanes 4–6, mailboxes 7–10, billboards 11–16 (now High; footprints in `map.md` §7). |
| 1033 | S2 | See top-10 #9 (retroactive eternal). | — |
| 1039–1047 | — | Demand cap 3/5 and radio x2 OK. | — |
| 1072–1082 | S2 | Billboard reaches a house only if the house's single cell is adjacent to the billboard's single cell. | Billboards are multi-square; house reached if any house or garden square is orthogonally adjacent to any billboard square. |
| 1091–1104 | S2 | Airplane uses a band around `campaign.row/col` of width `size`; ui always sets size 1, direction row. | Airplane sits at the board edge, covers exactly 1/3/5 full rows or columns, cannot overhang; reaches any house partly inside. |
| 1106–1117 | S3 | Radio uses the house's anchor cell tile. | House reached if any square (or garden) is in the 3x3 tile area. |
| 1123–1144 | S3 | Mailbox flood fill OK in principle; bridges absent in map. | Bridges must block too. |
| 1154–1162 | S2 | Freezer from either of two milestones. | One milestone. |
| 1164–1179 | S3 | Freezer contents chosen automatically in fixed order. | Player chooses up to 10. |
| 1253–1260 | S3 | `first_100` fires the CFO at once. | Fire in phase 5 of this turn (no practical difference unless the CFO is needed for 1x/supply checks before then). |
| (missing) | S2 | No 1x ownership limit anywhere. | Max one copy of each 1x card per player. |
| (missing) | S3 | No bankruptcy handling. | Chain that cannot pay negative-price sales is out at end of turn (JD 1473813). |

## map.js

| Line | Sev | Code | Rule |
|---|---|---|---|
| 7–228 | S1 | Invented tiles. | Official tiles in `map.md` §4. |
| 252 | S3 | `sort(() => Math.random() - 0.5)` shuffle (biased). | Uniform random draw. |
| 254–256 | S3 | Tiles reused modulo 20. | Never needed (max 20 tiles at 5p); 6p needs Ketchup tiles. |
| 263, 279–288 | S1 | Houses numbered sequentially at generation. | Fixed printed numbers; placed houses chosen by the player (1,3,6,9,11,14,17,19 — 1/9/11/14/19 seen in DLX, rest Medium-High). |
| 292–375 | S1 | Adds road squares at tile borders. | Never modify tiles. |
| 378–412 | S3 | Placement allows any 2x2 empty block (OK); used for both setup and later. | Later placements also need: chain has <3 restaurants; local manager road range 3. |
| 414–442 | — | Entrance must have an orthogonal outside road neighbour. OK. | — |
| 445–474 | S1 | BFS over every road cell, counting squares; parallel edge roads connect; any adjacent road cells connect. | Tile-border distance; bridges don't connect. **[rev]** Adjacent road cells (incl. parallel edge roads) do connect under DLX, so that part of the code is right; the square-count distance and missing bridges remain wrong. |
| 485–519 | S3 | `tileDistance` unused and buggy: line 506 uses `&&` so it walks through non-road cells sharing a row/col with the target. | — |
| 522–554 | S3 | `findHousesInRange` walks through house cells. | Routes use roads only. |
| 593 | S2 | Road BFS may step onto any cell `>= 3`, which includes drink cells and restaurant cells (`100 + player`). | Only road squares are traversable; drinks are collected from the road beside them. |
| 557–602 | S1 | See engine 621–660. | — |

## Related issues outside the three files (not exhaustive)

| Location | Sev | Code | Rule |
|---|---|---|---|
| ui.js:839 | S1 | Marketeer range compared against road-square BFS depth. | Tile borders crossed. |
| ui.js:896 | S2 | Campaign duration always `maxDuration`. | Player chooses 1..max. |
| ui.js:900 | S2 | Campaign number = placement counter. | Printed tile number (player chooses which available tile). |
| ui.js:902–903 | S2 | Every campaign is size 1; airplanes always `row`, size 1. | Billboards/mailboxes have printed footprints (`map.md` §7); airplanes #4/#5/#6 = 1/3/5 wide at board edge. |
| ui.js:845 | S2 | Campaign square only needs to be empty; road adjacency is a score bonus, not a requirement. | Billboards, mailboxes, radios must be orthogonally adjacent to a road. |
| ui.js:1252–1272 | S2 | New house = 1 cell, numbered `houses.length + 1`. | 2x3 house+garden tile, player-chosen number, on empty squares, road-adjacent. |
| ui.js:1281–1296 | S2 | Garden = flag set on any house with an empty neighbour; can target NBD houses again only if flag false. | 2 empty squares forming a 2x3 with a printed house. |
| main.js:110–139 | S2 | Local manager placement has no range-3 check and no 3-restaurant cap; regional manager cannot move a restaurant; always uses the first legal entrance. | Local: road range 3, new entrance on the road the route used **[rev]**; max 3 restaurants; regional: place (with drive-in) or move/rotate; player chooses entrance corner. |

## Not audited
- `RULES_SUMMARY.md` (not trusted; superseded by these docs).
- Ketchup modules (not implemented in code).
