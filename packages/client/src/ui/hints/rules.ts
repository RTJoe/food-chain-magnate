/**
 * Coach hints for real games (tutorial-plan §4.6): pure functions of what the viewer can see
 * (`GameView` for `me`, their own draft and the current ghost). Never hidden information.
 * Light = rule-shaped hints (what you can do); full adds judgement hints (what is probably wise).
 */
import type { EmployeeAbility, GameView, HouseOutlook, HouseId, PlayerId, PlayerState, Uid } from '@fcm/engine';
import { employeeName, foodName, isManager, managerSlots, milestoneName, type Catalog } from '../../state/catalog.js';
import { handUids, openSlots, placedUids, validateDraft, type OrgDraft, type OrgRules } from '../../state/orgChart.js';
import { collapseOffers, scoreMath } from '../../state/offers.js';
import { restructureCandidates, workStages } from '../../state/selectors.js';
import { paydayFigures } from '../../state/payday.js';
import { milestoneOpen } from '../../state/campaignRules.js';
import type { CoachLevel } from './coach.js';

export type HintId =
  | 'trainer_idle'
  | 'overfill'
  | 'salary_short'
  | 'house_missing_goods'
  | 'campaign_reaches_nobody'
  | 'campaign_tiles_gone'
  | 'order_position'
  | 'bank_low'
  | 'milestone_in_reach'
  | 'lose_by_one';

export interface Hint {
  id: HintId;
  level: 'light' | 'full';
  /** Changes when the situation changes, so a hint closed for one situation can return for another. */
  key: string;
  text: string;
  /** Glossary id for "What's this?". */
  term: string;
}

