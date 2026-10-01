/**
 * @fcm/server — serves packages/client/dist over HTTP and accepts WebSocket upgrades on /ws.
 * C0: hello/ping only. Rooms and games arrive in C3 (architecture §4).
 */
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION, parseClientMessage, type ServerMessage } from '@fcm/protocol';
import { lanAddresses } from './lanAddress.js';
import { staticHandler } from './static.js';

export const SERVER_VERSION = '0.1.0';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const CLIENT_DIST = process.env.FCM_CLIENT_DIST ?? fileURLToPath(new URL('../../client/dist/', import.meta.url));

const send = (ws: WebSocket, msg: ServerMessage) => ws.send(JSON.stringify(msg));

const http = createServer(staticHandler(CLIENT_DIST));
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

http.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const clientId = randomBytes(8).toString('hex');
  ws.on('message', (data) => {
    const msg = parseClientMessage(String(data));
    if (!msg) return send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Invalid message' });
    switch (msg.t) {
      case 'hello':
        if (msg.protocol !== PROTOCOL_VERSION) {
          return send(ws, { t: 'error', code: 'PROTOCOL_MISMATCH', message: `Server speaks protocol ${PROTOCOL_VERSION}` });
        }
        return send(ws, {
          t: 'welcome',
          clientId,
          sessionToken: msg.sessionToken ?? randomBytes(16).toString('hex'),
          serverVersion: SERVER_VERSION,
          protocol: PROTOCOL_VERSION,
          room: null,
        });
      case 'ping':
        return send(ws, { t: 'pong', ts: msg.ts, serverTs: Date.now() });
      default:
        return send(ws, { t: 'error', code: 'NOT_IMPLEMENTED', message: `${msg.t} is not implemented yet` });
    }
  });
});

http.listen(PORT, HOST, () => {
  console.log(`Food Chain Magnate server ${SERVER_VERSION} listening on ${HOST}:${PORT}`);
  console.log(`  local:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  network: http://${ip}:${PORT}`);
});

const shutdown = () => {
  wss.clients.forEach((c) => c.close(1001, 'server shutting down'));
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
