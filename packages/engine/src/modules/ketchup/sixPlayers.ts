/**
 * 6 Players (ketchup.md §17; DLX p30).
 *
 * Adds Siap Faji (chain id `siap_faji`) and the 6-player track. Everything else follows from base
 * formulas already in the engine: configs allow 6 seats when this module is on (createGame), the
 * map is 4x6 tiles (map/generate.ts), 1x cards have 3 copies, the bank starts at $50 x 6 and no
 * billboard is removed. Requires New Districts (25 tiles are needed for a 4x6 map).
 */
import type { GameModule } from '../../types/module.js';

export const SIX_PLAYERS_MODULE: GameModule = {
  id: 'ketchup:sixPlayers',
  name: '6 Players',
  description: 'A sixth chain (Siap Faji) and a 4x6 map.',
  requires: ['ketchup:newDistricts'],
};
