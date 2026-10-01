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
| Q-K1 | Lobbyist road tile and park tile footprints. | 8 roads, 4 parks; picture (p15) shows 1-wide road strips of at least 2 lengths and long park strips; no sizes. | Needs component measurement. Placeholder: roads 1x2 and 1x3, parks 1x3 and 2x3. Do not ship without checking. | Low |
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
