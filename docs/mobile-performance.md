# Mobile performance

Targets: 60 FPS on strong modern phones, ≥30 FPS on supported midrange phones,
fast first load, no per-frame allocations in hot paths.

## Quality tiers

`apps/client/src/game/quality.ts` probes `deviceMemory`, cores, screen pixels,
and the WebGL renderer string, mapping to Low / Medium / High (user-overridable
in Settings; "Auto" is the default).

| Knob | Low | Medium | High |
| --- | --- | --- | --- |
| Hardware scaling (render resolution) | ≥1.5 | ~1.2–1.6 | ~dpr/2 |
| Shadows | off | 512 blur-exp | 1024 PCF |
| Particle budget | 35 % | 60 % | 100 % |
| Animated props (fans, TVs, banners, spot sweeps) | off | on | on |
| Glow layer | off | off | on |
| Crowd detail | off | on | on |

The cartoon art direction, floor markings, zone tints, silhouettes and
readability survive every tier — Low cuts pixels and simulation-free
decoration, never the game-readability layer.

## Techniques in use

- Static arena meshes: `freezeWorldMatrix()` + material `freeze()`.
- One dynamic directional light + hemispheric fill; every other "light" is an
  emissive material (spot cones, neon, LED trims) — zero extra light cost.
- Particle systems are fire-and-forget with `disposeOnStop`; damage numbers are
  a pooled set of ≤14 billboard planes with `DynamicTexture` redraw only on value change.
- Nameplates redraw their texture only when name/HP bucket changes (≤50 buckets).
- Snapshot interpolation avoids physics on the client; the only client-side
  collision work is the local player's capsule vs the shared AABB list.
- TV static / draft board / floor / crowd are DynamicTextures painted once (or
  at ≤1 Hz for TVs on Medium+), not video or large images.
- `skipPointerMovePicking`, no per-frame `new Vector3` in the render loop
  except a handful in camera blending (measured harmless).
- Babylon is a single pre-chunked bundle (~1.1 MB gzip) served with immutable
  hashes; the app shell is precached by the service worker after first visit.

## Known headroom (see known-limitations.md)

- Babylon full-bundle import could shrink via per-module imports (~30–40 %).
- Stools/cups/bottles could become thin instances (currently unique meshes,
  ~120 draw calls total scene — fine on 2019+ phones, worth doing for very low-end).
- No LOD swap yet: the arena is one detail level; quality tiers cut effects
  instead. Character meshes are ~2k tris each — low enough to skip LODs.

## Measuring

Settings → "Performance monitor" shows live FPS. `/health` reports server
uptime; the server logs structured JSON. For load testing see testing.md.
