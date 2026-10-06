/**
 * Campaigns (ux-plan §3.2): token first (number, size, kind; unavailable tokens dimmed with the
 * reason), then the board (campaign mode narrowed to that token: R / Rotate flips the orientation,
 * the ghost previews the reach), then confirm. Good and duration stay editable while a spot is
 * staged; a pick made before the good is chosen is held until it is.
 */
import { useSignal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import type { CampaignKind, FoodId, GameView, MarketingTileDef, MilestoneId, Placement, PlacementSpec, PlayerId } from '@fcm/engine';
import { describePlacement, needsGoods } from '../../state/actions.js';
import { boardRenderer } from '../../state/boardBridge.js';
import type { Catalog } from '../../state/catalog.js';
import { foodName } from '../../state/catalog.js';
import { boardModeFor, placementsByToken, placementsFor, problemAt, type CampaignPlacementT } from '../../state/guidance.js';
import { inspectIds, previewGood } from '../../state/interaction.js';
import { catalog, manifest, me, myPlayer, settings, view } from '../../state/store.js';
import { Button, Pill, Stepper } from '../common.js';
import { Icon } from '../icons.js';
import { BoardHint, commitPlacement, FlowHead, GoodChips, listOnly, marketableFoods, NoSpots, PlacementRows, playerColor, useBoardMode, useMirror } from './shared.js';
import type { FlowProps } from './types.js';

export const KIND_LABEL: Record<CampaignKind, string> = {
  billboard: 'Billboard',
  mailbox: 'Mailbox',
  airplane: 'Airplane',
  radio: 'Radio',
  giantBillboard: 'Giant billboard',
  gourmetGuide: 'Gourmet guide',
};

export interface TokenInfo {
  number: number;
  kind: CampaignKind;
  def: MarketingTileDef | null;
  spots: CampaignPlacementT[];
  /** Why the token cannot be used now (null = usable). */
  reason: string | null;
}

/** "3×2", "5 wide", "1×1", "side" (giant billboard), "rim" (gourmet guide). */
export function tokenSize(t: Pick<TokenInfo, 'kind' | 'def'>): string {
  const d = t.def;
  if (t.kind === 'airplane') return `${d?.width ?? d?.w ?? 1} wide`;
  if (t.kind === 'giantBillboard') return 'rural side';
  if (!d || d.w <= 0 || d.h <= 0) return 'beside the board';
  return `${d.w}×${d.h}`;
}

/** Small footprint glyph: squares for board tiles, a strip with a nose for airplanes. */
export function TokenGlyph({ kind, def }: { kind: CampaignKind; def: MarketingTileDef | null }) {
  const cell = 8;
  if (kind === 'airplane') {
    const n = def?.width ?? def?.w ?? 1;
    const w = 5 * cell + 6;
    return (
      <svg class="token-glyph" width={w} height={cell * 2} viewBox={`0 0 ${w} ${cell * 2}`} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={i * cell + 1} y={cell / 2} width={cell - 2} height={cell - 2} rx="1.5" class={i < n ? 'on' : 'off'} />
        ))}
        <path d={`M${5 * cell + 1} ${cell / 2} l5 ${cell / 2 - 1} l-5 ${cell / 2 - 1}z`} class="on" />
      </svg>
    );
  }
  const w = def && def.w > 0 ? def.w : 1;
  const h = def && def.h > 0 ? def.h : 1;
  if (!def || def.w <= 0) {
    return <span class="token-glyph token-glyph-icon">{Icon.star({ size: 16 })}</span>;
  }
  return (
    <svg class="token-glyph" width={w * cell + 2} height={h * cell + 2} viewBox={`0 0 ${w * cell + 2} ${h * cell + 2}`} aria-hidden="true">
      {Array.from({ length: w * h }, (_, i) => (
        <rect key={i} x={(i % w) * cell + 1} y={Math.floor(i / w) * cell + 1} width={cell - 1.5} height={cell - 1.5} rx="1.5" class="on" />
      ))}
    </svg>
  );
}

const isOn = (module: string, v: GameView) => module === 'base' || v.config.modules.includes(module as never);

