# Food Chain Magnate — Base Game Rules Specification

Authoritative spec for the digital implementation. Every rule carries a source tag. Where a rule is a designer ruling rather than rulebook text, it says so.

**Primary source (from 2026-10-01): DLX** — the Lucky Duck Games *Deluxe Edition Revised Rulebook* (`source/Food_Chain_Magnate_Deluxe_Edition_Revised_Rulebook.pdf`). Where DLX differs from the Splotter 3rd-printing text (RB) or a forum ruling (JD), DLX wins and the difference is noted as **[DLX differs]**. See `CHANGES.md` for the full correction list and `questions.md` for open items.

## Sources

| Tag | Source |
|---|---|
| **DLX** | Deluxe Edition Revised Rulebook (Lucky Duck Games). Page numbers = printed page numbers ("Page N"; PDF page = N+2). **Primary.** |
| **RB** | Official English rulebook, 3rd printing (Splotter Spellen, 2015, "3rd printing with some modifications"). PDF: `files.cardboardappendix.com/food-chain-magnate/food-chain-magnate-rulebook.pdf`. Page numbers are printed page numbers. A v4 English text was compared sentence-by-sentence and has no rules differences. |
| **JD** | Designer ruling by Jeroen Doumen (BGG user `jmdsplotter`) or Joris Wiersinga (`joriswiersinga`) on the BGG FCM Rules forum. Thread id given. |
| **CMP** | Physical component scans (map tiles from boardgamehelpers.com tile key; rulebook component photos). |
| **INF** | Inference from the above. Confidence stated. |

Confidence: **High** = DLX text or image, or RB/JD not contradicted by DLX. **Medium** = strong inference or community consensus. **Low** = unverified.

---

## 1. Components (base game)

| Component | Count | Limited? |
|---|---|---|
| Map tiles (5x5 squares) | 20 | yes |
| House + garden combo tokens (house 2x2 + garden 2x1 = 2x3) | 8 | yes (DLX p24) |
| Garden tokens (2x1) | 8 | yes (DLX p24) |
| Marketing campaign tokens | 16: 6 billboards, 4 mailboxes, 3 airplanes, 3 radios | yes |
| Numbered busy tokens | 16 (match campaign numbers) | yes |
| Restaurant tokens per player (2x2, one entrance corner) | 3 (15 total) | yes |
| Coming Soon tokens | 15 (3 per player) | — |
| Drive-In tokens | 3 per player | — |
| Freezer tiles | 5 (1 per player put in supply) | — |
| Milestone boards (per-player trays) + milestone tracker tokens | 5 boards, 90 tokens | **no** — every player has every milestone on their own board |
| Turn order track, turn order markers | 1 track, 5 markers | — |
| Employee cards | 222 | **yes** |
| CEO cards | 10 (each player picks any 1) | — |
| Restaurant menus | 5 | — |
| Bank reserve cards | 18 | — |
| Food/drink tokens (burger, pizza, beer, lemonade, soda) | 40 each | **no** — "not intended to be limited; use a proxy" (DLX p11) |
| Money | 120 bank notes | unlimited outside the bank pool |

Sources: DLX p1 (component list), p2–4 (setup), p11, p24. Confidence High.

**[DLX differs]** RB had 84 milestone *cards* (proxies if they ran out) and 6 CEO cards. DLX prints the base milestones on each player's milestone board and marks them with check/X tokens, so milestone copy counts no longer exist. Same effect as RB "unlimited" (JD 1452799). No rules change.

Restaurant chains: Fried Geese & Donkey, Golden Duck Diner, Santa Maria Pizza, Xango Blues Bar, Gluttony Inc. Burgers (5 in base; Ketchup adds Siap Faji). Cosmetic only.

---

## 2. Setup

### 2.1 Player-count table (DLX p2)

| Players | Map size (tiles) | Copies of each "1x" employee card | Billboards removed | Bank start (standard) | Bank start (intro) |
|---|---|---|---|---|---|
| 2 | 3x3 | 1 | #12, #15, #16 | $100 | $150 |
| 3 | 3x4 | 1 | #15, #16 | $150 | $225 |
| 4 | 4x4 | 2 | #16 | $200 | $300 |
| 5 | 4x5 (DLX p2 table) | 3 ("All") | none | $250 | $375 |

