# Food Chain Magnate — Map Specification

Primary source: **DLX** Deluxe base rulebook (printed pages p2, p8–10, p21–24, p30–32) and **KX-DLX** Deluxe Ketchup rulebook (p3–4, p15–17). Older sources: RB p2–4, p9; designer rulings (JD + BGG thread id); tile scans from boardgamehelpers.com (`/FoodChainMagnate/Images/FCMTile{A..Z}.jpg`, letters A–T base, U–Z Ketchup). Grids below were read from those scans cell by cell (colour sampling + visual check) and cross-checked against an independent transcription in github.com/luboise/open-magnate (`backend/src/game/MapPieces.ts`): all 20 base road/house/drink layouts match. House numbers, road exits and bridges were read visually (open-magnate does not record them).

## 1. Structure
- Map tiles are 5x5 squares. A square is road, part of a house, a drink source, or empty. (RB p3)
- Board = grid of tiles: 2p 3x3, 3p 3x4, 4p 4x4, 5p 4x5 (rows x cols in either orientation), Ketchup 6p 4x6. (DLX p2; KX-DLX p30)
- Tiles are drawn at random and each is rotated randomly (0/90/180/270). (RB p4; JD 1452890)
- The canonical orientation below has the house number / art upright.

## 2. Road connectivity rules (normative)
- **[DLX differs] Square-adjacency rule (DLX p8 item E, p21):** roads are a grid of road squares. Any two orthogonally adjacent road squares are connected, within a tile **or across a tile border**, regardless of the printed art (the yellow edge line does not block). Consequences:
  - Midpoint exits connect as before.
  - Two road squares facing each other across a shared tile edge at any position connect. E.g. tile C's outer ring next to another tile's edge road connects along every adjacent pair.
  - This supersedes JD 1514116 ("only in the middle"). Medium-High: DLX text is explicit; no DLX picture shows two printed parallel edge roads. See `questions.md` Q-M1.
- Exceptions (not connected even though adjacent):
  - **Bridges (overpass):** tiles G and P. The N–S road and the W–E road share (2,2) without connecting. A route goes straight through (2,2) and cannot turn there (DLX p8 item F; JD 1455378).
  - **Capped road ends** (KX-DLX p3–4): tile X π stubs end at the apartment; tile W's road ends at house 25. They connect to the building, not to each other.
  - **Restaurant entrance:** two roads touching one entrance corner do not connect through it (DLX p23).
  - Under-construction Lobbyist roads (Ketchup).
- In the 20 base tiles and U–Z, every printed road segment is internally connected and no two separate printed segments on one tile are orthogonally adjacent (checked against the grids below), so the rule only changes **cross-tile** links.
- Road exits listed per tile below are the edge-midpoint exits from the art. With the DLX rule, code should derive cross-tile links from square adjacency, not from the exit list.
- Bridges and all roads bound mailbox areas; two roads touching only at a corner also block mail (DLX p31).
- **Two-segment tiles:** E, J, M each carry two separate roads that do not touch.

## 3. Notation
Rows top→bottom 0–4, columns left→right 0–4. `(r,c)`.

| Char | Meaning |
|---|---|
| `#` | road |
| `.` | empty |
| `H` | house square (house number given below) |
| `B` | beer source |
| `L` | lemonade source |
| `S` | soft drink (soda/coke) source |
| `A` | apartment square (Ketchup) |
| `G` | printed garden square (Ketchup tile W) |
| `P` | park square (Ketchup tile Z) |

Exits: N = (0,2) top edge, S = (4,2) bottom edge, W = (2,0) left edge, E = (2,4) right edge.

Rotation (clockwise 90°): new(r,c) = old(4−c, r); exits rotate N→E→S→W→N.

## 4. Base tiles (20)

### Tile A — cross, house 2
```
..#..
..#..
#####
HH#..
HH#..
```
House 2 at (3,0)(3,1)(4,0)(4,1). Exits N S W E. 4-way intersection.

### Tile B — cross, house 4
```
..#HH
..#HH
#####
..#..
..#..
```
House 4 at (0,3)(0,4)(1,3)(1,4). Exits N S W E. Intersection.

### Tile C — ring road, house 5
```
#####
#.HH#
#.HH#
#...#
#####
```
House 5 at (1,2)(1,3)(2,2)(2,3). Exits N S W E (all on one connected ring).

