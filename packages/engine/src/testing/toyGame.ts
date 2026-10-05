/**
 * Toy engine: a trivial game on the real `GameState`/`Action`/`GameView` types implementing the
 * full `EngineApi`, so server, session and client can be built and tested before the real
 * rules exist. NOT Food Chain Magnate.
 *
 * Rules:
 * 1. `setup.reserve`: every player secretly picks a reserve card (simultaneous, hidden).
 * 2. `working`: players in turn order; the active player may `work.produce` (CEO card, burger or
 *    pizza, up to 3 times per turn, undoable) and must `work.endTurn`.
 * 3. After the last player: `dinnertime` auto-resolves — everyone sells all stock at $10 each from
 *    the bank. If the bank cannot pay, the game ends (most cash wins, ties by turn order).
 */
import type { EngineApi } from '../index.js';
import type { Action, Applied, Ok, Rejected, RejectCode } from '../types/actions.js';
import type { GameEvent } from '../types/events.js';
import type { ModuleManifest } from '../types/module.js';
import type { FoodId } from '../types/content.js';
import type { GameConfig, GameState, PlayerId, ReserveCard } from '../types/state.js';
import type { GameView, LegalAction, Prompt, Viewer } from '../types/view.js';
import { clone } from '../core/clone.js';
import { FOODS } from '../content/foods.js';
import { stateBuilder } from './stateBuilder.js';

const PRODUCE_PER_TURN = 3;
const RESERVES: ReserveCard[] = [
  { kind: 'standard', amount: 100, ceoSlots: 2 },
  { kind: 'standard', amount: 200, ceoSlots: 3 },
  { kind: 'standard', amount: 300, ceoSlots: 4 },
];

export const TOY_MANIFEST: ModuleManifest = {
  id: 'base',
  name: 'Toy game',
  description: 'Placeholder engine for server/client development. Produce food, sell it, break the bank.',
  requires: [],
  conflicts: [],
  options: {},
  content: { foods: FOODS.filter((f) => f.module === 'base') },
};

const reject = (code: RejectCode, message: string): Rejected => ({ ok: false, code, message });
const OK: Ok = { ok: true };

function createGame(config: GameConfig, seed: number): GameState {
  const s = stateBuilder({ seats: config.players, seed, intro: config.intro }).build();
  s.config = clone(config);
  s.round = 1;
  if (config.intro) startWorking(s, []);
  else {
    s.phase = { kind: 'setup.reserve' };
    s.awaiting = { kind: 'setup.reserve', players: [...s.turnOrder] };
  }
  return s;
}

function startWorking(s: GameState, events: GameEvent[], idx = 0): void {
  const player = s.turnOrder[idx] as PlayerId;
  const ceo = s.players[player]?.structure.ceo as string;
  s.phase = { kind: 'working', player, idx };
  s.turn = { player, stage: 'food', uses: { [ceo]: PRODUCE_PER_TURN }, hired: [], mustTrain: [], trained: {}, campaignsPlaced: [], used: [] };
  s.awaiting = { kind: 'work', players: [player] };
  events.push({ type: 'phaseChanged', from: null, to: s.phase }, { type: 'turnStarted', player });
}

