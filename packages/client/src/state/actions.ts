/** Builds engine actions from a placement `LegalAction` plus the board pick and options. */
import type { Action, ActionType, FoodId, GameView, LegalAction, Placement, PlayerId, Uid } from '@fcm/engine';

export interface PlacementOptions {
  /** Campaign good(s). */
  goods?: FoodId[];
  /** Campaign duration. */
  duration?: number;
}

type PlacementLegal = Extract<LegalAction, { kind: 'placement' }>;

/** Returns null when the placement does not fit the legal action (UI bug guard). */
export function actionFromPlacement(legal: PlacementLegal, p: Placement, me: PlayerId, opts: PlacementOptions = {}): Action | null {
  const t: ActionType = legal.actionType;
  const cardUid: Uid = legal.cardUid ?? legal.spec.cardUid ?? '';
  const choiceId = legal.spec.choiceId ?? '';
  switch (p.kind) {
    case 'restaurant':
      if (t === 'setup.placeRestaurant') return { type: t, playerId: me, x: p.x, y: p.y, entrance: p.entrance };
      if (t === 'work.placeRestaurant') return { type: t, playerId: me, cardUid, x: p.x, y: p.y, entrance: p.entrance, ...(p.from ? { from: p.from } : {}) };
      return null;
    case 'moveRestaurant':
      return { type: 'work.moveRestaurant', playerId: me, cardUid, restaurantId: p.restaurantId, x: p.x, y: p.y, entrance: p.entrance };
    case 'house':
      return { type: 'work.placeHouse', playerId: me, cardUid, houseOrder: p.houseOrder, x: p.x, y: p.y, gardenSide: p.gardenSide };
    case 'garden':
      return { type: 'work.placeGarden', playerId: me, cardUid, houseId: p.houseId, side: p.side };
    case 'campaign':
      if (t === 'ketchup:newMilestones.placeSecondCampaign') return { type: t, playerId: me, choiceId, tileNumber: p.tileNumber, placement: p.placement };
      if (!opts.goods?.length || !opts.duration) return null;
      return {
        type: 'work.placeCampaign',
        playerId: me,
        cardUid,
        campaignKind: p.campaignKind,
        tileNumber: p.tileNumber,
        goods: opts.goods,
        placement: p.placement,
        duration: opts.duration,
        ...(p.from ? { from: p.from } : {}),
      };
    case 'buyerRoute':
      return { type: 'work.buyDrinks', playerId: me, cardUid, route: p.route };
    case 'coffeeShop':
      return { type: 'ketchup:coffee.placeShop', playerId: me, choiceId, x: p.x, y: p.y, ...(p.moveFrom ? { moveFrom: p.moveFrom } : {}) };
    case 'lobbyistRoad':
      return { type: 'ketchup:lobbyists.placeRoad', playerId: me, cardUid, cells: p.cells, arrows: p.arrows, from: p.from };
    case 'park':
      return { type: 'ketchup:lobbyists.placePark', playerId: me, cardUid, x: p.x, y: p.y, w: p.w, h: p.h, from: p.from };
    case 'freeway':
      return { type: 'ketchup:ruralMarketeers.placeFreeway', playerId: me, choiceId, side: p.side, offset: p.offset };
    case 'mapTile':
      return { type: 'ketchup:lobbyists.placeMapTile', playerId: me, choiceId, row: p.row, col: p.col, rotation: p.rotation, ...(p.templateId ? { templateId: p.templateId } : {}) };
    case 'pizzaRadio':
      return { type: 'ketchup:newMilestones.placePizzaRadio', playerId: me, choiceId, x: p.x, y: p.y };
    case 'freeMailbox':
      if (!opts.goods?.[0]) return null;
      return { type: 'ketchup:newMilestones.placeFreeMailbox', playerId: me, choiceId, x: p.x, y: p.y, good: opts.goods[0] };
  }
}

/** Placement kinds that need extra options before the board pick. */
export function needsGoods(legal: PlacementLegal): boolean {
  return legal.actionType === 'work.placeCampaign' || legal.actionType === 'ketchup:newMilestones.placeFreeMailbox';
}

/** Short human description of a placement (list fallback, hover and confirm bars). `view` resolves entity ids. */
export function describePlacement(p: Placement, view?: GameView | null): string {
  switch (p.kind) {
    case 'restaurant':
      return `Square ${p.x},${p.y} · entrance ${p.entrance}`;
    case 'moveRestaurant':
      return `Move to ${p.x},${p.y} · entrance ${p.entrance}`;
    case 'house':
      return `House #${p.houseOrder} at ${p.x},${p.y} · garden ${p.gardenSide}`;
    case 'garden':
      return `Garden on side ${p.side}`;
    case 'campaign': {
      const pl = p.placement;
      if (pl.kind === 'board') {
        const o = p.orientation ?? (pl.w === pl.h ? 'square' : pl.w > pl.h ? 'landscape' : 'portrait');
        return `Tile #${p.tileNumber} · ${pl.w}×${pl.h} at ${pl.x},${pl.y}${o === 'square' ? '' : ` (${o})`}`;
      }
      const where = pl.kind === 'airplane' ? `${pl.side} edge, offset ${pl.offset}` : pl.kind === 'rural' ? `rural ${pl.side}` : 'beside the board';
      return `Tile #${p.tileNumber} ${where}`;
    }
    case 'buyerRoute':
      return p.route.mode === 'errand' ? `Fetch ${p.route.drink.replace('_', ' ')}` : describeHaul(p, view);
    case 'coffeeShop': {
      if (!p.moveFrom) return `Coffee shop at ${p.x},${p.y}`;
      const from = view?.board.entities[p.moveFrom];
      return `Move coffee shop${from && 'x' in from ? ` from ${from.x},${from.y}` : ''} to ${p.x},${p.y}`;
    }
    case 'pizzaRadio':
    case 'freeMailbox':
      return `Square ${p.x},${p.y}`;
    case 'lobbyistRoad':
      return `Road over ${p.cells.length} squares`;
    case 'park':
      return `Park at ${p.x},${p.y}`;
    case 'freeway':
      return `Freeway ${p.side} edge, offset ${p.offset}`;
    case 'mapTile':
      return `${p.templateId ? `Tile ${p.templateId}` : 'Tile'} at row ${p.row}, col ${p.col} · turned ${p.rotation * 90}°`;
  }
}

/** Drinks a buyer route collects, summed by drink ("2 beer, 2 lemonade"), most first. */
export function haulDrinks(p: Extract<Placement, { kind: 'buyerRoute' }>, view?: GameView | null): { drink: string; count: number }[] {
  const by = new Map<string, number>();
  for (const c of p.collects) {
    const drink = view?.board.drinkSources[c.sourceId]?.drink ?? c.sourceId;
    by.set(drink, (by.get(drink) ?? 0) + c.count);
  }
  return [...by].map(([drink, count]) => ({ drink, count })).sort((a, b) => b.count - a.count || a.drink.localeCompare(b.drink));
}

/** One haul row: "2 beer, 2 lemonade · 1/2 borders" (air: tiles). */
export function describeHaul(p: Extract<Placement, { kind: 'buyerRoute' }>, view?: GameView | null): string {
  const drinks = haulDrinks(p, view);
  const what = drinks.length ? drinks.map((d) => `${d.count} ${d.drink.replace('_', ' ')}`).join(', ') : 'No drinks';
  const unit = p.route.mode === 'air' ? 'tiles' : 'borders';
  const used = p.bordersUsed !== undefined && p.range !== undefined ? ` · ${p.bordersUsed}/${p.range} ${unit}` : '';
  return `${what}${used}`;
}
