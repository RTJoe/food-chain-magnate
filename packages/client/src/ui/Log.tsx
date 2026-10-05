/** Game log (architecture §5.4 Log): readable lines from engine events, newest at the bottom. */
import { useEffect, useRef } from 'preact/hooks';
import type { LogIcon } from '../state/log.js';
import type { ComponentChildren } from 'preact';
import type { GameView } from '@fcm/engine';
import { selectionKindOf } from '../state/boardBridge.js';
import { cameraCommand, select } from '../state/interaction.js';
import { log, view } from '../state/store.js';
import { Empty, PlayerBadge } from './common.js';
import { Icon, type IconName } from './icons.js';

const ICONS: Record<LogIcon, IconName> = {
  phase: 'flag',
  round: 'play',
  hire: 'users',
  train: 'sparkle',
  fire: 'x',
  food: 'dinner',
  cash: 'cash',
  board: 'map',
  campaign: 'marketing',
  milestone: 'star',
  bank: 'bank',
  turn: 'arrowRight',
  secret: 'eyeOff',
  trophy: 'trophy',
  info: 'info',
};

export function Log() {
  const lines = log.value;
  const v = view.value;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines.length]);
  if (!lines.length) return <Empty icon="log">Nothing has happened yet.</Empty>;
  return (
    <ol class="log" ref={list} aria-live="polite">
      {lines.map((l) => (
        <li key={l.id} class={`log-line ${l.header ? 'is-header' : ''} log-${l.icon}`}>
          {v && l.player && v.players[l.player] ? <PlayerBadge view={v} id={l.player} size={18} /> : <span class="log-icon">{Icon[ICONS[l.icon]]({ size: 14 })}</span>}
          <span>{v ? linkify(l.text, v) : l.text}</span>
          {v && <TargetsButton ids={l.targets} />}
        </li>
      ))}
    </ol>
  );
}

/** Select a board piece and centre the camera on it. */
function focusPiece(kind: 'house' | 'restaurant' | 'campaign', id: string): void {
  select({ kind, id });
  cameraCommand.value = { kind: 'focus', ids: [id] };
}

const HOUSE_REF = /\b([Hh]ouse) (\d+(?:\.\d+)?|π|\d*¾)/g;

/** Turn "house 12" in a log line into a link that selects the house and focuses the camera. */
function linkify(text: string, v: GameView): ComponentChildren {
  const byLabel = new Map(Object.values(v.board.houses).map((h) => [h.label, h.id]));
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(HOUSE_REF)) {
    const id = byLabel.get(m[2] ?? '');
    if (!id || m.index === undefined) continue;
    out.push(text.slice(last, m.index));
    out.push(
      <button key={m.index} type="button" class="log-link" onClick={() => focusPiece('house', id)}>
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (!out.length) return text;
  out.push(text.slice(last));
  return out;
}

/** "Show on board" for a line's pieces (state/log.ts `targets`): selects the first and frames all. */
function TargetsButton({ ids }: { ids: string[] | undefined }) {
  const live = (ids ?? []).filter((id) => selectionKindOf(id) !== null);
  if (!live.length) return null;
  return (
    <button
      type="button"
      class="log-show"
      title="Show on the board"
      aria-label="Show on the board"
      onClick={() => {
        const kind = selectionKindOf(live[0]!);
        if (kind) select({ kind, id: live[0]! });
        cameraCommand.value = { kind: 'focus', ids: live };
      }}
    >
      {Icon.recenter({ size: 14 })}
    </button>
  );
}
