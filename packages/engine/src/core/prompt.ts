/**
 * `derivePrompt(view, me)`: what the UI should ask this viewer now (architecture §3.1). Derived
 * from the redacted view only, so hot-seat and online play show the same guidance.
 */
import type { GameState, PlayerId } from '../types/state.js';
import type { GameView, Prompt } from '../types/view.js';
import { contentFor, pipe } from '../modules/registry.js';
import { readCtx } from './context.js';
import { reserveOptions, STANDARD_RESERVES } from '../rules/setup.js';
import { salaryAfterFiring } from '../rules/payday.js';
import { freezerCapacity } from '../rules/cleanup.js';
import { ceoSlotsFor } from './cards.js';

const PHASE_TITLES: Record<string, string> = {
  'setup.restaurants': 'Placing first restaurants',
  'setup.reserve': 'Choosing reserve cards',
  restructuring: 'Restructuring',
  orderOfBusiness: 'Order of business',
  working: 'Working 9–5',
  dinnertime: 'Dinnertime',
  payday: 'Payday',
  marketing: 'Marketing',
  cleanup: 'Cleanup',
};

export function derivePrompt(view: GameView, me: PlayerId | null): Prompt {
  const ph = view.phase;
  if (ph.kind === 'gameOver') return { kind: 'gameOver', title: 'Game over', ranking: [...ph.ranking] };
  const waitingFor = [...view.awaiting.players];
  const title = PHASE_TITLES[ph.kind] ?? ph.kind;
  if (!me || !view.players[me]) return { kind: 'spectating', title, waitingFor };
  const asState = view as unknown as GameState;
  const head = view.pending[0];
  if (head) {
    if (head.player === me) return { kind: 'choice', title: 'Decision needed', choice: head };
    return { kind: 'waiting', title, waitingFor };
  }
  const mine = waitingFor.includes(me);
  switch (ph.kind) {
    case 'setup.restaurants':
      if (mine) return { kind: 'placeFirstRestaurant', title: ph.round === 1 ? 'Place a restaurant or pass' : 'Place your first restaurant', canPass: ph.round === 1 };
      break;
    case 'setup.reserve':
      // Module hooks may replace the cards (ketchup:reservePrices); they read config and public state only.
      if (mine) return { kind: 'chooseReserve', title: 'Choose your reserve card (secret)', options: viewReserveOptions(asState) };
      break;
    case 'restructuring': {
      const content = contentFor(view.config.modules);
      const submitted = Boolean(view.mine?.structureDraft);
      if (mine || submitted) return { kind: 'restructure', title: submitted ? 'Waiting for the reveal' : 'Choose who goes to work', ceoSlots: ceoSlotsFor(asState, content, me), submitted };
      break;
    }
    case 'orderOfBusiness':
      if (mine) {
        const taken = new Set(Object.values(ph.picks));
        const free = ph.queue.map((_, i) => i).filter((i) => !taken.has(i));
        return { kind: 'chooseOrder', title: 'Choose your place in turn order', freePositions: free };
      }
      break;
    case 'working':
      if (mine && view.turn) {
        const cards = Object.entries(view.turn.uses).filter(([, n]) => n > 0).map(([uid]) => uid);
        return { kind: 'work', title: `Your turn: ${view.turn.stage}`, stage: view.turn.stage, cards };
      }
      break;
    case 'payday':
      if (mine) {
        const bd = salaryAfterFiring(asState, contentFor(view.config.modules), me, view.mine?.fireDraft ?? []);
        // DLX p29: short of cash with salaried cards left → firing will be required (unless a
        // module waives it, e.g. Ketchup First trainer used).
        const forced = view.config.modules.length ? pipe(readCtx(asState), 'forcedFiring', true, { player: me }) : true;
        const mustFire = bd.total > (view.players[me]?.cash ?? 0) && bd.salaried > 0 && forced;
        return { kind: 'payday', title: 'Fire employees, then confirm', owed: bd.total, mustFire };
      }
      break;
    case 'cleanup':
      if (mine) return { kind: 'freezer', title: 'Choose what to keep in the freezer', capacity: freezerCapacity(asState, me) };
      break;
    default:
      break;
  }
  return { kind: 'waiting', title, waitingFor };
}

function viewReserveOptions(s: GameState) {
  try {
    return reserveOptions(s);
  } catch {
    return [...STANDARD_RESERVES];
  }
}
