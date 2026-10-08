/**
 * Rebuild `GameState`s from a redacted `GameView`, so the state-based engine API (legalActions,
 * legalPlacements, previews, applyAction) can run on what a seat may know.
 *
 * Hidden in a view (engine core/redact.ts): the rng and seed, other players' reserve cards (until
 * revealed), Restructuring drafts (until the reveal), Payday firings (until everyone has decided)
 * and the order of the leftover map tiles.
 * Nothing hidden changes which actions are legal for the viewer, so `viewState` is enough for
 * choosing legal moves. Search bots that simulate past hidden information use `sampleState`.
 */
import type { GameState, GameView, PlayerId, RngState, Structure } from '@fcm/engine';
import { legacyRules, nextUint32, pick, reserveOptions, shuffle } from '@fcm/engine';
import { simpleStructure } from './heuristics.js';

/**
 * Deterministic pseudo-state: the viewer's own secrets, revealed reserves, blanks for the rest
 * (`rng` fixed, other drafts null). Use it for legality and previews, not for simulating reveals.
 */
export function viewState(view: GameView): GameState {
  const { viewer, mine, submitted: _s, visibleReserves, ...rest } = view;
  const secrets: GameState['secrets'] = {};
  for (const id of view.turnOrder) secrets[id] = { reserve: visibleReserves[id] ?? null, structureDraft: null };
  if (viewer !== 'spectator' && mine) secrets[viewer] = mine;
  return { ...rest, seed: 0, rng: [1, 2, 3, 4], secrets } as GameState;
}

/**
 * Determinization hook for search bots: one plausible full state consistent with the view.
 * - rng / seed: fresh random values (future randomness is unknown).
 * - other players' hidden reserve cards: uniform over the reserve options in play.
 * - other players' submitted but unrevealed structures: a plausible structure built from their
 *   (open) hand, so applying the last submission reveals something sensible.
 * - other players' unrevealed Payday firings: none (keeping everyone is always legal).
 * - leftover map tiles: shuffled.
 * Call it once per sample; average decisions over samples (e.g. ISMCTS / PIMC).
 */
export function sampleState(view: GameView, rng: RngState): GameState {
  const s = viewState(view);
  s.rng = [nextUint32(rng) || 1, nextUint32(rng), nextUint32(rng), nextUint32(rng)];
  s.seed = nextUint32(rng);
  s.tilePool = shuffle(rng, [...s.tilePool]);
  const me = view.viewer;
  const options = reserveOptions(s);
  for (const id of view.turnOrder) {
    if (id === me) continue;
    const sec = s.secrets[id] as { reserve: GameState['secrets'][PlayerId]['reserve']; structureDraft: Structure | null };
    const p = s.players[id];
    // Reserves come before first restaurants, except in version-1 games (restaurants first).
    const hasChosen = view.phase.kind === 'setup.reserve' ? view.submitted[id] : !(view.phase.kind === 'setup.restaurants' && legacyRules(view));
    if (!sec.reserve && !p?.reserveCard && hasChosen && options.length && !view.config.intro) sec.reserve = pick(rng, options);
    if (view.phase.kind === 'restructuring' && view.submitted[id] && p) {
      const sub = simpleStructure(s, id);
      sec.structureDraft = { ceo: p.structure.ceo, ceoSubs: sub.ceoSubs, managerSubs: sub.managerSubs };
    }
  }
  return s;
}
