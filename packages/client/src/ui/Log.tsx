/** Game log (architecture §5.4 Log): readable lines from engine events, newest at the bottom. */
import { useEffect, useRef } from 'preact/hooks';
import type { LogIcon } from '../state/log.js';
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
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}
