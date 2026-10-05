/**
 * Ketchup placement flows (ux-plan §2.4, WP5), keyed by placement kind. The registry in
 * ./index.ts spreads these over the base flows.
 *
 * - lobbyistRoad / park: piece first (length / shape), then board with R to turn it.
 * - coffeeShop: board pick; with all three out, the shop to move first.
 * - freeway: board pick with the dotted link to the rural area.
 * - campaign: gourmet guides (auto-staged on the rim) here; other kinds delegate to the base flow.
 * The map tile keeps the base flow (template picker); its board ghost draws the real tile.
 */
import type { FlowComponent } from './types.js';
import { KetchupCoffeeFlow } from './KetchupCoffee.js';
import { KetchupFreewayFlow } from './KetchupFreeway.js';
import { KetchupCampaignFlow } from './KetchupGuide.js';
import { KetchupPieceFlow } from './KetchupPieces.js';

export const ketchupFlows: Record<string, FlowComponent> = {
  lobbyistRoad: KetchupPieceFlow,
  park: KetchupPieceFlow,
  coffeeShop: KetchupCoffeeFlow,
  freeway: KetchupFreewayFlow,
  campaign: KetchupCampaignFlow,
};
