/**
 * WebSocket transport (architecture §5.5, docs/protocol.md): connects to `/ws` on the page's
 * origin, buffers while not open, reconnects with exponential backoff and jitter, and keeps the
 * connection warm with pings. The session layer sends `hello` on every (re)open: status listeners
 * run before the send buffer is flushed, so `hello` always goes first.
 */
import { parseServerMessage, type ClientMessage, type ServerMessage } from '@fcm/protocol';
import type { ConnectionStatus, Transport, Unsubscribe } from './transport.js';

export interface SocketTransportOptions {
  url?: string;
  /** First retry delay (ms). */
  baseDelay?: number;
  maxDelay?: number;
  pingEvery?: number;
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
}

export function defaultSocketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export class SocketTransport implements Transport {
  readonly kind = 'socket' as const;
  status: ConnectionStatus = 'idle';
  /** Reconnect attempts since the last successful open. */
  attempt = 0;
  private ws: WebSocket | null = null;
  private buffer: string[] = [];
  private msgListeners = new Set<(m: ServerMessage) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedForGood = false;
  private readonly opts: Required<Omit<SocketTransportOptions, 'WebSocketImpl' | 'url'>> & { url: string; WS: typeof WebSocket };

  constructor(opts: SocketTransportOptions = {}) {
    this.opts = {
      url: opts.url ?? defaultSocketUrl(),
      baseDelay: opts.baseDelay ?? 500,
      maxDelay: opts.maxDelay ?? 10_000,
      pingEvery: opts.pingEvery ?? 20_000,
      WS: opts.WebSocketImpl ?? WebSocket,
    };
  }

  connect(): void {
    if (this.ws || this.closedForGood) return;
    this.setStatus(this.attempt > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new this.opts.WS(this.opts.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('open');
      const queued = this.buffer;
      this.buffer = [];
      for (const raw of queued) ws.send(raw);
      this.startPing();
    };
    ws.onmessage = (e) => {
      const msg = parseServerMessage(String(e.data));
      if (!msg) return;
      for (const l of [...this.msgListeners]) l(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.stopPing();
      if (this.closedForGood) this.setStatus('closed');
      else this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  /** Retry now (e.g. "Reconnect" button); resets the backoff. */
  reconnectNow(): void {
    if (this.closedForGood) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close();
    this.ws = null;
    this.connect();
  }

  close(): void {
    this.closedForGood = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPing();
    this.buffer = [];
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setStatus('closed');
    this.msgListeners.clear();
    this.statusListeners.clear();
  }

  send(msg: ClientMessage): void {
    const raw = JSON.stringify(msg);
    if (this.ws && this.status === 'open' && this.ws.readyState === 1) this.ws.send(raw);
    else if (msg.t !== 'ping') this.buffer.push(raw);
  }

  onMessage(listener: (msg: ServerMessage) => void): Unsubscribe {
    this.msgListeners.add(listener);
    return () => this.msgListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Backoff for attempt n (1-based): base·2^(n−1), capped, ±20% jitter. */
  static delay(n: number, base: number, max: number, rand = Math.random()): number {
    const d = Math.min(max, base * 2 ** Math.max(0, n - 1));
    return Math.round(d * (0.8 + 0.4 * rand));
  }

  private scheduleRetry(): void {
    this.attempt += 1;
    this.setStatus('reconnecting');
    const wait = SocketTransport.delay(this.attempt, this.opts.baseDelay, this.opts.maxDelay);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const l of [...this.statusListeners]) l(s);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: Date.now() }), this.opts.pingEvery);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