function validateAction(s: GameState, a: Action): Ok | Rejected {
  if (s.phase.kind === 'gameOver') return reject('GAME_OVER', 'The game is over');
  if (!s.players[a.playerId]) return reject('INVALID_PAYLOAD', `Unknown player ${a.playerId}`);
  switch (a.type) {
    case 'setup.chooseReserve': {
      if (s.phase.kind !== 'setup.reserve') return reject('WRONG_PHASE', 'Not choosing reserves');
      if (s.secrets[a.playerId]?.reserve) return reject('ALREADY_SUBMITTED', 'Reserve already chosen');
      const ok = RESERVES.some((r) => JSON.stringify(r) === JSON.stringify(a.card));
      return ok ? OK : reject('INVALID_PAYLOAD', 'Not a reserve card');
    }
    case 'work.produce': {
      if (s.phase.kind !== 'working') return reject('WRONG_PHASE', 'Not the working phase');
      if (s.phase.player !== a.playerId) return reject('NOT_YOUR_TURN', 'Not your turn');
      if (s.players[a.playerId]?.structure.ceo !== a.cardUid) return reject('NOT_OWNED', 'Use your CEO card');
      if ((s.turn?.uses[a.cardUid] ?? 0) <= 0) return reject('CARD_UNAVAILABLE', 'No production left this turn');
      if (a.food && a.food !== 'burger' && a.food !== 'pizza') return reject('ILLEGAL', 'Burger or pizza only');
      return OK;
    }
    case 'work.endTurn':
      if (s.phase.kind !== 'working') return reject('WRONG_PHASE', 'Not the working phase');
      return s.phase.player === a.playerId ? OK : reject('NOT_YOUR_TURN', 'Not your turn');
    default:
      return reject('UNKNOWN_ACTION', `The toy game does not support ${a.type}`);
  }
}

function applyAction(input: GameState, a: Action): Applied | Rejected {
  const v = validateAction(input, a);
  if (!v.ok) return v;
  const s = clone(input);
  const events: GameEvent[] = [];
  let undoable = false;
  if (a.type === 'setup.chooseReserve') {
    (s.secrets[a.playerId] as { reserve: ReserveCard | null }).reserve = clone(a.card);
    events.push({ type: 'reserveChosen', player: a.playerId, card: clone(a.card) });
    s.awaiting.players = s.awaiting.players.filter((p) => p !== a.playerId);
    if (s.awaiting.players.length === 0) startWorking(s, events);
  } else if (a.type === 'work.produce') {
    const food: FoodId = a.food ?? 'burger';
    const p = s.players[a.playerId];
    if (p && s.turn) {
      p.inventory[food] = (p.inventory[food] ?? 0) + 1;
      s.turn.uses[a.cardUid] = (s.turn.uses[a.cardUid] ?? 0) - 1;
      events.push({ type: 'foodProduced', player: a.playerId, uid: a.cardUid, food, count: 1 });
    }
    undoable = true;
  } else if (a.type === 'work.endTurn' && s.phase.kind === 'working') {
    events.push({ type: 'turnEnded', player: a.playerId });
    const next = s.phase.idx + 1;
    if (next < s.turnOrder.length) startWorking(s, events, next);
    else dinnertime(s, events);
  }
  s.history.seq += 1;
  return { ok: true, state: s, events, undoable };
}

function dinnertime(s: GameState, events: GameEvent[]): void {
  s.turn = null;
  s.phase = { kind: 'dinnertime', houses: [], idx: 0 };
  events.push({ type: 'phaseChanged', from: 'working', to: s.phase });
  for (const id of s.turnOrder) {
    const p = s.players[id];
    if (!p) continue;
    const lines = (Object.entries(p.inventory) as [FoodId, number][]).filter(([, n]) => n > 0);
    const total = lines.reduce((sum, [, n]) => sum + n * s.basePrice, 0);
    if (total === 0) continue;
    if (total > s.bank.cash) {
      s.bank.breaks = 1;
      events.push({ type: 'bankBroke', breakNo: 1, added: 0, ceoSlots: s.ceoSlots, basePrice: s.basePrice });
      const ranking = [...s.turnOrder].sort((a, b) => (s.players[b]?.cash ?? 0) - (s.players[a]?.cash ?? 0));
      s.phase = { kind: 'gameOver', ranking, reason: 'bankBroke' };
      s.awaiting = { kind: 'none', players: [] };
      const cash = Object.fromEntries(s.turnOrder.map((pid) => [pid, s.players[pid]?.cash ?? 0]));
      events.push({ type: 'phaseChanged', from: 'dinnertime', to: s.phase }, { type: 'gameEnded', ranking, cash });
      return;
    }
    s.bank.cash -= total;
    p.cash += total;
    p.inventory = {};
    events.push({
      type: 'sale',
      houseId: 'toy-market',
      player: id,
      restaurantId: 'toy-restaurant',
      distance: 0,
      unitPrice: s.basePrice,
      lines: lines.map(([good, count]) => ({ good, count, each: s.basePrice })),
      bonuses: [],
      total,
    });
    events.push({ type: 'cashChanged', player: id, delta: total, reason: 'sale', bank: s.bank.cash });
  }
  s.round += 1;
  events.push({ type: 'roundStarted', round: s.round });
  startWorking(s, events);
}

