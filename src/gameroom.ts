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
