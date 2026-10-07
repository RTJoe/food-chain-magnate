# Food Chain Magnate — Base Milestones

Primary source: **DLX** = Deluxe Edition Revised Rulebook (printed pages; p11 general rules, p13/p14/p28/p29/p33 timing, p34–35 milestone list). Older RB text and designer rulings (JD + BGG thread id) are kept only where DLX is silent. Ketchup milestones are in `ketchup.md`. Corrections log: `CHANGES.md`.

## General rules (DLX p11)
1. Claimed **immediately** when the condition is met. A single action can claim several (DLX p14: a burger billboard claims First Billboard Campaign and First Burger Marketed).
2. **Same-round sharing:** every player who meets the condition during the same round also claims it, with full benefits. Order within the round does not matter.
3. Cleanup step D: every player who did not claim a milestone that was claimed this round marks it unavailable for the rest of the game.
4. Benefits are **mandatory**, even when harmful (e.g. eternal campaigns, −$1 price, the $15 salary discount). They cannot be declined.
5. **[DLX differs]** DLX prints the 18 base milestones on each player's milestone board (check / X tokens). There are no milestone cards and no copy limit. RB's 84 cards with proxies had the same effect.
6. Intro game: no milestones (second game: add them) (DLX p5).

## Milestone table (18)

DLX card names are given; the id column is the code id.

| id | DLX name | Exact trigger (DLX) | Effect (DLX) | When effect starts | Conf. |
|---|---|---|---|---|---|
| first_billboard | First Billboard Campaign (p20/p29 also call it "First Billboard Placed") | Launch a billboard campaign on your turn (3d). | (a) No salary for Campaign Managers, Brand Managers, Brand Director, whether in the structure or busy. (b) Every campaign you launch from now on is **eternal** (∞ side, 1 counter, never removed); its marketeer is busy for the rest of the game and can never be played, trained or fired. | Immediately — includes the triggering billboard. Campaigns launched earlier stay finite (JD 1535067). | High |
| first_train | First to Train an Employee | Train an employee on your turn. | Pay $15 less salary each Payday (total ≥ $0). | This round's Payday. | High |
| first_hire_3 | First to Hire 3 Employees in 1 Turn | Hire 3+ employees on your turn (CEO hire counts). | Immediately hire 2 extra Management Trainees (fewer if the supply is short). These cannot be combined with a Train action to skip an empty Management Trainee pile. | Immediately (they can still be trained this turn: hiring precedes training). | High |
| first_burger_marketed | First Burger Marketed | Launch a campaign advertising burgers. | +$5 per burger sold. Not item price; not doubled by gardens; counts toward CFO. | Immediately. | High |
| first_pizza_marketed | First Pizza Marketed | Launch a campaign advertising pizza. | +$5 per pizza sold (same rules). | Immediately. | High |
| first_drink_marketed | First Drink Marketed | Launch a campaign advertising any drink. | +$5 per drink sold, **all** drink types. | Immediately. | High |
| first_errand_boy | First Errand Boy Played | Play an Errand Boy (revealed at work in Restructuring). | Errand boys collect 2 drinks of one type; cart operators and zeppelin pilots 3 per supplier; truck drivers 4. | Immediately. | High |
| first_20 | First to Have $20 | Have ≥ $20 cash. DLX p34: "at the end of the Dinnertime phase"; DLX p28: "at any point during Dinnertime". | Look at all face-down reserve cards now and any time later; may not show them. | Immediately. | High (effect); Medium (exact check point, see `questions.md` Q-B1) |
| first_burger_produced | First Burger Produced | Produce ≥1 burger on your turn. | Immediately gain a Burger Cook (on the beach). Must pay or fire it this Payday. Cannot be trained this round. None in supply → nothing. | Immediately. | High |
| first_pizza_produced | First Pizza Produced | Produce ≥1 pizza on your turn. | Same with a Pizza Cook. | Immediately. | High |
| first_waitress | First Waitress Played | Play a Waitress (revealed at work in Restructuring). | +$2 per waitress played at end of Dinnertime ($5 each in total), including the triggering one. | This Dinnertime. | High |
| first_throw_away | First to Throw Away Food or Drink | Throw away ≥1 unsold item in Cleanup. One milestone covers food and drink. Coffee is neither (KX p10): throwing away only coffee does not claim it. | Gain a freezer tile. From the **next** Cleanup, store up to 10 unsold items (any mix, player's choice); stored items stay in stock and can be sold; may be kept for many rounds. | Next Cleanup. | High |
| first_lower_prices | First to Lower Prices | At the **start of Dinnertime**, have a Pricing or Discount Manager at work (claimed even if nothing is sold; a luxuries manager also at work does not prevent the claim, but a luxuries manager alone does not claim it, DLX p28). | Item price permanently −$1. | This Dinnertime. | High |
| first_cart_operator | First Cart Operator Played | Play a Cart Operator (revealed at work in Restructuring). | Cart operators, truck drivers, zeppelin pilots +1 range. Errand boys unaffected. | Immediately. | High |
| first_airplane | First Airplane Campaign | Launch an airplane campaign. | +2 open work slots when choosing turn order (cannot hold cards). | Next Order of Business. | High |
| first_radio | First Radio Campaign | Launch a radio campaign. | Each of your radios adds 2 demand counters per house reached; if there is room for only 1, add 1. Still remove only 1 duration counter. | This round's Marketing (includes the triggering radio). | High |
| first_100 | First to Have $100 | Have ≥ $100 cash in Dinnertime (same wording conflict as $20). | Your CEO gives the CFO bonus (+50% of Dinnertime cash, rounded up). If you have a CFO, you must fire it. You can never train a CFO again. | Next Dinnertime. | High (effect); Medium (CFO firing timing: DLX gives none; fire at this Payday) |
| first_pay_20 | First to Pay $20 or More in Salaries | Pay ≥ $20 to the bank in Payday **after** all mandatory discounts. | You may use multiple trainers/coaches/gurus on the same employee in one turn (e.g. 2 trainers + coach: Management Trainee 4 steps). | Next round's training. | High |

## Trigger details for code
- "Played" = in the structure when stacks are revealed in Restructuring (DLX p13). Beach cards never count. Check first_errand_boy, first_waitress, first_cart_operator at reveal.
- first_lower_prices: check at the **start of phase 4** (DLX p28). **[DLX differs]** previously checked at reveal; with same-round sharing the winners are the same, but the claim event moves.
- "Launch a campaign" triggers at placement (3d).
- "Hire 3" counts hires this turn; check after each hire.
- "Produce" triggers when the production action is taken (3e).
- "$20"/"$100": check in phase 4 whenever cash changes, and at the end of phase 4. Base cash only rises in phase 4 (Ketchup: also phase 6). Either reading gives the same winners in the base game, since cash only increases during Dinnertime.
- "Throw away": check in Cleanup step A.
- Same-round sharing applies to all. Implement: award to every qualifying player; mark the type "claimed this round"; in Cleanup step D set it unavailable for everyone else.

## Hard choices module interaction
See `ketchup.md` §16: some milestones are crossed out after round 2 or 3 if unclaimed.
