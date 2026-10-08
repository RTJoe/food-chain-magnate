/**
 * Event batch → animation plan (animation-plan §1.3, §4.1). Pure and deterministic: no Three, no
 * clock, no signals. The same events, views and mode always give the same plan, so every client
 * shows the same thing (speed and skip are local).
 *
 * Grouping: events become beats, one readable moment each.
 * - House beat (`sale` / `stayedHome`): `houseConsidered` → `sale` | `houseStayedHome`, with the
 *   `coffeeSold`, `cashChanged`, `iouIssued` and `milestoneClaimed` events that follow it (the
 *   engine emits coffee after the sale: houseConsidered → sale → (coffeeSold → cashChanged)* →
 *   cashChanged; pinned by engine/test/rules/dinnertime.test.ts).
 * - Campaign beat: `campaignRan` with its `demandPlaced`, `marketingIncome`, `campaignTicked` /
 *   `campaignExpired`, `marketeerReturned` and `cashChanged`.
 * - One beat per board piece event (placements, opens, moves, map tiles), per buyer haul, per
 *   production; reconciler keys that appeared without an event collapse into one `pop` beat.
 *
 * Pacing: beats are laid out in segments of the same category (dinnertime houses, marketing
 * campaigns, payday, everything else), each with its own cap (§1.3 table). `Beat.at` is the start
 * and `Beat.dur` the budget in which the focal motion must land; tails may run past it.
 */
import type { GameEvent, GameView, PhaseKind, PlayerId } from '@fcm/engine';
import type { PhaseCaption } from '../../state/feedback.js';

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

export type BeatKind =
  // Dinnertime
  | 'sale'
  | 'stayedHome'
  /** Beyond 30 houses: every no-seller house in one beat. */
  | 'stayedHomeGroup'
  | 'tips'
  | 'bankBroke'
  | 'bankrupt'
  // Marketing
  | 'campaign'
  /** `demandPlaced` outside a campaign run (module sources). */
  | 'demand'
  | 'campaignExpired'
  // Goods
  | 'drinks'
  | 'produce'
  | 'discard'
  // Board pieces
  | 'restaurantPlaced'
  | 'restaurantMoved'
  | 'restaurantOpened'
  | 'driveIns'
  | 'houseBuilt'
  | 'gardenAdded'
  | 'campaignPlaced'
  | 'entityPlaced'
  | 'entityRemoved'
  | 'mapTile'
  // Flow / money / end
  | 'salary'
  | 'milestone'
  | 'turn'
  /** `structuresRevealed`: each chain's restaurants pulse in turn order. */
  | 'reveal'
  | 'phase'
  | 'gameStarted'
  | 'gameEnded'
  /** Pieces that appeared without a matching event. */
  | 'pop';

export type Segment = 'dinnertime' | 'marketing' | 'payday' | 'other';

export interface Beat {
  kind: BeatKind;
  /** Stable within the batch: house id, campaign id, piece key, or `${kind}:${n}`. */
  id: string;
  /** Board ids of the focal actors (edge arrow, follow camera, stepper). */
  focal: string[];
  /** Reconciler keys this beat reveals (pop-ins), e.g. `restaurant:r1`. */
  keys: string[];
  /** The events this beat covers, in engine order. */
  events: GameEvent[];
  /** Seconds at 1× before compression. */
  nominal: number;
  /** Planned start, seconds at 1× from the start of the timeline. */
  at: number;
  /** Budget: the focal motion lands by `at + dur`. Tails may run past. */
  dur: number;
  segment: Segment;
}

export type ClosingCaption = Extract<DistributiveOmit<PhaseCaption, 'key'>, { kind: 'done' }>;

export interface Plan {
  /** Phase of the main segment (dinnertime / marketing), else the view's phase. */
  phase: PhaseKind | null;
  mode: 'full' | 'reduced';
  beats: Beat[];
  /** Gap between focal starts of the main segment (dinner houses / campaigns); 0 if none. */
  gap: number;
  /** Planned length: last `at + dur` (seconds at 1×). */
  length: number;
  segments: { segment: Segment; start: number; end: number; gap: number }[];
  closing: ClosingCaption | null;
}

