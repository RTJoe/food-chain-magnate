/**
 * Phase state machine (architecture §3.4; base.md §2–§10).
 *
 * `runUntilInput(ctx)` advances the game until some player must act (or the game is over) and
 * sets `state.awaiting`. Automatic phases (Dinnertime, Marketing, the salary step of Payday,
 * Clean up without freezer decisions) run inside it, emitting their fine-grained events.
 *
 * Round flow: setup.restaurants → setup.reserve (not in the intro game) → [restructuring →
 * orderOfBusiness → working → dinnertime → payday → marketing → cleanup] × rounds. The game
 * only ends in Dinnertime (base.md §3, §12) or when every chain is bankrupt (Clean up).
 *
 * Entry work happens in `enter(...)`; the loop only checks whether the current phase is complete.
 */
import type { Phase, PhaseKind, PlayerId } from '../types/state.js';
import type { EngineCtx } from './context.js';
import { lifecycle } from '../modules/registry.js';
import { activePlayers } from './cards.js';
import { normalizeSetup, reserveDone } from '../rules/setup.js';
import { allSubmitted, autoSubmit, awaitingRestructure, revealStructures } from '../rules/restructuring.js';
import { choosingQueue, currentChooser, finishOrder, normalizeOrder } from '../rules/orderOfBusiness.js';
import { beginTurn } from '../rules/working/stages.js';
import { runDinnertime } from '../rules/dinnertime.js';
import { enterPayday, isPaydayComplete } from '../rules/payday.js';
import { runMarketing } from '../rules/marketing.js';
import { isCleanupComplete, runCleanup } from '../rules/cleanup.js';

/** Replace the phase, running module exit/enter hooks and emitting `phaseChanged`. */
export function setPhase(ctx: EngineCtx, next: Phase): void {
  const s = ctx.state;
  const from: PhaseKind | null = s.phase ? s.phase.kind : null;
  if (s.phase) lifecycle(ctx, 'onPhaseExit', s.phase);
  s.phase = next;
  ctx.emit({ type: 'phaseChanged', from, to: structuredPhase(next) });
  lifecycle(ctx, 'onPhaseEnter', s.phase);
}

const structuredPhase = (p: Phase): Phase => JSON.parse(JSON.stringify(p)) as Phase;

/** Start a new round with Restructuring (base.md §3–4). */
export function startRound(ctx: EngineCtx): void {
  const s = ctx.state;
  s.round += 1;
  s.turn = null;
  ctx.emit({ type: 'roundStarted', round: s.round });
  setPhase(ctx, { kind: 'restructuring' });
}

function enterOrderOfBusiness(ctx: EngineCtx): void {
  setPhase(ctx, { kind: 'orderOfBusiness', queue: choosingQueue(ctx), picks: {} });
}

function enterWorking(ctx: EngineCtx): void {
  const s = ctx.state;
  s.turn = null;
  setPhase(ctx, { kind: 'working', player: s.turnOrder[0] ?? '', idx: 0 });
}

function enterDinnertime(ctx: EngineCtx): void {
  ctx.state.turn = null;
  setPhase(ctx, { kind: 'dinnertime', houses: [], idx: 0 });
  runDinnertime(ctx);
}

function enterPaydayPhase(ctx: EngineCtx): void {
  const s = ctx.state;
  setPhase(ctx, { kind: 'payday', queue: activePlayers(s), idx: 0, decided: [] });
  enterPayday(ctx);
}

function enterMarketing(ctx: EngineCtx): void {
  setPhase(ctx, { kind: 'marketing', pass: 1, passes: 1, order: [], idx: 0 });
  runMarketing(ctx);
}

function enterCleanup(ctx: EngineCtx): void {
  setPhase(ctx, { kind: 'cleanup' });
  runCleanup(ctx);
}

/**
 * Hold point between an automatic phase and the next phase's automatic work (module `afterPhase`
 * hook; only the tutorial module uses it). True when a module queued a pending choice, which the
 * loop then waits on. Without such a module this is a no-op.
 */
function held(ctx: EngineCtx, finished: PhaseKind): boolean {
  if (!ctx.state.config.modules.length) return false;
  lifecycle(ctx, 'afterPhase', finished);
  return ctx.state.pending.length > 0;
}

