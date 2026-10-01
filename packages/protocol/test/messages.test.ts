import { describe, expect, it } from 'vitest';
import { ClientMessage, ServerMessage, parseClientMessage, PROTOCOL_VERSION } from '../src/index.js';

describe('protocol', () => {
  it('accepts valid client messages', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', clientVersion: '0.1.0', protocol: PROTOCOL_VERSION }))).not.toBeNull();
    expect(
      ClientMessage.safeParse({ t: 'game.action', id: 'a1', expectedSeq: 3, action: { type: 'work.endTurn', playerId: 'p1' } }).success,
    ).toBe(true);
    expect(ClientMessage.safeParse({ t: 'room.join', roomId: 'ABC23', name: 'Ann' }).success).toBe(true);
  });

  it('rejects malformed messages and unknown action types', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'nope' }))).toBeNull();
    expect(ClientMessage.safeParse({ t: 'game.action', id: 'a1', expectedSeq: 0, action: { type: 'work.cheat', playerId: 'p1' } }).success).toBe(false);
    expect(ClientMessage.safeParse({ t: 'room.join', roomId: 'abcde', name: 'Ann' }).success).toBe(false);
    expect(ClientMessage.safeParse({ t: 'chat', text: '' }).success).toBe(false);
  });

  it('accepts server messages', () => {
    expect(ServerMessage.safeParse({ t: 'pong', ts: 1, serverTs: 2 }).success).toBe(true);
    expect(ServerMessage.safeParse({ t: 'error', code: 'BAD_MESSAGE', message: 'x' }).success).toBe(true);
  });
});
