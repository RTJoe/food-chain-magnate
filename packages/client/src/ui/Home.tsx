import { useSignal } from '@preact/signals';
import { ROOM_CODE_ALPHABET } from '@fcm/protocol';
import { navigate } from '../state/router.js';
import { connection, settings, updateSettings } from '../state/store.js';
import type { Phase } from '@fcm/engine';
import { clearHotseat, forgetRoom, recentGames, savedHotseat, type RecentGame } from '../state/recentGames.js';
import { createRoom, resumeHotseat, startOnline } from '../net/session.js';
import { hotseatEngine } from '../state/engine.js';
import { phaseLabel } from '../state/selectors.js';
import { Button, IconButton } from './common.js';
import { Icon, LogoLockup } from './icons.js';
import { continueEntry } from './learn/index.js';
import { hasLearnProgress, learnProgress } from '../tutorial/progress.js';
import './learn/learn.css';

const cleanCode = (s: string) =>
  s
    .toUpperCase()
    .split('')
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, 5);

// Cached from the last visit: worded as "when you left", since the room may have moved on since.
const STATUS_LABEL: Record<RecentGame['status'], string> = { lobby: 'In the lobby when you left', playing: 'In progress when you left', finished: 'Finished' };

function ago(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** The tutorial entry point: "New to the game? Start here", or Continue once lessons are under way. */
function LearnBanner() {
  void learnProgress.value;
  const started = hasLearnProgress();
  const next = continueEntry();
  return (
    <section class="home-learn glass" aria-label="Learn to play">
      <span class="home-card-icon tone-accent">{Icon.sparkle({ size: 24 })}</span>
      <div>
        <h2>{started ? 'Keep learning' : 'New to the game? Start here'}</h2>
        <p class="muted">{started && next ? `Next: ${next.title} (${next.minutes} min).` : 'Short interactive lessons on the real board, then a guided game against a bot.'}</p>
      </div>
      <Button variant="primary" size="lg" icon="arrowRight" data-learn-entry onClick={() => navigate({ name: 'learn', lesson: null })}>
        {started ? 'Open lessons' : 'Learn to play'}
      </Button>
    </section>
  );
}

/** Rooms this browser has been in (localStorage), newest first, with one-click resume. */
function YourGames() {
  const games = recentGames.value;
  if (!games.length) return null;
  const resume = (id: string) => {
    startOnline({ id });
    navigate({ name: 'room', id });
  };
  return (
    <section class="home-games glass" aria-label="Your games" style={{ padding: '12px 18px', marginBottom: '18px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>Your games</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
        {games.map((g) => (
          <li key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.08em' }}>{g.id}</span>
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>
              <span>{g.players.join(', ') || 'No players seated'}</span>
              <span class="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                {STATUS_LABEL[g.status]} · seen {ago(g.lastSeen)}
              </span>
            </span>
            <Button size="sm" variant={g.status === 'playing' ? 'primary' : 'secondary'} icon="arrowRight" onClick={() => resume(g.id)}>
              {g.status === 'finished' ? 'View' : 'Open'}
            </Button>
            <IconButton icon="x" label={`Forget room ${g.id}`} onClick={() => forgetRoom(g.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The hot-seat game saved on this device (state/recentGames), with Resume and Discard. */
function SavedHotseatGame() {
  const g = savedHotseat.value;
  if (!g) return null;
  const names = g.config.players.map((p) => p.name).join(', ');
  const where = g.over ? 'Game over' : `${g.round > 0 ? `Round ${g.round} · ` : ''}${phaseLabel({ kind: g.phase } as Phase)}`;
  const resume = () => {
    if (resumeHotseat(hotseatEngine(), g)) navigate({ name: 'hotseat' });
  };
  return (
    <section class="home-games glass" aria-label="Hot-seat game" style={{ padding: '12px 18px', marginBottom: '18px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>Hot-seat game on this device</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 160px', minWidth: 0 }}>
          <span>{names}</span>
          <span class="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
            {where} · saved {ago(g.savedAt)}
          </span>
        </span>
        <Button size="sm" variant={g.over ? 'secondary' : 'primary'} icon="arrowRight" data-resume-hotseat onClick={resume}>
          {g.over ? 'View' : 'Resume'}
        </Button>
        <IconButton icon="x" label="Discard the saved hot-seat game" onClick={() => confirm('Discard the saved hot-seat game?') && clearHotseat()} />
      </div>
    </section>
  );
}

export function Home() {
  const code = useSignal('');
  const creating = useSignal(false);
  const name = settings.value.name;
  const nameOk = name.trim().length > 0;

  const onCreate = () => {
    if (!nameOk) return;
    creating.value = true;
    startOnline();
    createRoom();
  };
  const onJoin = (e: Event) => {
    e.preventDefault();
    if (code.value.length !== 5 || !nameOk) return;
    // Home already has the name: join straight away instead of asking again on the room page.
    startOnline({ id: code.value });
    navigate({ name: 'room', id: code.value });
  };

  return (
    <main class="home">
      <div class="home-bg" aria-hidden="true" />
      <header class="home-hero">
        <h1 class="home-title">
          <LogoLockup />
        </h1>
        <p class="home-strap">Online · Hot-seat · 2–6 players</p>
        <p class="lede">Build a fast-food empire. Hire, train and market your way to the top of the town’s food chain.</p>
      </header>

      <LearnBanner />

      <section class="home-name glass">
        <label class="field">
          <span class="field-label">Your name</span>
          <input
            class="input input-lg"
            value={name}
            maxLength={24}
            placeholder="e.g. Ada"
            autoComplete="nickname"
            onInput={(e) => updateSettings({ name: (e.currentTarget as HTMLInputElement).value })}
          />
        </label>
      </section>

      <SavedHotseatGame />
      <YourGames />

      <div class="home-grid">
        <article class="home-card glass">
          <span class="home-card-icon tone-accent">{Icon.plus({ size: 24 })}</span>
          <h2>Create a room</h2>
          <p class="muted">Host an online game. Friends join with the link, the code or the QR code.</p>
          <Button variant="primary" size="lg" icon="arrowRight" disabled={!nameOk} busy={creating.value && connection.value !== 'open'} onClick={onCreate}>
            Create room
          </Button>
          {!nameOk && <p class="hint">Enter your name first.</p>}
        </article>

        <form class="home-card glass" onSubmit={onJoin}>
          <span class="home-card-icon tone-teal">{Icon.link({ size: 24 })}</span>
          <h2>Join a room</h2>
          <p class="muted">Enter the 5-letter room code shown in the host’s lobby.</p>
          <input
            class="input input-code"
            value={code.value}
            placeholder="ABCDE"
            aria-label="Room code"
            autoCapitalize="characters"
            spellcheck={false}
            onInput={(e) => (code.value = cleanCode((e.currentTarget as HTMLInputElement).value))}
          />
          <Button variant="secondary" size="lg" icon="arrowRight" type="submit" disabled={code.value.length !== 5 || !nameOk}>
            Join
          </Button>
          {!nameOk && <p class="hint">Enter your name first.</p>}
        </form>

        <article class="home-card glass">
          <span class="home-card-icon tone-teal-dark">{Icon.device({ size: 24 })}</span>
          <h2>Hot-seat</h2>
          <p class="muted">Play on one device and pass it around. Private choices stay hidden between turns.</p>
          <Button variant="secondary" size="lg" icon="arrowRight" onClick={() => navigate({ name: 'hotseat' })}>
            Set up a table
          </Button>
        </article>
      </div>

      <footer class="home-foot">
        <a href="#/learn">Learn to play</a>
        <span aria-hidden="true">·</span>
        {import.meta.env.DEV && (
          <>
            <a href="#/dev">Fixture gallery</a>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span class="muted">An unofficial fan implementation. All art is original.</span>
      </footer>
    </main>
  );
}
