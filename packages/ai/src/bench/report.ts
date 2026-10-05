/** Plain-text tournament report for the terminal. */
import type { Summary } from './tournament.js';

const pct = (x: number) => (100 * x).toFixed(1);
const ms = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));

function table(rows: string[][], rightFrom = 1): string {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length)));
  return rows.map((r) => r.map((cell, c) => (c < rightFrom ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!))).join('  ')).join('\n');
}

export function formatReport(s: Summary, opts: { phases?: boolean } = {}): string {
  const m = s.meta;
  const rot = m.rotate ? m.players : 1;
  const seeds = Math.ceil(m.games / rot);
  const vs = m.groups.map((g) => `${g.label}${g.seats > 1 ? ` x${g.seats}` : ''}`).join(' vs ');
  const out: string[] = [];
  out.push(
    `${vs} | ${m.players}p, ${s.games.total} games (seeds ${m.seed}..${m.seed + seeds - 1}${rot > 1 ? ` x ${rot} rotations` : ''}), modules: ${m.modules.length ? m.modules.map((x) => x.replace('ketchup:', '')).join(',') : 'none'}${m.intro ? ', intro' : ''}, budget ${m.budgetMs} ms${m.workers !== undefined ? `, ${m.workers} workers` : ''}${m.elapsedMs !== undefined ? `, ${(m.elapsedMs / 1000).toFixed(1)} s` : ''}`,
  );
  const unregistered = s.groups.filter((g) => !g.registered).map((g) => g.level);
  if (unregistered.length) out.push(`note: ${[...new Set(unregistered)].join(', ')} not registered; playing as Easy`);
  out.push('');
  const rows = [['bot', 'win%', '95% CI', 'exp%', 'elo', 'cash', 'place', 'fallback', 'invalid', 'threw', 'rejected', 'p50 ms', 'p95 ms', 'max ms']];
  for (const g of s.groups) {
    const e = s.elo[g.label];
    rows.push([
      g.label,
      pct(g.winRate),
      `[${pct(g.ci95[0])}, ${pct(g.ci95[1])}]`,
      pct(g.expected),
      e ? `${e.mean.toFixed(0)} ±${e.spread.toFixed(0)}` : '-',
      `$${g.meanCash.toFixed(0)}`,
      g.meanPlace ? g.meanPlace.toFixed(2) : '-',
      String(g.fallbacks),
      String(g.invalid),
      String(g.threw),
      String(g.rejected),
      ms(g.latency.p50),
      ms(g.latency.p95),
      ms(g.latency.max),
    ]);
  }
  out.push(table(rows));
  out.push('');
  for (const h of s.headToHead) out.push(`head to head: ${h.a} above ${h.b} ${pct(h.rate)}% [${pct(h.ci95[0])}, ${pct(h.ci95[1])}] over ${h.n} seat pairs`);
  const gm = s.games;
  out.push(
    `games: ${gm.finished}/${gm.total} finished (${pct(gm.completionRate)}%), ${gm.capped} hit the ${m.maxRounds}-round cap, ${gm.rejected} aborted on a rejected action; within 40 rounds ${pct(gm.within40)}%`,
  );
  out.push(`length: ${gm.meanRounds.toFixed(1)} rounds mean (max ${gm.maxRounds}), ${gm.meanSteps.toFixed(0)} decisions mean, ${gm.meanWallMs.toFixed(0)} ms per game`);
  out.push(`wins by seat: ${Object.keys(gm.winsBySeat).sort().map((p) => `${p} ${gm.winsBySeat[p]}`).join(', ') || '-'}`);
  if (opts.phases) {
    out.push('');
    for (const g of s.groups) {
      const prow = [[`${g.label} phase`, 'n', 'p50 ms', 'p95 ms', 'max ms']];
      for (const [k, l] of Object.entries(g.latencyByPhase)) prow.push([k, String(l.n), ms(l.p50), ms(l.p95), ms(l.max)]);
      out.push(table(prow));
    }
  }
  if (s.problems.length) {
    out.push('');
    out.push(`problems (first ${s.problems.length}):`);
    for (const p of s.problems) out.push(`  ${p}`);
  }
  return out.join('\n');
}
