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
