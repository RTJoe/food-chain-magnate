import { useSignal } from '@preact/signals';
import type { ModuleId, ModuleManifest, OptionField } from '@fcm/engine';
import type { BotLevel, RoomConfig, RoomInfo, Seat } from '@fcm/protocol';
import { availableModules } from '../state/engine.js';
import { FALLBACK_MODULES } from '../state/fallbackContent.js';
import { joinUrl, navigate } from '../state/router.js';
import { amHost, clientId, connection, mySeat, room, roomError, settings, updateSettings } from '../state/store.js';
import { addBot, displayName, joinRoom, kick, leaveRoom, removeBot, setReady, setRoomConfig, sit, stand, startGame, startOnline } from '../net/session.js';
import { Button, IconButton, Pill, Section, SeatBadge, Segmented, Toggle } from './common.js';
import { Icon, Logo } from './icons.js';
import { QrCode } from './QrCode.js';
import { ChatBox } from './Chat.js';
import { BOT_LEVELS, BotBadge } from './bots.js';

/** Modules offered in the lobby: the engine's list when it has expansion modules, else the fallback list. */
export function lobbyModules(): ModuleManifest[] {
  const list = (availableModules() ?? []).filter((m) => m.id !== 'base');
  return list.length ? list : [...FALLBACK_MODULES];
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
        <p class="hint">{status === 'open' ? 'Connected' : status === 'idle' ? '' : `Server: ${status}`}</p>
      </form>
    </main>
  );
}

function LobbyRoom({ room: r }: { room: RoomInfo }) {
  const host = amHost.value;
  const seat = mySeat.value;
  const seated = r.seats.filter((s) => s.clientId !== null || s.bot);
  const allReady = seated.length >= 2 && seated.every((s) => s.ready);
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
          <p class="muted small">Anyone on this network can join with the link or code.</p>
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
              {seated.length}/{r.config.seatCount} seated · pick a seat to pick your colour
            </span>
          </div>
          <ul class="seat-list">
            {r.seats.slice(0, r.config.seatCount).map((s) => (
              <SeatRow key={s.index} seat={s} room={r} mine={seat?.index === s.index} host={host} />
            ))}
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
              <p class="muted small">
                You are watching as <b>{displayName()}</b>. Take an open seat to play.
              </p>
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
          {bot && <BotBadge level={bot} />}
          {isHost && <span title="Host">{Icon.crown({ size: 14 })}</span>}
          {mine && <span class="muted small"> (you)</span>}
        </span>
        <span class="seat-sub">
          {!open && <span class={`dot ${s.connected ? 'is-on' : 'is-off'}`} aria-label={s.connected ? 'Online' : 'Offline'} />}
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

/** Applies a module toggle with `requires`/`conflicts` (sixPlayers needs newDistricts; hardChoices vs newMilestones). */
export function toggleModule(cfg: RoomConfig, mods: readonly ModuleManifest[], id: ModuleId, on: boolean): RoomConfig {
  const set = new Set(cfg.modules);
  const byId = new Map(mods.map((m) => [m.id, m]));
  if (on) {
    const add = (m: ModuleId) => {
      if (set.has(m)) return;
      set.add(m);
      for (const c of byId.get(m)?.conflicts ?? []) set.delete(c);
      for (const r of byId.get(m)?.requires ?? []) add(r);
    };
    add(id);
  } else {
    const drop = (m: ModuleId) => {
      set.delete(m);
      for (const other of mods) if (set.has(other.id) && other.requires.includes(m)) drop(other.id);
    };
    drop(id);
  }
  let seatCount = cfg.seatCount;
  if (!set.has('ketchup:sixPlayers') && seatCount > 5) seatCount = 5;
  return { ...cfg, modules: mods.map((m) => m.id).filter((m) => set.has(m)), seatCount };
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
            update(next);
          }}
          options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n), disabled: !editable }))}
        />
      </div>
      <Toggle
        checked={cfg.intro}
        disabled={!editable}
        onChange={(b) => update({ ...cfg, intro: b, introMilestones: b ? cfg.introMilestones : false })}
        label="Intro game"
        description="No reserve cards and no salaries; the game ends when the bank first breaks."
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
      <ul class="module-list">
        {mods.map((m) => {
          const on = cfg.modules.includes(m.id);
          const needs = m.requires.length ? `Needs ${m.requires.map((x) => mods.find((y) => y.id === x)?.name ?? x).join(', ')}. ` : '';
          const clash = m.conflicts.length ? `Not with ${m.conflicts.map((x) => mods.find((y) => y.id === x)?.name ?? x).join(', ')}.` : '';
          return (
            <li key={m.id} class={`module ${on ? 'is-on' : ''}`}>
              <Toggle checked={on} disabled={!editable} onChange={(b) => update(toggleModule(cfg, mods, m.id, b))} label={m.name} description={`${m.description} ${needs}${clash}`.trim()} />
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
