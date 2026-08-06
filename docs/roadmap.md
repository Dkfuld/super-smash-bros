# Prioritized roadmap

## P0 — before your first real league night
1. Deploy to a WebSocket-friendly host with a volume (deployment.md) and run a
   full 12-phone dress rehearsal on real devices.
2. "Turbo" settings preset (30–60 s matches) for warm-up rounds and for a full
   end-to-end automated results test.
3. Field-tune default balance from a couple of human matches (see balance.md).

## P1 — polish that pays off most
4. Commissioned/sculpted GLB character set behind the existing `CharacterRig`
   interface (asset-pipeline.md); Draco/Meshopt + KTX2 pipeline.
5. Final-elimination instant replay (ring-buffer of snapshots → 5 s cinematic).
6. Walkable 3D pregame lobby (backstage room with practice targets) reusing the
   arena builder.
7. Per-weapon bespoke projectile behaviors for the 6 generic ones; slick trail
   visuals for grease/mustard on the client floor.
8. Binary/delta snapshot encoding + interest management (halves bandwidth).

## P2 — bigger swings
9. Second arena ("The Waiver Wire Warehouse") — layout data + dressing pass.
10. Input-replay reconciliation if competitive players complain about feel.
11. Season mode: persist multiple matches per league, aggregate stats,
    hall-of-shame page for repeat hat wearers.
12. Postgres/Supabase Store implementation + row-level security for a hosted
    multi-league service; magic-link host accounts.
13. Native-ish wrapper (Capacitor) only if a league insists on an app store.

## P3 — because it would be funny
14. Announcer voice pack recorded by the league's own commissioner.
15. Mascot AI 13th "chaos agent" that can't win but can ruin everything.
16. Hat cosmetic shop where the only currency is having lost.
