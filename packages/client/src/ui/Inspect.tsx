/**
 * Inspect card (ux-plan §3.3): details for the selected board piece (house, restaurant, campaign,
 * drink source, module entity). Board clicks in idle mode, log links and rows in this card set
 * `selection`; Focus moves the camera; Close / Esc clears it. Hidden while picking on the board.
 */
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import type { Campaign, CampaignId, FoodId, GameView, HouseId, PlayerId, RestaurantId, SourceId } from '@fcm/engine';
import { interactionMode, isPickMode } from '../state/boardBridge.js';
import { foodName } from '../state/catalog.js';
import { campaignReachIds, outlookFor, placementsFor } from '../state/guidance.js';
import { cameraCommand, select, selectedOutlook, selection, type Selection } from '../state/interaction.js';
import { catalog, legal, manifest, me, view } from '../state/store.js';
import { humanize } from '../state/catalog.js';
import { IconButton, PlayerBadge, Pill } from './common.js';
import { FoodIcon, Icon } from './icons.js';
import { KIND_LABEL } from './flows/Campaign.js';
import { campaignTermId, entityTermId, houseTermId } from './glossary/index.js';
import { WhatsThis } from './glossary/WhatsThis.js';

const HOUSE_KIND: Record<string, string> = { printed: 'House', placed: 'New house', apartment: 'Apartment', rural: 'Rural area' };

export function InspectCard() {
  const sel = selection.value;
  const v = view.value;
  if (!sel || !v || isPickMode(interactionMode.value)) return null;
  return (
    <section class="inspect glass" aria-label="Inspect" role="dialog" data-tutorial="inspect">
      <InspectBody sel={sel} view={v} />
    </section>
  );
}

function Head({ eyebrow, title, id, term }: { eyebrow: string; title: ComponentChildren; id: string; term?: string | null }) {
  return (
    <header class="inspect-head">
      <span>
        <span class="eyebrow">{eyebrow}</span>
        <h3>
          {title}
          {term && <WhatsThis id={term} />}
        </h3>
      </span>
      <IconButton icon="recenter" label="Focus camera" onClick={() => (cameraCommand.value = { kind: 'focus', ids: [id] })} />
      <IconButton icon="x" label="Close" onClick={() => select(null)} />
    </header>
  );
}

function InspectBody({ sel, view: v }: { sel: Selection; view: GameView }) {
  switch (sel.kind) {
    case 'house':
      return <HouseCard id={sel.id} view={v} />;
    case 'restaurant':
      return <RestaurantCard id={sel.id} view={v} />;
    case 'campaign':
      return <CampaignCard id={sel.id} view={v} />;
    case 'source':
      return <SourceCard id={sel.id} view={v} />;
    case 'entity':
      return <EntityCard id={sel.id} view={v} />;
  }
}

const name = (v: GameView, id: PlayerId | null | undefined) => (id ? (v.players[id]?.name ?? id) : '—');
const houseLabel = (v: GameView, id: HouseId) => {
  const h = v.board.houses[id];
  return h ? (h.kind === 'rural' ? 'Rural area' : `House ${h.label}`) : id;
};

function Goods({ goods, size = 18 }: { goods: readonly FoodId[]; size?: number }) {
  const c = catalog.value;
  return (
    <span class="inspect-goods">
      {goods.map((g, i) => (
        <span key={i} title={foodName(c, g)}>
          <FoodIcon food={g} size={size} />
        </span>
      ))}
    </span>
  );
}

function campaignLine(v: GameView, camp: Campaign): string {
  const c = catalog.value;
  const left = camp.eternal ? '∞' : `${camp.remaining} left`;
  return `${camp.number !== null ? `#${camp.number} ` : ''}${KIND_LABEL[camp.kind] ?? humanize(camp.kind)} · ${name(v, camp.owner)} · ${camp.goods.map((g) => foodName(c, g).toLowerCase()).join(' + ')} · ${left}`;
}

