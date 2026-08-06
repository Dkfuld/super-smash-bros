# Testing

## Layers

| Layer | Tool | Where | What |
| --- | --- | --- | --- |
| Shared logic | Vitest | `packages/shared/src/*.test.ts` | draft order, tie-breaks, protocol validation, weapon config integrity |
| Server | Vitest | `apps/server/src/*.test.ts` | full AI match simulation, determinism, authority, rooms, host auth, reconnection, persistence |
| End-to-end | Playwright | `apps/client/e2e/` | real server + built client across 7 device viewports |
| Headless sim | `npm run simulate` | `apps/server/src/tools/simulate.ts` | watch a full 12-bot match with commentary in the terminal |

Run everything:

```bash
npm test          # shared + server unit/simulation suites
npm run test:e2e  # builds the client, boots the server, drives real browsers
npm run simulate --workspace apps/server -- 42   # seeded full-match replay
```

## Requirement → test map (the brief's checklist)

- Room cannot exceed 12 assigned players → `room.test.ts` "13th player cannot claim"
- No duplicate assignments at start → `room.test.ts` + `Room.startMatch` guard
- Host must be authorized → `room.test.ts` "rejects host commands from non-host"
- A player cannot control another player → `room.test.ts` input-authority test
- Client cannot alter health/damage/placement → `protocol.test.ts` (no such messages validate) + server-side authority by construction
- Winner gets pick 1 / first out gets pick 12 → `draft.test.ts` + `match.test.ts` full-sim assertions
- All 12 picks unique → `draft.test.ts`, `match.test.ts`
- Simultaneous eliminations deterministic → `draft.test.ts` tie-break tests + `match.test.ts` same-seed determinism
- Reconnect / AI takeover / control return / no duplicates → `room.test.ts` reconnection suite (fake timers)
- Room codes expire → `RoomManager` TTL (covered by code path; codes format asserted)
- Previous-loser persists + correct player gets the hat → `room.test.ts` rainbow-hat test
- Yippee cooldowns + host YIPPEE button → `match.test.ts`
- Results saved + exports match official order → `room.test.ts` persistence test
- Mobile touch controls / landscape / portrait prompt / audio-after-gesture / spectator → `e2e/game.spec.ts`

E2E viewports: iPhone Pro (852×393), iPhone standard, iPhone SE, Galaxy S23,
midrange Android (800×360), tablet (1180×820), desktop (1440×900).

## Load testing

The cheapest meaningful load test is the built-in one: the **AI demo match** is
12 simulated players + hazards + drops at maximum event rate, driven by the
same server loop as a real match. For synthetic client load, open N spectator
pages (each holds a live socket receiving 15 Hz snapshots) while a demo match
runs and watch `/health` + server log tick timing. The headless simulator runs
a full match in ~0.3 s wall-clock, i.e. the sim itself uses well under 1 % of a
core at real-time 30 Hz — bandwidth (≈8 KB × 15 Hz × clients) is the only real
scaling axis, ~1.5 Mbit/s for a full room of 13 sockets.

## In the dev container

Playwright uses the preinstalled Chromium automatically (`PW_CHROMIUM_PATH` or
`/opt/pw-browsers/chromium`); SwiftShader flags are set in the config so WebGL
runs headless without a GPU.
