import { test } from "node:test";
import assert from "node:assert/strict";
// Import the SAME module the browser client imports, so these tests cover the
// real fight/collision logic the game runs — not a copy.
import { hitsBox, raySphere, pickRayTarget, segmentHitsBox } from "../public/examples/drone-arena/arena-math.js";
import { applyHit } from "../src/gamesim.ts";

// A sample building footprint: 40 wide on X, 40 deep on Z, 200 tall,
// centred at x=100, sitting on the ground (y from 0 to 200).
const min = { x: 80, y: 0, z: -20 };
const max = { x: 120, y: 200, z: 20 };
const R = 4; // drone radius the flight code uses for wall clearance

// ---------------------------------------------------------------------------
// Hitting the buildings (drone vs AABB)
// ---------------------------------------------------------------------------

test("hitsBox: a drone inside the footprint collides", () => {
  assert.equal(hitsBox({ x: 100, y: 100, z: 0 }, min, max, R), true);
});

test("hitsBox: a drone well clear of the building does not collide", () => {
  assert.equal(hitsBox({ x: 300, y: 100, z: 0 }, min, max, R), false);
});

test("hitsBox: within the r-skin of a wall still collides; just past it does not", () => {
  assert.equal(hitsBox({ x: 122, y: 100, z: 0 }, min, max, R), true);  // 122 < 120 + 4
  assert.equal(hitsBox({ x: 125, y: 100, z: 0 }, min, max, R), false); // 125 > 124
});

test("hitsBox: flying high over the roof clears the building", () => {
  assert.equal(hitsBox({ x: 100, y: 230, z: 0 }, min, max, R), false); // 230 > 200 + 4
});

test("hitsBox: grazing just above the roof (within r) still collides", () => {
  assert.equal(hitsBox({ x: 100, y: 203, z: 0 }, min, max, R), true);  // 203 < 204
});

test("hitsBox: at/under the base is treated as clear (ground level)", () => {
  assert.equal(hitsBox({ x: 100, y: 0, z: 0 }, min, max, R), false);   // y must be > min.y
});

// ---------------------------------------------------------------------------
// Fighting (ray vs drone)
// ---------------------------------------------------------------------------

const ORIGIN = { x: 0, y: 0, z: 0 };
const FWD = { x: 1, y: 0, z: 0 }; // unit ray pointing +X
const DRONE_R = 7;                // drone hit radius

test("raySphere: a shot straight at a drone ahead returns its forward distance", () => {
  assert.equal(raySphere(ORIGIN, FWD, { x: 100, y: 0, z: 0 }, DRONE_R), 100);
});

test("raySphere: a drone behind the shooter is never hit", () => {
  assert.equal(raySphere(ORIGIN, FWD, { x: -100, y: 0, z: 0 }, DRONE_R), null);
});

test("raySphere: a shot that passes wide misses", () => {
  assert.equal(raySphere(ORIGIN, FWD, { x: 100, y: 20, z: 0 }, DRONE_R), null);
});

test("raySphere: a near-miss inside the hit radius still connects", () => {
  const d = raySphere(ORIGIN, FWD, { x: 100, y: 5, z: 0 }, DRONE_R); // 5 < radius 7
  assert.ok(d !== null && Math.abs(d - 100) < 1e-9);
});

test("pickRayTarget: picks the nearest drone in the line of fire", () => {
  const targets = [
    { id: "far", pos: { x: 200, y: 0, z: 0 } },
    { id: "near", pos: { x: 60, y: 0, z: 0 } },
    { id: "behind", pos: { x: -50, y: 0, z: 0 } },
    { id: "wide", pos: { x: 120, y: 40, z: 0 } },
  ];
  assert.equal(pickRayTarget(ORIGIN, FWD, targets, DRONE_R), "near");
});

test("pickRayTarget: returns null when nothing is in the line of fire", () => {
  const targets = [
    { id: "behind", pos: { x: -50, y: 0, z: 0 } },
    { id: "wide", pos: { x: 120, y: 40, z: 0 } },
  ];
  assert.equal(pickRayTarget(ORIGIN, FWD, targets, DRONE_R), null);
});

// ---------------------------------------------------------------------------
// Fighting end-to-end: a landed shot reduces HP (pickRayTarget + applyHit)
// ---------------------------------------------------------------------------

test("a landed shot reduces the target's HP", () => {
  const target = { id: "t1", pos: { x: 80, y: 0, z: 0 }, hp: 100, alive: true, invulnUntil: 0 };
  const hitId = pickRayTarget(ORIGIN, FWD, [{ id: target.id, pos: target.pos }], DRONE_R);
  assert.equal(hitId, "t1");
  const res = applyHit(target, 1000);
  assert.equal(res.applied, true);
  assert.ok(target.hp < 100);
});

test("a shot that misses leaves HP untouched", () => {
  const target = { id: "t2", pos: { x: 100, y: 40, z: 0 }, hp: 100, alive: true, invulnUntil: 0 };
  const hitId = pickRayTarget(ORIGIN, FWD, [{ id: target.id, pos: target.pos }], DRONE_R);
  assert.equal(hitId, null);
  // no hit -> no applyHit call -> hp stays full
  assert.equal(target.hp, 100);
});

// ---------------------------------------------------------------------------
// Cover: a building on the shot line blocks the hit (line-of-sight)
// ---------------------------------------------------------------------------

const bmin = { x: -5, y: 0, z: -5 };
const bmax = { x: 5, y: 200, z: 5 };

test("segmentHitsBox: a shot line passing through a building is blocked", () => {
  assert.equal(segmentHitsBox({ x: -50, y: 30, z: 0 }, { x: 50, y: 30, z: 0 }, bmin, bmax), true);
});

test("segmentHitsBox: a shot line clear of the building is not blocked", () => {
  assert.equal(segmentHitsBox({ x: -50, y: 250, z: 0 }, { x: 50, y: 250, z: 0 }, bmin, bmax), false);
});

test("a player shot is dropped when a building stands between shooter and target", () => {
  const origin = { x: -50, y: 30, z: 0 };
  const target = { id: "enemy", pos: { x: 50, y: 30, z: 0 } };
  // building sits between origin and target -> no clear line of sight
  const blocked = segmentHitsBox(origin, target.pos, bmin, bmax);
  const candidates = blocked ? [] : [target];
  assert.equal(blocked, true);
  assert.equal(pickRayTarget(origin, { x: 1, y: 0, z: 0 }, candidates, 7), null);
});
