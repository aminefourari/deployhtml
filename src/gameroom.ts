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
