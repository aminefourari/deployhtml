# Drone Arena 3D Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local-only 2D drone example with a real-time online multiplayer 3D drone dogfight — players fly through a shared neon city and fight other people + AI bots, backed by a Cloudflare Durable Object.

**Architecture:** A `GameRoom` Durable Object is the single shared arena: it tracks each WebSocket player's reported transform, owns authoritative HP/score/respawn and server-simulated bots, and broadcasts world snapshots at ~15 Hz. Clients (Three.js, third-person chase cam) own their own movement, render the deterministic city from a server `seed`, interpolate remote entities, and report fire/hit events. Netcode is relay + thin-authority.

**Tech Stack:** Cloudflare Workers + Durable Objects (TypeScript), Three.js (pinned, CDN importmap), plain-JS browser client; tests via Node's built-in `node:test` runner through `tsx`, plus a `ws`-based integration smoke test.

**Spec:** `docs/superpowers/specs/2026-06-17-drone-arena-multiplayer-3d-design.md`

---

## Shared protocol (referenced by every task)

JSON over WebSocket; every message is `{ t: <type>, ... }`. Transforms are arrays.

**Client → Server**
- `{ t:"join", name:string }`
- `{ t:"state", p:[x,y,z], q:[x,y,z,w], v:[x,y,z] }` (~15 Hz)
- `{ t:"fire", o:[x,y,z], d:[x,y,z] }`
- `{ t:"hit", id:string }`
- `{ t:"respawn" }`

**Server → Client**
- `{ t:"welcome", id:string, seed:number, killsToWin:number, you:{hp,score} }`
- `{ t:"snapshot", players:[{id,name,p,q,hp,alive}], bots:[{id,p,q,hp,alive}], scores:[{id,name,score}] }` (~15 Hz)
- `{ t:"event", k:"kill"|"hit"|"join"|"leave"|"fire"|"respawn", ... }`

**Tunables (single source of truth, defined in `src/gamesim.ts`):**
`ARENA = 600` (half-extent on X/Z), `CEIL = 220`, `FLOOR = 2`, `MAX_PLAYERS = 24`, `BOT_TARGET = 6` (humans+bots topped up to this), `HP_MAX = 100`, `BULLET_DMG = 13`, `KILLS_TO_WIN = 15`, `INVULN_MS = 1500`, `RESPAWN_MS = 1600`, `TICK_MS = 66` (~15 Hz), `HIT_COOLDOWN_MS = 90`, `MSG_PER_SEC = 40`, `NAME_MAX = 16`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/gamesim.ts` | **New.** Pure, runtime-free logic: constants, `mulberry32`, `clampToArena`, `validateName`, `sanitizeState`, `RateLimiter`, `pickSpawn`, `stepBot`, `applyHit`. Unit-tested. |
| `src/gameroom.ts` | **New.** `GameRoom` Durable Object: WS lifecycle, in-memory entity maps, tick loop, snapshot broadcast. Uses `gamesim`. |
| `src/env.ts` | **Modify.** Add `GAME_ROOM: DurableObjectNamespace` to `Env`. |
| `src/index.ts` | **Modify.** Route `/examples/drone-arena/ws` WS upgrades to the DO; re-export `GameRoom`. |
| `wrangler.toml` | **Modify.** DO binding + migration. |
| `test/gamesim.test.ts` | **New.** Unit tests for `gamesim`. |
| `test/smoke.mjs` | **New.** Integration smoke test (two WS clients vs `wrangler dev`). |
| `public/examples/drone-arena/index.html` | **Replace.** Three.js client: scene, drone, chase cam, networking, combat, HUD. |
| `public/index.html` | **Modify.** Update the Drone Arena gallery-card copy. |
| `package.json` | **Modify.** Add `tsx`, `ws` devDeps; `test` + `test:smoke` scripts. |

---

## Task 1: Test tooling + Durable Object scaffolding (binding, migration, Env)

**Files:**
- Modify: `package.json`
- Modify: `src/env.ts`
- Modify: `wrangler.toml`
- Create: `src/gameroom.ts` (minimal stub so the binding resolves)
- Modify: `src/index.ts` (re-export the DO class)

- [ ] **Step 1: Add dev tooling + scripts to `package.json`**

Add to `devDependencies`: `"tsx": "^4.19.2"`, `"ws": "^8.18.0"`, `"@types/ws": "^8.5.13"`.
Add to `scripts`:
```json
"test": "tsx --test test/*.test.ts",
"test:smoke": "node test/smoke.mjs"
```
Then run: `npm install`
Expected: installs without error.

- [ ] **Step 2: Add the DO namespace to `Env`**

In `src/env.ts`, add this field to the `Env` interface (place near the other bindings):
```ts
  GAME_ROOM: DurableObjectNamespace;
```

- [ ] **Step 3: Minimal `GameRoom` stub in `src/gameroom.ts`**

```ts
import { Env } from "./env";

// Single shared arena. Filled out in Tasks 3-4.
export class GameRoom {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Upgrade Required", { status: 426 });
    }
    return new Response("not implemented", { status: 501 });
  }
}
```

- [ ] **Step 4: Re-export the class from the Worker entry**

In `src/index.ts`, add near the top (after existing imports):
```ts
export { GameRoom } from "./gameroom";
```

- [ ] **Step 5: Wire the binding + migration in `wrangler.toml`**

Append:
```toml
[[durable_objects.bindings]]
name = "GAME_ROOM"
class_name = "GameRoom"

[[migrations]]
tag = "v1"
new_classes = ["GameRoom"]
```

- [ ] **Step 6: Verify it typechecks and the DO is recognized**

Run: `npm run typecheck`
Expected: PASS (no errors).
Run: `npx wrangler deploy --dry-run --outdir /tmp/dh-dryrun`
Expected: dry-run succeeds and lists the `GameRoom` Durable Object binding.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/env.ts src/gameroom.ts src/index.ts wrangler.toml
git commit -m "Scaffold GameRoom Durable Object binding + test tooling"
```

---

## Task 2: Pure simulation logic in `src/gamesim.ts` (TDD)

All logic here is runtime-free (no `DurableObjectState`, no globals), so it unit-tests cleanly.

