# Draft Day: Disaster Dome — Technical Architecture

A mobile-first, 12-player, server-authoritative 3D battle royale that determines
fantasy-league draft order by reverse elimination order.

## 1. Engine choice: Babylon.js (vanilla) + React for DOM UI

**Babylon.js was chosen over Three.js and React Three Fiber.** Reasons:

- **Batteries included for a game (not just a renderer):** integrated animation
  engine, particle systems, glTF/Draco/Meshopt loaders, GUI, shadow pipeline,
  glow/post-processing, scene optimizer, and hardware-scaling — all first-party
  and mobile-tested. With Three.js each of these is a third-party integration we
  would have to maintain.
- **Mobile tooling:** `SceneOptimizer`, `engine.setHardwareScalingLevel()`,
  thin instances, and built-in frustum culling map directly to our Low / Medium /
  High / Auto quality tiers.
- **React Three Fiber was rejected for the game scene**: reconciling a 30 Hz
  networked simulation through React's tree adds re-render risk on midrange
  phones for zero gameplay benefit. React is used where React is good — menus,
  host dashboard, HUD overlays, onboarding — and Babylon owns the `<canvas>`
  imperatively. A thin `GameView` component bridges the two worlds.

## 2. Repository layout

```
super-smash-bros/
  apps/
    client/        React + Vite + Babylon.js — player, host, and spectator UIs (one SPA, routed)
    server/        Node.js authoritative WebSocket server + persistence
  packages/
    shared/        Shared TypeScript: protocol (zod), weapon/power-up/hazard configs,
                   arena layout data, draft-order logic, seeded RNG, balance constants
  database/
    migrations/    PostgreSQL DDL (production mirror of the embedded SQLite schema)
  docs/            Architecture, networking, performance, testing, guides
```

The spectator app is a route of the client SPA rather than a third app: it shares
the entire rendering stack, and splitting it would duplicate the asset and
network layers for no operational gain. This deviates deliberately from the
suggested `/apps/spectator` layout.

## 3. Networking model (summary — see networking.md)

- Custom authoritative WebSocket server (`ws`), **not Colyseus**. The whole game
  state is one room of ≤12 fighters; a hand-rolled tick loop with zod-validated
  JSON messages is smaller, fully deterministic under test, and gives us direct
  control over authority, reconnect tokens, and tie-breaking. Colyseus's schema
  sync and matchmaking solve problems we don't have at this scale.
- **30 Hz server simulation, 15 Hz snapshots + event stream.**
- Client-side prediction for your own fighter (input sequencing +
  reconciliation), snapshot interpolation (~120 ms buffer) for everyone else.
- The server owns: identity, spawns, health, damage, knockback, weapons, drops,
  power-ups, hazards, zone, eliminations + timestamps, placement, draft order,
  host privileges. Clients send *inputs and intents only*.

## 4. Physics model

Server: custom deterministic "arcade 3D" simulation — kinematic characters on a
2.5D plane with vertical velocity (jumps, launches), capsule-vs-AABB collision
against the shared arena layout, impulse knockback with friction, stun and
i-frames. A full rigid-body engine (Rapier) was evaluated and rejected for the
authoritative path: floating-point nondeterminism across restarts, CPU cost at
30 Hz × 12 players on small VMs, and no gameplay need — this is a party
brawler, not a physics sandbox. Client: Babylon handles *cosmetic* physics
(debris, prop reactions, ragdoll-style KO tumbles) that never affect authority.

## 5. Game-state model

- `Room` (lobby): code, host token, 12 participant slots, device assignments,
  settings, previous-year loser flag.
- `Match` (simulation): fighters, projectiles, pickups, hazards, zone stage,
  event log. Every gameplay event (hit, elimination, drop, zone change, yippee)
  is an ordered, timestamped record — the same stream drives client VFX, the
  spectator feed, stats, awards, and the audit trail.
- Elimination order → draft order is a pure function in `@ddd/shared`
  (`computeDraftOrder`), unit-tested, with documented deterministic
  tie-breaking (see networking.md §Tie-breaking).

## 6. Persistence

Embedded SQLite via Node's built-in `node:sqlite` (zero native deps — league
night must not fail on an npm rebuild). A `Store` interface isolates it;
`database/migrations/` carries the equivalent PostgreSQL DDL (+ RLS notes) for
a Supabase/Postgres deployment. Saved: leagues, rooms, settings, match event
log, eliminations, final draft order, stats, awards.

## 7. Asset pipeline (summary — see asset-pipeline.md)

**Everything is original and procedural in this phase**: characters, arena,
props, and UI are built from composed, materialed Babylon geometry with
DynamicTexture faces/signage; SFX are WebAudio-synthesized; voice lines use the
Speech Synthesis API with a synthesized fallback. No downloaded assets → the
license file is trivially clean. The character factory and arena builder are
structured so commissioned GLB rigs/environments can replace procedural pieces
without touching gameplay code.

## 8. Performance strategy (summary — see mobile-performance.md)

Quality tiers Low/Medium/High/Auto driven by a device probe; hardware scaling,
shadow map size (0/512/1024), particle budgets, animated-prop rates, glow layer
toggle, instanced/frozen static meshes, material freezing, object pooling for
projectiles/particles/damage numbers, capped dynamic lights (≤4), no
per-frame allocations in the render loop.

## 9. Development phases & risk register

Phases follow the brief (vertical slice → 12-player match → weapons/chaos →
last-place punishment → presentation → optimization). Top risks:

| Risk | Mitigation |
| --- | --- |
| Mobile GPU too weak for scene | Auto tier probe, hardware scaling, instancing, prop budgets |
| WebSocket drops on phones | Reconnect tokens, 20 s AI-takeover grace, host visibility |
| iOS audio restrictions | All audio behind first user gesture; visual captions for voice |
| Simultaneous eliminations disputed | Deterministic documented tie-break + audit log |
| Scope | Config-driven weapons/hazards; every phase leaves the app runnable |
