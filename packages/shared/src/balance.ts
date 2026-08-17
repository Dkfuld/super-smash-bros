import type { MatchSettings } from "./types.js";

/** Simulation constants. All gameplay tuning lives here or in weapons/powerups/hazards configs. */
export const SIM = {
  TICK_RATE: 30,
  TICK_MS: 1000 / 30,
  SNAPSHOT_EVERY_N_TICKS: 2, // 15 Hz snapshots

  PLAYER_RADIUS: 0.55,
  PLAYER_HEIGHT: 1.8,
  WALK_SPEED: 4.2,
  RUN_SPEED: 6.0,
  SPRINT_SPEED: 7.4,
  ACCEL: 40,
  FRICTION: 12,
  AIR_FRICTION: 1.5,
  GRAVITY: -22,
  JUMP_VELOCITY: 7.5,

  DODGE_SPEED: 13,
  DODGE_DURATION_MS: 260,
  DODGE_IFRAMES_MS: 320,
  DODGE_COOLDOWN_MS: 900,

  PUNCH_DAMAGE: 6,
  PUNCH_KNOCKBACK: 6,
  PUNCH_RANGE: 1.7,
  PUNCH_ARC_DEG: 90,
  PUNCH_INTERVAL_MS: 450,
  PUNCH_WINDUP_MS: 120,

  HEAVY_CHARGE_MAX_MS: 1200,
  HEAVY_DAMAGE_MIN: 10,
  HEAVY_DAMAGE_MAX: 22,
  HEAVY_KNOCKBACK_MIN: 9,
  HEAVY_KNOCKBACK_MAX: 20,
  HEAVY_COOLDOWN_MS: 1400,

  STUN_MS_PER_KNOCKBACK: 55, // stun scales with impulse
  MAX_STUN_MS: 1400,
  KNOCKDOWN_THRESHOLD: 14, // impulse above this = knockdown + iframes on wakeup
  WAKEUP_IFRAMES_MS: 900,
  LAUNCH_UP_RATIO: 0.45, // portion of knockback applied vertically

  ZONE_DAMAGE_PER_SEC_BASE: 3, // scales with stage; herds more than it kills
  ZONE_GRACE_SEC: 3, // grace before damage starts ticking for a player newly outside

  PICKUP_RADIUS: 1.3,
  DROP_FALL_SPEED: 9,
  DROP_START_HEIGHT: 14,

  RECONNECT_GRACE_MS: 20_000,
  ROOM_CODE_TTL_MS: 4 * 60 * 60 * 1000,

  YIPPEE_COOLDOWN_MS: 6_000,
  YIPPEE_RANDOM_INTERVAL_MS: 25_000,

  INPUT_RATE_LIMIT_PER_SEC: 60,
  MSG_RATE_LIMIT_PER_SEC: 90,
} as const;

/** Zone shrink schedule: [startAtSec (scaled by duration), radiusFraction of initial]. */
export const ZONE_STAGES: ReadonlyArray<{ atFrac: number; radiusFrac: number; shrinkSec: number }> = [
  { atFrac: 0.18, radiusFrac: 0.75, shrinkSec: 25 },
  { atFrac: 0.38, radiusFrac: 0.55, shrinkSec: 22 },
  { atFrac: 0.56, radiusFrac: 0.38, shrinkSec: 18 },
  { atFrac: 0.72, radiusFrac: 0.24, shrinkSec: 15 },
  { atFrac: 0.86, radiusFrac: 0.13, shrinkSec: 12 },
];

export const DEFAULT_SETTINGS: MatchSettings = {
  matchDurationTargetSec: 480,
  weaponDropRate: 1,
  weaponRarityBoost: 0.25,
  hazardFrequency: 1,
  chaosLevel: 1,
  zoneShrinkSpeed: 1,
  startingHealth: 100,
  knockbackScale: 1,
  powerUpRate: 1,
  aiDifficulty: 1,
  friendlyVisualEffects: true,
  announcerVolume: 0.8,
  musicVolume: 0.6,
  yippeeFrequency: 1,
  makeLastPlaceSuffer: false,
  suddenDeathAtSec: 600,
  spectatorDelaySec: 0,
};

export const RARITY_WEIGHTS: Record<string, number> = {
  common: 46,
  uncommon: 30,
  rare: 16,
  legendary: 5,
  questionable: 3,
};

export const RARITY_COLORS: Record<string, string> = {
  common: "#9fb2c8",
  uncommon: "#4fd47a",
  rare: "#4aa8ff",
  legendary: "#ffb733",
  questionable: "#e05bff",
};

export const MAX_PLAYERS = 12;
