import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { chat, chatOpen, room, unreadChat } from '../state/store.js';
import { sendChat } from '../net/session.js';
import { Empty, IconButton } from './common.js';

export function ChatBox({ compact }: { compact?: boolean }) {
  const text = useSignal('');
  const list = useRef<HTMLOListElement>(null);
  const lines = chat.value;
  useEffect(() => {
    chatOpen.value = true;
    unreadChat.value = 0;
    return () => (chatOpen.value = false);
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines.length]);
  const colorOf = (seat: number | null) => (seat === null ? 'var(--c-ink-muted)' : (room.value?.seats[seat]?.color ?? 'var(--c-ink-muted)'));
  return (
    <div class={`chat ${compact ? 'is-compact' : ''}`}>
      <ol class="chat-list" ref={list} aria-live="polite">
        {lines.length === 0 && <Empty icon="chat">No messages yet. Say hi!</Empty>}
        {lines.map((l) => (
          <li key={l.id} class={`chat-line ${l.mine ? 'is-mine' : ''}`}>
            <span class="chat-name" style={{ color: colorOf(l.seat) }}>
              {l.name}
            </span>
            <span class="chat-text">{l.text}</span>
          </li>
        ))}
      </ol>
      <form
        class="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          sendChat(text.value);
          text.value = '';
        }}
      >
        <input class="input" value={text.value} maxLength={500} placeholder="Message" aria-label="Chat message" onInput={(e) => (text.value = (e.currentTarget as HTMLInputElement).value)} />
        <IconButton icon="arrowRight" label="Send" type="submit" disabled={!text.value.trim()} />
      </form>
    </div>
  );
}
