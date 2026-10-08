# Tutorial plan: learning Food Chain Magnate on the real board

Design for an interactive tutorial that teaches the full base game to someone who has never played, then each Ketchup module one by one. Read with `docs/rules/*` (what the rules are), `docs/architecture.md` (engine API, `StateBuilder`, `LocalTransport`), `docs/ux-plan.md` §7 (board signals) and `docs/animation-plan.md` (timeline, replay, Follow the action). Nothing here changes a rule; the tutorial narrows what the learner may do and explains what the engine did.

Evidence: the current UX was driven with Playwright on the vite dev server (hot-seat first-restaurant prompt, the `working` / `dinnertime` / `restructuring` / `ketchup` fixtures at 1280×860 and 390×844). What exists today and matters for teaching: the Turn panel already explains each prompt in one line; the Work panel shows sub-step chips and per-card status with `disabledReason`; the Inspect card shows "who can sell" with `$price + distance`; Dinnertime and Marketing have a Summary stepper with "Watch again" / "Play from here"; the board publishes `window.__fcmBoard.project()` and `data-anim`, and `inspectIds` / `cameraCommand` ring and frame pieces. The tutorial builds on these instead of inventing a second UI.

---

## 1. Learning design

### 1.1 Personas

**Nova, board-game novice.** Plays phone puzzle games; has never read a rulebook. Does not know what "turn order", "supply" or "hand" mean. Needs: one idea at a time, the board doing the talking, immediate feedback, short sessions (5–8 min), a visible sense of progress, never a wall of text, never a dead end. Fears looking stupid: the tutorial never says "wrong", it says what happened and why.

**Kai, gamer new to FCM.** Has played Catan, Ticket to Ride, maybe Brass. Knows turns, phases, cards, money. Has heard FCM is brutal. Needs: the FCM-specific ideas fast (org chart, price + distance, demand caps, milestones, the bank), the ability to skip what is obvious, and a "why" after each automatic phase so the system becomes legible. Wants to get to a real game vs a bot quickly and then have a coach available.

Both are served by the same lessons: Nova takes every step, Kai uses **Skip step** (applies the canonical action) and **Skip lesson** (marks it seen, not passed), and both get the same check-yourself quiz.

### 1.2 Principles

1. **One concept per step.** A step teaches one rule or one move. If a step needs an "and", split it.
2. **Learn by doing on the real board.** Every lesson runs the real engine through `LocalTransport` on a real `GameState` built with `StateBuilder`. Nothing is faked: the learner's click is a real `Action`, validated by the engine.
3. **Constrain, then release.** Early steps allow exactly one action (the gate lets one legal action through). Later steps allow a family ("any billboard spot in range"), then "anything legal". The last lesson is a full game.
4. **Explain why after each automatic phase.** Dinnertime, Payday, Marketing and Clean up run without input. The tutorial pauses after each (engine `tutorial.continue`, §4.2), replays it house by house with the Summary stepper and narrates the numbers ("$10 + 1 border = 11 beats $10 + 2").
5. **Never a wall of text.** Narration is at most two sentences. Anything longer goes to the glossary behind a "What's this?" link.
6. **Can't get stuck.** Every step has a success predicate the engine can reach, an inactivity hint, and **Skip step** which applies the canonical action. A watchdog auto-advances if no allowed action is legal (and logs a bug in dev).
7. **Skippable but resumable.** Progress is per step; a lesson resumes at its last checkpoint by replaying the recorded actions (deterministic engine replay), so resuming is exact.
8. **Say the number.** Every rule with arithmetic (price + distance, salary total, demand cap, open slots) is shown as a chip with the actual numbers from the view, next to the piece.
9. **Honest about randomness.** There is none in play; the tutorial says so once ("Dinnertime is pure arithmetic; you can predict it") because that is the game's central promise.

### 1.3 Pacing

Each lesson is 5–10 minutes: 8–16 steps, one automatic-phase walkthrough at most, a 3-question check. The base course:

| Lesson | Title | Minutes |
|---|---|---|
| L1 | The town | 5 |
| L2 | Your restaurant | 6 |
| L3 | The CEO and your first hire | 7 |
| L4 | Making food | 6 |
| L5 | Dinnertime: who sells and why | 8 |
| L6 | Prices and competition | 9 |
| L7 | Marketing creates demand | 9 |
| L8 | Drinks and buyer routes | 8 |
| L9 | Building a company | 10 |
| L10 | Turn order and open slots | 5 |
| L11 | Payday and salaries | 8 |
| L12 | Milestones | 8 |
| L13 | Houses, gardens and new restaurants | 9 |
| L14 | The bank, reserve cards and the end | 8 |
| L15 | Guided game vs an Easy bot | 35–45 |
| L16 | Free play with a coach | open |

Base course: about 110 minutes of lessons plus a 40-minute guided game, roughly 2.5 hours, in sessions as short as one lesson. The Ketchup course (§3) is 17 lessons of 4–8 minutes, about 1.5 hours, in any order after their prerequisites.

### 1.4 Explaining the hard ideas, concretely

All examples use the **tutorial town** (§2.0): a 3×3 map, the learner (Ada, red) on tile A1, the scripted rival (Bo, yellow) on tile C2.

**Org chart and CEO slots (L3, L9).** The CEO is shown first alone on the chart with three empty dashed slots under it ("three slots: three employees can work"). The first hire goes to the **beach** panel, not the chart: "hired today, works tomorrow". In L9 the learner drags a Management Trainee into a CEO slot and sees two new slots appear under it: "a manager turns one slot into two". Then they try a Junior VP under the trainee and the editor refuses ("managers only report to the CEO"), which is the whole pyramid rule in one failed drag. Overfill is demonstrated by the scripted rival: Bo submits five cards into three slots, the reveal shows Bo's chart collapse to the CEO with the penalty banner, and the narration says "too many cards: everyone but the CEO goes to the beach".

**Training vs hiring (L9).** Side by side on the chart: hiring takes a card from the **supply pile** (the Staff tab shows "Waitress ×12"), training **replaces** a card you already own with the next one on its career line (the Trainer flips the beach Errand Boy into a Cart Operator; the pile counts change −1 Cart Operator, +1 Errand Boy). The learner tries to train a Waitress and the picker shows "no career path". Then they try to train the Errand Boy that is at work and the picker says "only beach cards can be trained".

