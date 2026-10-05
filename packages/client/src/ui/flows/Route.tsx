/**
 * Buyer routes (ux-plan §3.1): one haul row per distinct candidate, drink chips, start mark and
 * borders used. Rows and the board's ribbons share `activeCandidate`: hovering a row (or a ribbon)
 * makes it active; clicking the active row, the board's Confirm or a second tap commits it.
 * Errand boy fetches (no board geometry) stay drink chips.
 */
import { useMemo } from 'preact/hooks';
import type { FoodId, GameView, Placement } from '@fcm/engine';
import { haulDrinks } from '../../state/actions.js';
import { foodName } from '../../state/catalog.js';
import { boardModeFor, isBoardRoute, type RoutePlacementT } from '../../state/guidance.js';
import { activeCandidate, cycleCandidate, setActiveCandidate } from '../../state/interaction.js';
import { catalog, view } from '../../state/store.js';
import { Button } from '../common.js';
import { FoodIcon, Icon } from '../icons.js';
import { commitPlacement, FlowHead, NoSpots, playerColor, useBoardMode } from './shared.js';
import type { FlowProps } from './types.js';

const total = (p: RoutePlacementT) => p.collects.reduce((n, c) => n + c.count, 0);

/** "NW corner of 8,3" / "coffee shop at 4,7". */
export function routeStartLabel(p: RoutePlacementT, v: GameView | null): string {
  if (p.route.mode === 'errand') return '';
  const from = p.route.from;
  if (from.kind === 'restaurant') {
    const r = v?.board.restaurants[from.restaurantId];
    return r ? `${from.corner} corner of ${r.x},${r.y}` : from.corner;
  }
  const e = v?.board.entities[from.entityId];
  return e && 'x' in e ? `coffee shop at ${e.x},${e.y}` : 'coffee shop';
}

export function RouteFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const v = view.value;
  const c = catalog.value;
  // Most drinks first; the board mode uses the same order so row i == ribbon i.
  const routes = useMemo(() => placements.filter(isBoardRoute).sort((a, b) => total(b) - total(a) || (a.bordersUsed ?? 0) - (b.bordersUsed ?? 0)), [placements]);
  const errands = placements.filter((p) => p.kind === 'buyerRoute' && p.route.mode === 'errand');
  const mode = useMemo(() => (routes.length ? boardModeFor(legal, routes, { color: playerColor() }) : null), [routes]);
  const active = activeCandidate.value;

  const pick = (p: Placement) => {
    if (commitPlacement(legal, p)) onDone();
  };
  useBoardMode(mode, { onPlacement: pick, onCancel });

  const air = routes[0]?.route.mode === 'air';
  const unit = air ? 'tiles' : 'borders';
  return (
    <div class="flow route-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      {placements.length === 0 && <NoSpots>No route collects anything from here.</NoSpots>}
      {errands.length > 0 && (
        <div class="chip-row">
          {errands.map((p, i) =>
            p.kind === 'buyerRoute' && p.route.mode === 'errand' ? (
              <button key={i} type="button" class="chip chip-food chip-lg placement-btn" onClick={() => pick(p)}>
                <FoodIcon food={p.route.drink as FoodId} size={22} /> {foodName(c, p.route.drink as FoodId)}
              </button>
            ) : null,
          )}
        </div>
      )}
      {routes.length > 0 && (
        <>
          <p class="muted small">
            {routes.length} different haul{routes.length === 1 ? '' : 's'}. Hover or tap a row (or a ribbon on the board) to see the route; pick it again or Confirm to buy.
          </p>
          <ol class="haul-list" aria-label="Drink hauls">
            {routes.map((p, i) => {
              const on = i === active;
              const drinks = haulDrinks(p, v);
              return (
                <li key={i}>
                  <button
                    type="button"
                    class={`placement-btn haul-row ${on ? 'is-active' : ''}`}
                    aria-pressed={on}
                    onMouseEnter={() => setActiveCandidate(i)}
                    onFocus={() => setActiveCandidate(i)}
                    onClick={() => (on ? pick(p) : setActiveCandidate(i))}
                  >
                    <span class="haul-rank">{i + 1}</span>
                    <span class="haul-main">
                      <span class="haul-drinks">
                        {drinks.length ? (
                          drinks.map((d) => (
                            <span key={d.drink} class="haul-drink">
                              <FoodIcon food={d.drink as FoodId} size={18} />
                              {d.count}× {foodName(c, d.drink as FoodId).toLowerCase()}
                            </span>
                          ))
                        ) : (
                          <span class="muted">No drinks</span>
                        )}
                      </span>
                      <span class="haul-meta">
                        {Icon.store({ size: 12 })} {routeStartLabel(p, v)}
                        {p.bordersUsed !== undefined && p.range !== undefined && (
                          <span class="haul-range" title={`Uses ${p.bordersUsed} of ${p.range} ${unit}`}>
                            {' · '}
                            <span class="pips">
                              {Array.from({ length: p.range }, (_, k) => (
                                <i key={k} class={k < (p.bordersUsed ?? 0) ? 'is-on' : ''} />
                              ))}
                            </span>{' '}
                            {p.bordersUsed}/{p.range} {unit}
                          </span>
                        )}
                      </span>
                    </span>
                    {on && <span class="haul-go">Buy {Icon.chevronRight({ size: 14 })}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <div class="row gap end">
            {routes.length > 1 && (
              <>
                <Button size="sm" variant="ghost" icon="chevronLeft" aria-label="Previous haul" onClick={() => cycleCandidate(-1)}>
                  Prev
                </Button>
                <Button size="sm" variant="ghost" icon="chevronRight" aria-label="Next haul" onClick={() => cycleCandidate(1)}>
                  Next
                </Button>
              </>
            )}
            <Button size="sm" variant="primary" icon="check" disabled={!routes[active]} onClick={() => routes[active] && pick(routes[active])}>
              Buy haul {active >= 0 ? active + 1 : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
