# Drone Arena — 3D Multiplayer (Design)

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Replaces:** the local-only 2D `public/examples/drone-arena/index.html`

## Goal

Turn the existing 2D local-multiplayer drone game into a **real-time online
multiplayer 3D game**: players fly drones through a neon city of buildings and
dogfight other real people (and AI bots) in one shared arena, reachable from the
examples gallery on the landing page.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Multiplayer backend | Cloudflare **Durable Object** game room (idiomatic for this Worker stack; no third-party accounts) |
| Matchmaking | **One shared global arena** — everyone joins the same world; bots fill it when humans are few |
| Camera / controls | **Third-person chase cam**; WASD fly · mouse steer/aim · click fire · Space/Shift altitude |
| Netcode model | **Relay + thin authority** (option A): clients own their own movement; the DO owns HP/score/respawn + bots and broadcasts snapshots |
| 3D engine | **Three.js**, pinned version, loaded via CDN importmap |
| Scope of the example | **Replaces** the 2D version (single drone-arena example, now 3D + online) |

### Accepted trade-offs
1. This example is no longer a pure self-contained HTML file — it requires the DO
   **and** loads Three.js from a CDN. Multiplayer inherently needs both.
2. A busy public arena accrues DO duration cost **while players are connected**;
   idle cost is zero (the tick loop stops when the room empties).
3. Relay netcode means a determined cheater could spoof their own position. This
   is acceptable for a gallery demo; HP/score remain server-tracked so the
   scoreboard stays consistent.

## Architecture

Three units, each independently understandable:

### 1. Client — `public/examples/drone-arena/index.html`
Self-contained HTML/JS (plus Three.js from CDN). Responsibilities:
- **Rendering:** Three.js scene — procedural neon city, drones, lasers,
  particles, name/HP sprites, chase camera with smoothing, fog + gradient sky.
- **Local simulation:** integrates *the local player's* drone physics and
  bullets; client-side collision of the local drone and its bullets against
  buildings (buildings are cover).
- **Input:** WASD + mouse + click + Space/Shift; pointer-lock optional.
- **Networking:** one WebSocket to `/examples/drone-arena/ws`; sends own state +
  events; receives snapshots; **interpolates** remote players and bots between
  snapshots.
- **HUD/menus:** name entry + "Join arena" screen, live scoreboard, connection
  state (connecting / reconnecting / players online), respawn overlay.

### 2. Server — `src/gameroom.ts` (Durable Object `GameRoom`)
One instance addressed by `idFromName("global")`. Responsibilities:
- Accept/track WebSocket connections; assign each a short player id + spawn.
- Hold authoritative shared truth: per-player HP & score, alive/respawn timers,
  and **server-simulated bot** entities.
- Hold each player's last-reported transform (used only to build snapshots).
- Run a **~15 Hz tick** (via in-memory `setInterval`) only while ≥1 client is
  connected: advance bot AI, resolve queued hit/death/respawn, broadcast a
  `snapshot`. Clear the interval when the last client disconnects.
- Enforce limits (see "Abuse & limits").

### 3. Wiring — `src/index.ts` + `wrangler.toml`
- `src/index.ts`: before static-asset fallback, if
  `path === "/examples/drone-arena/ws"` and the request is a WebSocket upgrade,
  forward to the `GameRoom` DO (`idFromName("global")`). All other
  `/examples/drone-arena/*` paths fall through to `env.ASSETS.fetch` unchanged.
- `wrangler.toml`: add `[[durable_objects.bindings]]` (`GAME_ROOM` → `GameRoom`)
  and a `[[migrations]]` entry (`new_classes = ["GameRoom"]`). No SQLite storage
  needed — arena state is transient/in-memory.

## Network protocol (JSON over WebSocket)

All messages are `{ t: <type>, ... }`. Numbers are rounded before send to keep
snapshots small.

**Client → Server**
- `join { name }` — sent once on open. Server replies `welcome`.
- `state { p:[x,y,z], q:[x,y,z,w], v:[x,y,z] }` — ~15 Hz, local drone transform.
- `fire { o:[x,y,z], d:[x,y,z] }` — visual only on server; relayed in next event/snapshot for tracers.
- `hit { id }` — shooter-detected hit on player/bot `id`. Server validates
  (target exists, alive, not self, not invulnerable, rate-sane) and applies damage.
