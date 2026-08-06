import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_VERSION, draftOrderAsCsv, draftOrderAsText, safeParseClientMessage } from "@ddd/shared";
import { RoomManager } from "./roomManager.js";
import { Store } from "./store.js";
import type { Session } from "./room.js";
import type { Room } from "./room.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const CLIENT_DIST = process.env.DDD_CLIENT_DIST ?? join(import.meta.dirname, "../../client/dist");

const store = new Store();
const rooms = new RoomManager(store);

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function log(level: string, msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(json);
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === "/health") return sendJson(res, 200, { ok: true, rooms: rooms.count(), uptime: process.uptime() });

  if (path === "/api/matches") return sendJson(res, 200, { matches: store.listRecentMatches() });

  const resultsMatch = path.match(/^\/api\/results\/([\w-]+)(?:\/(csv|text|events))?$/);
  if (resultsMatch) {
    const [, matchId, fmt] = resultsMatch;
    const results = store.getResults(matchId ?? "");
    if (!results) return sendJson(res, 404, { error: "not found" });
    if (fmt === "csv") {
      res.writeHead(200, { "content-type": "text/csv", "access-control-allow-origin": "*" });
      return void res.end(draftOrderAsCsv(results.draftOrder));
    }
    if (fmt === "text") {
      res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
      return void res.end(draftOrderAsText(results.leagueName, results.draftOrder));
    }
    if (fmt === "events") return sendJson(res, 200, { events: store.getEvents(matchId ?? "") });
    return sendJson(res, 200, results);
  }

  // Static client (production single-process deploy)
  if (existsSync(CLIENT_DIST)) {
    let filePath = normalize(join(CLIENT_DIST, path === "/" ? "index.html" : path));
    if (!filePath.startsWith(normalize(CLIENT_DIST))) {
      res.writeHead(403);
      return void res.end();
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(CLIENT_DIST, "index.html"); // SPA fallback
    try {
      const data = readFileSync(filePath);
      res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
      return void res.end(data);
    } catch {
      /* fall through */
    }
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Draft Day: Disaster Dome server. Client build not found — run the Vite dev server for the UI.");
}

const httpServer = createServer(handleHttp);
const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 16 * 1024 });

interface ConnState {
  session: Session | null;
  room: Room | null;
  helloDone: boolean;
}

wss.on("connection", (ws: WebSocket, req) => {
  const state: ConnState = { session: null, room: null, helloDone: false };
  const ip = req.socket.remoteAddress ?? "?";

  ws.on("message", (data) => {
    const msg = safeParseClientMessage(data.toString());
    if (!msg) {
      if (state.session) {
        state.session.strikes++;
        if (state.session.strikes > 20) ws.close(1008, "too many invalid messages");
      }
      return;
    }
    if (state.session && !state.session.msgLimiter.allow() && msg.t !== "input") return;

    try {
      if (msg.t === "hello") {
        state.helloDone = true;
        if (msg.roomCode) {
          const room = rooms.get(msg.roomCode);
          if (!room) return ws.send(JSON.stringify({ t: "error", code: "noRoom", message: "Room not found or expired" }));
          state.room = room;
          const role = msg.reconnectToken === room.hostToken ? "host" : msg.role === "host" ? "spectator" : msg.role;
          state.session = room.addSession(ws, role, msg.reconnectToken);
          ws.send(JSON.stringify({ t: "welcome", sessionId: state.session.id, role: state.session.role, protocol: PROTOCOL_VERSION }));
          ws.send(JSON.stringify({ t: "room", room: room.summary() }));
          if (state.session.slotIndex !== null) {
            // Reconnected player: re-send identity binding.
            ws.send(JSON.stringify({
              t: "joined",
              room: room.summary(),
              slotIndex: state.session.slotIndex,
              reconnectToken: state.session.reconnectToken,
              participantId: room.slots[state.session.slotIndex]?.id ?? null,
            }));
          }
        } else {
          ws.send(JSON.stringify({ t: "welcome", sessionId: "pending", role: msg.role, protocol: PROTOCOL_VERSION }));
        }
        return;
      }

      if (msg.t === "createRoom") {
        if (state.room) return;
        const room = rooms.create(msg.leagueName, msg.participantNames);
        state.room = room;
        state.session = room.addSession(ws, "host");
        const origin = (req.headers["x-forwarded-proto"] ?? "http") + "://" + (req.headers["x-forwarded-host"] ?? req.headers.host ?? `localhost:${PORT}`);
        log("info", "room created", { code: room.code, league: msg.leagueName, ip });
        ws.send(JSON.stringify({ t: "welcome", sessionId: state.session.id, role: "host", protocol: PROTOCOL_VERSION }));
        ws.send(JSON.stringify({
          t: "roomCreated",
          room: room.summary(),
          hostToken: room.hostToken,
          joinUrl: `${origin}/?room=${room.code}`,
        }));
        return;
      }

      if (!state.room || !state.session) return;
      state.room.handleMessage(state.session, msg);
    } catch (err) {
      log("error", "message handling failed", { err: String(err), type: msg.t });
    }
  });

  ws.on("close", () => {
    if (state.room && state.session) state.room.handleDisconnect(state.session);
  });
  ws.on("error", () => ws.close());
});

httpServer.listen(PORT, HOST, () => {
  log("info", `Disaster Dome server listening`, { port: PORT });
});

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});
