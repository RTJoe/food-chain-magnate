import { useEffect } from "preact/hooks";
import type { GameView } from "@fcm/engine";
import { PHASE_STEPS, phaseIndex, phaseLabel } from "../state/selectors.js";
import { connection, mode, view } from "../state/store.js";
import { IconButton, PlayerBadge } from "./common.js";
import { MotionLayer, RollingCash } from "./motion.js";
import { Icon, Logo, MarkToken } from "./icons.js";
import { BankStack } from "./money.js";
import { playerColorFor, seatColor } from "../theme.js";
import { requestTotems, totemImages, totemKey } from "../state/totems.js";
import { phaseTermId } from "./glossary/index.js";
import { WhatsThis, whatsThisKeys } from "./glossary/WhatsThis.js";
import { whatsThis } from "./glossary/api.js";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const v = view.value;
  if (!v) return null;
  const idx = phaseIndex(v.phase.kind);
  const setup = idx < 0;
  return (
    <header class="topbar glass" role="banner">
      <button
        type="button"
        class="topbar-brand"
        onClick={onMenu}
        aria-label="Game menu"
      >
        <Logo size={34} />
      </button>
      {v.round > 0 && (
        <div class="topbar-round" title="Round">
          <span class="eyebrow">Round</span>
          <b>{v.round}</b>
        </div>
      )}
      <PhaseStepper view={v} idx={idx} setup={setup} />
      <BankChip view={v} />
      <TurnTrack view={v} />
      {mode.value === "online" && (
        <span
          class={`conn conn-${connection.value}`}
          title={`Connection: ${connection.value}`}
        >
          {connection.value === "open"
            ? Icon.wifi({ size: 16 })
            : Icon.wifiOff({ size: 16 })}
        </span>
      )}
      <IconButton
        class="topbar-menu"
        icon="settings"
        label="Menu"
        onClick={onMenu}
      />
      <MotionLayer />
    </header>
  );
}

function PhaseStepper({
  view: v,
  idx,
  setup,
}: {
  view: GameView;
  idx: number;
  setup: boolean;
}) {
  return (
    <nav class="phases" aria-label="Phases">
      <span class="phase-current">
        {phaseLabel(v.phase)}
        <WhatsThis
          id={phaseTermId(v.phase.kind)}
          class="phase-wt wt-btn-light"
        />
      </span>
      {setup ? (
        <span class="phase-setup">{Icon.flag({ size: 16 })} Setup</span>
      ) : (
        <ol class="phase-steps">
          {PHASE_STEPS.map((s, i) => (
            <li
              key={s.label}
              class={`is-wt ${i < idx ? "is-done" : i === idx ? "is-now" : ""}`}
              aria-current={i === idx ? "step" : undefined}
              title={`${s.label}: what’s this?`}
              tabIndex={0}
              onClick={(e) =>
                whatsThis(phaseTermId(s.kinds[0]!), e.currentTarget)
              }
              {...whatsThisKeys(phaseTermId(s.kinds[0]!))}
            >
              {Icon[s.icon]({ size: 16 })}
              <span class="phase-name">{s.short}</span>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

/** The bank: a stack of notes and the cash left; bank breaks and the reserve as sage badges. */
function BankChip({ view: v }: { view: GameView }) {
  const b = v.bank;
  return (
    <div
      class={`bank is-wt ${b.breaks > 0 ? "is-broken" : ""}`}
      data-tutorial="bank"
      data-flip="bank"
      title={`Bank: $${b.cash}${b.reserveOpened ? " (reserve opened)" : ""}. What’s a bank break?`}
      tabIndex={0}
      onClick={(e) => whatsThis("bank_break", e.currentTarget)}
      {...whatsThisKeys("bank_break")}
    >
      <BankStack size={30} />
      <RollingCash amount={b.cash} />
      <span class="bank-breaks" aria-label={`${b.breaks} of 2 bank breaks`}>
        <i class={b.breaks >= 1 ? "is-on" : ""}>1</i>
        <i class={b.breaks >= 2 ? "is-on" : ""}>2</i>
      </span>
      {b.reserveOpened && <span class="bank-reserve">reserve in</span>}
    </div>
  );
}

const TRACK_SLOTS = 6;

/**
 * Turn-order track (docs/art-bible.md §4; se-turn-order-track.jpg): a cream strip with a chrome
 * edge and recessed slots under coral numbers, each holding that chain's turn-order totem (a
 * snapshot of the 3D model, state/totems.ts) or, without WebGL, the player's badge. Positions the
 * game does not use carry the red X.
 */
function TurnTrack({ view: v }: { view: GameView }) {
  const active = new Set(v.awaiting.players);
  const entries = v.turnOrder.map((id) => {
    const p = v.players[id];
    const chain = p?.chain ?? playerColorFor(p?.color)?.id;
    const color = seatColor(p?.color) ?? playerColorFor(p?.color)?.base;
    return { id, entry: chain && color ? { chain, color } : null };
  });
  const sig = entries.map((e) => (e.entry ? totemKey(e.entry) : "")).join("|");
  useEffect(
    () => requestTotems(entries.flatMap((e) => (e.entry ? [e.entry] : []))),
    [sig],
  );
  const imgs = totemImages.value;
  const unused = Math.max(0, TRACK_SLOTS - v.turnOrder.length);
  return (
    <ol class="track" aria-label="Turn order">
      {entries.map(({ id, entry }, i) => {
        const src = entry ? imgs[totemKey(entry)] : undefined;
        return (
          <li
            key={id}
            class={`track-slot ${active.has(id) ? "is-active" : ""}`}
            data-flip={`order:${id}`}
            data-player={id}
            data-active={active.has(id) ? "true" : undefined}
            title={`${i + 1}. ${v.players[id]?.name ?? id}`}
          >
            <span class="track-num" aria-hidden="true">
              {i + 1}
            </span>
            <span class="track-well">
              {src ? (
                <img class="track-totem" src={src} alt="" />
              ) : (
                <PlayerBadge view={v} id={id} size={26} ring={active.has(id)} />
              )}
            </span>
            {src && (
              <span class="track-mark">
                <PlayerBadge view={v} id={id} size={15} />
              </span>
            )}
            <span class="sr-only">
              {i + 1}. {v.players[id]?.name ?? id}
              {active.has(id) ? " (to act)" : ""}
            </span>
          </li>
        );
      })}
      {Array.from({ length: unused }, (_, k) => (
        <li key={`x${k}`} class="track-slot is-unused" aria-hidden="true">
          <span class="track-num">{v.turnOrder.length + k + 1}</span>
          <span class="track-well">
            <MarkToken kind="x" size={18} />
          </span>
        </li>
      ))}
    </ol>
  );
}