### Tile D — U road, house 7
```
#####
#HH.#
#HH.#
.....
.....
```
House 7 at (1,1)(1,2)(2,1)(2,2). Exits N W E. No S exit.

### Tile E — two roads, house 8, beer
```
###..
#B...
#.HH#
..HH#
..###
```
House 8 at (2,2)(2,3)(3,2)(3,3). Beer at (1,1).
Road 1: (0,0)(0,1)(0,2)(1,0)(2,0), exits N, W.
Road 2: (2,4)(3,4)(4,4)(4,3)(4,2), exits E, S. Roads 1 and 2 do not connect.

### Tile F — T junction, house 10
```
HH#..
HH#..
#####
.....
.....
```
House 10 at (0,0)(0,1)(1,0)(1,1). Exits N W E.

### Tile G — BRIDGE, house 12
```
HH#..
HH#..
#####
..#..
..#..
```
House 12 at (0,0)(0,1)(1,0)(1,1). Exits N S W E. **N–S and W–E do not connect** (overpass).

### Tile H — T junction, house 13
```
..#..
..#..
#####
.HH..
.HH..
```
House 13 at (3,1)(3,2)(4,1)(4,2). Exits N W E.

### Tile I — T junction, house 15
```
..#..
..#..
#####
...HH
...HH
```
House 15 at (3,3)(3,4)(4,3)(4,4). Exits N W E.

### Tile J — two roads, house 16
```
..###
.HH.#
#HH.#
#....
###..
```
House 16 at (1,1)(1,2)(2,1)(2,2).
Road 1: (0,2)(0,3)(0,4)(1,4)(2,4), exits N, E.
Road 2: (2,0)(3,0)(4,0)(4,1)(4,2), exits W, S.

### Tile K — U road, house 18
```
#####
#.HH#
#.HH#
.....
.....
```
House 18 at (1,2)(1,3)(2,2)(2,3). Exits N W E.

### Tile L — T junction, lemonade
```
..#..
..#..
#####
...L.
.....
```
Lemonade at (3,3). Exits N W E.

### Tile M — two roads, lemonade + soda
```
..###
...L#
#...#
#S...
###..
```
Lemonade (1,3), soda (3,1). Roads as tile J: road 1 N–E, road 2 W–S.

### Tile N — T junction, beer
```
..#..
.B#..
#####
.....
.....
```
Beer (1,1). Exits N W E.

### Tile O — cross, beer
```
.B#..
..#..
#####
..#..
..#..
```
Beer (0,1). Exits N S W E. Intersection.

### Tile P — BRIDGE, lemonade + beer
```
..#..
L.#..
#####
..#..
..#B.
```
Lemonade (1,0), beer (4,3). Exits N S W E. **N–S and W–E do not connect** (overpass).

### Tile Q — T junction, soda
```
..#..
..#..
#####
.S...
.....
```
Soda (3,1). Exits N W E.

### Tile R — cross, soda
```
..#..
.S#..
#####
..#..
..#..
```
Soda (1,1). Exits N S W E. Intersection.

### Tile S — cross, soda + beer
```
..#S.
..#..
#####
B.#..
..#..
```
Soda (0,3), beer (3,0). Exits N S W E. Intersection.

### Tile T — cross, lemonade
```
..#..
.L#..
#####
..#..
..#..
```
Lemonade (1,1). Exits N S W E. Intersection.

### Base totals
- Printed houses: 11 — numbers 2, 4, 5, 7, 8, 10, 12, 13, 15, 16, 18. All 2x2, no garden.
- Drink sources: beer 5 (E, N, O, P, S), lemonade 4 (L, M, P, T), soda 4 (M, Q, R, S). Tiles with drinks: 10.
- Road shapes: 6 intersections (A B O R S T), 2 bridges (G P), 6 T-junctions (F H I L N Q), 1 ring (C), 2 U-shapes (D K), 3 two-road tiles (E J M).

## 5. Placeable house tiles (8, New Business Developer)
- Each is a 2x2 house with a 2x1 garden attached: a 2x3 piece. They always have a garden and can never get another. (DLX p24)
- The player takes any available combo token, so chooses its number (DLX p24).
- **Numbers: 1, 3, 6, 9, 11, 14, 17, 19.**
  - Seen as combo (house+garden) tokens in DLX images: **14** (p1 photo; p24 tip; p30 map), **9** and **11** (p32 radio map), **1** (KX-DLX p6, p9 examples: "House 1"), **19** (KX-DLX p8 "House 19 has a garden"). High for these 5.
  - **3, 6, 17**: inferred — the 11 printed numbers leave exactly these gaps in 1–19, and π is ordered "between houses 3 and 4" (KX-DLX p4). Medium-High.
