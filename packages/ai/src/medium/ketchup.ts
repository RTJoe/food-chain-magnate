/**
 * Pending choices (forced firing and Ketchup rewards, ai-strategy.md §9). Medium scores the ones
 * where placement matters with its own scorers (second campaign, free mailbox, pizza radio, coffee
 * shop); anything else goes to the Easy bot's choice logic, which is always legal.
 */
import type { Action, FoodId, Placement } from '@fcm/engine';
import { easyChoose } from '../easy.js';
import { actionFromPlacement, cellsDistance, myEntrances } from '../heuristics.js';
import { placementsOf, readyOf, type Ctx } from '../shared/ctx.js';
import { campaignOptions } from './campaign.js';
import { chooseFood } from './archetype.js';
import { forcedFire } from './phases.js';

export function chooseChoice(c: Ctx): Action[] {
  const head = c.s.pending[0];
  if (!head || head.player !== c.me) return [];
  if (head.kind === 'forcedFire') return [{ type: 'payday.fire', playerId: c.me, uids: forcedFire(c) }];
  const out: Action[] = [];
  const entries = placementsOf(c.legal);
  if (head.kind === 'secondCampaign') {
    // Same kind/good/duration as the first: score spots by reach.
    const opts = campaignOptions(c, entries.filter((l) => l.spec.kind === 'campaign'), 3);
    for (const o of opts) {
      const a = actionFromPlacement(c.s, c.me, o.la, { kind: 'campaign', campaignKind: o.kind, tileNumber: o.tileNumber, placement: o.placement });
      if (a && o.value > 0) out.push(a);
    }
  } else if (head.kind === 'freeMailbox' || head.kind === 'pizzaRadio') {
    const good: FoodId = head.kind === 'pizzaRadio' ? 'pizza' : chooseFood(c);
    for (const la of entries) {
      let pls: Placement[];
      try {
        pls = c.engine.legalPlacements(c.s, c.me, la.spec);
      } catch {
        continue;
      }
      const scored = pls
        .map((pl) => {
          if (pl.kind !== 'freeMailbox' && pl.kind !== 'pizzaRadio') return { pl, v: -1 };
          const kind = pl.kind === 'pizzaRadio' ? 'radio' : 'mailbox';
          const tile = Object.values(c.s.board.campaigns).length;
          let v = 0;
          try {
            const r = c.engine.campaignReach(c.s, { kind, placement: { kind: 'board', x: pl.x, y: pl.y, w: 1, h: 1 }, owner: c.me, goods: [good], tileNumber: tile });
            for (const h of r.houses) {
              const house = c.s.board.houses[h.houseId];
              const d = house ? cellsDistance(house.cells, myEntrances(c.s, c.me)) : 10;
              v += (h.adds || 0.5) / (1 + d / 3);
            }
          } catch {
            v = 0;
          }
          return { pl, v };
        })
        .sort((a, b) => b.v - a.v)
        .slice(0, 4);
      for (const { pl } of scored) {
        const a = actionFromPlacement(c.s, c.me, la, pl, { good });
        if (a) out.push(a);
      }
    }
  } else if (head.kind === 'coffeeShop') {
    for (const la of entries) {
      let pls: Placement[];
      try {
        pls = c.engine.legalPlacements(c.s, c.me, la.spec);
      } catch {
        continue;
      }
      const score = (pl: Placement): number => {
        if (pl.kind !== 'coffeeShop') return -99;
        let v = 0;
        for (const h of Object.values(c.s.board.houses)) {
          const d = cellsDistance(h.cells, [{ x: pl.x, y: pl.y }]);
          if (d <= 5) v += (1 + h.demand.length) / (1 + d);
        }
        return v;
      };
      for (const pl of [...pls].sort((a, b) => score(b) - score(a)).slice(0, 4)) {
        const a = actionFromPlacement(c.s, c.me, la, pl);
        if (a) out.push(a);
      }
    }
  }
  try {
    out.push(easyChoose({ view: c.view, playerId: c.me, legal: c.legal, engine: c.engine, rng: c.rng, budgetMs: 50 }));
  } catch {
    // Easy never throws, but be safe.
  }
  out.push(...readyOf(c.legal, 'choice.decline'));
  return out;
}
