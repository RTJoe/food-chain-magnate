# Rules Spec Corrections — 2026-10-01

Source switch: the Deluxe rulebooks (`source/*.pdf`) are now primary. Every page was read (text extracted with PDFKit; card, tile and example images rendered and inspected). Page numbers are printed pages.

Tags:
- **[TYPE-IMPACT]** changes a data shape (entity kind, food, action, phase/step, campaign kind, module list, card attribute).
- **[BEHAVIOUR]** changes engine logic but not shapes.
- **[CONFIRM]** previously unverified; now confirmed, no change.

## [TYPE-IMPACT] summary
1. Phase 3 gains explicit step **3c Open Drive-Ins** between Train and Launch Campaigns (base.md §6.1, §6.3a).
2. Road connectivity model: any orthogonally adjacent road squares connect, including across tile borders; bridges, capped ends and restaurant entrances are the exceptions. Per-tile edge-midpoint "exit" data is no longer what links tiles (map.md §2, base.md §14).
3. Milestones are per-player board marks with no copy counts (milestones.md general rule 5). Drop any milestone supply/count field.
4. Payday firing is a **simultaneous** decision, not a turn-order action sequence (base.md §8).
5. "First to Lower Prices" claim moves to a **start-of-Dinnertime** check (base.md §7, milestones.md).
6. Campaign tiles need a per-number **footprint** (w x h): table in base.md §9 / map.md §7.
7. Employee cards need a **colour** attribute (for Ketchup "First lemonade sold"); coffee cards are their own teal group (employees.md §2).
8. Rural campaigns have **no number**; phase-6 ordering needs an explicit rule (ketchup.md §12, Q-K6).

Unchanged shapes (checked): the 17-module Ketchup list; foods/items (burger, pizza, beer, lemonade, soda, coffee, kimchi, sushi, noodles); Lobbyist step between 3f and 3g; First-coffee-sold Cleanup step; growing map (First Lobbyist Used); two-item airplane.

## base.md (34)
1. Primary source set to DLX; tag added.
2. Components: 10 CEO cards, 5 milestone boards + 90 tracker tokens (no milestone cards), 15 coming soon tokens, 3 drive-in tokens per player, 5 freezer tiles, 5 menus.
3. Player setup and supply list per DLX p2–4 (menu, milestone board, drive-ins; freezer tiles in supply).
4. Initial turn order: random line-up (wording).
5. Intro game: must have all 3 drink supplier types on the map (new in DLX).
6. Restructuring: "played" milestones are claimed at reveal; information rules per DLX; Work Planning Variant noted.
7. Turn 1 order of business: choose in random starting order.
8. Mandatory/optional list per DLX (drive-ins mandatory; production optional).
9. **[TYPE-IMPACT]** Sub-step 3c Open Drive-Ins.
10. Entry-level icon is a sparkle, not a play triangle; Ketchup salaried entry cards must be paid this Payday.
11. "First to hire 3": its free Management Trainees cannot be combined with a train to skip an empty pile.
12. Drive-ins only on open restaurants; distance from the nearest corner; regional manager's new restaurant gets a drive-in.
13. Marketeer range starts from open restaurants; a campaign on the next tile costs that border.
14. Airplane widths: #4 = 1, #5 = 3, #6 = 5 (was Low). Airplane tokens cannot overlap; flyover zones may (dropped the "three on one row illegal" ruling).
15. Busy marketeer is neither played nor on the beach; cannot be played, used, trained or voluntarily fired.
16. Eternal marketeers have no salary and can never be fired.
17. "Which tile": take any available token (DLX wording).
18. **[BEHAVIOUR]** Buyer route starts on the road beside the entrance; a supplier touching only the entrance is not collected; +1 range if that road is on another tile.
19. **[BEHAVIOUR]** Backtracking: squares/tiles may be revisited; only immediate reversal banned.
20. **[BEHAVIOUR]** Buyers need not use full range (JD 1587582 superseded); passed suppliers still mandatory.
21. Zeppelin collects on the start tile; air distance defined.
22. Errand boy: drink type need not be on the map.
23. NBD placement wording per DLX (any house without a garden; tokens limited).
24. **[BEHAVIOUR]** Local manager: new restaurant must connect to the road its route used.
25. Regional manager: relocated restaurant keeps its drive-in.
26. **[TYPE-IMPACT]** First to Lower Prices claimed at start of Dinnertime.
27. $20/$100 check-point conflict recorded (Q-B1).
28. **[TYPE-IMPACT]** Payday firing simultaneous (JD 2185563 superseded).
29. **[TYPE-IMPACT]** Campaign tile footprint table; numbering 1–16 now High.
30. Campaign end: marketeer goes on the beach, not to hand.
31. **[BEHAVIOUR]** Bank breaks when it reaches $0 (was "insufficient funds").
32. Mailbox: roads touching at a corner block; flood-fill spec.
33. **[TYPE-IMPACT]** Road graph rule (see summary item 2); two roads at one entrance do not connect through it.
34. Page references moved to DLX; DLX dinnertime example added.

(34 items; 31 are rule corrections, 3 are source/page housekeeping.)