export interface CompileCtx {
  view: GameView | null;
  prevView: GameView | null;
  me?: PlayerId | null;
  mode: 'full' | 'reduced';
  /** Reconciler keys added by this batch (pop beat for keys no event covers). */
  added?: readonly string[];
  /** Only keep beats of these kinds (the registered choreographies). Omit to keep all. */
  kinds?: ReadonlySet<BeatKind>;
}

/** Pacing table (§1.3), seconds at 1×. */
export const PACING = {
  dinnerCap: 12,
  dinnerMinGap: 0.35,
  /** At most this many vans on the road at once (dur ≤ maxVans × gap). */
  maxVans: 4,
  /** Above this many houses, no-seller houses collapse into one beat. */
  groupAbove: 30,
  marketingCap: 8,
  paydayCap: 2.5,
  workingCap: 1.6,
  cleanupCap: 1.5,
  otherCap: 2.5,
  /** Nothing the player must follow plays shorter than this. */
  minReadable: 0.45,
  /** Reduced mode: hold per house / campaign, and per other beat. */
  reducedHold: 0.6,
  reducedOther: 0.3,
} as const;

const NOMINAL: Record<BeatKind, number> = {
  sale: 0.9,
  stayedHome: 0.5,
  stayedHomeGroup: 0.8,
  tips: 0.6,
  bankBroke: 1.0,
  bankrupt: 0.8,
  campaign: 0.8,
  demand: 0.3,
  campaignExpired: 0.6,
  drinks: 0.9,
  produce: 0.9,
  discard: 0.8,
  restaurantPlaced: 0.6,
  restaurantMoved: 0.9,
  restaurantOpened: 0.8,
  driveIns: 0.5,
  houseBuilt: 0.8,
  gardenAdded: 0.6,
  campaignPlaced: 0.8,
  entityPlaced: 0.6,
  entityRemoved: 0.4,
  mapTile: 1.2,
  salary: 1.2,
  milestone: 0.8,
  turn: 0.4,
  reveal: 1.2,
  phase: 0.5,
  gameStarted: 2.5,
  gameEnded: 4,
  pop: 0.4,
};

/** Events folded into the open house beat. */
const HOUSE_TAIL = new Set<GameEvent['type']>(['sale', 'houseStayedHome', 'coffeeSold', 'cashChanged', 'iouIssued', 'milestoneClaimed']);
/** Events folded into the open campaign beat. */
const CAMPAIGN_TAIL = new Set<GameEvent['type']>(['demandPlaced', 'marketingIncome', 'campaignTicked', 'campaignExpired', 'marketeerReturned', 'cashChanged']);

export function compile(events: readonly GameEvent[], ctx: CompileCtx): Plan {
  const reduced = ctx.mode === 'reduced';
  const raw = group(events, ctx);
  let beats = ctx.kinds ? raw.filter((b) => ctx.kinds!.has(b.kind)) : raw;

  // Dinner grouping: beyond 30 houses, every no-seller house goes into one beat at the end.
  const houses = beats.filter((b) => b.kind === 'sale' || b.kind === 'stayedHome');
  if (houses.length > PACING.groupAbove && (!ctx.kinds || ctx.kinds.has('stayedHomeGroup'))) {
    const home = beats.filter((b) => b.kind === 'stayedHome');
    if (home.length) {
      const lastHouse = beats.lastIndexOf(houses[houses.length - 1]!);
      const merged: Beat = {
        kind: 'stayedHomeGroup',
        id: 'stayedHomeGroup',
        focal: home.flatMap((b) => b.focal),
        keys: [],
        events: home.flatMap((b) => b.events),
        nominal: NOMINAL.stayedHomeGroup,
        at: 0,
        dur: 0,
        segment: 'dinnertime',
      };
      const out: Beat[] = [];
      beats.forEach((b, i) => {
        if (b.kind !== 'stayedHome') out.push(b);
        if (i === lastHouse) out.push(merged);
      });
      beats = out;
    }
  }

  if (reduced) for (const b of beats) b.nominal = isMain(b) ? PACING.reducedHold : Math.min(b.nominal, PACING.reducedOther);

  // Segments of consecutive beats of the same category.
  const segs: { segment: Segment; beats: Beat[] }[] = [];
  for (const b of beats) {
    const last = segs[segs.length - 1];
    if (last && last.segment === b.segment) last.beats.push(b);
    else segs.push({ segment: b.segment, beats: [b] });
  }

  const phaseNow = (ctx.prevView ?? ctx.view)?.phase.kind ?? null;
  let t = 0;
  let mainGap = 0;
  const segments: Plan['segments'] = [];
  for (const s of segs) {
    const start = t;
    const gap = layout(s.segment, s.beats, start, phaseNow);
    const end = s.beats.reduce((m, b) => Math.max(m, b.at + b.dur), start);
    // The next segment starts when the last beat of this one starts plus its gap, or its end.
    t = Math.max(end, start);
    segments.push({ segment: s.segment, start, end, gap });
    if (!mainGap && (s.segment === 'dinnertime' || s.segment === 'marketing')) mainGap = gap;
  }

  const length = beats.reduce((m, b) => Math.max(m, b.at + b.dur), 0);
  const phase: PhaseKind | null = beats.some((b) => b.segment === 'dinnertime')
    ? 'dinnertime'
    : beats.some((b) => b.segment === 'marketing')
      ? 'marketing'
      : beats.some((b) => b.segment === 'payday')
        ? 'payday'
        : phaseNow;
  return { phase, mode: ctx.mode, beats, gap: mainGap, length, segments, closing: closingCaption(events) };
}