- Bank = $50 x players (DLX p3). Intro game = $75 x players (DLX p5). High.
- Map orientation of a non-square grid is irrelevant (the board can be viewed from any side). For code, use rows x cols = 3x3, 3x4, 4x4, 5x4. High.
- **All non-1x employee cards are always used regardless of player count.** Only the 10 1x types are reduced (DLX p3 steps 6–7). High.

### 2.2 Map
1. Randomly draw the required number of tiles from the 20. (DLX p2)
2. Rotate each tile randomly (any of 4 orientations) and place in the grid. (DLX p2; JD 1452890 "Random orientations.")
3. No other constraint. Roads that dead-end at a neighbour's road-less edge simply dead-end. Do **not** add connecting roads. See `map.md`.

### 2.3 Cards
- Lay out all employee cards as supply piles. For each **1x** card type keep only the number in the table above; return the rest to the box. (DLX p3)
- Lay out milestone cards.
- Return the removed billboards to the box.

### 2.4 Players
- Each player: menu, milestone board, 1 CEO card (any), turn order marker, 3 restaurants, 3 drive-in tokens, 3 bank reserve cards (+$100 / +$200 / +$300). (DLX p4)
- **Players start with $0.** (DLX p4)
- Supply: 8 house+garden combos, 8 gardens, campaign tokens and busy tokens (minus removed billboards), food/drink tokens, 1 freezer tile per player. (DLX p2)

### 2.5 Initial turn order
Line up the turn order markers in a random starting order. (DLX p4) High.

### 2.6 Placing the first restaurants (DLX p4–5)
1. Go in **reverse** turn order (last player first, first player last). Each player either places one restaurant or passes.
2. If anyone passed, run a second round **in normal turn order**. Each player who has not placed must now place. Players who already placed do not take part.
3. Placement constraints (initial placement only) (DLX p5):
   - All 4 squares must be empty (no restaurant, road, printed location, house, garden).
   - The entrance square must border (orthogonally) a road square. The entrance is one corner square of the 2x2; the player chooses the rotation, so any corner may be the entrance. The road square must be orthogonally adjacent to the entrance square **from outside the restaurant** (the 2 outside squares orthogonal to that corner). Diagonal does not count (BGG 1729596, community, Medium-High).
   - The entrance may **not** be on the same map tile as the entrance of an existing restaurant. (Only applies to initial placement — JD 1452841.)
4. The road the entrance touches may be on a different tile from the entrance square. That is legal, but every route out then starts by crossing a tile border (+1 range/distance). The entrance is still "on" the tile it physically sits on (JD 1460536). High.

### 2.7 Setting goals (reserve cards) (DLX p4, p6)
Each player secretly chooses one of their reserve cards and places it face down by the bank. The other two are discarded unseen. (Not done in the intro game.)

Reserve card values (RB p3 image, CMP):

| Card | Money added | CEO slots vote |
|---|---|---|
| +$100 | $100 | 2 |
| +$200 | $200 | 3 |
| +$300 | $300 | 4 |

---

## 3. Turn structure

Each round has 7 phases in this exact order (DLX p12):

1. Restructuring
2. Order of Business
3. Working 9:00–5:00
4. Dinnertime
5. Payday
6. Marketing Campaigns
7. Clean up

The game can only end in phase 4 (DLX p28, p33).

---

## 4. Phase 1 — Restructuring (DLX p12–13)

1. Simultaneously and secretly, each player chooses which of their cards to put "at work". All others go "on the beach".
2. Cards are revealed simultaneously.
3. Turn 1: the CEO is the only card (nobody owns anything else). The CEO is always at work.
4. From turn 2: build the company structure (pyramid):
   - CEO at the top, with **3 slots** (until the bank breaks — see §12; Ketchup "First burger sold" overrides).
   - A CEO slot may hold any card, including a manager (black card).
   - Managers (Management Trainee 2, Junior VP 3, VP 4, Senior VP 5, Executive VP 10 slots) may hold only **non-manager** cards. Managers can only report directly to the CEO. So the pyramid is at most 3 levels: CEO → manager → employee. (DLX p12–13; BGG 1629423)