- Placement: empty squares only; part of an edge orthogonally adjacent to a road. Unlimited range. May span tile borders (DLX p24).

## 6. Gardens (8 tiles)
- 2x1. Attached to a printed house so that house + garden = 2x3 rectangle, on empty squares. One per house. Not shareable; the player chooses the owner if ambiguous. (RB p9; JD 1802538, 2801484)
- A garden extends the house for road connection, billboard adjacency, airplane and radio reach, and makes it a 2-tile house if it crosses a border (JD 1693120).
- Garden effects: x2 unit price; demand cap 5 instead of 3.

## 7. Marketing tiles (base)
Numbers → type are now High (DLX p1 photo shows radio 2, airplanes 4/5/6, mailboxes 7/9, billboards 11–15; DLX p32 map shows mailbox 10).

| # | Type | Footprint | Conf. |
|---|---|---|---|
| 1–3 | Radio | 1x1 each (DLX p20 "all radio campaigns are the same size"; p32 map) | High |
| 4 | Airplane | 2 deep x 1 wide | High |
| 5 | Airplane | 2 deep x 3 wide | High |
| 6 | Airplane | 2 deep x 5 wide | High |
| 7 | Mailbox | 2x2 | High |
| 8 | Mailbox | not pictured; probably 2x2 | Low |
| 9 | Mailbox | 1x1 | Medium-High |
| 10 | Mailbox | 1x1 | Medium-High |
| 11 | Billboard | 3x2 | High |
| 12 | Billboard | 2x2 | High |
| 13 | Billboard | 3x1 | High |
| 14 | Billboard | 2x1 | Medium-High |
| 15 | Billboard | 1x1 | High |
| 16 | Billboard | not pictured | Low |

Sources per tile: `base.md` §9. Removed at low player counts: #12, #15, #16 (2p), #15, #16 (3p), #16 (4p).

## 8. Generation constraints (if not using official tiles)
Prefer the official 20 tiles above. If a procedural generator is needed:
- All road exits must sit at edge midpoints; the road network inside a tile must reach the exits as printed.
- Houses are 2x2 with numbers unique across the map.
- Do not add roads to "fix" connectivity; dead ends are legal.

## 9. Ketchup "New Districts" tiles (U–Z)
See `ketchup.md` for rules. Grids (same notation). Re-checked against the KX-DLX p3–4 tile pictures: U, V, W, X, Y, Z all match. High.

### Tile U — three lemonades ("roundabout")
```
.###.
##.##
#L.L#
##L##
.###.
```
Lemonade at (2,1)(2,3)(3,2). One connected road. Exits N S W E. Each lemonade is a separate source; a road buyer may pass 1, 2 or 3 depending on route; a zeppelin collects all 3.

### Tile V — houses 21 and 22
```
..HH.
..HH.
#####
.HH..
.HH..
```
House 22 at (0,2)(0,3)(1,2)(1,3); house 21 at (3,1)(3,2)(4,1)(4,2). Exits W E only.

### Tile W — house 25 with printed garden
```
.....
HH...
HH###
GG...
.....
```
House 25 at (1,0)(1,1)(2,0)(2,1); printed garden (3,0)(3,1). Road (2,2)(2,3)(2,4), dead-ends against the house at (2,2). Exit E only. Cannot get another garden.

### Tile X — apartment "π"
```
..#..
.AAA.
#AAA#
.AAA.
..#..
```
Apartment π at rows 1–3, cols 1–3 (3x3). Four 1-square road stubs (0,2)(2,0)(2,4)(4,2), exits N W E S. The stubs do **not** connect to each other through the building. Mailboxes pass through it.

### Tile Y — apartment "9¾"
```
#####
#AAA#
#AAA#
#AAA.
###..
```
Apartment 9¾ at rows 1–3, cols 1–3. One connected road: row 0, column 0, (1,4)(2,4), (4,1)(4,2). Exits N W E S.

### Tile Z — two parks (Lobbyist module only)
```
PP#..
PP#..
#####
..#PP
..#PP
```
Parks (2x2 each) at top-left and bottom-right. Exits N S W E. Intersection.
