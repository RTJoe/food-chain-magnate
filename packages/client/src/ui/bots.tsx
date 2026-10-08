/** Bot seat UI bits shared by the lobby, hot-seat setup and player panels. */
import type { BotLevel } from '@fcm/protocol';
import { Icon } from './icons.js';

export const BOT_LEVELS: { value: BotLevel; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'For learning: slow and passive' },
  { value: 'medium', label: 'Medium', hint: 'A solid opponent: the usual pick' },
  { value: 'hard', label: 'Hard', hint: 'Thinks ahead' },
];
export const botLevelLabel = (l: BotLevel): string => BOT_LEVELS.find((b) => b.value === l)?.label ?? l;

/** Robot badge with the bot's level ("Easy bot"). */
export function BotBadge({ level, thinking = false }: { level: BotLevel; thinking?: boolean }) {
  return (
    <span class={`bot-badge ${thinking ? 'is-thinking' : ''}`} title={`${botLevelLabel(level)} bot`}>
      {Icon.robot({ size: 13 })} {botLevelLabel(level)}
    </span>
  );
}

