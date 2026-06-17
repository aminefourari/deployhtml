// Pure, runtime-free game logic. No Workers globals here so it unit-tests
// directly with node:test via tsx.

export const ARENA = 600;       // half-extent on X and Z
export const CEIL = 340;        // max altitude (above the tallest building ~316)
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
  private last: number | null = null;
  constructor(private capacity: number, private perSec: number) { this.tokens = capacity; }
  allow(now: number): boolean {
    if (this.last !== null) {
      this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSec);
    }
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

export interface Box { min: Vec3; max: Vec3; }

// Deterministically regenerate the SAME city the client draws from `seed`, so
// the server can reason about cover / line-of-sight. MUST consume rng() in the
// exact same order and count as the client's builder (incl. the colour draw)
// to stay in lockstep — otherwise server cover wouldn't match what players see.
export function generateBuildings(seed: number): Box[] {
  const rng = mulberry32(seed);
  const boxes: Box[] = [];
  for (let i = 0; i < 140; i++) {
    const w = 30 + rng() * 50, d = 30 + rng() * 50, h = 50 + rng() * 260;
    const x = (rng() * 2 - 1) * ARENA * 0.92, z = (rng() * 2 - 1) * ARENA * 0.92;
    rng(); // colour index — consumed to keep the sequence identical to the client
    boxes.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2] });
  }
  return boxes;
}

// Does the segment p0->p1 intersect the axis-aligned box? Slab method clamped
// to the segment range [0,1].
export function segmentHitsBox(p0: Vec3, p1: Vec3, min: Vec3, max: Vec3): boolean {
  let tmin = 0, tmax = 1;
  for (let i = 0; i < 3; i++) {
    const d = p1[i] - p0[i];
    if (Math.abs(d) < 1e-9) {
      if (p0[i] < min[i] || p0[i] > max[i]) return false;
    } else {
      let t1 = (min[i] - p0[i]) / d, t2 = (max[i] - p0[i]) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// True if any building stands on the straight line between p0 and p1.
export function lineOfSightBlocked(p0: Vec3, p1: Vec3, boxes: Box[]): boolean {
  for (const b of boxes) if (segmentHitsBox(p0, p1, b.min, b.max)) return true;
  return false;
}

// True if a sphere of radius r at p overlaps any building — same footprint /
// height rule the client uses for the local drone, so bots respect walls too.
export function blockedByBuilding(p: Vec3, boxes: Box[], r: number): boolean {
  for (const b of boxes) {
    if (p[0] > b.min[0] - r && p[0] < b.max[0] + r &&
        p[2] > b.min[2] - r && p[2] < b.max[2] + r &&
        p[1] > b.min[1] && p[1] < b.max[1] + r) return true;
  }
  return false;
}
