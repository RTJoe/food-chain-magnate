# Open Rules Questions

Genuine ambiguities left after checking both Deluxe rulebooks (DLX = base, KX-DLX = Ketchup; printed page numbers). Each item gives the recommended implementation so code is not blocked. Answer source wanted: designer ruling (BGG) or physical components.

## Base game

| id | Question | What DLX says | Recommended | Conf. |
|---|---|---|---|---|
| Q-B1 | When are "First to Have $20" / "$100" checked? | p28: claim "at any point during Dinnertime" when you have the cash. p34: "at the end of the Dinnertime phase". | Check whenever cash changes in phase 4 and at its end. Base cash only rises in phase 4, so the winners are identical either way. With Ketchup "First marketeer used" (cash in phase 6), only phase-4 checks count. | Medium |
| Q-B2 | Must a cart/truck use its full range? | p21: gaining drinks is optional; passed suppliers must be collected; path is your choice (KX-DLX p16). No full-range rule. JD 1587582 said full range is required. | Free length (0..range), mandatory collection along the chosen path. | Medium-High |
| Q-B3 | Production all-or-nothing (pizza cook 3 or 0)? | p21: "Gain a number of food counters as stated"; gaining is optional. | All or nothing (JD 1564805). | Medium |
| Q-B4 | Negative item price, CFO on negative income, bankruptcy. | Silent. | Keep JD rulings in `base.md` §7, §12. | Medium |
| Q-B5 | Intro game "ensure all 3 drink supplier types are on the map": how? | p5: rule only, no method. | Redraw the whole map until all 3 types appear. | Medium |
| Q-B6 | "First to Have $100": when must the owned CFO be fired? | p34: "you must fire them"; no timing. | Fire in this round's Payday firing step (no salary is then due). | Medium |
| Q-B7 | Footprint orientation of campaign tiles: any rotation? | No restriction stated. | Any of the 2 orientations for non-square tiles. | Medium-High |
| Q-B8 | CFO (or "First to Have $100" CEO) on a negative Dinnertime total: how is "+50%, rounded up" rounded? | Silent; JD 1473813 says the CFO applies to negative income. | Math.ceil (toward +∞): −$7 → −$3 bonus. Implemented in `rules/dinnertime.ts` `payCfo`. | Medium |
| Q-B9 | A recruiting manager / HR director with unused recruit actions is fired in Payday step 1: does its $5-per-action discount still apply? | p29: discounts for unused recruit actions; firing comes first; no ruling on the combination. | Keep the discount (the actions went unused during Working; `unusedRecruitActions` is recorded then). | Low-Medium |

## Map

| id | Question | What DLX says | Recommended | Conf. |
|---|---|---|---|---|
| Q-M1 | Do two printed roads running parallel along a shared tile edge connect along their length? | p8 item E: "2 orthogonally adjacent roads on adjacent map tiles form a single continuous road". p21: all edges of orthogonally adjacent road squares are connected regardless of art. No picture shows the case. JD 1514116 (older) said only at the middle. | Yes, connect (DLX text). | Medium-High |
| Q-M2 | Footprints of mailbox #8 and billboard #16. | Not pictured. #7 = 2x2, #9 and #10 = 1x1; #11–15 known. | #8 = 2x2, #16 = 1x1 until checked against components. | Low |
| Q-M3 | Placeable houses 3, 6, 17. | Not pictured. 1, 9, 11, 14, 19 are pictured. | 3, 6, 17 (gaps in 1–19; π ordered between 3 and 4). | Medium-High |

## Employees

| id | Question | What DLX says | Recommended | Conf. |
|---|---|---|---|---|
| Q-E1 | Ketchup employee card total. | KX-DLX p1: 132. Module pages add up to 130 (incl. 1 luxuries manager, 1 card per movie star, 3 EVPs). | Use the per-module counts in `employees.md`; the 2 missing cards are probably spares and change nothing. | Medium |
| Q-E2 | Base per-type counts (e.g. Management Trainee 18, Junior VP 12). | DLX gives only the 222 total. | Keep community counts (they sum to 222). | Medium-High |
| Q-E3 | Card colours for "First lemonade sold" (train into same colour). | Colours visible on card images only. | Groups in `employees.md` §1 and §2; coffee (teal) is its own group. | Medium-High |

## Ketchup

