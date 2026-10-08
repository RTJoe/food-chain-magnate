/**
 * WebSocket transport (architecture §5.5, docs/protocol.md): connects to `/ws` on the page's
 * origin, buffers while not open, reconnects with exponential backoff and jitter, and keeps the
 * connection warm with pings. The session layer sends `hello` on every (re)open: status listeners
 * run before the send buffer is flushed, so `hello` always goes first.
 *
 * Only the current socket's events count: a replaced socket's late `close` must not clear the new
 * one or schedule another connect. Close code 4000 means another tab took this session over; we
 * stop (status `closed`, `replaced`) instead of taking it back, until `reconnectNow()`.
 *
 * Half-open sockets (Wi-Fi to cellular, laptop sleep) never fire `close`: every ping must be
 * answered by some server message within `pongTimeout`, or the socket is treated as dead and
 * replaced. Coming back to the tab, `pageshow` and the browser's `online` event probe at once.
 */
import { parseServerMessage, type ClientMessage, type ServerMessage } from '@fcm/protocol';
import type { ConnectionStatus, Transport, Unsubscribe } from './transport.js';

export interface SocketTransportOptions {
  url?: string;
  /** First retry delay (ms). */
  baseDelay?: number;
  maxDelay?: number;
  pingEvery?: number;
  /** A ping with no server message for this long means the socket is dead (ms). */
  pongTimeout?: number;
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
}

/** Server close code: this session was opened on another socket (another tab or window). */
export const CLOSE_REPLACED = 4000;

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
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the current socket last delivered a message. */
  private lastHeard = 0;
  private unwatch: (() => void) | null = null;
  private closedForGood = false;
  private replacedElsewhere = false;
  private readonly opts: Required<Omit<SocketTransportOptions, 'WebSocketImpl' | 'url'>> & { url: string; WS: typeof WebSocket };

  constructor(opts: SocketTransportOptions = {}) {
    this.opts = {
      url: opts.url ?? defaultSocketUrl(),
      baseDelay: opts.baseDelay ?? 500,
      maxDelay: opts.maxDelay ?? 10_000,
      pingEvery: opts.pingEvery ?? 20_000,
      pongTimeout: opts.pongTimeout ?? 5_000,
      WS: opts.WebSocketImpl ?? WebSocket,
    };
    this.unwatch = this.watchPage();
  }

  /** Probe right away when the page wakes or the network returns (no-op outside a browser). */
  private watchPage(): (() => void) | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    const wake = () => {
      if (document.visibilityState !== 'hidden') this.probe(3_000);
    };
    const online = () => {
      if (this.closedForGood || this.replacedElsewhere) return;
      if (this.status === 'open') this.probe(3_000);
      else this.reconnectNow(); // skip the rest of the backoff
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', online);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', online);
    };
  }

  /** Ping now; if nothing at all comes back within `deadline`, drop the socket and reconnect. */
  probe(deadline = this.opts.pongTimeout): void {
    if (!this.ws || this.status !== 'open' || this.probeTimer) return;
    const sentAt = Date.now();
    this.send({ t: 'ping', ts: sentAt });
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      if (this.ws && this.status === 'open' && this.lastHeard < sentAt) this.reconnectNow();
    }, deadline);
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
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.replacedElsewhere = false;
      this.lastHeard = Date.now();
      this.setStatus('open');
      const queued = this.buffer;
      this.buffer = [];
      for (const raw of queued) ws.send(raw);
      this.startPing();
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      const msg = parseServerMessage(String(e.data));
      if (!msg) return;
      for (const l of [...this.msgListeners]) l(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (this.closedForGood) this.setStatus('closed');
      else if (e?.code === CLOSE_REPLACED) {
        // Another tab has this session now. Retrying would take it back and start a tug of war.
        this.replacedElsewhere = true;
        this.attempt = 0;
        this.setStatus('closed');
      } else this.scheduleRetry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  /** The server closed us because this session was opened in another tab (see `CLOSE_REPLACED`). */
  get replaced(): boolean {
    return this.replacedElsewhere;
  }

  /** Retry now (e.g. "Reconnect" / "Use here" button); resets the backoff. */
  reconnectNow(): void {
    if (this.closedForGood) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPing();
    const old = this.ws;
    this.ws = null;
    if (old) {
      // Its late events must not touch the new socket.
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      old.close();
    }
    this.connect();
  }

  close(): void {
    this.closedForGood = true;
    this.unwatch?.();
    this.unwatch = null;
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
    this.pingTimer = setInterval(() => this.probe(), this.opts.pingEvery);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = null;
  }
}
