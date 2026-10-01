/**
 * Seeded scripted bot for integration tests. Drives a game purely through the public API:
 * `legalActions` + `legalPlacements` → an action → `applyAction`. Its own RNG is independent of
 * the game RNG, so a (game seed, bot seed) pair is fully reproducible.
 */
import type { Action, FoodId, GameConfig, GameEvent, GameState, LegalAction, Placement, PlayerId, RngState, StructureSubmission, Uid } from '../../src/index.js';
import { applyAction, createRng, legalActions, legalPlacements, randomInt } from '../../src/index.js';
import { cardsInHand, ceoSlotsFor, defOf, isManager, managerSlots } from '../../src/core/cards.js';
import { contentFor } from '../../src/modules/registry.js';
import { salariedCards } from '../../src/rules/payday.js';
import { abilityStage, stageIndex, stagesFor } from '../../src/rules/working/stages.js';

export function config(players = 3, extra: Partial<GameConfig> = {}): GameConfig {
  const colors = ['#d94f3d', '#e8b730', '#3f8fd2', '#4caf6a', '#9b5fc0'];
  const chains = ['fried_geese_donkey', 'golden_duck_diner', 'santa_maria_pizza', 'xango_blues_bar', 'gluttony_inc'] as const;
  return {
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, chain: chains[i] ?? 'gluttony_inc', color: colors[i] ?? '#000' })),
    modules: [],
    options: {},
    intro: false,
    introMilestones: false,
    map: { kind: 'random' },
    ...extra,
  };
}

const pick = <T>(rng: RngState, xs: readonly T[]): T => xs[randomInt(rng, xs.length)] as T;

/** Fill CEO slots with managers first, then managers' slots, then the rest; never overfill. */
export function botStructure(s: GameState, player: PlayerId): StructureSubmission {
  const p = s.players[player];
  if (!p) return { ceoSubs: [], managerSubs: {} };
  const content = contentFor(s.config.modules);
  const hand = cardsInHand(p);
  // Ketchup night shift manager: 0 slots, CEO slot only (ketchup.md §11).
  const ceoOnly = (u: Uid) => isManager(defOf(content, p, u)) || defOf(content, p, u)?.ability.kind === 'nightShift';
  const managers = hand.filter(ceoOnly);
  const others = hand.filter((u) => !ceoOnly(u));
  const slots = ceoSlotsFor(s, content, player);
  const ceoSubs: Uid[] = managers.slice(0, slots);
  const managerSubs: Record<Uid, Uid[]> = {};
  for (const m of ceoSubs) {
    if (!isManager(defOf(content, p, m))) continue;
    const n = managerSlots(defOf(content, p, m));
    managerSubs[m] = others.splice(0, n);
  }
  while (ceoSubs.length < slots && others.length) ceoSubs.push(others.shift() as Uid);
  return { ceoSubs, managerSubs };
}

const GOODS: FoodId[] = ['burger', 'pizza', 'beer', 'lemonade', 'soft_drink'];