**Files:**
- Create: `src/gamesim.ts`
- Test: `test/gamesim.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/gamesim.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARENA, CEIL, FLOOR, NAME_MAX, HP_MAX, BULLET_DMG, INVULN_MS,
  mulberry32, clampToArena, validateName, sanitizeState, RateLimiter,
  pickSpawn, applyHit,
} from "../src/gamesim.ts";

test("mulberry32 is deterministic for a seed", () => {
  const a = mulberry32(123), b = mulberry32(123);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test("clampToArena keeps points inside bounds", () => {
  const p = clampToArena([99999, 99999, -99999]);
  assert.ok(p[0] <= ARENA && p[0] >= -ARENA);
  assert.ok(p[1] <= CEIL && p[1] >= FLOOR);
  assert.ok(p[2] <= ARENA && p[2] >= -ARENA);
});

test("validateName trims, caps length, rejects empties", () => {
  assert.equal(validateName("  Ace  "), "Ace");
  assert.equal(validateName("x".repeat(50)).length, NAME_MAX);
  assert.equal(validateName(""), "Pilot");
  assert.equal(validateName(123 as unknown as string), "Pilot");
  assert.ok(!validateName("<b>hi</b>").includes("<"));
});

test("sanitizeState rejects non-finite / wrong-shape and clamps", () => {
  assert.equal(sanitizeState({ p: [0, NaN, 0], q: [0,0,0,1], v: [0,0,0] }), null);
  assert.equal(sanitizeState({ p: [0,0], q: [0,0,0,1], v: [0,0,0] }), null);
  const ok = sanitizeState({ p: [10, 5, 10], q: [0,0,0,1], v: [1,1,1] });
  assert.ok(ok && ok.p[1] === 5);
});

test("RateLimiter allows a burst then blocks, refills over time", () => {
  const rl = new RateLimiter(5, 5); // 5 tokens, 5/sec
  let allowed = 0;
  for (let i = 0; i < 8; i++) if (rl.allow(0)) allowed++;
  assert.equal(allowed, 5);
  assert.ok(rl.allow(1000)); // ~1s later refilled
});

test("pickSpawn returns an in-bounds point away from others", () => {
  const rng = mulberry32(7);
  const others = [[0,50,0], [100,50,100]] as [number,number,number][];
  const s = pickSpawn(rng, others);
  assert.ok(s[0] >= -ARENA && s[0] <= ARENA);
  assert.ok(s[1] >= FLOOR && s[1] <= CEIL);
});

test("applyHit decrements hp, ignores invuln, reports death", () => {
  const ent = { hp: HP_MAX, alive: true, invulnUntil: 0 };
  const r1 = applyHit(ent, 1000);
  assert.equal(ent.hp, HP_MAX - BULLET_DMG);
  assert.equal(r1.died, false);
  ent.invulnUntil = 2000;
  applyHit(ent, 1500);
  assert.equal(ent.hp, HP_MAX - BULLET_DMG); // unchanged while invulnerable
  ent.invulnUntil = 0; ent.hp = 5;
  const r2 = applyHit(ent, 3000);
  assert.equal(r2.died, true);
  assert.equal(ent.alive, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/gamesim.ts'` / exports undefined.

- [ ] **Step 3: Implement `src/gamesim.ts`**

```ts
// Pure, runtime-free game logic. No Workers globals here so it unit-tests
// directly with node:test via tsx.

export const ARENA = 600;       // half-extent on X and Z
export const CEIL = 220;        // max altitude
export const FLOOR = 2;         // min altitude
export const MAX_PLAYERS = 24;
export const BOT_TARGET = 6;    // humans + bots topped up to this
export const HP_MAX = 100;
export const BULLET_DMG = 13;
export const KILLS_TO_WIN = 15;
export const INVULN_MS = 1500;
export const RESPAWN_MS = 1600;
export const TICK_MS = 66;      // ~15 Hz
export const HIT_COOLDOWN_MS = 90;
export const MSG_PER_SEC = 40;
export const NAME_MAX = 16;

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

// Deterministic PRNG (mulberry32). Same seed -> same sequence on every client.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function clampToArena(p: Vec3): Vec3 {
  return [clampN(p[0], -ARENA, ARENA), clampN(p[1], FLOOR, CEIL), clampN(p[2], -ARENA, ARENA)];
}

export function validateName(name: string): string {
  if (typeof name !== "string") return "Pilot";
  const cleaned = name.replace(/[<>&"'`]/g, "").trim().slice(0, NAME_MAX);
  return cleaned.length ? cleaned : "Pilot";
}

export interface StateMsg { p: Vec3; q: Quat; v: Vec3; }

export function sanitizeState(m: unknown): StateMsg | null {
  const o = m as Partial<StateMsg>;
  if (!o || !Array.isArray(o.p) || !Array.isArray(o.q) || !Array.isArray(o.v)) return null;
  if (o.p.length !== 3 || o.q.length !== 4 || o.v.length !== 3) return null;
  if (![...o.p, ...o.q, ...o.v].every(finite)) return null;
  return { p: clampToArena(o.p as Vec3), q: o.q as Quat, v: o.v as Vec3 };
}

// Token-bucket rate limiter; `now` is ms (passed in so it's testable).
export class RateLimiter {
  private tokens: number;
  private last = 0;
  constructor(private capacity: number, private perSec: number) { this.tokens = capacity; }
  allow(now: number): boolean {
    if (this.last === 0) this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    return false;
  }
}

export function pickSpawn(rng: () => number, others: Vec3[]): Vec3 {
  let best: Vec3 = [0, 60, 0], bestMin = -1;
  for (let i = 0; i < 12; i++) {
    const c: Vec3 = [
      (rng() * 2 - 1) * ARENA * 0.85,
      FLOOR + rng() * (CEIL - FLOOR) * 0.7 + 40,
      (rng() * 2 - 1) * ARENA * 0.85,
    ];
    let nearest = Infinity;
    for (const o of others) {
      const d = Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestMin) { bestMin = nearest; best = c; }
  }
  return clampToArena(best);
}

export interface Damageable { hp: number; alive: boolean; invulnUntil: number; }

