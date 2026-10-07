# The Ketchup Mechanism & Other Ideas — Rules Specification

Sources:
- **DLX** — Lucky Duck Games *Deluxe Edition: The Ketchup Mechanism and Other Ideas* rulebook, supplied locally as `source/Food_Chain_Magnate_Deluxe_Edition_The_Ketchup_Mechanism_and_Other_Ideas_Rulebook.pdf`. **Primary source from 2026-10-01.** Page numbers = printed pages ("Page N"; PDF page = N+1). Card images on each module's Components page were read. Where DLX differs from KX, DLX wins: **[DLX differs]**.
- **KX** — Splotter Spellen English expansion rulebook, 2nd edition (2020). Secondary. Page numbers = printed pages.
- **DLX-B** — the Deluxe base rulebook (`base.md`).
- **JD** — designer rulings on BGG (thread id).
- Card text: OnlineBoardGamers locale strings (via github.com/WJ-Lai/fcm-ai `raw/cards-authoritative.json`).
- Card counts: DLX module pages (see `employees.md` §2). Superseded: BGG 2357692 (138 cards, Splotter edition).

Each module can be used alone or combined. Confidence per module is given in its header.

## Module list (DLX p2–30) — High
| # | Module | Pages | Adds |
|---|---|---|---|
| 1 | New Districts | p3–4 | 5 map tiles (+ park tile with Lobbyists); apartments |
| 2 | Kimchi | p5–6 | Kimchi Master; kimchi food |
| 3 | Sushi | p7–8 | Sushi Cook/Chef; sushi food |
| 4 | Noodles | p9 | Noodle Cook/Chef; noodles food |
| 5 | Coffee | p10–14 | Barista line; coffee item; coffee shops; First Coffee Sold milestone |
| 6 | Lobbyists | p15–17 | Lobbyist; road and park tiles; roadworks; First Lobbyist Used milestone |
| 7 | New Milestones | p17–19 | 17 replacement milestones; 3 two-item airplane tokens |
| 8 | Ketchup | p20 | "Someone Sells your Demand" milestone |
| 9 | Fry Chefs | p21 | Fry Chef |
| 10 | Night Shift Managers | p22 | Night Shift Manager |
| 11 | Mass Marketeers | p23–24 | Mass Marketeer; extra marketing phases |
| 12 | Rural Marketeers | p25–26 | Rural Marketeer; rural area; 4 rural campaigns; 3 freeways; First Rural Marketeer Used milestone |
| 13 | Gourmet Food Critics | p26 | Gourmet Food Critic; 4 gourmet campaigns |
| 14 | Movie Stars | p27 | B/C/D Movie Stars |
| 15 | Reserve Prices | p28 | 18 alternate reserve cards |
| 16 | Hard Choices | p29 | remove-after-turn-2/3 tokens for base milestones |
| 17 | 6 Players | p30 | Siap Faji chain; 6-player track; 4x6 map |
Plus combined rules: Noodles + Sushi + Kimchi priority (p31–32).

## 0. General expansion rules (DLX p2) — High
- Components (DLX p1): 6 map tiles, 1 milestone board + 6 board add-ons (module milestone attachments), 6 milestone cards, 24 module milestone cards, 42 tracker tokens, 30 depletion markers ("Remove after turn 2/3"), 132 employee cards, 2 CEO cards, 8 road tiles, 8 roadwork tokens, 4 park tiles, 18 coffee shop tokens (3 per chain), 3 freeways, 1 rural area tile, 4 rural campaigns, 4 gourmet campaigns, 3 airplane tokens, 18 bank reserve cards, Siap Faji pieces (3 restaurants, 3 coming soon, marker, menu, freezer), 6-player track, coffee/noodle/sushi/kimchi tokens and 5x tokens for every item.
- 5x tokens = 5 of that item.
- **Tray changes (DLX p2):**
  - Kitchen Trainee "Any Cook": with Sushi, Kimchi, Coffee and/or Noodles, return all 12 base kitchen trainees and use the 12 Any Cook ones. Fry Chefs also uses them (p21).
  - Expansion Marketing Trainee: with Rural Marketeers, Gourmet Food Critics and/or Mass Marketeers, swap all 12.
  - Fry Chef cooks: swap base burger/pizza cooks (p21). Movie Star waitresses: swap base waitresses (p27).
