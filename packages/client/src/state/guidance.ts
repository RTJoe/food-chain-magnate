/**
 * Prompt, legal actions and legal placements for the viewer.
 *
 * Order of preference:
 * 1. the toy engine, when the game is a toy game (its rules differ from Food Chain Magnate);
 * 2. the real engine (`derivePrompt` is view-based; `legalActions`/`legalPlacements` run on a
 *    pseudo-state rebuilt from the view);
 * 3. a view-based fallback in this file, so fixtures and partial engines still drive the UI.
 */
import { engine as realEngine } from '@fcm/engine';
import { toyEngine } from '@fcm/engine/testing';
import type {
  Action,
  DrinkId,
  EmployeeId,
  GameView,
  LegalAction,
  ModuleManifest,
  PendingChoice,
  Placement,
  PlacementKind,
  PlacementSpec,
  PlayerId,
  Prompt,
  ReserveCard,
  Uid,
} from '@fcm/engine';
import type { Catalog } from './catalog.js';
import { employeeName } from './catalog.js';
import { isToyManifest, pseudoState } from './engine.js';
import { cardStage, cardsAtWork, fireable, freeOrderPositions, phaseLabel, workStages } from './selectors.js';

const STANDARD_RESERVES: ReserveCard[] = [
  { kind: 'standard', amount: 100, ceoSlots: 2 },
  { kind: 'standard', amount: 200, ceoSlots: 3 },
  { kind: 'standard', amount: 300, ceoSlots: 4 },
];

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function promptFor(view: GameView, me: PlayerId | null, manifest: readonly ModuleManifest[]): Prompt {
  if (isToyManifest(manifest)) return toyEngine.derivePrompt(view, me);
  return attempt(() => realEngine.derivePrompt(view, me)) ?? fallbackPrompt(view, me);
}

const nameOf = (view: GameView, id: PlayerId) => view.players[id]?.name ?? id;

export function fallbackPrompt(view: GameView, me: PlayerId | null): Prompt {
  const phase = view.phase;
  const waitingFor = view.awaiting.players;
  if (phase.kind === 'gameOver') return { kind: 'gameOver', title: 'Game over', ranking: phase.ranking };
  if (me === null) return { kind: 'spectating', title: `Spectating · ${phaseLabel(phase)}`, waitingFor };
  const head: PendingChoice | undefined = view.pending[0];
  if (head) {
    if (head.player === me) return { kind: 'choice', title: choiceTitle(head), choice: head };
    return { kind: 'waiting', title: `Waiting for ${nameOf(view, head.player)}`, waitingFor: [head.player] };
  }
  // Restructuring: a submitted player is no longer awaited but may still retract.
  if (phase.kind === 'restructuring' && (view.submitted[me] || view.mine?.structureDraft)) {
    return { kind: 'restructure', title: 'Structure submitted', ceoSlots: view.ceoSlots, submitted: true };
  }
  if (!waitingFor.includes(me)) {
    const names = waitingFor.map((id) => nameOf(view, id));
    const title = names.length ? `Waiting for ${names.join(', ')}` : phaseLabel(phase);
    return { kind: 'waiting', title, waitingFor };
  }
  switch (phase.kind) {
    case 'setup.restaurants':
      return { kind: 'placeFirstRestaurant', title: 'Place your first restaurant', canPass: phase.round === 1 };
    case 'setup.reserve':
      return { kind: 'chooseReserve', title: 'Choose your reserve card', options: STANDARD_RESERVES };
    case 'restructuring':
      return { kind: 'restructure', title: 'Build your company structure', ceoSlots: view.ceoSlots, submitted: false };
    case 'orderOfBusiness':
      return { kind: 'chooseOrder', title: 'Choose your place in turn order', freePositions: freeOrderPositions(view) };
    case 'working': {
      const p = view.players[me];
      const cards = p && view.turn ? cardsAtWork(p).filter((u) => (view.turn?.uses[u] ?? 0) > 0) : [];
      return { kind: 'work', title: 'Your turn: put your staff to work', stage: view.turn?.stage ?? 'recruit', cards };
    }
    case 'payday':
      return { kind: 'payday', title: 'Payday: fire staff, then pay salaries', owed: 0, mustFire: false };
    case 'cleanup':
      return { kind: 'freezer', title: 'Clean up: choose goods to freeze', capacity: 10 };
    default:
      return { kind: 'waiting', title: phaseLabel(phase), waitingFor };
  }
}

