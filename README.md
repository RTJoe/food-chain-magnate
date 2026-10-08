# Food Chain Magnate Online

An unofficial fan implementation of *Food Chain Magnate* (Splotter Spellen) for the browser: online multiplayer with a 3D board, hot-seat play on one device, and the Ketchup expansion modules.

![The 3D board during setup](screenshots/board-3d.png)

- 2–5 players (6 with the Ketchup "6 Players" module), Deluxe Edition rules.
- Play over the internet or a LAN (rooms with a 5-letter code and QR join link), or hot-seat on one device.
- Server-authoritative rules engine; reconnect and page reloads keep your seat.
- 3D board (Three.js) with highlighted legal spots for every placement, plus a 2D fallback when WebGL is missing.
- Undo of your own actions until hidden information is revealed.
- AI opponents at three levels (Easy, Medium, Hard), online or hot-seat.
- Learn to play: interactive lessons for the base game and each Ketchup module (`#/learn`), plus an in-game rules book and glossary.
- Spectators, in-room chat, and animated Dinnertime, marketing and payday sequences.

## Requirements

Node.js 22.12 or newer (24 recommended; production runs Node 24, see `.nvmrc`). Then:

```bash
npm install
```

## Running it

### Play on your network (LAN)

```bash
npm start
```

This builds everything and starts the server on port 3000. It prints the addresses to open, for example `http://192.168.1.20:3000`. Everyone on the same network opens that address. One player clicks **Create room**, the others join with the room code, the link, or the QR code shown in the lobby.

### Play online

Run the same server on a machine that is reachable from the internet (a VPS, or your own machine behind port forwarding), and share its address. Put it behind a TLS reverse proxy (Caddy, nginx) for `https://`; the WebSocket lives on the same origin at `/ws`.

Server settings (environment variables):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `FCM_DATA_DIR` | `./data` | Where room snapshots are saved (must be writable; the server exits at startup otherwise) |
| `FCM_PERSIST` | on | `0` disables saving; rooms then live only in memory |
| `FCM_ROOM_RETENTION_DAYS` | 30 | Delete a room's file after this many days without activity |
| `FCM_LOBBY_RETENTION_DAYS` | 2 | Same, for lobbies whose game never started |
| `FCM_BOT_DELAY_MS` | `400-900` | How long a bot waits before its first move of a turn (a range or one number); later moves in the same turn wait at most 150 ms, forced moves not at all |
| `FCM_BOT_WORKERS` | half the cores (1–4) | Worker threads that compute bot moves |
| `FCM_CLIENT_DIST` | `packages/client/dist` | Built client directory to serve |
| `FCM_ALLOWED_ORIGINS` | any | WebSocket Origin allowlist: `self` (same host as the page) or a comma-separated list of origins |
| `FCM_PUBLIC_URL` | none | Address printed in the startup banner instead of the LAN addresses (e.g. inside Docker) |
| `FCM_BUILD_ID` | none | Build id (git SHA) shown in logs, `/healthz`, `welcome` and saved rooms; the Docker build sets it from `GIT_SHA` |
| `FCM_MSG_RATE` / `FCM_MSG_BURST` | 20 / 60 | Messages per second (and burst) one connection may send |
| `FCM_CREATE_BURST` / `FCM_CREATE_REFILL_MS` | 10 / 30000 | New sessions and rooms one connection may create (burst, then one per interval) |
| `FCM_RESYNC_BURST` / `FCM_RESYNC_REFILL_MS` | 5 / 2000 | Full-state resyncs one connection may request (burst, then one per interval) |
| `FCM_JOIN_MISS_BURST` / `FCM_JOIN_MISS_REFILL_MS` | 10 / 3000 | Unknown room codes one connection may try (burst, then one per interval) |
| `FCM_MAX_SESSIONS` | 20000 | Sessions the server keeps in memory |
| `FCM_MAX_ROOMS` | 5000 | Rooms the server keeps (in memory or on disk) |
| `FCM_MAX_ACTION_BYTES` | 8192 | Largest accepted game action |
| `FCM_MAX_GAME_ACTIONS` | 20000 | Longest action log per game |
| `FCM_MAX_BUFFERED_KB` | 4096 | Unsent data after which a slow connection is dropped (it reconnects) |