/** Dinner houses and campaign runs are the "main" focal steps of their phase. */
const isMain = (b: Beat) => b.kind === 'sale' || b.kind === 'stayedHome' || b.kind === 'campaign';

/** Lay out one segment's beats from `start`; returns the focal gap used. */
function layout(segment: Segment, beats: Beat[], start: number, phase: PhaseKind | null): number {
  const n = beats.length;
  const sum = beats.reduce((s, b) => s + b.nominal, 0);
  if (segment === 'dinnertime') {
    if (sum <= PACING.dinnerCap) return sequential(beats, start);
    // The last house must land by the cap: (n - 1) gaps plus its own beat.
    const gap = Math.max(PACING.dinnerMinGap, (PACING.dinnerCap - beats[n - 1]!.nominal) / Math.max(1, n - 1));
    beats.forEach((b, i) => {
      b.at = start + i * gap;
      b.dur = Math.max(Math.min(b.nominal, PACING.minReadable), Math.min(b.nominal, PACING.maxVans * gap));
    });
    return gap;
  }
  if (segment === 'marketing') {
    if (sum <= PACING.marketingCap) return sequential(beats, start);
    const gap = (PACING.marketingCap - beats[n - 1]!.nominal) / Math.max(1, n - 1);
    beats.forEach((b, i) => {
      b.at = start + i * gap;
      b.dur = b.nominal;
    });
    return gap;
  }
  if (segment === 'payday') {
    // Salary beats overlap 50%.
    let t = start;
    for (const b of beats) {
      b.at = t;
      b.dur = b.nominal;
      t += b.nominal * 0.5;
    }
    const len = beats.reduce((m, b) => Math.max(m, b.at + b.dur), start) - start;
    if (len > PACING.paydayCap) compress(beats, start, PACING.paydayCap / len);
    return n ? (beats[n - 1]!.nominal * 0.5) : 0;
  }
  // Other: sequential at nominal; the batch cap depends on the phase (game start / end uncapped).
  const cap = beats.some((b) => b.kind === 'gameStarted' || b.kind === 'gameEnded')
    ? Infinity
    : phase === 'working'
      ? PACING.workingCap
      : phase === 'cleanup'
        ? PACING.cleanupCap
        : PACING.otherCap;
  sequential(beats, start);
  if (sum > cap) compress(beats, start, cap / sum);
  return 0;
}

function sequential(beats: Beat[], start: number): number {
  let t = start;
  for (const b of beats) {
    b.at = t;
    b.dur = b.nominal;
    t += b.nominal;
  }
  return beats.length ? beats[0]!.nominal : 0;
}

