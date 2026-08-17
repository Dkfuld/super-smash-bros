import {
  ARENAS,
  DEFAULT_SETTINGS,
  HAZARDS,
  POWERUPS,
  RARITY_WEIGHTS,
  Rng,
  SIM,
  WEAPONS,
  ZONE_STAGES,
  assignPlacements,
  collidesBlocking,
  computeAwards,
  computeDraftOrder,
  getPowerUp,
  getWeapon,
  supportHeight,
  type AnimState,
  type ArenaLayout,
  type EliminationCause,
  type EliminationRecord,
  type FighterSnap,
  type GameEvent,
  type InputMessage,
  type MatchPhase,
  type MatchResults,
  type MatchSettings,
  type ParticipantSlot,
  type PlayerStats,
  type Snapshot,
  type WeaponDef,
} from "../index.js";
import { announcerLine, YIPPEE_VARIANTS } from "./announcer.js";
import { AiController } from "./ai.js";

const T = SIM.TICK_RATE;
const DT = 1 / T;
const ms = (m: number) => Math.max(1, Math.round((m / 1000) * T)); // ms → ticks

export interface Fighter {
  id: string;
  slotIndex: number;
  name: string;
  aiControlled: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  anim: AnimState;
  animUntil: number;
  grounded: boolean;
  stunUntil: number;
  iframesUntil: number;
  dodgeUntil: number;
  dodgeCdUntil: number;
  dodgeDirX: number; dodgeDirZ: number;
  attackReadyAt: number;
  pendingHit: { tick: number; heavy: boolean; charge: number; weapon: string | null } | null;
  chargeStart: number | null;
  heavyCdUntil: number;
  rideUntil: number;
  rideCdUntil: number;
  weapon: string | null;
  ammo: number;
  powerups: Map<string, number>; // id -> expires tick
  slowUntil: number;
  slowFactor: number;
  blindUntil: number;
  eliminated: boolean;
  hat: boolean;
  lastInput: InputMessage | null;
  lastInputSeq: number;
  prevAtk: boolean;
  prevHeavy: boolean;
  wasCharging: boolean;
  outsideZoneSince: number | null;
  lastCombatTick: number;
  lastDamagedBy: string | null;
  lastDamagedTick: number;
  yippeeCdUntil: number;
  firstMoveDone: boolean;
  stats: PlayerStats;
}

interface Projectile {
  id: number;
  kind: string; // weapon id
  owner: string;
  x: number; y: number; z: number;
  vx: number; vz: number;
  yaw: number;
  ttl: number; // ticks remaining
  fuse: number | null; // ticks until forced explosion
  radius: number;
  homing: number;
  trailCd: number;
}

interface Pickup {
  id: number;
  itemId: string;
  itemType: "weapon" | "powerup";
  rarity: string;
  x: number; y: number; z: number;
  state: "incoming" | "landed";
}

interface ActiveHazard {
  id: number;
  kind: string;
  x: number; z: number;
  radius: number;
  state: "telegraph" | "active";
  stateEndsAt: number; // tick
  damageCd: number;
  trapDoorId: number | null;
}

interface SlickSpot { x: number; z: number; r: number; until: number }

export interface MatchInit {
  matchId: string;
  roomCode: string;
  leagueName: string;
  participants: ParticipantSlot[];
  settings: MatchSettings;
  arenaId: string;
  seed: number;
  hatPlayerId: string | null;
  onEnd: (results: MatchResults) => void;
}

/**
 * Fully authoritative match simulation. Clients only ever submit inputs; every
 * number that matters (health, damage, placement, draft order) is computed here
 * and logged as ordered events.
 */
export class Match {
  readonly matchId: string;
  readonly settings: MatchSettings;
  readonly layout: ArenaLayout;
  readonly fighters = new Map<string, Fighter>();
  phase: MatchPhase = "intro";
  paused = false;
  tickNo = 0;

  private readonly init: MatchInit;
  private readonly rng: Rng;
  private readonly ai = new Map<string, AiController>();
  private events: GameEvent[] = [];
  private eventSeq = 0;
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private hazards: ActiveHazard[] = [];
  private slicks: SlickSpot[] = [];
  private nextEntityId = 1;
  private elimQueue: Array<{ f: Fighter; cause: EliminationCause; by: string | null; weapon: string | null }> = [];
  private eliminations: EliminationRecord[] = [];
  private playTicks = 0; // ticks spent in "playing"-like phases
  private phaseUntil = 0;
  private zoneStageIdx = -1;
  private zoneRadius: number;
  private zoneTarget: number;
  private zoneShrinkPerTick = 0;
  private nextDropAt = 0;
  private nextPowerupAt = 0;
  private nextHazardAt = 0;
  private nextRandomYippeeAt = 0;
  private nextRoastAt = ms(35000);
  private lastHitEventTick = 0;
  private quietAnnounced = false;
  private announcedCounts = new Set<number>();
  private firstPickupDone = false;
  private firstElimDone = false;
  private finalTwoDone = false;
  private hazardHoldUntil = 0;
  private suddenDeathStarted = false;
  private suddenDeathAtTick = 0;
  private openTrapDoors = new Set<number>();
  results: MatchResults | null = null;
  readonly startedAt = Date.now();

  constructor(init: MatchInit) {
    this.init = init;
    this.matchId = init.matchId;
    this.settings = { ...DEFAULT_SETTINGS, ...init.settings };
    const layout = ARENAS.get(init.arenaId) ?? ARENAS.get("disaster_dome");
    if (!layout) throw new Error("no arena");
    this.layout = layout;
    this.rng = new Rng(init.seed);
    this.zoneRadius = layout.initialZoneRadius;
    this.zoneTarget = layout.initialZoneRadius;

    const spawns = this.rng.shuffle([...layout.spawnPoints]);
    init.participants.forEach((p, i) => {
      const sp = spawns[i % spawns.length] ?? { x: 0, z: 0 };
      const f: Fighter = {
        id: p.id, slotIndex: p.slotIndex, name: p.name,
        aiControlled: p.status === "ai",
        x: sp.x, y: 0, z: sp.z,
        vx: 0, vy: 0, vz: 0,
        yaw: Math.atan2(-sp.x, -sp.z),
        hp: this.settings.startingHealth, maxHp: this.settings.startingHealth,
        anim: "idle", animUntil: 0, grounded: true,
        stunUntil: 0, iframesUntil: 0,
        dodgeUntil: 0, dodgeCdUntil: 0, dodgeDirX: 0, dodgeDirZ: 0,
        attackReadyAt: 0, pendingHit: null, chargeStart: null, heavyCdUntil: 0,
        rideUntil: 0, rideCdUntil: 0,
        weapon: null, ammo: 0,
        powerups: new Map(), slowUntil: 0, slowFactor: 1, blindUntil: 0,
        eliminated: false,
        hat: p.id === init.hatPlayerId,
        lastInput: null, lastInputSeq: 0, prevAtk: false, prevHeavy: false, wasCharging: false,
        outsideZoneSince: null, lastCombatTick: 0, lastDamagedBy: null, lastDamagedTick: -9999,
        yippeeCdUntil: 0, firstMoveDone: false,
        stats: {
          playerId: p.id, eliminations: 0, damageDealt: 0, damageReceived: 0,
          weaponsUsed: [], weaponsPickedUp: 0, legendaryPickups: 0, survivalMs: 0,
          distanceTraveled: 0, environmentalEliminations: 0, knockdownsDealt: 0,
          timeHidingMs: 0, yippees: 0,
        },
      };
      this.fighters.set(p.id, f);
      this.ai.set(p.id, new AiController(p.id, this.rng.int(0, 1e9), this.settings.aiDifficulty));
    });

    // Intro cinematic only when there is a previous-year loser to roast.
    if (init.hatPlayerId) {
      this.phase = "intro";
      this.phaseUntil = ms(7000);
      const hat = this.fighters.get(init.hatPlayerId);
      if (hat) {
        this.emit({ e: "announce", tick: 0, line: announcerLine(this.rng, "introLoser", hat.name), mood: "intro" });
        this.yippee(hat, "intro", true);
      }
    } else {
      this.phase = "countdown";
      this.phaseUntil = ms(3500);
    }
    this.emit({ e: "phase", tick: 0, phase: this.phase });
    this.scheduleFirstTimers();
  }

