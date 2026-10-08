import { useSignal } from '@preact/signals';
import type { ModuleManifest, OptionField } from '@fcm/engine';
import type { BotLevel, RoomConfig, RoomInfo, Seat } from '@fcm/protocol';
import { availableModules } from '../state/engine.js';
import { joinUrl, navigate } from '../state/router.js';
import { amHost, clientId, connection, mySeat, room, roomError, settings, updateSettings } from '../state/store.js';
import { addBot, displayName, joinRoom, kick, leaveRoom, removeBot, setReady, setRoomConfig, sit, stand, startGame, startOnline } from '../net/session.js';
import { Button, IconButton, Pill, Section, SeatBadge, Segmented, Toggle } from './common.js';
import { Icon, Logo } from './icons.js';
import { QrCode } from './QrCode.js';
import { ChatBox } from './Chat.js';
import { BOT_LEVELS, BotBadge } from './bots.js';
import { applyScenario, introIdle, lobbyistsNeedDistricts, ND, SCENARIOS, scenarioOf, toggleModule, withRequiredModules } from '../state/lobbySettings.js';

/** Modules offered in the lobby: the engine's expansion modules. */
export function lobbyModules(): ModuleManifest[] {
  return availableModules().filter((m) => m.id !== 'base');
}

export function Lobby({ roomId }: { roomId: string }) {
  const r = room.value;
  if (roomError.value && (!r || r.id !== roomId)) return <RoomMissing roomId={roomId} message={roomError.value} />;
  if (!r || r.id !== roomId) return <JoinRoom roomId={roomId} />;
  return <LobbyRoom room={r} />;
}

function RoomMissing({ roomId, message }: { roomId: string; message: string }) {
  return (
    <main class="center-page">
      <div class="glass card-narrow">
        <Logo size={48} />
        <h1>Room {roomId}</h1>
        <p class="muted">{message}</p>
        <Button variant="primary" icon="home" onClick={() => navigate({ name: 'home' })}>
          Back home
        </Button>
      </div>
    </main>
  );
}

function JoinRoom({ roomId }: { roomId: string }) {
  const name = settings.value.name;
  const status = connection.value;
  return (
    <main class="center-page">
      <form
        class="glass card-narrow"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          startOnline();
          joinRoom(roomId);
        }}
      >
        <Logo size={48} />
        <p class="eyebrow">Join room</p>
        <h1 class="room-code">{roomId}</h1>
        <label class="field">
          <span class="field-label">Your name</span>
          <input class="input input-lg" value={name} maxLength={24} placeholder="e.g. Bo" onInput={(e) => updateSettings({ name: (e.currentTarget as HTMLInputElement).value })} />
        </label>
        <div class="row gap">
          <Button variant="primary" size="lg" type="submit" icon="arrowRight" disabled={!name.trim()} busy={status === 'connecting'}>
            Join
          </Button>
          <Button
            variant="ghost"
            size="lg"
            icon="eye"
            disabled={!name.trim()}
            onClick={() => {
              startOnline();
              joinRoom(roomId, true);
            }}
          >
            Watch
          </Button>
        </div>
        {status !== 'idle' && <p class="hint">{status === 'open' ? 'Connected' : `Server: ${status}`}</p>}
        <Button variant="ghost" icon="home" onClick={() => navigate({ name: 'home' })}>
          Back home
        </Button>
      </form>
    </main>
  );
}

