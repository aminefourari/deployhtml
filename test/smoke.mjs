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
