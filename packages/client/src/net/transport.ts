/**
 * Transport abstraction (architecture §5.5). `SocketTransport` (online, auto-reconnect, session
 * token) and `LocalTransport` (hot-seat, in-process engine) both implement it, so the store and UI
 * never know which one is in use. Implementations arrive in C4.
 */
import type { ClientMessage, ServerMessage } from '@fcm/protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export type Unsubscribe = () => void;

export interface Transport {
  readonly kind: 'socket' | 'local';
  readonly status: ConnectionStatus;
  /** Open the connection (idempotent). */
  connect(): void;
  /** Close for good; no reconnect. */
  close(): void;
  /** Queue or send a message. Messages sent while not open are buffered until `open`. */
  send(msg: ClientMessage): void;
  onMessage(listener: (msg: ServerMessage) => void): Unsubscribe;
  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe;
}