- `respawn` — request respawn after death.

**Server → Client**
- `welcome { id, seed, you:{hp,score}, killsToWin }` — `seed` drives deterministic
  city generation so all clients share the same layout.
- `snapshot { players:[{id,name,p,q,hp,alive}], bots:[{id,p,q,hp,alive}], scores:[{id,name,score}] }` — ~15 Hz.
- `event { k:'kill'|'hit'|'join'|'leave'|'fire'|'respawn', ... }` — discrete
  effects (kill feed, hit flashes, tracer for remote fire, join/leave).

`seed` + deterministic generation means **no geometry is sent over the wire**;
cover lines up identically for every player.

## Gameplay

- Continuous arena; **first to N kills** (e.g. 15) triggers a brief round banner
  and resets scores; play never stops.
- Drone: glowing quad model, thruster glow, banking on turn. Lasers = tracer
  beams with short lifetime. Death = particle explosion; respawn at a
  server-chosen open spawn with brief invulnerability (shield shader/flash).
- Buildings are solid for the local drone and block its bullets → real cover and
  vertical play (fly over/around). Remote drones are interpolated; their bullets
  are shooter-authoritative (we trust `hit`).
- **Bots** (server-simulated) top the arena up to a small target headcount when
  humans are few, so the gallery demo is never empty. Simple seek/strafe/fire AI
  with wall avoidance, mirroring the 2D version's behavior in 3D.

## Abuse & limits (public, unauthenticated WS endpoint)

- Single global room; **cap concurrent players** (e.g. 24) — excess get a "full"
  message and close. Cap bots (e.g. arena target 6 entities total).
- **Per-connection message-rate cap** (token bucket); drop/disconnect floods.
- Validate & clamp every field: finite numbers, position clamped to arena bounds,
  name length ≤ 16 and sanitized, known message types only; ignore malformed.
- `hit` sanity: cooldown per shooter, target must be alive & in range of where the
  server last saw both entities (loose check — rejects egregious spoofing).
- Mirrors the project's existing defensive style (see `src/blocklist.ts`,
  `src/upload.ts` validation).

## Error handling & resilience

- Client auto-reconnects with backoff on socket close; HUD shows
  connecting/reconnecting/online. On reconnect, a fresh `join` + new id.
- Server removes a player on socket close/error, broadcasts `leave`, and clears
  the tick interval when empty.
- Missing/blocked CDN (no Three.js): client shows a friendly "couldn't load 3D
  engine — check your connection" panel instead of a blank page.
- WebSocket upgrade only; non-upgrade requests to `…/ws` get `426 Upgrade Required`.

## File layout

| File | Change |
| --- | --- |
| `public/examples/drone-arena/index.html` | **Replaced** — Three.js client + game + networking |
| `src/gameroom.ts` | **New** — `GameRoom` Durable Object + WS handling |
| `src/index.ts` | **Edit** — route `…/drone-arena/ws` upgrades to the DO |
| `wrangler.toml` | **Edit** — DO binding + migration |
| `src/env.ts` | **Edit** — add `GAME_ROOM: DurableObjectNamespace` to `Env` |
| `public/index.html` | **Edit** — update the Drone Arena gallery card copy |

## Testing

- `npm run typecheck` (Worker + DO) must pass.
- **Networking smoke test:** a small Node WebSocket script against `wrangler dev`:
  open two clients, assert each gets `welcome` with distinct ids, that a `state`
  from one appears in the other's `snapshot`, and that a `hit` decrements the
  target's HP/awards score. Also assert malformed/oversized messages are rejected
  and the player cap closes excess connections.
- **Manual:** two browser windows — confirm both drones see each other move,
  shoot, take damage, die, respawn; bots appear when alone; reconnect works.
- Three.js rendering itself is not unit-tested (visual); verified by manual
  playtest. Networking and validation logic carry the automated coverage.

## Out of scope (YAGNI)

- Private rooms / room codes, accounts, persistence/leaderboards across sessions,
  voice/text chat, mobile/touch controls, server-authoritative physics,
  spectator mode. Can be follow-ups if desired.
