/**
 * Structural invariants of a `GameState` (not rules legality). Used by the state builder and by
 * tests/fuzzers. Throws with a list of problems.
 */
import type { GameState } from '../types/state.js';

export function stateProblems(s: GameState): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(m);

  // Plain JSON: no undefined, NaN, class instances or shared references.
  const seen = new Set<object>();
  const walk = (v: unknown, path: string) => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) bad(`${path}: non-finite number`);
      return;
    }
    if (typeof v !== 'object') return bad(`${path}: ${typeof v} is not JSON`);
    if (seen.has(v)) return bad(`${path}: shared reference`);
    seen.add(v);
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return bad(`${path}: not a plain object`);
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) bad(`${path}.${k}: undefined`);
      else walk(x, `${path}.${k}`);
    }
  };
  walk(s, 'state');

  const ids = Object.keys(s.players);
  const sorted = (a: string[]) => [...a].sort().join(',');
  if (sorted(ids) !== sorted(s.turnOrder)) bad('turnOrder does not match players');
  if (sorted(ids) !== sorted(s.config.players.map((p) => p.id))) bad('config.players does not match players');
  if (sorted(ids) !== sorted(Object.keys(s.secrets))) bad('secrets do not match players');
  for (const id of s.awaiting.players) if (!s.players[id]) bad(`awaiting unknown player ${id}`);

  let maxId = 0;
  const noteId = (id: string) => {
    const m = /-(\d+)$/.exec(id);
    if (m) maxId = Math.max(maxId, Number(m[1]));
  };

  for (const p of Object.values(s.players)) {
    const where = new Map<string, string>();
    const place = (uid: string, loc: string) => {
      if (!p.employees[uid]) bad(`${p.id}: ${loc} references unknown card ${uid}`);
      if (where.has(uid)) bad(`${p.id}: card ${uid} in ${where.get(uid)} and ${loc}`);
      where.set(uid, loc);
    };
    place(p.structure.ceo, 'ceo');
    if (p.employees[p.structure.ceo]?.employeeId !== 'ceo') bad(`${p.id}: structure.ceo is not a CEO`);
    p.structure.ceoSubs.forEach((u) => place(u, 'ceoSubs'));
    for (const [mgr, subs] of Object.entries(p.structure.managerSubs)) {
      if (!p.structure.ceoSubs.includes(mgr)) bad(`${p.id}: manager ${mgr} not in a CEO slot`);
      subs.forEach((u) => place(u, `managerSubs.${mgr}`));
    }
    p.beach.forEach((u) => place(u, 'beach'));
    for (const [uid, camps] of Object.entries(p.busy)) {
      place(uid, 'busy');
      for (const c of camps) {
        const camp = s.board.campaigns[c];
        if (!camp) bad(`${p.id}: busy card ${uid} on unknown campaign ${c}`);
        else if (camp.marketeer !== uid) bad(`${p.id}: campaign ${c} marketeer is not ${uid}`);
      }
    }
    for (const uid of Object.keys(p.employees)) noteId(uid);
    const owned = Object.values(s.board.restaurants).filter((r) => r.owner === p.id).length;
    if (owned + p.restaurantsRemaining !== 3) bad(`${p.id}: ${owned} restaurants + ${p.restaurantsRemaining} remaining != 3`);
    if (p.cash < 0 && !p.bankrupt) bad(`${p.id}: negative cash`);
  }

  const b = s.board;
  if (b.w !== b.cols * 5 || b.h !== b.rows * 5) bad('board size mismatch');
  if (b.cells.length !== b.h || b.cells.some((r) => r.length !== b.w)) bad('cells dimensions mismatch');
  const known = new Set([
    ...Object.keys(b.houses),
    ...Object.keys(b.restaurants),
    ...Object.keys(b.campaigns),
    ...Object.keys(b.drinkSources),
    ...Object.keys(b.entities),
  ]);
  known.forEach(noteId);
  b.tiles.forEach((t) => noteId(t.id));
  s.pending.forEach((c) => noteId(c.id));
  b.cells.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c.occupant && !known.has(c.occupant)) bad(`cell (${x},${y}) occupant ${c.occupant} unknown`);
      if ((c.kind === 'road') !== (c.road !== null)) bad(`cell (${x},${y}) road info mismatch`);
    }),
  );
  for (const h of Object.values(b.houses)) {
    for (const c of h.cells) {
      const k = b.cells[c.y]?.[c.x]?.kind;
      if (k !== 'house' && k !== 'apartment') bad(`house ${h.id} square (${c.x},${c.y}) is ${k}`);
    }
    for (const c of h.garden?.cells ?? []) {
      if (b.cells[c.y]?.[c.x]?.kind !== 'garden') bad(`house ${h.id} garden square (${c.x},${c.y}) not a garden`);
    }
  }
  for (const r of Object.values(b.restaurants)) if (!s.players[r.owner]) bad(`restaurant ${r.id} unknown owner`);
  for (const c of Object.values(b.campaigns)) {
    if (!s.players[c.owner]) bad(`campaign ${c.id} unknown owner`);
    if (c.marketeer && !s.players[c.owner]?.busy[c.marketeer]?.includes(c.id)) bad(`campaign ${c.id} marketeer not busy on it`);
    if (c.remaining < 1) bad(`campaign ${c.id} has no duration left`);
  }
  if (s.nextId <= maxId) bad(`nextId ${s.nextId} <= max allocated id ${maxId}`);
  return out;
}

export function assertValidState(s: GameState): void {
  const problems = stateProblems(s);
  if (problems.length) throw new Error(`Invalid GameState:\n- ${problems.join('\n- ')}`);
}