export interface HintInput {
  view: GameView;
  me: PlayerId | null;
  catalog: Catalog;
  /** My Restructuring draft (null outside Restructuring). */
  draft: OrgDraft | null;
  /** CEO slots for my draft (prompt value; Ketchup can differ from view.ceoSlots). */
  ceoSlots?: number;
  /** Houses reached by the campaign ghost under the pointer, or null when no ghost is shown. */
  ghostReach?: number | null;
  /** Dinnertime outlook per house (engine `houseOutlook`); omitted in tests that do not need it. */
  outlook?: (houseId: HouseId) => HouseOutlook | null;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const money = (n: number) => `$${n}`;

function orgRules(c: Catalog, p: PlayerState, ceoSlots: number): OrgRules {
  const def = (u: Uid) => c.employees[p.employees[u]?.employeeId ?? 'waitress'];
  return { ceoSlots, isManager: (u) => isManager(def(u)), slotsOf: (u) => managerSlots(def(u)) };
}

const abilityOf = (c: Catalog, p: PlayerState, u: Uid): EmployeeAbility | undefined => c.employees[p.employees[u]?.employeeId ?? 'waitress']?.ability;

function atWork(p: PlayerState): Uid[] {
  const s = p.structure;
  return [s.ceo, ...s.ceoSubs, ...s.ceoSubs.flatMap((m) => s.managerSubs[m] ?? [])];
}

// --- Restructuring ----------------------------------------------------------

function restructuring(i: HintInput, p: PlayerState, out: Hint[]): void {
  const { view: v, catalog: c, draft } = i;
  if (v.phase.kind !== 'restructuring' || !draft || v.submitted[p.id]) return;
  const placed = placedUids(draft);
  const val = validateDraft(draft, orgRules(c, p, i.ceoSlots ?? v.ceoSlots));
  if (val.overfilled) {
    out.push({ id: 'overfill', level: 'light', key: String(val.placed), text: 'More cards than slots: if you submit this, everyone except your CEO goes to the beach for the round.', term: 'overfill' });
  }
  const trainers = placed.filter((u) => abilityOf(c, p, u)?.kind === 'train');
  if (trainers.length) {
    const beach = handUids(restructureCandidates(p), draft);
    const trainable = beach.filter((u) => (c.employees[p.employees[u]?.employeeId ?? 'waitress']?.trainsInto.length ?? 0) > 0);
    if (!trainable.length) {
      out.push({
        id: 'trainer_idle',
        level: 'light',
        key: placed.join(','),
        text: 'Your trainer can only train cards on the beach, and none of yours can be trained. Leave one off the chart, or train someone you hire this turn.',
        term: 'training',
      });
    }
  }
  const tiles = new Set(v.marketingTiles.map((n) => c.marketingTiles[n]?.kind).filter(Boolean));
  for (const u of placed) {
    const a = abilityOf(c, p, u);
    if (a?.kind !== 'marketing' || a.alwaysEternal) continue;
    const boardKinds = a.campaigns.filter((k) => k === 'billboard' || k === 'mailbox' || k === 'airplane' || k === 'radio');
    if (boardKinds.length && !boardKinds.some((k) => tiles.has(k))) {
      const name = employeeName(c, p.employees[u]!.employeeId);
      out.push({ id: 'campaign_tiles_gone', level: 'light', key: u, text: `No ${boardKinds.join(' or ')} tiles are left in the supply, so your ${name} will have nothing to place.`, term: 'campaign' });
      break;
    }
  }
}

// --- Order of Business ------------------------------------------------------

function orderOfBusiness(i: HintInput, p: PlayerState, out: Hint[]): void {
  const v = i.view;
  if (v.phase.kind !== 'orderOfBusiness') return;
  const queue = v.phase.queue;
  const pos = queue.indexOf(p.id);
  if (pos < 0 || v.phase.picks[p.id] !== undefined) return;
  const s = p.structure;
  const open = openSlots(validateDraft({ ceoSubs: s.ceoSubs, managerSubs: s.managerSubs }, orgRules(i.catalog, p, i.ceoSlots ?? v.ceoSlots))) + (p.milestones.first_airplane ? 2 : 0);
  out.push({
    id: 'order_position',
    level: 'light',
    key: `${v.round}`,
    text: `You have ${open} open slot${open === 1 ? '' : 's'}, so you choose your turn-order position ${ordinal(pos + 1)} of ${queue.length}.`,
    term: 'open_slots',
  });
}

// --- Working 9–5 --------------------------------------------------------------

function working(i: HintInput, p: PlayerState, out: Hint[]): void {
  const { view: v, catalog: c } = i;
  if (v.phase.kind !== 'working') return;
  const myTurn = v.turn?.player === p.id;

  if (!v.config.intro) {
    // The engine's own salary total (discounts, waivers, module hooks).
    const owed = paydayFigures(v, p.id).before;
    if (owed > p.cash) {
      out.push({
        id: 'salary_short',
        level: 'light',
        key: `${v.round}:${owed}`,
        text: `Payday will cost about ${money(owed)} in salaries and you have ${money(p.cash)}. Earn the rest at Dinnertime, or you will have to fire someone.`,
        term: 'salary',
      });
    }
  }

  if (myTurn && v.turn?.stage === 'food' && i.outlook) {
    const stock = p.inventory;
    for (const [hid, h] of Object.entries(v.board.houses)) {
      if (!h.demand.length) continue;
      const o = i.outlook(hid);
      if (!o?.sellers.some((s) => s.player === p.id)) continue;
      const want = new Map<string, number>();
      for (const d of h.demand) want.set(d.good, (want.get(d.good) ?? 0) + 1);
      const missing = [...want].filter(([g, n]) => (stock[g as keyof typeof stock] ?? 0) < n).map(([g]) => foodName(c, g as never).toLowerCase());
      if (missing.length) {
        const label = h.kind === 'rural' ? 'The rural area' : `House ${h.label}`;
        out.push({ id: 'house_missing_goods', level: 'light', key: `${v.round}:${hid}:${missing.join()}`, text: `${label} is connected to you and wants ${missing.join(' and ')}, which you do not have enough of yet. Houses buy all or nothing.`, term: 'demand' });
        break;
      }
    }
  }

  if (myTurn && i.ghostReach === 0) {
    out.push({ id: 'campaign_reaches_nobody', level: 'light', key: 'ghost', text: 'This spot reaches no house. That is allowed, but the campaign will create no demand.', term: 'campaign' });
  }

  if (myTurn && v.turn) {
    const stages = workStages(v);
    const at = stages.indexOf(v.turn.stage);
    const before = (s: (typeof stages)[number]) => at <= stages.indexOf(s);
    const cards = atWork(p);
    const recruits = cards.reduce((n, u) => {
      const a = abilityOf(c, p, u);
      return n + (a?.kind === 'ceo' ? 1 : a?.kind === 'recruit' ? a.actions : 0);
    }, 0);
    if (before('recruit') && v.turn.hired.length === 0 && recruits >= 3 && milestoneOpen(v, p.id, 'first_hire_3')) {
      out.push({ id: 'milestone_in_reach', level: 'full', key: `${v.round}:hire3`, text: `You can hire ${recruits} this turn. Hiring 3 claims ${milestoneName(c, 'first_hire_3')}: 2 free Management Trainees.`, term: 'first_hire_3' });
    } else if (before('train') && milestoneOpen(v, p.id, 'first_train') && cards.some((u) => abilityOf(c, p, u)?.kind === 'train')) {
      out.push({ id: 'milestone_in_reach', level: 'full', key: `${v.round}:train`, text: `Training anyone this turn claims ${milestoneName(c, 'first_train')}: $15 off every Payday.`, term: 'first_train' });
    } else if (before('marketing') && milestoneOpen(v, p.id, 'first_billboard') && cards.some((u) => abilityOf(c, p, u)?.kind === 'marketing')) {
      out.push({ id: 'milestone_in_reach', level: 'full', key: `${v.round}:billboard`, text: `A billboard claims ${milestoneName(c, 'first_billboard')}: no marketeer salaries, but every campaign you launch from then on is eternal.`, term: 'first_billboard' });
    }
  }

  if (myTurn && i.outlook) {
    for (const [hid, h] of Object.entries(v.board.houses)) {
      if (!h.demand.length) continue;
      const o = i.outlook(hid);
      if (!o || !o.winner || o.winner === p.id) continue;
      const sellers = collapseOffers(o.sellers);
      const mine = sellers.find((s) => s.player === p.id && s.canSupply);
      const best = sellers.find((s) => s.player === o.winner);
      if (!mine || !best || mine.tier !== best.tier || mine.score - best.score !== 1) continue;
      const label = h.kind === 'rural' ? 'the rural area' : `house ${h.label}`;
      const rival = v.players[o.winner]?.name ?? o.winner;
      out.push({ id: 'lose_by_one', level: 'full', key: `${v.round}:${hid}:${mine.score}:${best.score}`, text: `You lose ${label} to ${rival} by $1: ${scoreMath(best, { dollarScore: false })} against your ${scoreMath(mine, { dollarScore: false })}.`, term: 'winning_a_sale' });
      break;
    }
  }
}

// --- Any phase ----------------------------------------------------------------

function bank(i: HintInput, out: Hint[]): void {
  const v = i.view;
  if (v.phase.kind === 'gameOver' || v.round < 1) return;
  const n = v.config.players.length;
  const start = (v.config.intro ? 75 : 50) * n;
  const b = v.bank;
  if (b.breaks >= 2 || b.cash > start * 0.4) return;
  const ends = b.breaks === 1 || v.config.intro;
  out.push({
    id: 'bank_low',
    level: 'full',
    key: `${b.breaks}`,
    text: ends
      ? `The bank is down to ${money(b.cash)}. If it hits $0 at Dinnertime the game ends after that Dinnertime: count what the next one will pay.`
      : `The bank is down to ${money(b.cash)} of ${money(start)}. When it hits $0 at Dinnertime, reserve cards refill it and CEO slots change.`,
    term: 'bank_break',
  });
}

/** All hints for `me`, filtered by coach level (dismissed ones are filtered by the caller). */
export function coachHints(i: HintInput, level: CoachLevel): Hint[] {
  if (level === 'off' || !i.me) return [];
  const p = i.view.players[i.me];
  if (!p || p.bankrupt) return [];
  const out: Hint[] = [];
  restructuring(i, p, out);
  orderOfBusiness(i, p, out);
  working(i, p, out);
  bank(i, out);
  return out.filter((h) => level === 'full' || h.level === 'light');
}

export const ALL_HINT_IDS: readonly HintId[] = ['trainer_idle', 'overfill', 'salary_short', 'house_missing_goods', 'campaign_reaches_nobody', 'campaign_tiles_gone', 'order_position', 'bank_low', 'milestone_in_reach', 'lose_by_one'];