**Price + distance at dinnertime (L5, L6).** House 18 has one burger. Ada's restaurant is 1 tile border away (A1 → A2), Bo's is 2 (C2 → B2 → A2). The Inspect card shows `Ada $10 + 1 = 11` above `Bo $10 + 2 = 12`. The replay draws the winning van along the road and ticks a border counter at each seam (the route overlay's tick marks from ux-plan §3.1). Then Bo plays a Pricing Manager: `Bo $9 + 2 = 11`, tie, and the tie-break chain is narrated as three chips: waitresses at work (0 vs 0), then turn order (Ada is earlier). Then Ada's own price goes to $9 and she wins outright. Three dinners, same house, three outcomes.

**Marketing and demand caps (L7).** The billboard ghost shows a pulsing ring on every house it will reach before the learner commits (the campaign reach preview). After Marketing runs, the learner sees house 18's roof plaque fill to 3 pips and the narration says "a house holds 3; with a garden, 5". The second Marketing pass shows the "full" chip on house 18: "the campaign ran, but the house was full, so nothing was added; one duration pip was still removed".

**Salaries and firing (L11).** The chart gets a `$` badge on every salaried card (the `tag-salary` icon that exists), and a running "Payday: $15" total in the panel. The learner has $10. Payday opens the fire picker with "You owe $15 and have $10: fire until you can pay" and the one-card Cart Operator is the only way out. The second round shows the voluntary case: $30 cash, $15 owed, fire nothing or fire the idle card.

**Milestones: first come, permanent (L12).** The Milestones tab is pinned open with "First Billboard Campaign" highlighted. The learner places a billboard; the milestone card stamps and slides to Ada's rail. The narration: "yours for the rest of the game, and you must live with it: your campaigns are now eternal". Bo, scripted, places a billboard the same round and also claims it ("same round: everyone who qualifies gets it"). At Clean up the tab shows the milestone greyed with "Gone": "nobody else can ever claim it".

**The bank breaking and reserve cards (L14).** The top bar bank counter is the focal point. The scenario starts with $12 in the bank and two sales worth $20 coming. The replay stops at the sale that hits $0: the counter cracks, the reserve cards flip ("you chose +$200, 3 slots; Bo chose +$100, 2 slots; the slot vote has no majority, so the highest wins: 3"), the bank refills and the sale finishes. A second scenario breaks it again: "no refill; after this Dinnertime the game ends; most cash wins".

**Simultaneous restructuring (L9, L10).** The learner's chart editor is open while Bo's rail shows "deciding…", then "done" with a lock. "Nobody sees your chart until everyone has submitted; the reveal is at once." Open slots are then counted on both charts side by side and the turn order prompt appears: "most open slots chooses first".

---

## 2. Base course curriculum

### 2.0 The tutorial town (shared scenario base)

All base lessons use one fixed 2-player map so the learner builds a mental model of one place. Verified with `stateBuilder().tiles(...)` and `engine.houseOutlook` (script in the scratchpad; the fixture test in WP-T2 pins these numbers).

```ts
// packages/engine/src/testing/fixtures/tutorialTown.ts
export const TUTORIAL_MAP = [
  ['A', 'O', 'S'],   // row 1: house 2 + cross | beer + cross | soda + beer + cross
  ['K', 'C', 'N'],   // row 2: house 18 (U)   | house 5 (ring) | beer (T)
  ['T', 'D', 'B'],   // row 3: lemonade cross | house 7 (U)   | house 4 cross
];
export function town(opts: { round: number; seed?: number }) {
  return stateBuilder({ players: ['Ada', 'Bo'], seed: opts.seed ?? 1000 + opts.round })
    .tiles(TUTORIAL_MAP)
    .round(opts.round)
    .restaurant('p1', 3, 3, 'NW')    // Ada: tile A1, entrance on the N–S road of tile A
    .restaurant('p2', 11, 8, 'NW');  // Bo: tile C2, entrance on the row-2 road of tile N
}
```

Facts the lessons rely on (tile labels as the board rim shows them: columns A–C, rows 1–3):

| Piece | Where | Note |
|---|---|---|
| House 2 | A1, cells (0–1, 3–4) | distance 0 from Ada, 3 from Bo |
| House 18 | A2, cells (2–3, 6–7) | Ada 1, Bo 2: the competition house |
| House 5 | B2, cells (7–8, 6–7) | Bo 1, Ada 2 |
| House 7 | B3, cells (6–7, 11–12) | Bo 2, Ada 3 |
| House 4 | C3, cells (13–14, 10–11) | Bo 3, Ada 4 |
| Beer | B1 (6,0), C1 (10,3), C2 (11,6) | cart from Ada: B1 beer at 1 border, C1 beer at 2 |
| Soda | C1 (13,0) | |
| Lemonade | A3 (1,11) | 2 borders from Ada |

Opponent: Bo is **scripted** in L1–L14 (every Bo action is in the lesson file), **Easy bot** in L15–L16. Bank: $100 (2 players), reserve cards Ada +$200 / Bo +$100 unless a lesson says otherwise. Lessons that start mid-round build the exact state with the builder and set `phase` / `turn` as the engine fixtures do (`fixtures/index.ts` `workingFixture` is the pattern).

Step table columns: **Say** (narration, ≤ 2 sentences), **Show** (highlight targets, §4.1 `Target`), **Allow** (action filter; `—` = no action, Next button only), **Until** (success predicate), **Then** (feedback / branch). Hints fire after 20 s of inactivity (10 s on steps with a single target) and repeat once with the target pulsed.

### L1 — The town

**Goal.** Read the map: tiles, roads, tile borders, houses with numbers, drink sources. **Concepts.** `tile`, `tile-border`, `road`, `house`, `drink-source`, `distance`.

**Scenario.** `town({ round: 1 }).phase({ kind: 'setup.restaurants', ... })` but with **no restaurants** yet and the tutorial viewer as spectator. Pure exploration; no game action.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | This is a town of nine map tiles. Each tile is five squares wide. | camera: whole board; tile seams pulsed | — | Next | |
| 2 | Tiles have letters and numbers on the rim. Tap tile B2. | rim labels B, 2 | board tap | `boardHover.cell` inside B2 | "That's B2: the ring road with house 5." |
| 3 | Roads connect wherever two road squares touch, even across a tile border. | roads A1→A2 ringed; the seam between them pulsed | — | Next | |
| 4 | Distance in this game is the number of tile borders a road trip crosses. From A1 to C1 is 2. | animated tick marks on the seams A1|B1 and B1|C1 along row 2 | — | Next | |
| 5 | Houses have numbers. Tap house 18. | house 18 | board tap (object pick) | `selection = house 18` | Inspect card opens: "0 demand, cap 3". |
| 6 | Houses eat only when they have demand. Nobody has demand yet; marketing will change that later. | Inspect card demand pill | — | Next | |
| 7 | The bottle icons are drink sources: beer, lemonade, soda. Restaurants fetch drinks from them. | all 5 sources ringed | — | Next | |
| 8 | Tap the lemonade source. | source at A3 | board tap | `selection = source (1,11)` | "Lemonade, on tile A3." |
| 9 | Top view can make counting easier. Toggle it, then back. | `[data-tutorial=camera-top]` | ui | `topView` toggled twice | |

**Check yourself.** (1) Tap the house that is 1 border away from tile A1 by road (house 18). (2) How many tile borders from the beer at B1 to the soda at C1? [0 / 1 / 2] → 1. (3) What makes a house eat? [Its number / Demand tokens / Being near a road] → demand.

### L2 — Your restaurant

**Goal.** Place the first restaurant legally; understand the entrance and the one-entrance-per-tile setup rule. **Concepts.** `restaurant`, `entrance`, `setup-placement`.

**Scenario.** `town` without restaurants; `phase: setup.reserve` (reserve cards come before first restaurants, DLX p4 steps 5–6), so row 6 below runs first; the engine then opens `setup.restaurants` with order `['p2','p1']` (reverse turn order, Bo first), Bo scripted to place at (11,8) NW.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Bo placed first because the last player in turn order places first. Your turn. | Bo's restaurant; turn order chips | — | Next | |
| 2 | A restaurant is a 2×2 block with one corner that is the door. The door must touch a road square. | ghost at (3,3) with door marker | — | Next | |
| 3 | In setup, a tile may hold only one door. Tile C2 is taken by Bo, so it's greyed. | tile C2 dimmed; eligible tiles tinted | — | Next | |
| 4 | Place your restaurant on tile A1 beside the vertical road, door at the top-left. | tile A1; spot (3,3) NW | `setup.placeRestaurant` with `x:3,y:3,entrance:'NW'` only | `restaurantPlaced` for p1 | "Open for business. House 2 is on your tile: distance 0." |
| 5 | Try hovering an illegal square to see why it is illegal. | a square on tile C2 | hover only | `placementReason` non-null once | Phone: a tap shows the reason in the strip. |
| 6 | Each player picks a reserve card in secret. Pick +$200 for now; Lesson 14 explains it. | reserve cards | `setup.chooseReserve amount:200` | `reserveChosen` p1 | Bo (scripted) picks +$100. |

**Check.** (1) Which corner is the door? (tap it on your restaurant: entrance marker). (2) May your door share a tile with Bo's door in setup? [Yes / No] → No. (3) Later in the game (Lesson 13), may it? → Yes.

### L3 — The CEO and your first hire

**Goal.** Restructuring with only the CEO; hire one card; hand, beach, at work. **Concepts.** `ceo`, `hire`, `beach`, `at-work`, `entry-level`, `supply`.

**Scenario.** `town({ round: 1 })` after setup: both restaurants placed, reserves chosen, `phase: restructuring`, round 1. Bo scripted: submits CEO only; in Working hires a Kitchen Trainee.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Every round starts with Restructuring: you decide which of your cards work today. You only have the CEO, and the CEO always works. | Company tab, CEO card | — | Next | |
| 2 | Submit your structure. | `[data-tutorial=submit-structure]` | `restructure.submit` (CEO only) | `structureSubmitted` p1 | Bo's rail flips to done; reveal animation. |
| 3 | Both charts are revealed at once. Turn order: with equal open slots, last round's order stands. | both rails; order track | — | `phase = working` | (Order of business is automatic in round 1; L10 explains.) |
| 4 | Working 9–5: each card at work does its job, in a fixed sub-step order. The CEO's job is to hire one person. | stage chips; CEO card "Can act" | — | Next | |
| 5 | Tap the CEO, then hire a Kitchen Trainee. Only cards with the sparkle are entry level. | CEO card; HirePicker; Kitchen Trainee card | `work.recruit employeeId:'kitchen_trainee'` | `employeeHired` | "She goes to the beach: hired today, works from next round." |
| 6 | Open the Staff tab. The pile shows Kitchen Trainee ×11 now; piles are limited. | Staff tab, kitchen trainee node | ui | tab opened | |
| 7 | End your turn. Bo hires too. | End turn | `work.endTurn` | `turnEnded` p1 | Bo's scripted hire plays; caption "Bo hired a Kitchen Trainee". |
| 8 | Dinnertime, Payday, Marketing, Clean up now run by themselves. Nothing happens yet: no demand, no salaries, no campaigns. | phase strip | — | pause after cleanup → Next | "Round 2 starts; your cards come back to your hand." |

**Check.** (1) Where does a hired card go? [Beach / At work / Hand] → Beach. (2) Which cards can be hired directly? [Any / Sparkle cards / Managers] → sparkle. (3) How many people can the CEO hire per round? → 1.

### L4 — Making food

**Goal.** Put a card to work; produce; stock; unsold food is thrown away. **Concepts.** `produce`, `stock`, `cleanup-discard`, `kitchen-trainee`.

**Scenario.** `town({ round: 2 })`, Ada: CEO + Kitchen Trainee in hand; Bo same. `phase: restructuring`. Bo scripted: Kitchen Trainee at work, makes a pizza.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Drag the Kitchen Trainee into a CEO slot. Cards in slots work today; cards left in hand go to the beach. | hand card; CEO slot 1 | ui drag/tap | draft has trainee under CEO | |
| 2 | Submit. | submit | `restructure.submit` with trainee in ceoSubs | `structureSubmitted` | reveal; Bo did the same. |
| 3 | Turn order: you both have 2 open slots, so last round's order holds. Pick position 1. | order slots | `order.choosePosition 1` | `orderChosen` p1 | Bo takes 2. |
| 4 | The CEO could hire again. Skip hiring this time: tap the CEO and choose Skip. | CEO card | `work.skip` (CEO) | `cardSkipped` | "Hiring is optional." |
| 5 | Tap the Kitchen Trainee and make a burger. | trainee card; burger option | `work.produce food:'burger'` | `foodProduced` | Rail shows 1 burger; "the whole chain shares one stock". |
| 6 | End turn. Dinnertime: no house has demand, so nothing sells. | — | `work.endTurn` | pause after dinnertime | Summary: "No house ate". |
| 7 | Clean up throws away unsold food. Your burger is gone. | rail goods; Summary cleanup line | — | pause after cleanup → Next | "Make food the round you can sell it." |

**Check.** (1) Which food did your Kitchen Trainee make? → whichever you picked (reads the view). (2) What happens to unsold food at Clean up? [Kept / Thrown away / Sold at half price] → thrown away. (3) Is producing optional? → Yes.

### L5 — Dinnertime: who sells and why

**Goal.** Watch a house buy; the three conditions (road connection, full order, lowest price + distance); where the money comes from. **Concepts.** `dinnertime`, `demand`, `house-order`, `full-order`, `unit-price`, `price-plus-distance`.

**Scenario.** `town({ round: 3 })`, start of **Working** with Ada's turn already done and Bo's turn done (phase `working`, idx 2 — or simpler: `phase: dinnertime` with `houses: b.houseOrder(), idx: 0` so the pause fires at once). Demand placed by the builder: house 2 `['burger']`, house 18 `['burger','burger']`, house 5 `['pizza']`. Ada stock: 2 burgers. Bo stock: 1 pizza, 1 burger. Bank $100.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Three houses have demand now (Lesson 7 shows how it got there). Dinnertime goes house by house in number order: 2, then 5, then 18. | houses 2, 5, 18 plaques | — | Next | |
| 2 | Tap house 2. It wants 1 burger. Who can sell? | house 2; Inspect "Who can sell" | board tap | `selection = house 2` | Card: `Ada $10 + 0 = 10 wins`, `Bo $10 + 3 = 13`. |
| 3 | Tap house 18. It wants 2 burgers. Bo has only 1, so Bo can't deliver the full order at all. | house 18; Bo row "can't supply" | board tap | selection | |
| 4 | Let dinner run. | Continue | `tutorial.continue` | `phase` past dinnertime (paused) | Replay opens on house 2. |
| 5 | House 2: your van drives 0 borders; +$10. | replay step house 2 | — | beat `house-2` landed | caption "$10 × 1 burger". |
| 6 | House 5: Bo wins, you have no pizza; Bo earns $10. | replay step house 5 | — | beat landed | |
| 7 | House 18: you sell both burgers for $20; Bo couldn't fill the order. | replay step house 18 | — | beat landed | Rail: Ada $30, Bo $10. Bank $100 → $60. |
| 8 | Money comes out of the bank. Watch that number; the game ends when it empties (Lesson 14). | bank counter | — | Next | |

**Check.** (1) Which house ate first? → 2. (2) Why couldn't Bo sell to house 18? [Too far / Not enough burgers / Wrong food] → not enough. (3) A house 2 borders away adds how much to the price? → $2.

### L6 — Prices and competition

**Goal.** Price + distance decides; pricing manager; ties (waitresses, then turn order). **Concepts.** `pricing-manager`, `tie-break`, `waitress`, `turn-order`.

**Scenario.** Three mini-rounds on the same state, each a `dinnertime` phase on house 18 only (`houses: [house18]`), demand `['burger']`, both stocks 1 burger.

- **Round A:** no modifiers. `Ada $10+1=11` vs `Bo $10+2=12`.
- **Round B:** Bo has a Pricing Manager at work (`card('p2','pricing_manager','work')`). `11` vs `11`: tie; waitresses 0 vs 0; turn order Ada first → Ada wins. (Bo also claims "First to Lower Prices" at the start of dinnertime: shown, explained in L12.)
- **Round C:** Bo has Pricing Manager + Waitress at work; Ada nothing. Tie 11 vs 11, Bo has 1 waitress → Bo wins.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Same house, three dinners. Tap house 18 and read the two offers. | Inspect card | tap | selection | `Ada 11 wins / Bo 12`. |
| 2 | Run it. You win by distance. | Continue | `tutorial.continue` | beat landed | |
| 3 | Now Bo plays a Pricing Manager: −$1 on every item, automatically. Read the offers again. | Bo's chart (Pricing Manager); Inspect | tap | selection | `Ada 11 / Bo 11`. |
| 4 | A tie goes to the chain with more waitresses at work, then to the earlier player in turn order. You are first: you win. | tie chips on both restaurants | `tutorial.continue` | beat landed | |
| 5 | Third dinner: Bo adds a Waitress. Tie again, but Bo has a waitress and you don't. | Bo's waitress card | `tutorial.continue` | beat landed | "Bo wins. Waitresses also pay $3 each at the end of dinner." |
| 6 | So price is a lever you pull before dinner, with cards. Open the Staff tab and find the three price cards. | Staff tab: Pricing, Discount, Luxuries | ui | tab | "−$1, −$3, +$10. Lesson 9 shows how to get them." |

**Check.** (1) Ada at distance 2 with one Pricing Manager vs Bo at distance 1 with none: who wins? → tie (11 vs 11) → then waitresses/turn order [options list] → "It's a tie; waitresses decide". (2) Can the unit price go below $0? → Yes (you pay the bank). (3) Who breaks a tie if waitresses are equal? → earlier in turn order.

### L7 — Marketing creates demand

**Goal.** Place a billboard in range; Marketing phase places demand; caps 3/5; duration pips. **Concepts.** `marketing-trainee`, `billboard`, `range`, `reach`, `marketing-phase`, `demand-cap`, `duration`, `busy-marketeer`.

**Scenario.** `town({ round: 3 })`, Ada: Marketing Trainee at work (and Kitchen Trainee at work), stage `marketing`, uses set so only the trainee can act; stock 0. Bo: scripted Kitchen Trainee (burger). Billboard tiles available: 11, 13, 14 (2p removes 12, 15, 16).

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Houses only eat when a campaign has given them demand. Your Marketing Trainee can place a billboard. | trainee card | — | Next | |
| 2 | Tap the trainee, then token #14 (the 2×1 billboard). | card; token picker `#14` | ui | token chosen | Range overlay appears: roads within 2 borders of your door. |
| 3 | The faded roads are out of range. A trainee reaches 2 borders along the road from your door. | range overlay; seams | — | Next | |
| 4 | Choose burgers, duration 2. Then hover next to house 18: the ring shows the house it will reach. | good chips; duration; reach ring | ui | `previewGood = burger`, duration 2 | |
| 5 | Place it touching house 18, on tile A2. | spots adjacent to house 18 | `work.placeCampaign kind:'billboard'` with placement touching house 18 (allow filter by `campaignReach` includes house 18) | `campaignPlaced` | "The trainee is now busy on the board, not in your chart, until the billboard runs out." Milestone First Billboard claimed (L12). |
| 6 | End turn. Dinnertime: still nothing, demand comes after Payday. | — | `work.endTurn` | pause after dinnertime → Next | |
| 7 | Marketing phase: campaigns run in number order. Yours drops one burger on house 18 and loses one pip. | replay campaign #14 | `tutorial.continue` | beat landed | plaque 1/3. Note: eternal if the milestone was claimed: the narration branches on `campaign.eternal` ("it is eternal thanks to the milestone: no pips are removed"). |
| 8 | A house holds at most 3 demand tokens, 5 with a garden. Next round, if it's full, the campaign adds nothing. | house 18 plaque pips | — | Next | |
| 9 | Next dinner, house 18 will want a burger. You have none in stock. Which card fixes that next round? | Kitchen Trainee in hand | quiz-in-step: tap the card | correct tap | |

**Check.** (1) A Marketing Trainee's billboard range is: [1 / 2 / unlimited] → 2. (2) When is demand placed? [During your turn / Marketing phase after Payday / At dinner] → Marketing. (3) A house with a garden holds how many tokens? → 5.

### L8 — Drinks and buyer routes

**Goal.** Errand Boy gets 1 any drink; Cart Operator traces a road route and collects from every source passed. **Concepts.** `errand-boy`, `cart-operator`, `route`, `route-range`, `collect`.

**Scenario.** `town({ round: 4 })`, Ada: Errand Boy + Cart Operator at work, stage `food`; house 2 demand `['beer','beer','burger']`; Ada stock 1 burger. Bo scripted: nothing relevant.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | House 2 wants 2 beers and a burger. You need beer. Two cards fetch drinks. | house 2 plaque; the two cards | — | Next | |
| 2 | The Errand Boy simply gets 1 drink of any type, no travel. Take a beer. | errand boy; beer chip | `work.buyDrinks` errand with `beer` | `drinksBought` | rail +1 beer. |
| 3 | The Cart Operator drives up to 2 borders along roads from your door and takes 2 drinks from every source he passes. | cart card; range overlay | — | Next | |
| 4 | Every haul is drawn as a ribbon. Hover them: the chips show what each collects. Pick the one that passes the beer on B1 and the beer on C1. | route ribbons; sources B1, C1 | `work.buyDrinks` cart with `sourceIds ⊇ {B1 beer, C1 beer}` | `drinksBought` with 4 beer | "4 beers: 2 per source. Seams crossed: 2 of 2." |
| 5 | A supplier only counts if the road you drive on touches it. Sources off your path are not collected. | the lemonade at A3 (not collected) | — | Next | |
| 6 | End turn and watch dinner: house 2 buys 2 beers and the burger from you. | — | `work.endTurn` → `tutorial.continue` | beat house 2 | "+$30: 3 items × $10." |

**Check.** (1) Cart Operator range? → 2. (2) Drinks per source for a cart? → 2. (3) Can a cart skip a source it drives past? → No.

### L9 — Building a company

**Goal.** Managers and slots; training with a Trainer; career paths; the beach-only training rule; overfill penalty; simultaneity. **Concepts.** `manager`, `slots`, `management-trainee`, `trainer`, `career-path`, `train`, `overfill`, `simultaneous-reveal`, `one-x`.

**Scenario.** `town({ round: 4 })`, `phase: restructuring`. Ada hand: Management Trainee, Trainer, Errand Boy, Waitress, Kitchen Trainee (5 cards). Bo scripted: submits 5 cards into the CEO (overfill) → penalty at reveal.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Five cards, three CEO slots. A manager adds slots: drag the Management Trainee into a CEO slot. | MT card; slot | ui | draft: MT in ceoSubs | Two new slots appear under it. |
| 2 | Managers only report to the CEO and only hold non-managers. Fill the trainee's two slots with the Waitress and the Kitchen Trainee. | MT slots | ui | draft valid, 2 subs | |
| 3 | Put the Trainer in a CEO slot and leave the Errand Boy in hand: he goes to the beach, where he can be trained. | trainer; hand | ui | draft: trainer in ceoSubs; errand boy in hand | |
| 4 | Submit. Bo is still deciding: nobody sees a chart until all are in. | submit; Bo rail "deciding" | `restructure.submit` (exact structure) | `structuresRevealed` | |
| 5 | Bo put five cards under the CEO: too many. Everything but Bo's CEO is sent to the beach for this round. | Bo chart penalty animation | — | Next | |
| 6 | Open slots: you have 0 (3 + 2 − 5 cards), Bo has 3. Bo chooses turn order first. | open-slot chips; order prompt | (Bo scripted picks 1) | `turnOrderSet` | |
| 7 | Your turn. Hiring is before training. Skip the CEO for now. | CEO | `work.skip` CEO | | |
| 8 | Tap the Trainer. Training moves a beach card one step along its career line. Train the Errand Boy into a Cart Operator. | trainer; TrainPicker career tree | `work.train targetUid:errandBoy toEmployeeId:'cart_operator'` | `employeeTrained` | Pile counts change; milestone First to Train claimed (L12). |
| 9 | Try to train the Waitress: nothing. She has no career path. Try the Kitchen Trainee at work: not allowed, only beach cards train. | picker disabled reasons | ui attempt | both reasons shown or Next | |
| 10 | Some cards are 1x: you may own only one. Open Staff and find the 1x badges. | Staff tab `tag-unique` | ui | tab | |
| 11 | End turn. | — | `work.endTurn` | pause after cleanup | |

**Check.** (1) A Management Trainee has how many slots? → 2. (2) Can a manager sit under another manager? → No. (3) Which cards can be trained? [Any / Beach only / At work only] → Beach only. (4) Bo put 5 cards into 3 slots. What happened? → all but the CEO to the beach.

### L10 — Turn order and open slots

**Goal.** Order of Business is a choice ordered by open slots. **Concepts.** `open-slots`, `order-of-business`, `turn-order-tie`.

**Scenario.** `town({ round: 5 })` at `orderOfBusiness` after a reveal: Ada 3 + 2 slots with 4 cards (1 open), Bo 3 slots with 1 card (2 open). Bo chooses first (scripted: picks 2, to show that first choice need not mean first position).

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | After the reveal, count empty slots. You: 1. Bo: 2. More open slots chooses first. | slot chips on both charts | — | Next | |
| 2 | Bo chose position 2. Being first to act is not always best: acting later means seeing what others did. | order track | — | Next | |
| 3 | Pick position 1. | free position 1 | `order.choosePosition 1` | `turnOrderSet` | |
| 4 | Ties in open slots go to whoever was earlier last round. Acting first also wins dinnertime ties. | — | — | Next | |

**Check.** (1) Who chooses first? [Most cash / Most open slots / Fewest cards] → open slots. (2) May the first chooser take position 3? → Yes. (3) Tie-break? → earlier last round.

### L11 — Payday and salaries

**Goal.** Salaried cards; $5 each; simultaneous firing; forced firing; discounts. **Concepts.** `salary`, `payday`, `fire`, `forced-fire`, `salary-discount`.

**Scenario A.** `town({ round: 5 })`, `phase: payday`, Ada cash $10, owns Cart Operator ($), Burger Cook ($), Trainer, Waitress; owed $10. Bo cash $40, owes $5. **Scenario B** (second half): same cards, Ada cash $8 → cannot pay: must fire one.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Cards with the $ badge cost $5 every Payday, whether they worked, waited on the beach or are busy. | `$` tags on the chart and beach | — | Next | |
| 2 | You owe $10 and have $10. Confirm payday without firing. | payday panel | `payday.confirm` | `salaryPaid` | "Cash $0. The money goes back into the bank." |
| 3 | Everyone decides firing at the same time; Bo paid $5. | Bo rail | — | Next | |
| 4 | Second case: you owe $10 and have $8. You must fire salaried cards until you can pay. Fire the Cart Operator. | fire picker; cart card | `payday.fire uids:[cart]` + `payday.confirm` | `employeeFired`, `salaryPaid` | "Fired cards go back to the supply." |
| 5 | Discounts: "First to Train" gives −$15; unused Recruiting Manager actions give −$5 each. Totals never go below $0. | milestone row; glossary link | — | Next | |

**Check.** (1) Does a card on the beach cost salary? → Yes. (2) Does a Marketing Trainee? → No. (3) Owed $15, cash $12, cards: Cook ($), Waitress, Trainee. What must you do? → fire the Cook.

### L12 — Milestones

**Goal.** Milestones are claimed immediately, shared within a round, removed for others at Clean up, and mandatory. **Concepts.** `milestone`, `same-round-sharing`, `eternal-campaign`, `mandatory-effect`.

**Scenario.** `town({ round: 3 })`, Working, Ada Marketing Trainee at work, stage `marketing`; Bo scripted also places a billboard in the same round. Milestones tab pinned.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Milestones are one-off rewards for being first. Open the Milestones tab: all 18 are open. | Milestones tab | ui | tab | |
| 2 | Place any billboard. | trainee | `work.placeCampaign billboard` (any legal) | `milestoneClaimed first_billboard` | stamp animation; "Yours for the rest of the game." |
| 3 | Effect: your marketeers never pay salary, and every campaign you launch is eternal. Benefits are mandatory, even when they hurt. | milestone card text; the ∞ on your billboard | — | Next | |
| 4 | End turn. Bo places a billboard this same round, so Bo claims it too. | — | `work.endTurn` | `milestoneClaimed` p2 | |
| 5 | At Clean up, the milestone is crossed out for everyone who didn't get it this round. | Milestones tab row → "Gone" | pause after cleanup | Next | |
| 6 | Milestones with a cost: "First to Lower Prices" gives −$1 forever; "First Burger Marketed" gives +$5 per burger sold. Tap each to read it. | two rows | ui | both opened | |

**Check.** (1) Two players qualify in the same round: who gets it? → both. (2) Can you refuse a milestone's effect? → No. (3) When does an unclaimed copy disappear? → Clean up of the round it was claimed.

### L13 — Houses, gardens and new restaurants

**Goal.** New Business Developer places houses/gardens; garden = ×2 price and cap 5; Local Manager places a COMING SOON restaurant within range 3; Regional Manager anywhere; drive-ins. **Concepts.** `nbd`, `garden`, `local-manager`, `coming-soon`, `regional-manager`, `drive-in`.

**Scenario.** `town({ round: 6 })`, Working, Ada: New Business Developer, Local Manager at work (drive-in signs already on at stage `driveIns`), stage `houses`. House tiles 1, 3, 6… available.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | Your Local Manager is at work, so your restaurant has a drive-in: doors on all four corners this round. | corner markers | — | Next | |
| 2 | The New Business Developer builds a house (with a garden) anywhere next to a road, or adds a garden to a house that has none. Add a garden to house 2. | NBD; garden spots at house 2 | `work.placeGarden houseId:house2` | `gardenAdded` | "House 2 now pays ×2 per item and holds 5 tokens." |
| 3 | A new house number matters: it sets when the house eats. Build house 1 near your restaurant. (Pick tile 1 first.) | house tile chips; spots on A1/A2 | `work.placeHouse` with `houseOrder:1` adjacent to road on tiles A1 or A2 | `houseBuilt` | |
| 4 | The Local Manager opens a second restaurant within 3 borders by road from a door you own. It opens at Clean up: COMING SOON. | range overlay (3); ghost scaffold | `work.placeRestaurant` any legal | `restaurantPlaced comingSoon` | |
| 5 | End turn. A Regional Manager (trained from a Vice President) can place anywhere or move a restaurant, and it opens at once. Read it in Staff. | Staff: regional manager | `work.endTurn` → ui | pause after cleanup | "Your second restaurant is open; drive-ins are removed at Clean up." |

**Check.** (1) Garden effect? [×2 price, cap 5 / +$5 / range +1] → ×2, cap 5. (2) Local Manager range? → 3. (3) When does a COMING SOON restaurant open? → Clean up.

### L14 — The bank, reserve cards and the end

**Goal.** The bank breaks at $0 during Dinnertime; reserves refill it and set CEO slots; second break ends the game; most cash wins. **Concepts.** `bank`, `bank-break`, `reserve-card`, `ceo-slot-vote`, `game-end`, `cfo`.

**Scenario A.** `town({ round: 7 })`, `phase: dinnertime`, bank $12, Ada reserve +$200 (3 slots), Bo +$100 (2 slots), demand: house 2 `['burger']` (Ada $10), house 5 `['pizza','pizza']` (Bo $20). **Scenario B.** `bank.breaks: 1`, bank $15, two sales worth $30 → second break → game over.

| # | Say | Show | Allow | Until | Then |
|---|---|---|---|---|---|
| 1 | The bank has $12. House 2 pays $10, house 5 pays $20. Something has to give. | bank counter; plaques | — | Next | |
| 2 | Run dinner. | Continue | `tutorial.continue` | beat `bankBroke` | Counter cracks at $0 mid-sale. |
| 3 | First break: reserve cards flip. +$200 and +$100 go in; the bank is $300 richer. | reserve cards flip | — | Next | |
| 4 | Each card also votes for CEO slots: 3 and 2. No majority, so the highest wins: every CEO has 3 slots from now on. | slot vote chips | — | Next | "Had both chosen +$100, every CEO would have 2 slots." |
| 5 | Bo is still paid the rest. Dinner continues. | beat house 5 | — | beat landed | |
| 6 | Second scenario: the bank breaks again. No refill; the rest of dinner is paid as IOUs, then the game ends. Most cash wins. | bank; Standings | `tutorial.continue` | `gameEnded` | Standings modal. |
| 7 | The CFO and "First to have $100" add 50% to dinner income: the fastest way to break a bank you are winning. | Staff: CFO; milestone | — | Next | |

**Check.** (1) When can the bank break? [Any phase / Dinnertime only / Payday] → Dinnertime (base). (2) Votes 2, 2, 4, 4 → slots? → 4. (3) Second break: what happens after Dinnertime? → the game ends, no Payday.

### L15 — Guided game vs an Easy bot

**Goal.** Play a full game with help. **Format.** 2 players on the tutorial town (fixed map via `map: { kind: 'fixed', layout }`), fixed seed, Bo = Easy bot, intro-with-milestones rules off (full rules), coach level **full**. The lesson is a thin `Lesson` whose steps are **phase-triggered coach cards** rather than a linear script:

- Round 1–2: "Hire a Kitchen Trainee and a Marketing Trainee first; demand is everything." Allowed: anything legal. Hint cards link to L3/L7.
- Every Restructuring: a card "Plan: who works today?" listing the learner's cards with their stage, and "Open slots: N" live.
- Every Working turn: contextual hints from the coach ruleset (§4.6) at **full** level.
- After every Dinnertime / Marketing: the Summary strip opens with "Watch again"; the narration explains the first unexpected outcome (a house the learner expected to win but lost, detected by comparing `houseOutlook` before dinner with `sale.candidates` after).
- Bank at ≤ $40: "The bank is low. Count what you and Bo will earn next dinner."
- Game end: result card, badge **Magnate Apprentice**, link to L16.

The guided game is deterministic given the learner's actions; e2e plays it with a scripted learner that follows the hints (§4.8).

### L16 — Free play with a coach

Not a lesson file: the Learn hub launches a normal hot-seat game vs a bot (any level, any map) with `settings.coach = 'light' | 'full'`. Coach hints (§4.6) are the only addition. The hub shows it as the final tile with "Play with the coach on".

---

## 3. Expansion course (Ketchup)

Order: rule tweaks that reuse base mechanics first, then new foods, then map and marketing changes, then the milestone overhaul. Each lesson: 4–8 minutes, one scenario, one check. Prerequisite for all: base course L1–L14 passed or skipped. Module ids are the engine's `ketchup:*` ids (`packages/engine/src/modules/ketchup/`).

| # | Module (id) | What changes vs base | Scenario and script | Interactions |
|---|---|---|---|---|
| K1 | Hard Choices (`ketchup:hardChoices`) | Four marketed/train milestones vanish after round 2, Hire-3 after round 3, if unclaimed. | Town at round 2 Clean up with "First Burger Marketed" unclaimed; the Milestones tab shows "Until round 2" pills; Continue → rows go "Gone". Then round 3 with Hire-3. | Base milestone set only; incompatible with New Milestones (the hub greys the pairing). |
| K2 | Reserve Prices (`ketchup:reservePrices`) | Reserve cards are +$200 with a base price $5/$10/$20; first break adds $200 per player; CEO slots unchanged; new base unit price = most frequent card (tie $20 > $5 > $10; Ketchup rulebook "Reserve Prices"). | L14 scenario A with reserves Ada $20, Bo $5 → tie → $20; show the Inspect card's prices jump from $10 to $20 before and after the break. | Modifiers stack on the new base; Luxuries +$10 on top. |
| K3 | Movie Stars (`ketchup:movieStars`) | Waitress trains into B/C/D Movie Star; a star at work chooses turn order first and wins waitress ties; no $3. | Order of business with Ada's B-star at work vs Bo's 3 open slots: Ada chooses first. Then L6 round C with Bo's waitress vs Ada's star: Ada wins the tie. | One star per player; stars count as one 1x type. |
| K4 | Fry Chefs (`ketchup:fryChefs`) | Any cook trains into a Fry Chef; each at work adds +$10 per house sold to. | Dinnertime with two fry chefs at work, house buys 3 burgers: "$30 + $20". Explains "per house, not per item; not doubled by gardens; CFO applies". | Any-Cook trainees replace base trainees. |
| K5 | Night Shift Managers (`ketchup:nightShift`) | A 0-slot manager (CEO slot only) makes every unsalaried card act twice. | Restructuring: Night Shift in CEO slot, Marketing Trainee + Waitress + Kitchen Trainee under the CEO; Working shows `uses: 2` badges; waitress pays $6 and counts as 2 for ties. | Cannot be trained; salary; hired directly. |
| K6 | Kimchi (`ketchup:kimchi`) | Kimchi Master makes 1 kimchi at Clean up; at dinner a chain with kimchi is preferred regardless of price; sells exactly 1 kimchi extra. | L6 round A but Bo holds 1 kimchi: Bo wins house 18 at $12 vs $11; "+1 kimchi sold". Freezer rule: kimchi excludes other frozen goods. | Cannot be marketed. |
| K7 | Sushi (`ketchup:sushi`) | Garden houses prefer a chain with ≥ demand-count sushi, all-or-nothing. | House 2 with garden, demand burger + beer; Ada has 2 sushi, Bo exact items: Ada sells 2 sushi at ×2. | Only garden houses; not apartments. |
| K8 | Noodles (`ketchup:noodles`) | A house nobody can satisfy takes ≥ demand-count noodles instead. | House 18 demand burger + pizza + beer, nobody has all; Ada has 3 noodles → sale. Then the combined tier table (kimchi > sushi > exact > noodles) as a quiz. | Priority table in `ketchup.md` §7. |
| K9 | Coffee (`ketchup:coffee`) | Barista line; training places a coffee shop (range 2); houses buy 1 coffee from each shop/restaurant on their shortest route to dinner; First Coffee Sold places a shop at Clean up. | Train Barista Trainee → Barista, place the shop on the A1|A2 road; dinner for house 18 served by Bo routes past Ada's shop: `coffeeSold` beat. | Not a drink; no freezer; coffee shops are route starts. |
| K10 | New Districts (`ketchup:newDistricts`) | Tiles U (3 lemonades), V (houses 21+22), W (house 25 with garden), X/Y apartments: 2 tokens per marketing event, no cap, no garden, order π between 3–4, 9¾ between 9–10. | Map with X at A1: billboard on the apartment drops 2 tokens; cap bar shows ∞; dinnertime order shows π after house 3. | Required for 6 players. |
| K11 | Lobbyists (`ketchup:lobbyists`) | Lobbyist places a road (under construction, roadworks +1 this round) or a park (×2 / ×3 price for adjacent houses); First Lobbyist Used adds a map tile. | Map with tile Z; place a road connecting A1 to A3's lemonade; hover shows roadworks cones; next round the road is normal and the cart reaches lemonade; extra tile placement prompt with template picker. | Sub-step between houses and restaurants. |
| K12 | Mass Marketeers (`ketchup:massMarketeers`) | Each one at work adds a whole extra marketing pass; pips removed once. | Marketing phase replay with `pass 1/2`: house 18 fills to 3 in pass 2; "full" chip. | Expansion Marketing Trainee. |
| K13 | Gourmet Food Critics (`ketchup:gourmetCritics`) | Guide beside the board; 1 token on every garden house. | Two garden houses; place the guide (auto-staged); Marketing shows both receive a pizza. | Not apartments, parks or rural. |
| K14 | Rural Marketeers (`ketchup:ruralMarketeers`) | Giant billboards on the rural area (2 tokens per pass, no cap, eternal); freeway; rural area eats last via freeways. | Place a giant billboard (side picker), accept the freeway next to A3; dinner: the van leaves the board at the freeway (`sale.route.exit`). | Order after numbered campaigns. |
| K15 | Ketchup (`ketchup:ketchup`) | "Someone sells your demand": −1 at dinner for the player whose demand was sold by another. | L5 scenario where Bo's billboard made house 18's demand and Ada sells it: Bo claims Ketchup at end of dinner; next dinner Bo's offers show "−1". | Stacks with First Marketeer Used. |
| K16 | New Milestones (`ketchup:newMilestones`) | 17 "used"-triggered milestones replace the base set; three expire after round 2; two-item airplanes. | Three mini scenarios: First Marketeer Used (+$5 per token, bank can empty in Marketing), First Burger Sold (CEO 4 slots), First Pizza Sold (pizza radios pending choice). Then a quiz on "played vs used". | Not with Hard Choices. |
| K17 | Six Players (`ketchup:sixPlayers`) | Siap Faji chain, 4×6 map, 3 copies of 1x cards, New Districts required. | A 6-seat lobby walkthrough; a dinnertime fixture with 6 chains to show the longer turn order. | Informational; no quiz. |

Each K lesson ends with "Play it: hot-seat vs Easy bot with this module on" (deep link into the hot-seat setup with `modules` pre-filled).

---

## 4. Tutorial system design

### 4.1 Lesson DSL (`packages/client/src/tutorial/dsl.ts`)

Lessons are TypeScript data: no interpreter beyond the runner, typed against the engine so a renamed action or event breaks the build.

```ts
import type { Action, GameEvent, GameState, GameView, LegalAction, PlayerId } from '@fcm/engine';
import type { StateBuilder } from '@fcm/engine/testing';

export type LessonId = `base.${number}` | `ketchup.${string}`;
export type GlossaryId = string;

export interface Lesson {
  id: LessonId;
  course: 'base' | 'ketchup';
  title: string;
  minutes: number;
  goal: string;
  concepts: GlossaryId[];
  requires?: LessonId[];
  scenario: Scenario;
  steps: Step[];
  quiz: Quiz;
  badge?: { id: string; label: string };
}

export interface Scenario {
  /** Exact state, built with the fixture builder (deterministic). */
  build: () => GameState;
  learner: PlayerId;                               // the seat the device holds
  opponents: Record<PlayerId, 'scripted' | 'easy' | 'medium'>;
  /** Automatic phases to pause after (engine `tutorial` module, §4.2). */
  pauseAfter: ('dinnertime' | 'payday' | 'marketing' | 'cleanup' | 'restructuring' | 'orderOfBusiness')[];
  /** Camera on entry. */
  camera?: CameraFrame;
}

export interface Step {
  id: string;
  /** Narration, ≤ 2 sentences; a function reads the live view ("You earned $30"). */
  say: string | ((ctx: StepCtx) => string);
  show?: Target[];                                 // coach marks / rings / overlays
  camera?: CameraFrame;
  allow?: Allow;                                   // default: 'none' (Next button only)
  until: Predicate;                                // success
  hint?: Hint;                                     // default: after 20 s, pulse `show`
  /** Opponent moves to apply as soon as the engine awaits a scripted seat during this step. */
  script?: ScriptedMove[];
  /** Canonical learner action(s) for Skip step and for e2e. Must satisfy `allow` and reach `until`. */
  solution?: Action[] | ((ctx: StepCtx) => Action[]);
  /** Replay the stored phase on the board and wait for a beat (walkthroughs). */
  replay?: { phase: 'dinnertime' | 'marketing'; from?: string };
  checkpoint?: boolean;                            // resume point
  onEnter?: Effect[]; onExit?: Effect[];
}

export type Target =
  | { ui: string }                                 // `[data-tutorial="<name>"]` (§4.4 list)
  | { house: number } | { restaurant: 'p1' | 'p2' | string } | { campaign: string } | { source: [x: number, y: number] }
  | { cell: [x: number, y: number] } | { tile: string /* 'B2' */ } | { seam: [tileA: string, tileB: string] }
  | { card: { player: PlayerId; uid?: string; employeeId?: string } }
  | { overlay: 'range' | 'reach' | 'routes' };    // keep the board overlay visible for this step

export type Allow =
  | 'none' | 'any'
  | { actions: ActionMatcher[] }                   // gate: only these may be sent
  | { ui: string[] };                              // UI-only steps (open a tab, toggle a view)
export type ActionMatcher = { type: Action['type']; where?: (a: Action, view: GameView) => boolean; limit?: number };

export type Predicate =
  | { event: GameEvent['type']; where?: (e: GameEvent, view: GameView) => boolean }
  | { view: (v: GameView) => boolean }
  | { signal: 'selection' | 'topView' | 'dockTab' | 'placementReason' | 'previewGood'; equals?: unknown; changed?: true }
  | { beat: string }                               // animation beat id landed (replay walkthroughs)
  | { next: true }                                 // Next button
  | { all: Predicate[] } | { any: Predicate[] };

export interface Hint { afterMs?: number; say: string; show?: Target[]; thenSkipAfterMs?: number }
export interface ScriptedMove { player: PlayerId; action: Action | ((view: GameView, legal: LegalAction[]) => Action) }
export interface CameraFrame { kind: 'board' | 'focus' | 'rect' | 'top'; ids?: string[]; rect?: { x0: number; z0: number; x1: number; z1: number } }
export type Effect = { openTab: 'turn' | 'company' | 'market' | 'milestones' | 'log' } | { setSetting: Partial<Settings> } | { select: Selection | null } | { summary: 'open' | 'close' };

export interface StepCtx { view: GameView; me: PlayerId; events: GameEvent[]; legal: LegalAction[]; lastAction: Action | null; state: () => GameState }

export interface Quiz { questions: Question[]; pass: number /* min correct */ }
export type Question =
  | { kind: 'choice'; q: string; options: string[]; answer: number; why: string }
  | { kind: 'tap'; q: string; target: Target; why: string }
  | { kind: 'number'; q: string; answer: number | ((v: GameView) => number); why: string };
```

Design notes:

- `allow` is a **gate on top of the engine**, not a replacement: an allowed action can still be rejected by the engine, and the rejection message is shown as the hint (this is how "try an illegal square" steps work: `allow: 'any'` for `setup.placeRestaurant`, the engine says why).
- `until` predicates are evaluated on every store change and every event batch; `event` predicates look at the batch that the gated action produced.
- `say` as a function lets narration quote the view ("Ada $10 + 1 = 11") so lessons stay true even when a scenario is edited.
- `script` moves are applied by the runner when `view.awaiting.players` contains a scripted seat; if a move is illegal on the real state the runner falls back to `fallbackAction` (from `@fcm/ai`) and flags the lesson in dev. Easy-bot seats use the hot-seat `workerBotRunner`.
- `solution` is required when `allow` is not `'none'`; the lesson unit test applies it.

### 4.2 Runner and transport (`packages/client/src/tutorial/runner.ts`)

The runner sits on `LocalTransport` with a fixed `viewer` (the learner) and no handoff screens. No server is involved; the engine runs in-process exactly as hot-seat does.

```
Learn hub ─► TutorialSession.start(lesson)
   ├─ state = lesson.scenario.build()  (+ tutorial module options: pauseAfter)
   ├─ transport = new LocalTransport({ engine, state, viewer: learner, handoff: false,
   │                                   scripted: opponents=='scripted' seats, bots: easy seats, botRunner })
   ├─ attach to store as mode 'tutorial'  (session.ts: startTutorial)
   └─ StepMachine(lesson.steps)
         on store change / events ─► evaluate `until`; apply `script`; render coach marks
         gate(action) ─► allowed? send : show reason
         Skip step ─► apply `solution` through the gate (bypassing `allow`)
         checkpoint ─► record (lessonId, stepId, actions so far) in localStorage
```

**Action gating.** `session.act(action)` gains an optional gate: `actionGate: ((a: Action) => string | null) | null`. The runner installs `(a) => matches(step.allow, a) ? null : 'Not in this step: …'`. A gated-out action is not sent; the Turn panel shows the reason in the existing `prompt` hint slot. The engine remains the only validator of legality. UI affordances that are not in `allow` are not hidden, they are **dimmed** (`data-tutorial-dim`), so the learner still sees the real UI.

**Scripted seats.** New `LocalTransportOptions.scripted?: PlayerId[]` and a method `actFor(playerId, action)` that bypasses the viewer overwrite for those seats only (today `act()` rewrites `playerId` to the viewer). Events from scripted moves are redacted for the learner, as a real opponent's would be.

**Pausing automatic phases.** `runUntilInput` resolves Dinnertime → Payday → Marketing → Clean up in one `applyAction`. For walkthroughs the engine needs a pause point. Add a tiny engine module `tutorial` (`packages/engine/src/modules/tutorial.ts`):

- option `pauseAfter: PhaseKind[]`;
- hook `onPhaseExit(phase)`: when `phase.kind ∈ pauseAfter`, push `PendingChoice { kind: 'continue', player: <viewer seat from options>, optional: false }`; `runUntilInput` already stops at a pending head (`core/phase.ts`);
- action `tutorial.continue` resolves it;
- `derivePrompt` shows it as `{ kind: 'choice' }`; the client renders a Continue button (the tutorial strip takes it over).

This is additive (one `PendingChoice` variant, one module) and deterministic; replays with the module give identical states. Hot-seat and online never enable it.

**Forcing outcomes.** Not needed: Dinnertime and Marketing are deterministic functions of the state, so scenarios are authored to produce the teaching outcome, and `allow` keeps the learner's choice inside the set of actions that preserve it (e.g. "any billboard spot whose `campaignReach` includes house 18", computed with the engine preview the UI already uses). Where a lesson truly needs a specific demand pattern, the builder places it (`demand(houseNo, goods, by, campaign)`).

**Replays for walkthroughs.** A `replay` step calls `requestReplay(events, fromId)` (`state/feedback.ts`) with the phase's events (from `summaries`) and waits on `currentBeat` (`{ beat: 'house-18' }`). Narration per beat is a `say` function reading the beat's events (`sale.candidates`, `sale.total`, `campaignRan.reached/full`). Follow the action is turned on for the lesson (`setFollowAction(true)`, restored on exit) so the camera glides to each beat; reduced-motion users get the static route drawing and the same captions.

**Resume.** On every `checkpoint` step the runner stores `{ lessonId, stepId, actions: Action[] }` (every action applied so far, including scripted ones). Resume = `scenario.build()` + `replay(actions)` through the transport, then jump to the step. Deterministic, no snapshots to version.

### 4.3 Coach marks and spotlight (`packages/client/src/tutorial/coach/`)

One component `CoachLayer` mounted in `Table` above everything except toasts and the handoff screen:

- **Narration strip.** Desktop: a 360 px card docked bottom-left over the board (never over the dock), with Back / Next / Skip step / "What's this?" / step counter. Phone: a 2-line strip above the sheet handle (the sheet is collapsed to the handle during board steps, same contract as pick modes: `isPickMode`-style flag `tutorialBoardStep`). Text is also in an `aria-live="polite"` region.
- **UI targets.** `[data-tutorial="name"]` attributes on the elements listed below; the spotlight is an SVG mask (`<rect>` full screen with a rounded cutout per target), pointer events pass through only inside cutouts when `allow` is a UI step. Targets scroll into view inside the dock.
- **Board targets.** Projected through `window.__fcmBoard.project(x, z, y)` into client px; houses/restaurants/campaigns use their footprint rect (`boundsOf(id)`, new on the scene handle), cells a 1×1 rect, tiles a 5×5 rect, seams a thin strip. Projection is refreshed on every camera change (`cam.onChange`, new) and on resize. In addition to the 2D cutout, board targets get the existing **ring** highlight (`inspectIds`) so they read in 3D when partly off-screen, and the edge arrow from animation-plan §1.6 when fully off-screen.
- **Overlays.** `{ overlay: 'range' }` keeps the range overlay (`rangeOverlay` signal) visible while the strip explains it, even before a pick starts; `reach` and `routes` likewise.
- **Phones.** Cutouts are at least 44 px; the strip never covers a cutout (it moves to the top of the board when a target is in the bottom third). Narration stays ≤ 2 lines at 16 px; longer text goes behind "What's this?".
- **Dimming, not hiding.** Elements outside `allow` get `data-tutorial-dim` (50% opacity, still focusable, with a tooltip "Not part of this step").

### 4.4 `data-tutorial` targets (added by WP-T1)

`camera-top`, `camera-reset`, `speed`, `follow`, `tab-turn`, `tab-company`, `tab-market`, `tab-milestones`, `tab-log`, `submit-structure`, `org-ceo`, `org-slot-<n>`, `org-hand`, `hand-card-<employeeId>`, `work-stages`, `work-card-<uid>`, `hire-<employeeId>`, `train-<toEmployeeId>`, `produce-<food>`, `drink-<food>`, `token-<n>`, `good-<food>`, `duration`, `end-turn`, `undo`, `pass-setup`, `reserve-<amount>`, `order-pos-<n>`, `payday-confirm`, `fire-<uid>`, `freezer`, `continue`, `bank`, `rail-<playerId>`, `cash-<playerId>`, `milestone-<id>`, `summary`, `summary-step-<id>`, `watch-again`, `inspect`, `inspect-sellers`, `pick-strip`, `confirm`, `rotate`, `glossary-<id>`.

### 4.5 Learn hub (`packages/client/src/ui/learn/`)

Route `#/learn` (hub), `#/learn/:lessonId` (runs it), `#/learn/glossary[/:id]`, `#/learn/rules[/:section]`.

- **Course map.** Two tracks as cards in order; each card: title, minutes, concepts as glossary chips, status (new / in progress N% / passed / skipped), quiz score, "Resume" or "Start". Locked cards (prerequisite not passed or skipped) show why and offer "Skip prerequisites" (marks them skipped).
- **Continue.** Top card: the last unfinished lesson at its checkpoint.
- **Badges.** Earned per lesson pass (quiz ≥ pass), plus course badges: *Diner Owner* (L1–L7), *Chain Builder* (L8–L14), *Magnate Apprentice* (L15), *Ketchup Connoisseur* (all K), *Perfect Score* (all quizzes 100%).
- **Storage.** `localStorage['fcm.learn']` v1: `{ v: 1, lessons: Record<LessonId, { status: 'new'|'started'|'passed'|'skipped'; stepId?: string; actions?: Action[]; quizBest?: number; passedAt?: number }>, badges: string[] }`. Written on every checkpoint and quiz. Export/import as JSON from the hub (for moving devices; no server).
- **Home.** A fourth card on Home, "Learn to play", and a "New here? Start the tutorial" banner the first time (`fcm.learn` absent).
- **During a game.** The game menu gets "Rules & glossary" and "Coach: off / light / full".

### 4.6 Glossary, rules reference, contextual hints

**Glossary** (`packages/client/src/tutorial/glossary/*.ts`): entries `{ id, term, short (≤ 140 chars), long (markdown-lite), related: GlossaryId[], lessons: LessonId[], rule: 'base.md §7' }`, grouped by base / per module. The catalog's own card and milestone texts (`EmployeeDef.text`, `MilestoneDef.text`) are not duplicated: the glossary links to them.

**"What's this?"** Every `EmployeeCard`, milestone row, Inspect card header, food chip, phase chip and stage chip gets a `?` affordance (long-press on touch, `?` key with focus, a small icon on hover) that opens the glossary sheet for its id: cards → the card's text + career line + the glossary entry for its category; milestones → trigger / effect / when; board pieces → the piece's entry (house, garden, apartment, campaign kind, source, coffee shop…). Inside the tutorial the same sheet is what "What's this?" in the strip opens.

**Rules reference** (`#/learn/rules`): a readable rendering of `docs/rules/base.md` §3–§12 and the active modules' `ketchup.md` sections, built at build time from the markdown (a vite plugin that imports the `.md` as a string and strips source tags), with a per-phase quick card ("Dinnertime in 6 lines"). Searchable; every glossary entry links to its section.

**Contextual hints in real games** (`packages/client/src/tutorial/coach/rules.ts`): pure functions `(view, me, legal, catalog) => Hint[]` evaluated on each view change, shown as dismissable cards at the top of the Turn panel, at most two at a time, each with a glossary link and "don't show this again" (stored per hint id). Setting `coach: 'off' | 'light' | 'full'` (default `light` for anyone who has not passed L15, `off` otherwise). Light = only rule-shaped hints (what you can do); full = adds judgement hints (what is probably wise). First rules:

| Hint | Level | Trigger |
|---|---|---|
| Trainer at work, nothing on the beach to train | light | restructuring draft |
| More cards than slots (overfill) | light | draft |
| Salaries next Payday $N vs cash $M | light | working, when N > M |
| A house in your reach wants goods you do not stock | light | working `food` stage |
| Billboard spot reaches no house | light | campaign ghost |
| Campaign token pile for this marketeer's kind is empty | light | restructuring |
| Open slots: you choose turn order Nth | light | order of business |
| Bank ≤ 40% of start: count next dinner | full | any |
| A milestone you can claim this turn (e.g. hire 3) | full | working |
| Your unit price loses house X to Bo by $1 | full | before end turn (uses `houseOutlook`) |

Hints never use hidden information (the rules take `GameView` only).

### 4.7 Accessibility

- Every step narration is in an `aria-live` region; board targets are described in words ("House 18, tile A2, demand 2 burgers"); the spotlight never removes keyboard focusability.
- Full keyboard path: every tutorial action has a list/panel fallback (`settings.placementList` is turned on automatically when a keyboard is detected or when the user enables "Accessible picking"); the strip buttons are tab-ordered after the dock.
- Reduced motion: replays use the reduced timeline (static routes + captions); the spotlight fades instead of animating; hints do not pulse.
- Colour: targets are marked by outline and label, never colour alone; the high-contrast tile toggle (`highContrastTiles`) is offered in L1.
- Text: 16 px minimum, respects browser zoom to 200% (strip reflows), dyslexia-friendly line length (≤ 60 chars per line).
- Time: no step is timed; hints are offers, not pressure. Screen-reader users can disable auto-advance on `beat` predicates and use the Summary stepper instead.

### 4.8 Deterministic testing

- **Unit (vitest, `packages/client/test/tutorial/*.test.ts`).** For every lesson: build the scenario, assert `assertValidState`; walk the steps with a headless runner (no DOM, no Three): for each step apply `solution` (or the scripted moves), assert `allow` admits it and the engine accepts it, assert `until` becomes true, assert scripted seats always have a legal scripted move or a legal fallback. Assert every step with `allow ≠ 'none'` has at least one legal action matching `allow` (**no dead end**), and that `say` functions do not throw on the live view. Assert quiz answers are valid indices and `tap` targets exist in the scenario.
- **Golden replays.** Each lesson's canonical action list is a golden file (`test/tutorial/golden/<lesson>.json`); a changed engine that alters an outcome fails loudly with a diff of the events.
- **e2e (Playwright, `e2e/tutorial.spec.ts`).** `runLesson(page, lessonId)` drives the real UI: for each step it reads the strip, resolves the target from `data-tutorial` or `__fcmBoard.project`, performs the solution through the UI (click the target; placement steps use the ghost via `__fcmBoard.internals.inter.spotList` or the list fallback), waits for `data-anim="idle"` and the strip to advance. Runs every base and Ketchup lesson at 4× speed on desktop and the phone viewport, plus one run with reduced motion and one keyboard-only run of L2 and L7. Asserts no error toasts, no page errors, the badge is awarded, and the lesson resumes from its last checkpoint after a reload.
- **Property check.** A fuzz test applies random *allowed* actions at each step for 50 seeds per lesson and asserts the step still completes (the `until` predicate is reachable from every allowed branch).

### 4.9 Content authoring guidelines

1. One file per lesson, `tutorial/lessons/<course>/<nn>-<slug>.ts`, exporting a `Lesson`. Scenario builders live beside the lesson or in `engine/src/testing/fixtures/tutorial*.ts` when shared.
2. Narration: ≤ 2 sentences, ≤ 160 characters, present tense, second person, no rule jargon before its glossary entry has been introduced (the lint checks `concepts` order across the course).
3. Say the number: any arithmetic in the rule appears as numbers from the view in the narration or a chip.
4. One concept per step; one highlight group per step (≤ 3 targets).
5. Every step with an allowed action has a `solution`, a `hint`, and a predicate the test can reach.
6. Never fake: no narration claims an outcome the engine did not emit. If a scenario needs an outcome, build the state for it.
7. Scripted opponents play plausible moves (they are also teaching), never illegal ones.
8. Quizzes: 3 questions, at least one "tap the board" question, each with a `why`.
9. Glossary ids are stable snake-case; adding a term means adding it to the concept lint list.
10. Phone check: every lesson is run on 390×844 before merge (the e2e does it, but look at the screenshots).

### 4.10 Engine and client additions needed

| Addition | Where | Why |
|---|---|---|
| `tutorial` engine module: `pauseAfter` option, `PendingChoice { kind: 'continue' }`, action `tutorial.continue` | `engine/src/modules/tutorial.ts`, `types/state.ts`, `modules/registry.ts` | pause the phase loop between automatic phases |
| `LocalTransportOptions.scripted`, `actFor(playerId, action)` | `client/src/net/localTransport.ts` | scripted opponents without handoff |
| `session.startTutorial(...)`, `actionGate` in `act()`, `mode: 'tutorial'` | `client/src/net/session.ts`, `state/store.ts` | gating and a distinct mode |
| `__fcmBoard.boundsOf(id | cell | tile)` and `cam.onChange` | `client/src/three/index.ts`, `three/camera.ts` | project board targets for the spotlight |
| `tutorialHighlight` signal (ring style distinct from inspect) and `cameraCommand { kind: 'frame', rect }` | `state/interaction.ts`, `three/*` | highlights and framing |
| `data-tutorial` attributes (§4.4) | `ui/*.tsx` | UI targets |
| `settings.coach`, `settings.accessiblePicking` | `state/store.ts` | coach level, keyboard mode |
| `fcm.learn` storage module | `tutorial/progress.ts` | progress and badges |
| `summaries` exposed by phase id and `currentBeat` consumed by the runner | `state/feedback.ts` (exists) | replay walkthroughs |
| Fixed tutorial map fixtures and `map: { kind: 'fixed' }` for the guided game | `engine/src/testing/fixtures/tutorialTown.ts` | exact scenarios (MapConfig `fixed` already exists) |
| Markdown-to-reference vite plugin | `client/vite.config.ts`, `ui/learn/Rules.tsx` | in-app rules reference |

No rule, action payload or event changes. Hot-seat and online behaviour is unchanged when the tutorial module is off.

---

## 5. Work packages

Four packages, one engineer each, disjoint files. WP-T1 publishes the DSL types and the `data-tutorial` list on day one as stubs so T2–T4 can author against them; T2–T4 lessons are tested with T1's headless runner once it lands (until then, with the scenario and golden tests only).

### WP-T1 — Framework: engine pause, transport, runner, coach marks, Learn hub, testing harness

Files: `packages/engine/src/modules/tutorial.ts`, `engine/src/types/state.ts` (one `PendingChoice` variant), `engine/src/modules/registry.ts`, engine tests; `client/src/net/localTransport.ts`, `client/src/net/session.ts`, `client/src/state/store.ts` (mode, settings), `client/src/state/interaction.ts` (`tutorialHighlight`, `frame` command), `client/src/three/index.ts` + `three/camera.ts` (`boundsOf`, `onChange`), `client/src/tutorial/{dsl,runner,gate,progress,headless}.ts`, `client/src/tutorial/coach/{CoachLayer.tsx,spotlight.ts,strip.tsx}`, `client/src/ui/learn/{Hub,LessonCard,Badges,Quiz}.tsx`, `client/src/ui/Home.tsx` (card), `client/src/ui/Overlays.tsx` (menu entries), `data-tutorial` attributes across `ui/*.tsx` (attribute-only edits), `client/src/state/router.ts` (`#/learn`), `client/test/tutorial/runner.test.ts`, `e2e/tutorial.spec.ts` with `runLesson`, `docs/architecture.md` §5 (one paragraph).

Acceptance:
- A demo lesson (three steps: Next, a gated `setup.placeRestaurant`, a `tutorial.continue` after a paused Dinnertime) runs in the browser with spotlight on a UI target and on house 18, on desktop and phone.
- `tutorial.continue` pauses exactly after the configured phases; replay of `(config, seed, actions)` with the module on reproduces the state; all existing engine, client and e2e tests pass with the module off.
- Gating: a disallowed action is not sent and shows its reason; an allowed illegal action shows the engine's rejection; Skip step applies the solution.
- Scripted seats act through `actFor`; Easy seats through the worker; the learner never gets a handoff screen.
- Progress: checkpoint, reload, Resume lands on the same step with an identical `history.seq`.
- Headless runner walks a lesson in vitest without DOM; `runLesson` passes for the demo lesson at 4× and reduced motion; `aria-live` narration verified with Playwright's accessibility snapshot.

### WP-T2 — Base lessons L1–L7 and the tutorial town

Files: `packages/engine/src/testing/fixtures/tutorialTown.ts` (+ its JSON and the fixture test pinning the distance table in §2.0), `client/src/tutorial/lessons/base/{01-town,02-restaurant,03-ceo-hire,04-food,05-dinnertime,06-prices,07-marketing}.ts`, `client/src/tutorial/lessons/base/index.ts` (L1–L7 entries), `client/test/tutorial/base-1-7.test.ts`, golden files.

Acceptance:
- Each lesson passes the headless walk, the no-dead-end property (50 seeds), the golden replay and `runLesson` on desktop and phone.
- Every narration ≤ 2 sentences, every number quoted from the view; L5–L7 walkthroughs use the Summary replay with per-beat narration.
- Quizzes: 3 questions each, at least one tap question, correct answers verified against the live state in the test.
- Screenshots of each lesson's first board step at 390 px attached to the PR.

### WP-T3 — Base lessons L8–L14, guided game, coach hint rules

Files: `packages/engine/src/testing/fixtures/tutorialLate.ts`, `client/src/tutorial/lessons/base/{08-drinks,09-company,10-order,11-payday,12-milestones,13-houses,14-bank,15-guided}.ts`, `lessons/base/index.ts` (L8–L16 entries; coordinate the file with T2 by owning the second half of the array), `client/src/tutorial/coach/rules.ts` + `rules.test.ts`, `client/src/ui/PromptPanel.tsx` (hint card slot only), `client/test/tutorial/base-8-15.test.ts`, golden files, `e2e/tutorial-guided.spec.ts` (scripted learner that follows hints to game end).

Acceptance:
- Same bars as T2 for L8–L14.
- L15 plays to `gameEnded` against the Easy bot with a fixed seed in e2e, with hint cards appearing at the listed triggers; no hint uses hidden information (test: rules receive a redacted view).
- Coach rules unit-tested on the engine fixtures (`working`, `dinnertime`) with expected hint ids; `coach: 'off'` shows nothing; dismissed hints stay dismissed across reloads.
- L16 entry launches hot-seat with the coach on and returns to the hub afterwards.

### WP-T4 — Ketchup lessons, glossary, rules reference, "What's this?"

Files: `client/src/tutorial/lessons/ketchup/*.ts` (17 files + index), `packages/engine/src/testing/fixtures/tutorialKetchup.ts`, `client/src/tutorial/glossary/{base,ketchup,index}.ts`, `client/src/ui/learn/{Glossary.tsx,Rules.tsx}`, `client/src/ui/common.tsx` (`WhatsThis` affordance on `EmployeeCard`), `client/src/ui/Milestones.tsx`, `client/src/ui/Inspect.tsx` (affordance only), `client/vite.config.ts` (markdown import plugin) + `client/src/tutorial/rulesText.ts`, `client/test/tutorial/ketchup.test.ts`, `client/test/tutorial/glossary.test.ts`, golden files.

Acceptance:
- All 17 K lessons pass the headless walk, no-dead-end property, golden replay and `runLesson`; each ends with a working deep link into hot-seat with the module enabled.
- Glossary: every `concepts` id used by any lesson (T2/T3/T4) resolves (test), every base employee, milestone, food, campaign kind and board piece has an entry; "What's this?" opens the right entry from a card, a milestone row and the Inspect card, by mouse, touch long-press and keyboard.
- Rules reference renders `base.md` §3–§12 and each enabled module's section without source tags, with working section links from the glossary; builds in both dev and `vite build`.
- Incompatible module pairs (Hard Choices + New Milestones) are explained in the hub, not just disabled.

---

## 6. Authoring lessons (framework API)

WP-T1 shipped the framework. This section is the contract T2–T4 author against; the code is the reference (`packages/client/src/tutorial/dsl.ts` has the types with doc comments). Worked examples: `tutorial/lessons/base/01-town.ts` (L1, board taps and UI only) and `tutorial/lessons/dev/demo.ts` (gate, scripted seat, pauses, Continue; open it at `#/learn/dev.demo`).

### 6.1 Files and registration

- One file per lesson: `packages/client/src/tutorial/lessons/<course>/<nn>-<slug>.ts` exporting `defineLesson({...})`.
- Add it to `lessons/base/index.ts` (`BASE_LESSONS`; T2 owns the first half of the array, T3 the second) or `lessons/ketchup/index.ts` (`KETCHUP_LESSONS`). That is all: the hub's course map (`tutorial/catalog.ts`) replaces the "coming soon" card with the playable lesson by id, and every test below picks the lesson up automatically.
- Ids: `base.<n>` (L1 = `base.1`) and `ketchup.<moduleShortId>` (`ketchup.coffee`), matching `catalog.ts`. Step ids are stored in learners' progress: never rename a shipped one.
- Shared scenario builders go in `packages/engine/src/testing/fixtures/tutorial*.ts` and are exported from `@fcm/engine/testing`. The tutorial town is there already: `town({ round, seed?, restaurants? })` returns a `StateBuilder` with Ada (p1) on A1 and Bo (p2) on C2 (`restaurants: false` or `['p2']` to leave spots empty), plus `TUTORIAL_MAP`, `TOWN_RESTAURANTS`, `TOWN_SOURCES`. Setup states use `round: 0` (the engine's setup round), e.g. `.phase({ kind: 'setup.restaurants', round: 1, order: ['p2', 'p1'], idx: 0, placed: [], passed: [] })`.

### 6.2 Scenario

```ts
scenario: {
  build: () => town({ round: 3 }).phase({ kind: 'working', player: 'p1', idx: 0 }).turn({...}).build(),
  learner: 'p1',
  opponents: { p2: 'scripted' },          // or 'easy' (Web Worker bot; headless uses runBot)
  pauseAfter: ['working', 'dinnertime'],   // engine tutorial module: Continue after these phases
  startPaused?: true,                      // hold before anything runs (scenario starts inside an automatic phase)
  settle?: false,                          // default true: run the engine's phase loop on the built state first
  camera?: { kind: 'board' },
}
```

- The runner calls engine `enableTutorial(state, { player, pauseAfter, startPaused, settle })`. Pauses are a `continue` `PendingChoice` for the learner, resolved by the action `{ type: 'tutorial.continue', playerId, choiceId }`. Pause points: `restructuring` (after the reveal, before Order of Business), `orderOfBusiness`, `working` (all turns done, before Dinnertime: "let dinner run"), `dinnertime`, `payday`, `marketing`, `cleanup`. Each holds once per round. Pause ids are `tutorial-pause:r<round>:<phase>`; they do not consume `nextId`, so card and campaign ids match a game without the module.
- Settling runs the real phase loop, so the engine's automatic behaviour applies: for example a chain whose hand is empty is auto-submitted in Restructuring. If a step must have the learner submit a CEO-only chart, give them a card in hand or use `settle: false` and check it with the headless walk.
- Scripted seats move only through step `script`s. A scripted seat the engine awaits with no script in the current step simply waits (L1 uses this: Bo is "to place" all lesson, so the learner is never awaited and board taps inspect pieces).

### 6.3 Steps

| Field | Meaning |
|---|---|
| `id` | Unique, stable. |
| `say` | ≤ 2 sentences, ≤ 160 chars (linted). A function gets `StepCtx` (`view`, `me`, `events` since the step started, `legal`, `lastAction`, `signals`, `state()`). Quote numbers from `ctx.view`; never from `ctx.state()` (hidden information). |
| `show` | ≤ 3 `Target`s: spotlight cutouts, board rings, `data-tutorial` elements (table in 6.4). |
| `allow` | `'none'` (default; only Next), `'any'`, `{ actions: [{ type, where?, limit? }] }` (the gate), `{ ui: [...] }` (no game action; board taps and UI only). |
| `until` | Success predicate, evaluated on every view change, event batch and UI signal change. |
| `solution` | Canonical moves: game actions and `{ tap: Target }`. Required unless `allow` is `'none'` and `until` is `{ next: true }`. Use a function when an action needs live ids (Continue: `continueAction` in `lessons/dev/demo.ts`; move it to a shared helper when a second lesson needs it). |
| `script` | `[{ player, action }]` for scripted opponents, applied in order whenever the engine awaits that seat during the step (650 ms delay in the browser). `action` can be a function of the seat's redacted view and legal actions. An illegal move falls back to `@fcm/ai` `fallbackAction` and is logged. |
| `then` | Feedback once the step completes (shown on the next step's card). |
| `hint` | `{ say, show?, afterMs?, thenSkipAfterMs? }`. Default: after 20 s (10 s with one target) the narration is repeated in a hint box and the rings pulse; again at 2× the delay. |
| `checkpoint` | Progress is saved on entry: `(lessonId, stepId, every action so far)`. Step 0 is always a checkpoint. Resume rebuilds the scenario and replays the actions; UI state (selection, open tabs) is not restored, so a checkpoint step must not depend on it. |
| `camera` | `{ kind: 'board' }`, `{ kind: 'top' }`, `{ kind: 'focus', ids }` (house / restaurant / campaign ids), `{ kind: 'rect', rect: { x0, z0, x1, z1 } }` (board squares). |
| `onEnter` / `onExit` | Effects: `{ openTab }`, `{ select }`, `{ setSetting }`, `{ camera }`, `{ follow }` (Follow the action, restored on exit), `{ summary: 'open' \| 'close' }`. |
| `replay` | `{ phase: 'dinnertime' \| 'marketing', from? }`: plays the latest stored phase again on the board (Summary "Watch again"); pair with `{ beat }` predicates. |
| `glossary` | Glossary term id for the card's "What's this?" (shown only when the glossary has the term). |
| `nextLabel` | Next button label. |

**Predicates** (`until`): `{ next: true }`; `{ event: type, where? }` (events since the step started, redacted for the learner, any seat); `{ view: (v) => boolean }`; `{ signal, equals?, match?, changed? }` with signals `selection`, `topView`, `dockTab`, `placementReason`, `previewGood`, `boardHover`, `uiTap` (last `[data-tutorial]` element clicked; `changed: n` counts clicks), where `changed: true | n` means "changed at least once / n times during the step"; `{ beat: id | (id, view) => boolean }` (an animation beat landed: house or campaign id; without the 3D board the runner derives beats from the events); `{ paused: phase | 'start' | true }`; `{ test: (ctx) => boolean }`; `{ all: [...] }`, `{ any: [...] }`. Signal predicates use `match` (not `where`) so TypeScript can infer the callback types.

**Gate semantics.** The gate is on top of the engine: an admitted action can still be rejected, and the engine's message appears on the coach card (this is how "try the illegal square" steps work: admit the type, let the engine say why). A refused action is never sent; the card says "Not in this step: …" (or "Not this one" when only the payload differs). UI outside the step's targets is dimmed (`data-tutorial-dim`), never hidden or blocked. Skip step applies `solution` through the real paths with the gate bypassed (taps select the piece or click the element). A watchdog skips the step (and logs an error) when the engine awaits the learner and no legal action matches `allow` for 3 s.

**Learner controls.** Next (when the predicate contains `{ next: true }`), Back (only across steps where no action was applied), Skip step, Continue (when `allow` admits `tutorial.continue` and the game is paused), What's this?, Leave (progress stays at the last checkpoint). Undo is off in lessons.

### 6.4 Targets and `data-tutorial` names

Board targets: `{ house: n }`, `{ restaurant: playerId | restaurantId }`, `{ campaign: id }`, `{ source: [x, y] }`, `{ cell: [x, y] }`, `{ tile: 'B2' }`, `{ seam: ['A1', 'B1'] }`. They are projected through `window.__fcmBoard.project` every frame, ringed in 3D (`tutorialHighlight`), and get an edge arrow when off-screen. `{ card: { player, uid?, employeeId? } }` resolves to the card's `data-tutorial` element. `{ overlay: 'range', spec }` draws the road-range overlay for a placement spec during the step; `{ overlay: 'reach', placement, good }` the campaign reach preview.

UI targets `{ ui: name }`, as implemented:

| Where | Names |
|---|---|
| Camera bar | `camera-top`, `camera-reset`, `speed`, `follow` |
| Pick strip | `pick-strip`, `confirm`, `rotate` |
| Dock tabs | `tab-turn`, `tab-company`, `tab-market`, `tab-milestones`, `tab-log` |
| Org chart | `org-ceo`, `org-slot-<n>` (empty CEO slots, numbered after the filled ones), `org-mslot-<managerUid>-<n>`, `org-hand`, `hand-card-<employeeId>`, `org-card-<uid>` (placed card), `submit-structure` |
| Working | `work-stages`, `work-card-<uid>`, `hire-<employeeId>`, `train-target-<uid>`, `train-<toEmployeeId>`, `produce-<food>`, `drink-<drink>`, `token-<n>`, `good-<food>`, `duration`, `end-turn`, `undo` |
| Turn panel | `pass-setup`, `reserve-<amount>` (`reserve-200-<basePrice>` with Reserve Prices), `order-pos-<n>` (1-based), `payday-confirm`, `fire-<uid>`, `freezer`, `continue` (also on the coach card) |
| Top bar / rail | `bank`, `rail-<playerId>`, `cash-<playerId>` |
| Other | `milestone-<id>`, `summary`, `summary-steps`, `watch-again`, `inspect`, `inspect-sellers` |

Glossary affordances (`glossary-<id>`) belong to the glossary package; use the step's `glossary` field instead. Need another target? Add a `data-tutorial` attribute (attribute-only edit; `EmployeeCard` takes a `tutorial` prop) and list it here.

### 6.5 Quiz

`quiz: { pass, questions }`, 3 questions, at least one `tap`: `{ kind: 'choice', q, options, answer, why }`, `{ kind: 'tap', q, target, why }` (board targets: the learner taps the piece; the selection is compared), `{ kind: 'number', q, answer: n | (view) => n, why }`. Passing records `quizBest`, marks the lesson passed and awards the lesson badge (`lesson:<id>`, or `badge`) plus any course badge now complete (`catalog.ts` `COURSE_BADGES`).

### 6.6 Testing a lesson

Nothing to register: `packages/client/test/tutorial/runner.test.ts` and `golden.test.ts` iterate every lesson in `LESSONS`.

- **Headless walk** (`walkLesson` in `tutorial/headless.ts`): builds the scenario, then for every step applies scripted moves, bot moves and `solution` (actions through the gate, taps simulated on the UI signals) and requires `until` to become true. It reports every problem with the step id: a solution the gate refuses or the engine rejects, a missing solution, `say()` throwing, an unreachable `until`, a dead end.
- **No-dead-end property** (`deadEndProblems(lesson, 50)`): 50 seeded walks that first play random *allowed* ready actions at each gated step, then the solution; every step must still complete. Placement payloads are not randomised (they come from the UI), so gated placement steps rely on the solution.
- **Lint and quiz** (`lessonLint`, `quizProblems`): unique step ids, narration length, answer indices, tap targets on the board, number answers computable.
- **Golden replay** (`golden/<lesson>.json`): the walk's steps, every action and the outcome (seq, round, phase, cash, bank). Created on the first run; regenerate deliberately with `UPDATE_GOLDEN=1 npx vitest run packages/client/test/tutorial` and review the diff.
- **e2e** (`e2e/tutorial.ts`): `runLesson(page, lessonId, { stopAt?, onStep?, skipped? })` plays the lesson through the real UI on the current viewport (desktop or phone), using `window.__fcmTutorial.current()` for the step and its solution and `targetRect(target)` for board taps. `performAction` knows `tutorial.continue`, `setup.placeRestaurant` / `work.placeRestaurant` (placement list), `setup.chooseReserve`, `order.choosePosition`, `work.endTurn`, `payday.confirm`; for any other type it presses Skip step and records it in `skipped`. Extend `performAction` with the UI path when your lesson needs one, and assert `skipped` is empty in your spec. Add a spec per lesson (desktop + phone) to `e2e/tutorial.spec.ts` or a sibling file; `openLesson`, `tutorialState` and the resume pattern (`stopAt` + reload + compare `startSeq`) are in the existing spec.

### 6.7 Pitfalls

- The engine is the judge: if the headless walk says the engine rejected a solution, fix the scenario or the solution, never the gate.
- `solution` arrays are copied by the runner; still, do not keep state in them. Compute ids at run time with a function.
- Do not assume who acts first: Order of Business round 1 still asks the first chooser to pick (the demo has an explicit step for it).
- Keep scripted moves plausible and legal: the walker logs every fallback as a problem.
- Phone: the coach card moves to the top when a target sits in the lower half or the sheet is open; board steps collapse the sheet, Turn-panel targets open it. Look at the 390 px screenshots before merging.