/** Scale starts by `f` from `start`; durations shrink too but not below the readable minimum. */
function compress(beats: Beat[], start: number, f: number): void {
  for (const b of beats) {
    b.at = start + (b.at - start) * f;
    b.dur = Math.max(Math.min(b.nominal, PACING.minReadable), b.dur * f);
  }
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function group(events: readonly GameEvent[], ctx: CompileCtx): Beat[] {
  const beats: Beat[] = [];
  const counts = new Map<string, number>();
  const covered = new Set<string>();
  let open: { beat: Beat; type: 'house' | 'campaign'; id: string } | null = null;

  const make = (kind: BeatKind, segment: Segment, id: string | null, e: GameEvent, focal: string[] = [], keys: string[] = []): Beat => {
    const n = counts.get(kind) ?? 0;
    counts.set(kind, n + 1);
    const b: Beat = { kind, id: id ?? `${kind}:${n}`, focal, keys, events: [e], nominal: NOMINAL[kind], at: 0, dur: 0, segment };
    for (const k of keys) covered.add(k);
    beats.push(b);
    return b;
  };
  const campaign = (id: string) => ctx.prevView?.board.campaigns[id] ?? ctx.view?.board.campaigns[id];

  for (const e of events) {
    // Fold into the open house / campaign beat.
    if (open?.type === 'house' && HOUSE_TAIL.has(e.type)) {
      const sameHouse = !('houseId' in e) || e.houseId === open.id;
      const fresh = (e.type === 'sale' || e.type === 'houseStayedHome') && open.beat.events.some((x) => x.type === 'sale' || x.type === 'houseStayedHome');
      if (sameHouse && !fresh) {
        open.beat.events.push(e);
        if (e.type === 'sale') {
          open.beat.kind = 'sale';
          open.beat.nominal = saleNominal(e);
          if (!open.beat.focal.includes(e.restaurantId)) open.beat.focal.push(e.restaurantId);
        }
        continue;
      }
    }
    if (open?.type === 'campaign' && CAMPAIGN_TAIL.has(e.type)) {
      const cid = 'campaignId' in e ? e.campaignId : open.id;
      if (cid === open.id || e.type === 'cashChanged' || e.type === 'marketeerReturned') {
        open.beat.events.push(e);
        if (e.type === 'demandPlaced' && !open.beat.focal.includes(e.houseId)) open.beat.focal.push(e.houseId);
        continue;
      }
    }
    open = null;
    switch (e.type) {
      case 'houseConsidered':
      case 'sale':
      case 'houseStayedHome': {
        const kind: BeatKind = e.type === 'sale' ? 'sale' : 'stayedHome';
        const focal = e.type === 'sale' ? [e.houseId, e.restaurantId] : [e.houseId];
        const b = make(kind, 'dinnertime', e.houseId, e, focal);
        if (e.type === 'sale') b.nominal = saleNominal(e);
        open = { beat: b, type: 'house', id: e.houseId };
        break;
      }
      case 'campaignRan': {
        const c = campaign(e.campaignId);
        const b = make('campaign', 'marketing', e.campaignId, e, [e.campaignId, ...(e.reached ?? [])]);
        if (c?.kind === 'airplane') b.nominal = 1.3;
        open = { beat: b, type: 'campaign', id: e.campaignId };
        break;
      }
      case 'demandPlaced':
        make('demand', 'marketing', null, e, [e.houseId]);
        break;
      case 'campaignExpired':
        make('campaignExpired', 'other', null, e, [e.campaignId]);
        break;
      case 'drinksBought': {
        const b = make('drinks', 'other', null, e, e.collected.flatMap((c) => (c.sourceId ? [c.sourceId] : [])));
        b.nominal = drinksNominal(e);
        break;
      }
      case 'foodProduced':
        make('produce', 'other', null, e, [e.player]);
        break;
      case 'foodDiscarded':
        make('discard', 'other', null, e, [e.player]);
        break;
      case 'restaurantPlaced':
        make('restaurantPlaced', 'other', `restaurant:${e.restaurantId}`, e, [e.restaurantId], [`restaurant:${e.restaurantId}`]);
        break;
      case 'restaurantMoved':
        make('restaurantMoved', 'other', `restaurant:${e.restaurantId}`, e, [e.restaurantId], [`restaurant:${e.restaurantId}`]);
        break;
      case 'restaurantOpened':
        make('restaurantOpened', 'other', null, e, [e.restaurantId]);
        break;
      case 'driveInsOpened': {
        const b = make('driveIns', 'other', null, e, [...e.restaurantIds]);
        b.nominal = NOMINAL.driveIns * Math.max(1, e.restaurantIds.length);
        break;
      }
      case 'houseBuilt':
        make('houseBuilt', 'other', `house:${e.houseId}`, e, [e.houseId], [`house:${e.houseId}`, `garden:${e.houseId}`]);
        break;
      case 'gardenAdded':
        make('gardenAdded', 'other', `garden:${e.houseId}`, e, [e.houseId], [`garden:${e.houseId}`]);
        break;
      case 'campaignPlaced': {
        const b = make('campaignPlaced', 'other', `campaign:${e.campaign.id}`, e, [e.campaign.id], [`campaign:${e.campaign.id}`]);
        if (e.campaign.kind === 'airplane') b.nominal = 1.0;
        break;
      }
      case 'entityPlaced':
        make('entityPlaced', 'other', `entity:${e.entity.id}`, e, [e.entity.id], [`entity:${e.entity.id}`]);
        break;
      case 'entityRemoved':
        make('entityRemoved', 'other', null, e, [e.entityId]);
        break;
      case 'mapTileAdded':
        make('mapTile', 'other', null, e);
        break;
      case 'tipsPaid':
        make('tips', 'other', null, e, [e.player]);
        break;
      case 'bankBroke':
        make('bankBroke', 'other', null, e);
        break;
      case 'bankrupt':
        make('bankrupt', 'other', null, e, [e.player]);
        break;
      case 'salaryPaid':
        make('salary', 'payday', null, e, [e.player]);
        break;
      case 'milestoneClaimed':
        make('milestone', 'other', null, e, [e.player]);
        break;
      case 'turnStarted':
        make('turn', 'other', null, e, [e.player]);
        break;
      case 'phaseChanged':
        make('phase', 'other', null, e);
        break;
      case 'structuresRevealed':
        make('reveal', 'other', null, e);
        break;
      case 'gameStarted':
        make('gameStarted', 'other', null, e);
        break;
      case 'gameEnded':
        make('gameEnded', 'other', null, e, [...e.ranking.slice(0, 1)]);
        break;
      default:
        break;
    }
  }

  // Pieces that appeared without a matching event (module pieces, snapshots mid-batch).
  const loose = (ctx.added ?? []).filter((k) => !covered.has(k) && !k.startsWith('demand:'));
  if (loose.length) {
    beats.push({ kind: 'pop', id: 'pop', focal: [], keys: loose, events: [], nominal: NOMINAL.pop, at: 0, dur: 0, segment: 'other' });
  }
  return beats;
}

/**
 * Delivery van trip at 1× for a route of `length` world units: a speed the eye can follow
 * (~8 units/s cruising), 0.45–1.8 s. Long cross-town routes would streak at the plan's 1.2 s.
 */
export function deliveryTrip(length: number): number {
  return Math.min(1.8, Math.max(0.45, 0.3 + length / 8));
}

/** A sale beat: the van's trip plus the drop at the house; never under the 0.9 s per-house nominal. */
function saleNominal(e: Ev<'sale'>): number {
  const r = e.route;
  const units = r ? r.path.length + 1 + (r.exit ? 3 : 0) : 0;
  return Math.max(NOMINAL.sale, deliveryTrip(units) + 0.35);
}

/** Buyer haul: 0.5 s + 0.3 s per unit of path, 0.9–1.6 s (errand 0.9). */
function drinksNominal(e: Ev<'drinksBought'>): number {
  const r = e.route;
  const units = r?.mode === 'road' ? r.path.length : r?.mode === 'air' ? r.tiles.length * 2 : e.path.length;
  if (!units) return NOMINAL.drinks;
  return Math.min(1.6, Math.max(0.9, 0.5 + 0.3 * units));
}

/** The phase summary caption for a batch (Dinnertime / Marketing), or null. */
export function closingCaption(events: readonly GameEvent[]): ClosingCaption | null {
  const houses = new Map<string, { sale: boolean; home: boolean }>();
  const runs = new Set<string>();
  for (const e of events) {
    if (e.type === 'houseConsidered' || e.type === 'sale' || e.type === 'houseStayedHome') {
      const h = houses.get(e.houseId) ?? { sale: false, home: false };
      if (e.type === 'sale') h.sale = true;
      if (e.type === 'houseStayedHome') h.home = true;
      houses.set(e.houseId, h);
    } else if (e.type === 'campaignRan') runs.add(e.campaignId);
  }
  if (houses.size) {
    const all = [...houses.values()];
    return { kind: 'done', phase: 'dinnertime', sales: all.filter((h) => h.sale).length, stayedHome: all.filter((h) => h.home && !h.sale).length, campaigns: 0 };
  }
  if (runs.size) return { kind: 'done', phase: 'marketing', sales: 0, stayedHome: 0, campaigns: runs.size };
  return null;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
