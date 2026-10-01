import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PROTOCOL_VERSION, parseServerMessage, type ClientMessage } from '@fcm/protocol';
import { ENGINE_VERSION } from '@fcm/engine';
import { PLAYER_COLORS, applyTheme } from './theme.js';
import './styles/main.css';

/** C0 placeholder: shows the palette and checks the /ws hello handshake. Replaced in C4. */
function App() {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      const hello: ClientMessage = { t: 'hello', clientVersion: ENGINE_VERSION, protocol: PROTOCOL_VERSION };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (e) => {
      const msg = parseServerMessage(String(e.data));
      if (msg?.t === 'welcome') {
        setStatus('open');
        setDetail(`server ${msg.serverVersion}, client ${msg.clientId}`);
      }
    };
    ws.onclose = () => setStatus('closed');
    return () => ws.close();
  }, []);

  return (
    <main class="placeholder">
      <h1>Food Chain Magnate</h1>
      <p>Online multiplayer with a 3D board. The game table is under construction.</p>
      <div class="swatches" aria-label="Player colours">
        {PLAYER_COLORS.map((c) => (
          <span key={c.id} class="swatch" title={c.name} style={{ background: c.base }} />
        ))}
      </div>
      <span class="status" data-state={status}>
        Server: {status}
        {detail && ` (${detail})`}
      </span>
    </main>
  );
}

applyTheme();
const root = document.getElementById('app');
if (root) render(<App />, root);
