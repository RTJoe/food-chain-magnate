# Food Chain Magnate — Employee Cards

**Deluxe cross-check (2026-10-01):** the DLX base rulebook has no full card list. Cards shown in its examples (DLX p6, p7, p16, p19, p32: Marketing Trainee, Campaign Manager, Brand Manager, Brand Director, Management Trainee, Junior VP, Vice President, Regional Manager, New Business Developer, Recruiting Girl, Trainer, Guru, Errand Boy, Cart Operator, Truck Driver, Zeppelin Pilot) all match the table below on entry icon, salary icon, 1x, slots, range and career path. DLX p3 confirms 10 1x types; p17 confirms that kitchen, buyer and marketeer cards have their own tracks and every other trained card comes from the Management Trainee. Rows not shown in DLX keep their earlier source. The Ketchup table was re-checked against the DLX Ketchup rulebook card images (KX-DLX), which show every expansion card.

Sources: career tree and icons read directly from the rulebook card-layout page (RB p5, rendered and inspected); card text cross-checked against the OnlineBoardGamers locale strings (`cards-authoritative.json` in github.com/WJ-Lai/fcm-ai); counts from a community card list (Scribd 335843397, reproduced in github.com/quinnbaetz/food-chain-magnate-guided). Those counts sum exactly to the official 222, which strongly corroborates them. Ketchup counts are from a BGG thread confirmed by Jeroen Doumen (BGG 2357692) and sum to the official 138.

