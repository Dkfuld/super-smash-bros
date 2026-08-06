# Balance configuration guide

All tuning lives in data, never in scattered logic:

| What | File |
| --- | --- |
| Movement, combat timing, stun/knockback, zone damage, pickup radii, grace periods, rate limits | `packages/shared/src/balance.ts` (`SIM`) |
| Zone shrink schedule | `packages/shared/src/balance.ts` (`ZONE_STAGES`) |
| Default host settings | `packages/shared/src/balance.ts` (`DEFAULT_SETTINGS`) |
| Rarity weights & colors | `packages/shared/src/balance.ts` |
| The 20 weapons (damage, knockback, range, cadence, durability, projectile params, special behaviors) | `packages/shared/src/weapons.ts` |
| Power-ups (duration + effect multipliers/flags) | `packages/shared/src/powerups.ts` |
| Hazards (telegraph/active windows, damage, radius, zones, chaos gating) | `packages/shared/src/hazards.ts` |
| Arena geometry, spawns, drop points, trap doors | `packages/shared/src/arena.ts` |
| AI personalities and utility weights | `apps/server/src/ai.ts` |

Because server and client import the same package, changing a number changes
the authoritative sim, the client prediction, and the docs of record together.

## Tuning workflow

```bash
npm run simulate --workspace apps/server -- <seed>
```

runs a full 12-bot match headless in ~0.3 s with the event feed — perfect for
before/after comparisons of any balance change. Same seed = same match, so you
can A/B a tweak precisely. Watch for:

- match length (aim 4–8 sim-minutes at default settings),
- elimination spread (no half-the-lobby-dead in the first minute — the AI has
  a damped "loot phase" for the first 30 s),
- zone vs combat eliminations mix (mostly combat is healthier),
- weapon usage spread in the stats.

## Design intents worth preserving

- **Knockback is the star.** Damage numbers are modest; launching people is the
  comedy and the kill threat. Keep melee knockback ≥ damage in "feel".
- **Legendaries create moments, not wins** — high output, low durability.
- **The hat must not doom its wearer**: `makeLastPlaceSuffer` adds at most
  +12 % knockback taken and visibility. Test that hat players still win
  sometimes across seeds (they do — see `rainbow_redemption` award).
- **Sudden death guarantees an ending**: 45 s in, the zone collapses to zero;
  the last-survivor guard makes a single winner inevitable.
