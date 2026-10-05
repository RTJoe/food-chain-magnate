/**
 * @fcm/ai — AI opponents (docs/ai.md). Imports @fcm/engine only; pure TS, no DOM or Node APIs, so
 * it runs inline, in a Node worker thread (server) or a Web Worker (hot-seat).
 */
export * from './types.js';
export { createBot, registerBot, hasBot, type BotFactory } from './registry.js';
export { runBot, runBotDetailed, botInput, decisionSeed, type BotResult } from './run.js';
export { viewState, sampleState } from './viewState.js';
export { createEasyBot } from './easy.js';
export * as medium from './medium/index.js';
export { createMediumBot } from './medium/index.js';
export * as hard from './hard/index.js';
export { createHardBot, type HardOptions } from './hard/index.js';
export * as heuristics from './heuristics.js';
export { fallbackAction, actionFromPlacement, simpleStructure } from './heuristics.js';