- **Extra Luxuries Manager:** the expansion has **1** luxuries manager card. If any of Sushi, Kimchi, Coffee, Noodles is used, add it after the normal 1x setup (example: 3 players → 2 luxuries managers in the tray). **[DLX differs]** earlier spec listed 3 copies with 1 used.
- New 1x cards: 1 (2–3p), 2 (4p), 3 (5–6p).
- The 3 extra Executive VPs are never slotted at setup; they back up the "First recruiting girl used" reward (p2, p19).
- Ketchup supports 2–6 players; 6 players adds Siap Faji and a 6-player track.

---

## 1. New Districts (map tiles) — Medium-High
**Components:** 5 map tiles (U, V, W, X, Y in `map.md`), plus tile Z (two parks) used only with Lobbyists.

**Setup (DLX p3):** shuffle the 5 tiles into the base tiles and build the map normally (random tiles, random rotation). With Lobbyists, use the Lobbyist map setup instead (§2). Tile Z only with Lobbyists. 6 players must use this module (p30). Note the 5 new tiles are only *candidates*: a random draw may include none of them (scenario "Korean City" tells you to make sure an apartment tile is in the map).

**Rules (DLX p3–4):**
- **Tile U (three lemonades):** three separate sources. Road buyers collect 1, 2 or 3 depending on route (as if on different tiles); zeppelin collects all three.
- **Tile V:** houses 21 and 22, normal rules.
- **Tile W:** house 25 starts with a garden; cannot get another. The road dead-ends against the house and connects to it there.
- **Apartments (tiles X "π" and Y "9¾"):** an apartment is a "house" for every rule unless stated.
  - Whenever demand would be placed on an apartment, place **2 counters instead of each 1** (same type). So a "First radio campaign" radio places 4 (INF from "for each counter you would normally place", Medium-High).
  - **No maximum demand.** Demand stays until one chain satisfies all of it.
  - Cannot get a garden (a neighbouring house's garden next to it gives the apartment nothing). Can benefit from a park (Lobbyists).
  - Dinnertime order: π is between houses 3 and 4; 9¾ between 9 and 10.
  - π has 4 disconnected road stubs; no route passes through the building. Mailbox blocks do pass through it.
- First marketeer used (New milestones): $5 per counter, so $10 per marketing event on an apartment (DLX p18).

---

## 2. Lobbyists — Medium-High
**Components (DLX p15):** 6 Lobbyist cards; "First Lobbyist Used" milestone + module milestone attachment; 8 road tiles; 4 park tiles (either side usable); 8 roadwork tokens; tile Z (from New Districts). 5–6 players also need the New Districts tiles.

**Setup (DLX p15):**
1. Agree which (if any) of the 6 new map tiles are in the pool. With 5 or 6 players all 6 must be included. All base tiles are always in the pool.
2. Shuffle the pool; build the map normally. Keep the leftover shuffled tiles nearby for the milestone. Excluded tiles go back to the box and can never be used.
3. Place roads, roadworks and parks nearby.

**Lobbyist card (DLX p15 image):** entry level (hire directly), salary, not 1x, 6 copies, purple, road range 2. Can be fired normally.

**Action — sub-step "3f½" between Place houses & gardens (3f) and Place or move restaurants (3g):** place 1 road tile or 1 park tile on empty squares, adjacent to a road square within road range 2 of any of your entrance corners (DLX p15). [TYPE-IMPACT: new phase-3 step.]
- Roads may not hang off the map edge (DLX p15). Parks: DLX states no overhang rule; "on empty squares" implies on the map. Medium.
- Tiles are limited; when gone the lobbyist does nothing.
- Road and park tiles (`questions.md` Q-K1, resolved): KX-DLX printed p15 (PDF p16) component photo shows a 2-square road (under-construction side, outward arrow at each end), a 2-square road (finished side) and a 4-square road, and 4 park tiles: one 1x4 strip and three non-rectangular 4-square pieces. Full set, from the licensed OnlineBoardGamers implementation's component scans, consistent with that photo:
  - **8 roads:** 4 straight 2-square, 2 straight 4-square, 2 corner 3-square (an L with two 2-square arms). Each has its two arrows at its free ends, pointing outward.
  - **4 parks:** tetrominoes I (1x4), T, L, L. "Either side of a Park tile can be used" (p15), so the mirrored L is allowed. Any rotation.
  - The Road Route Example 1 drawing (printed p16) shows a 3-square straight road beside a 4-square one; no 3-square straight tile exists, so the drawing is taken as schematic. Medium-High.

**Roads (DLX p15–16):**
- Placed "under construction" side up. **One** arrow must point to either (A) any of your entrance corners, or (B) an orthogonally adjacent road square within road distance 2 of any of your entrance corners. The other arrow may point anywhere (or at an empty square). A road connected only to your entrance is legal (JD 2422153; matches A).
- An arrow may point at a roadwork token placed earlier this turn by anyone (do not stack another token).
- Put a roadwork token on each orthogonally adjacent road square an arrow points to.
- **Tracing road routes:** passing through a roadwork token adds +1 distance to the route; under-construction roads cannot be used for any route. **[DLX differs]** the earlier spec followed a community ruling that buyers are not slowed. DLX says "the route" without restriction, so roadworks cost +1 for every road route: dinnertime distance, buyer/marketeer/local-manager/lobbyist range, coffee routes. Medium-High. See `questions.md` Q-K2.
- Cleanup: remove all roadworks; flip roads; they are normal roads from now on.
- **Parallel roads:** the base DLX rule already connects every pair of orthogonally adjacent road squares (`base.md` §14), so new roads connect to any road square they touch. KX p7's sentence "if two roads run adjacent and parallel, they are considered connected" is not in DLX; it is now redundant. The KX-DLX p16 example 1 shows a route stepping sideways across parallel roads. High.

**Parks (DLX p17):**
- A house/apartment orthogonally adjacent to a park pays **x2** item price per item. A house with a garden adjacent (via any of its sides, garden included) pays **x3**. Several parks: only the first counts. No effect on distance, demand, demand caps, or sushi.
- Parks are not gardens (DLX p7).

**First Lobbyist Used milestone (DLX p17):** awarded to the first player(s) to place a road or park. Immediately place one extra map tile chosen from the leftover shuffled tiles (resolve in turn order). Rules: orthogonally adjacent to an existing tile, aligned to the grid; no range or road requirement; not adjacent to a tile edge that has an airplane or freeway aligned with any part of it. Restaurants, parks and roads may be placed on it this turn. No tiles left → nothing. Orientation of the new tile: not stated — player's choice (Medium). [TYPE-IMPACT: the map grid can grow during play, so it is not a fixed rectangle.]

---

## 3. New Milestones — High (text), Medium (some triggers)
**Setup (DLX p17):** each player uses the Expansion Milestones insert instead of the base milestone board (so no base milestones). Module milestones (Ketchup, First coffee sold, First rural marketeer used, First lobbyist used) sit in the module attachment and are used only with their modules. Each player puts a "Remove after turn 2" token on **First marketeer used**, **First trainer used**, **First recruiting girl used**. Place the 3 **new airplane campaigns** beside the board.
- New airplane tokens are numbered **4, 5, 6** with the same 1/3/5 widths as the base ones and an A/B item area (DLX p1, p17 images). DLX does not say whether they replace the base airplanes 4–6 or are only for the brand manager milestone. Recommended: they replace base airplanes 4–6 (same numbers cannot both be on the board). Medium. See `questions.md` Q-K3.

**Awarding:** as base (immediate; shared by all qualifiers in the same round; others cross it out in Cleanup). Most need a card **used**, not just played: a card is used if at least 1 of its effects resolves during Working 9–5, Dinnertime or Payday. Playing, training or paying salary does not count. Marketeers count only if they actually place a campaign (DLX p17).

**Hard choices built in:** after round 2 (its Cleanup), any of the three marked milestones still available is crossed out by all players (DLX p17).

| Milestone | Trigger | Effect |
|---|---|---|
| First marketeer used | Use any marketeer (place a campaign). | (1) +$5 for each demand counter placed on a house/apartment by a campaign placed by one of your marketeers, paid immediately in that phase. If the bank breaks in Marketing, play continues to the next Dinnertime (game can only end there). (2) Dinnertime: effective price = item price + distance − 2 (may go negative). Stacks with Ketchup −1. Pizza radios and the free mailbox are not linked to a marketeer: no $5. Apartments/rural area get 2 counters per marketing event → $10. |
| First marketing trainee used | Use a marketing trainee. | Free Kitchen Trainee and Errand Boy to the beach. Cannot be trained this turn (marketing comes after training). |
| First campaign manager used | Use a campaign manager. | This turn that manager may place a second tile of the same type (billboard or mailbox), same good, same duration, anywhere legal. Linked to both; returns when both are gone. Only once (not for a second manager this turn); cannot be saved. |
| First brand manager used | Use a brand manager. | If the airplane that gains the milestone is placed by that brand manager, it may carry 2 **different** items (same duration, up to 4), marketing item A then item B each time it runs. A second brand manager this turn gets nothing; if the brand manager placed a mailbox or billboard first, the ability is forfeited for the game (milestone still claimed); cannot be saved. |
| First brand director used | Use a brand director (any campaign type). | Every radio you place from now on is eternal (1 counter, never removed); the brand director running it is busy for the rest of the game, can never be played or trained, and cannot be fired unless required by lack of cash (it still has a salary). Only radios become eternal. |
| First burger sold | Sell a burger. | Your CEO has 4 slots for the rest of the game, regardless of reserve cards. |
| First pizza sold | Sell a pizza. | This round, for each of the first three houses that buy pizza (including the triggering one), the seller must place a radio campaign with 2 pizza counters (duration 2) on a legal square of the tile containing that house; no legal square → forfeit. Normal campaign otherwise, but not linked to a marketeer. **Tiles:** DLX says "a radio marketing campaign"; the only radio tokens are base radios #1–3, so use those (taken from the supply; none available → forfeit). Medium-High (Q-K4). |
| First lemonade sold | Sell a lemonade. | You may train cards that are **at work**, if the new card is the same colour. Normal training limits apply. The trained card stays in its slot and may act this turn only if the old card had not acted yet. |
| First beer sold | Sell a beer. | At Payday you may pay salaries with food/drink tokens (1 token = 1 salary; coffee excluded; noodles/kimchi/sushi count). Mix allowed. The $3-salary milestone does not reduce token payments. If you have no cash and cannot fire anyone, you must pay with tokens. |
| First soda sold (KX: "First coke sold") | Sell a soda. | Freezer (as base): 10 items. Coffee cannot be frozen. Kimchi follows Kimchi rules. Noodles and sushi can be frozen. |
| First recruiting girl used | Use a recruiting girl. | Take an Executive VP **from the employee tray** to the beach; never pay its salary. Only if the tray has none, take one from the box (expansion or base copy). **[DLX differs]** earlier spec took it from the reserve first. |
| First trainer used | Use a trainer. | Take a free Trainer to the beach. You no longer have to fire employees you cannot pay; you must still pay cash (and tokens if applicable) as far as able. |
| First discount manager used | Use a discount manager (its price modifier applies in Dinnertime). | From now on, each round (DLX: "including this one") in which you discount by $3 or more, remove $100 from the bank at the end of Restructuring, out of the game. Applies per holder. Timing conflict unresolved: the milestone is earned at Dinnertime, after this round's Restructuring. Recommended: first removal next round. Low (Q-K5). |
| First house built | Build a house (New Business Developer combo token). Garden-only placement: not stated — Medium (a garden is not a house). | You may stack training actions on one employee (as base "First to pay $20"). |
| First new restaurant | Place a new restaurant (local or regional manager). | Build a free permanent (eternal) mailbox anywhere within "mailbox range" of the just-placed restaurant (a line that does not cross roads), marketing any item you choose. Not linked to a marketeer (no $5). **Tile:** a mailbox token from the supply (base #7–10), Medium (Q-K4). |
| First waitress used | Use a waitress (she earns cash). | Your salaries are $3 per salaried employee instead of $5. Recruiting manager/HR discounts are still $5 each. Token payment still 1 token per employee. |
| First cart operator used | Use a cart operator. | Cart operators and zeppelin pilots collect 4 per source (instead of 2); truck drivers 6. Applies to the triggering haul. |

Card count: 17 (DLX p18–19). Base milestones are not used with this module.

---

## 4. Coffee — High (rules), Medium (route tie-break algorithm)
**Components (DLX p10):** Barista Trainee x12 (entry, no salary, 1 coffee), Barista x6 (salary, 2 coffee), Lead Barista x3 (1x, salary, 5 coffee); 3 coffee shops per chain (18); 40 coffee tokens; "First coffee sold" milestone + attachment; +1 luxuries manager. [TYPE-IMPACT: coffee item, coffee shop map entity.]

**Rules (DLX p10–14):**
- Coffee is produced in the "get food & drinks" step. It cannot be marketed. It is **not** a drink (no drink milestones, no "drink marketed" bonus). It cannot be stored in a freezer; discard all in Clean up.
- **Coffee shops:** 1x1, entrance on all 4 sides (connect to every orthogonally adjacent road), sell only coffee. Valid starting points for the range of all cards (buyers, marketeers, local manager, lobbyist) (DLX p10).
- **Placing a coffee shop** — only 3 ways: train barista trainee → barista; train barista → lead barista; the First coffee sold milestone.
  - Empty square, orthogonally adjacent to a road, on a tile with no coffee shop (max 1 per tile, all players combined).
  - Via training: within road range 2 of one of your restaurants or coffee shops. Via milestone: anywhere.
  - If all 3 of yours are on the map, you may instead move one.
- **Dinnertime coffee:** first choose the restaurant exactly as normal, ignoring coffee entirely. If the house eats out, it follows a shortest route (in tiles crossed) to that chain: to any of its open restaurants at the winning distance (KX p12 Example 1, p14 Example 3). It buys 1 coffee at each restaurant entrance or coffee shop of a chain that has coffee, adjacent to the route, other than the route's own end restaurant (another restaurant of the same chain on the way can sell). Each location sells at most 1 per house. A route may trace road squares again and go round loops (DLX p10 Backtracking; KX p13 Example 2, p14 Example 4); only an immediate U-turn is forbidden.
  - Among shortest routes: take the one selling the most coffee. Within a tile, the route bends as far as needed to pass more coffee if that does not add distance (DLX example 4).
  - If several shortest routes tie on coffee, only the locations common to **all** tied routes sell; the undecided parts sell nothing.
  - Price per coffee = seller's unit price, including garden (and park) multipliers and bonuses from cards. Not a drink for milestone bonuses, and not food or drink for "First to Throw Away Food or Drink" (KX p10). CFO applies.
  - Fry Chefs: a chain selling coffee to a house gets its Fry Chef bonus once for that house, however many coffees; not again if it also served the meal (JD BGG 2342129, 3087088).
- **First coffee sold:** first player(s) to sell coffee each place 1 coffee shop in the Cleanup of that round, in turn order, normal placement rules, no range limit (DLX p11). [TYPE-IMPACT: a Cleanup sub-step.]
- Selling coffee is mandatory for the house: 1 per passed location with coffee; the destination restaurant never sells coffee (DLX p11).

---

## 5. Kimchi — High
**Components:** Kimchi Master x3 (1x, hire directly, salary); kimchi tokens; +1 luxuries manager.

**Rules (KX p11; DLX p5–6):**
- Kimchi Master does nothing in phase 3. In Clean up, **after** food is discarded/frozen, its owner gains 1 kimchi (mandatory). This kimchi is kept automatically until next turn.
- Kimchi cannot be marketed.
- **Dinnertime:** among chains that can fully satisfy the house (normal rules), a chain that also has kimchi is preferred, regardless of price and distance. Among several such chains, use normal competition (price + distance, waitresses, turn order). Only if none has kimchi do normal rules decide.
- The chosen chain also sells exactly 1 kimchi (if it has any), paid like any other item. Never more than 1 kimchi per house. Never to a house without its own demand.
- Freezer: up to 10 kimchi may be frozen, but if any kimchi is frozen, nothing else may be.

---

## 6. Sushi — High
**Components:** Sushi Cook x6 (produce 2), Sushi Chef x3 (1x, produce 5); sushi tokens; Any-Cook kitchen trainees; +1 luxuries manager.

**Rules (KX p11; DLX p7–8):**
- Produced like food. Cannot be marketed. Counts as food for milestones; can be frozen.
- Only houses **with a garden** (not park-only, not apartments, not rural) want sushi. Such a house first looks for chains with **at least as many sushi as its total demand tokens** (sushi replaces all food and drink). If found, it eats sushi there (normal competition among them). Otherwise, normal rules ignoring sushi.
- All-or-nothing: no mixing sushi with other items.
- Selling: remove all demand tokens; remove that many sushi. Paid as normal items (garden doubling applies).
- Sushi cannot substitute for coffee.

---

## 7. Noodles — High
**Components:** Noodle Cook x6 (produce 6), Noodle Chef x3 (1x, produce 16); noodle tokens (incl. large x5); Any-Cook trainees; +1 luxuries manager.

**Rules (KX p11; DLX p9):**
- Produced like food; cannot be marketed; counts as food for milestones; can be frozen.
- Only if **no** chain can satisfy a house (and, for garden houses, no chain has enough sushi), the house looks for chains with at least as many noodles as its total demand tokens. Normal competition among them.
- All-or-nothing; no mixing. Applies to houses, apartments and the rural area.
- Noodles cannot substitute for coffee.

### Combined priority (Kimchi + Sushi + Noodles) (KX p11; DLX p31–32)
Garden house — first applicable tier wins; normal competition within a tier:
1. enough sushi + 1 kimchi
2. exact items + 1 kimchi
3. enough noodles + 1 kimchi
4. enough sushi
5. exact items
6. enough noodles

House without a garden: 1. exact + kimchi, 2. noodles + kimchi, 3. exact, 4. noodles.

---

## 8. Ketchup ("Someone sells your demand") — High
**Components:** Ketchup milestone cards.

**Rules (KX p13; DLX p20):**
- At the **end** of a dinnertime, a player gains the milestone if, during that dinnertime, another player sold to a house carrying demand created by this player's marketeer. Several players can earn it from one sale. It cannot affect the dinnertime in which it was earned.
- Effect: during dinnertime your score is unit price + distance − 1. No effect on any other range rule. One per player. Stacks with First marketeer used (−2). Works for drink-only orders.
- Implementation needs each demand token tagged with the player whose campaign placed it. DLX says demand "your Marketeer created" (p20), so pizza radios and the free mailbox (not linked to a marketeer) do not count. Medium-High.

---

## 9. Fry Chefs — High
**Components:** Fry Chef x6; replacement burger/pizza cooks; Any-Cook trainees.

**Rules (KX p13; DLX p21):**
- Train a fry chef from any cook (burger, pizza, sushi, noodle). It is a kitchen (green) card. Salary: yes (DLX p21 card image, High).
- Each fry chef at work: +$10 per sale (per house, apartment or rural area sold to), regardless of item count. Not unit price; no effect on house choice. Multiple fry chefs stack. CFO applies (income).
- Coffee sales count: once per house a chain sells coffee to, not again for the chain that served the meal (JD BGG 2342129; see §4).
- Example: 3 burgers at $20, 2 fry chefs → $60 + $20 = $80.

---

## 10. Mass Marketeers — High
**Components:** Mass Marketeer x6; expansion marketing trainees.

**Rules (KX p14; DLX p23–24):**
- Trained from a marketing trainee. A marketeer for all purposes (e.g. base "First Billboard Campaign" salary waiver does **not** list it — that waiver names only campaign managers, brand managers and brand directors). Salary: yes (DLX p23 image, High).
- It places no tile. For each mass marketeer **played in a work slot** (all players combined), run one **extra** full marketing phase in phase 6.
- Run all campaigns once in number order, then again for each extra phase. Remove only one duration token from each campaign, after the last pass.
- Demand caps (3 / 5 with garden) still apply.

---

## 11. Night Shift Managers — High
**Components:** Night Shift Manager x3.

**Rules (KX p14; DLX p22):**
- Hired directly (entry sparkle on the card, DLX p22 image — the rule text does not say so); salary; cannot be trained; 1x; black manager card.
- A manager with **0 slots**; may only sit in a CEO slot.
- While at work: every employee in your structure **without a salary icon** acts a second time ("as if you played two copies"). The CEO does not.
- Clarifications: a trainer cannot train the same employee again unless a milestone allows stacking; a marketing trainee may start a second billboard (both busy chips on her; she returns when both end); a waitress earns double and counts as 2 waitresses for ties; a management trainee gains no slots.
- Literal reading implies a pricing manager gives −$2, a recruiting girl hires 2, an errand boy fetches 2 (each with milestone bonus), a kitchen trainee makes 2. Not explicitly confirmed — Medium.

---

## 12. Rural Marketeers — Medium-High
**Components (DLX p25):** Rural Marketeer x6 (salary, DLX image); "First Rural Marketeer Used" milestone (card text: place highway offramp); rural area tile; 4 rural marketing campaigns (giant billboards, ∞ side, no visible number); 3 freeway tokens; expansion marketing trainees. [TYPE-IMPACT: rural area entity, rural campaign kind, freeway entity.]

**Rules (DLX p25–26):**
- Trained from a marketing trainee; a marketeer.
- In Launch Campaigns (3d), a rural marketeer may place a rural campaign adjacent to one side of the rural area tile (one per side → max 4). Put 1 item counter of any item eligible to be marketed (not coffee, kimchi, sushi, noodles). Always eternal; the marketeer is busy for the rest of the game. Only rural marketeers may place them. No range limit.
- **First Rural Marketeer Used:** the first player(s) to use one may (optional) place one freeway immediately, in that player's Working 9–5: adjacent to the outer edge of a map tile, orthogonally adjacent to a road on 1 or more squares; may not overlap any part of an airplane's position. Freeways run out → no more.
- Run order of rural campaigns in phase 6: not stated (no number). Recommended: after all numbered campaigns (Medium; Q-K6).
- **Marketing:** each giant billboard places **2** tokens of its good on the rural area per marketing phase. Rural area has no maximum demand. Its token is never removed.
- **Dinnertime:** the rural area is a house that always eats **last**. Distance between it and restaurants is computed starting from any freeway (DLX p26). Must fully satisfy its demand as usual. DLX gives no more detail. Recommended: the freeway is a house connection to the road square(s) it touches; distance = tile borders crossed from there, so the touched tile is distance 0. Low-Medium (Q-K7). With no freeway, nobody can reach it. Fry chef bonus and apartment-style 2-counter marketing apply ("Apartments and the Rural area receive two counters per Marketeer", p18).

---

## 13. Gourmet Food Critics — High
**Components (DLX p26):** Gourmet Food Critic x6 (salary); 4 gourmet campaign tokens, numbered (DLX images show **20**; base campaigns end at 16, so 17–20) — Medium-High; expansion marketing trainees. [TYPE-IMPACT: gourmet campaign kind.]

**Rules (KX p15; DLX p26):**
- Trained from a marketing trainee. In the marketing step, place a gourmet guide beside the board (location irrelevant). 1–3 tokens of one good (card: max duration 3). The critic is busy while it runs.
- In phase 6, in number order, the guide places 1 demand of its good on **every house with a garden**. Not apartments, not park-only houses, not the rural area. Normal demand caps apply (5 for garden houses).

---

## 14. Reserve Prices — High
**Components:** 18 alternate reserve cards (each player: +$200 "Base price $5", +$200 "Base price $10", +$200 "Base price $20"). Base reserve cards are not used.

**Rules (KX p16; DLX p28):**
- Choose a reserve card at setup as usual.
- First bank break: add **$200 per player**. CEO slots do not change.
- New base unit price for the rest of the game = the price on the most frequent revealed card. Tie: $20 beats $10 and $5; $5 beats $10. (So a $5/$20 tie → $20.)
- Use the new base price in dinnertime (modifiers apply on top).

---

## 15. Movie Stars — High
**Components (DLX p27):** one B-, one C-, one D-Movie Star card (1x, salary, purple); 12 replacement waitresses. **[DLX differs]** earlier spec said 3 copies of each.

**Setup:** 2–3p: B only. 4p: B and C. 5–6p: B, C, D.

**Rules (KX p16; DLX p27):**
- Train a waitress into any available movie star (normally the first player takes B).
- All movie stars together are one 1x type: max one per player.
- Salary: yes. No income (not waitresses).
- **Order of Business:** players with a movie star at work choose their position before everyone else: B, then C, then D; then the rest by open slots.
- **Dinnertime:** a tie that would be decided by waitresses is won by a player with a movie star at work; B beats C beats D beats players without one.

---

## 16. Hard Choices — High
**Use only with the base milestone set.**

**Setup (DLX p29):** each player puts "Remove after turn 2" on First Burger Marketed, First Pizza Marketed, First Drink Marketed, First to Train an Employee, and "Remove after turn 3" on First to Hire 3 Employees in 1 Turn.

**Rule:** in the Cleanup of round 2, any of the turn-2 milestones still available are crossed out for everyone; in the Cleanup of round 3, the hire-3 milestone likewise (DLX p29).

---

## 17. Six Players — High (rules), Medium (bank)
- Add Siap Faji (3 restaurants, marker, menu), 6-player track.
- Map: 4x6 grid. Must use New Districts.
- 1x cards: 3 copies each (as 5 players).
- No other rule changes. Bank = $50 x 6 = $300 and no billboards removed follow from the base formulas (INF, Medium).

---

## 18. Suggested scenarios (KX p6) — informational
New milestones; Your first cup of coffee (Coffee ± New milestones); Korean city (New districts + Kimchi); Nightlife (New milestones + Night shift); Sustenance (Coffee + Fry chefs); Upmarket area (New milestones + park tile + Gourmet + Sushi); City builder (Lobbyist + New districts + Rural); Asian fusion (Sushi + Kimchi + Noodles + Ketchup); First mover (Hard choices + Ketchup + Movie stars + Lobbyists + Reserve prices); Overtime (Night shift + Mass + Rural + New districts + Noodles + Reserve prices); Henri Lo menu (all except 6 players & Hard choices).

---

## 19. Open items
All remaining ambiguities are in `questions.md` (Q-K1 … Q-K8). Resolved on 2026-10-01 from DLX:
- Parallel roads: connect everywhere, including base edge roads (DLX base p8, p21). See `base.md` §14.
- Salary icons on mass marketeer, rural marketeer, fry chef, sushi cook: all yes (card images).
- Pizza radios use base radio tokens; free mailbox uses a base mailbox token (Medium-High / Medium).
- DLX name "First soda sold" is used (KX: "First coke sold").
