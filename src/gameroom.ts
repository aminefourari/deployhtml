import { Env } from "./env";
import {
  Vec3, Quat, MAX_PLAYERS, BOT_TARGET, HP_MAX, KILLS_TO_WIN, INVULN_MS, RESPAWN_MS,
  HIT_COOLDOWN_MS, CEIL, Bot, Box, mulberry32, validateName, sanitizeState, RateLimiter,
  pickSpawn, applyHit, stepBot, generateBuildings, lineOfSightBlocked, blockedByBuilding,
} from "./gamesim";

const round = (a: number[]) => a.map((n) => Math.round(n * 100) / 100);

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
  private bots = new Map<string, Bot & { id: string; name: string; deadUntil: number }>();
  private botSeq = 1;
  private rng = mulberry32(this.seed ^ 0x9e3779b9);
  // Same city the clients render (from `seed`), so bots respect cover.
  private buildings: Box[] = generateBuildings(this.seed);

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
    const spawn = this.clearSpawn(rng, others);
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
    } else if (msg.t === "fire") {
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
  private onTick() {
    const now = Date.now();
    if (this.players.size === 0) { this.stopTick(); return; }
    this.topUpBots();

    // advance bots; pick nearest living human as target
    const humans = [...this.players.values()].filter((p) => p.alive);
    for (const bot of this.bots.values()) {
      if (!bot.alive) {
        if (now >= bot.deadUntil) {
          bot.p = this.clearSpawn(this.rng, []); bot.hp = HP_MAX; bot.alive = true;
          bot.invulnUntil = now + INVULN_MS;
        }
        continue;
      }
      let target: Player | null = null, best = Infinity;
      for (const h of humans) {
        const d = Math.hypot(h.p[0] - bot.p[0], h.p[1] - bot.p[1], h.p[2] - bot.p[2]);
        if (d < best) { best = d; target = h; }
      }
      const prevX = bot.p[0], prevZ = bot.p[2];
      const r = stepBot(bot, target, 0.066, now, this.rng);
      // Don't let bots fly through buildings: revert the horizontal move on a
      // collision and climb so they rise to clear the obstacle.
      if (blockedByBuilding(bot.p, this.buildings, 6)) {
        bot.p[0] = prevX; bot.p[2] = prevZ;
        bot.p[1] = Math.min(CEIL, bot.p[1] + 8);
      }
      if (r.fired && target && best < 460 && !lineOfSightBlocked(bot.p, target.p, this.buildings)) {
        // Show the bot's shot to everyone (a little spread so misses visibly veer)...
        const dx = target.p[0] - bot.p[0], dy = target.p[1] - bot.p[1], dz = target.p[2] - bot.p[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const sp = () => (this.rng() - 0.5) * 0.07;
        this.broadcast({ t: "event", k: "fire", id: bot.id, o: bot.p,
          d: [dx / len + sp(), dy / len + sp(), dz / len + sp()] });
        // ...then roll a LOW, distance-scaled hit chance so players aren't melted.
        const acc = 0.13 * (1 - best / 460);   // ~13% point-blank, ~0% at max range
        if (this.rng() < acc) {
          const res = applyHit(target as any, now);
          if (res.applied) {
            this.broadcast({ t: "event", k: "hit", id: target.id, by: bot.id });
            if (res.died) {
              this.broadcast({ t: "event", k: "kill", by: bot.id, byName: "Bot", id: target.id });
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
        for (const b of this.bots.values()) { b.hp = HP_MAX; b.alive = true; b.deadUntil = 0; b.invulnUntil = 0; }
      }
    }
  }

  // pickSpawn, but biased away from buildings so nothing spawns boxed inside one.
  private clearSpawn(rng: () => number, others: Vec3[]): Vec3 {
    for (let t = 0; t < 10; t++) {
      const s = pickSpawn(rng, others);
      if (!blockedByBuilding(s, this.buildings, 6)) return s;
    }
    return pickSpawn(rng, others);
  }

  private respawnPlayer(player: Player) {
    const others = [...this.players.values()].filter((p) => p !== player).map((p) => p.p);
    player.p = this.clearSpawn(this.rng, others);
    player.hp = HP_MAX; player.alive = true; player.invulnUntil = Date.now() + INVULN_MS;
  }

  private topUpBots() {
    const total = this.players.size + this.bots.size;
    for (let i = total; i < BOT_TARGET && this.players.size > 0; i++) {
      const id = "b" + this.botSeq++;
      this.bots.set(id, {
        id, name: "Bot", p: this.clearSpawn(this.rng, []), q: [0, 0, 0, 1], v: [0, 0, 0],
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

  private send(ws: WebSocket, obj: unknown) {
    try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ }
  }
  private broadcast(obj: unknown) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) { try { p.ws.send(s); } catch { /* ignore */ } }
  }
}