export function applyHit(ent: Damageable, now: number): { applied: boolean; died: boolean } {
  if (!ent.alive || now < ent.invulnUntil) return { applied: false, died: false };
  ent.hp -= BULLET_DMG;
  if (ent.hp <= 0) { ent.hp = 0; ent.alive = false; return { applied: true, died: true }; }
  return { applied: true, died: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Add the bot-AI step (TDD)**

Append to `test/gamesim.test.ts`:
```ts
import { stepBot } from "../src/gamesim.ts";

test("stepBot moves a bot toward its target and stays in bounds", () => {
  const bot = { p: [0,60,0] as Vec3, q: [0,0,0,1] as Quat, v: [0,0,0] as Vec3,
                hp: 100, alive: true, invulnUntil: 0, fireAt: 0 };
  const target = { p: [200,60,0] as Vec3 };
  const before = bot.p[0];
  const out = stepBot(bot, target, 0.066, 1000, mulberry32(1));
  assert.ok(bot.p[0] > before);                 // moved toward +X target
  assert.ok(bot.p[0] <= ARENA && bot.p[1] <= CEIL && bot.p[1] >= FLOOR);
  assert.equal(typeof out.fired, "boolean");
});

test("stepBot with no target just drifts in bounds", () => {
  const bot = { p: [0,60,0] as Vec3, q: [0,0,0,1] as Quat, v: [0,0,0] as Vec3,
                hp: 100, alive: true, invulnUntil: 0, fireAt: 0 };
  const out = stepBot(bot, null, 0.066, 1000, mulberry32(2));
  assert.equal(out.fired, false);
  assert.ok(bot.p[1] >= FLOOR && bot.p[1] <= CEIL);
});
```

- [ ] **Step 6: Run to verify the new tests fail**

Run: `npm test`
Expected: FAIL — `stepBot` is not exported.

- [ ] **Step 7: Implement `stepBot` in `src/gamesim.ts`**

```ts
export interface Bot {
  p: Vec3; q: Quat; v: Vec3; hp: number; alive: boolean; invulnUntil: number; fireAt: number;
}

const BOT_SPEED = 120;     // units/sec target speed
const BOT_FIRE_RANGE = 420;

// Advance one bot toward `target` (or drift). Mutates bot.p/v. Returns whether
// it fired this tick (server turns that into a hit roll elsewhere).
export function stepBot(
  bot: Bot, target: { p: Vec3 } | null, dt: number, now: number, rng: () => number,
): { fired: boolean } {
  // desired direction: toward target, plus a little wander, plus wall avoidance
  let dx = 0, dy = 0, dz = 0, dist = Infinity;
  if (target) {
    dx = target.p[0] - bot.p[0]; dy = target.p[1] - bot.p[1]; dz = target.p[2] - bot.p[2];
    dist = Math.hypot(dx, dy, dz) || 1;
    dx /= dist; dy /= dist; dz /= dist;
  } else {
    dx = rng() * 2 - 1; dz = rng() * 2 - 1;
  }
  // keep a fighting distance: back off if very close
  const approach = dist > 180 ? 1 : dist < 90 ? -0.5 : 0.2;
  const m = 120;
  if (bot.p[0] < -ARENA + m) dx += 0.8; if (bot.p[0] > ARENA - m) dx -= 0.8;
  if (bot.p[2] < -ARENA + m) dz += 0.8; if (bot.p[2] > ARENA - m) dz -= 0.8;
  if (bot.p[1] < FLOOR + 30) dy += 0.6; if (bot.p[1] > CEIL - 30) dy -= 0.6;

  const sp = BOT_SPEED * approach;
  bot.v = [dx * sp, dy * sp * 0.5, dz * sp];
  bot.p = clampToArena([bot.p[0] + bot.v[0] * dt, bot.p[1] + bot.v[1] * dt, bot.p[2] + bot.v[2] * dt]);

  // face travel direction (yaw only) for a plausible quaternion
  const yaw = Math.atan2(bot.v[0], bot.v[2]);
  bot.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

  let fired = false;
  if (target && dist < BOT_FIRE_RANGE && now >= bot.fireAt && rng() < 0.5) {
    bot.fireAt = now + 300 + rng() * 400;
    fired = true;
  }
  return { fired };
}
```

- [ ] **Step 8: Run tests to verify all pass**

Run: `npm test`
Expected: PASS — all 9 tests green.

- [ ] **Step 9: Commit**

```bash
git add src/gamesim.ts test/gamesim.test.ts
git commit -m "Add pure game-sim logic with unit tests"
```

---

## Task 3: `GameRoom` connection lifecycle (join / welcome / leave)

**Files:**
- Modify: `src/gameroom.ts`

- [ ] **Step 1: Implement WS accept + player registry + welcome/leave**

Replace `src/gameroom.ts` with:
```ts
import { Env } from "./env";
import {
  Vec3, Quat, MAX_PLAYERS, HP_MAX, KILLS_TO_WIN, INVULN_MS,
  mulberry32, validateName, sanitizeState, RateLimiter, pickSpawn,
} from "./gamesim";

interface Player {
  id: string;
  name: string;
  ws: WebSocket;
  p: Vec3; q: Quat;
  hp: number; alive: boolean; invulnUntil: number;
  score: number;
  rl: RateLimiter;
  hitAt: number;
}

export class GameRoom {
  private players = new Map<string, Player>();
  private seed = Math.floor(Math.random() * 1e9);
  private nextId = 1;
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Upgrade Required", { status: 426 });
    }
    if (this.players.size >= MAX_PLAYERS) {
      return new Response("Arena full", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.onOpen(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private onOpen(ws: WebSocket) {
    const id = "p" + this.nextId++;
    const rng = mulberry32(this.seed ^ (this.nextId * 2654435761));
    const others = [...this.players.values()].map((p) => p.p);
    const spawn = pickSpawn(rng, others);
    const player: Player = {
      id, name: "Pilot", ws, p: spawn, q: [0, 0, 0, 1],
      hp: HP_MAX, alive: true, invulnUntil: Date.now() + INVULN_MS,
      score: 0, rl: new RateLimiter(60, 40), hitAt: 0,
    };
    this.players.set(id, player);

    ws.addEventListener("message", (e) => this.onMessage(player, e.data));
    ws.addEventListener("close", () => this.onClose(player));
    ws.addEventListener("error", () => this.onClose(player));

    this.send(ws, { t: "welcome", id, seed: this.seed, killsToWin: KILLS_TO_WIN, you: { hp: HP_MAX, score: 0 } });
    this.startTick();
  }

  private onMessage(player: Player, raw: unknown) {
    if (!player.rl.allow(Date.now())) return;
    let msg: any;
    try { msg = JSON.parse(typeof raw === "string" ? raw : ""); } catch { return; }
    if (!msg || typeof msg.t !== "string") return;

    if (msg.t === "join") {
      player.name = validateName(msg.name);
      this.broadcast({ t: "event", k: "join", id: player.id, name: player.name });
    } else if (msg.t === "state") {
      const s = sanitizeState(msg);
      if (s) { player.p = s.p; player.q = s.q; }
    }
    // "fire" / "hit" / "respawn" handled in Task 4.
  }

  private onClose(player: Player) {
    this.players.delete(player.id);
    this.broadcast({ t: "event", k: "leave", id: player.id });
    if (this.players.size === 0) this.stopTick();
  }

  // Tick loop scaffold; snapshot body added in Task 4.
  private startTick() {
    if (this.tick) return;
    this.tick = setInterval(() => this.onTick(), 66);
  }
  private stopTick() {
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
  }
  private onTick() { /* filled in Task 4 */ }

  private send(ws: WebSocket, obj: unknown) {
    try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ }
  }
  private broadcast(obj: unknown) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) { try { p.ws.send(s); } catch { /* ignore */ } }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/gameroom.ts
git commit -m "GameRoom: WS connection lifecycle (join/welcome/leave)"
```

---

## Task 4: `GameRoom` snapshots, combat, respawn, bots

**Files:**
- Modify: `src/gameroom.ts`

- [ ] **Step 1: Add bot state + fire/hit/respawn handling + the tick body**

In `src/gameroom.ts`, extend imports:
```ts
import {
  Vec3, Quat, MAX_PLAYERS, BOT_TARGET, HP_MAX, KILLS_TO_WIN, INVULN_MS, RESPAWN_MS,
  HIT_COOLDOWN_MS, Bot, mulberry32, validateName, sanitizeState, RateLimiter,
  pickSpawn, applyHit, stepBot,
} from "./gamesim";
```

Add fields to the class:
```ts
  private bots = new Map<string, Bot & { id: string; name: string; deadUntil: number }>();
  private botSeq = 1;
  private rng = mulberry32(this.seed ^ 0x9e3779b9);
```

Add `fire`/`hit`/`respawn` branches inside `onMessage` (after the `state` branch):
```ts
    else if (msg.t === "fire") {
      // relay tracer to others; server doesn't simulate the bullet
      this.broadcastExcept(player.id, { t: "event", k: "fire", id: player.id, o: msg.o, d: msg.d });
    } else if (msg.t === "hit") {
      const now = Date.now();
      if (now - player.hitAt < HIT_COOLDOWN_MS) return;
      player.hitAt = now;
      this.resolveHit(player, String(msg.id), now);
    } else if (msg.t === "respawn") {
      if (!player.alive) this.respawnPlayer(player);
    }
```

Add these methods:
```ts
  private resolveHit(shooter: Player, targetId: string, now: number) {
    const tp = this.players.get(targetId);
    const tb = this.bots.get(targetId);
    const target = tp ?? tb;
    if (!target || targetId === shooter.id) return;
    const res = applyHit(target as any, now);
    if (!res.applied) return;
    this.broadcast({ t: "event", k: "hit", id: targetId, by: shooter.id });
    if (res.died) {
      shooter.score += 1;
      this.broadcast({ t: "event", k: "kill", by: shooter.id, byName: shooter.name, id: targetId });
      if (tb) tb.deadUntil = now + RESPAWN_MS;     // bot auto-respawns on tick
      if (shooter.score >= KILLS_TO_WIN) {
        this.broadcast({ t: "event", k: "win", id: shooter.id, name: shooter.name });
        for (const p of this.players.values()) p.score = 0;
        for (const b of this.bots.values()) b.hp = HP_MAX;
      }
    }
  }

  private respawnPlayer(player: Player) {
    const others = [...this.players.values()].filter((p) => p !== player).map((p) => p.p);
    player.p = pickSpawn(this.rng, others);
    player.hp = HP_MAX; player.alive = true; player.invulnUntil = Date.now() + INVULN_MS;
  }

  private topUpBots() {
    const total = this.players.size + this.bots.size;
    for (let i = total; i < BOT_TARGET && this.players.size > 0; i++) {
      const id = "b" + this.botSeq++;
      this.bots.set(id, {
        id, name: "Bot", p: pickSpawn(this.rng, []), q: [0, 0, 0, 1], v: [0, 0, 0],
        hp: HP_MAX, alive: true, invulnUntil: 0, fireAt: 0, deadUntil: 0,
      });
    }
  }

  private broadcastExcept(exceptId: string, obj: unknown) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      try { p.ws.send(s); } catch { /* ignore */ }
    }
  }
```

Replace `onTick` with:
```ts
  private onTick() {
    const now = Date.now();
    if (this.players.size === 0) { this.stopTick(); return; }
    this.topUpBots();

    // advance bots; pick nearest living human as target
    const humans = [...this.players.values()].filter((p) => p.alive);
    for (const bot of this.bots.values()) {
      if (!bot.alive) {
        if (now >= bot.deadUntil) {
          bot.p = pickSpawn(this.rng, []); bot.hp = HP_MAX; bot.alive = true;
          bot.invulnUntil = now + INVULN_MS;
        }
        continue;
      }
      let target: { p: Vec3 } | null = null, best = Infinity;
      for (const h of humans) {
        const d = Math.hypot(h.p[0] - bot.p[0], h.p[1] - bot.p[1], h.p[2] - bot.p[2]);
        if (d < best) { best = d; target = { p: h.p }; }
      }
      const r = stepBot(bot, target, 0.066, now, this.rng);
      if (r.fired && target && best < 300 && this.rng() < 0.25) {
        // bot lands a probabilistic hit on its target human
        const victim = humans.find((h) => h.p === target!.p);
        if (victim) {
          const res = applyHit(victim as any, now);
          if (res.applied) {
            this.broadcast({ t: "event", k: "hit", id: victim.id, by: bot.id });
            if (res.died) {
              this.broadcast({ t: "event", k: "kill", by: bot.id, byName: "Bot", id: victim.id });
            }
          }
        }
      }
    }

    this.broadcast(this.snapshot());
  }

  private snapshot() {
    return {
      t: "snapshot",
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, p: round(p.p), q: round(p.q), hp: p.hp, alive: p.alive,
      })),
      bots: [...this.bots.values()].map((b) => ({
        id: b.id, p: round(b.p), q: round(b.q), hp: b.hp, alive: b.alive,
      })),
      scores: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score })),
    };
  }
```

Add a `round` helper at module scope (top of file, after imports):
```ts
const round = (a: number[]) => a.map((n) => Math.round(n * 100) / 100);
```

> Note: a dead human stays dead until they send `respawn` (client shows a respawn overlay). Bots auto-respawn after `RESPAWN_MS`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/gameroom.ts
git commit -m "GameRoom: snapshots, combat, respawn, server-simulated bots"
```

---

## Task 5: Route the WebSocket upgrade to the DO

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the route**

In `src/index.ts`, inside `fetch`, immediately BEFORE the `if (path === "/" || path === "/index.html")` block, add:
```ts
    if (path === "/examples/drone-arena/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Upgrade Required", { status: 426 });
      }
      const id = env.GAME_ROOM.idFromName("global");
      return env.GAME_ROOM.get(id).fetch(request);
    }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "Route /examples/drone-arena/ws to the GameRoom DO"
