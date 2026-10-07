/** App shell: hash routes (#/, #/room/:id, #/hotseat, #/dev, #/learn) and global overlays. */
import { useEffect } from 'preact/hooks';
import { route, navigate } from '../state/router.js';
import { connection, mode, room, view } from '../state/store.js';
import { loadToken, resumeHotseat, resync, startOnline } from '../net/session.js';
import { savedHotseat } from '../state/recentGames.js';
import { hotseatEngine } from '../state/engine.js';
import { Button } from './common.js';
import { Home } from './Home.js';
import { Logo } from './icons.js';
import { DevGallery, HotseatSetup } from './LocalGames.js';
import { Lobby } from './Lobby.js';
import { Learn } from './learn/index.js';
import { Toasts } from './Overlays.js';
import { WhatsThisLayer } from './glossary/WhatsThis.js';
import { isRulesHash, RulesRoute } from './rules/RulesRoute.js';
import { Table } from './Table.js';

let lastRoomId: string | null = null;
/** The page opened (or reloaded) on #/hotseat: resume the saved game there instead of the setup form. */
let firstRoute = true;

export function App() {
  const r = route.value;

  // Deep link or reload on #/room/:id with a stored session: reconnect and re-attach the seat.
  useEffect(() => {
    if (r.name === 'room' && mode.value === null && loadToken()) startOnline({ id: r.id });
  }, [r.name === 'room' ? r.id : null]);

  // Reload (or a discarded tab coming back) on #/hotseat: pick the saved game up where it was.
  // Coming from Home's "Set up a table" shows the setup form; Home has its own Resume entry.
  useEffect(() => {
    const first = firstRoute;
    firstRoute = false;
    const saved = savedHotseat.peek();
    if (first && r.name === 'hotseat' && mode.value === null && saved && !saved.over) resumeHotseat(hotseatEngine(), saved);
  }, []);

  // Follow the room we are in (created a room, or the server re-attached us to one).
  const roomId = room.value?.id ?? null;
  useEffect(() => {
    if (roomId && roomId !== lastRoomId && mode.value === 'online' && !(r.name === 'room' && r.id === roomId)) navigate({ name: 'room', id: roomId });
    lastRoomId = roomId;
  }, [roomId]);

  return (
    <>
      <Screen />
      <Toasts />
      <WhatsThisLayer />
    </>
  );
}

function Screen() {
  const r = route.value;
  if (isRulesHash()) return <RulesRoute />;
  switch (r.name) {
    case 'home':
      return <Home />;
    case 'room': {
      const rm = room.value;
      if (rm && rm.id === r.id && rm.status !== 'lobby' && mode.value === 'online') return view.value ? <Table /> : <LoadingGame />;
      return <Lobby roomId={r.id} />;
    }
    case 'hotseat':
      return mode.value === 'hotseat' && view.value ? <Table /> : <HotseatSetup />;
    case 'learn':
      return <Learn lesson={r.lesson} />;
    case 'dev':
      return (
        <>
          <DevGallery fixture={r.fixture} viewer={r.viewer} />
          {r.fixture && mode.value === 'dev' && view.value && <Table />}
        </>
      );
  }
}

function LoadingGame() {
  return (
    <main class="center-page">
      <div class="glass card-narrow">
        <Logo size={48} />
        <h1>Loading the game…</h1>
        <p class="muted">{connection.value === 'open' ? 'Fetching the table from the server.' : `Server: ${connection.value}`}</p>
        <Button variant="secondary" onClick={() => resync()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
