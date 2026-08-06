# 🏟️ Draft Day: Disaster Dome

A mobile-first, **12-player online 3D battle royale** that decides your fantasy
league's draft order. Twelve league members enter a stylized-cartoon arena on
their phones; the order they get eliminated is the draft order — first one out
gets pick 12, last one standing gets pick 1. The result is server-authoritative,
saved, auditable, and exportable. Last season's last-place finisher is forced
to wear the fully animated **Rainbow Fan-Spin Hat** and periodically shout
*"Yippee!"* — this is non-negotiable.

Built with **Babylon.js + React + TypeScript + Vite** on the client and a
custom authoritative **Node.js WebSocket** server (30 Hz sim, zod-validated
protocol, SQLite persistence). All art and audio are original and procedural.

## Quick start

```bash
npm install
npm run dev          # server on :8787 + Vite client on :5173 (proxied /ws, /api)
```

Open http://localhost:5173 — **Host a Draft Night**, or hit **Watch a full AI
demo match** to see 12 bots settle a draft immediately. Phones on the same
network join via the QR code / room code.

Production single-process:

```bash
npm run build && npm start   # serves the built client + game on :8787
```

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` / `dev:client` / `dev:server` | development servers |
| `npm run build` | typecheck-build shared, build server refs + client bundle |
| `npm test` | Vitest suites (shared logic + full server match simulation) |
| `npm run test:e2e` | Playwright: real server + built client on 7 device viewports |
| `npm run simulate --workspace apps/server -- <seed>` | headless full AI match with commentary |
| `npm run lint` / `typecheck` / `format` | hygiene |

## Layout

```
apps/client      React + Babylon.js — player, host console, spectator (one SPA)
apps/server     authoritative WebSocket server, AI bots, SQLite store
packages/shared  protocol (zod), weapons/power-ups/hazards, arena layout,
                 draft-order + tie-break logic, balance config, seeded RNG
database/        PostgreSQL migration mirror
docs/            architecture · networking · mobile-performance · asset-pipeline ·
                 deployment · testing · balance · host-guide · player-guide ·
                 known-limitations · roadmap
```

## The rules of the Dome

- Exactly 12 participants (humans and/or AI substitutes).
- Eliminations by combat, launch-outs, trap doors, hazards, or the encroaching
  **AUTO-DRAFT zone**. All recorded with server timestamps and cause.
- Simultaneous eliminations resolve by documented deterministic tie-breaks
  (docs/networking.md).
- 20 original weapons from the Tactical Pool Noodle to the Commissioner's
  Gavel; rarity tops out at *Extremely Questionable*.
- Results export as text, CSV, JSON, a shareable link, and a league-night PNG
  card. The event log is the audit trail.

See **docs/known-limitations.md** for an honest status report and
**docs/roadmap.md** for what's next.