5. **Overfill penalty:** if a player put down more cards than fit, all cards except the CEO go to the beach and the player plays this turn with only the CEO. (DLX p13) High.
6. Busy marketeers (§6.4) are never placed in the structure and do not occupy slots. (DLX p20; JD 1456786)
7. Cards on the beach can still be trained this turn and still cost salary.
8. Information: employees owned are public except while in hand and in the face-down stacks during Restructuring. Cash and stock are public (DLX p6, p13, p27). High.
9. **Restructuring milestones:** when structures are revealed, immediately claim "played" milestones (First Waitress / Errand Boy / Cart Operator Played). Beach cards never count (DLX p12–13). High.
10. Optional **Work Planning Variant** (DLX p12): cards are placed face down in their exact slots. UI option only; same rules.

---

## 5. Phase 2 — Order of Business (DLX p14)

1. Count each player's **open slots**: empty slots on the CEO and on every manager in the structure.
2. "First airplane campaign" milestone: +2 open slots for this count only (cannot hold cards).
3. The player with the most open slots chooses **any free position** on the turn order track first; then the next most, etc. Only positions 1..N exist (DLX p14).
4. Tie in open slots: the player who was **earlier in the previous turn's order** chooses first. Turn 1: all tie, so players choose in the random starting order (DLX p14).

Implementation note: this is a choice, not an automatic sort. A player with first choice may take position 3 if they want. High.

---

## 6. Phase 3 — Working 9–5 (DLX p14–25)

Players act one at a time in turn order. A player completes **all** their actions before the next player starts. Each card at work gives one action (multi-action cards noted). Card position in the structure does not matter.