function HouseCard({ id, view: v }: { id: HouseId; view: GameView }) {
  const h = v.board.houses[id];
  const o = selectedOutlook.value;
  if (!h) return null;
  const cap = o?.capacity ?? (h.kind === 'apartment' || h.kind === 'rural' ? null : h.garden ? 5 : 3);
  const demand = h.demand.map((d) => d.good);
  const full = cap !== null && demand.length >= cap;
  return (
    <>
      <Head eyebrow={HOUSE_KIND[h.kind] ?? 'House'} title={houseLabel(v, id)} id={id} term={houseTermId(h.kind)} />
      <div class="inspect-chips">
        <Pill tone={full ? 'warn' : 'neutral'}>
          {demand.length}/{cap ?? '∞'} demand{full ? ' (full)' : ''}
        </Pill>
        {h.garden && (
          <Pill tone="ok" icon="sparkle">
            Garden: pays ×2
          </Pill>
        )}
      </div>
      {demand.length ? <Goods goods={demand} size={22} /> : <p class="muted small">No demand yet.</p>}
      <h4>
        Who can sell <WhatsThis id="winning_a_sale" />
      </h4>
      {!o ? (
        <p class="muted small">Needs the rules engine.</p>
      ) : o.sellers.length === 0 ? (
        <p class="muted small">No restaurant is connected by road.</p>
      ) : (
        <ul class="inspect-list" data-tutorial="inspect-sellers">
          {o.sellers.map((s, i) => {
            const wins = o.winner === s.player && o.sellers.findIndex((x) => x.player === s.player && x.canSupply) === i;
            return (
              <li key={`${s.player}-${s.restaurantId}`} class={wins ? 'is-win' : ''}>
                <button type="button" class="inspect-row" onClick={() => select({ kind: 'restaurant', id: s.restaurantId })}>
                  <PlayerBadge view={v} id={s.player} size={20} />
                  <span class="inspect-row-main">
                    <b>{name(v, s.player)}</b> ${s.unitPrice} + {s.distance} = <b>${s.score}</b>
                    {s.score !== s.unitPrice + s.distance && <span class="muted"> (with modifiers)</span>}
                  </span>
                  {wins ? <span class="inspect-win">wins</span> : !s.canSupply && demand.length > 0 ? <span class="muted small">can’t supply</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {o && o.campaigns.length > 0 && (
        <>
          <h4>Campaigns reaching it</h4>
          <ul class="inspect-list">
            {o.campaigns.map((cid: CampaignId) => {
              const camp = v.board.campaigns[cid];
              return camp ? (
                <li key={cid}>
                  <button type="button" class="inspect-row" onClick={() => select({ kind: 'campaign', id: cid })}>
                    <PlayerBadge view={v} id={camp.owner} size={20} />
                    <span class="inspect-row-main">{campaignLine(v, camp)}</span>
                  </button>
                </li>
              ) : null;
            })}
          </ul>
        </>
      )}
    </>
  );
}

const STATUS: Record<string, string> = { open: 'Open', comingSoon: 'Coming soon', derelict: 'Derelict' };

function RestaurantCard({ id, view: v }: { id: RestaurantId; view: GameView }) {
  const r = v.board.restaurants[id];
  const who = me.value;
  // Houses this restaurant would serve (engine outlook per house), nearest first.
  const served = useMemo(() => {
    const out: { houseId: HouseId; distance: number; price: number }[] = [];
    for (const hid of Object.keys(v.board.houses)) {
      const s = outlookFor(v, who, hid)?.sellers.find((x) => x.restaurantId === id);
      if (s) out.push({ houseId: hid, distance: s.distance, price: s.unitPrice });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }, [v, id]);
  if (!r) return null;
  return (
    <>
      <Head eyebrow={`${name(v, r.owner)}’s restaurant`} title={`Restaurant at ${r.x},${r.y}`} id={id} term="restaurant" />
      <div class="inspect-chips">
        <Pill tone={r.status === 'open' ? 'ok' : 'warn'}>{STATUS[r.status] ?? r.status}</Pill>
        <Pill>Entrance {r.entrance}</Pill>
        {r.driveIn && <Pill tone="info">Drive-in: every corner</Pill>}
      </div>
      <h4>Houses it reaches</h4>
      {served.length === 0 ? (
        <p class="muted small">No house is connected by road.</p>
      ) : (
        <ul class="inspect-list">
          {served.slice(0, 10).map((s) => {
            const h = v.board.houses[s.houseId];
            return (
              <li key={s.houseId}>
                <button type="button" class="inspect-row" onClick={() => select({ kind: 'house', id: s.houseId })}>
                  {Icon.home({ size: 16 })}
                  <span class="inspect-row-main">
                    <b>{houseLabel(v, s.houseId)}</b> · {s.distance} away · ${s.price}
                  </span>
                  {h && h.demand.length > 0 && <Goods goods={h.demand.map((d) => d.good)} size={16} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {served.length > 10 && <p class="muted small">+{served.length - 10} more</p>}
    </>
  );
}

function CampaignCard({ id, view: v }: { id: CampaignId; view: GameView }) {
  const camp = v.board.campaigns[id];
  const reached = useMemo(() => campaignReachIds(v, me.value, id), [v, id]);
  if (!camp) return null;
  const pl = camp.placement;
  const where = pl.kind === 'board' ? `${pl.w}×${pl.h} at ${pl.x},${pl.y}` : pl.kind === 'airplane' ? `${pl.side} edge, ${pl.width} wide` : pl.kind === 'rural' ? `rural ${pl.side}` : 'beside the board';
  return (
    <>
      <Head eyebrow={`${name(v, camp.owner)}’s campaign`} title={`${camp.number !== null ? `#${camp.number} ` : ''}${KIND_LABEL[camp.kind] ?? humanize(camp.kind)}`} id={id} term={campaignTermId(camp.kind)} />
      <div class="inspect-chips">
        <Goods goods={camp.goods} size={22} />
        <Pill tone={camp.eternal ? 'ok' : 'neutral'}>{camp.eternal ? 'Eternal' : `${camp.remaining} turn${camp.remaining === 1 ? '' : 's'} left`}</Pill>
        <Pill>{where}</Pill>
      </div>
      <h4>Houses it reaches</h4>
      {reached.length === 0 ? (
        <p class="muted small">No house in reach.</p>
      ) : (
        <div class="chip-row">
          {reached.map((hid) => (
            <button key={hid} type="button" class="chip" onClick={() => select({ kind: 'house', id: hid })}>
              {Icon.home({ size: 14 })} {houseLabel(v, hid)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function SourceCard({ id, view: v }: { id: SourceId; view: GameView }) {
  const s = v.board.drinkSources[id];
  const c = catalog.value;
  const who = me.value;
  // My buyers that could collect here now: how many of their hauls pass this source.
  const buyers = useMemo(() => {
    const out: { label: string; hits: number; total: number }[] = [];
    for (const l of legal.value) {
      if (l.kind !== 'placement' || l.spec.kind !== 'buyerRoute') continue;
      const ps = placementsFor(v, who, l.spec, manifest.value, c).filter((p) => p.kind === 'buyerRoute' && p.route.mode !== 'errand');
      if (!ps.length) continue;
      const hits = ps.filter((p) => p.kind === 'buyerRoute' && p.collects.some((x) => x.sourceId === id)).length;
      out.push({ label: l.label, hits, total: ps.length });
    }
    return out;
  }, [v, id, legal.value]);
  if (!s) return null;
  return (
    <>
      <Head eyebrow="Drink source" title={<span class="row gap">{foodName(c, s.drink as FoodId)}</span>} id={id} term="drink_source" />
      <div class="inspect-chips">
        <FoodIcon food={s.drink as FoodId} size={24} />
        <Pill>Square {s.x},{s.y}</Pill>
      </div>
      <p class="muted small">Cart operators and truck drivers collect from it when their road route passes next to it; zeppelins when they enter its tile.</p>
      {buyers.map((b) => (
        <p key={b.label} class="small">
          {b.label}: <b>{b.hits}</b> of {b.total} hauls collect here.
        </p>
      ))}
    </>
  );
}

function EntityCard({ id, view: v }: { id: string; view: GameView }) {
  const e = v.board.entities[id];
  if (!e) return null;
  const owner = 'owner' in e ? (e.owner as PlayerId) : null;
  const at = 'x' in e ? `${e.x},${e.y}` : 'cells' in e ? `${e.cells.length} squares` : '';
  const notes: string[] = [];
  if (e.kind === 'coffeeShop') notes.push('Sells coffee to passing buyers; counts as a route start for range.');
  if (e.kind === 'park') notes.push(`Houses next to it pay more.${e.printed ? ' Printed on the tile.' : ''}`);
  if (e.kind === 'lobbyistRoad') notes.push(e.underConstruction ? 'Under construction: +1 distance for everyone until it opens.' : 'Open road.');
  return (
    <>
      <Head eyebrow={owner ? `${name(v, owner)}’s` : 'Board piece'} title={humanize(e.kind)} id={id} term={entityTermId(e.kind)} />
      <div class="inspect-chips">{at && <Pill>{at}</Pill>}</div>
      {notes.map((n) => (
        <p key={n} class="muted small">
          {n}
        </p>
      ))}
    </>
  );
}