function LobbyRoom({ room: r }: { room: RoomInfo }) {
  const host = amHost.value;
  const seat = mySeat.value;
  const seated = r.seats.filter((s) => s.clientId !== null || s.bot);
  const allReady = seated.length >= 2 && seated.every((s) => s.ready);
  const firstOpen = r.seats.slice(0, r.config.seatCount).find((s) => s.clientId === null && !s.bot);
  const url = joinUrl(r.id);
  const copied = useSignal(false);
  const showQr = useSignal(true);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById('join-url') as HTMLInputElement | null;
      el?.select();
      document.execCommand?.('copy');
    }
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  };

  return (
    <main class="lobby">
      <div class="home-bg" aria-hidden="true" />
      <header class="lobby-head">
        <IconButton
          icon="logout"
          label="Leave room"
          onClick={() => {
            leaveRoom();
            navigate({ name: 'home' });
          }}
        />
        <div class="lobby-title">
          <p class="eyebrow">Room</p>
          <h1 class="room-code">{r.id}</h1>
        </div>
        <Pill tone={connection.value === 'open' ? 'ok' : 'warn'} icon={connection.value === 'open' ? 'wifi' : 'wifiOff'}>
          {connection.value === 'open' ? 'Connected' : connection.value === 'closed' ? 'Disconnected' : 'Reconnecting'}
        </Pill>
      </header>

      <div class="lobby-grid">
        <section class="glass lobby-invite">
          <h2>Invite players</h2>
          <p class="muted small">Anyone with the link or code can join.</p>
          <div class="copy-row">
            <input id="join-url" class="input" readOnly value={url} aria-label="Join link" onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
            <Button variant={copied.value ? 'ok' : 'secondary'} icon={copied.value ? 'check' : 'copy'} onClick={copy}>
              {copied.value ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <button type="button" class="qr-toggle" onClick={() => (showQr.value = !showQr.value)} aria-expanded={showQr.value}>
            {Icon.qr({ size: 16 })} {showQr.value ? 'Hide QR code' : 'Show QR code'}
          </button>
          {showQr.value && (
            <div class="qr-wrap">
              <QrCode text={url} label={`QR code for ${url}`} />
            </div>
          )}
        </section>

        <section class="glass lobby-seats">
          <div class="section-head">
            <h2>Seats</h2>
            <span class="muted small">
              {seated.length}/{r.config.seatCount} seated · colours go to filled seats in seat order
            </span>
          </div>
          <ul class="seat-list">
            {r.seats.slice(0, r.config.seatCount).map((s) => {
              // The game deals colours (and chains) to the filled seats in order (session room.ts),
              // so show each filled seat the colour it will play.
              const rank = seated.indexOf(s);
              const color = rank >= 0 ? (r.seats[rank]?.color ?? s.color) : s.color;
              return <SeatRow key={s.index} seat={{ ...s, color }} room={r} mine={seat?.index === s.index} host={host} />;
            })}
          </ul>
          <div class="seat-me">
            {seat ? (
              <>
                <Toggle checked={seat.ready} onChange={(b) => setReady(b)} label={seat.ready ? 'Ready!' : 'Ready?'} description="The host can start once everyone is ready." />
                <Button variant="ghost" size="sm" onClick={() => stand()}>
                  Stand up
                </Button>
              </>
            ) : (
              <>
                {firstOpen && (
                  <Button variant="primary" icon="users" onClick={() => sit(firstOpen.index)}>
                    Take seat {firstOpen.index + 1}
                  </Button>
                )}
                <p class="muted small">
                  You are watching as <b>{displayName()}</b>. Take an open seat to play.
                </p>
              </>
            )}
          </div>
          {r.spectators.length > 0 && (
            <p class="muted small">
              {Icon.eye({ size: 14 })} Watching: {r.spectators.map((s) => s.name).join(', ')}
            </p>
          )}
          <div class="lobby-start">
            {host ? (
              <Button variant="primary" size="lg" icon="play" disabled={!allReady} onClick={() => startGame()}>
                Start game
              </Button>
            ) : (
              <p class="muted">Waiting for the host to start…</p>
            )}
            {host && !allReady && <p class="hint">Needs 2+ seated players, all ready.</p>}
          </div>
        </section>

        <GameSettings config={r.config} editable={host} onChange={setRoomConfig} />

        <section class="glass lobby-chat">
          <h2>Chat</h2>
          <ChatBox compact />
        </section>
      </div>
    </main>
  );
}