function fromPlacement(player: PlayerId, la: Extract<LegalAction, { kind: 'placement' }>, pl: Placement, rng: RngState, s: GameState): Action | null {
  const cardUid = la.cardUid ?? '';
  const choiceId = la.spec.choiceId ?? '';
  if (pl.kind === 'campaign' && la.actionType === 'ketchup:newMilestones.placeSecondCampaign') {
    return { type: 'ketchup:newMilestones.placeSecondCampaign', playerId: player, choiceId, tileNumber: pl.tileNumber, placement: pl.placement };
  }
  switch (pl.kind) {
    case 'restaurant':
      return la.actionType === 'setup.placeRestaurant'
        ? { type: 'setup.placeRestaurant', playerId: player, x: pl.x, y: pl.y, entrance: pl.entrance }
        : { type: 'work.placeRestaurant', playerId: player, cardUid, x: pl.x, y: pl.y, entrance: pl.entrance };
    case 'moveRestaurant':
      return { type: 'work.moveRestaurant', playerId: player, cardUid, restaurantId: pl.restaurantId, x: pl.x, y: pl.y, entrance: pl.entrance };
    case 'house':
      return { type: 'work.placeHouse', playerId: player, cardUid, houseOrder: pl.houseOrder, x: pl.x, y: pl.y, gardenSide: pl.gardenSide };
    case 'garden':
      return { type: 'work.placeGarden', playerId: player, cardUid, houseId: pl.houseId, side: pl.side };
    case 'campaign': {
      const def = defOf(contentFor(s.config.modules), s.players[player] as never, cardUid);
      const max = def?.ability.kind === 'marketing' ? def.ability.maxDuration : 1;
      return { type: 'work.placeCampaign', playerId: player, cardUid, campaignKind: pl.campaignKind, tileNumber: pl.tileNumber, goods: [pick(rng, GOODS)], placement: pl.placement, duration: 1 + randomInt(rng, max) };
    }
    case 'buyerRoute':
      return { type: 'work.buyDrinks', playerId: player, cardUid, route: pl.route };
    // Ketchup module placements.
    case 'coffeeShop':
      return { type: 'ketchup:coffee.placeShop', playerId: player, choiceId, x: pl.x, y: pl.y, ...(pl.moveFrom ? { moveFrom: pl.moveFrom } : {}) };
    case 'lobbyistRoad':
      return { type: 'ketchup:lobbyists.placeRoad', playerId: player, cardUid, cells: pl.cells, arrows: pl.arrows, from: pl.from };
    case 'park':
      return { type: 'ketchup:lobbyists.placePark', playerId: player, cardUid, x: pl.x, y: pl.y, w: pl.w, h: pl.h, from: pl.from };
    case 'mapTile':
      return { type: 'ketchup:lobbyists.placeMapTile', playerId: player, choiceId, row: pl.row, col: pl.col, rotation: pl.rotation, ...(pl.templateId ? { templateId: pl.templateId } : {}) };
    case 'freeway':
      return { type: 'ketchup:ruralMarketeers.placeFreeway', playerId: player, choiceId, side: pl.side, offset: pl.offset };
    case 'pizzaRadio':
      return { type: 'ketchup:newMilestones.placePizzaRadio', playerId: player, choiceId, x: pl.x, y: pl.y };
    case 'freeMailbox':
      return { type: 'ketchup:newMilestones.placeFreeMailbox', playerId: player, choiceId, x: pl.x, y: pl.y, good: pick(rng, GOODS) };
    default:
      return null;
  }
}

export type BotChooser = (s: GameState, player: PlayerId, rng: RngState) => Action;

/**
 * A steadier bot for long games (Ketchup integration tests): in Working it first picks a card,
 * then one of that card's actions, so the many hire options do not crowd out cooking, buying and
 * marketing; it only hires salaried cards while it has cash to spare. Otherwise like `botAction`.
 */
export function balancedBotAction(s: GameState, player: PlayerId, rng: RngState): Action {
  if (s.phase.kind !== 'working' || s.pending.length) return botAction(s, player, rng);
  const content = contentFor(s.config.modules);
  const cash = s.players[player]?.cash ?? 0;
  const legal = legalActions(s, player).filter((l) => {
    if (l.kind === 'compose') return false;
    if (l.kind === 'ready' && (l.action.type === 'work.skip' || l.action.type === 'work.endTurn')) return false;
    if (l.kind === 'ready' && l.action.type === 'work.recruit') return !content.employees[l.action.employeeId]?.salary || cash >= 40;
    return true;
  });
  const cardOf = (l: LegalAction) => (l.kind === 'ready' ? ((l.action as { cardUid?: string }).cardUid ?? l.action.type) : l.kind === 'placement' ? (l.cardUid ?? l.actionType) : '');
  // Mostly act in sub-step order, so an early drink run does not close hiring and marketing.
  const p = s.players[player];
  const stages = stagesFor(s, player);
  const stageOf = (l: LegalAction) => {
    const uid = cardOf(l);
    const st = p ? abilityStage(defOf(content, p, uid)) : null;
    return st ? stageIndex(stages, st) : 0;
  };
  const first = Math.min(...legal.map(stageOf));
  const pool = randomInt(rng, 5) === 0 ? legal : legal.filter((l) => stageOf(l) === first);
  const groups = [...new Set(pool.map(cardOf))];
  // Each chain sticks to one drink: it markets it and its errand boys fetch it, so orders can be met.
  const fav = (['beer', 'lemonade', 'soft_drink'] as const)[Math.max(0, s.config.players.findIndex((x) => x.id === player)) % 3] as 'beer';
  const focus = (a: Action): Action => {
    if (a.type === 'work.placeCampaign') return { ...a, goods: [fav] };
    if (a.type === 'work.buyDrinks' && a.route.mode === 'errand') return { ...a, route: { mode: 'errand', drink: fav } };
    return a;
  };
  for (let tries = 0; tries < 6 && groups.length; tries++) {
    const g = pick(rng, groups);
    const la = pick(rng, pool.filter((l) => cardOf(l) === g));
    if (la.kind === 'ready') return focus(la.action);
    if (la.kind === 'placement') {
      const opts = legalPlacements(s, player, la.spec);
      if (!opts.length) {
        if (la.cardUid) return { type: 'work.skip', playerId: player, cardUid: la.cardUid };
        continue;
      }
      const a = fromPlacement(player, la, pick(rng, opts), rng, s);
      if (a) return focus(a);
    }
  }
  return { type: 'work.endTurn', playerId: player };
}

