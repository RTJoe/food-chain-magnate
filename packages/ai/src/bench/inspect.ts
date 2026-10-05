/**
 * Replay / inspect a traced game (docs/ai-strategy.md §8.3).
 *
 *   npm run ai:inspect -- <trace.jsonl>                         list decisions (filters below)
 *   npm run ai:inspect -- <trace.jsonl> --step 120 [--rerun]    rebuild the state before decision 120
 *
 * The state is rebuilt from the game header (config, seed) by applying the traced actions, so it
 * is exact. `--rerun` asks the bot again at that decision with the same decision seed (optionally
 * another `--level` or a bigger `--budget`) and says whether it reproduces the traced action.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Action, GameState } from '@fcm/engine';
import { applyAction, createGame, engine, redactFor } from '@fcm/engine';
import { renderAscii } from '@fcm/engine/testing';
import { createBot } from '../registry.js';
import { botInput, decisionSeed } from '../run.js';
import { isBotLevel, type BotExplanation } from '../types.js';
import { viewState } from '../viewState.js';
import { bool, num, parseArgs, str } from './args.js';
import { phaseKey, summarizeAction, type TraceDecision, type TraceHeader, type TraceLine } from './game.js';

export const USAGE = `Usage: npm run ai:inspect -- <trace.jsonl> [options]
  (no --step)          list decisions; filter with --round <n> --player <pN> --phase <prefix> --fellback
  --step <n>           rebuild the state before decision n (0-based step) and show it
  --board              with --step: print the board as ASCII
  --rerun              with --step: ask the bot again (same decision seed) and compare
  --level <level>      with --rerun: use another bot level
  --budget <ms>        with --rerun: thinking budget (default: the traced budget)
  --dump <file>        with --step: write { state, view, decision } as JSON`;

export interface Trace {
  header: TraceHeader;
  decisions: TraceDecision[];
}

export function loadTrace(path: string): Trace {
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TraceLine);
  const header = lines.find((l): l is TraceHeader => l.kind === 'game');
  if (!header) throw new Error(`${path}: no game header line`);
  return { header, decisions: lines.filter((l): l is TraceDecision => l.kind === 'decision') };
}

/** The state right before decision `step`, rebuilt by applying the traced actions. */
export function stateAt(trace: Trace, step: number): GameState {
  let state = createGame(trace.header.config, trace.header.seed);
  for (const d of trace.decisions.slice(0, step)) {
    const r = applyAction(state, d.action);
    if (!r.ok) throw new Error(`replay diverged at step ${d.step}: ${d.action.type} ${r.code} ${r.message}`);
    state = r.state;
  }
  return state;
}

const sameAction = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