Rooms are saved as `{config, seed, actions}` and replayed when the server restarts, so games survive a restart. If an update makes a saved move illegal, that game is rolled back to its last valid move (the original file is kept as `<id>.<timestamp>.bak`). Before deploying, `node packages/server/dist/checkSaves.js` lists the saves that would roll back (docs/architecture.md §4.5).

`GET /healthz` answers `{ ok, build, uptimeS, connections }` for health checks.

### Self-hosting with Docker

```bash
docker compose up -d --build --wait
```

This builds the image and serves the game on port 8090 (`FCM_PORT`), with saves in the named volume `food-chain-magnate_fcm-data` (mounted at `/data`). The container runs as the unprivileged `node` user with a read-only filesystem, no capabilities and a health check. Put a TLS reverse proxy or a tunnel (Caddy, nginx, Cloudflare Tunnel) in front of `http://<host>:8090`; the WebSocket is on the same origin at `/ws`, so the proxy must pass WebSocket upgrades.

Settings: put any variable from the table above that `docker-compose.yml` passes through (`FCM_PORT`, `FCM_ROOM_RETENTION_DAYS`, `FCM_LOBBY_RETENTION_DAYS`, `FCM_BOT_WORKERS`, `FCM_BOT_DELAY_MS`, `FCM_ALLOWED_ORIGINS`, `FCM_PUBLIC_URL`, `FCM_MEM_LIMIT`) in an untracked `.env` file next to it. Never edit the tracked compose file on the server, or `git pull` will conflict.

Deploy an update (tests first: `npm ci && npm run lint && npm test` on the commit, or a green CI run):

```bash
git pull --ff-only
export GIT_SHA=$(git rev-parse --short HEAD)
docker tag food-chain-magnate:latest food-chain-magnate:previous 2>/dev/null || true
docker compose build
docker compose run --rm --no-deps fcm node packages/server/dist/checkSaves.js   # exit 1 = some saves would roll back
docker compose up -d --wait   # fails if the new container never becomes healthy
docker image prune -f
```

Roll back to the previous image: `docker tag food-chain-magnate:previous food-chain-magnate:latest && docker compose up -d --no-build --wait`. Or check out an older commit and deploy it as above.

Back up the saves:

```bash
docker run --rm -v food-chain-magnate_fcm-data:/data -v "$PWD":/b alpine tar czf /b/fcm-data-$(date +%F).tgz -C /data .
```

Upgrading from an image older than the non-root one: the existing volume is owned by root, and the server would exit with `FATAL: cannot write /data/rooms`. Fix the ownership once before deploying:

```bash
docker run --rm -v food-chain-magnate_fcm-data:/data alpine chown -R 1000:1000 /data
```

### Hot-seat (one device)

Start the app (`npm start`, or `npm run dev` below), choose **Hot-seat** on the home screen, pick the player count and modules, and start. The app shows a "pass the device" screen between players so private choices (reserve card, structure) stay hidden. Hot-seat games run entirely in the browser; the server only serves the files. Any seat can be a bot (Easy, Medium or Hard); bots think in a Web Worker and never get the device.

In an online lobby the host can put a bot on an empty seat (**Add bot ▾**). Bot seats are always ready, keep playing after a restart, and show a robot badge and "thinking…" while they decide.

### Development

```bash
npm run dev
```

Runs the server with live reload on port 3000 and the Vite dev server on port 5173 (open `http://localhost:5173`; it proxies `/ws` to the server). `#/dev` opens a gallery of canned game states for working on the UI without playing up to that point.

## Ketchup expansion modules

Choose modules in the room lobby (host) or the hot-seat setup.

