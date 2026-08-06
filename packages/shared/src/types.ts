/** Core shared types for Draft Day: Disaster Dome. */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type MatchPhase =
  | "lobby"
  | "intro" // pregame loser cinematic
  | "countdown"
  | "playing"
  | "finalTwo" // brief cinematic pause when 2 remain
  | "suddenDeath"
  | "victory"
  | "ended";

export type AnimState =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "heavy"
  | "charge"
  | "dodge"
  | "hit"
  | "down"
  | "launched"
  | "ko"
  | "victory"
  | "emote"
  | "pickup";

export type EliminationCause =
  | "damage" // health reached 0
  | "outOfArena" // launched beyond arena bounds
  | "trapDoor"
  | "autoDraftZone" // outside safe zone too long
  | "suddenDeath"
  | "hazard";

export interface EliminationRecord {
  playerId: string;
  playerName: string;
  /** Server sim tick at which the elimination was committed. */
  tick: number;
  /** Server wall-clock ms timestamp. */
  timestamp: number;
  cause: EliminationCause;
  /** Player credited with the elimination, if any. */
  byPlayerId: string | null;
  /** Weapon or hazard id used, if any. */
  withWeapon: string | null;
  /** Total damage this player had received (tie-break input). */
  damageReceived: number;
  /** Participant slot index 0..11 (final tie-break input). */
  slotIndex: number;
  /** 1..12 — assigned after tie-breaking. */
  placement: number;
}

export interface DraftPick {
  pick: number; // 1..12
  playerId: string;
  playerName: string;
  placement: number; // 1..12 (1 = winner)
  characterId: string;
  colorId: string;
}

export interface PlayerStats {
  playerId: string;
  eliminations: number;
  damageDealt: number;
  damageReceived: number;
  weaponsUsed: string[];
  weaponsPickedUp: number;
  legendaryPickups: number;
  survivalMs: number;
  distanceTraveled: number;
  environmentalEliminations: number;
  knockdownsDealt: number;
  timeHidingMs: number;
  yippees: number;
}

export interface MatchAward {
  id: string;
  title: string;
  description: string;
  playerId: string;
  playerName: string;
}

export interface MatchResults {
  matchId: string;
  leagueName: string;
  arenaId: string;
  startedAt: number;
  endedAt: number;
  draftOrder: DraftPick[];
  eliminations: EliminationRecord[];
  stats: PlayerStats[];
  awards: MatchAward[];
  rainbowHatPlayerId: string | null;
  settings: MatchSettings;
}

/** Character customization chosen during onboarding. */
export interface CharacterConfig {
  bodyId: string; // proportions preset
  colorId: string; // palette
  faceId: string; // drawn face
  hairId: string; // hair / head shape
  accessoryId: string; // hat/glasses/cape/etc ("none" allowed)
}

export type SlotStatus = "empty" | "human" | "ai";
export type ConnStatus = "connected" | "disconnected" | "ai-takeover";

/** One of the 12 league participant slots managed by the host. */
export interface ParticipantSlot {
  slotIndex: number; // 0..11
  id: string; // stable participant id
  name: string;
  status: SlotStatus;
  connStatus: ConnStatus;
  ready: boolean;
  isPreviousLoser: boolean;
  character: CharacterConfig;
}

export interface MatchSettings {
  matchDurationTargetSec: number; // ~360-600
  weaponDropRate: number; // 0.5-2 multiplier
  weaponRarityBoost: number; // 0-1, shifts rarity table upward
  hazardFrequency: number; // 0-2 multiplier
  chaosLevel: number; // 0-3
  zoneShrinkSpeed: number; // 0.5-2 multiplier
  startingHealth: number; // default 100
  knockbackScale: number; // 0.5-2
  powerUpRate: number; // 0-2
  aiDifficulty: number; // 0-2
  friendlyVisualEffects: boolean;
  announcerVolume: number; // 0-1
  musicVolume: number; // 0-1
  yippeeFrequency: number; // 0-2 multiplier, 0 disables random yippees
  makeLastPlaceSuffer: boolean;
  suddenDeathAtSec: number; // hard cap before sudden death
  spectatorDelaySec: number; // 0 = live
}

export interface RoomSummary {
  code: string;
  leagueName: string;
  phase: MatchPhase;
  slots: ParticipantSlot[];
  settings: MatchSettings;
  arenaId: string;
  assignmentsLocked: boolean;
}

/** Per-fighter data inside a snapshot. Quantized-ish but kept readable JSON. */
export interface FighterSnap {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: AnimState;
  hp: number;
  weapon: string | null;
  ammo: number;
  charge: number; // 0..1 heavy charge amount
  powerups: string[];
  eliminated: boolean;
  hat: boolean; // wearing the Rainbow Fan-Spin Hat
  stunned: boolean;
}