## employees.md (11)
1. Entry icon = sparkle.
2. CEO cards: 10 in box, cosmetic.
3. **[CONFIRM]** 16 base cards shown in DLX match on entry, salary, 1x, slots, range, career.
4. Ketchup source switched to DLX card images; red-splat expansion mark noted.
5. Replacement-card swap rules per DLX p2 (Any Cook also for Fry Chefs).
6. Extra Luxuries Manager: **1** card (was 3).
7. Movie stars: **1** card each (was 3).
8. Ketchup total 132 per DLX (tally 130; was 138) — Q-E1.
9. **[CONFIRM]** Salary icons: Fry Chef, Sushi Cook, Mass Marketeer, Rural Marketeer = yes (was Medium). Night Shift Manager is entry level (card sparkle).
10. **[TYPE-IMPACT]** Colour column added; coffee is its own colour group.
11. Barista training places a coffee shop (card icon); Lobbyist range 2; expansion marketing trainee career order.

## milestones.md (10)
1. Source switched to DLX; DLX milestone names.
2. **[TYPE-IMPACT]** No milestone cards/copies; per-player board.
3. **[TYPE-IMPACT]** first_lower_prices trigger at start of Dinnertime.
4. first_20 / first_100 wording conflict recorded.
5. first_hire_3: no skip-train with the free trainees.
6. first_billboard: waiver covers busy marketeers; eternal marketeers unfireable.
7. first_throw_away: gain a freezer tile; frozen items remain stock.
8. first_100: CFO firing timing not stated in DLX (was asserted phase 5, High).
9. first_cart_operator: errand boys unaffected.
10. first_burger/pizza_produced: must pay or fire the cook this Payday.

## map.md (6)
1. **[TYPE-IMPACT]** Connectivity: adjacent road squares connect across tile borders; exceptions listed.
2. Mailbox corner-blocking rule.
3. **[CONFIRM]** Placeable houses: 1, 9, 11, 14, 19 seen in DLX; 3, 6, 17 Medium-High (was Medium).
4. **[TYPE-IMPACT]** Marketing tile table with footprints (radio 1x1; airplanes 1/3/5; mailboxes 7 = 2x2, 9/10 = 1x1; billboards 11 = 3x2, 12 = 2x2, 13 = 3x1, 14 = 2x1, 15 = 1x1).
5. **[CONFIRM]** Tiles U–Z match the DLX pictures.
6. Sources and 6p map reference updated.

## ketchup.md (30)
1. Primary source set to DLX Ketchup rulebook.
2. Module list table with pages (17 modules + combination rules) — **no change** to the module set.
3. DLX component list (132 cards, 2 CEOs, 18 coffee shops, 3 airplanes, 4 rural campaigns, 4 gourmet campaigns, 8 roads, 8 roadworks, 4 parks, 3 freeways).
4. Extra luxuries manager: 1 card.
5. New Districts: random draw may contain no new tile.
6. Apartment + First radio = 4 counters raised to Medium-High.
7. Lobbyist card details from image (entry, salary, range 2).
8. Lobbyist footprints still unknown (Q-K1); no measurements in DLX.
9. Road arrow rule A/B precise; may point at earlier roadwork.
10. **[BEHAVIOUR]** Roadworks +1 for every road route, not only dinnertime (community ruling superseded).
11. Parallel-road sentence (KX p7) not in DLX; redundant under base rule.
12. Parks: x3 via any side of a garden house; first park only.
13. First Lobbyist Used: tile is chosen, not random; airplane/freeway edge restriction; orientation open.
14. New Milestones: insert replaces base board; 3 airplanes numbered 4–6 with A/B (replacement question Q-K3).
15. "Used" definition per DLX p17.
16. First marketeer used: $5 paid immediately; apartments/rural give $10.
17. First brand manager used: up to duration 4; forfeiture rule.
18. First brand director used: eternal radio's director keeps a salary, fireable only for lack of cash.
19. First pizza sold: uses base radio tokens.
20. **[BEHAVIOUR]** First recruiting girl used: EVP from the tray first, box only if empty.
21. First discount manager used: recommendation added (Q-K5).
22. First new restaurant: base mailbox token; mailbox-range definition.
23. "First soda sold" name.
24. Coffee: shop count, mandatory coffee purchase, first-coffee-sold Cleanup placement.
25. Fry chef salary High.
26. Mass marketeer: counts per work slot; not covered by base billboard salary waiver.
27. Night shift manager hire-ability from card image.
28. Rural: campaign item rules, freeway placement rule, unnumbered run order, distance recommendation.
29. Gourmet campaign numbering 17–20 (Medium-High; one shows 20).
30. Movie stars 1 each; Hard Choices wording; Ketchup milestone ignores non-marketeer demand.

## audit.md (10 rows revised; the 7 rule changes are marked [rev])
Top-10 #3 (tile links), #8 (step order), #10 (bank $0 is correct); engine 621–660 (full range not required), 956–1004 (simultaneous firing), 1029 (numbering High); map.js 445–474 (adjacent road cells do connect), 263 (house numbers); ui.js 902–903, main.js 110–139.

## questions.md
New file: 23 open items (Q-B1–B7, Q-M1–M3, Q-E1–E3, Q-K1–K10).