```

---

## Task 6: Integration smoke test (two WS clients vs `wrangler dev`)

**Files:**
- Create: `test/smoke.mjs`

- [ ] **Step 1: Write the smoke test**

`test/smoke.mjs`:
```js
import WebSocket from "ws";
import assert from "node:assert/strict";

const URL = process.env.WS_URL || "ws://127.0.0.1:8787/examples/drone-arena/ws";
const open = (label) => new Promise((res, rej) => {
  const ws = new WebSocket(URL);
  ws.on("open", () => res(ws));
  ws.on("error", rej);
  ws.label = label;
});
const next = (ws, type) => new Promise((res) => {
  const h = (raw) => { const m = JSON.parse(raw); if (!type || m.t === type) { ws.off("message", h); res(m); } };
  ws.on("message", h);
});

const a = await open("A");
const wa = await next(a, "welcome");
assert.equal(wa.t, "welcome"); assert.ok(wa.id); console.log("A welcome", wa.id);

const b = await open("B");
const wb = await next(b, "welcome");
assert.notEqual(wa.id, wb.id); console.log("B welcome", wb.id);
assert.equal(wa.seed, wb.seed, "both clients share the same world seed");

a.send(JSON.stringify({ t: "join", name: "Ace" }));
b.send(JSON.stringify({ t: "join", name: "Bee" }));

