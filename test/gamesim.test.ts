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

import { stepBot } from "../src/gamesim.ts";
import type { Vec3 } from "../src/gamesim.ts";

test("stepBot moves a bot toward its target and stays in bounds", () => {
  const bot = { p: [0,60,0] as Vec3, q: [0,0,0,1] as [number,number,number,number], v: [0,0,0] as Vec3,
                hp: 100, alive: true, invulnUntil: 0, fireAt: 0 };
  const target = { p: [200,60,0] as Vec3 };
  const before = bot.p[0];
  const out = stepBot(bot, target, 0.066, 1000, mulberry32(1));
  assert.ok(bot.p[0] > before);                 // moved toward +X target
  assert.ok(bot.p[0] <= ARENA && bot.p[1] <= CEIL && bot.p[1] >= FLOOR);
  assert.equal(typeof out.fired, "boolean");
});

test("stepBot with no target just drifts in bounds", () => {
  const bot = { p: [0,60,0] as Vec3, q: [0,0,0,1] as [number,number,number,number], v: [0,0,0] as Vec3,
                hp: 100, alive: true, invulnUntil: 0, fireAt: 0 };
  const out = stepBot(bot, null, 0.066, 1000, mulberry32(2));
  assert.equal(out.fired, false);
  assert.ok(bot.p[1] >= FLOOR && bot.p[1] <= CEIL);
});

import { generateBuildings, segmentHitsBox, lineOfSightBlocked } from "../src/gamesim.ts";

test("generateBuildings is deterministic and bounded", () => {
  const a = generateBuildings(424242);
  const b = generateBuildings(424242);
  assert.equal(a.length, 140);
  assert.deepEqual(a, b);                                   // same seed -> identical city
  for (const box of a) {
    assert.ok(box.min[0] < box.max[0] && box.min[1] < box.max[1] && box.min[2] < box.max[2]);
    assert.equal(box.min[1], 0);                            // buildings sit on the ground
  }
  assert.notDeepEqual(generateBuildings(1), generateBuildings(2));
});

test("segmentHitsBox: a line through the box hits it", () => {
  assert.equal(segmentHitsBox([-50, 0, 0], [50, 0, 0], [-10, -10, -10], [10, 10, 10]), true);
});

test("segmentHitsBox: a line passing beside the box misses", () => {
  assert.equal(segmentHitsBox([-50, 50, 0], [50, 50, 0], [-10, -10, -10], [10, 10, 10]), false);
});

test("segmentHitsBox: a line that stops short of the box does not hit", () => {
  assert.equal(segmentHitsBox([-50, 0, 0], [-20, 0, 0], [-10, -10, -10], [10, 10, 10]), false);
});

test("lineOfSightBlocked: a building between two points blocks LoS; a clear lane does not", () => {
  const boxes = [{ min: [-5, 0, 40] as Vec3, max: [5, 100, 60] as Vec3 }];
  assert.equal(lineOfSightBlocked([0, 50, 0], [0, 50, 120], boxes), true);    // wall at z~50 between
  assert.equal(lineOfSightBlocked([0, 50, 0], [200, 50, 0], boxes), false);   // clear along x
});
