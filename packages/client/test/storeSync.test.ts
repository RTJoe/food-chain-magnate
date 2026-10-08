/** Store reducer: chat history replay (M255), pending actions cleared by snapshots (M166), reload screen (M259). */
import { describe, expect, it } from 'vitest';
import { createGame, engine, redactFor, type GameConfig } from '@fcm/engine';
import { chat, clientId, dropPending, handleServerMessage, pending, reloadRequired, resetStore, trackPending, unreadChat } from '../src/state/store.js';

const config: GameConfig = {
  players: [1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, chain: 'gluttony_inc' as const, color: '#000' })),
  modules: [],
  options: {},
  intro: false,
  introMilestones: false,
  map: { kind: 'random' },
};
const from = (id: string, seat: number | null = 0) => ({ clientId: id, name: id.toUpperCase(), seat });

describe('chat history', () => {
  it('replaces the list, keeps lines already shown, counts only lines missed while away as unread', () => {
    resetStore();
    clientId.value = 'me';
    handleServerMessage({ t: 'chat.history', lines: [{ from: from('ann'), text: 'hi', ts: 1 }] });
    expect(chat.value.map((l) => l.text)).toEqual(['hi']);
    expect(unreadChat.value).toBe(0);
    const firstId = chat.value[0]?.id;
    handleServerMessage({
      t: 'chat.history',
      lines: [
        { from: from('ann'), text: 'hi', ts: 1 },
        { from: from('me', 1), text: 'mine', ts: 2 },
        { from: from('bob', null), text: 'missed', ts: 3 },
      ],
    });
    expect(chat.value.map((l) => l.text)).toEqual(['hi', 'mine', 'missed']);
    expect(chat.value[0]?.id).toBe(firstId);
    expect(chat.value[1]?.mine).toBe(true);
    expect(unreadChat.value).toBe(1);
  });
});

describe('pending actions', () => {
  it('a snapshot past an action clears it (its answer was lost); one at the same seq keeps it', () => {
    resetStore();
    const s = createGame(config, 1);
    const view = redactFor(s, 'p1');
    const a = { type: 'setup.pass', playerId: 'p1' } as const;
    trackPending('old', a, 0);
    trackPending('now', a, 2);
    handleServerMessage({ t: 'game.snapshot', seq: 2, view, manifest: engine.listModules(), me: 'p1' });
    expect(Object.keys(pending.value)).toEqual(['now']);
    dropPending(['now']);
    expect(pending.value).toEqual({});
  });
});

describe('reload required', () => {
  it('RELOAD_REQUIRED and PROTOCOL_MISMATCH raise the reload screen', () => {
    resetStore();
    handleServerMessage({ t: 'error', code: 'RELOAD_REQUIRED', message: 'reload' });
    expect(reloadRequired.value).toBe(true);
    resetStore();
    handleServerMessage({ t: 'error', code: 'PROTOCOL_MISMATCH', message: 'x' });
    expect(reloadRequired.value).toBe(true);
  });
});