export function choiceTitle(c: PendingChoice): string {
  switch (c.kind) {
    case 'forcedFire':
      return `You cannot pay $${c.owed}: fire salaried staff`;
    case 'payWithTokens':
      return 'Pay part of your salaries with goods?';
    case 'pizzaRadio':
      return 'Place a pizza radio';
    case 'freeMailbox':
      return 'Place your free mailbox';
    case 'secondCampaign':
      return 'Place a second campaign tile?';
    case 'extraMapTile':
      return 'Place an extra map tile';
    case 'freeway':
      return 'Place a freeway?';
    case 'coffeeShop':
      return 'Place a coffee shop';
  }
}

/** Placement kind that resolves a pending choice, if it needs a board pick. */
export function choicePlacementKind(c: PendingChoice): PlacementKind | null {
  switch (c.kind) {
    case 'pizzaRadio':
      return 'pizzaRadio';
    case 'freeMailbox':
      return 'freeMailbox';
    case 'secondCampaign':
      return 'campaign';
    case 'extraMapTile':
      return 'mapTile';
    case 'freeway':
      return 'freeway';
    case 'coffeeShop':
      return 'coffeeShop';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export function legalFor(view: GameView, me: PlayerId | null, manifest: readonly ModuleManifest[], c: Catalog): LegalAction[] {
  if (!me || view.viewer === 'spectator') return [];
  const state = pseudoState(view, me);
  if (isToyManifest(manifest)) return attempt(() => toyEngine.legalActions(state, me)) ?? [];
  return attempt(() => realEngine.legalActions(state, me)) ?? fallbackLegal(view, me, c);
}

/** View-based approximation of the engine's legal actions (the engine stays authoritative). */
export function fallbackLegal(view: GameView, me: PlayerId, c: Catalog): LegalAction[] {
  const p = view.players[me];
  if (!p || view.phase.kind === 'gameOver') return [];
  const out: LegalAction[] = [];
  const ready = (label: string, action: Action) => out.push({ kind: 'ready', label, action });
  const head = view.pending[0];
  if (head) {
    if (head.player !== me) return [];
    const kind = choicePlacementKind(head);
    if (kind) out.push({ kind: 'placement', label: choiceTitle(head), actionType: choiceActionType(head), spec: { kind, choiceId: head.id } });
    if (head.kind === 'forcedFire') out.push({ kind: 'compose', label: 'Fire employees', actionType: 'payday.fire' });
    if (head.optional) ready('Decline', { type: 'choice.decline', playerId: me, choiceId: head.id });
    return out;
  }
  const awaited = view.awaiting.players.includes(me);
  switch (view.phase.kind) {
    case 'setup.restaurants':
      if (!awaited) return [];
      out.push({ kind: 'placement', label: 'Place restaurant', actionType: 'setup.placeRestaurant', spec: { kind: 'restaurant' } });
      if (view.phase.round === 1) ready('Pass', { type: 'setup.pass', playerId: me });
      return out;
    case 'setup.reserve':
      if (!awaited) return [];
      for (const card of STANDARD_RESERVES) ready(`Reserve $${card.amount}`, { type: 'setup.chooseReserve', playerId: me, card });
      return out;
    case 'restructuring':
      if (view.submitted[me] || view.mine?.structureDraft) ready('Retract', { type: 'restructure.retract', playerId: me });
      else out.push({ kind: 'compose', label: 'Submit structure', actionType: 'restructure.submit' });
      return out;
    case 'orderOfBusiness':
      if (!awaited) return [];
      for (const pos of freeOrderPositions(view)) ready(`Position ${pos + 1}`, { type: 'order.choosePosition', playerId: me, position: pos });
      return out;
    case 'working': {
      if (!awaited || !view.turn) return [];
      const stages = workStages(view);
      const now = stages.indexOf(view.turn.stage);
      for (const uid of cardsAtWork(p)) {
        if ((view.turn.uses[uid] ?? 0) <= 0) continue;
        const id = p.employees[uid]?.employeeId;
        const d = id ? c.employees[id] : undefined;
        const stage = cardStage(d);
        if (!d || !stage || stages.indexOf(stage) < now) continue;
        out.push(...cardActions(view, me, uid, d.id, c));
        ready(`Skip ${d.name}`, { type: 'work.skip', playerId: me, cardUid: uid });
      }
      ready('End turn', { type: 'work.endTurn', playerId: me });
      return out;
    }
    case 'payday':
      if (!awaited) return [];
      if (fireable(p).length) out.push({ kind: 'compose', label: 'Fire employees', actionType: 'payday.fire' });
      out.push({ kind: 'compose', label: 'Pay salaries', actionType: 'payday.confirm' });
      return out;
    case 'cleanup':
      if (!awaited) return [];
      out.push({ kind: 'compose', label: 'Freeze goods', actionType: 'cleanup.freezer' });
      return out;
    default:
      return out;
  }
}

function choiceActionType(c: PendingChoice): Action['type'] {
  switch (c.kind) {
    case 'pizzaRadio':
      return 'ketchup:newMilestones.placePizzaRadio';
    case 'freeMailbox':
      return 'ketchup:newMilestones.placeFreeMailbox';
    case 'secondCampaign':
      return 'ketchup:newMilestones.placeSecondCampaign';
    case 'extraMapTile':
      return 'ketchup:lobbyists.placeMapTile';
    case 'freeway':
      return 'ketchup:ruralMarketeers.placeFreeway';
    case 'coffeeShop':
      return 'ketchup:coffee.placeShop';
    case 'forcedFire':
      return 'payday.fire';
    case 'payWithTokens':
      return 'payday.confirm';
  }
}

function cardActions(view: GameView, me: PlayerId, cardUid: Uid, id: EmployeeId, c: Catalog): LegalAction[] {
  const d = c.employees[id];
  if (!d) return [];
  const a = d.ability;
  const name = employeeName(c, id);
  switch (a.kind) {
    case 'ceo':
    case 'recruit':
      return [{ kind: 'compose', label: `Hire with ${name}`, actionType: 'work.recruit', cardUid }];
    case 'train':
      return [{ kind: 'compose', label: `Train with ${name}`, actionType: 'work.train', cardUid }];
    case 'produce':
      if (a.foods.length > 1) return [{ kind: 'compose', label: `Cook with ${name}`, actionType: 'work.produce', cardUid }];
      return [{ kind: 'ready', label: `Make ${a.amount} ${a.foods[0] ?? ''}`, action: { type: 'work.produce', playerId: me, cardUid } }];
    case 'buyDrinks':
      return [{ kind: 'placement', label: a.mode === 'errand' ? 'Fetch a drink' : 'Plan a drinks route', actionType: 'work.buyDrinks', cardUid, spec: { kind: 'buyerRoute', cardUid } }];
    case 'marketing':
      return a.campaigns.map((k) => ({
        kind: 'placement' as const,
        label: `Launch ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
        actionType: 'work.placeCampaign' as const,
        cardUid,
        spec: { kind: 'campaign' as const, cardUid, campaignKind: k },
      }));
    case 'newBusiness':
      return [
        { kind: 'placement', label: 'Build a house', actionType: 'work.placeHouse', cardUid, spec: { kind: 'house', cardUid } },
        { kind: 'placement', label: 'Add a garden', actionType: 'work.placeGarden', cardUid, spec: { kind: 'garden', cardUid } },
      ];
    case 'restaurant': {
      const out: LegalAction[] = [];
      if ((view.players[me]?.restaurantsRemaining ?? 0) > 0) {
        out.push({ kind: 'placement', label: 'Open a restaurant', actionType: 'work.placeRestaurant', cardUid, spec: { kind: 'restaurant', cardUid } });
      }
      if (a.mode === 'regional') {
        out.push({ kind: 'placement', label: 'Move a restaurant', actionType: 'work.moveRestaurant', cardUid, spec: { kind: 'moveRestaurant', cardUid } });
      }
      return out;
    }
    case 'lobbyist':
      return [
        { kind: 'placement', label: 'Build a road', actionType: 'ketchup:lobbyists.placeRoad', cardUid, spec: { kind: 'lobbyistRoad', cardUid } },
        { kind: 'placement', label: 'Lay out a park', actionType: 'ketchup:lobbyists.placePark', cardUid, spec: { kind: 'park', cardUid } },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

export function placementsFor(view: GameView, me: PlayerId | null, spec: PlacementSpec, manifest: readonly ModuleManifest[], c: Catalog): Placement[] {
  if (!me) return [];
  const state = pseudoState(view, me);
  if (isToyManifest(manifest)) return [];
  return attempt(() => realEngine.legalPlacements(state, me, spec)) ?? fallbackPlacements(view, me, spec, c);
}

/** Only the board-free placements can be derived without the rules engine. */
export function fallbackPlacements(view: GameView, me: PlayerId, spec: PlacementSpec, c: Catalog): Placement[] {
  const cardId = spec.cardUid ? view.players[me]?.employees[spec.cardUid]?.employeeId : undefined;
  const ability = cardId ? c.employees[cardId]?.ability : undefined;
  if (spec.kind === 'buyerRoute' && ability?.kind === 'buyDrinks' && ability.mode === 'errand') {
    const drinks: DrinkId[] = ['beer', 'lemonade', 'soft_drink'];
    return drinks.map((drink) => ({ kind: 'buyerRoute', route: { mode: 'errand', drink }, collects: [] }));
  }
  if (spec.kind === 'campaign' && spec.campaignKind === 'gourmetGuide') {
    const n = view.marketingTiles[0] ?? 0;
    return [{ kind: 'campaign', campaignKind: 'gourmetGuide', tileNumber: n, placement: { kind: 'offBoard' } }];
  }
  return [];
}
