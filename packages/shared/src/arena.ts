import type { ArenaBox, ArenaLayout, Vec2 } from "./types.js";

/**
 * The Fantasy Draft Disaster Dome.
 *
 * This layout is the single source of truth for arena geometry: the server uses
 * the boxes for collision & elevation, the client uses the same boxes (via
 * `kind`) to build detailed themed props on top, plus purely decorative
 * dressing that never collides.
 *
 * Conventions:
 *  - Y-up, arena centered at origin, ~64x64 units.
 *  - Boxes with (top - playerY) <= STEP_UP are climbable steps/platforms.
 *  - North (+Z) = Draft Stage, East (+X) = Sports Bar, South (-Z) = Basement
 *    War Room, West (-X) = Locker Room, North-East corner = Game-Show Zone.
 */

export const STEP_UP = 0.65;

function box(kind: string, x: number, z: number, w: number, d: number, h: number, y = 0): ArenaBox {
  return { kind, x, z, w, d, h, y, walkable: h + y <= 1.35 };
}

const boxes: ArenaBox[] = [
  // ---------- Draft Stage (north) ----------
  box("stageFloor", 0, 21, 20, 12, 1.2), // elevated main stage
  box("stageStep", 0, 14.2, 12, 1.6, 0.6), // lower step
  box("stageStep", 0, 15.4, 12, 1.0, 0.9), // mid step (reachable from lower)
  { kind: "draftBoard", x: 0, z: 27.5, w: 14, d: 1, h: 7, y: 1.2, walkable: false },
  { kind: "podium", x: -6.5, z: 23, w: 1.6, d: 1.6, h: 1.3, y: 1.2, walkable: false },
  { kind: "speaker", x: -9, z: 17.5, w: 1.4, d: 1.4, h: 2.4, y: 1.2, walkable: false },
  { kind: "speaker", x: 9, z: 17.5, w: 1.4, d: 1.4, h: 2.4, y: 1.2, walkable: false },
  box("stageRamp", -8.5, 13.6, 3, 4.8, 0.55),
  box("stageRamp", 8.5, 13.6, 3, 4.8, 0.55),

  // ---------- Sports Bar (east) ----------
  { kind: "barCounter", x: 21, z: 2, w: 2, d: 16, h: 1.1, walkable: false },
  { kind: "backBar", x: 27.5, z: 2, w: 1.5, d: 14, h: 3.2, walkable: false },
  box("stool", 19.2, -3, 0.8, 0.8, 0.65),
  box("stool", 19.2, 0, 0.8, 0.8, 0.65),
  box("stool", 19.2, 3, 0.8, 0.8, 0.65),
  box("stool", 19.2, 6, 0.8, 0.8, 0.65),
  { kind: "kitchenPass", x: 24, z: 11.5, w: 6, d: 1.2, h: 2.6, walkable: false },
  box("servingTray", 22, -8, 3.4, 2.0, 0.5),

  // ---------- Basement War Room (south) ----------
  { kind: "foldingTable", x: -6, z: -19, w: 5, d: 2.4, h: 0.95, walkable: false },
  { kind: "foldingTable", x: 3, z: -22, w: 5, d: 2.4, h: 0.95, walkable: false },
  { kind: "foldingTable", x: 11, z: -17, w: 5, d: 2.4, h: 0.95, walkable: false },
  box("beanbag", -12, -22, 2.2, 2.2, 0.55),
  box("beanbag", -14.5, -19, 2.2, 2.2, 0.55),
  { kind: "whiteboard", x: -2, z: -27.5, w: 8, d: 0.8, h: 3.4, walkable: false },
  { kind: "trophyShelf", x: 9, z: -27.5, w: 5, d: 0.9, h: 2.8, walkable: false },
  box("pizzaStack", -1, -16, 1.4, 1.4, 0.8),

  // ---------- Locker Room (west) ----------
  { kind: "lockers", x: -27.5, z: -4, w: 1.6, d: 18, h: 3.6, walkable: false },
  box("bench", -23, -8, 1.2, 7, 0.5),
  box("bench", -23, 3, 1.2, 7, 0.5),
  { kind: "laundryCart", x: -19, z: 8, w: 2.4, d: 1.8, h: 1.4, walkable: false },
  { kind: "waterCooler", x: -25.5, z: 9, w: 1.1, d: 1.1, h: 1.7, walkable: false },
  box("gearBag", -18, -13, 1.8, 1.2, 0.6),

  // ---------- Game-Show Zone (north-east corner) ----------
  { kind: "waiverWheel", x: 22, z: 20, w: 1.2, d: 1.2, h: 4.5, walkable: false },
  { kind: "prizeDisplay", x: 27, z: 24, w: 3.4, d: 2, h: 2.8, walkable: false },
  { kind: "hostPodium", x: 17, z: 24.5, w: 1.5, d: 1.5, h: 1.3, walkable: false },
  box("buzzer", 19.5, 16.5, 1.2, 1.2, 0.7),

  // ---------- Center + circulation ----------
  { kind: "pillar", x: -13, z: 13, w: 1.6, d: 1.6, h: 6, walkable: false },
  { kind: "pillar", x: 13, z: -12, w: 1.6, d: 1.6, h: 6, walkable: false },
  box("bouncePad", 0, -8, 2.6, 2.6, 0.3),
  box("bouncePad", -14, 0, 2.6, 2.6, 0.3),
  box("centerLogo", 0, 2, 6, 6, 0.12),
  box("crate", 14, 8, 1.6, 1.6, 1.1),
  box("crate", -9, -6, 1.6, 1.6, 1.1),
  box("crate", -9, -7.8, 1.6, 1.6, 0.6),

  // ---------- Perimeter railings (breakable visual, low cover) ----------
  { kind: "railing", x: 0, z: -30.5, w: 26, d: 0.5, h: 1.0, walkable: false },
  { kind: "railing", x: -30.5, z: 12, w: 0.5, d: 16, h: 1.0, walkable: false },
  { kind: "railing", x: 30.5, z: -12, w: 0.5, d: 16, h: 1.0, walkable: false },
];