Legend:
- **Entry** = has the hire icon (a sparkle at the card's top-left, DLX p7): can be recruited directly.
- **Salary** = has the money icon: costs $5 at Payday.
- **1x** = unique. Each player may own at most one (beach included). Copies in play: 1 (2p), 1 (3p), 2 (4p), 3 (5p/6p). Box contains 3. Base has 10 1x types (DLX p3).
- **Count** = copies in the box. Non-1x cards: all copies are always used.
- **Mgr** = manager (black card). Can only sit in a CEO slot; its slots hold non-managers only.

## 1. Base game (222 cards + 6 CEOs)

The DLX box holds 10 CEO cards (DLX p1 component list); each player uses one.

| id | Name | Count | Entry | Salary | 1x | Mgr slots | Action / text | Trains into | Trained from |
|---|---|---|---|---|---|---|---|---|---|
| ceo | CEO | 10 in DLX box (each player picks any 1; cosmetic) | — | no | — | 3 (CEO slots; changes when bank breaks) | Hire 1 person. Always at work. | — | — |
| waitress | Waitress | 12 | yes | no | no | — | Get $3 cash. Win ties against restaurant with fewer waitresses. | none (base) | — |
| management_trainee | Management Trainee | 18 | yes | no | no | 2 | Manager. | junior_vp, new_business_developer, luxuries_manager | — |
| junior_vp | Junior Vice President | 12 | no | yes | no | 3 | Manager. | vice_president, local_manager, discount_manager, recruiting_manager, coach | management_trainee |
| vice_president | Vice President | 6 | no | yes | no | 4 | Manager. | senior_vp, regional_manager, guru | junior_vp |
| senior_vp | Senior Vice President | 6 | no | yes | no | 5 | Manager. | executive_vp, cfo, hr_director | vice_president |
| executive_vp | Executive Vice President | 3 | no | yes | **yes** | 10 | Manager. | — | senior_vp |
| new_business_developer | New Business Developer | 6 | no | yes | no | — | Place house or garden. | — | management_trainee |
| luxuries_manager | Luxuries Manager | 3 | no | yes | **yes** | — | Price +$10 (mandatory). | — | management_trainee |
| pricing_manager | Pricing Manager | 12 | **yes** | **no** | no | — | Price −$1 (mandatory). | none | — |
| discount_manager | Discount Manager | 6 | no | yes | no | — | Price −$3 (mandatory). | — | junior_vp |
| local_manager | Local Manager | 6 | no | yes | no | — | Place new restaurant within road range 3, "COMING SOON". Drive-in while at work. | — | junior_vp |
| regional_manager | Regional Manager | 3 | no | yes | **yes** | — | Place a restaurant anywhere OR move/rotate one; opens immediately. Drive-in while at work. Unlimited range. | — | vice_president |
| cfo | CFO | 3 | no | yes | **yes** | — | +50% to cash earned this round (mandatory). | — | senior_vp |
| recruiting_girl | Recruiting Girl | 12 | yes | no | no | — | Hire 1 person. | none | — |
| recruiting_manager | Recruiting Manager | 6 | no | yes | no | — | 2x: hire 1 person or $5 less salary. | — | junior_vp |
| hr_director | HR Director | 3 | no | yes | **yes** | — | 4x: hire 1 person or $5 less salary. | — | senior_vp |
| trainer | Trainer | 12 | yes | no | no | — | Train 1 person. | none | — |
| coach | Coach | 6 | no | yes | no | — | 2 training slots; may train the same person two steps. | — | junior_vp |
| guru | Guru | 3 | no | yes | **yes** | — | 3 training slots; may train the same person up to three steps. | — | vice_president |
| errand_boy | Errand Boy | 12 | yes | no | no | — | Get 1 drink of any type. | cart_operator | — |
| cart_operator | Cart Operator | 6 | no | yes | no | — | Get 2 drinks from each source on route. Road range 2. | truck_driver | errand_boy |
| truck_driver | Truck Driver | 6 | no | yes | no | — | Get 3 drinks from each source on route. Road range 3. | zeppelin_pilot | cart_operator |
| zeppelin_pilot | Zeppelin Pilot | 3 | no | yes | **yes** | — | Get 2 drinks from each source on route, ignore roads. Zeppelin range 4. | — | truck_driver |
| marketing_trainee | Marketing Trainee | 12 | yes | no | no | — | Place billboard, max duration 2. Road range 2. | campaign_manager | — |
| campaign_manager | Campaign Manager | 6 | no | yes | no | — | Place mailbox or lower, max duration 3. Road range 3. | brand_manager | marketing_trainee |
| brand_manager | Brand Manager | 6 | no | yes | no | — | Place airplane or lower, max duration 4. Unlimited range. | brand_director | campaign_manager |
| brand_director | Brand Director | 3 | no | yes | **yes** | — | Place radio or lower, max duration **5**. Unlimited range. | — | brand_manager |
| kitchen_trainee | Kitchen Trainee | 12 | yes | no | no | — | Produce 1 burger or 1 pizza. | burger_cook, pizza_cook | — |
| burger_cook | Burger Cook | 6 | no | yes | no | — | Produce 3 burgers. | burger_chef | kitchen_trainee |
| burger_chef | Burger Chef | 3 | no | yes | **yes** | — | Produce 8 burgers. | — | burger_cook |
| pizza_cook | Pizza Cook | 6 | no | yes | no | — | Produce 3 pizzas. | pizza_chef | kitchen_trainee |
| pizza_chef | Pizza Chef | 3 | no | yes | **yes** | — | Produce 8 pizzas. | — | pizza_cook |

Count check: 12+18+12+6+6+3+6+3+12+6+6+3+3+12+6+3+12+6+3+12+6+6+3+12+6+6+3+12+6+3+6+3 = **222**. High (sum matches errata exactly). Individual counts for Management Trainee (18) and Junior VP (12) come only from the community list — Medium-High.

Confidence on the career tree, entry, salary and 1x icons: **High** (RB p5 image; the 16 cards shown in DLX agree). Notable facts that are easy to get wrong:
- **Pricing Manager is entry-level, salary-free, and cannot be trained.**
- **Recruiting Girl, Trainer, Waitress and Pricing Manager have no career path** in the base game.
- Recruiting manager, discount manager, coach and local manager come from the **Junior VP**, not from their "obvious" track. HR director and CFO come from the **Senior VP**. Guru and regional manager come from the **Vice President**.
- There is a **Vice President** (4 slots) between Junior VP and Senior VP.
- An early rulebook/player aid misprinted the Executive VP as 5 slots; the card (10) is correct (JD 1453570).

### Career tree (base)
```
Management Trainee (2)
 ├─ New Business Developer
 ├─ Luxuries Manager [1x]
 └─ Junior VP (3)
     ├─ Local Manager
     ├─ Discount Manager
     ├─ Recruiting Manager
     ├─ Coach
     └─ Vice President (4)
         ├─ Regional Manager [1x]
         ├─ Guru [1x]
         └─ Senior VP (5)
             ├─ CFO [1x]
             ├─ HR Director [1x]
             └─ Executive VP (10) [1x]
Errand Boy → Cart Operator → Truck Driver → Zeppelin Pilot [1x]
Marketing Trainee → Campaign Manager → Brand Manager → Brand Director [1x]
Kitchen Trainee ─┬─ Burger Cook → Burger Chef [1x]
                 └─ Pizza Cook → Pizza Chef [1x]
Waitress, Pricing Manager, Recruiting Girl, Trainer: no training options
```

Steps: training one level = one training action. E.g., Management Trainee → Senior VP = 3 steps; → HR Director = 4 steps.

### Card colour groups (needed for Ketchup "First lemonade sold": train without changing colour)
From RB p5 card colours: black = managers (MT, JVP, VP, SVP, EVP); purple = waitress, new business developer, CFO; red = local manager, regional manager; salmon = pricing, luxuries, discount managers; grey = recruiting girl, recruiting manager, HR director, trainer, coach, guru; light green = buyers; blue = marketeers; olive green = kitchen. Medium-High (read from image colours).

### Behaviour notes
- Salary icon is fixed per card; "first billboard placed" waives marketeer salaries (campaign manager, brand manager, brand director) without changing the card.
- Busy marketeers still count as owned for salary and for the 1x limit.
- The CEO cannot be fired, trained, or put on the beach.

## 2. Ketchup expansion employees (DLX box: 132 cards + 2 CEO cards)

Source: KX-DLX = Deluxe Ketchup rulebook (printed pages), card images on each module's Components page. Expansion cards carry a red splat mark. Replacement base cards have red-text career paths; use them only when a module needs them (KX-DLX p2):
- **Any Cook Kitchen Trainee** (12): replaces all 12 base kitchen trainees when Sushi, Kimchi, Coffee, Noodles **or Fry Chefs** is used.
- **Expansion Marketing Trainee** (12): replaces all 12 base marketing trainees when Rural Marketeers, Gourmet Food Critics or Mass Marketeers is used.
- **Fry Chef Burger Cook / Pizza Cook** (6 + 6): replace the base cooks with Fry Chefs.
- **Movie Star Waitress** (12): replaces the base waitresses with Movie Stars.

| id | Name | Count | Entry | Salary | 1x | Colour | Action | Trains into | Trained from | Module | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kitchen_trainee (alt) | Kitchen Trainee "Any Cook" | 12 | yes | no | no | green (kitchen) | Produce 1 burger or 1 pizza | any cook: burger, pizza, sushi, noodle cook (as available) | — | Sushi / Noodles / Kimchi / Coffee / Fry chefs | High (KX-DLX p21 image) |
| burger_cook (alt) | Burger Cook "Fry Chef" | 6 | no | yes | no | green | Produce 3 burgers | burger_chef, fry_chef | kitchen_trainee | Fry chefs | High (p21) |
| pizza_cook (alt) | Pizza Cook "Fry Chef" | 6 | no | yes | no | green | Produce 3 pizzas | pizza_chef, fry_chef | kitchen_trainee | Fry chefs | High (p21) |
| marketing_trainee (alt) | Marketing Trainee (expansion) | 12 | yes | no | no | blue | Place 1 billboard, max duration 2, road range 2 | rural_marketeer, gourmet_food_critic, mass_marketeer, campaign_manager | — | Mass / Rural / Gourmet | High (p23, p25, p26) |
| waitress (alt) | Waitress "Movie Star" | 12 | yes | no | no | purple | Get $3; win ties vs fewer waitresses | b/c/d_movie_star | — | Movie stars | High (p27 text) |
| luxuries_manager (extra) | Luxuries Manager | **1** | no | yes | yes | salmon | Price +$10 | — | management_trainee | Add it once if any of Sushi/Kimchi/Noodles/Coffee is used | High (p2, p5, p7, p9, p10) |
| executive_vp (extra) | Executive VP | 3 | no | yes | yes | black | 10 slots | — | senior_vp | Never slotted in the tray; only a "First recruiting girl used" reserve | High (p2, p19) |
| fry_chef | Fry Chef | 6 | no | **yes** | no | green | Bonus +$10 per sale | — | any cook (burger, pizza, sushi, noodle) | Fry chefs | High (p21 image) |
| kimchi_master | Kimchi Master | 3 | yes | yes | yes | green | Must produce 1 kimchi at end of Cleanup | — | — | Kimchi | High (p5 image) |
| sushi_cook | Sushi Cook | 6 | no | **yes** | no | green | Produce 2 sushi | sushi_chef, fry_chef | kitchen_trainee (alt) | Sushi | High (p7 image) |
| sushi_chef | Sushi Chef | 3 | no | yes | yes | green | Produce 5 sushi | — | sushi_cook | Sushi | High (p7) |
| noodle_cook | Noodle Cook | 6 | no | yes | no | green | Produce 6 noodles | noodle_chef, fry_chef | kitchen_trainee (alt) | Noodles | High (p9) |
| noodle_chef | Noodle Chef | 3 | no | yes | yes | green | Produce 16 noodles | — | noodle_cook | Noodles | High (p9) |
| barista_trainee | Barista Trainee | 12 | yes | no | no | teal (coffee) | Produce 1 coffee | barista (training also places 1 coffee shop) | — | Coffee | High (p10 image) |
| barista | Barista | 6 | no | yes | no | teal | Produce 2 coffee | lead_barista (training also places 1 coffee shop) | barista_trainee | Coffee | High (p10) |
| lead_barista | Lead Barista | 3 | no | yes | yes | teal | Produce 5 coffee | — | barista | Coffee | High (p10) |
| lobbyist | Lobbyist | 6 | yes | yes | no | purple | Place 1 road or park; road range 2 | — | — | Lobbyists | High (p15 image) |
| mass_marketeer | Mass Marketeer | 6 | no | **yes** | no | blue | Play an extra marketing phase this turn; do not remove an extra duration token | — | marketing_trainee (alt) | Mass marketeers | High (p23 image) |
| rural_marketeer | Rural Marketeer | 6 | no | **yes** | no | blue | Place a giant billboard next to the rural area tile | — | marketing_trainee (alt) | Rural marketeers | High (p25 image) |
| gourmet_food_critic | Gourmet Food Critic | 6 | no | yes | no | blue | Market to all houses with a garden; max duration 3 | — | marketing_trainee (alt) | Gourmet critics | High (p26 image) |
| night_shift_manager | Night Shift Manager | 3 | **yes** | yes | yes | black (manager) | All your employees who don't require a salary work twice. 0 slots; CEO slot only. | — | — | Night shift | High (p22 image: sparkle, 1x, money icon) |
| b_movie_star | B-Movie Star | **1** | no | yes | yes* | purple | Win all ties; first choice in turn order | — | waitress (alt) | Movie stars | High (p27 image) |
| c_movie_star | C-Movie Star | **1** | no | yes | yes* | purple | Win all ties (not against B); second choice in turn order | — | waitress (alt) | Movie stars | High |
| d_movie_star | D-Movie Star | **1** | no | yes | yes* | purple | Win all ties (not against B or C); third choice in turn order | — | waitress (alt) | Movie stars | High |

\* All movie stars together count as one 1x type: a player may own only one movie star of any letter. Slot B only (2–3p), B+C (4p), B+C+D (5–6p) (KX-DLX p27).

Count check (KX-DLX components): 12+12+12+6+6+1+3+6+3+6+3+6+3+12+6+3+6+6+6+6+3+1+1+1 = **130**. KX-DLX p1 lists **132** employee cards (plus 2 CEO cards). The 2-card gap is unexplained; see `questions.md` Q-E1. **[DLX differs]** the earlier 138 (Splotter: 3 luxuries managers, 3 of each movie star) does not match DLX, which pictures and lists 1 luxuries manager and one card per movie star.

Salary icons on Mass Marketeer, Rural Marketeer, Fry Chef, Sushi Cook: all **yes**, read from KX-DLX card images. High. Every expansion card with a career-path line, entry icon or 1x icon was read from the same images.

Gourmet food critic duration: card says "Max duration 3"; the rulebook says 1–3 item counters. Range: placed beside the board, so unlimited. High.

Card colours (for Ketchup "First lemonade sold", train within the same colour): kitchen green includes Kimchi Master, sushi/noodle cooks and chefs, Fry Chef; coffee cards are a separate teal colour; Lobbyist and Movie Stars are purple (same as Waitress/NBD/CFO); Night Shift Manager is black (manager). From KX-DLX card images. Medium-High (colour equivalence judged by eye).