// A moves; B should see A's position in a snapshot
a.send(JSON.stringify({ t: "state", p: [123, 60, 45], q: [0,0,0,1], v: [0,0,0] }));
let sawA = false;
for (let i = 0; i < 20 && !sawA; i++) {
  const snap = await next(b, "snapshot");
  sawA = snap.players.some((p) => p.id === wa.id && Math.abs(p.p[0] - 123) < 1);
}
assert.ok(sawA, "B saw A's reported position via snapshot");
console.log("relay OK");

// B reports a hit on A; A's hp should drop in a later snapshot
b.send(JSON.stringify({ t: "hit", id: wa.id }));
let hurt = false;
for (let i = 0; i < 20 && !hurt; i++) {
  const snap = await next(b, "snapshot");
  const pa = snap.players.find((p) => p.id === wa.id);
  if (pa && pa.hp < 100) hurt = true;
}
assert.ok(hurt, "hit decremented target HP");
console.log("combat OK");

a.close(); b.close();
console.log("SMOKE PASS");
process.exit(0);
```

- [ ] **Step 2: Run it (expect connection failure first — server not running)**

Run: `npm run test:smoke`
Expected: FAIL — `ECONNREFUSED` (no dev server yet). This confirms the test actually connects.

- [ ] **Step 3: Start the dev server in another terminal, then run the smoke test**

Terminal 1: `npx wrangler dev --port 8787`
Terminal 2: `npm run test:smoke`
Expected: prints `A welcome … / B welcome … / relay OK / combat OK / SMOKE PASS` and exits 0.

> If `wrangler dev` complains about Durable Objects needing local mode, it runs locally by default; no remote resources are required for this DO (no storage).

- [ ] **Step 4: Commit**

```bash
git add test/smoke.mjs
git commit -m "Add WS integration smoke test for the arena"
```

---

## Task 7: Client scaffold — HTML, Three.js importmap, CDN guard, join screen

**Files:**
- Replace: `public/examples/drone-arena/index.html`

- [ ] **Step 1: Write the client shell**

Replace the file with the shell below. It loads Three.js via importmap, shows a join screen, and fails gracefully if the CDN is blocked. Game systems are added in Tasks 8-12 inside the marked region.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Drone Arena — 3D Multiplayer</title>
<meta name="description" content="A real-time multiplayer 3D drone dogfight. Fly through a neon city and battle other players and AI drones — built on Cloudflare Workers + Durable Objects.">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--p1:#38bdf8;--text:#e7eeff;--muted:rgba(231,238,255,.55);--panel:rgba(10,16,30,.86);--line:rgba(120,150,230,.25)}
  html,body{height:100%;background:#05070f;color:var(--text);font-family:"Space Grotesk",ui-monospace,Menlo,monospace;overflow:hidden}
  #c{position:fixed;inset:0;display:block}
  .overlay{position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(ellipse at 50% 35%,rgba(20,30,60,.5),rgba(5,7,15,.94) 70%)}
  .overlay[hidden]{display:none}
  .panel{width:min(460px,100%);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px;text-align:center}
  h1{font-size:34px;letter-spacing:-.02em;margin-bottom:8px;background:linear-gradient(100deg,#7dd3fc,#c4b5fd);-webkit-background-clip:text;background-clip:text;color:transparent}
  .tag{color:var(--muted);font-size:14px;margin-bottom:18px;line-height:1.5}
  input{width:100%;font:inherit;font-size:15px;color:var(--text);background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px;text-align:center}
  .btn{font:inherit;font-size:15px;font-weight:600;color:#06101e;background:linear-gradient(100deg,#7dd3fc,#38bdf8);border:0;border-radius:11px;padding:12px 26px;cursor:pointer;width:100%}
  .btn:hover{filter:brightness(1.08)}
  .keys{margin-top:16px;font-size:12px;color:var(--muted);line-height:1.7}
  kbd{display:inline-block;padding:1px 6px;background:rgba(255,255,255,.06);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px}
  /* HUD (Task 12) */
  #hud{position:fixed;inset:0;z-index:5;pointer-events:none;display:none}
  #scoreboard{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;font-size:13px}
  .chip{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:5px 10px}
  #status{position:absolute;top:12px;right:14px;font-size:12px;color:var(--muted)}
  #crosshair{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);border:1px solid rgba(125,211,252,.7);border-radius:50%}
  #respawn{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,7,15,.55);pointer-events:auto}
  #respawn .panel{cursor:pointer}
</style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hud">
    <div id="scoreboard"></div>
    <div id="status">connecting…</div>
    <div id="crosshair"></div>
    <div id="respawn"><div class="panel"><h1 style="font-size:26px">You were shot down</h1><p class="tag">Click to respawn</p></div></div>
  </div>
  <div class="overlay" id="join">
    <div class="panel">
      <h1>Drone Arena</h1>
      <p class="tag">Fly into a shared neon city and dogfight real players + AI drones.<br>Powered by Cloudflare Durable Objects.</p>
      <input id="name" maxlength="16" placeholder="Call sign" autocomplete="off">
      <button class="btn" id="play">Join the arena</button>
      <div class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly · mouse aim · click fire · <kbd>Space</kbd>/<kbd>Shift</kbd> altitude</div>
    </div>
  </div>
  <div class="overlay" id="err" hidden>
    <div class="panel"><h1 style="font-size:26px">Couldn't load 3D engine</h1><p class="tag">The Three.js library failed to load — check your connection and reload.</p></div>
  </div>

  <script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
  </script>
  <script type="module">
    let THREE;
    try {
      THREE = await import("three");
    } catch (e) {
      document.getElementById("err").hidden = false;
      throw e;
    }
    // ===== GAME CODE (Tasks 8-12) starts here =====
    const joinScreen = document.getElementById("join");
    document.getElementById("play").addEventListener("click", () => {
      const name = (document.getElementById("name").value || "Pilot").slice(0, 16);
      joinScreen.hidden = true;
      document.getElementById("hud").style.display = "block";
      startGame(name);   // defined progressively in later tasks
    });
    function startGame(name) { console.log("joining as", name); }
    // ===== GAME CODE ends here =====
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify it loads (manual)**

Run: `npx wrangler dev --port 8787`, open `http://127.0.0.1:8787/examples/drone-arena/`.
Expected: join screen renders; entering a name + clicking "Join" hides the overlay and logs `joining as <name>` in the console. (Blank black canvas is expected until Task 8.)

- [ ] **Step 3: Commit**

```bash
git add public/examples/drone-arena/index.html
git commit -m "Drone Arena client: shell, Three.js importmap, join screen, CDN guard"
```

---

## Task 8: Client — deterministic neon city, ground, sky, lights

**Files:**
- Modify: `public/examples/drone-arena/index.html`

- [ ] **Step 1: Replace the `startGame` stub with renderer + world builder**