### 6.0 Mandatory vs optional (DLX p13)
- Mandatory: placing drive-in signs (local/regional manager), item price modifiers (pricing, luxuries, discount managers), cash bonuses (waitress, CFO), salary discounts (recruiting manager, HR director). DLX rule of thumb: Dinnertime and Payday actions are mandatory; Working 9–5 actions are optional except drive-ins. High.
- Optional: hiring (including the CEO's hire), training, marketing, producing/collecting ("Gaining food and drink is optional", DLX p21), placing houses/gardens, placing or moving restaurants. High.
- If you choose to produce, you take the **full** amount (a pizza cook makes 3 or nothing). JD 1564805, 1587582. DLX is silent. Medium.

### 6.1 Sub-step order (strict) (DLX p14–25)
- **3a Hire employees**
- **3b Train employees**
- **3c Open drive-ins** — mandatory if a local or regional manager is at work
- **3d Launch campaigns**
- **3e Prep food & drinks**
- **3f Place houses & gardens**
- *(Ketchup Lobbyists: place road/park here, between 3f and 3g)*
- **3g Place or move restaurants**

High. **[DLX differs]** RB listed 6 sub-steps; DLX makes "Open drive-ins" an explicit step 3c before marketing. Effect is the same as RB's "drive-in while at work", but it fixes when drive-ins exist (from 3c on, so marketing, buying and dinnertime use them).

### 6.2 Recruit (DLX p15)
- The CEO gives 1 hire action. Hiring is optional.
- Recruiting girl +1, recruiting manager +2, HR director +4 hire actions.
- Only **entry-level** cards (sparkle icon at the card's top-left, DLX p7) can be hired: Waitress, Management Trainee, Pricing Manager, Recruiting Girl, Trainer, Errand Boy, Marketing Trainee, Kitchen Trainee. See `employees.md`.
- Ketchup: some entry-level cards have a salary (Lobbyist, Kimchi Master, Night Shift Manager); they must be paid or fired this Payday (DLX p15).
- Hired cards go to the **beach** (usable from next turn, trainable this turn).
- If a pile is empty you cannot hire that card, **except** you may hire it if you immediately train it to a higher level in this turn's training step (you never take the physical card). (DLX p16)
- Unused recruit actions on a **recruiting manager or HR director** each give a $5 salary discount in Payday. Unused CEO / recruiting girl actions give nothing. Actions can be split (some hire, some discount). The HR director "just counts the actual cards recruited" (JD 1564805). High.
- "First to hire 3 people in 1 turn" counts all hires this turn, including the CEO's.

### 6.3 Train (DLX p15–17)
- Each training action trains one employee **one step** along its career path.
- Trainer: 1 action. Coach: 2 actions; may apply both to the same card (2 steps). Guru: 3 actions; may apply up to 3 steps to the same card. Coach/guru may also split across cards.
- Only cards **on the beach** can be trained, including cards hired this turn. Cards at work and busy marketeers cannot be trained. (Ketchup "First lemonade sold" relaxes this.)
- Without the "First to pay $20 or more in salaries" milestone you may **not** combine training actions from different employees on the same card, and may not train a card again after it was trained this turn (except the coach/guru multi-step on the same card). With the milestone you may stack any training actions on one card (e.g., 2 trainers + coach = management trainee → executive VP). (DLX p15–16, p34)
- Training: return the old card to the supply, take the new card from the supply.
- You cannot train to a card whose pile is empty. Intermediate cards in a multi-step train (or hire-and-train) need not be available. (DLX p16)
- A player may own only **one copy of each 1x card**, beach included (DLX p7, p17). Training into a 1x card you already own is illegal.
- Cards with no career options cannot be trained.
- After a player has "First to have $100", they may not train a CFO (DLX p34).
- "First to hire 3": its 2 free Management Trainees cannot be combined with a train action to skip an empty Management Trainee pile (DLX p34).

### 6.3a Open drive-ins (DLX p17)
- If a local or regional manager is at work, place a drive-in sign on **each of your open restaurants** (not COMING SOON ones). Mandatory.
- A drive-in restaurant has an entrance at all 4 corners until Clean up. Routes may start from any corner. Distance to a house is counted from the corner nearest (in tile crossings) to the house.
- A regional manager's newly placed restaurant also gets a drive-in sign (3g). High.

### 6.4 Launch campaigns (DLX p18–20)
For each marketeer at work, optionally place one campaign.

**Type allowed:**

| Marketeer | Allowed | Range | Max duration |
|---|---|---|---|
| Marketing trainee | billboard | 2 (road) | 2 |
| Campaign manager | billboard, mailbox | 3 (road) | 3 |
| Brand manager | billboard, mailbox, airplane | unlimited | 4 |
| Brand director | billboard, mailbox, airplane, radio | unlimited | 5 |

**Range:** counted from an entrance corner of one of your **open** restaurants along roads, in tile borders crossed. Range 2 = own tile (0), adjacent tile (1), or 2 tiles away. The campaign tile itself must be in range: a billboard on the next tile beside the last road square costs the extra border (DLX p19 example C: billboard 13 reached at distance 2). If a campaign spans multiple tiles, only one of its road-adjacent squares must be in range. Unlimited-range marketeers need no road connection to your restaurants. High.

**Placement (billboard, mailbox, radio):**
- On empty squares only.
- Must be orthogonally adjacent to a road. A road-range marketeer's tile must touch the road its route used (DLX p18). Applies to unlimited-range marketeers too: a radio anywhere on the board but next to some road (DLX p18; JD 1457436). High.
- Placing where no house will be reached is allowed.

**Placement (airplane):**
- Placed beside the board edge, outside the map. No road, no range.
- Airplane tiles are 2 deep and 1, 3 or 5 wide: **#4 = 1 wide, #5 = 3 wide, #6 = 5 wide** (DLX p1 photo, p19 examples A/B, p31). The 1/3/5 edge must face the map and align with exactly that many squares of outer map tiles; no overhang past a map corner (DLX p18). High.
- Airplane tokens may not overlap each other. Their flyover zones may overlap when they sit on opposite edges (DLX p18, p19 example A, p31). High.

**Duration:** choose 1..max. Put that many wooden tokens of the advertised good on the campaign tile. Campaigns can never end early.

**Product:** burger, pizza, or one specific drink type (beer, lemonade, soft drink). Marketing a good nobody can supply is allowed (BGG 1465364).

**Busy marketeer:** remove the card from the structure, place it face up beside the beach pile with the matching numbered busy token. It is neither "played" nor "on the beach". It cannot be played, used, trained or voluntarily fired; it still costs salary (DLX p19–20, p29).

**Eternal marketing ("First Billboard Campaign"):** campaigns launched by that player **after** gaining the milestone — including the billboard that gains it — are eternal: flip to the ∞ side, one counter, never removed; the marketeer is busy for the rest of the game and can never be played, trained or fired; it has no salary (DLX p20, p35). Campaigns placed **before** gaining it (even earlier the same turn) stay finite (JD 1535067; consistent with DLX "all new campaigns"). High.

**Which tile:** the player takes "any currently available campaign token" of an allowed type (DLX p18). Numbers set run order (§9). Footprints: see §9 table. High.

Milestones triggered on placement: first billboard, first airplane, first radio, first burger/pizza/drink marketed.

### 6.5 Prep food & drinks (DLX p21–23)
Food and drinks go into the player's single shared stock, usable by all their restaurants.

| Card | Effect |
|---|---|
| Kitchen trainee | 1 burger **or** 1 pizza |
| Burger cook / chef | 3 / 8 burgers |
| Pizza cook / chef | 3 / 8 pizzas |
| Errand boy | 1 drink of any type (no route; the type need not be on the map) |
| Cart operator | route range 2 by road; 2 drinks per supplier passed |
| Truck driver | route range 3 by road; 3 per supplier |
| Zeppelin pilot | route range 4 by air; 2 per supplier on every tile entered, **including the start tile** |

**Road buyers (cart, truck):** (DLX p21–23; Ketchup DLX p16)
- Start on an entrance corner of one of your **open** restaurants (any corner with a drive-in; Ketchup: or a coffee shop). Each buyer traces its own route.
- The traced path begins on a road square orthogonally adjacent to the entrance corner, outside the restaurant. If that road square is on a neighbouring tile, stepping onto it costs 1 range. A supplier adjacent only to the entrance corner (not to a traced road square) is **not** collected (DLX p23).
- Movement is square by square over road squares. Range = number of tile borders crossed. Including the start tile, a range-2 route covers up to 3 tiles.
- Collect from every supplier orthogonally adjacent to a road square on the path, either side of the road; it may be on a neighbouring tile at no range cost (DLX p21; JD 1470717).
- **Backtracking:** the path may revisit road squares and re-enter tiles, but may never step straight back onto the square it just came from (no immediate reversal) (DLX p10, p22). Loops are fine.
- Each supplier is collected at most once per buyer per round, however often it is passed. A second buyer may collect it again (DLX p21).
- The path is the player's choice; every supplier passed must be collected (DLX p21; Ketchup DLX p16). **[DLX differs]** JD 1587582 said a buyer must use its full range; DLX only says collecting is optional overall ("Gaining food and drink is optional") and passed suppliers are mandatory. Implement: route length is free (0..range); collection along the chosen route is mandatory. Medium-High.
- No need to return.
- When an entrance corner touches 2 separate roads, choose one per buyer; they do not connect through the entrance corner (DLX p23 example 4). High.
- Ketchup roadworks: see `ketchup.md` §2.

**Zeppelin (air route):** from the tile with the chosen entrance corner, move tile to tile orthogonally, ignoring roads, crossing at most 4 borders (5 tiles incl. start); never enter a tile twice. Collect 2 from every supplier on every tile entered, including the start tile (DLX p10, p21). High.

**Milestone modifiers:**
- First errand boy played: errand boys get 2 drinks of one type; other buyers +1 per supplier (cart 3, truck 4, zeppelin 3). Applies to the triggering errand boy.
- First cart operator played: cart, truck and zeppelin range +1; errand boys unaffected (DLX p34). Applies immediately.
- First burger/pizza produced: gain a burger/pizza cook to the beach immediately; it cannot be trained this turn (training already happened).

### 6.6 Place houses & gardens (New Business Developer) (DLX p24)
One action per NBD: place a house+garden combo **or** add a garden. Both token pools are limited; when empty the action is impossible.
- **New house:** take any available combo token (any number); place it anywhere (unlimited range) on empty squares only, with part of one of its edges orthogonally adjacent to a road. Cannot be placed without its garden. High.
- **New garden:** place next to any house on the map that has no garden, on empty squares, so house + garden form a 2x3 rectangle. A garden belongs to and affects exactly one house; orient it to make the owner clear (player's choice) (DLX p24; JD 1802538). Combo houses already have one. Apartments cannot get gardens (Ketchup). High.
- A house/garden spanning a tile border is on both tiles (distance 0 from both, if road-connected) (JD 1693120).

### 6.7 Place or move restaurants (DLX p25)
General (after setup): all 4 squares empty; entrance corner orthogonally adjacent to a road; entrance **may** share a tile with another restaurant's entrance (DLX p9). Each chain has at most 3 restaurants; with all 3 placed a local manager does nothing, a regional manager may still move one.

- **Local manager:** place one new restaurant COMING SOON side up. Trace a road route of range 3 from an entrance corner of one of your **open** restaurants. The new restaurant must occupy empty squares and its entrance must connect to **the road the local manager's route used** (DLX p25). Opens in Clean up. **[DLX differs]** the earlier spec allowed any road. High.
- **Regional manager:** either place a new **open** restaurant anywhere (unlimited range; entrance touching a road) with a drive-in sign on it, **or** relocate one of your open restaurants anywhere (it keeps its drive-in sign; rotating in place is allowed if the entrance still touches a road). Not both (DLX p25; JD 1525027). High.
- Drive-ins: §6.3a.

---

## 7. Phase 4 — Dinnertime (DLX p26–28)

Houses are processed in ascending house number. Players make no decisions.

**Start of Dinnertime:** a player with a pricing or discount manager at work claims "First to Lower Prices" now (if available), even if they sell nothing (DLX p28). **[DLX differs]** earlier spec checked it at Restructuring reveal; claim timing moves to start of phase 4 (same-turn sharing makes the result the same).

For each house:
1. No demand tokens → skip.
2. **Candidates:** chains that (a) have a restaurant connected by road to the house and (b) can deliver **all** demanded items from current stock. No partial sales. COMING SOON restaurants do not count (they open at end of turn). 
   - Road connection starts at any road square orthogonally adjacent to the house **or its garden**. No range limit.
3. No candidate → the house stays home; its demand stays.
4. One candidate → it serves.
5. Several → lowest **(unit price + distance)** wins.
   - **Unit price** = $10 base, −$1 per pricing manager at work, −$3 per discount manager at work, +$10 if a luxuries manager is at work (1x, so at most one), −$1 permanently with "First to lower prices" (DLX p27). Bonuses (CFO, marketed milestones, gardens) never change unit price. Example: 2 pricing + 1 discount = $5.
   - **No minimum price.** Unit price may be $0 or negative; the chain then pays the bank per item sold (doubled by gardens). A chain that cannot pay goes bankrupt (JD 1473813, 1535734). High.
   - **Distance** = fewest tile borders crossed along roads from the restaurant entrance (nearest corner if drive-in) to the house. Same tile + connected = 0. Each distance counts as $1. Number of demand tokens is irrelevant (DLX p26).
6. Tie on price+distance → most **waitresses played this turn** wins (beach ignored).
7. Still tied → earlier in current turn order wins.

**Selling:** remove all demand tokens from the house and the identical items from the chain's stock. Income per item = unit price (x2 if the house has a garden) + per-item milestone bonuses (not doubled).

Example (RB p10): luxury manager, "First burger marketed", garden house buying 1 burger + 2 beer → burger 2x$20+$5 = $45, each beer 2x$20 = $40 → $125.
Example (DLX p28): 1 pricing manager, garden house buys 1 pizza, "First Pizza Marketed" → $9x2 + $5 = $23; 2 waitresses +$6 = $29; CFO +50% rounded up → $44 total.

Later houses evaluate against what stock remains.

**After all houses:**
1. **Waitresses:** each chain gets $3 per waitress at work (+$2 each, i.e. $5, with "First Waitress Played"), even with no sales (DLX p27).
2. **CFO:** chains with a CFO at work (or the "First to have $100" milestone gained in an earlier Dinnertime) get +50% of all cash earned this Dinnertime, including waitress money and milestone bonuses, **rounded up** (DLX p27). Negative income: JD 1473813 (CFO applies). DLX silent. Medium.
3. "First to have $20" / "$100": DLX p28 says claim "at any point during Dinnertime" when cash reaches the amount; DLX p34 says "at the end of the Dinnertime phase". See `questions.md` Q-B1. The $100 CFO effect starts at the **next** Dinnertime either way.

**Bank breaks during this phase:** see §12. If the first break happens mid-phase, refill from reserves and keep paying (DLX p28).

Dinnertime is always empty in rounds 1–2 (no demand exists yet) except waitress/CFO bonuses (DLX p27).

---

## 8. Phase 5 — Payday (DLX p29)

1. **Firing:** players **simultaneously** decide whether to fire any cards at work or on the beach. Fired cards return to the supply. Busy marketeers cannot be fired voluntarily. **[DLX differs]** JD 2185563 (2019) said firing is in turn order; DLX says simultaneous. Use simultaneous (hidden or ordered-irrelevant choice). High.
2. **Salaries:** $5 for every owned card with a salary icon: in the structure, on the beach, **and busy marketeers** (except marketeers covered by "First Billboard Campaign"). Salaries go to the bank.
3. **Discounts (all mandatory; cannot pay voluntarily):**
   - $5 per unused recruit action on recruiting managers / HR directors at work.
   - $15 with "First to train someone".
   - "First billboard placed": no salaries for marketeers (campaign manager, brand manager, brand director). The marketing trainee has no salary anyway.
   - Minimum total $0.
4. **Can't pay:** you must fire salaried employees until you can pay the full remaining amount; with $0 cash you fire all salaried employees. A busy marketeer may be fired only if you cannot pay it and have no other salaried employee to fire; its campaign stays and runs out normally (DLX p29). High.
5. "First to pay $20 or more in salaries": awarded if the amount **actually paid** after all discounts is ≥ $20 (DLX p29).
6. Final round: no Payday (game ends after Dinnertime).
7. Intro game: skip this phase entirely.

---

## 9. Phase 6 — Marketing (DLX p30–32)

Run every campaign on the board in ascending campaign number.

**Campaign tiles (DLX p1 photo; p19, p20, p30–32 map examples):**

| # | Type | Footprint (squares) | Conf. |
|---|---|---|---|
| 1, 2, 3 | Radio | 1x1 ("all radio campaigns are the same size", DLX p20; #2 shown 1x1 on p32 map) | High |
| 4 | Airplane | 2 deep x 1 wide | High |
| 5 | Airplane | 2 deep x 3 wide | High |
| 6 | Airplane | 2 deep x 5 wide | High |
| 7 | Mailbox | 2x2 (photo; p31 and p32 maps) | High |
| 8 | Mailbox | not shown; probably 2x2 (stacked under #7 in photo) | Low |
| 9 | Mailbox | 1x1 (photo) | Medium-High |
| 10 | Mailbox | 1x1 (p32 map) | Medium-High |
| 11 | Billboard | 3x2 (p30, p32 maps) | High |
| 12 | Billboard | 2x2 (p20) | High |
| 13 | Billboard | 3x1 (p19, p32) | High |
| 14 | Billboard | 2x1 (photo) | Medium-High |
| 15 | Billboard | 1x1 (p32) | High |
| 16 | Billboard | not shown | Low |

Footprints may be rotated freely (no rule restricts orientation). Mailbox reach does not depend on size (DLX p20). Removed by player count: #12, #15, #16 (2p); #15, #16 (3p); #16 (4p) plus their busy tokens (DLX p2).

**Demand limit:** a normal house holds at most **3** demand tokens total; a house with a garden at most **5**. A campaign reaching a full house does nothing there.

**Each campaign places 1 token of its good on every house it reaches:**
- **Billboard:** every house orthogonally adjacent to any square of the billboard; a house counts if only its garden is adjacent (garden = part of the house, a 6-square house). Diagonal does not count (DLX p30).
- **Mailbox:** every house you can trace a line to from the mailbox; only roads and the map edge block. Two roads touching at a corner also block (no diagonal squeezing), and a bridge blocks like any road (DLX p31). Implement as a 4-connected flood fill over non-road squares from the mailbox's squares; a house is reached if any of its squares (or garden) is in the filled region. High.
- **Airplane:** every house any part of which (or its garden) lies in the covered rows/columns.
- **Radio:** every house any part of which (or its garden) lies on the radio's tile or any of the 8 surrounding tiles (3x3 tiles) (DLX p32). With "First Radio Campaign": 2 counters per house, capped by the house limit ("add as many as you can"); still only 1 duration counter removed (DLX p35).

**After each campaign runs:** remove one duration counter unless eternal, even if it placed no demand. If none remain, the campaign ends: tile and busy token to the supply, the marketeer goes **on the beach** (DLX p30). **[DLX differs]** earlier spec said "to hand"; it reaches the hand in Clean up anyway, so no practical difference.

---

## 10. Phase 7 — Cleanup (DLX p33)

A. **Throw away items:** return unsold stock to the supply. Freezer holders may keep up to 10 (player's choice). Throwing away ≥1 item claims "First to Throw Away Food or Drink"; its freezer is usable only from the **next** Cleanup.
B. **Return employees:** structure and beach go back to hand. Busy marketeers stay face up.
C. **Remove signs:** remove Coming Soon and Drive-In signs; all restaurants are now open and lose drive-ins.
D. **Cross out milestones:** every player who did not claim a milestone claimed this round marks it unavailable.
E. Demand counters and duration counters stay. Next round starts.
High.

---

## 11. Milestones (summary — see `milestones.md`)
- Awarded **immediately** when the condition is met, at any point in the turn.
- Every player who meets the condition **during the same turn** also gets it. Use proxies if copies run out (JD 1452783).
- Effects are mandatory for the rest of the game.
- In Clean up, unclaimed copies of any milestone claimed that turn are removed.

---

## 12. Breaking the bank & game end (DLX p28, p33)

- **Trigger:** at any point during phase 4, the bank has **$0 remaining** (DLX p28). **[DLX differs]** the earlier spec inferred "insufficient funds" and said exactly $0 did not break it; DLX says $0 breaks it. High. Salaries paid in phase 5 return money to the bank. (Ketchup: income in phase 6 can also empty the bank; play continues to the next Dinnertime — `ketchup.md`.)
- **First break:**
  1. Reveal all chosen reserve cards; add their total to the bank; keep paying income.
  2. CEO slots for all players for the rest of the game = the slot number that occurs most often among the revealed cards. Tie → the **highest** tied number. Example: two "2" + two "4" → 4 slots (DLX p28). Tuck the matching reserve card under the CEO.
  3. Finish paying anyone still owed; continue Dinnertime.
- **Second break:** do not refill. Finish Dinnertime paying all income from the box or as IOUs. Then the game ends: no further phases, no Payday. Most cash (incl. IOUs) wins; a tie goes to the tied player ahead in turn order (DLX p28, p33). High.
- **Intro game:** the game ends when the bank breaks the first time (no reserve cards).

**Bankruptcy (designer ruling, JD 1473813, 1660800; DLX silent — Medium):** a chain that cannot pay what it owes for negative-price sales is bankrupt and out at the end of that turn. Its employee cards return to the supply (busy marketeers are treated as fired). Its campaigns stay and run normally. Its restaurants stay as derelict buildings. If everyone goes bankrupt, everyone loses.

---

## 13. Intro game variant (DLX p5)
- No reserve cards.
- **Ensure all 3 drink supplier types are on the map** (DLX p5; new in DLX — redraw/replace tiles until beer, lemonade and soda all appear). Medium on method; DLX does not say how.
- $75 per player in the bank.
- No milestones. (Recommended second game: same, but with milestones.)
- No salaries (skip phase 5).
- Game ends when the bank breaks once.

---

## 14. Geometry definitions (normative for code)
- **Square:** one cell of a 5x5 tile.
- **Tile:** a 5x5 map tile.
- **Road graph:** every pair of orthogonally adjacent road squares is connected, within a tile or across a tile border, "regardless of how the art might look" (DLX p8 item E, p21). So two parallel roads along a shared tile edge **are** connected along their whole length. Exceptions: a bridge square (tiles G and P) links N–S and W–E separately — a route goes straight through, never turns there (DLX p8); Ketchup π stubs and the tile-W house road end are capped ends; under-construction Lobbyist roads are not road. **[DLX differs]** JD 1514116 ("only in the middle") is superseded. Medium-High: DLX text is explicit, but no DLX picture shows two printed parallel edge roads. See `questions.md` Q-M1.
- **Range / distance:** number of tile borders crossed along a legal road route. Within one tile = 0.
- **Restaurant entrance:** the corner square marked by the doors (or every corner with drive-in). It must touch a road via one of its 2 outside orthogonal neighbours. Routes start from that road square. If the road square is on another tile, the route starts at +1. Two roads touching the same entrance do not connect through it (DLX p23).
- **Air distance:** fewest orthogonal tile-to-tile steps, ignoring roads (DLX p10).
- **House connection:** any road square orthogonally adjacent to any house or garden square.
- **Diagonal adjacency never counts** for any rule.

---

## 15. Open questions
Moved to `questions.md`.
