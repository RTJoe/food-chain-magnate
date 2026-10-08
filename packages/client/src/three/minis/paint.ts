/**
 * Shared "painted mini" palette: the Special Edition sculpts with a careful hobby paint job.
 * Body colours stay with their family (player colour, drink colour, house walls); these are the
 * detail paints every builder shares so windows, roofs, wood and metal match across the town.
 */
export const PAINT = {
  // Glazing
  glass: '#8fc3d9',
  glassDark: '#4f7f99',
  glassLit: '#f6e7a8',
  frame: '#f4efe2',
  // Roofs
  roofTerracotta: '#b0563b',
  roofSlate: '#5f6670',
  roofShingle: '#7a5a46',
  roofGreen: '#4e6e55',
  flashing: '#9aa0a6',
  // Walls (houses only; never a saturated player colour)
  wallCream: '#efe4c8',
  wallWhite: '#f3efe6',
  wallButter: '#ead9a0',
  wallSage: '#bfcbb0',
  wallBlush: '#e6c7b8',
  wallSky: '#c8d6dc',
  brick: '#a5503c',
  brickDark: '#7e3a2c',
  stone: '#c9c0ad',
  concrete: '#b9b7b0',
  // Doors and trim
  doorRed: '#9e2f2f',
  doorGreen: '#2f5e46',
  doorBlue: '#2f4f78',
  doorWood: '#7a4f30',
  trimWhite: '#f8f4ea',
  trimDark: '#3a3530',
  // Materials
  wood: '#9a6a43',
  woodDark: '#6e4a2f',
  woodLight: '#c49a6c',
  metal: '#a7adb7',
  metalDark: '#5f646d',
  chrome: '#d9dde2',
  rubber: '#2b2b2d',
  // Signs
  signCream: '#fbf3dc',
  signInk: '#2a2420',
  neonRed: '#e8433a',
  // Nature
  lawn: '#7aa556',
  lawnDark: '#5e8a42',
  leaf: '#5f9e4a',
  leafLight: '#86bf5f',
  trunk: '#6f4b33',
  flowerRed: '#d8484a',
  flowerYellow: '#f1cf4a',
  flowerWhite: '#f6f2ea',
  water: '#6fa8c4',
  soil: '#7b5a3e',
  // Street
  asphalt: '#4b4e53',
  asphaltLight: '#5c6066',
  kerb: '#c9c4b8',
  pavement: '#cfcac0',
  lineWhite: '#f1eee6',
  lineYellow: '#e8c547',
  // Drinks (component base tones, painted)
  beer: '#3f7d3a',
  lemonade: '#e9c83a',
  cola: '#b8322c',
} as const;
