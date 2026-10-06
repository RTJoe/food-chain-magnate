/**
 * Phase 6 — Marketing campaigns (base.md §9; DLX p30–32).
 *
 * Every campaign on the board runs in ascending campaign number (the printed tile number, not
 * placement order; audit.md engine 1029). Each places 1 token of its good on every house it
 * reaches (2 for radios with "First Radio Campaign"), capped at 3 tokens per house (5 with a
 * garden; "as many as fit"). After it runs, one duration counter is removed unless eternal — even
 * if it placed nothing. A campaign with no counters left ends: tile back to the supply, its
 * marketeer goes on the beach.
 *
 * Module pipelines: marketingPasses (Ketchup mass marketeers; counters only come off after the
 * last pass), campaignReach, demandCapacity, demandAmount.
 */
import type { HookContext } from '../types/module.js';
import type { Campaign, CampaignId, DemandToken, GameState, House } from '../types/index.js';
import { clearCells } from '../map/grid.js';
import { campaignCells, campaignReach } from '../map/reach.js';
import { hasMilestone, runPipeline } from './pricing.js';

/** Phase 6: run campaigns in number order, place demand, expire campaigns. */
export function runMarketing(ctx: HookContext): void {
  const s = ctx.state;
  const order = campaignRunOrder(s);
  const passes = Math.max(1, runPipeline(ctx, 'marketingPasses', 1, {}));
  s.phase = { kind: 'marketing', pass: 1, passes, order, idx: 0 };
  s.awaiting = { kind: 'none', players: [] };
  for (let pass = 1; pass <= passes; pass++) {
    s.phase.pass = pass;
    for (let i = 0; i < order.length; i++) {
      s.phase.idx = i;
      const camp = s.board.campaigns[order[i] as CampaignId];
      if (!camp) continue;
      runCampaign(ctx, camp, pass);
      if (pass === passes) tick(ctx, camp);
    }
  }
  s.phase.idx = order.length;
}

/** Ascending number (`runOrder` overrides; unnumbered last), then id for stability. */
export function campaignRunOrder(s: GameState): CampaignId[] {
  const key = (c: Campaign) => c.runOrder ?? c.number ?? Number.MAX_SAFE_INTEGER;
  return Object.values(s.board.campaigns)
    .sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => c.id);
}

/** base.md §9: 3 per house, 5 with a garden; apartments and the rural area have no cap. */
export function baseDemandCapacity(house: House): number | null {
  if (house.kind === 'apartment' || house.kind === 'rural') return null;
  return house.garden ? 5 : 3;
}

function runCampaign(ctx: HookContext, camp: Campaign, pass: number): void {
  const s = ctx.state;
  // Work out every house's tokens first so `campaignRan` can name the reach and the full houses
  // (animation, late joiners); state changes and `demandPlaced` follow in the same order as before.
  const reached = runPipeline(ctx, 'campaignReach', campaignReach(s.board, camp), { campaign: camp });
  const drops: { house: House; tokens: DemandToken[] }[] = [];
  for (const houseId of reached) {
    const house = s.board.houses[houseId];
    if (!house) continue;
    const cap = runPipeline(ctx, 'demandCapacity', baseDemandCapacity(house), { house });
    // First Radio Campaign: the owner's radios place 2 per house (DLX p35).
    const base = camp.kind === 'radio' && hasMilestone(s, camp.owner, 'first_radio') ? 2 : 1;
    const amount = runPipeline(ctx, 'demandAmount', base, { house, campaign: camp });
    const tokens: DemandToken[] = [];
    let size = house.demand.length + drops.filter((d) => d.house === house).reduce((n, d) => n + d.tokens.length, 0);
    for (const good of camp.goods) {
      for (let k = 0; k < amount; k++) {
        if (cap !== null && size >= cap) break;
        tokens.push({ good, by: camp.source === 'marketeer' ? camp.owner : null, campaign: camp.id });
        size++;
      }
    }
    drops.push({ house, tokens });
  }
  const houses = drops.map((d) => d.house.id);
  const full = drops.filter((d) => !d.tokens.length).map((d) => d.house.id);
  ctx.emit({ type: 'campaignRan', campaignId: camp.id, pass, reached: houses, full });
  for (const { house, tokens } of drops) {
    if (!tokens.length) continue;
    house.demand.push(...tokens);
    ctx.emit({ type: 'demandPlaced', campaignId: camp.id, houseId: house.id, tokens: tokens.map((t) => ({ ...t })) });
  }
}

/** Remove one duration counter (never from an eternal campaign); expire at 0. */
function tick(ctx: HookContext, camp: Campaign): void {
  if (camp.eternal) return;
  camp.remaining -= 1;
  if (camp.remaining > 0) {
    ctx.emit({ type: 'campaignTicked', campaignId: camp.id, remaining: camp.remaining });
    return;
  }
  expireCampaign(ctx, camp);
}

/** Tile and busy token back to the supply; the marketeer goes on the beach (DLX p30). */
export function expireCampaign(ctx: HookContext, camp: Campaign): void {
  const s = ctx.state;
  clearCells(s.board, campaignCells(camp.placement));
  delete s.board.campaigns[camp.id];
  if (camp.number !== null && !s.marketingTiles.includes(camp.number)) {
    s.marketingTiles.push(camp.number);
    s.marketingTiles.sort((a, b) => a - b);
  }
  ctx.emit({ type: 'campaignExpired', campaignId: camp.id, kind: camp.kind, marketeer: camp.marketeer });
  const p = s.players[camp.owner];
  const uid = camp.marketeer;
  if (!p || !uid || !p.busy[uid]) return;
  const rest = (p.busy[uid] ?? []).filter((c) => c !== camp.id && s.board.campaigns[c]);
  if (rest.length) {
    p.busy[uid] = rest;
    return;
  }
  delete p.busy[uid];
  if (!p.beach.includes(uid)) p.beach.push(uid);
  ctx.emit({ type: 'marketeerReturned', player: p.id, uid });
}
