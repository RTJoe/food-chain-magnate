/**
 * Movie Stars (ketchup.md §15; KX p16; DLX p27).
 *
 * - One B-, one C- and one D-Movie Star card (salary, purple). In play: B (2–3 players), B and C
 *   (4), B, C and D (5–6). Trained from a waitress (the "Movie Star" waitress replacement cards).
 *   All movie stars together are one 1x type (`uniqueGroup`). No income (not waitresses).
 * - Order of Business: players with a movie star at work choose first: B, then C, then D; then the
 *   rest by open slots.
 * - Dinnertime: a tie that waitresses would decide is won by a movie star at work: B > C > D >
 *   none (base `compareCandidates` checks `movieStar` before waitresses).
 */
import type { GameModule } from '../../types/module.js';
import type { EmployeeId } from '../../types/content.js';
import type { GameState, PlayerId } from '../../types/state.js';
import { kcard, workDefs } from './shared.js';

const ID = 'ketchup:movieStars' as const;
const REF = 'employees.md §2; ketchup.md §15';
const RANK = { B: 3, C: 2, D: 1 } as const;

const star = (id: EmployeeId, name: string, rank: 'B' | 'C' | 'D', text: string) =>
  kcard(id, name, ID, 1, 'purple', 'service', { kind: 'movieStar', rank }, text, REF, { salary: true, unique: true, uniqueGroup: 'movieStar' });

/** Rank of the movie star a player has at work (B=3, C=2, D=1, none=0). */
export function movieStarRank(s: GameState, player: PlayerId): number {
  const p = s.players[player];
  if (!p) return 0;
  let best = 0;
  for (const { def } of workDefs(s, p)) if (def.ability.kind === 'movieStar') best = Math.max(best, RANK[def.ability.rank]);
  return best;
}

export const MOVIE_STARS_MODULE: GameModule = {
  id: ID,
  name: 'Movie Stars',
  description: 'Movie stars choose turn order first and win dinnertime ties.',
  content: {
    employees: [
      star('ketchup:b_movie_star', 'B-Movie Star', 'B', 'Win all ties; first choice in turn order.'),
      star('ketchup:c_movie_star', 'C-Movie Star', 'C', 'Win all ties (not against B); second choice in turn order.'),
      star('ketchup:d_movie_star', 'D-Movie Star', 'D', 'Win all ties (not against B or C); third choice in turn order.'),
    ],
    careerAdditions: { waitress: ['ketchup:b_movie_star', 'ketchup:c_movie_star', 'ketchup:d_movie_star'] },
  },
  hooks: {
    onCreateGame(ctx) {
      const s = ctx.state;
      const n = s.turnOrder.length;
      s.supply['ketchup:b_movie_star'] = 1;
      if (n >= 4) s.supply['ketchup:c_movie_star'] = 1;
      else delete s.supply['ketchup:c_movie_star'];
      if (n >= 5) s.supply['ketchup:d_movie_star'] = 1;
      else delete s.supply['ketchup:d_movie_star'];
    },
    orderQueue(queue, ctx) {
      const s = ctx.state;
      const stars = queue.filter((id) => movieStarRank(s, id) > 0).sort((a, b) => movieStarRank(s, b) - movieStarRank(s, a));
      return [...stars, ...queue.filter((id) => movieStarRank(s, id) === 0)];
    },
    dinnerCandidates(cands, ctx) {
      return cands.map((c) => ({ ...c, movieStar: Math.max(c.movieStar, movieStarRank(ctx.state, c.player)) }));
    },
  },
};