/** Engine reason for a token with no legal spot: the most common `placementProblem` over a sample of spots. */
function noSpotReason(v: GameView, who: PlayerId | null, spec: PlacementSpec, kind: CampaignKind, def: MarketingTileDef | null, n: number): string {
  const tries: Placement[] = [];
  if (kind === 'airplane') {
    const width = (def?.width ?? def?.w ?? 1) as 1 | 3 | 5;
    for (const side of ['N', 'E', 'S', 'W'] as const) tries.push({ kind: 'campaign', campaignKind: kind, tileNumber: n, placement: { kind: 'airplane', side, offset: 0, width } });
  } else if (def && def.w > 0 && def.h > 0) {
    for (let y = 0; y + def.h <= v.board.h; y += 3) {
      for (let x = 0; x + def.w <= v.board.w; x += 3) tries.push({ kind: 'campaign', campaignKind: kind, tileNumber: n, placement: { kind: 'board', x, y, w: def.w, h: def.h } });
    }
  }
  const counts = new Map<string, number>();
  for (const cand of tries.slice(0, 48)) {
    const msg = problemAt(v, who, { ...spec, tileNumber: n }, cand);
    if (msg) counts.set(msg, (counts.get(msg) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'No legal spot for this token right now';
}

/** Token cards for the allowed kinds, in number order, with spots and reasons. */
export function tokensFor(v: GameView, c: Catalog, who: PlayerId | null, spec: PlacementSpec, kinds: readonly CampaignKind[], byToken: Map<number, CampaignPlacementT[]>): TokenInfo[] {
  const players = v.turnOrder.length;
  const out = new Map<number, TokenInfo>();
  for (const def of Object.values(c.marketingTiles)) {
    if (!def || !kinds.includes(def.kind) || !isOn(def.module, v) || (def.minPlayers ?? 0) > players) continue;
    out.set(def.number, { number: def.number, kind: def.kind, def, spots: byToken.get(def.number) ?? [], reason: null });
  }
  for (const [n, spots] of byToken) {
    if (!out.has(n) && spots[0]) out.set(n, { number: n, kind: spots[0].campaignKind, def: c.marketingTiles[n] ?? null, spots, reason: null });
  }
  const campaigns = Object.values(v.board.campaigns);
  for (const t of out.values()) {
    if (t.spots.length) continue;
    const inUse = campaigns.find((x) => x.number === t.number);
    if (inUse) {
      const owner = v.players[inUse.owner]?.name ?? inUse.owner;
      t.reason = `On the board: ${owner}'s, ${inUse.eternal ? 'eternal' : `${inUse.remaining} turn${inUse.remaining === 1 ? '' : 's'} left`}`;
    } else if (!v.marketingTiles.includes(t.number)) t.reason = 'Not available in this game';
    else t.reason = noSpotReason(v, who, spec, t.kind, t.def, t.number);
  }
  return [...out.values()].sort((a, b) => a.number - b.number);
}

/** Whether `kind` campaigns launched by the player now become eternal (milestone effect). */
function launchesEternal(c: Catalog, v: GameView, who: PlayerId | null, kind: CampaignKind): boolean {
  const p = who ? v.players[who] : undefined;
  if (!p) return false;
  return Object.keys(p.milestones).some((id) => c.milestones[id as MilestoneId]?.effects.some((e) => e.kind === 'eternalCampaigns' && (!e.campaignKinds || e.campaignKinds.includes(kind))));
}

export function CampaignFlow({ legal, placements, onDone, onCancel }: FlowProps) {
  const v = view.value;
  const c = catalog.value;
  const who = me.value;
  const card = legal.cardUid ? myPlayer.value?.employees[legal.cardUid] : undefined;
  const ability = card ? c.employees[card.employeeId]?.ability : undefined;
  const marketing = ability?.kind === 'marketing' ? ability : null;
  const maxDuration = marketing?.maxDuration ?? 1;
  const wantsGoods = needsGoods(legal);
  const second = legal.actionType === 'ketchup:newMilestones.placeSecondCampaign';
  const choice = second && v ? v.pending.find((x) => x.id === legal.spec.choiceId) : undefined;
  const firstCampaign = choice?.kind === 'secondCampaign' ? v?.board.campaigns[choice.campaignId] : undefined;

  // "Launch a campaign" (no kind in the spec): every kind the card may launch, one engine query each.
  const camps = useMemo(() => {
    const merged = !legal.spec.campaignKind && marketing && v ? marketing.campaigns.flatMap((k) => placementsFor(v, who, { ...legal.spec, campaignKind: k }, manifest.value, c)) : placements;
    return merged.filter((p): p is CampaignPlacementT => p.kind === 'campaign');
  }, [placements]);
  const byToken = useMemo(() => placementsByToken(camps), [camps]);
  const kinds = useMemo<CampaignKind[]>(() => {
    if (legal.spec.campaignKind) return [legal.spec.campaignKind];
    if (firstCampaign) return [firstCampaign.kind];
    if (marketing) return marketing.campaigns;
    return [...new Set(camps.map((p) => p.campaignKind))];
  }, [legal, camps]);
  const tokens = useMemo(() => (v ? tokensFor(v, c, who, legal.spec, kinds, byToken) : []), [v, byToken, kinds]);
  const usable = tokens.filter((t) => t.spots.length > 0);

  const token = useSignal<number | null>(usable.length === 1 ? (usable[0]?.number ?? null) : null);
  const good = useSignal<FoodId | null>(null);
  const duration = useSignal(maxDuration);
  const held = useSignal<Placement | null>(null);
  useMirror(good.value, (g) => (previewGood.value = g), null);
  // Second campaign: ring the first one while choosing.
  useEffect(() => {
    if (!firstCampaign) return;
    inspectIds.value = [firstCampaign.id];
    return () => (inspectIds.value = []);
  }, [firstCampaign?.id]);

  const chosen = tokens.find((t) => t.number === token.value) ?? null;
  const spots = chosen?.spots ?? [];
  const boardSpots = useMemo(() => (boardRenderer.value === '3d' ? spots.filter((p) => !listOnly(p)) : []), [spots]);
  const offBoard = spots.filter((p) => listOnly(p));
  const mode = useMemo(
    // The board opens once the good is chosen too, so the phone sheet never collapses over the good chips.
    () => (chosen && boardSpots.length && !held.value && (!wantsGoods || good.value) ? boardModeFor(legal, boardSpots, { color: playerColor(), tileNumber: chosen.number, label: `#${chosen.number} ${KIND_LABEL[chosen.kind].toLowerCase()} ${tokenSize(chosen)}` }) : null),
    [chosen?.number, boardSpots, held.value, good.value],
  );

  const opts = () => ({ ...(good.value ? { goods: [good.value] } : {}), duration: duration.value });
  const pick = (p: Placement) => {
    if (wantsGoods && !good.value) {
      held.value = p;
      return;
    }
    if (commitPlacement(legal, p, opts())) onDone();
  };
  useBoardMode(mode, {
    onPlacement: pick,
    // Esc / Cancel on the board: back to the token picker (the head's Cancel leaves the flow).
    onCancel: () => (token.value === null || usable.length <= 1 ? onCancel() : (token.value = null)),
  });

  const chooseToken = (n: number) => {
    held.value = null;
    token.value = token.value === n ? null : n;
    // The row turns compact: keep the chosen token in view.
    requestAnimationFrame(() => document.querySelector('.token-card.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  };

  // List fallback: the chosen token's spots, or every spot grouped by token (placementList).
  const listAll = settings.value.placementList;
  const listFor = (list: CampaignPlacementT[]) => (listAll ? list : list.filter((p) => listOnly(p) || boardRenderer.value !== '3d'));
  const eternal = chosen ? launchesEternal(c, v ?? ({} as GameView), who, chosen.kind) : false;

  return (
    <div class="flow campaign-flow">
      <FlowHead title={legal.label} onCancel={onCancel} />
      {firstCampaign && (
        <p class="muted small">
          Same kind, good and duration as campaign #{firstCampaign.number} ({KIND_LABEL[firstCampaign.kind].toLowerCase()}, {firstCampaign.goods.map((g) => foodName(c, g).toLowerCase()).join(' + ')}), ringed on the board.
        </p>
      )}
      <div class="flow-step">
        <span class="field-label">1 · Token</span>
        {tokens.length === 0 ? (
          <NoSpots>No marketing tile of this kind is left.</NoSpots>
        ) : (
          <div class={`token-row ${chosen ? 'is-compact' : ''}`} role="radiogroup" aria-label="Marketing tile">
            {tokens.map((t) => {
              const on = t.number === token.value;
              return (
                <button
                  key={t.number}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  class={`token-card ${on ? 'is-on' : ''} ${t.reason ? 'is-dim' : ''}`}
                  data-tutorial={`token-${t.number}`}
                  disabled={Boolean(t.reason)}
                  title={t.reason ?? `${t.spots.length} legal spot${t.spots.length === 1 ? '' : 's'}`}
                  onClick={() => chooseToken(t.number)}
                >
                  <span class="token-top">
                    <span class="token-num">#{t.number}</span>
                    <TokenGlyph kind={t.kind} def={t.def} />
                  </span>
                  <span class="token-kind">
                    {KIND_LABEL[t.kind]} <span class="muted">{tokenSize(t)}</span>
                  </span>
                  <span class="token-note">{t.reason ?? `${t.spots.length} spot${t.spots.length === 1 ? '' : 's'}`}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {wantsGoods && (
        <div class="flow-options">
          <span class="field-label">2 · Advertise</span>
          <GoodChips foods={marketableFoods()} value={good.value} onChange={(f) => (good.value = f)} />
          {legal.actionType === 'work.placeCampaign' && (
            <label class="field-inline" data-tutorial="duration">
              <span class="field-label">Duration</span>
              {eternal ? (
                <Pill tone="ok" icon="star">
                  Eternal (milestone)
                </Pill>
              ) : maxDuration > 1 ? (
                <>
                  <Stepper label="turns" value={duration.value} min={1} max={maxDuration} onChange={(n) => (duration.value = n)} />
                  <span class="muted small">max {maxDuration}</span>
                </>
              ) : (
                <span class="muted small">1 turn</span>
              )}
            </label>
          )}
        </div>
      )}

      {held.value && (
        <div class="held-pick">
          <span>
            {Icon.pin({ size: 16 })} {describePlacement(held.value, v)}
          </span>
          {!good.value && <span class="org-warn small">Choose what to advertise.</span>}
          <div class="row gap">
            <Button size="sm" variant="ghost" onClick={() => (held.value = null)}>
              Pick again
            </Button>
            <Button size="sm" variant="primary" icon="check" disabled={wantsGoods && !good.value} onClick={() => held.value && pick(held.value)}>
              Launch #{(held.value as CampaignPlacementT).tileNumber}
            </Button>
          </div>
        </div>
      )}

      {chosen && !held.value && (
        <>
          {boardSpots.length > 0 && (
            <BoardHint count={boardSpots.length}>
              {wantsGoods ? '3 · ' : '2 · '}Pick a spot on the board{chosen.def && chosen.def.w !== chosen.def.h && chosen.kind !== 'airplane' ? '; R or Rotate turns it' : ''}.
            </BoardHint>
          )}
          {offBoard.length > 0 && (
            <div class="row gap">
              {offBoard.map((p, i) => (
                <Button key={i} variant="primary" icon="pin" class="placement-btn" onClick={() => pick(p)}>
                  Place #{chosen.number} {describePlacement(p, v).replace(/^Tile #\d+ /, '')}
                </Button>
              ))}
            </div>
          )}
          <PlacementRows placements={listFor(spots).filter((p) => !offBoard.includes(p))} onPick={pick} />
        </>
      )}
      {!chosen && listAll && usable.length > 0 && (
        <div class="token-groups">
          {usable.map((t) => (
            <section key={t.number}>
              <span class="field-label">
                #{t.number} · {KIND_LABEL[t.kind]} {tokenSize(t)}
              </span>
              <PlacementRows placements={t.spots} onPick={pick} />
            </section>
          ))}
        </div>
      )}
      {!chosen && !listAll && usable.length > 0 && <p class="muted small">Pick a token to see where it can go.</p>}
    </div>
  );
}