| id | Question | What KX-DLX says | Recommended | Conf. |
|---|---|---|---|---|
| Q-K1 | Lobbyist road tile and park tile footprints. | KX-DLX printed p15 (PDF p16) component photo: road tiles 1 square wide, 2 and 4 squares long (the 4 about twice the 2); park tiles: one 1x4 strip and three non-rectangular 4-square pieces; "Either side of a Park tile can be used". | **Resolved.** Roads: 4 straight 2, 2 straight 4, 2 corner 3 (L, arms of 2), arrows at the free ends. Parks: I, T, L, L tetrominoes, any rotation, mirrored allowed. The exact split and the corner/T/L shapes come from the licensed OnlineBoardGamers implementation (component scans, `availableNewRoads` / `availableParks`), which agrees with the photo. The printed p16 Road Route Example 1 shows a 3-square straight road: treated as schematic. `lobbyists.ts` | Medium-High |
| Q-K2 | Do roadworks slow buyers, marketeers, local managers and coffee routes, or only dinnertime distance? | p15: "Passing through a roadwork tile adds +1 distance to the route." | All road routes (+1 per roadwork passed). | Medium-High |
| Q-K3 | Do the 3 New-Milestones airplanes (numbered 4–6, A/B) replace the base airplanes? | p17: "Place the new airplane marketing campaigns beside the board." | Replace base #4–6 when New Milestones is used. | Medium |
| Q-K4 | Pizza radios (First pizza sold) and free mailbox (First new restaurant): which tiles, and what if none are in the supply? | "a radio marketing campaign"; "a free permanent mailbox". | Take base radios #1–3 / mailboxes #7–10 from the supply; none left → forfeit that placement. | Medium |
| Q-K5 | "First discount manager used": does $100 leave the bank in the round it is earned? | "each turn (including this one) ... at the end of the Restructuring phase" — but the milestone is earned in Dinnertime, after Restructuring. | First removal at the end of next round's Restructuring, checking discount managers at work then. | Low |
| Q-K6 | Phase-6 run order of the 4 rural campaigns (unnumbered). | Silent. | After all numbered campaigns, in placement order. Order does not matter (rural area has no cap and is reached only by rural campaigns), so any fixed order works. | Medium-High |
| Q-K7 | Rural area distance "computed starting from any Freeway". | Only that sentence (p26). | Treat each freeway as a connection to the road squares it touches; distance = tile borders crossed from there; take the minimum over freeways. | Low-Medium |
| Q-K8 | First Lobbyist Used: orientation of the extra tile. | Silent ("must align to the existing grid"). | Player's choice. | Medium |
| Q-K9 | Night shift manager: pricing manager −$2, recruiting girl hires 2, errand boy fetches 2, kitchen trainee makes 2? | "Treat this as if you played two copies of that card." Clarifications cover trainer, marketing trainee, waitress, management trainee, CEO only. | Yes to all (literal reading). | Medium |
| Q-K10 | "First Radio Campaign" (base) radio on an apartment: 4 counters? | Apartments get 2 per counter normally placed. | 4. | Medium-High |

## Working phase and engine (resolved by C1)

| id | Question | What DLX says | Implemented | Conf. |
|---|---|---|---|---|
| Q-W1 | Hiring from an empty pile (DLX p16): what if the card is then not trained? | "you may hire it if you immediately train it" in this turn's training step. | Allowed only while enough training actions remain. While it can still be trained, training must go to it first, the trainer cannot be skipped, and the turn cannot leave the train step. If it becomes untrainable (target pile emptied), it is removed when the train step closes; it never left the supply. | Medium |
| Q-W2 | When exactly do drive-in signs appear (step 3c)? | p17: step 3c, after training. | Opened at the start of the player's Working turn. Hiring and training never look at restaurants and no restaurant is placed before 3g, so the effect is identical; it keeps validation of later steps independent of the current step. | High |
| Q-W3 | Hand contents during Restructuring are "not public" (DLX p6, p13). | Cards in hand are hidden. | Owned cards stay visible in views: every hire/train/fire is a public event, so the hand is derivable anyway. Only the structure draft (until reveal) and the reserve card are hidden. | Medium-High |
| Q-W4 | Regional manager rotate-in-place. | p25: may relocate one restaurant; rotating allowed if the entrance still touches a road. | A move to the same x,y with a different entrance; a "move" to the identical position is rejected. | High |
| Q-W5 | New house road contact: house squares only, or the whole 2x3 piece? | p24: "part of one of its edges orthogonally adjacent to a road" (combo token). | Any square of the 2x3 house+garden piece. | Medium-High |
| Q-W6 | Skipping a recruiting manager / HR director. | p15: unused recruit actions give $5 each. | Declining (skip) counts as unused: $5 per remaining action. | High |
| Q-W7 | Coach/guru multi-step on one card across separate actions. | p15–16: may apply up to 2/3 steps to the same card. | Allowed in one action or several; the per-card cap counts steps by that trainer. Other trainers still need "First to pay $20". | Medium-High |
| Q-W8 | Local manager range to the new restaurant. | p25: entrance must connect to the road the route used, range 3. | Distance to a road square orthogonally outside the entrance corner, plus 1 if that road square is on another tile than the corner (same rule as campaigns, DLX p19 example C). | Medium-High |
| Q-W9 | Bankrupt chains during Working / Order of Business. | Silent. | Skipped; they keep their place at the end of the turn order. | Medium |

