# Networking

## Topology

One Node.js process is authoritative for everything: rooms, lobby state, the
30 Hz match simulation, and persistence. Clients (player phones, the host
console, spectators) connect over a single WebSocket (`/ws`) and speak a
zod-validated JSON protocol (`packages/shared/src/protocol.ts`,
`PROTOCOL_VERSION = 1`).

```
phone ──┐
phone ──┤                       ┌─ SQLite (node:sqlite) — rooms/events/results
host  ──┼── WebSocket ── Server ┤
tv    ──┘    (JSON v1)          └─ 30 Hz Match sim (deterministic, seeded)
```

## Message flow

1. `hello {role, roomCode?, reconnectToken?}` → `welcome` (+ `room` when a code
   was supplied). A valid reconnect token re-binds the existing session.
2. Host: `createRoom {leagueName, participantNames[12]}` → `roomCreated {hostToken, joinUrl}`.
3. Player: `joinRoom` → `claimSlot` → `setCharacter` → `setReady`.
4. Host commands (`host*`) require the connection to hold the host role, which
   is only granted by creating the room or reconnecting with the host token.
5. Gameplay: client sends `input {seq, mx, mz, yaw?, atk?, heavyHold?, dodge?, jump?, pickup?, …}`
   at ≤30/sec. The server clamps every field (zod ranges) and binds the input
   to the session's own slot — there is no field for "which fighter".

## Authority

The server alone decides: spawns, movement resolution, health, damage,
knockback, stun, i-frames, weapon ownership/durability, drops, power-ups,
hazards, the Auto-Draft zone, eliminations + timestamps, placements, draft
order, and host privileges. There is deliberately **no message in the protocol
that can set any of these** — the protocol tests assert that such messages fail
validation. A tampered client can at most send legal inputs.

## Tick / snapshot cadence

- Simulation: 30 Hz fixed tick.
- Snapshots: 15 Hz (every 2nd tick), full-state JSON (12 fighters + entities ≈
  4–8 KB). At this scale delta compression is unnecessary; the schema has a
  version field for later binary/delta upgrades.
- Events (hits, eliminations, drops, yippees, announcer lines, phase changes)
  are an ordered stream, broadcast with snapshots and appended to the SQLite
  audit log (`match_events`).

## Client-side prediction & interpolation

- **Remote fighters** interpolate between the two latest snapshots (~66–90 ms
  behind the server, mild extrapolation up to 1.4 intervals under jitter).
- **Own fighter** advances locally from the current input using the same shared
  movement constants and collision helpers (`@ddd/shared/arena`), then blends a
  soft server correction each frame (strong when stunned/knocked back, snap
  when error > 2.5 u). Input `seq` numbers are acked per player in snapshots
  (`lastProcessedInput`) — stale/replayed sequences are dropped server-side.
- This "predict + converge" model was chosen over full input-replay
  reconciliation: at party-game speeds it is visually indistinguishable, and it
  cannot desync authority because the server position always wins.

## Reconnection

- Every session gets a cryptographically random reconnect token; the client
  stores it in `sessionStorage` and presents it in `hello`.
- On disconnect the fighter stays active, briefly idle; after
  `SIM.RECONNECT_GRACE_MS` (20 s) AI takes over ("ai-takeover" shown to the
  host). On reconnect, control returns to the human; health, inventory, stats,
  and position were never client-side, so nothing is lost and no duplicate
  fighter can exist (asserted by tests).
- Host reconnects with the host token and regains host privileges.

## Tie-breaking (official)

Eliminations committed on the same server tick are ordered:

1. lower tick first (earlier is worse pick),
2. same tick → **more total damage received** is eliminated first,
3. still tied → **lower participant slot index** is eliminated first.

The comparator is a pure function (`compareEliminations`) used both when
committing eliminations and when computing the draft order, and it is
unit-tested. The final safeguard: the same-tick commit loop never eliminates
the last survivor, so a total wipe still yields exactly one winner.

## Abuse controls

- Per-connection token buckets: 90 msg/s general, 60/s inputs; oversized
  payloads (>4 KB) and invalid JSON are dropped and counted as strikes
  (20 strikes → close).
- Room codes: 6 chars from an unambiguous alphabet, expire after 4 h idle.
- All tokens from `crypto.randomBytes`.
- WebSocket `maxPayload` 16 KB.

## Spectator delay

`spectatorDelaySec > 0` buffers snapshot/event frames server-side per room and
releases them late to spectator sessions only (anti-screen-cheating for
same-room play).