const wait = (ctx: EngineCtx, kind: GameStateAwaitKind, players: PlayerId[]): void => {
  ctx.state.awaiting = { kind, players: [...players] };
};
type GameStateAwaitKind = EngineCtx['state']['awaiting']['kind'];

/**
 * Advance until input is needed. Safe to call repeatedly: it never re-runs a completed phase.
 */
export function runUntilInput(ctx: EngineCtx): void {
  const s = ctx.state;
  for (let guard = 0; guard < 10_000; guard++) {
    const ph = s.phase;
    if (ph.kind === 'gameOver') return wait(ctx, 'none', []);
    const head = s.pending[0];
    if (head) return wait(ctx, 'choice', [head.player]);

    switch (ph.kind) {
      case 'setup.restaurants': {
        if (normalizeSetup(ctx) === 'await') {
          const cur = s.phase.kind === 'setup.restaurants' ? s.phase.order[s.phase.idx] : undefined;
          return wait(ctx, 'setup.restaurant', cur ? [cur] : []);
        }
        // base.md §2.7: reserve cards are not used in the intro game (§13).
        if (s.config.intro) startRound(ctx);
        else setPhase(ctx, { kind: 'setup.reserve' });
        continue;
      }
      case 'setup.reserve': {
        if (reserveDone(s)) {
          startRound(ctx);
          continue;
        }
        return wait(ctx, 'setup.reserve', s.turnOrder.filter((id) => !s.players[id]?.bankrupt && !s.secrets[id]?.reserve));
      }
      case 'restructuring': {
        autoSubmit(ctx);
        if (allSubmitted(s)) {
          revealStructures(ctx);
          enterOrderOfBusiness(ctx);
          held(ctx, 'restructuring');
          continue;
        }
        return wait(ctx, 'restructure', awaitingRestructure(s));
      }
      case 'orderOfBusiness': {
        if (normalizeOrder(ctx)) {
          finishOrder(ctx);
          enterWorking(ctx);
          held(ctx, 'orderOfBusiness');
          continue;
        }
        const who = currentChooser(s);
        return wait(ctx, 'order', who ? [who] : []);
      }
      case 'working': {
        if (!s.turn) {
          let idx = ph.idx;
          while (idx < s.turnOrder.length && (s.players[s.turnOrder[idx] as PlayerId]?.bankrupt ?? true)) idx++;
          if (idx >= s.turnOrder.length) {
            if (held(ctx, 'working')) continue;
            enterDinnertime(ctx);
            continue;
          }
          ph.idx = idx;
          ph.player = s.turnOrder[idx] as PlayerId;
          beginTurn(ctx, ph.player);
          continue;
        }
        return wait(ctx, 'work', [s.turn.player]);
      }
      case 'dinnertime': {
        // A state that entered Dinnertime without running it (fixtures) runs it now.
        if (ph.idx < ph.houses.length) {
          runDinnertime(ctx);
          continue;
        }
        if (held(ctx, 'dinnertime')) continue;
        enterPaydayPhase(ctx);
        continue;
      }
      case 'payday': {
        if (isPaydayComplete(s)) {
          if (held(ctx, 'payday')) continue;
          enterMarketing(ctx);
          continue;
        }
        if (s.awaiting.kind === 'none' || s.awaiting.players.length === 0) {
          // Defensive: payday code always sets awaiting while incomplete.
          const decided = ph.decided ?? [];
          return wait(ctx, 'payday.fire', ph.queue.filter((id) => !decided.includes(id)));
        }
        return;
      }
      case 'marketing': {
        if (ph.idx < ph.order.length) {
          runMarketing(ctx);
          continue;
        }
        if (held(ctx, 'marketing')) continue;
        enterCleanup(ctx);
        continue;
      }
      case 'cleanup': {
        if (!isCleanupComplete(s) && s.awaiting.kind === 'cleanup.freezer') return;
        if (held(ctx, 'cleanup')) continue;
        startRound(ctx);
        continue;
      }
    }
  }
  throw new Error('runUntilInput: no progress after 10000 steps');
}