  // ---------------- public API ----------------

  setInput(playerId: string, input: InputMessage): void {
    const f = this.fighters.get(playerId);
    if (!f || f.eliminated || f.aiControlled) return;
    if (input.seq <= f.lastInputSeq) return; // stale/replayed input
    f.lastInputSeq = input.seq;
    f.lastInput = input;
  }

  setAiControlled(playerId: string, on: boolean): void {
    const f = this.fighters.get(playerId);
    if (f) f.aiControlled = on;
  }

  hostSkipIntro(): void {
    if (this.phase === "intro") {
      this.phase = "countdown";
      this.phaseUntil = this.tickNo + ms(3500);
      this.emit({ e: "phase", tick: this.tickNo, phase: this.phase });
    }
  }

  hostYippee(): void {
    const hat = this.hatFighter();
    if (hat) this.yippee(hat, "hostButton", true);
  }

  hostCommentary(kind: "hype" | "roast" | "stats"): void {
    const key = kind === "hype" ? "hostHype" : kind === "roast" ? "hostRoast" : "hostStats";
    this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, key), mood: kind });
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get eventCount(): number {
    return this.eventSeq;
  }

  aliveCount(): number {
    let n = 0;
    for (const f of this.fighters.values()) if (!f.eliminated) n++;
    return n;
  }

  // ---------------- tick ----------------

  tick(): void {
    if (this.paused || this.phase === "ended") return;
    this.tickNo++;

    switch (this.phase) {
      case "intro":
      case "countdown":
        if (this.tickNo >= this.phaseUntil) {
          if (this.phase === "intro") {
            this.phase = "countdown";
            this.phaseUntil = this.tickNo + ms(3500);
          } else {
            this.phase = "playing";
            this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "matchStart"), mood: "start" });
            const hat = this.hatFighter();
            if (hat) this.yippee(hat, "matchStart", true);
          }
          this.emit({ e: "phase", tick: this.tickNo, phase: this.phase });
        }
        return;
      case "finalTwo":
        if (this.tickNo >= this.phaseUntil) {
          this.phase = "playing";
          this.emit({ e: "phase", tick: this.tickNo, phase: this.phase });
        }
        return;
      case "victory":
        return; // frozen, results already committed
      default:
        break;
    }

    // "playing" or "suddenDeath"
    this.playTicks++;
    this.tickTimers();
    this.tickFighters();
    this.tickProjectiles();
    this.tickPickups();
    this.tickHazards();
    this.tickZone();
    this.commitEliminations();
    this.checkPhaseTransitions();
  }

  // ---------------- internals ----------------

  private scheduleFirstTimers(): void {
    this.nextDropAt = ms(8000);
    this.nextPowerupAt = ms(20000);
    this.nextHazardAt = ms(15000);
    this.nextRandomYippeeAt = ms(SIM.YIPPEE_RANDOM_INTERVAL_MS);
  }

  private emit(e: GameEvent): void {
    this.eventSeq++;
    this.events.push(e);
  }

  private hatFighter(): Fighter | null {
    for (const f of this.fighters.values()) if (f.hat) return f;
    return null;
  }

  private matchTimeSec(): number {
    return this.playTicks / T;
  }

  private yippee(f: Fighter, reason: string, force = false): void {
    if (this.settings.yippeeFrequency <= 0 && !force) return;
    const cdTicks = ms(SIM.YIPPEE_COOLDOWN_MS / Math.max(0.25, this.settings.yippeeFrequency));
    if (!force && this.tickNo < f.yippeeCdUntil) return;
    f.yippeeCdUntil = this.tickNo + cdTicks;
    f.stats.yippees++;
    const variant = YIPPEE_VARIANTS[this.rng.int(0, YIPPEE_VARIANTS.length - 1)] ?? "excited";
    this.emit({ e: "yippee", tick: this.tickNo, playerId: f.id, variant, reason });
  }

  private maybeYippeeHat(reason: string): void {
    const hat = this.hatFighter();
    if (hat && !hat.eliminated) this.yippee(hat, reason);
  }

  private speedMult(f: Fighter): number {
    let m = 1;
    for (const id of f.powerups.keys()) {
      const e = getPowerUp(id).effects;
      if (e.speedMult) m *= e.speedMult;
      if (e.forceDance) m *= 0.1;
    }
    if (f.weapon) {
      const w = getWeapon(f.weapon);
      if (w.selfSpeedBoost && w.class !== "ride") m *= w.selfSpeedBoost;
      if (w.class === "ride" && this.tickNo < f.rideUntil) m *= w.selfSpeedBoost ?? 1.8;
    }
    if (this.tickNo < f.slowUntil) m *= f.slowFactor;
    return m;
  }

  private hasEffect(f: Fighter, key: keyof ReturnType<typeof getPowerUp>["effects"]): boolean {
    for (const id of f.powerups.keys()) {
      const e = getPowerUp(id).effects as Record<string, unknown>;
      if (e[key]) return true;
    }
    return false;
  }

  private effectMult(f: Fighter, key: "knockbackDealtMult" | "knockbackReceivedMult"): number {
    let m = 1;
    for (const id of f.powerups.keys()) {
      const v = getPowerUp(id).effects[key];
      if (v) m *= v;
    }
    return m;
  }

  private tickTimers(): void {
    // Weapon drops
    if (this.settings.weaponDropRate > 0 && this.playTicks >= this.nextDropAt) {
      this.spawnDrop("weapon");
      const base = 14000 / this.settings.weaponDropRate;
      const chaosCut = 1 - 0.15 * this.settings.chaosLevel;
      this.nextDropAt = this.playTicks + ms(base * chaosCut * this.rng.range(0.7, 1.3));
    }
    // Power-ups
    if (this.settings.powerUpRate > 0 && this.playTicks >= this.nextPowerupAt) {
      this.spawnDrop("powerup");
      this.nextPowerupAt = this.playTicks + ms((22000 / this.settings.powerUpRate) * this.rng.range(0.7, 1.3));
    }
    // Hazards
    if (this.settings.hazardFrequency > 0 && this.playTicks >= this.nextHazardAt && this.tickNo >= this.hazardHoldUntil) {
      this.spawnHazard();
      const progress = Math.min(1, this.matchTimeSec() / this.settings.matchDurationTargetSec);
      const base = (18000 - 10000 * progress) / this.settings.hazardFrequency;
      const sd = this.phase === "suddenDeath" ? 0.5 : 1;
      this.nextHazardAt = this.playTicks + ms(base * sd * this.rng.range(0.75, 1.25));
    }
    // Random comedic yippee
    if (this.playTicks >= this.nextRandomYippeeAt) {
      this.maybeYippeeHat("random");
      for (const f of this.fighters.values()) {
        if (!f.eliminated && !f.hat && this.hasEffect(f, "yippeeOverdrive")) this.yippee(f, "overdrive");
      }
      this.nextRandomYippeeAt =
        this.playTicks + ms(SIM.YIPPEE_RANDOM_INTERVAL_MS / Math.max(0.25, this.settings.yippeeFrequency)) * this.rng.range(0.6, 1.6);
    }
    // Color commentary: periodically roast a random survivor. Funny league.
    if (this.playTicks >= this.nextRoastAt) {
      const alive = [...this.fighters.values()].filter((f) => !f.eliminated);
      if (alive.length > 2) {
        const roastee = alive[this.rng.int(0, alive.length - 1)]!;
        this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "colorRoast", roastee.name), mood: "roast" });
      }
      this.nextRoastAt = this.playTicks + ms(40000 * this.rng.range(0.8, 1.4));
    }

    // Quiet-arena commentary
    if (this.playTicks - this.lastHitEventTick > ms(60000) && !this.quietAnnounced) {
      this.quietAnnounced = true;
      this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "quiet"), mood: "quiet" });
    }
    // Slick decay
    this.slicks = this.slicks.filter((s) => s.until > this.tickNo);
  }

  private inSlick(x: number, z: number): boolean {
    for (const s of this.slicks) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) return true;
    }
    return false;
  }

  private tickFighters(): void {
    for (const f of this.fighters.values()) {
      if (f.eliminated) continue;
      const input = f.aiControlled
        ? this.ai.get(f.id)?.compute(this, f) ?? null
        : f.lastInput;

      const stunned = this.tickNo < f.stunUntil;
      const dodging = this.tickNo < f.dodgeUntil;
      const dancing = this.hasEffect(f, "forceDance");
      const slick = this.inSlick(f.x, f.z);

      let mx = 0, mz = 0;
      if (input && !stunned && !dancing) {
        mx = input.mx; mz = input.mz;
        const mag = Math.hypot(mx, mz);
        if (mag > 1) { mx /= mag; mz /= mag; }
        // Reverse-controls aura from nearby enemies
        for (const other of this.fighters.values()) {
          if (other.id === f.id || other.eliminated) continue;
          if (this.hasEffect(other, "reverseControls")) {
            const d = Math.hypot(f.x - other.x, f.z - other.z);
            if (d < 5) { mx = -mx; mz = -mz; break; }
          }
        }
        if (input.yaw !== undefined) f.yaw = input.yaw;
        else if (mag > 0.1) f.yaw = Math.atan2(mx, mz);
        if (!f.firstMoveDone && mag > 0.3) {
          f.firstMoveDone = true;
          if (f.hat) this.yippee(f, "firstMove");
        }
      }

      // Dodge start
      if (input?.dodge && !stunned && !dodging && this.tickNo >= f.dodgeCdUntil && f.grounded) {
        const mag = Math.hypot(mx, mz);
        f.dodgeDirX = mag > 0.1 ? mx : Math.sin(f.yaw);
        f.dodgeDirZ = mag > 0.1 ? mz : Math.cos(f.yaw);
        f.dodgeUntil = this.tickNo + ms(SIM.DODGE_DURATION_MS);
        f.dodgeCdUntil = this.tickNo + ms(SIM.DODGE_COOLDOWN_MS);
        f.iframesUntil = Math.max(f.iframesUntil, this.tickNo + ms(SIM.DODGE_IFRAMES_MS));
        f.anim = "dodge";
        f.animUntil = f.dodgeUntil;
      }

      // Jump
      if (input?.jump && f.grounded && !stunned && !dodging) {
        f.vy = SIM.JUMP_VELOCITY;
        f.grounded = false;
      }

      // Horizontal velocity
      const speed = SIM.RUN_SPEED * this.speedMult(f);
      const control = slick ? 0.22 : 1;
      const friction = (f.grounded ? (slick ? SIM.FRICTION * 0.12 : SIM.FRICTION) : SIM.AIR_FRICTION) * DT;
      if (this.tickNo < f.dodgeUntil) {
        f.vx = f.dodgeDirX * SIM.DODGE_SPEED;
        f.vz = f.dodgeDirZ * SIM.DODGE_SPEED;
      } else {
        const targetVx = mx * speed;
        const targetVz = mz * speed;
        const blend = Math.min(1, SIM.ACCEL * DT * control);
        f.vx += (targetVx - f.vx) * blend * (stunned ? 0 : 1);
        f.vz += (targetVz - f.vz) * blend * (stunned ? 0 : 1);
        f.vx *= Math.max(0, 1 - friction * (Math.hypot(mx, mz) < 0.05 || stunned ? 1.6 : 0.35));
        f.vz *= Math.max(0, 1 - friction * (Math.hypot(mx, mz) < 0.05 || stunned ? 1.6 : 0.35));
      }

      // Riding a cart: forced forward motion
      if (f.weapon === "tiny_shopping_cart" && this.tickNo < f.rideUntil && !stunned) {
        const w = getWeapon("tiny_shopping_cart");
        const s = SIM.RUN_SPEED * (w.selfSpeedBoost ?? 1.9);
        f.vx = Math.sin(f.yaw) * s;
        f.vz = Math.cos(f.yaw) * s;
        this.cartRam(f, w);
      }

      // Integrate + collide (per-axis, so we slide along walls)
      const nx = f.x + f.vx * DT;
      if (!collidesBlocking(this.layout, nx, f.z, f.y, SIM.PLAYER_RADIUS)) f.x = nx; else f.vx = 0;
      const nz = f.z + f.vz * DT;
      if (!collidesBlocking(this.layout, f.x, nz, f.y, SIM.PLAYER_RADIUS)) f.z = nz; else f.vz = 0;

      // Vertical
      const support = supportHeight(this.layout, f.x, f.z, f.y, SIM.PLAYER_RADIUS * 0.7);
      if (f.y > support + 0.001) {
        f.vy += SIM.GRAVITY * DT;
        f.y += f.vy * DT;
        f.grounded = false;
        if (f.y <= support) { f.y = support; f.vy = 0; f.grounded = true; }
      } else {
        f.y = support;
        if (f.vy > 0) { f.y += f.vy * DT; f.grounded = false; }
        else { f.vy = 0; f.grounded = true; }
      }

      // Depenetration: a launched fighter can land inside blocking geometry —
      // nudge them out toward the nearest free spot so nobody gets stuck.
      if (f.grounded && collidesBlocking(this.layout, f.x, f.z, f.y, SIM.PLAYER_RADIUS)) {
        outer: for (let r = 0.4; r <= 4; r += 0.4) {
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * Math.PI * 2;
            const cx = f.x + Math.sin(ang) * r;
            const cz = f.z + Math.cos(ang) * r;
            if (!collidesBlocking(this.layout, cx, cz, f.y, SIM.PLAYER_RADIUS)) {
              f.x = cx;
              f.z = cz;
              break outer;
            }
          }
        }
      }

      // Bounce pads
      if (f.grounded) {
        for (const b of this.layout.boxes) {
          if (b.kind !== "bouncePad") continue;
          if (Math.abs(f.x - b.x) < b.w / 2 && Math.abs(f.z - b.z) < b.d / 2 && Math.abs(f.y - ((b.y ?? 0) + b.h)) < 0.1) {
            f.vy = 10.5;
            f.grounded = false;
            this.emit({ e: "propHit", tick: this.tickNo, kind: "bouncePad", x: b.x, y: 0.3, z: b.z });
          }
        }
      }

      // Open trap doors swallow fighters standing on them
      for (const td of this.layout.trapDoors) {
        if (!this.openTrapDoors.has(td.id)) continue;
        const d = Math.hypot(f.x - td.x, f.z - td.z);
        if (d < td.radius && f.y < 0.3) {
          this.queueElim(f, "trapDoor", f.lastDamagedBy, "trap_door");
        }
      }

      // Out of arena
      const b = this.layout.bounds;
      if (f.x < b.minX - 1.5 || f.x > b.maxX + 1.5 || f.z < b.minZ - 1.5 || f.z > b.maxZ + 1.5) {
        this.queueElim(f, "outOfArena", this.recentAttacker(f), null);
      }

      // Combat inputs
      if (input && !stunned && !dodging && !dancing) this.tickCombat(f, input);
      f.prevAtk = input?.atk ?? false;
      f.prevHeavy = input?.heavyHold ?? false;

      // Emote
      if (input?.emote && f.anim === "idle") {
        f.anim = "emote";
        f.animUntil = this.tickNo + ms(1200);
      }

      // Pending hit resolution (wind-up complete)
      if (f.pendingHit && this.tickNo >= f.pendingHit.tick) {
        this.resolveMeleeHit(f, f.pendingHit);
        f.pendingHit = null;
      }

      // Powerup expiry
      for (const [pid, until] of f.powerups) {
        if (this.tickNo >= until) {
          f.powerups.delete(pid);
          this.emit({ e: "powerupExpired", tick: this.tickNo, playerId: f.id, powerupId: pid });
        }
      }
      // Regen
      for (const pid of f.powerups.keys()) {
        const r = getPowerUp(pid).effects.regenPerSec;
        if (r) f.hp = Math.min(f.maxHp, f.hp + r * DT);
      }
      // Out-of-combat recovery keeps the field contested — nobody cruises at
      // full health while someone else gets deleted in the opening minute.
      if (this.playTicks - f.lastCombatTick > ms(8000) && f.hp < f.maxHp * 0.85) {
        f.hp = Math.min(f.maxHp * 0.85, f.hp + 2.5 * DT);
      }

      // Stats: distance + hiding
      const sp = Math.hypot(f.vx, f.vz);
      f.stats.distanceTraveled += sp * DT;
      if (sp < 0.8 && this.playTicks - f.lastCombatTick > ms(8000)) f.stats.timeHidingMs += DT * 1000;

      // Anim resolution
      if (this.tickNo >= f.animUntil) {
        if (this.tickNo < f.stunUntil) f.anim = f.anim === "down" ? "down" : "hit";
        else if (!f.grounded) f.anim = "launched";
        else if (f.chargeStart !== null) f.anim = "charge";
        else f.anim = sp > 4.5 ? "run" : sp > 0.6 ? "walk" : "idle";
      }
    }
  }

  private recentAttacker(f: Fighter): string | null {
    return this.playTicks - f.lastDamagedTick < ms(5000) ? f.lastDamagedBy : null;
  }

  private tickCombat(f: Fighter, input: InputMessage): void {
    const weapon = f.weapon ? getWeapon(f.weapon) : null;

    // Heavy attack: hold to charge, release to unleash
    if (input.heavyHold && f.chargeStart === null && this.tickNo >= f.heavyCdUntil) {
      f.chargeStart = this.tickNo;
      f.anim = "charge";
      f.animUntil = this.tickNo + ms(SIM.HEAVY_CHARGE_MAX_MS);
    } else if (!input.heavyHold && f.chargeStart !== null) {
      const chargeMs = ((this.tickNo - f.chargeStart) / T) * 1000;
      const frac = Math.min(1, chargeMs / SIM.HEAVY_CHARGE_MAX_MS);
      f.chargeStart = null;
      f.heavyCdUntil = this.tickNo + ms(SIM.HEAVY_COOLDOWN_MS);
      f.anim = "heavy";
      f.animUntil = this.tickNo + ms(400);
      f.pendingHit = { tick: this.tickNo + ms(SIM.PUNCH_WINDUP_MS * 1.4), heavy: true, charge: frac, weapon: f.weapon };
      f.vx += Math.sin(f.yaw) * (5 + frac * 3);
      f.vz += Math.cos(f.yaw) * (5 + frac * 3);
      return;
    }
    if (f.chargeStart !== null) return; // charging blocks other attacks

    // Pickup / drop / throw-drop handling
    if (input.pickup) this.tryPickup(f);
    if (input.drop && f.weapon) this.dropWeapon(f, true);

    // Primary attack
    const atkPressed = (input.atk ?? false) && !f.prevAtk;
    const atkHeld = input.atk ?? false;

    // Melee attacks lunge forward so fights read as committed brawls,
    // not two figures pawing at the air.
    const lunge = (power: number): void => {
      f.vx += Math.sin(f.yaw) * power;
      f.vz += Math.cos(f.yaw) * power;
    };

    if (!weapon) {
      if (atkPressed && this.tickNo >= f.attackReadyAt) {
        f.attackReadyAt = this.tickNo + ms(SIM.PUNCH_INTERVAL_MS);
        f.anim = "attack";
        f.animUntil = this.tickNo + ms(300);
        f.pendingHit = { tick: this.tickNo + ms(SIM.PUNCH_WINDUP_MS), heavy: false, charge: 0, weapon: null };
        lunge(4.5);
      }
      return;
    }

    switch (weapon.class) {
      case "melee":
        if (atkPressed && this.tickNo >= f.attackReadyAt) {
          f.attackReadyAt = this.tickNo + ms(weapon.attackIntervalMs);
          f.anim = "attack";
          f.animUntil = this.tickNo + ms(Math.min(350, weapon.attackIntervalMs));
          f.pendingHit = { tick: this.tickNo + ms(SIM.PUNCH_WINDUP_MS), heavy: false, charge: 0, weapon: weapon.id };
          lunge(4);
        }
        break;
      case "projectile":
      case "spread":
        if (atkPressed && this.tickNo >= f.attackReadyAt) {
          f.attackReadyAt = this.tickNo + ms(weapon.attackIntervalMs);
          f.anim = "attack";
          f.animUntil = this.tickNo + ms(250);
          this.fireProjectiles(f, weapon, false);
          this.useDurability(f, weapon);
        }
        break;
      case "thrown":
        if (atkPressed && this.tickNo >= f.attackReadyAt) {
          f.attackReadyAt = this.tickNo + ms(weapon.attackIntervalMs);
          f.anim = "attack";
          f.animUntil = this.tickNo + ms(250);
          this.fireProjectiles(f, weapon, true);
          this.emit({ e: "throw", tick: this.tickNo, playerId: f.id, weapon: weapon.id });
          this.useDurability(f, weapon);
        }
        break;
      case "cone":
        if (atkHeld && this.tickNo >= f.attackReadyAt) {
          f.attackReadyAt = this.tickNo + ms(weapon.attackIntervalMs);
          f.anim = "attack";
          f.animUntil = this.tickNo + ms(weapon.attackIntervalMs + 60);
          this.coneBlast(f, weapon);
          this.useDurability(f, weapon);
        }
        break;
      case "ride":
        if (atkPressed && this.tickNo >= f.rideCdUntil) {
          f.rideUntil = this.tickNo + ms(1300);
          f.rideCdUntil = this.tickNo + ms(weapon.cooldownMs);
          f.anim = "attack";
          f.animUntil = f.rideUntil;
          this.useDurability(f, weapon);
        }
        break;
    }
    if (!f.stats.weaponsUsed.includes(weapon.id)) f.stats.weaponsUsed.push(weapon.id);
  }

  private useDurability(f: Fighter, w: WeaponDef): void {
    if (w.durability < 0) return;
    f.ammo -= 1;
    if (f.ammo <= 0) {
      f.weapon = null;
      f.ammo = 0;
      this.emit({ e: "propHit", tick: this.tickNo, kind: "weaponBreak", x: f.x, y: f.y + 1, z: f.z });
    }
  }

  private resolveMeleeHit(f: Fighter, hit: { heavy: boolean; charge: number; weapon: string | null }): void {
    const w = hit.weapon ? getWeapon(hit.weapon) : null;
    let damage: number, kb: number, range: number;
    if (hit.heavy) {
      damage = SIM.HEAVY_DAMAGE_MIN + (SIM.HEAVY_DAMAGE_MAX - SIM.HEAVY_DAMAGE_MIN) * hit.charge;
      kb = SIM.HEAVY_KNOCKBACK_MIN + (SIM.HEAVY_KNOCKBACK_MAX - SIM.HEAVY_KNOCKBACK_MIN) * hit.charge;
      range = SIM.PUNCH_RANGE * 1.2;
      if (w) { damage += w.damage * 0.5; kb += w.knockback * 0.4; range = Math.max(range, w.range); }
    } else if (w) {
      damage = w.damage; kb = w.knockback; range = w.range;
    } else {
      damage = SIM.PUNCH_DAMAGE; kb = SIM.PUNCH_KNOCKBACK; range = SIM.PUNCH_RANGE;
    }
    const arc = (SIM.PUNCH_ARC_DEG * Math.PI) / 180;
    let landed = false;
    for (const t of this.fighters.values()) {
      if (t.id === f.id || t.eliminated) continue;
      const dx = t.x - f.x, dz = t.z - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + SIM.PLAYER_RADIUS) continue;
      if (Math.abs(t.y - f.y) > 1.6) continue;
      const ang = Math.atan2(dx, dz);
      let da = ang - f.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > arc / 2 && dist > 1.0) continue;
      const nx = dist > 0.01 ? dx / dist : Math.sin(f.yaw);
      const nz = dist > 0.01 ? dz / dist : Math.cos(f.yaw);
      if (this.applyDamage(t, damage, kb, nx, nz, f, hit.weapon, hit.heavy)) landed = true;
    }
    // Melee durability only on landed swings for melee weapons
    if (landed && w && w.class === "melee") this.useDurability(f, w);
    if (landed && f.hat) {
      if ((w && w.damage >= 12) || hit.heavy) this.yippee(f, "strongHit");
    }
  }

  private cartRam(f: Fighter, w: WeaponDef): void {
    for (const t of this.fighters.values()) {
      if (t.id === f.id || t.eliminated) continue;
      const dx = t.x - f.x, dz = t.z - f.z;
      if (Math.hypot(dx, dz) < 1.2 && Math.abs(t.y - f.y) < 1.5) {
        const d = Math.hypot(dx, dz) || 1;
        this.applyDamage(t, w.damage, w.knockback, dx / d, dz / d, f, w.id, false);
      }
    }
  }

  private coneBlast(f: Fighter, w: WeaponDef): void {
    const arc = (70 * Math.PI) / 180;
    for (const t of this.fighters.values()) {
      if (t.id === f.id || t.eliminated) continue;
      const dx = t.x - f.x, dz = t.z - f.z;
      const dist = Math.hypot(dx, dz);
      if (dist > w.range) continue;
      const ang = Math.atan2(dx, dz);
      let da = ang - f.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > arc / 2) continue;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      const push = (w.pushForce ?? 0) * (1 - (dist / w.range) * 0.5);
      this.applyDamage(t, w.damage, Math.max(w.knockback * 0.4, push), nx, nz, f, w.id, false);
    }
  }

  private fireProjectiles(f: Fighter, w: WeaponDef, isThrow: boolean): void {
    const count = w.class === "spread" ? (w.spreadCount ?? 3) : 1;
    const spreadRad = ((w.spreadAngleDeg ?? 0) * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i / (count - 1) - 0.5) * spreadRad : 0;
      const yaw = f.yaw + off + (isThrow ? this.rng.range(-0.03, 0.03) : 0);
      const speed = w.projectileSpeed ?? 14;
      this.projectiles.push({
        id: this.nextEntityId++,
        kind: w.id,
        owner: f.id,
        x: f.x + Math.sin(yaw) * 0.8,
        y: f.y + 1.1,
        z: f.z + Math.cos(yaw) * 0.8,
        vx: Math.sin(yaw) * speed,
        vz: Math.cos(yaw) * speed,
        yaw,
        ttl: ms((w.range / speed) * 1000),
        fuse: w.fuseMs ? ms(w.fuseMs) : null,
        radius: w.projectileRadius ?? 0.4,
        homing: w.homing ?? 0,
        trailCd: 0,
      });
    }
  }

  private tickProjectiles(): void {
    const survivors: Projectile[] = [];
    for (const p of this.projectiles) {
      p.ttl--;
      if (p.fuse !== null) p.fuse--;
      const w = getWeapon(p.kind);

      // Fuse bombs come to rest when their flight range ends and wait to blow.
      if (p.ttl <= 0 && p.fuse !== null) {
        p.vx = 0;
        p.vz = 0;
        p.y = Math.max(supportHeight(this.layout, p.x, p.z, p.y, 0.3) + 0.3, 0.3);
      }

      // Homing steers toward nearest enemy
      if (p.homing > 0) {
        let best: Fighter | null = null;
        let bestD = 12;
        for (const t of this.fighters.values()) {
          if (t.id === p.owner || t.eliminated || this.hasEffect(t, "invisible")) continue;
          const d = Math.hypot(t.x - p.x, t.z - p.z);
          if (d < bestD) { bestD = d; best = t; }
        }
        if (best) {
          const speed = Math.hypot(p.vx, p.vz);
          const desired = Math.atan2(best.x - p.x, best.z - p.z);
          let cur = Math.atan2(p.vx, p.vz);
          let da = desired - cur;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          cur += da * p.homing * 6 * DT;
          p.vx = Math.sin(cur) * speed;
          p.vz = Math.cos(cur) * speed;
          p.yaw = cur;
        }
      }

      p.x += p.vx * DT;
      p.z += p.vz * DT;

      // Mustard / grease trails
      if (w.trail) {
        p.trailCd--;
        if (p.trailCd <= 0) {
          p.trailCd = ms(120);
          this.slicks.push({ x: p.x, z: p.z, r: 1.1, until: this.tickNo + ms(6000) });
        }
      }

      let dead = p.ttl <= 0 && p.fuse === null;
      let exploded = false;

      // AoE projectiles without a fuse (glitter grenade) burst at range end.
      if (dead && (w.aoeRadius ?? 0) > 0) exploded = true;

      // Fuse bombs explode on timer even mid-flight or on ground
      if (p.fuse !== null && p.fuse <= 0) { exploded = true; dead = true; }

      // Wall hit: fuse bombs bounce to a stop and keep ticking; others break.
      if (!dead && collidesBlocking(this.layout, p.x, p.z, p.y - 0.9, p.radius)) {
        if (p.fuse !== null) {
          p.x -= p.vx * DT * 1.5;
          p.z -= p.vz * DT * 1.5;
          p.vx = 0;
          p.vz = 0;
        } else {
          dead = true;
          exploded = (w.aoeRadius ?? 0) > 0;
        }
      }

      // Player hit
      if (!dead) {
        for (const t of this.fighters.values()) {
          if (t.id === p.owner || t.eliminated) continue;
          const d = Math.hypot(t.x - p.x, t.z - p.z);
          if (d < p.radius + SIM.PLAYER_RADIUS && Math.abs(t.y + 1 - p.y) < 1.6) {
            if (w.fuseMs) { exploded = true; dead = true; break; } // cake detonates on contact too
            const nx = (t.x - p.x) / (d || 1), nz = (t.z - p.z) / (d || 1);
            const owner = this.fighters.get(p.owner);
            const kb = w.knockback; // may be negative (plunger pull)
            const dirX = kb >= 0 ? nx : owner ? (owner.x - t.x) / (Math.hypot(owner.x - t.x, owner.z - t.z) || 1) : -nx;
            const dirZ = kb >= 0 ? nz : owner ? (owner.z - t.z) / (Math.hypot(owner.x - t.x, owner.z - t.z) || 1) : -nz;
            if (owner) this.applyDamage(t, w.damage, Math.abs(kb), dirX, dirZ, owner, w.id, false);
            if (w.slowFactor) { t.slowUntil = this.tickNo + ms(3000); t.slowFactor = w.slowFactor; }
            dead = true;
            exploded = (w.aoeRadius ?? 0) > 0;
            break;
          }
        }
      }

      if (exploded && (w.aoeRadius ?? 0) > 0) this.explode(p, w);
      if (!dead) survivors.push(p);
    }
    this.projectiles = survivors;
  }

  private explode(p: Projectile, w: WeaponDef): void {
    const owner = this.fighters.get(p.owner);
    this.emit({ e: "propHit", tick: this.tickNo, kind: `explosion:${w.id}`, x: p.x, y: p.y, z: p.z });
    for (const t of this.fighters.values()) {
      if (t.eliminated) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > (w.aoeRadius ?? 0)) continue;
      const nx = (t.x - p.x) / (d || 1), nz = (t.z - p.z) / (d || 1);
      const fall = 1 - (d / (w.aoeRadius ?? 1)) * 0.6;
      if (owner && t.id !== p.owner) this.applyDamage(t, w.damage * fall, w.knockback * fall, nx, nz, owner, w.id, false);
      if (w.blind) t.blindUntil = this.tickNo + ms(2500);
    }
  }

  /** Returns true if the hit connected (not dodged/shielded-away). */
  private applyDamage(
    t: Fighter, damage: number, kb: number, dirX: number, dirZ: number,
    attacker: Fighter, weaponId: string | null, heavy: boolean,
  ): boolean {
    if (t.eliminated || this.tickNo < t.iframesUntil) return false;
    const shielded = this.hasEffect(t, "shield");
    const dmg = shielded ? 0 : damage;
    let impulse = kb * this.settings.knockbackScale * this.effectMult(attacker, "knockbackDealtMult") * this.effectMult(t, "knockbackReceivedMult");
    if (shielded) impulse *= 0.25;
    if (t.hat && this.settings.makeLastPlaceSuffer) impulse *= 1.12;

    t.hp = Math.max(0, t.hp - dmg);
    t.stats.damageReceived += dmg;
    attacker.stats.damageDealt += dmg;
    t.lastDamagedBy = attacker.id;
    t.lastDamagedTick = this.playTicks;
    t.lastCombatTick = this.playTicks;
    attacker.lastCombatTick = this.playTicks;
    this.lastHitEventTick = this.playTicks;
    this.quietAnnounced = false;

    t.vx += dirX * impulse;
    t.vz += dirZ * impulse;
    if (impulse > 6) { t.vy = Math.max(t.vy, impulse * SIM.LAUNCH_UP_RATIO * 0.55); t.grounded = false; }

    const stunMs = Math.min(SIM.MAX_STUN_MS, impulse * SIM.STUN_MS_PER_KNOCKBACK);
    t.stunUntil = Math.max(t.stunUntil, this.tickNo + ms(stunMs));
    t.chargeStart = null;
    t.pendingHit = null;

    if (impulse > SIM.KNOCKDOWN_THRESHOLD) {
      t.anim = "down";
      t.animUntil = t.stunUntil;
      t.iframesUntil = t.stunUntil + ms(SIM.WAKEUP_IFRAMES_MS);
      attacker.stats.knockdownsDealt++;
      this.emit({ e: "knockdown", tick: this.tickNo, target: t.id, by: attacker.id });
      if (t.hat) this.yippee(t, "knockedDown");
    } else if (dmg > 0) {
      t.anim = "hit";
      t.animUntil = this.tickNo + ms(250);
    }

    this.emit({
      e: "hit", tick: this.tickNo, attacker: attacker.id, target: t.id,
      weapon: weaponId, damage: Math.round(dmg * 10) / 10, x: t.x, y: t.y + 1.1, z: t.z, heavy,
    });

    if (t.hat && dmg >= 15) this.yippee(t, "bigDamage");
    if (attacker.hat && dmg >= 12) this.yippee(attacker, "strongHit");

    if (t.hp <= 0) this.queueElim(t, "damage", attacker.id, weaponId);
    return true;
  }

  // ---------------- pickups & drops ----------------

  private spawnDrop(itemType: "weapon" | "powerup"): void {
    // Prefer drop points inside the current safe zone
    const pts = this.layout.weaponDropPoints.filter(
      (p) => Math.hypot(p.x, p.z) < this.zoneRadius - 2,
    );
    const pt = pts.length > 0 ? this.rng.pick(pts) : { x: 0, z: 0 };
    const jx = this.rng.range(-2, 2), jz = this.rng.range(-2, 2);

    let itemId: string, rarity: string;
    if (itemType === "weapon") {
      const progress = Math.min(1, this.matchTimeSec() / this.settings.matchDurationTargetSec);
      const boost = this.settings.weaponRarityBoost + progress * 0.5;
      const weights: Record<string, number> = { ...RARITY_WEIGHTS };
      weights.rare = (weights.rare ?? 0) * (1 + boost);
      weights.legendary = (weights.legendary ?? 0) * (1 + boost * 2);
      weights.questionable = (weights.questionable ?? 0) * (1 + boost);
      rarity = this.rng.weighted(weights);
      const pool = WEAPONS.filter((w) => w.rarity === rarity);
      itemId = (pool.length ? this.rng.pick(pool) : this.rng.pick(WEAPONS)).id;
    } else {
      const pu = this.rng.pick(POWERUPS);
      itemId = pu.id;
      rarity = pu.rarity;
    }

    const via = this.rng.pick(["crate", "snackCart", "drone", "mascotThrow", "commissionerLaunch"]);
    const pk: Pickup = {
      id: this.nextEntityId++,
      itemId, itemType, rarity,
      x: pt.x + jx, y: SIM.DROP_START_HEIGHT, z: pt.z + jz,
      state: "incoming",
    };
    this.pickups.push(pk);
    this.emit({ e: "drop", tick: this.tickNo, pickupId: pk.id, itemId, rarity, via, x: pk.x, z: pk.z });
  }

  private tickPickups(): void {
    for (const pk of this.pickups) {
      if (pk.state === "incoming") {
        pk.y -= SIM.DROP_FALL_SPEED * DT;
        const ground = supportHeight(this.layout, pk.x, pk.z, 3, 0.3) + 0.3;
        if (pk.y <= ground) {
          pk.y = ground;
          pk.state = "landed";
          this.emit({ e: "propHit", tick: this.tickNo, kind: "dropLand", x: pk.x, y: pk.y, z: pk.z });
        }
      }
    }
  }

  private tryPickup(f: Fighter): void {
    let best: Pickup | null = null;
    let bestD: number = SIM.PICKUP_RADIUS;
    for (const pk of this.pickups) {
      if (pk.state !== "landed") continue;
      const d = Math.hypot(f.x - pk.x, f.z - pk.z);
      if (d < bestD && Math.abs(f.y - pk.y) < 1.6) { bestD = d; best = pk; }
    }
    if (!best) return;
    this.pickups = this.pickups.filter((p) => p.id !== best.id);

    if (best.itemType === "weapon") {
      if (f.weapon) this.dropWeapon(f, false);
      const w = getWeapon(best.itemId);
      f.weapon = w.id;
      f.ammo = w.durability < 0 ? 9999 : w.durability;
      f.stats.weaponsPickedUp++;
      f.anim = "pickup";
      f.animUntil = this.tickNo + ms(350);
      if (w.rarity === "legendary") {
        f.stats.legendaryPickups++;
        this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "legendary", f.name, undefined, w.name), mood: "legendary" });
        if (f.hat) this.yippee(f, "legendaryWeapon");
      }
      if (!this.firstPickupDone) {
        this.firstPickupDone = true;
        this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "firstPickup", f.name), mood: "info" });
      }
      if (f.hat) this.yippee(f, "weaponPickup");
    } else {
      const pu = getPowerUp(best.itemId);
      f.powerups.set(pu.id, this.tickNo + ms(pu.durationMs));
    }
    this.emit({ e: "pickupTaken", tick: this.tickNo, playerId: f.id, itemId: best.itemId, itemType: best.itemType, rarity: best.rarity });
  }

  private dropWeapon(f: Fighter, deliberate: boolean): void {
    if (!f.weapon) return;
    const w = getWeapon(f.weapon);
    if (f.ammo > 0) {
      this.pickups.push({
        id: this.nextEntityId++,
        itemId: w.id, itemType: "weapon", rarity: w.rarity,
        x: f.x + this.rng.range(-1, 1), y: f.y + 0.3, z: f.z + this.rng.range(-1, 1),
        state: "landed",
      });
    }
    f.weapon = null;
    f.ammo = 0;
    if (deliberate) { f.anim = "pickup"; f.animUntil = this.tickNo + ms(250); }
  }

  // ---------------- hazards ----------------

  private spawnHazard(): void {
    const pool = HAZARDS.filter((h) => h.minChaos <= this.settings.chaosLevel);
    if (pool.length === 0) return;
    const h = this.rng.pick(pool);
    let x: number, z: number;
    let trapDoorId: number | null = null;
    if (h.id === "trap_door") {
      const td = this.rng.pick(this.layout.trapDoors);
      x = td.x; z = td.z; trapDoorId = td.id;
    } else {
      const zoneKeys = h.zones.filter((zn) => this.layout.zoneNames[zn]);
      const zone = this.layout.zoneNames[this.rng.pick(zoneKeys.length ? zoneKeys : ["center"])] ?? { x: 0, z: 0 };
      x = zone.x + this.rng.range(-5, 5);
      z = zone.z + this.rng.range(-5, 5);
    }
    const hz: ActiveHazard = {
      id: this.nextEntityId++,
      kind: h.id, x, z, radius: h.radius,
      state: "telegraph",
      stateEndsAt: this.tickNo + ms(h.telegraphMs),
      damageCd: 0,
      trapDoorId,
    };
    this.hazards.push(hz);
    this.emit({ e: "hazardTelegraph", tick: this.tickNo, kind: h.id, x, z, radius: h.radius });
  }

  private tickHazards(): void {
    const survivors: ActiveHazard[] = [];
    for (const hz of this.hazards) {
      const def = HAZARDS.find((h) => h.id === hz.kind);
      if (!def) continue;
      if (hz.state === "telegraph") {
        if (this.tickNo >= hz.stateEndsAt) {
          hz.state = "active";
          hz.stateEndsAt = this.tickNo + ms(def.activeMs);
          this.emit({ e: "hazardActive", tick: this.tickNo, kind: hz.kind, x: hz.x, z: hz.z, radius: hz.radius });
          if (hz.trapDoorId !== null) this.openTrapDoors.add(hz.trapDoorId);
          if (hz.kind === "soda_slip") this.slicks.push({ x: hz.x, z: hz.z, r: hz.radius, until: this.tickNo + ms(def.activeMs) });
        }
        survivors.push(hz);
        continue;
      }
      // active
      if (this.tickNo >= hz.stateEndsAt) {
        if (hz.trapDoorId !== null) this.openTrapDoors.delete(hz.trapDoorId);
        continue; // done
      }
      hz.damageCd--;
      if (def.damage > 0 && hz.damageCd <= 0) {
        hz.damageCd = ms(350);
        for (const t of this.fighters.values()) {
          if (t.eliminated) continue;
          const d = Math.hypot(t.x - hz.x, t.z - hz.z);
          if (d > hz.radius) continue;
          const nx = (t.x - hz.x) / (d || 1), nz = (t.z - hz.z) / (d || 1);
          this.hazardDamage(t, def.damage, def.knockback, nx, nz, hz.kind);
        }
      }
      survivors.push(hz);
    }
    this.hazards = survivors;
  }

  private hazardDamage(t: Fighter, damage: number, kb: number, nx: number, nz: number, kind: string): void {
    if (this.tickNo < t.iframesUntil || this.hasEffect(t, "shield")) return;
    t.hp = Math.max(0, t.hp - damage);
    t.stats.damageReceived += damage;
    t.lastCombatTick = this.playTicks;
    const impulse = kb * this.settings.knockbackScale;
    t.vx += nx * impulse;
    t.vz += nz * impulse;
    if (impulse > 6) { t.vy = Math.max(t.vy, impulse * SIM.LAUNCH_UP_RATIO * 0.5); t.grounded = false; }
    t.stunUntil = Math.max(t.stunUntil, this.tickNo + ms(Math.min(SIM.MAX_STUN_MS, impulse * SIM.STUN_MS_PER_KNOCKBACK)));
    t.iframesUntil = this.tickNo + ms(400); // hazards re-hit at most ~2.5/sec per player
    this.emit({ e: "hit", tick: this.tickNo, attacker: "", target: t.id, weapon: kind, damage, x: t.x, y: t.y + 1, z: t.z, heavy: false });
    if (t.hp <= 0) this.queueElim(t, "hazard", this.recentAttacker(t), kind);
  }

  // ---------------- zone ----------------

  private tickZone(): void {
    const dur = this.settings.matchDurationTargetSec;
    const tSec = this.matchTimeSec();
    const nextIdx = this.zoneStageIdx + 1;
    const next = ZONE_STAGES[nextIdx];
    if (next && tSec >= (next.atFrac * dur) / this.settings.zoneShrinkSpeed) {
      this.zoneStageIdx = nextIdx;
      this.zoneTarget = this.layout.initialZoneRadius * next.radiusFrac;
      this.zoneShrinkPerTick = (this.zoneRadius - this.zoneTarget) / ms(next.shrinkSec * 1000);
      this.emit({ e: "zoneStage", tick: this.tickNo, stage: nextIdx + 1, radius: this.zoneTarget });
      this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "zoneShrink"), mood: "warning" });
    }
    if (this.zoneRadius > this.zoneTarget) {
      this.zoneRadius = Math.max(this.zoneTarget, this.zoneRadius - this.zoneShrinkPerTick);
    }

    const dps = SIM.ZONE_DAMAGE_PER_SEC_BASE * (1 + this.zoneStageIdx) * (this.phase === "suddenDeath" ? 2 : 1);
    for (const f of this.fighters.values()) {
      if (f.eliminated) continue;
      const outside = Math.hypot(f.x, f.z) > this.zoneRadius;
      if (!outside) { f.outsideZoneSince = null; continue; }
      if (this.hasEffect(f, "zoneImmunity")) continue;
      if (f.outsideZoneSince === null) f.outsideZoneSince = this.playTicks;
      if (this.playTicks - f.outsideZoneSince < ms(SIM.ZONE_GRACE_SEC * 1000)) continue;
      f.hp = Math.max(0, f.hp - dps * DT);
      f.stats.damageReceived += dps * DT;
      if (f.hp <= 0) this.queueElim(f, "autoDraftZone", this.recentAttacker(f), null);
    }

    // Sudden death trigger
    if (!this.suddenDeathStarted && tSec >= this.settings.suddenDeathAtSec) {
      this.suddenDeathStarted = true;
      this.suddenDeathAtTick = this.playTicks;
      this.phase = "suddenDeath";
      this.zoneTarget = 4;
      this.zoneShrinkPerTick = Math.max(this.zoneShrinkPerTick, (this.zoneRadius - 4) / ms(15000));
      this.emit({ e: "phase", tick: this.tickNo, phase: this.phase });
      this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "suddenDeath"), mood: "suddenDeath" });
      this.maybeYippeeHat("suddenDeath");
    }

    // Guaranteed termination: 45 s into sudden death the zone collapses to
    // nothing, so the match can never stall with passive survivors. The
    // last-survivor guard in commitEliminations still yields exactly one winner.
    if (this.suddenDeathStarted && this.playTicks - this.suddenDeathAtTick > ms(45000) && this.zoneTarget > 0) {
      this.zoneTarget = 0;
      this.zoneShrinkPerTick = Math.max(this.zoneShrinkPerTick, this.zoneRadius / ms(10000));
    }
  }

  // ---------------- eliminations & results ----------------

  private queueElim(f: Fighter, cause: EliminationCause, by: string | null, weapon: string | null): void {
    if (f.eliminated) return;
    if (this.elimQueue.some((q) => q.f.id === f.id)) return;
    this.elimQueue.push({ f, cause, by, weapon });
  }

  private commitEliminations(): void {
    if (this.elimQueue.length === 0) return;
    // Deterministic same-tick ordering (documented in shared/draft.ts):
    // more damage received goes out first, then lower slot index.
    this.elimQueue.sort((a, b) => {
      if (a.f.stats.damageReceived !== b.f.stats.damageReceived) return b.f.stats.damageReceived - a.f.stats.damageReceived;
      return a.f.slotIndex - b.f.slotIndex;
    });

    for (const q of this.elimQueue) {
      // Never eliminate the last survivor via the same-tick queue: if everyone
      // else queued died this tick and only one remains, remaining entries win.
      if (this.aliveCount() <= 1) break;
      const f = q.f;
      f.eliminated = true;
      f.hp = 0;
      f.anim = "ko";
      f.stats.survivalMs = Math.round(this.matchTimeSec() * 1000);
      const rec: EliminationRecord = {
        playerId: f.id,
        playerName: f.name,
        tick: this.tickNo,
        timestamp: Date.now(),
        cause: q.cause,
        byPlayerId: q.by,
        withWeapon: q.weapon,
        damageReceived: Math.round(f.stats.damageReceived * 10) / 10,
        slotIndex: f.slotIndex,
        placement: 0, // assigned at match end
      };
      this.eliminations.push(rec);
      this.emit({ e: "elimination", tick: this.tickNo, record: rec });

      const by = q.by ? this.fighters.get(q.by) : null;
      if (by) {
        by.stats.eliminations++;
        if (q.cause !== "damage") by.stats.environmentalEliminations++;
        if (by.hat) this.yippee(by, "elimination");
      }
      if (f.hat) this.yippee(f, "eliminated", true);

      const line = !this.firstElimDone
        ? announcerLine(this.rng, "firstBlood", by?.name, f.name)
        : q.cause === "damage" && by
          ? announcerLine(this.rng, "elimination", by.name, f.name)
          : announcerLine(this.rng, "environmentalElim", by?.name, f.name);
      this.firstElimDone = true;
      this.emit({ e: "announce", tick: this.tickNo, line, mood: "elimination" });
    }
    this.elimQueue = [];
  }

  private checkPhaseTransitions(): void {
    const alive = [...this.fighters.values()].filter((f) => !f.eliminated);

    if ((alive.length === 5 || alive.length === 3) && !this.announcedCounts.has(alive.length)) {
      this.announcedCounts.add(alive.length);
      this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, alive.length === 5 ? "finalFive" : "finalThree"), mood: "tension" });
    }

    if (alive.length === 2 && !this.finalTwoDone) {
      this.finalTwoDone = true;
      this.phase = "finalTwo";
      this.phaseUntil = this.tickNo + ms(3200);
      this.hazardHoldUntil = this.tickNo + ms(8000);
      this.zoneTarget = Math.min(this.zoneTarget, 9);
      this.zoneShrinkPerTick = Math.max(this.zoneShrinkPerTick, (this.zoneRadius - this.zoneTarget) / ms(20000));
      const [a, b] = alive;
      this.emit({ e: "phase", tick: this.tickNo, phase: this.phase });
      this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "finalTwo", a?.name, b?.name), mood: "finalTwo" });
      return;
    }

    if (alive.length === 1 && this.phase !== "victory") {
      const winner = alive[0]!;
      this.phase = "victory";
      winner.anim = "victory";
      winner.stats.survivalMs = Math.round(this.matchTimeSec() * 1000);
      this.emit({ e: "phase", tick: this.tickNo, phase: this.phase });
      this.emit({ e: "victory", tick: this.tickNo, playerId: winner.id, playerName: winner.name });
      this.emit({ e: "announce", tick: this.tickNo, line: announcerLine(this.rng, "victory", winner.name), mood: "victory" });
      if (winner.hat) this.yippee(winner, "winning", true);
      this.finalizeResults(winner);
    }
  }

  private finalizeResults(winner: Fighter): void {
    const placed = assignPlacements(this.eliminations);
    const draftOrder = computeDraftOrder(placed, this.init.participants);
    const stats = [...this.fighters.values()].map((f) => ({
      ...f.stats,
      weaponsUsed: [...f.stats.weaponsUsed],
      damageDealt: Math.round(f.stats.damageDealt * 10) / 10,
      damageReceived: Math.round(f.stats.damageReceived * 10) / 10,
      distanceTraveled: Math.round(f.stats.distanceTraveled),
      timeHidingMs: Math.round(f.stats.timeHidingMs),
    }));
    const awards = computeAwards({
      stats,
      eliminations: placed,
      participants: this.init.participants,
      rainbowHatPlayerId: this.init.hatPlayerId,
      winnerId: winner.id,
    });
    this.results = {
      matchId: this.matchId,
      leagueName: this.init.leagueName,
      arenaId: this.layout.id,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      draftOrder,
      eliminations: placed,
      stats,
      awards,
      rainbowHatPlayerId: this.init.hatPlayerId,
      settings: this.settings,
    };
    this.init.onEnd(this.results);
  }

  // ---------------- snapshots ----------------

  buildSnapshot(): Snapshot {
    const fighters: FighterSnap[] = [...this.fighters.values()].map((f) => ({
      id: f.id,
      x: Math.round(f.x * 100) / 100,
      y: Math.round(f.y * 100) / 100,
      z: Math.round(f.z * 100) / 100,
      yaw: Math.round(f.yaw * 100) / 100,
      anim: f.anim,
      hp: Math.round(f.hp * 10) / 10,
      weapon: f.weapon,
      ammo: f.ammo,
      charge: f.chargeStart !== null ? Math.min(1, ((this.tickNo - f.chargeStart) / T) * (1000 / SIM.HEAVY_CHARGE_MAX_MS)) : 0,
      powerups: [...f.powerups.keys()],
      eliminated: f.eliminated,
      hat: f.hat,
      stunned: this.tickNo < f.stunUntil,
    }));

    const nextStage = ZONE_STAGES[this.zoneStageIdx + 1];
    const nextShrinkInSec = nextStage
      ? Math.max(0, (nextStage.atFrac * this.settings.matchDurationTargetSec) / this.settings.zoneShrinkSpeed - this.matchTimeSec())
      : -1;

    return {
      tick: this.tickNo,
      serverTime: Date.now(),
      phase: this.phase,
      matchTimeSec: Math.round(this.matchTimeSec() * 10) / 10,
      fighters,
      projectiles: this.projectiles.map((p) => ({
        id: p.id, kind: p.kind,
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100,
        yaw: Math.round(p.yaw * 100) / 100,
      })),
      pickups: this.pickups.map((pk) => ({
        id: pk.id, itemId: pk.itemId, itemType: pk.itemType,
        x: Math.round(pk.x * 100) / 100, y: Math.round(pk.y * 100) / 100, z: Math.round(pk.z * 100) / 100,
        state: pk.state, rarity: pk.rarity,
      })),
      hazards: this.hazards.map((hz) => ({
        id: hz.id, kind: hz.kind, x: hz.x, z: hz.z, radius: hz.radius,
        state: hz.state,
        t: Math.max(0, (hz.stateEndsAt - this.tickNo) / T),
      })),
      zone: {
        cx: 0, cz: 0,
        radius: Math.round(this.zoneRadius * 100) / 100,
        targetRadius: Math.round(this.zoneTarget * 100) / 100,
        stage: this.zoneStageIdx + 1,
        nextShrinkInSec: Math.round(nextShrinkInSec),
      },
      aliveCount: this.aliveCount(),
    };
  }

  /**
   * Read-only world view for AI controllers. AI receives nothing a human
   * player couldn't see on screen — invisible players are excluded from
   * targeting via the `hidden` set.
   */
  aiWorld(): {
    tick: number;
    zoneRadius: number;
    layout: ArenaLayout;
    fighters: Map<string, Fighter>;
    pickups: Array<{ id: number; itemId: string; itemType: "weapon" | "powerup"; x: number; y: number; z: number; rarity: string }>;
    hazards: Array<{ kind: string; x: number; z: number; radius: number; state: string }>;
    hidden: Set<string>;
  } {
    const hidden = new Set<string>();
    for (const f of this.fighters.values()) if (this.hasEffect(f, "invisible")) hidden.add(f.id);
    return {
      tick: this.tickNo,
      zoneRadius: this.zoneRadius,
      layout: this.layout,
      fighters: this.fighters,
      pickups: this.pickups.filter((p) => p.state === "landed"),
      hazards: this.hazards,
      hidden,
    };
  }

  /** Per-player ack map for client reconciliation. */
  inputAcks(): Record<string, number> {
    const acks: Record<string, number> = {};
    for (const f of this.fighters.values()) acks[f.id] = f.lastInputSeq;
    return acks;
  }
}