/** "Add bot ▾" menu for an empty seat (host only). */
function AddBotMenu({ seat }: { seat: number }) {
  const open = useSignal(false);
  return (
    <div class="bot-menu">
      <Button size="sm" variant="ghost" icon="robot" aria-haspopup="menu" aria-expanded={open.value} onClick={() => (open.value = !open.value)}>
        Add bot {Icon.chevronDown({ size: 14 })}
      </Button>
      {open.value && (
        <div class="bot-menu-list glass" role="menu" aria-label={`Bot level for seat ${seat + 1}`}>
          {BOT_LEVELS.map((b) => (
            <button
              key={b.value}
              type="button"
              role="menuitem"
              class="bot-menu-item"
              onClick={() => {
                open.value = false;
                addBot(seat, b.value);
              }}
            >
              <b>{b.label}</b>
              <span class="muted small">{b.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SeatRow({ seat: s, room: r, mine, host }: { seat: Seat; room: RoomInfo; mine: boolean; host: boolean }) {
  const bot = s.bot;
  const open = s.clientId === null && !bot;
  const isHost = s.clientId !== null && s.clientId === r.hostClientId;
  return (
    <li class={`seat ${mine ? 'is-mine' : ''} ${open ? 'is-open' : ''} ${bot ? 'is-bot' : ''}`} style={{ '--pc': s.color }}>
      <SeatBadge name={s.name ?? String(s.index + 1)} color={s.color} size={36} />
      <div class="seat-text">
        <span class="seat-name">
          {open ? 'Open seat' : s.name}
          {bot && !host && <BotBadge level={bot} />}
          {isHost && <span title="Host">{Icon.crown({ size: 14 })}</span>}
          {mine && <span class="muted small"> (you)</span>}
        </span>
        <span class="seat-sub">
          {!open && <span class={`dot ${s.connected ? 'is-on' : 'is-off'}`} role="img" aria-label={s.connected ? 'Online' : 'Offline'} />}
          {open ? `Seat ${s.index + 1}` : bot ? 'Bot · always ready' : s.ready ? 'Ready' : 'Not ready'}
        </span>
      </div>
      {open && (
        <Button size="sm" variant="secondary" onClick={() => sit(s.index)}>
          Sit here
        </Button>
      )}
      {open && host && <AddBotMenu seat={s.index} />}
      {bot && host && (
        <select class="input input-sm bot-level" aria-label={`Bot level, seat ${s.index + 1}`} value={bot} onChange={(e) => addBot(s.index, (e.currentTarget as HTMLSelectElement).value as BotLevel)}>
          {BOT_LEVELS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      )}
      {!open && s.ready && <span class="seat-ready">{Icon.check({ size: 18 })}</span>}
      {host && bot && <IconButton icon="x" label={`Remove bot from seat ${s.index + 1}`} onClick={() => removeBot(s.index)} />}
      {host && !open && !bot && s.clientId !== clientId.value && <IconButton icon="x" label={`Free seat ${s.index + 1}`} onClick={() => kick(s.index)} />}
    </li>
  );
}

/** Player count, intro game and modules. Used by the online lobby and the hot-seat setup. */
export function GameSettings({ config: cfg, editable, onChange }: { config: RoomConfig; editable: boolean; onChange: (c: RoomConfig) => void }) {
  const mods = lobbyModules();
  const update = (next: RoomConfig) => editable && onChange(next);
  const six = cfg.modules.includes('ketchup:sixPlayers');
  return (
    <section class="glass lobby-settings">
      <div class="section-head">
        <h2>Game settings</h2>
        {!editable && <Pill icon="crown">Host decides</Pill>}
      </div>
      <div class="field">
        <span class="field-label">Players</span>
        <Segmented
          label="Player count"
          value={cfg.seatCount}
          onChange={(n) => {
            let next = { ...cfg, seatCount: n };
            if (n === 6 && !six) next = { ...toggleModule(cfg, mods, 'ketchup:sixPlayers', true), seatCount: 6 };
            update(withRequiredModules(next, mods));
          }}
          options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n), disabled: !editable }))}
        />
      </div>
      <Toggle
        checked={cfg.intro}
        disabled={!editable}
        onChange={(b) => update({ ...cfg, intro: b, introMilestones: b ? cfg.introMilestones : false })}
        label="Intro game"
        description="No reserve cards, milestones or salaries; $75 per player in the bank; all three drink supplier types on the map; the game ends when the bank first breaks."
      />
      {cfg.intro && (
        <Toggle
          checked={cfg.introMilestones}
          disabled={!editable}
          onChange={(b) => update({ ...cfg, introMilestones: b })}
          label="…with milestones"
          description="The recommended second game."
        />
      )}
      <h3 class="subhead">Expansion modules</h3>
      {mods.some((m) => m.id === ND) && (
        <label class="field">
          <span class="field-label">Scenario (Ketchup rulebook p2)</span>
          <select class="input" disabled={!editable} value={scenarioOf(cfg)} onChange={(e) => update(applyScenario(cfg, mods, (e.currentTarget as HTMLSelectElement).value))}>
            <option value="">Custom</option>
            {SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul class="module-list">
        {mods.map((m) => {
          const on = cfg.modules.includes(m.id);
          // Skip "Needs …" when the module text already says what it requires.
          const needs = m.requires.length && !/\brequires\b/i.test(m.description) ? `Needs ${m.requires.map((x) => mods.find((y) => y.id === x)?.name ?? x).join(', ')}. ` : '';
          const clash = m.conflicts.length ? `Not with ${m.conflicts.map((x) => mods.find((y) => y.id === x)?.name ?? x).join(', ')}.` : '';
          const idle = introIdle(cfg, m.id);
          // KX p15: Lobbyists at 5+ players keeps New Districts on.
          const held = m.id === ND && on && lobbyistsNeedDistricts(cfg);
          const note = held ? ' Needed by Lobbyists at 5+ players.' : m.id === 'ketchup:lobbyists' && cfg.seatCount >= 5 ? ' Adds New Districts at 5+ players.' : '';
          return (
            <li key={m.id} class={`module ${on ? 'is-on' : ''}`}>
              <Toggle checked={on && !idle} disabled={!editable || Boolean(idle) || held} onChange={(b) => update(toggleModule(cfg, mods, m.id, b))} label={m.name} description={`${m.description} ${needs}${clash}${note}${idle ? ` ${idle}` : ''}`.trim()} />
              {on && Object.keys(m.options).length > 0 && <ModuleOptions module={m} cfg={cfg} editable={editable} onChange={update} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ModuleOptions({ module: m, cfg, editable, onChange }: { module: ModuleManifest; cfg: RoomConfig; editable: boolean; onChange: (c: RoomConfig) => void }) {
  const current = ((cfg.options as Record<string, Record<string, unknown> | undefined>)[m.id] ?? {}) as Record<string, unknown>;
  const set = (key: string, value: unknown) => onChange({ ...cfg, options: { ...cfg.options, [m.id]: { ...current, [key]: value } } });
  return (
    <div class="module-options">
      {Object.entries(m.options).map(([key, f]: [string, OptionField]) => {
        const v = current[key] ?? f.default;
        if (f.type === 'boolean') return <Toggle key={key} checked={Boolean(v)} disabled={!editable} onChange={(b) => set(key, b)} label={f.label} />;
        if (f.type === 'enum')
          return (
            <label key={key} class="field">
              <span class="field-label">{f.label}</span>
              <select class="input" disabled={!editable} value={String(v)} onChange={(e) => set(key, (e.currentTarget as HTMLSelectElement).value)}>
                {f.values.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        const arr = Array.isArray(v) ? (v as string[]) : [];
        return (
          <div key={key} class="field">
            <span class="field-label">{f.label}</span>
            <div class="chip-row">
              {f.values.map((o) => {
                const on = arr.includes(o.value);
                return (
                  <button key={o.value} type="button" class={`chip ${on ? 'is-on' : ''}`} disabled={!editable} aria-pressed={on} onClick={() => set(key, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
