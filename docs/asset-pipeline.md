# Asset pipeline

## Current state: 100 % original, 100 % procedural

Every visual and audio asset is generated in code at runtime:

- **Characters** — composed Babylon geometry (`game/character.ts`): body
  presets with exaggerated proportions, hand-drawn faces on DynamicTextures,
  hair/accessory meshes, procedural squash-and-stretch animation.
- **Arena** — `game/arena.ts` builds the Disaster Dome from the shared collision
  layout (`@ddd/shared/arena`) plus decorative dressing; signage, floor, crowd,
  whiteboard, TVs are DynamicTextures painted with Canvas 2D.
- **Weapons / projectiles / drops / hazards** — `game/items.ts`.
- **SFX & music** — WebAudio synthesis recipes (`audio/audio.ts`).
- **Voice** — Speech Synthesis API (announcer + Yippee variants) with a synth
  fallback; captions always available.

Consequences: zero download weight for assets, zero licensing risk (see
`ASSET-LICENSES.md`), and everything is tweakable in code review.

## Upgrade path to commissioned art

The interfaces were designed for drop-in replacement:

1. **Characters** — `createCharacter()` returns a `CharacterRig` (root node,
   anim setter, weapon holder, nameplate API). A GLB-based factory can
   implement the same interface using `SceneLoader.ImportMeshAsync` +
   `AnimationGroup`s; gameplay code never touches geometry.
2. **Arena** — keep `ArenaLayout` (collision truth) and swap the *dressing*
   per `box.kind`; a full GLB environment just needs its collision boxes
   mirrored into the layout.
3. **Audio** — `audio.play(key)` keys map 1:1 to future recorded files.

## Rules for imported assets (when they arrive)

- Formats: `.glb` (glTF binary), Draco or Meshopt compressed; KTX2/BasisU
  textures where supported.
- Budget guide: ≤15k tris per character incl. accessories, ≤150k tris arena,
  2k textures max on High (1k Medium, 512 Low).
- Every file must be listed in `ASSET-LICENSES.md` with source, license, and
  proof link **before** merging. Unverified downloads are banned.
- Serve from `/public/assets/` (hashed) or a CDN; preload via manifest at the
  loading screen; keep the procedural versions as instant-load fallbacks.
