/**
 * SocketTransport reconnect: stale sockets are ignored, and a session taken over by another tab
 * (server close code 4000) stops retrying until the user asks to play here again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketTransport } from '../src/net/socketTransport.js';

/** Fake browser WebSocket; close events are asynchronous like the real one. */
class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: string) {
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close(code = 1005, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    setTimeout(() => this.onclose?.({ code, reason }), 0);
  }
}

const make = () => new SocketTransport({ url: 'ws://x/ws', baseDelay: 10, maxDelay: 50, WebSocketImpl: FakeWS as unknown as typeof WebSocket });
const last = () => FakeWS.all[FakeWS.all.length - 1] as FakeWS;

beforeEach(() => {
  FakeWS.all = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SocketTransport', () => {
  it('"Retry now" while a connect is pending does not start a reconnect loop', () => {
    const t = make();
    t.connect();
    t.reconnectNow(); // socket 1 still CONNECTING
    expect(FakeWS.all).toHaveLength(2);
    vi.advanceTimersByTime(1); // socket 1's late close event
    last().open();
    vi.advanceTimersByTime(5_000);
    expect(FakeWS.all).toHaveLength(2);
    expect(t.status).toBe('open');
  });

  it('ignores events from a replaced socket', () => {
    const t = make();
    t.connect();
    const first = last();
    t.reconnectNow();
    const msgs: unknown[] = [];
    t.onMessage((m) => msgs.push(m));
    first.onmessage?.({ data: JSON.stringify({ t: 'pong', ts: 1, serverTs: 2 }) });
    first.onopen?.();
    expect(msgs).toEqual([]);
    expect(t.status).not.toBe('open');
  });

  it('stops retrying when the session is opened in another tab (4000), until reconnectNow', () => {
    const t = make();
    t.connect();
    last().open();
    last().close(4000, 'session opened elsewhere');
    vi.advanceTimersByTime(10_000);
    expect(FakeWS.all).toHaveLength(1);
    expect(t.status).toBe('closed');
    expect(t.replaced).toBe(true);
    t.reconnectNow();
    expect(FakeWS.all).toHaveLength(2);
    last().open();
    expect(t.status).toBe('open');
    expect(t.replaced).toBe(false);
  });

  it('still retries with backoff after an ordinary drop', () => {
    const t = make();
    t.connect();
    last().open();
    last().close(1006);
    vi.advanceTimersByTime(1);
    expect(t.status).toBe('reconnecting');
    vi.advanceTimersByTime(100);
    expect(FakeWS.all).toHaveLength(2);
  });
});
