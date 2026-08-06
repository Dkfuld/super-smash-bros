# Deployment

## Fastest public link (~5 minutes, no code changes)

**Render (free tier, few clicks):**

1. Create a free account at render.com and connect your GitHub.
2. Dashboard → **New → Blueprint** → pick this repository and branch. The
   `render.yaml` at the repo root configures everything (root dir, build,
   start, health check).
3. Click Apply. When the deploy finishes you get
   `https://disaster-dome-XXXX.onrender.com` — that's the link everyone opens.
   The host creates the room there; players join by QR/code as usual.

Notes: the free tier sleeps after ~15 min idle (first visit wakes it in ~30 s)
and loses saved match history on redeploys. For league night reliability,
upgrade the service to Starter and attach a 1 GB disk at `/data` with
`DDD_DB_PATH=/data/ddd.sqlite`.

**Fly.io (always-on, ~$3–5/mo):** install flyctl, then from `super-smash-bros/`:

```bash
fly launch --copy-config --no-deploy   # accepts fly.toml, pick an app name
fly volumes create dome_data --size 1
fly deploy
```

`fly.toml` + `Dockerfile` are already in this folder (WebSocket-safe settings,
persistent volume, auto-stop disabled so live matches never get killed).

## Shape of the app

- **One stateful Node process** (`apps/server`) — WebSockets + the 30 Hz sim +
  SQLite. It also serves the built client, so the simplest production deploy is
  a single service.
- **Static client** (`apps/client/dist`) — can optionally live on a CDN/edge
  host instead, with `/ws` and `/api` pointed at the server origin.

## Recommended: single service on Fly.io / Railway / Render

WebSocket sessions are long-lived and the sim is in-memory, so the server must
run on a platform that (a) keeps processes alive, (b) does not idle-kill open
sockets, (c) offers sticky routing to one instance. Fly.io, Railway, and Render
web services qualify. **Do not** deploy the server to serverless/edge platforms
(Vercel/Netlify functions, Cloudflare Workers without Durable Objects) — those
cannot hold the authoritative loop.

```bash
npm ci
npm run build                    # builds shared + client (dist served by server)
PORT=8787 npm start              # tsx runs apps/server
```

Environment variables (see `.env.example`):

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | 8787 | HTTP + WS port |
| `HOST` | 0.0.0.0 | bind address |
| `DDD_DB_PATH` | `data/ddd.sqlite` | SQLite file (mount a volume) |
| `DDD_CLIENT_DIST` | `../client/dist` | static client location |

Give the service a persistent volume for `data/` so match history survives
restarts. One shared-CPU instance comfortably runs a 12-player room; scale-out
would require room-affinity routing (not needed for league night).

## Split deploy (optional)

Client + spectator on Vercel/Cloudflare Pages (static `apps/client/dist`),
server on Fly/Railway. Set the client's WS origin by serving it from the same
domain via proxy, or extend `wsUrl()` in `net/connection.ts` to read a
`VITE_SERVER_ORIGIN` env at build time.

## Postgres / Supabase

For a managed database instead of SQLite, apply
`database/migrations/001_init.sql` to Postgres and port `apps/server/src/store.ts`
(single file, ~6 methods) to `pg`/Supabase client. RLS notes are in the
migration file. SQLite remains the recommended default for league night — one
less moving part.

## TLS

Terminate HTTPS/WSS at the platform's proxy (all recommended hosts do this by
default). iOS requires HTTPS for haptics, PWA install, and mic-less speech
synthesis consistency.

## Ops hooks

- `/health` — liveness + room count (wire to platform health checks).
- Server logs are single-line JSON (`ts`, `level`, `msg`, fields) — pipe to any
  log drain. Analytics/crash reporting can subscribe to the same event stream
  in `Room.tick` (events are already structured); no vendor is wired by default.