export interface ProjectileSnap {
  id: number;
  kind: string; // weapon id that fired it
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PickupSnap {
  id: number;
  itemId: string; // weapon or powerup id
  itemType: "weapon" | "powerup";
  x: number;
  y: number;
  z: number;
  /** falling = still descending from the delivery */
  state: "incoming" | "landed";
  rarity: string;
}

export interface HazardSnap {
  id: number;
  kind: string;
  x: number;
  z: number;
  radius: number;
  /** telegraph = warning phase, active = dealing damage */
  state: "telegraph" | "active" | "done";
  /** seconds until activation (telegraph) or until end (active) */
  t: number;
}

export interface ZoneSnap {
  cx: number;
  cz: number;
  radius: number;
  targetRadius: number;
  stage: number;
  nextShrinkInSec: number;
}

export interface Snapshot {
  tick: number;
  serverTime: number;
  phase: MatchPhase;
  matchTimeSec: number;
  fighters: FighterSnap[];
  projectiles: ProjectileSnap[];
  pickups: PickupSnap[];
  hazards: HazardSnap[];
  zone: ZoneSnap;
  aliveCount: number;
  /** seq of the last input the server processed for the receiving client (reconciliation). */
  lastProcessedInput?: number;
}

/** Discriminated union of gameplay events (drives VFX, SFX, announcer, feed, audit log). */
export type GameEvent =
  | { e: "hit"; tick: number; attacker: string; target: string; weapon: string | null; damage: number; x: number; y: number; z: number; heavy: boolean }
  | { e: "knockdown"; tick: number; target: string; by: string | null }
  | { e: "elimination"; tick: number; record: EliminationRecord }
  | { e: "drop"; tick: number; pickupId: number; itemId: string; rarity: string; via: string; x: number; z: number }
  | { e: "pickupTaken"; tick: number; playerId: string; itemId: string; itemType: "weapon" | "powerup"; rarity: string }
  | { e: "hazardTelegraph"; tick: number; kind: string; x: number; z: number; radius: number }
  | { e: "hazardActive"; tick: number; kind: string; x: number; z: number; radius: number }
  | { e: "zoneStage"; tick: number; stage: number; radius: number }
  | { e: "yippee"; tick: number; playerId: string; variant: string; reason: string }
  | { e: "announce"; tick: number; line: string; mood: string }
  | { e: "phase"; tick: number; phase: MatchPhase }
  | { e: "throw"; tick: number; playerId: string; weapon: string }
  | { e: "propHit"; tick: number; kind: string; x: number; y: number; z: number }
  | { e: "powerupExpired"; tick: number; playerId: string; powerupId: string }
  | { e: "victory"; tick: number; playerId: string; playerName: string };

export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "questionable";

export type WeaponClass =
  | "melee" // swing arc
  | "projectile" // fires a projectile
  | "spread" // multiple projectiles in a fan
  | "cone" // continuous push/damage cone (leaf blower, hot sauce)
  | "thrown" // the weapon itself is thrown (brick, croc, cake)
  | "ride"; // shopping cart style charge

export interface WeaponDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  class: WeaponClass;
  damage: number;
  knockback: number; // impulse units
  range: number; // melee arc reach or projectile lifetime-range (units)
  attackIntervalMs: number;
  cooldownMs: number;
  /** Uses before the weapon breaks (Infinity not JSON-safe: use -1 for unlimited). */
  durability: number;
  projectileSpeed?: number;
  projectileRadius?: number;
  spreadCount?: number;
  spreadAngleDeg?: number;
  homing?: number; // 0..1 steering strength
  pushForce?: number; // for cone class
  aoeRadius?: number; // explosion radius on impact
  fuseMs?: number; // timed explosives
  slowFactor?: number; // movement slow applied on hit
  blind?: boolean; // glitter
  trail?: "mustard" | "grease" | null;
  selfSpeedBoost?: number; // ride class
  /** Mobile aim: "auto" snaps to nearest target in facing cone; "direction" uses facing. */
  aim: "auto" | "direction";
  audio: string; // audio cue key
  particle: string; // particle effect key
  /** Comedy flavor line the announcer can use. */
  announcerLine?: string;
}

export interface PowerUpDef {
  id: string;
  name: string;
  description: string;
  durationMs: number;
  rarity: Rarity;
  /** Multipliers / flags applied while active. */
  effects: {
    speedMult?: number;
    knockbackDealtMult?: number;
    knockbackReceivedMult?: number;
    shield?: boolean;
    invisible?: boolean;
    regenPerSec?: number;
    headScale?: number;
    bodyScale?: number;
    reverseControls?: boolean;
    forceDance?: boolean;
    zoneImmunity?: boolean;
    yippeeOverdrive?: boolean;
  };
}

export interface HazardDef {
  id: string;
  name: string;
  telegraphMs: number;
  activeMs: number;
  damage: number;
  knockback: number;
  radius: number;
  /** Where it can spawn: zone names or "anywhere". */
  zones: string[];
  audio: string;
  minChaos: number; // required chaos level
}

/** Static arena collision + layout data shared by server (collision) and client (visuals). */
export interface ArenaBox {
  x: number;
  z: number;
  w: number; // full width (x)
  d: number; // full depth (z)
  h: number; // height — walkable top if <= 1.6
  y?: number; // base elevation, default 0
  kind: string; // semantic tag for the client dressing ("barCounter", "stage", ...)
  walkable?: boolean; // can players stand on top
}

export interface TrapDoorSpot {
  id: number;
  x: number;
  z: number;
  radius: number;
}

export interface ArenaLayout {
  id: string;
  name: string;
  /** Playable bounds (players launched beyond are eliminated). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Fall-out ring: outside bounds but inside killZ the player ragdolls out. */
  spawnPoints: Vec2[];
  boxes: ArenaBox[];
  trapDoors: TrapDoorSpot[];
  weaponDropPoints: Vec2[];
  zoneNames: Record<string, { x: number; z: number; label: string }>;
  initialZoneRadius: number;
}
