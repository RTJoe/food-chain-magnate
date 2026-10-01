/** Turns engine events into readable log lines (architecture §5.4 Log). */
import type { FoodCounts, GameEvent, GameView, PlayerId } from '@fcm/engine';
import type { Catalog } from './catalog.js';
import { employeeName, foodName, milestoneName } from './catalog.js';
import { phaseLabel, STAGE_LABELS } from './selectors.js';

export type LogIcon = 'phase' | 'round' | 'hire' | 'train' | 'fire' | 'food' | 'cash' | 'board' | 'campaign' | 'milestone' | 'bank' | 'turn' | 'secret' | 'trophy' | 'info';

export interface LogLine {
  id: number;
  seq: number;
  round: number;
  icon: LogIcon;
  text: string;
  player: PlayerId | null;
  /** Section headers (round / phase) render differently. */
  header?: boolean;
}

type Line = Omit<LogLine, 'id' | 'seq' | 'round'>;

const money = (n: number) => `$${n}`;

function goods(c: Catalog, g: FoodCounts | undefined): string {
  if (!g) return '';
  return Object.entries(g)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([f, n]) => `${n} ${foodName(c, f as never).toLowerCase()}`)
    .join(', ');
}

export function describeEvent(e: GameEvent, view: GameView, c: Catalog): Line | null {
  const n = (id: PlayerId | null | undefined) => (id ? (view.players[id]?.name ?? id) : 'Someone');
  const L = (icon: LogIcon, text: string, player: PlayerId | null = null, header = false): Line => ({ icon, text, player, ...(header ? { header } : {}) });
  switch (e.type) {
    case 'gameStarted':
      return L('round', 'The game begins', null, true);
    case 'roundStarted':
      return L('round', `Round ${e.round}`, null, true);
    case 'phaseChanged':
      return L('phase', phaseLabel(e.to), null, true);
    case 'turnStarted':
      return L('turn', `${n(e.player)} starts their turn`, e.player);
    case 'workStageChanged':
      return L('turn', `${n(e.player)}: ${STAGE_LABELS[e.stage]}`, e.player);
    case 'turnEnded':
      return L('turn', `${n(e.player)} ends their turn`, e.player);
    case 'turnOrderSet':
      return L('info', `Turn order: ${e.turnOrder.map(n).join(' → ')}`);
    case 'choicePending':
    case 'choiceResolved':
      return null;
    case 'setupPassed':
      return L('board', `${n(e.player)} passes on the first restaurant`, e.player);
    case 'reserveChosen':
      return L('secret', e.card ? `You chose the $${e.card.amount} reserve card` : `${n(e.player)} chose a reserve card`, e.player);
    case 'structureSubmitted':
      return L('secret', `${n(e.player)} submitted a structure`, e.player);
    case 'structureRetracted':
      return L('secret', `${n(e.player)} took their structure back`, e.player);
    case 'structuresRevealed':
      return L('info', 'Structures revealed');
    case 'structurePenalty':
      return L('fire', `${n(e.player)} overfilled their structure: everyone goes to the beach`, e.player);
    case 'orderChosen':
      return L('turn', `${n(e.player)} takes position ${e.position + 1}`, e.player);
    case 'employeeHired':
      return L('hire', `${n(e.player)} hires a ${employeeName(c, e.employeeId)}`, e.player);
    case 'employeeGained':
      return L('hire', `${n(e.player)} gains a ${employeeName(c, e.employeeId)}`, e.player);
    case 'employeeTrained':
      return L('train', `${n(e.player)} trains a ${employeeName(c, e.from)} into a ${employeeName(c, e.to)}`, e.player);
    case 'employeeFired':
      return L('fire', `${n(e.player)} ${e.forced ? 'had to fire' : 'fires'} a ${employeeName(c, e.employeeId)}`, e.player);
    case 'cardSkipped':
    case 'cardsReturned':
      return null;
    case 'marketeerReturned':
      return L('campaign', `${n(e.player)}'s marketeer is back from a campaign`, e.player);
    case 'foodProduced':
      return L('food', `${n(e.player)} makes ${e.count} ${foodName(c, e.food).toLowerCase()}`, e.player);
    case 'drinksBought': {
      const got = e.collected.map((x) => `${x.count} ${foodName(c, x.drink).toLowerCase()}`).join(', ');
      return L('food', `${n(e.player)} collects ${got || 'nothing'}`, e.player);
    }
    case 'foodDiscarded':
      return L('food', `${n(e.player)} throws away ${goods(c, e.goods)}`, e.player);
    case 'foodFrozen':
      return L('food', `${n(e.player)} freezes ${goods(c, e.goods)}`, e.player);
    case 'restaurantPlaced':
      return L('board', `${n(e.player)} ${e.comingSoon ? 'announces a restaurant (coming soon)' : 'opens a restaurant'}`, e.player);
    case 'restaurantMoved':
      return L('board', `${n(e.player)} moves a restaurant`, e.player);
    case 'restaurantOpened':
      return L('board', 'A restaurant opens its doors');
    case 'houseBuilt':
      return L('board', `${n(e.player)} builds a house`, e.player);
    case 'gardenAdded':
      return L('board', `${n(e.player)} adds a garden`, e.player);
    case 'campaignPlaced':
      return L('campaign', `${n(e.player)} launches a ${e.campaign.kind} for ${e.campaign.goods.map((g) => foodName(c, g).toLowerCase()).join(' + ')}`, e.player);
    case 'entityPlaced':
      return L('board', `${n(e.player)} places a ${e.entity.kind.replace(/([A-Z])/g, ' $1').toLowerCase()}`, e.player);
    case 'entityRemoved':
      return null;
    case 'mapTileAdded':
      return L('board', `${n(e.player)} adds map tile ${e.templateId}`, e.player);
    case 'houseConsidered':
      return null;
    case 'houseStayedHome': {
      const h = view.board.houses[e.houseId];
      return L('info', `House ${h?.label ?? ''} stays home`.replace('  ', ' '));
    }
    case 'sale': {
      const h = view.board.houses[e.houseId];
      return L('cash', `${n(e.player)} sells to house ${h?.label ?? e.houseId} for ${money(e.total)}`, e.player);
    }
    case 'coffeeSold':
      return L('cash', `${n(e.player)} sells coffee for ${money(e.amount)}`, e.player);
    case 'tipsPaid':
      return L('cash', `${n(e.player)}'s waitresses earn ${money(e.amount)}`, e.player);
    case 'cfoBonus':
      return L('cash', `${n(e.player)}'s CFO adds ${money(e.amount)}`, e.player);
    case 'bankBroke':
      return L('bank', e.breakNo === 1 ? `The bank breaks! Reserves add ${money(e.added)}` : 'The bank breaks a second time: the game ends');
    case 'iouIssued':
      return L('bank', `${n(e.player)} gets an IOU for ${money(e.amount)}`, e.player);
    case 'bankrupt':
      return L('bank', `${n(e.player)} goes bankrupt`, e.player);
    case 'salaryPaid':
      return L('cash', `${n(e.player)} pays ${money(e.paid)} in salaries`, e.player);
    case 'bankBurned':
      return L('bank', `${money(e.amount)} leaves the game`, e.player);
    case 'campaignRan':
      return null;
    case 'demandPlaced': {
      const h = view.board.houses[e.houseId];
      return L('campaign', `House ${h?.label ?? e.houseId} wants ${e.tokens.map((t) => foodName(c, t.good).toLowerCase()).join(', ')}`);
    }
    case 'marketingIncome':
      return L('cash', `${n(e.player)} earns ${money(e.amount)} from marketing`, e.player);
    case 'campaignTicked':
      return null;
    case 'campaignExpired':
      return L('campaign', `A ${e.kind} campaign ends`);
    case 'milestoneClaimed':
      return L('milestone', `${n(e.player)} earns “${milestoneName(c, e.milestoneId)}”`, e.player);
    case 'milestonesRemoved':
      return L('milestone', `Milestones leave the game: ${e.milestoneIds.map((m) => milestoneName(c, m)).join(', ')}`);
    case 'cashChanged':
      return null;
    case 'gameEnded': {
      const w = e.ranking[0];
      return L('trophy', `${n(w)} wins with ${money(e.cash[w ?? ''] ?? 0)}`, w ?? null, true);
    }
    default:
      return null;
  }
}