Inside the module, replace `function startGame(name){…}` with:
```js
  const mulberry32 = (seed) => { let a = seed>>>0; return () => {
    a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296; }; };
  const ARENA = 600, CEIL = 220;

  let renderer, scene, camera, buildings = [];
  function initWorld(seed) {
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    scene.fog = new THREE.Fog(0x05070f, 300, 1200);
    camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 3000);

    scene.add(new THREE.HemisphereLight(0x335577, 0x0a0a18, 1.1));
    const key = new THREE.DirectionalLight(0x88aaff, 0.8); key.position.set(200, 400, 100); scene.add(key);

    // ground grid
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA * 2.4, ARENA * 2.4),
      new THREE.MeshStandardMaterial({ color: 0x0a0e1c, metalness: 0.2, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const grid = new THREE.GridHelper(ARENA * 2.4, 60, 0x1b3a6b, 0x12244a);
    grid.position.y = 0.1; scene.add(grid);

    // deterministic buildings (same seed -> same city on every client)
    const rng = mulberry32(seed);
    const colors = [0x1d4ed8, 0x7c3aed, 0x0891b2, 0xdb2777];
    for (let i = 0; i < 140; i++) {
      const w = 30 + rng() * 50, d = 30 + rng() * 50, h = 50 + rng() * 260;
      const x = (rng() * 2 - 1) * ARENA * 0.92, z = (rng() * 2 - 1) * ARENA * 0.92;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0b1022, emissive: colors[(rng() * colors.length) | 0], emissiveIntensity: 0.25,
        metalness: 0.4, roughness: 0.6 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, h / 2, z);
      b.userData.box = new THREE.Box3().setFromObject(b);
      scene.add(b); buildings.push(b);
    }
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  function startGame(name) {
    // seed is provided by the server in Task 10; use a temporary fixed seed for now
    initWorld(20260617);
    camera.position.set(0, 120, 260); camera.lookAt(0, 80, 0);
    renderer.setAnimationLoop(() => renderer.render(scene, camera));
  }
```

- [ ] **Step 2: Manual verify**

Reload `http://127.0.0.1:8787/examples/drone-arena/`, join.
Expected: a neon city of glowing buildings on a grid ground with fog, rendered from a fixed camera.

- [ ] **Step 3: Commit**

```bash
git add public/examples/drone-arena/index.html
git commit -m "Drone Arena client: deterministic neon city + renderer"
```

---

## Task 9: Client — local drone, physics, chase cam, input, building collision

**Files:**
- Modify: `public/examples/drone-arena/index.html`

- [ ] **Step 1: Add the drone factory, input, physics, and chase camera**

Add these helpers inside the module (above `startGame`):
```js
  function makeDrone(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x0b1022, emissive: color, emissiveIntensity: 0.5 }));
    g.add(body);
    const armMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
    for (const [sx, sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 7), armMat);
      arm.rotation.z = Math.PI / 2; arm.rotation.y = Math.atan2(sz, sx); arm.position.set(sx*2.5, 0, sz*2.5);
      g.add(arm);
      const rotor = new THREE.Mesh(new THREE.TorusGeometry(2, 0.25, 6, 14), armMat);
      rotor.rotation.x = Math.PI / 2; rotor.position.set(sx*5, 0, sz*5); g.add(rotor);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 }));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 0, 4); g.add(nose);
    return g;
  }

  const keys = Object.create(null);
  addEventListener("keydown", (e) => { keys[e.code] = true; if (["Space","ShiftLeft"].includes(e.code)) e.preventDefault(); });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  let yaw = 0, pitch = 0;
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement) { yaw -= e.movementX * 0.0025; pitch = Math.max(-0.6, Math.min(0.6, pitch - e.movementY * 0.0025)); }
  });
  document.getElementById("c").addEventListener("click", () => document.getElementById("c").requestPointerLock());

  const me = { mesh: null, vel: new THREE.Vector3(), pos: new THREE.Vector3(0, 120, 0) };

  function updateLocalDrone(dt) {
    const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const accel = new THREE.Vector3();
    const SP = 360;
    if (keys.KeyW) accel.add(fwd); if (keys.KeyS) accel.sub(fwd);
    if (keys.KeyD) accel.add(right); if (keys.KeyA) accel.sub(right);
    if (keys.Space) accel.y += 1; if (keys.ShiftLeft) accel.y -= 1;
    if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(SP);
    me.vel.addScaledVector(accel, dt);
    me.vel.multiplyScalar(Math.exp(-1.8 * dt));            // drag
    const want = me.pos.clone().addScaledVector(me.vel, dt);

    // building collision: revert horizontal move into a solid box
    const r = 4;
    for (const b of buildings) {
      const box = b.userData.box;
      if (want.x > box.min.x - r && want.x < box.max.x + r &&
          want.z > box.min.z - r && want.z < box.max.z + r &&
          want.y > box.min.y && want.y < box.max.y + r) {
        want.x = me.pos.x; want.z = me.pos.z; me.vel.x *= -0.2; me.vel.z *= -0.2; break;
      }
    }
    want.x = Math.max(-ARENA, Math.min(ARENA, want.x));
    want.z = Math.max(-ARENA, Math.min(ARENA, want.z));
    want.y = Math.max(3, Math.min(CEIL, want.y));
    me.pos.copy(want);

    me.mesh.position.copy(me.pos);
    me.mesh.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));

    // chase cam behind + above the drone
    const camOff = new THREE.Vector3(-Math.sin(yaw) * 26, 9, -Math.cos(yaw) * 26);
    camera.position.lerp(me.pos.clone().add(camOff), Math.min(1, dt * 6));
    camera.lookAt(me.pos.clone().addScaledVector(fwd, 30));
  }
```

- [ ] **Step 2: Wire it into `startGame`**

Replace the body of `startGame` with:
```js
  let lastT = 0;
  function startGame(name) {
    initWorld(20260617);
    me.mesh = makeDrone(0x38bdf8); me.mesh.position.copy(me.pos); scene.add(me.mesh);
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
      updateLocalDrone(dt);
      renderer.render(scene, camera);
    });
  }
```

- [ ] **Step 3: Manual verify**

Reload + join, click canvas to lock the pointer.
Expected: your drone flies with WASD/Space/Shift, mouse steers, the chase cam trails behind, and you can't pass through buildings.

- [ ] **Step 4: Commit**

```bash
git add public/examples/drone-arena/index.html
git commit -m "Drone Arena client: local drone flight, chase cam, collision"
```

---

## Task 10: Client — networking (connect, send state, render + interpolate remotes)

**Files:**
- Modify: `public/examples/drone-arena/index.html`

- [ ] **Step 1: Add the network layer + remote-entity rendering**