| Module | What it adds |
| --- | --- |
| New Districts | Five new map tiles, including apartments that take double demand without limit. |
| Lobbyists | Lobbyists build roads (with roadworks) and parks; parks raise prices. |
| New Milestones | Seventeen new milestones replace the base ones. Not with Hard Choices. |
| Coffee | Baristas make coffee and open coffee shops; houses buy coffee on the way to dinner. |
| Kimchi | Kimchi Masters make kimchi in Cleanup; houses prefer chains that add a kimchi. |
| Sushi | Sushi cooks and chefs; garden houses eat sushi when a chain has enough. |
| Noodles | Noodle cooks and chefs; houses nobody can serve eat noodles instead. |
| Ketchup | Earn a $1 Dinnertime edge when a rival sells to demand you created. |
| Fry Chefs | Fry Chefs add $10 to every sale. |
| Mass Marketeers | Each Mass Marketeer at work adds an extra marketing phase. |
| Night Shift Managers | Employees without a salary work twice while a Night Shift Manager is at work. |
| Rural Marketeers | Giant billboards market to the rural area, reached through freeways. |
| Gourmet Food Critics | Gourmet guides market to every house with a garden. |
| Reserve Prices | Reserve cards set the base unit price after the first bank break. |
| Movie Stars | Movie stars choose turn order first and win dinnertime ties. |
| Hard Choices | Some base milestones disappear after turn 2 or 3. Not with New Milestones. |
| 6 Players | A sixth chain and a 4×6 map. Requires New Districts. |

The intro game (no reserve cards, no salaries, no milestones unless you turn them on, ends at the first bank break) is a toggle in the same settings.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Build everything and run the server (port 3000) |
| `npm run dev` | Server with live reload + Vite dev server (port 5173) |
| `npm test` | Unit, scenario and integration tests (Vitest) |
| `npm run e2e` | Build, then run the Playwright browser tests in `e2e/` against the real server |
| `npm run lint` | Import-boundary check plus a full typecheck |
| `npm run typecheck` | TypeScript only |
| `npm run build` | Compile all packages and build the client into `packages/client/dist` |
| `npm run fixtures` | Regenerate the engine's canned test states |
| `npm run ai:bench` | Play bot-vs-bot games and report win rates and timings (`docs/ai.md`) |
| `npm run ai:inspect` | Replay a traced bot game and inspect or re-run one decision |
| `npm run ai:gate` | Quick strength and legality gate for bot changes |

First time running the browser tests: `npx playwright install chromium`.

## How it is built

TypeScript monorepo (npm workspaces):

| Package | Role |
| --- | --- |
| `packages/engine` | The rules: a pure, deterministic reducer with seeded randomness, per-player redaction and a module system (base game + 17 Ketchup modules). No dependencies. |
| `packages/ai` | AI opponents: Easy, Medium and Hard. Pure TS on the engine; see `docs/ai.md`. |
| `packages/protocol` | WebSocket message types and zod schemas. |
| `packages/session` | Rooms, seats, undo and per-viewer fan-out, independent of the transport. |
| `packages/server` | Node HTTP + WebSocket server, static files, persistence. |
| `packages/client` | Vite app: Preact + signals overlay UI and the Three.js board. |

Design and rules documents:

- `docs/architecture.md`: structure, engine API, protocol, client layers.
- `docs/protocol.md`: every wire message.
- `docs/ai.md`: AI opponents: the bot interface, where bots run, testing and benchmarks.
- `docs/ai-strategy.md`: how Medium and Hard play, and the measurements behind them.
- `docs/rules/`: the rules specs the engine follows (base game, employees, milestones, map, Ketchup); `docs/rules/questions.md` lists rules questions and how they were settled.
- `docs/ux-plan.md`, `docs/animation-plan.md`, `docs/tutorial-plan.md`: UI, animation and Learn-to-play designs.
- `docs/visual-style.md`, `docs/art-bible.md`: palette, 3D style and art direction.

## Credits

*Food Chain Magnate* is designed by Jeroen Doumen and Joris Wiersinga and published by Splotter Spellen. This is an unofficial fan project, not affiliated with or endorsed by Splotter Spellen. The game's name, rules and design belong to Splotter Spellen; the rulebooks are not included in this repository. All art in this project is original.
