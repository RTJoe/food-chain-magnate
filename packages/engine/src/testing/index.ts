/** @fcm/engine/testing — builders, fixtures and the toy engine. Not used by production rules code. */
export * from './stateBuilder.js';
export * from './validate.js';
export { buildBoard, parseLayout, rotateCell, renderAscii, paint, rect, touchesRoad, type LayoutEntry } from './board.js';
export { TEST_TILE_GRIDS, type TestTileGrid } from './tileGrids.js';
export { FIXTURES, type FixtureName } from './fixtures/index.js';
export { toyEngine, TOY_MANIFEST } from './toyGame.js';
export { town, TUTORIAL_MAP, TOWN_RESTAURANTS, TOWN_SOURCES, type TownOptions } from './fixtures/tutorialTown.js';
