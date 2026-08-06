# Known limitations (honest status)

The game is fully playable end-to-end (host → 12 players/AI → 3D match →
official draft order → exports), but this is a v0.1 and the following are the
real gaps, in rough priority order.

## Visual / content

- **Characters and arena are procedural, not commissioned models.** They are
  cohesive stylized-cartoon art with faces, hair, accessories, materials and
  animation — far beyond primitives — but they are not sculpted GLB characters.
  The rig/arena interfaces are ready for drop-in GLB replacements
  (asset-pipeline.md).
- Character animation is procedural pose-blending; no ragdoll physics on KO
  (a stylized tumble-and-launch plays instead). Prop "physics reactions" are
  animated/cosmetic (chair/pizza hazards, breakable feel via VFX), not a full
  client rigid-body sim.
- The pregame lobby IS a walkable 3D space (players roam the Dome, practice
  attack/dodge/jump, and see everyone who has joined) — but it uses the match
  arena rather than a bespoke backstage room with pizza boxes and draft boards.
  The intro cinematic is spotlight + announcer + hat reveal on the arena camera
  rather than a fully choreographed cutscene.
- Only one arena (the Disaster Dome). The plumbing supports more
  (`ARENAS` map + `hostSetArena`).
- Victory sequence has slow-orbit camera, confetti, FIRST PICK banner and
  stats — no recorded replay of the final elimination.

## Gameplay

- 6 of 20 weapons share the generic projectile flight model with different
  stats/visuals (they still feel distinct through speed/homing/AoE/trails).
- Emotes are a single generic celebration animation.
- Power-ups all function, but two are visual-lite: Pizza Grease Slide is a pure
  speed boost (no slick trail behind the player), Sudden Dance Break locks
  movement + dance pose without bespoke music.
- The "interact" context button and rideable-cart steering are minimal
  (cart = straight-line charge).
- Bots don't path around concave geometry perfectly (single-probe steering);
  they can hug a wall for a second before deflecting. Funny, arguably a feature.

## Tech

- Prediction is "advance + soft converge", not input-replay reconciliation
  (networking.md explains why this is fine at these speeds).
- Snapshots are JSON; binary/delta encoding is future work (bandwidth today:
  ~1–2 KB/s per client after gzip-less WS — acceptable on LTE).
- SQLite by default; Postgres migration provided but the `Store` port is manual.
- PWA: installable + shell-cached; no offline mode (a multiplayer game offline
  is a philosophical question anyway).
- Spectator delay buffers server-side but the spectator UI does not show a
  "delayed by Ns" badge.
- iOS Speech Synthesis voices vary by device; the Yippee is always accompanied
  by the on-screen rainbow caption so the joke lands even on mute.
- Analytics/crash-reporting hooks are structured-log-ready but no vendor wired.

## Testing

- E2E now includes a full ⚡Turbo match run to completion with assertions on the
  official 12-pick draft order, hat marker, exports, and the results API
  (~60 s wall-clock).
- No automated FPS regression harness; perf is measured manually via the
  in-game monitor.