/** Choose one action for `player` (who must be awaited). */
export function botAction(s: GameState, player: PlayerId, rng: RngState): Action {
  const legal = legalActions(s, player);
  const head = s.pending[0];
  if (head?.kind === 'forcedFire' && head.player === player) {
    const content = contentFor(s.config.modules);
    const p = s.players[player];
    const sal = salariedCards(s, content, player);
    const nonBusy = sal.filter((u) => !p?.busy[u]);
    return { type: 'payday.fire', playerId: player, uids: [(nonBusy[0] ?? sal[0]) as Uid] };
  }
  const ph = s.phase.kind;
  // Module pending choices (Ketchup) are resolved through legal actions in any phase.
  const moduleChoice = Boolean(head && head.player === player && head.kind !== 'forcedFire');
  if (moduleChoice) {
    // fall through to the generic picker below
  } else if (ph === 'restructuring') {
    const retract = legal.find((l) => l.kind === 'ready');
    if (retract && retract.kind === 'ready' && !s.awaiting.players.includes(player)) return retract.action;
    return { type: 'restructure.submit', playerId: player, structure: botStructure(s, player) };
  }
  if (!moduleChoice && ph === 'cleanup') return { type: 'cleanup.freezer', playerId: player, keep: {} };
  if (!moduleChoice && ph === 'payday') return { type: 'payday.confirm', playerId: player };

  // Working: try real actions in random order; fall back to skipping cards, then end turn.
  const candidates = legal.filter((l) => !(l.kind === 'ready' && (l.action.type === 'work.skip' || l.action.type === 'work.endTurn')) && l.kind !== 'compose');
  // Hiring preference so games develop (otherwise random).
  for (let tries = 0; tries < 6 && candidates.length; tries++) {
    const la = pick(rng, candidates);
    if (la.kind === 'ready') return la.action;
    if (la.kind === 'placement') {
      const opts = legalPlacements(s, player, la.spec);
      if (!opts.length) {
        if (la.cardUid && s.phase.kind === 'working') return { type: 'work.skip', playerId: player, cardUid: la.cardUid };
        continue;
      }
      const a = fromPlacement(player, la, pick(rng, opts), rng, s);
      if (a) return a;
    }
  }
  const pass = legal.find((l) => l.kind === 'ready' && l.action.type === 'setup.pass');
  if (pass && pass.kind === 'ready') return pass.action;
  const end = legal.find((l) => l.kind === 'ready' && l.action.type === 'work.endTurn');
  if (end && end.kind === 'ready') return end.action;
  const any = legal.find((l) => l.kind === 'ready');
  if (any && any.kind === 'ready') return any.action;
  throw new Error(`bot: no action for ${player} in ${ph}`);
}

export interface PlayResult {
  state: GameState;
  actions: Action[];
  events: GameEvent[][];
  steps: number;
}

/** Play until `stop(state)` or game over. Throws on any rejection. */
export function play(
  state0: GameState,
  botSeed: number,
  stop: (s: GameState) => boolean,
  maxSteps = 20_000,
  onStep?: (s: GameState, a: Action) => void,
  chooser: BotChooser = botAction,
): PlayResult {
  const rng = createRng(botSeed);
  let state = state0;
  const actions: Action[] = [];
  const events: GameEvent[][] = [];
  let steps = 0;
  while (state.phase.kind !== 'gameOver' && !stop(state) && steps < maxSteps) {
    const who = state.awaiting.players[0];
    if (!who) throw new Error(`nobody awaited in ${state.phase.kind}`);
    const action = chooser(state, who, rng);
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`step ${steps}: ${action.type} by ${who} rejected: ${r.code} ${r.message}\n${JSON.stringify(action)}`);
    state = r.state;
    actions.push(action);
    events.push(r.events);
    onStep?.(state, action);
    steps++;
  }
  return { state, actions, events, steps };
}
