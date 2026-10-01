import { useSignal } from '@preact/signals';
import { ROOM_CODE_ALPHABET } from '@fcm/protocol';
import { navigate } from '../state/router.js';
import { connection, settings, updateSettings } from '../state/store.js';
import { createRoom, startOnline } from '../net/session.js';
import { Button } from './common.js';
import { Icon, Logo } from './icons.js';

const cleanCode = (s: string) =>
  s
    .toUpperCase()
    .split('')
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, 5);

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
    if (code.value.length === 5) navigate({ name: 'room', id: code.value });
  };

  return (
    <main class="home">
      <div class="home-bg" aria-hidden="true" />
      <header class="home-hero">
        <Logo size={72} />
        <div>
          <p class="eyebrow">Online · Hot-seat · 2–6 players</p>
          <h1>Food Chain Magnate</h1>
          <p class="lede">Build a fast-food empire. Hire, train and market your way to the top of the town’s food chain.</p>
        </div>
      </header>

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

      <div class="home-grid">
        <article class="home-card glass">
          <span class="home-card-icon tone-accent">{Icon.plus({ size: 24 })}</span>
          <h2>Create a room</h2>
          <p class="muted">Host a game on this network. Friends join with a code or by scanning a QR code.</p>
          <Button variant="primary" size="lg" icon="arrowRight" disabled={!nameOk} busy={creating.value && connection.value !== 'open'} onClick={onCreate}>
            Create room
          </Button>
          {!nameOk && <p class="hint">Enter your name first.</p>}
        </article>

        <form class="home-card glass" onSubmit={onJoin}>
          <span class="home-card-icon tone-blue">{Icon.link({ size: 24 })}</span>
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
        </form>

        <article class="home-card glass">
          <span class="home-card-icon tone-mustard">{Icon.device({ size: 24 })}</span>
          <h2>Hot-seat</h2>
          <p class="muted">Play on one device and pass it around. Private choices stay hidden between turns.</p>
          <Button variant="secondary" size="lg" icon="arrowRight" onClick={() => navigate({ name: 'hotseat' })}>
            Set up a table
          </Button>
        </article>
      </div>

      <footer class="home-foot">
        <a href="#/dev">Fixture gallery</a>
        <span aria-hidden="true">·</span>
        <span class="muted">An unofficial fan implementation. All art is original.</span>
      </footer>
    </main>
  );
}
