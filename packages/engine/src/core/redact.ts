/**
 * Per-viewer redaction (architecture §3.5; base.md §4.8).
 *
 * Hidden information in the base game: the RNG state and seed, each player's reserve card choice
 * (until the first bank break, or for owners of "First to have $20"), and Restructuring drafts
 * until all are revealed. Everything else (cards, cash, stock) is open. The order of the leftover
 * map tile pool is hidden (views get it sorted). Module `redact` hooks may hide more.
 */
import type { GameEvent } from '../types/events.js';
import type { GameState, PlayerId, ReserveCard } from '../types/state.js';
import type { GameView, Viewer } from '../types/view.js';
import { contentFor, redactHooks } from '../modules/registry.js';
import { clone } from './clone.js';
import { hasEffect } from './cards.js';

function submittedMap(s: GameState): Record<PlayerId, boolean> {
  const out: Record<PlayerId, boolean> = {};
  for (const id of s.turnOrder) {
    let done = false;
    switch (s.phase.kind) {
      case 'setup.reserve':
        done = Boolean(s.secrets[id]?.reserve);
        break;
      case 'restructuring':
        done = Boolean(s.secrets[id]?.structureDraft);
        break;
      case 'payday':
        done = (s.phase.decided ?? []).includes(id);
        break;
      case 'cleanup':
        done = !(s.awaiting.kind === 'cleanup.freezer' && s.awaiting.players.includes(id));
        break;
      default:
        done = !s.awaiting.players.includes(id);
    }
    out[id] = done;
  }
  return out;
}

export function redactFor(state: GameState, viewer: Viewer): GameView {
  const s = clone(state);
  const content = contentFor(s.config.modules);
  const isPlayer = viewer !== 'spectator' && Boolean(s.players[viewer]);
  const visibleReserves: Partial<Record<PlayerId, ReserveCard>> = {};
  const peek = isPlayer && hasEffect(s, content, viewer, 'peekReserves').length > 0;
  for (const id of s.turnOrder) {
    const p = s.players[id];
    if (p?.reserveCard) visibleReserves[id] = p.reserveCard;
    else if ((id === viewer || peek) && s.secrets[id]?.reserve) visibleReserves[id] = s.secrets[id]?.reserve as ReserveCard;
  }
  const { rng: _rng, seed: _seed, secrets, ...rest } = s;
  const view: GameView = {
    ...rest,
    tilePool: [...rest.tilePool].sort(),
    viewer,
    mine: isPlayer ? (secrets[viewer] ?? null) : null,
    submitted: submittedMap(state),
    visibleReserves,
  };
  return redactHooks(s.config.modules, view, { state, viewer });
}

/** Strip secret payloads from events for one viewer (reserve choices, structure drafts). */
export function redactEvents(events: GameEvent[], viewer: Viewer): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'reserveChosen' && e.player !== viewer) {
      const { card: _c, ...rest } = e;
      return rest;
    }
    if (e.type === 'structureSubmitted' && e.player !== viewer) {
      const { structure: _st, ...rest } = e;
      return rest;
    }
    return clone(e);
  });
}
