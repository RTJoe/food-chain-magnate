/** Hot-seat setup (#/hotseat) and the dev fixture gallery (#/dev/:fixture/:viewer). Both run the engine in-process. */
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { engine, type ChainId, type GameConfig, type Viewer } from '@fcm/engine';
import { FIXTURES, type FixtureName } from '@fcm/engine/testing';
import type { BotLevel, RoomConfig } from '@fcm/protocol';
import { CHAIN_COLORS, PLAYER_COLORS } from '../theme.js';
import { navigate } from '../state/router.js';
import { me, mode, settings, view } from '../state/store.js';
import { startFixture, startHotseat } from '../net/session.js';
import { Button, Pill, SeatBadge } from './common.js';
import { Icon, Logo } from './icons.js';
import { GameSettings } from './Lobby.js';
import { BOT_LEVELS } from './bots.js';

const CHAINS = Object.keys(CHAIN_COLORS) as ChainId[];

export function HotseatSetup() {
  const cfg = useSignal<RoomConfig>({ seatCount: 3, modules: [], options: {}, intro: false, introMilestones: false });
  const names = useSignal<string[]>(PLAYER_COLORS.map((c, i) => (i === 0 && settings.value.name.trim()) || c.name));
  /** Seat index → bot level (absent = human). */
  const bots = useSignal<Record<number, BotLevel>>({});
  const n = cfg.value.seatCount;

  const start = () => {
    const c = cfg.value;
    const config: GameConfig = {
      players: Array.from({ length: c.seatCount }, (_, i) => ({
        id: `p${i + 1}`,
        name: names.value[i]?.trim() || `Player ${i + 1}`,
        chain: CHAINS[i] ?? 'fried_geese_donkey',
        color: PLAYER_COLORS[i]?.base ?? '#888888',
      })),
      modules: c.modules,
      options: c.options,
      intro: c.intro,
      introMilestones: c.introMilestones,
      map: { kind: 'random' },
    };
    const botSeats = Object.fromEntries(Object.entries(bots.value).filter(([i]) => Number(i) < c.seatCount).map(([i, level]) => [`p${Number(i) + 1}`, level]));
    try {
      startHotseat(engine, config, undefined, botSeats);
    } catch (e) {
      alert(`Could not start: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <main class="lobby">
      <div class="home-bg" aria-hidden="true" />
      <header class="lobby-head">
        <button type="button" class="icon-btn" aria-label="Back home" onClick={() => navigate({ name: 'home' })}>
          {Icon.home({ size: 20 })}
        </button>
        <div class="lobby-title">
          <p class="eyebrow">One device</p>
          <h1>Hot-seat table</h1>
        </div>
      </header>
      <div class="lobby-grid">
        <section class="glass lobby-seats">
          <div class="section-head">
            <h2>Players</h2>
            <span class="muted small">Seat order = colour order · bots play on this device</span>
          </div>
          <ul class="seat-list">
            {Array.from({ length: n }, (_, i) => (
              <li key={i} class="seat" style={{ '--pc': PLAYER_COLORS[i]?.base ?? '#888888' }}>
                <SeatBadge name={names.value[i] ?? '?'} color={PLAYER_COLORS[i]?.base ?? '#888'} size={34} />
                <input
                  class="input"
                  value={names.value[i]}
                  maxLength={24}
                  aria-label={`Player ${i + 1} name`}
                  onInput={(e) => {
                    const next = [...names.value];
                    next[i] = (e.currentTarget as HTMLInputElement).value;
                    names.value = next;
                  }}
                />
                <select
                    class="input input-sm bot-level"
                    aria-label={`Player ${i + 1} is played by`}
                    value={bots.value[i] ?? 'human'}
                    onChange={(e) => {
                      const v = (e.currentTarget as HTMLSelectElement).value;
                      const next = { ...bots.value };
                      if (v === 'human') delete next[i];
                      else next[i] = v as BotLevel;
                      bots.value = next;
                    }}
                  >
                    <option value="human">Human</option>
                    {BOT_LEVELS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label} bot
                      </option>
                    ))}
                  </select>
              </li>
            ))}
          </ul>
          <div class="lobby-start">
            <Button variant="primary" size="lg" icon="play" onClick={start}>
              Start game
            </Button>
          </div>
        </section>
        <GameSettings config={cfg.value} editable onChange={(c) => (cfg.value = c)} />
      </div>
    </main>
  );
}

const FIXTURE_TEXT: Record<FixtureName, string> = {
  setup: 'First restaurant placement, round 1',
  restructuring: 'Round 2 restructuring; p1 has submitted',
  working: 'Round 3 working, p2 in the marketing step',
  dinnertime: 'Round 4 dinnertime with demand and campaigns',
  ketchup: 'Ketchup modules: apartments, parks, coffee, freeway',
};

/** #/dev: pick a canned state and a viewer; #/dev/:fixture/:viewer opens it. */
export function DevGallery({ fixture, viewer }: { fixture: string | null; viewer: string | null }) {
  const name = fixture && fixture in FIXTURES ? (fixture as FixtureName) : null;
  const who: Viewer = viewer ?? 'p1';
  const started = useSignal<string | null>(null);

  useEffect(() => {
    if (!name) return;
    const key = `${name}/${who}`;
    if (started.value === key && mode.value === 'dev') return;
    started.value = key;
    startFixture(engine, FIXTURES[name](), who);
  }, [name, who]);

  if (name && view.value) return null; // App renders the table.
  return (
    <main class="lobby">
      <div class="home-bg" aria-hidden="true" />
      <header class="lobby-head">
        <button type="button" class="icon-btn" aria-label="Back home" onClick={() => navigate({ name: 'home' })}>
          {Icon.home({ size: 20 })}
        </button>
        <div class="lobby-title">
          <p class="eyebrow">Developers</p>
          <h1>Fixture gallery</h1>
        </div>
        <Logo size={40} />
      </header>
      <ul class="fixture-list">
        {(Object.keys(FIXTURES) as FixtureName[]).map((f) => (
          <li key={f} class="glass fixture">
            <div>
              <h3>{f}</h3>
              <p class="muted small">{FIXTURE_TEXT[f]}</p>
            </div>
            <div class="chip-row">
              {['p1', 'p2', 'p3', 'spectator'].map((id) => (
                <button key={id} type="button" class="chip" onClick={() => navigate({ name: 'dev', fixture: f, viewer: id })}>
                  {id === 'spectator' ? 'Spectator' : id}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {name && !view.value && <Pill tone="info">Loading {name}…</Pill>}
      {me.value === null && view.value && <Pill>Spectating</Pill>}
    </main>
  );
}