// Hand-placed spawn ring (r ≈ 24–28.5), slot order still walking the circle.
// The old radius-23 ring put slot 3 inside the podium and had three fighters
// hugging furniture; these points are all ≥1.25 clear of every blocking box
// and ≥14 apart from each other (verified by script — see spawn test).
const spawnPoints: Vec2[] = [
  { x: 25.4, z: 6.3 }, { x: 20.1, z: 19.6 }, { x: 11.5, z: 26.5 }, { x: -11.5, z: 26.5 },
  { x: -20.2, z: 20.1 }, { x: -27.5, z: 7.6 }, { x: -25.4, z: -6.7 }, { x: -20.2, z: -20.2 },
  { x: -7.7, z: -27.4 }, { x: 6.7, z: -25.8 }, { x: 20.1, z: -20.2 }, { x: 27.4, z: -7.9 },
];

const weaponDropPoints: Vec2[] = [
  { x: 0, z: 2 }, { x: 0, z: 21 }, { x: -10, z: 8 }, { x: 10, z: -8 },
  { x: 21, z: -6 }, { x: 24, z: 6 }, { x: -6, z: -14 }, { x: 8, z: -20 },
  { x: -20, z: -2 }, { x: -22, z: -12 }, { x: 20, z: 17 }, { x: 25, z: 22 },
  { x: -16, z: 17 }, { x: 15, z: 12 }, { x: -3, z: -24 }, { x: 12, z: 2 },
];

export const DISASTER_DOME: ArenaLayout = {
  id: "disaster_dome",
  name: "The Fantasy Draft Disaster Dome",
  bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
  spawnPoints,
  boxes,
  trapDoors: [
    { id: 1, x: 20, z: 22, radius: 1.6 },
    { id: 2, x: 5, z: 7, radius: 1.6 },
    { id: 3, x: -5, z: -3, radius: 1.6 },
    { id: 4, x: 24, z: 15, radius: 1.6 },
  ],
  weaponDropPoints,
  zoneNames: {
    stage: { x: 0, z: 21, label: "Draft Stage" },
    bar: { x: 22, z: 0, label: "Sports-Bar Zone" },
    warroom: { x: 0, z: -21, label: "Basement War Room" },
    lockers: { x: -22, z: 0, label: "Locker Room" },
    gameshow: { x: 22, z: 21, label: "Game-Show Zone" },
    center: { x: 0, z: 0, label: "Center Court" },
  },
  initialZoneRadius: 31,
};

export const ARENAS: ReadonlyMap<string, ArenaLayout> = new Map([[DISASTER_DOME.id, DISASTER_DOME]]);

/**
 * Elevation support: highest box top at (x,z) that is reachable from height y
 * (step-up rule), else 0 (ground).  Also used by the client for visual placement.
 */
export function supportHeight(layout: ArenaLayout, x: number, z: number, y: number, radius: number): number {
  let best = 0;
  for (const b of layout.boxes) {
    if (!b.walkable) continue;
    const top = (b.y ?? 0) + b.h;
    if (top <= best) continue;
    if (top - y > STEP_UP) continue;
    if (
      x + radius > b.x - b.w / 2 && x - radius < b.x + b.w / 2 &&
      z + radius > b.z - b.d / 2 && z - radius < b.z + b.d / 2
    ) {
      best = top;
    }
  }
  return best;
}

/** True if a capsule at (x,z,y) would intersect a non-climbable box side. */
export function collidesBlocking(layout: ArenaLayout, x: number, z: number, y: number, radius: number): boolean {
  for (const b of layout.boxes) {
    const base = b.y ?? 0;
    const top = base + b.h;
    if (top - y <= STEP_UP) continue; // climbable from this height — not blocking
    if (y >= top) continue; // above it entirely
    if (
      x + radius > b.x - b.w / 2 && x - radius < b.x + b.w / 2 &&
      z + radius > b.z - b.d / 2 && z - radius < b.z + b.d / 2
    ) {
      return true;
    }
  }
  return false;
}
