import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage, type ServerMessageOf, type ServerMessageType } from '@fcm/protocol';
import { toyEngine } from '@fcm/engine/testing';
import { startServer, type RunningServer, type ServerOptions } from '../src/server.js';

export function tempDir(prefix = 'fcm-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A fake built client directory. */
export function fakeClientDist(): string {
  const dir = tempDir('fcm-client-');
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>FCM</title>' + ' '.repeat(2000));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("hi");\n'.repeat(200));
  writeFileSync(join(dir, 'assets', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return dir;
}

export async function boot(opts: Partial<ServerOptions> = {}): Promise<RunningServer> {
  return startServer({ engine: toyEngine, port: 0, host: '127.0.0.1', clientDist: fakeClientDist(), dataDir: null, log: () => {}, ...opts });
}

/** A real `ws` client that records every server message and lets tests await specific ones. */
export class TestClient {
  readonly ws: WebSocket;
  readonly inbox: ServerMessage[] = [];
  private cursor = 0;
  private waiters: (() => void)[] = [];
  clientId = '';
  token = '';

  private constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => {
      this.inbox.push(JSON.parse(String(d)) as ServerMessage);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  /** An open socket that has not sent hello yet. */
  static async open(server: RunningServer): Promise<TestClient> {
    const c = new TestClient(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise<void>((res, rej) => {
      c.ws.once('open', () => res());
      c.ws.once('error', rej);
    });
    return c;
  }

  static async connect(server: RunningServer, hello: { name?: string; sessionToken?: string } = {}): Promise<TestClient> {
    const c = await TestClient.open(server);
    c.send({ t: 'hello', clientVersion: 'test', protocol: PROTOCOL_VERSION, ...hello });
    const w = await c.next('welcome');
    c.clientId = w.clientId;
    c.token = w.sessionToken;
    return c;
  }

  send(msg: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Next unread message of type `t` (optionally matching `pred`); skips earlier messages. */
  async next<T extends ServerMessageType>(t: T, pred: (m: ServerMessageOf<T>) => boolean = () => true, timeoutMs = 2000): Promise<ServerMessageOf<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.inbox.length) {
        const m = this.inbox[this.cursor++] as ServerMessage;
        if (m.t === t && pred(m as ServerMessageOf<T>)) return m as ServerMessageOf<T>;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout waiting for ${t}; got ${this.inbox.slice(-5).map((m) => m.t).join(', ')}`);
      await new Promise<void>((res) => {
        const timer = setTimeout(res, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          res();
        });
      });
    }
  }

  /** Skip everything received so far. */
  drain(): void {
    this.cursor = this.inbox.length;
  }

  /** Resolve after a round-trip (all earlier server messages have arrived). */
  async sync(): Promise<void> {
    const ts = Math.random();
    this.send({ t: 'ping', ts });
    await this.next('pong', (m) => m.ts === ts);
  }

  close(): Promise<void> {
    return new Promise((res) => {
      if (this.ws.readyState === WebSocket.CLOSED) return res();
      this.ws.once('close', () => res());
      this.ws.close();
    });
  }
}