## Ketchup implementation (raised by C6)

Choices made while implementing `packages/engine/src/modules/ketchup/`. Each row names the module file that holds the decision.

| id | Question | What KX-DLX says | Implemented | Conf. |
|---|---|---|---|---|
| Q-K11 | New Milestones "First discount manager used": when is a discount manager "used"? | "its price modifier applies in Dinnertime". | Claimed at the start of Dinnertime by every player with a discount manager at work (like base First to Lower Prices), sales or not. `newMilestones.ts` | Medium |
| Q-K12 | "First soda sold" freezer: usable in the Clean up of the round it is earned? | "Freezer (as base): 10 items." Base First to Throw Away is earned in Clean up, so it only works next round. | Usable from the same round's Clean up (it is earned in Dinnertime, before Clean up). `newMilestones.ts` | Medium |
| Q-K13 | "First beer sold": how are goods offered as salary, and when is it mandatory? | "You may pay salaries with food/drink tokens ... If you have no cash and cannot fire anyone, you must pay with tokens." | Goods are declared with `payday.confirm.tokens` (1 token = 1 salaried card's salary, capped at the salaried count); they reduce the amount owed and are removed when salaries are paid. Never automatic: the "must" case is not enforced. `newMilestones.ts` | Medium |
| Q-K14 | "First pizza sold": when are the pizza radios placed, and are they eternal with First brand director used? | "the seller must place a radio campaign ... on a legal square of the tile containing that house". | Queued as choices during Dinnertime and resolved right after it (a placement cannot change Dinnertime). Pizza radios are never eternal (they have no brand director). A house straddling tiles may take the radio on any of its tiles. `newMilestones.ts` | Medium |
| Q-K15 | "First new restaurant": which mailbox tile, and must it touch a road? | "a free permanent mailbox anywhere within mailbox range of the just-placed restaurant". | Any free mailbox tile (#9/#10 1x1 preferred, else #7/#8 2x2), all squares in the restaurant's block (base mailbox flood fill), empty, next to a road like every campaign. Not linked to a marketeer. `newMilestones.ts` | Medium |
| Q-K16 | "First recruiting girl used" with an empty tray: what happens to the box Executive VP when fired? | "Only if the tray has none, take one from the box." | It goes to the supply like any fired card (the supply grows by one). `newMilestones.ts` | Medium |
| Q-K17 | "First cart operator used": does the triggering haul get the bonus? | "Applies to the triggering haul." | Yes: the difference is added to that haul right after it. `newMilestones.ts` | High |
| Q-K18 | Coffee routes: which routes count as "shortest", and may they revisit squares? | KX p11–14: the route bends to pass more coffee when distance does not grow; Example 2 (p13): "roads can be traced along multiple times"; Example 4 (p14) loops back to the entrance; DLX p10 Backtracking forbids only stepping straight back. Examples 1 and 3: routes to either equidistant restaurant of the chain. | Walks of minimal border cost (roadworks included) to every open restaurant of the chosen chain at the winning distance; squares may repeat, no immediate U-turn. Each route excludes only its own end restaurant (JD BGG 3111626). Search over (square, heading, cost, locations passed), bounded at 60,000 expansions; ties keep only common locations. A chain's locations sell nearest-the-house first while it has coffee. The rural area buys no coffee (no road route). `coffee.ts` | High (rules); Medium (sale order when a chain runs out) |
| Q-K19 | Coffee shop after barista training: optional? | "Train ... → places 1 coffee shop" (card icon). | Mandatory when a legal square exists (a `coffeeShop` choice that cannot be declined); skipped when none exists. `coffee.ts` | Medium |
| Q-K20 | Lobbyist road arrows and anchoring. | Arrows on the road tile; one must point at an entrance corner or a road within road distance 2. | Arrows sit at the two ends of the straight tile, pointing outward along it. Rule A target: the range origin square (entrance corner square, or a coffee shop square); rule B: a usable road square within road distance 2 of that origin. Parks: road range measured like campaigns (border between road and park square counts). `lobbyists.ts` | Medium |
| Q-K21 | Freeway footprint and position. | "adjacent to the outer edge of a map tile, orthogonally adjacent to a road on 1 or more squares". | One square beside the board edge (`side`, `offset`), touching the first map square in from that edge, which must be a road; not on an airplane's span (and airplanes may not cover a freeway). `ruralMarketeers.ts` | Low-Medium |
| Q-K22 | Module milestones (Ketchup, First coffee sold, First lobbyist used, First rural marketeer used) without New Milestones. | "used only with their modules". | Used whenever their module is on, with the base milestones or with New Milestones. | Medium |
| Q-K23 | Kimchi Master: must it be at work, and when exactly is the kimchi gained? | "In Clean up, after food is discarded/frozen, its owner gains 1 kimchi." | Masters at work when Clean up begins (structures are returned during Clean up) each give 1 kimchi after the freezer step; it goes into the stock and is thrown away next Clean up if unsold. `kimchi.ts` | Medium-High |
| Q-K24 | Night Shift Manager and passive salary-free cards. | Q-K9. | Implemented as Q-K9 recommends; also barista trainees make 2 coffee and a night-shift marketing trainee's two billboards each use one action. `nightShift.ts` | Medium |
| Q-K25 | Giant billboard numbering. | Rural campaigns have no number (Q-K6). | Tiles 21–24 (after gourmet guides 17–20), so they run after every numbered campaign. Order among them is irrelevant. `ruralMarketeers.ts` | High |
| Q-K26 | New Districts option to choose which of U–Y join the pool. | p3: the agreed tiles are shuffled in. | Not implemented: all five join the random pool (`config.options` ignored). | — |
| Q-K27 | Lobbyist road arrow pointing at a road still under construction (placed earlier this turn). | Only existing roadworks are mentioned ("do not stack another token"). | No roadworks marker on an under-construction road. `lobbyists.ts` | Medium |
| Q-K28 | Does an under-construction road count as "a road" for "next to a road" placement checks (coffee shop, campaign, lobbyist piece)? | Silent. | Yes (any road square); only routes ignore it. | Low-Medium |
| Q-K29 | Does your own coffee shop sell coffee to a house eating at another of your restaurants? | "of a chain that has coffee", only the destination restaurant excluded. | Yes. `coffee.ts` | Medium |
| Q-K30 | First brand director used: is the claiming radio eternal? First brand manager used: may a second player who claims it in the same round use the 2-good airplane? Does the campaign manager's second tile earn First-marketeer-used $5? | Silent. | Claiming radio eternal (as base First Billboard); yes for every same-round claimer; yes ($5 for every marketeer-linked campaign). `newMilestones.ts` | Medium |
| Q-K31 | First rural marketeer used: is placing the giant billboard the "use"? | "used" = an effect resolved. | Yes: claimed when the giant billboard is placed. `ruralMarketeers.ts` | High |
| Q-K32 | Kimchi with park/garden multipliers: is the kimchi line multiplied like other goods? | Silent on parks. | Paid at unit price × house multiplier (garden tested; park untested). `kimchi.ts` | Low |
| Q-K33 | Kimchi-only games: "Any Cook" trainees have nothing to train into without Sushi/Noodles. | §0 mentions Kimchi. | No-op; `careerAdditions` only wired for Sushi and Noodles. | Low |
| Q-K34 | Mass Marketeer with no campaigns on the board: does the extra marketing pass run? | Silent. | Yes, harmlessly (nothing to resolve). `massMarketeers.ts` | Low |