Add inside the module (above `startGame`):
```js
  let ws = null, myId = null, worldSeed = 20260617;
  const remotes = new Map();   // id -> { mesh, tp:{p,q}, cp:{p,q} } (target & current for interp)
  const BOT_COLOR = 0xf43f5e, PLAYER_COLOR = 0xa78bfa;
  let statusEl, scoreboardEl;

  function connect(name) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/examples/drone-arena/ws`);
    ws.addEventListener("open", () => { ws.send(JSON.stringify({ t: "join", name })); statusEl.textContent = "online"; });
    ws.addEventListener("message", (e) => onNet(JSON.parse(e.data)));
    ws.addEventListener("close", () => { statusEl.textContent = "reconnecting…"; setTimeout(() => connect(name), 1500); });
    ws.addEventListener("error", () => ws.close());
  }

  function onNet(m) {
    if (m.t === "welcome") {
      myId = m.id; worldSeed = m.seed; window.__killsToWin = m.killsToWin;
      if (!scene) buildWorldFromSeed();      // see Step 2
    } else if (m.t === "snapshot") {
      applySnapshot(m);
    } else if (m.t === "event") {
      onEvent(m);                            // combat FX in Task 11
    }
  }

  function ensureRemote(id, isBot) {
    let r = remotes.get(id);
    if (!r) {
      const mesh = makeDrone(isBot ? BOT_COLOR : PLAYER_COLOR); scene.add(mesh);
      r = { mesh, tp: null, cp: null }; remotes.set(id, r);
    }
    return r;
  }

  function applySnapshot(m) {
    const seen = new Set([myId]);
    for (const list of [m.players, m.bots]) {
      const isBot = list === m.bots;
      for (const e of list) {
        if (e.id === myId) continue;
        seen.add(e.id);
        const r = ensureRemote(e.id, isBot);
        r.tp = { p: e.p, q: e.q };
        r.mesh.visible = e.alive;
      }
    }
    for (const [id, r] of remotes) if (!seen.has(id)) { scene.remove(r.mesh); remotes.delete(id); }
    updateScoreboard(m.scores);
  }

  function interpolateRemotes(dt) {
    for (const r of remotes.values()) {
      if (!r.tp) continue;
      const tp = new THREE.Vector3().fromArray(r.tp.p);
      r.mesh.position.lerp(tp, Math.min(1, dt * 10));
      const tq = new THREE.Quaternion().fromArray(r.tp.q);
      r.mesh.quaternion.slerp(tq, Math.min(1, dt * 10));
    }
  }

  let netAccum = 0;
  function sendState(dt) {
    if (!ws || ws.readyState !== 1) return;
    netAccum += dt;
    if (netAccum < 0.066) return; netAccum = 0;
    ws.send(JSON.stringify({ t: "state",
      p: me.pos.toArray().map((n) => +n.toFixed(2)),
      q: me.mesh.quaternion.toArray().map((n) => +n.toFixed(3)),
      v: me.vel.toArray().map((n) => +n.toFixed(2)) }));
  }
```

- [ ] **Step 2: Build the world from the server seed + integrate the loop**

Refactor so the world is built once we know the seed. Replace `startGame` and add `buildWorldFromSeed`:
```js
  let pendingName = null;
  function buildWorldFromSeed() {
    initWorld(worldSeed);
    me.mesh = makeDrone(0x38bdf8); me.mesh.position.copy(me.pos); scene.add(me.mesh);
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
      updateLocalDrone(dt);
      interpolateRemotes(dt);
      sendState(dt);
      renderer.render(scene, camera);
    });
  }

  function startGame(name) {
    pendingName = name;
    statusEl = document.getElementById("status");
    scoreboardEl = document.getElementById("scoreboard");
    connect(name);          // welcome -> buildWorldFromSeed()
  }

  function updateScoreboard(scores) {
    if (!scores) return;
    scoreboardEl.innerHTML = scores.sort((a,b)=>b.score-a.score).slice(0,6)
      .map((s) => `<span class="chip">${s.name}: <b>${s.score}</b></span>`).join("");
  }
  function onEvent(m) { /* Task 11 */ }
```

- [ ] **Step 3: Manual verify (two windows)**

`npx wrangler dev --port 8787`; open the page in two browser windows, join in both.
Expected: each window shows the other player's drone moving in real time; bots appear; the scoreboard lists players.

- [ ] **Step 4: Commit**

```bash
git add public/examples/drone-arena/index.html
git commit -m "Drone Arena client: WebSocket networking + remote interpolation"
```

---

## Task 11: Client — combat (fire, tracers, hit detection, explosions, events)

**Files:**
- Modify: `public/examples/drone-arena/index.html`

- [ ] **Step 1: Add firing, client-side hit detection, tracers, particles**

Add inside the module:
```js
  const tracers = [];   // {line, life}
  const bursts = [];    // {pts, life}
  let fireAt = 0;

  function spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(line); tracers.push({ line, life: 0.12 });
  }
  function spawnBurst(at, color) {
    const n = 40, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i*3);
      vel.push(new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1).multiplyScalar(60)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 2.5 }));
    scene.add(pts); bursts.push({ pts, vel, life: 0.7 });
  }

  function tryFire() {
    if (!ws || ws.readyState !== 1 || performance.now() < fireAt) return;
    fireAt = performance.now() + 180;
    const origin = me.pos.clone();
    const dir = new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch)).normalize();
    ws.send(JSON.stringify({ t: "fire", o: origin.toArray(), d: dir.toArray() }));
    spawnTracer(origin, origin.clone().addScaledVector(dir, 900), 0x9fe8ff);

    // client-side hit detection vs remote drones (ray-sphere, nearest in front)
    let hitId = null, bestT = Infinity;
    for (const [id, r] of remotes) {
      if (!r.mesh.visible) continue;
      const oc = r.mesh.position.clone().sub(origin);
      const tca = oc.dot(dir); if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca*tca;
      if (d2 < 49 && tca < bestT) { bestT = tca; hitId = id; }   // radius ~7
    }
    if (hitId) ws.send(JSON.stringify({ t: "hit", id: hitId }));
  }
  addEventListener("mousedown", (e) => { if (e.button === 0 && document.pointerLockElement) tryFire(); });

  function updateFx(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) { const tr = tracers[i]; tr.life -= dt;
      if (tr.life <= 0) { scene.remove(tr.line); tracers.splice(i,1); } else tr.line.material.opacity = tr.life/0.12; }
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]; b.life -= dt;
      const pos = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) { pos.array[j*3]+=b.vel[j].x*dt; pos.array[j*3+1]+=b.vel[j].y*dt; pos.array[j*3+2]+=b.vel[j].z*dt; }
      pos.needsUpdate = true;
      if (b.life <= 0) { scene.remove(b.pts); bursts.splice(i,1); } }
  }
