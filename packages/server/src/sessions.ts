/**
 * Client sessions (architecture §4.3). A session is identified by a 128-bit random token the
 * client keeps in localStorage; the server only stores its SHA-256 hash. The session's stable
 * `clientId` is what rooms and seats refer to, so reconnecting with the token re-attaches the seat.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface ClientSession {
  clientId: string;
  tokenHash: string;
  name: string;
  roomId: string | null;
  lastSeen: number;
}

export const newToken = (): string => randomBytes(16).toString('hex');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const newClientId = (): string => randomBytes(8).toString('hex');

export class SessionRegistry {
  private readonly byHash = new Map<string, ClientSession>();
  private readonly byClient = new Map<string, ClientSession>();

  constructor(private readonly now: () => number = Date.now) {}

  create(name = 'Player'): { token: string; session: ClientSession } {
    const token = newToken();
    const session: ClientSession = { clientId: newClientId(), tokenHash: hashToken(token), name, roomId: null, lastSeen: this.now() };
    this.add(session);
    return { token, session };
  }

  /** Look up a session by its token. */
  resume(token: string): ClientSession | undefined {
    const s = this.byHash.get(hashToken(token));
    if (s) s.lastSeen = this.now();
    return s;
  }

  /** Re-create a session from persistence (seat holders). Existing sessions win. */
  adopt(s: Omit<ClientSession, 'lastSeen'>): ClientSession {
    const existing = this.byClient.get(s.clientId) ?? this.byHash.get(s.tokenHash);
    if (existing) return existing;
    const session = { ...s, lastSeen: this.now() };
    this.add(session);
    return session;
  }

  get(clientId: string): ClientSession | undefined {
    return this.byClient.get(clientId);
  }

  /** Drop sessions that are in no room and unseen for `ttlMs`, unless `keep` says otherwise. */
  gc(ttlMs: number, keep: (s: ClientSession) => boolean): number {
    let n = 0;
    for (const s of this.byClient.values()) {
      if (s.roomId === null && this.now() - s.lastSeen > ttlMs && !keep(s)) {
        this.byClient.delete(s.clientId);
        this.byHash.delete(s.tokenHash);
        n++;
      }
    }
    return n;
  }

  get size(): number {
    return this.byClient.size;
  }

  private add(s: ClientSession): void {
    this.byHash.set(s.tokenHash, s);
    this.byClient.set(s.clientId, s);
  }
}