function redactFor(s: GameState, viewer: Viewer): GameView {
  const { rng: _rng, seed: _seed, secrets, ...open } = clone(s);
  const mine = viewer === 'spectator' ? null : (secrets[viewer] ?? null);
  const submitted = Object.fromEntries(s.turnOrder.map((id) => [id, secrets[id]?.reserve != null]));
  const visibleReserves: GameView['visibleReserves'] = {};
  if (mine?.reserve && viewer !== 'spectator') visibleReserves[viewer] = mine.reserve;
  return { ...open, viewer, mine, submitted, visibleReserves };
}

function redactEvents(events: GameEvent[], viewer: Viewer): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'reserveChosen' && e.player !== viewer) return { type: e.type, player: e.player };
    if (e.type === 'structureSubmitted' && e.player !== viewer) return { type: e.type, player: e.player };
    return e;
  });
}

function legalActions(s: GameState, playerId: PlayerId): LegalAction[] {
  if (!s.awaiting.players.includes(playerId)) return [];
  if (s.phase.kind === 'setup.reserve') {
    return RESERVES.map((card) => ({
      kind: 'ready',
      label: `Reserve +$${card.amount}`,
      action: { type: 'setup.chooseReserve', playerId, card },
    }));
  }
  if (s.phase.kind !== 'working') return [];
  const ceo = s.players[playerId]?.structure.ceo as string;
  const out: LegalAction[] = [];
  if ((s.turn?.uses[ceo] ?? 0) > 0) {
    for (const food of ['burger', 'pizza'] as const) {
      out.push({ kind: 'ready', label: `Make a ${food}`, action: { type: 'work.produce', playerId, cardUid: ceo, food } });
    }
  }
  out.push({ kind: 'ready', label: 'End turn', action: { type: 'work.endTurn', playerId } });
  return out;
}

function derivePrompt(view: GameView, me: PlayerId | null): Prompt {
  const waitingFor = view.awaiting.players;
  if (view.phase.kind === 'gameOver') return { kind: 'gameOver', title: 'Game over', ranking: view.phase.ranking };
  if (me === null) return { kind: 'spectating', title: 'Spectating', waitingFor };
  if (!waitingFor.includes(me)) return { kind: 'waiting', title: 'Waiting for other players', waitingFor };
  if (view.phase.kind === 'setup.reserve') return { kind: 'chooseReserve', title: 'Choose a reserve card', options: RESERVES };
  const ceo = view.players[me]?.structure.ceo as string;
  return { kind: 'work', title: 'Make food, then end your turn', stage: 'food', cards: [ceo] };
}

function replay(config: GameConfig, seed: number, actions: Action[]): { state: GameState; events: GameEvent[][] } {
  let state = createGame(config, seed);
  const events: GameEvent[][] = [];
  for (const a of actions) {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(`replay: action ${a.type} rejected: ${r.message}`);
    state = r.state;
    events.push(r.events);
  }
  return { state, events };
}

export const toyEngine: EngineApi = {
  createGame,
  validateAction,
  applyAction,
  legalActions,
  legalPlacements: () => [],
  redactFor,
  redactEvents,
  derivePrompt,
  replay,
  listModules: () => [clone(TOY_MANIFEST)],
  // The toy game has no board rules: empty previews.
  campaignReach: () => ({ houses: [], area: [] }),
  houseCellsReach: () => [],
  rangeOverlay: () => ({ roads: [], starts: [], range: null }),
  houseOutlook: () => null,
  placementProblem: () => 'The toy game has no board placements',
};