```

- [ ] **Step 2: Handle combat events (hit flash, kill, fire tracer, death/respawn)**

Replace `function onEvent(m){…}` with:
```js
  const respawnEl = document.getElementById("respawn");
  function onEvent(m) {
    if (m.k === "fire") {
      const o = new THREE.Vector3().fromArray(m.o), d = new THREE.Vector3().fromArray(m.d);
      spawnTracer(o, o.clone().addScaledVector(d, 900), 0xff9ec2);
    } else if (m.k === "hit") {
      const r = remotes.get(m.id); if (r) spawnBurst(r.mesh.position, 0xffd27a);
      if (m.id === myId) { me.hp = (me.hp ?? 100) - 13; if (me.hp <= 0) showDeath(); }
    } else if (m.k === "kill") {
      const r = remotes.get(m.id); if (r) spawnBurst(r.mesh.position, 0xff5a5a);
      if (m.id === myId) showDeath();
    }
  }
  function showDeath() {
    respawnEl.style.display = "flex";
    renderer.setAnimationLoop(renderStill);   // freeze local control briefly
  }
  function renderStill() { interpolateRemotes(0.016); updateFx(0.016); renderer.render(scene, camera); }
  respawnEl.addEventListener("click", () => {
    respawnEl.style.display = "none"; me.hp = 100; me.pos.set((Math.random()*2-1)*300, 120, (Math.random()*2-1)*300);
    ws.send(JSON.stringify({ t: "respawn" }));
    renderer.setAnimationLoop(mainLoop);
  });
```

Refactor the animation loop into a named `mainLoop` so death/respawn can swap it. In `buildWorldFromSeed`, replace the `setAnimationLoop` callback with `renderer.setAnimationLoop(mainLoop);` and define:
```js
  function mainLoop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
    updateLocalDrone(dt);
    interpolateRemotes(dt);
    updateFx(dt);
    sendState(dt);
    renderer.render(scene, camera);
  }
```

- [ ] **Step 3: Manual verify (two windows)**

Join in two windows; fire at the other drone.
Expected: tracers appear in both windows, hit bursts show, HP drops, a kill triggers the "shot down" overlay, clicking it respawns you, and the scoreboard increments for the shooter.

- [ ] **Step 4: Commit**

```bash
git add public/examples/drone-arena/index.html
git commit -m "Drone Arena client: combat, tracers, hit detection, explosions"
```

---

## Task 12: Client — name tags, HP bars, connection status polish

**Files:**
- Modify: `public/examples/drone-arena/index.html`

- [ ] **Step 1: Add floating name + HP sprites over each drone**

Add a sprite-label helper and attach to remotes:
```js
  function makeLabel(text) {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
    const g = cv.getContext("2d");
    const draw = (name, hp) => {
      g.clearRect(0,0,256,64);
      g.font = "bold 26px monospace"; g.fillStyle = "#e7eeff"; g.textAlign = "center";
      g.fillText(name, 128, 28);
      g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(78, 38, 100, 8);
      g.fillStyle = hp > 50 ? "#34d399" : hp > 25 ? "#fbbf24" : "#f43f5e"; g.fillRect(78, 38, hp, 8);
    };
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(28, 7, 1); sprite.position.y = 8;
    sprite.userData = { tex, draw, cv }; return sprite;
  }
```

In `ensureRemote`, after creating `mesh`, attach a label:
```js
      const label = makeLabel("…"); mesh.add(label); r = { mesh, label, tp: null, cp: null, name: "", hp: 100 };
```
(Adjust the `r` assignment accordingly and keep `remotes.set(id, r)`.)

In `applySnapshot`, when updating each entity, refresh the label:
```js
        r.name = e.name || (isBot ? "Bot" : "Pilot"); r.hp = e.hp;
        r.label.userData.draw(r.name, Math.max(0, e.hp)); r.label.userData.tex.needsUpdate = true;
```

- [ ] **Step 2: Reflect connection state + player count in the status line**

In `applySnapshot`, set:
```js
    statusEl.textContent = `${m.players.length} online · ${m.bots.length} bots`;
```

- [ ] **Step 3: Manual verify**

Join in two windows.
Expected: each remote drone shows a name + colored HP bar that drops when hit; the status line shows the live player/bot counts.

- [ ] **Step 4: Commit**

```bash
git add public/examples/drone-arena/index.html
git commit -m "Drone Arena client: name tags, HP bars, live status"
```

---

## Task 13: Update gallery card, full verification, final commit

**Files:**
- Modify: `public/index.html`
- Modify: `README.md` (one line, if it lists examples — optional)

- [ ] **Step 1: Update the Drone Arena gallery card copy**

In `public/index.html`, change the Drone Arena card's description to reflect online 3D play:
```html
            <div class="ex-title">Drone Arena</div>
            <p class="ex-desc">Real-time multiplayer 3D drone dogfight — fly a neon city vs players &amp; AI.</p>
```

- [ ] **Step 2: Run the full automated suite**

Run: `npm run typecheck` → Expected: PASS.
Run: `npm test` → Expected: PASS (gamesim unit tests).
Terminal 1: `npx wrangler dev --port 8787`; Terminal 2: `npm run test:smoke` → Expected: `SMOKE PASS`.

- [ ] **Step 3: Manual playtest checklist (two browser windows)**

- [ ] Both drones see each other fly in real time.
- [ ] Firing shows tracers in both windows; hits drop HP; kills increment the shooter's score.
- [ ] Death overlay appears; clicking respawns at a new spot with brief invulnerability.
- [ ] Bots appear when only one human is connected and behave (seek/strafe/fire).
- [ ] Buildings block movement and provide cover.
- [ ] Closing one window removes that drone from the other (leave event).
- [ ] Reloading reconnects and rejoins cleanly.

- [ ] **Step 4: Commit**

```bash
git add public/index.html README.md
git commit -m "Update Drone Arena gallery card for 3D multiplayer"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** DO game room (Tasks 1,3,4); shared global arena via `idFromName("global")` (Task 5); chase cam + controls (Task 9); relay + thin authority — clients own movement, DO owns HP/score/bots (Tasks 4,10,11); Three.js via CDN importmap (Task 7); deterministic city from seed (Tasks 8,10); protocol messages all implemented (Tasks 3,4,10,11); bots (Task 4); abuse limits — `MAX_PLAYERS` close, `RateLimiter`, `sanitizeState`, name validation, `HIT_COOLDOWN_MS` (Tasks 2,3,4); error handling — reconnect, CDN-fail panel, 426 on non-upgrade (Tasks 5,7,10); testing — unit + smoke + manual (Tasks 2,6,13); gallery card (Task 13). All spec sections map to tasks.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The `onEvent`/`mainLoop` stubs are explicitly defined within the same plan (Tasks 10→11), not left open.

**Type consistency:** Protocol field names (`t`,`p`,`q`,`v`,`o`,`d`,`id`,`seed`,`hp`,`alive`,`score`) are identical across server (`gameroom.ts`) and client. `gamesim` exports used by `gameroom` (`mulberry32`,`validateName`,`sanitizeState`,`RateLimiter`,`pickSpawn`,`applyHit`,`stepBot`,`Bot`, constants) match their definitions in Task 2. Client helpers (`initWorld`,`buildWorldFromSeed`,`makeDrone`,`updateLocalDrone`,`connect`,`applySnapshot`,`interpolateRemotes`,`sendState`,`onEvent`,`mainLoop`,`ensureRemote`,`makeLabel`) are each defined once and referenced consistently.
