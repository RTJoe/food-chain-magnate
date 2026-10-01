/**
 * The base game as a module (architecture §3.7). Base rules live in rules/**; this module only
 * contributes content. It has no hooks: every pipeline starts from the base value computed by
 * the rules code, and other modules transform it.
 */
import type { GameModule } from '../types/module.js';
import { BASE_EMPLOYEES } from '../content/employees.js';
import { BASE_MILESTONES } from '../content/milestones.js';
import { FOODS } from '../content/foods.js';
import { BASE_MARKETING_TILES, BASE_PLACEABLE_HOUSES, BASE_TILES } from '../map/tiles.js';

export const BASE_MODULE: GameModule = {
  id: 'base',
  name: 'Food Chain Magnate',
  description: 'The base game (Deluxe Edition rules).',
  content: {
    employees: [...BASE_EMPLOYEES],
    milestones: [...BASE_MILESTONES],
    foods: FOODS.filter((f) => f.module === 'base'),
    tiles: [...BASE_TILES],
    marketingTiles: [...BASE_MARKETING_TILES],
    placeableHouses: [...BASE_PLACEABLE_HOUSES],
  },
};