function printExplain(e: Omit<BotExplanation, 'action'> | undefined, indent = '  '): void {
  if (!e) return;
  const { top, evalTerms, ...rest } = e;
  const scalars = Object.entries(rest).filter(([, v]) => v !== undefined);
  if (scalars.length) console.log(`${indent}${scalars.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('  ')}`);
  if (evalTerms) console.log(`${indent}terms: ${Object.entries(evalTerms).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const t of top ?? []) console.log(`${indent}  ${t.score.toFixed(2).padStart(9)}${t.n !== undefined ? ` n=${t.n}` : ''}  ${t.summary}${t.terms ? `  ${JSON.stringify(t.terms)}` : ''}`);
}

function list(trace: Trace, a: ReturnType<typeof parseArgs>): void {
  const round = str(a, 'round');
  const player = str(a, 'player');
  const phase = str(a, 'phase');
  const fellBack = bool(a, 'fellback');
  const rows = trace.decisions.filter((d) => (!round || d.round === Number(round)) && (!player || d.player === player) && (!phase || d.phase.startsWith(phase)) && (!fellBack || d.fellBack));
  for (const d of rows) {
    console.log(`${String(d.step).padStart(5)}  r${String(d.round).padEnd(3)} ${d.player} ${d.bot.padEnd(8)} ${d.phase.padEnd(20)} ${d.ms.toFixed(2).padStart(8)} ms  ${d.fellBack ? 'FALLBACK ' : ''}${d.chosen.type} ${d.chosen.summary}`);
  }
  console.log(`${rows.length} of ${trace.decisions.length} decisions`);
}

function show(trace: Trace, a: ReturnType<typeof parseArgs>): void {
  const step = num(a, 'step', 0);
  const d = trace.decisions[step];
  if (!d) throw new Error(`no decision ${step} (trace has ${trace.decisions.length})`);
  const state = stateAt(trace, step);
  if (state.history.seq !== d.seq) throw new Error(`replay at seq ${state.history.seq}, trace says ${d.seq}`);
  const who = d.player;
  console.log(`step ${step} | seq ${d.seq} | round ${state.round} | ${phaseKey(state)} | awaiting ${state.awaiting.kind}: ${state.awaiting.players.join(',')}`);
  console.log(`seats: ${trace.header.seats.map((s) => `${s.playerId}=${s.label}`).join(' ')} | bank ${JSON.stringify(state.bank)}`);
  for (const p of state.turnOrder) {
    const ps = state.players[p]!;
    console.log(`  ${p === who ? '>' : ' '} ${p} $${ps.cash}  cards ${Object.keys(ps.employees).length}  beach ${ps.beach.length}  inventory ${JSON.stringify(ps.inventory)}  milestones ${Object.keys(ps.milestones).join(',') || '-'}`);
  }
  if (bool(a, 'board')) console.log(`\n${renderAscii(state.board)}\n`);
  const view = redactFor(state, who);
  const legal = engine.legalActions(viewState(view), who);
  console.log(`\ntraced: ${d.bot} (${d.level}) ${d.ms.toFixed(2)} ms${d.fellBack ? ` FALLBACK (${d.error ?? 'invalid'})` : ''}`);
  console.log(`  -> ${d.chosen.type} ${d.chosen.summary}`);
  if (d.botAction) console.log(`  bot answered: ${d.botAction.type} ${summarizeAction(d.botAction)}`);
  printExplain(d.explain);
  console.log(`\nlegal (${legal.length}):`);
  for (const l of legal) console.log(`  ${l.kind.padEnd(9)} ${(l.kind === 'ready' ? l.action.type : l.actionType).padEnd(24)} ${l.label}`);

  if (bool(a, 'rerun')) {
    const levelArg = str(a, 'level') ?? d.level;
    if (!isBotLevel(levelArg)) throw new Error(`unknown level ${levelArg}`);
    const budgetMs = num(a, 'budget', trace.header.budgetMs);
    const bot = createBot(levelArg);
    const input = botInput({ level: levelArg, view, playerId: who, seed: decisionSeed(trace.header.seed, d.seq, who), budgetMs }, engine);
    const t0 = performance.now();
    let action: Action;
    let explanation: BotExplanation | undefined;
    try {
      if (bot.explain) {
        explanation = bot.explain(input);
        action = explanation.action;
      } else action = bot.choose(input);
    } catch (e) {
      console.log(`\nrerun ${levelArg}: threw ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      return;
    }
    const ms = performance.now() - t0;
    action = { ...action, playerId: who } as Action;
    const v = engine.validateAction(viewState(view), action);
    console.log(`\nrerun ${levelArg} (budget ${budgetMs} ms): ${ms.toFixed(2)} ms${v.ok ? '' : ` INVALID ${v.code}: ${v.message}`}`);
    console.log(`  -> ${action.type} ${summarizeAction(action)}`);
    console.log(`  same as traced: ${sameAction(action, d.botAction ?? d.action) ? 'yes' : 'no'}`);
    printExplain(explanation && (({ action: _a, ...rest }) => rest)(explanation));
  }
  const dump = str(a, 'dump');
  if (dump) {
    writeFileSync(dump, JSON.stringify({ state, view, decision: d }, null, 2));
    console.log(`\nwrote ${dump}`);
  }
}

function main(): void {
  const a = parseArgs(process.argv.slice(2), ['board', 'rerun', 'fellback', 'help']);
  const file = a.positional[0];
  if (!file || bool(a, 'help')) {
    console.log(USAGE);
    return;
  }
  const trace = loadTrace(file);
  if (a.flags.step === undefined) list(trace, a);
  else show(trace, a);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
}
