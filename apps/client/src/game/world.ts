import { FreeCamera, Mesh, Vector3 } from "@babylonjs/core";
import {
  DISASTER_DOME,
  SIM,
  collidesBlocking,
  getWeapon,
  supportHeight,
  type FighterSnap,
  type GameEvent,
  type MatchPhase,
  type ParticipantSlot,
  type Snapshot,
} from "@ddd/shared";
import { audio } from "../audio/audio";
import { connection } from "../net/connection";
import { settings, vibrate } from "../ui/settings";
import { buildArena, type ArenaHandles } from "./arena";
import { FIGHTER_KITS, createCharacter, type CharacterRig, type FighterKit as FIGHTER_KIT_T } from "./character";
import { createGameScene, type GameScene } from "./engine";
import { EffectsManager, shakeAmount } from "./effects";
import { buildHazardVisual, buildPickupVisual, buildProjectileMesh, buildWeaponMesh } from "./items";
import { qualityParams } from "./quality";

export interface InputState {
  mx: number;
  mz: number;
  atk: boolean;
  heavy: boolean;
  dodge: boolean;
  jump: boolean;
  pickup: boolean;
  emote: boolean;
}

export interface BoardRow {
  id: string;
  name: string;
  hp: number;
  eliminated: boolean;
  /** Locked draft pick for eliminated players; null while still alive. */
  pick: number | null;
  elims: number;
  hat: boolean;
  isMe: boolean;
}

export interface HudState {
  hp: number;
  maxHp: number;
  weapon: string | null;
  weaponName: string | null;
  ammo: number;
  charge: number;
  aliveCount: number;
  matchTimeSec: number;
  phase: MatchPhase;
  zoneShrinkIn: number;
  outsideZone: boolean;
  eliminated: boolean;
  myPlacementPick: number | null;
  nearPickup: boolean;
  powerups: string[];
  blind: boolean;
  fps: number;
  /** Live standings: alive fighters by HP, then eliminated with locked picks. */
  board: BoardRow[];
}

export type UiNotice =
  | { kind: "caption"; text: string; mood: string }
  | { kind: "feed"; text: string }
  | { kind: "yippee"; playerName: string; variant: string }
  | { kind: "phase"; phase: MatchPhase }
  | { kind: "finalTwo"; names: [string, string] }
  | { kind: "victory"; playerName: string }
  | { kind: "focusOut"; pick: number }
  | { kind: "focusWin" }
  | { kind: "splat"; big: boolean }
  | { kind: "koWord"; word: string };

export type SpectatorCam = "director" | "follow" | "overhead" | "arena" | "free";

interface FighterEntity {
  rig: CharacterRig;
  slot: ParticipantSlot;
  lastAnim: string;
  lastWeapon: string | null;
  prev: FighterSnap | null;
  next: FighterSnap | null;
  koLaunched: boolean;
}

/**
 * Binds the authoritative network state to the Babylon scene: snapshot
 * interpolation for remote fighters, soft-corrected prediction for the local
 * fighter, event-driven VFX/SFX, camera rigs, and the 30 Hz input pump.
 */
export class GameWorld {
  readonly gs: GameScene;
  private arena: ArenaHandles;
  private effects: EffectsManager;
  private fighters = new Map<string, FighterEntity>();
  private projectiles = new Map<number, { mesh: Mesh; prev: { x: number; y: number; z: number }; next: { x: number; y: number; z: number }; kind: string }>();
  private pickups = new Map<number, ReturnType<typeof buildPickupVisual>>();
  private hazards = new Map<number, ReturnType<typeof buildHazardVisual>>();
  private camera: FreeCamera;
  private camTarget = new Vector3(0, 0, 0);
  private camShake = 0;
  private snapA: Snapshot | null = null;
  private snapB: Snapshot | null = null;
  private snapBTime = 0;
  private latestSnap: Snapshot | null = null;
  private zoneRadiusVisual = 31;
  private input: InputState = { mx: 0, mz: 0, atk: false, heavy: false, dodge: false, jump: false, pickup: false, emote: false };
  private inputTimer: number | null = null;
  private myPos: Vector3 | null = null;
  private myYaw = 0;
  private t = 0;
  private hudListeners = new Set<(h: HudState) => void>();
  private noticeListeners = new Set<(n: UiNotice) => void>();
  private hudTimer: number | null = null;
  private blindUntil = 0;
  private specCam: SpectatorCam = "director";
  private specFollowId: string | null = null;
  /** The viewer's own league identity when spectating a shared match. */
  private focusId: string | null = null;
  private directorTarget: string | null = null;
  private directorSwitchAt = 0;
  private directorCut = false;
  private killCamPos: Vector3 | null = null;
  private killCamUntil = 0;
  private myPlacementPick: number | null = null;
  private elimOrder: string[] = [];
  private elimsBy = new Map<string, number>();
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private participants: ParticipantSlot[],
    private myId: string | null, // null → spectator
    private hatPlayerId: string | null,
    private kitOverrides?: Array<FIGHTER_KIT_T | undefined>,
  ) {
    const q = qualityParams();
    this.gs = createGameScene(canvas, q);
    const scene = this.gs.scene;
    this.arena = buildArena(scene, DISASTER_DOME, q);
    if (this.gs.shadows) {
      for (const m of this.arena.shadowCasters.slice(0, 40)) this.gs.shadows.addShadowCaster(m);
    }
    this.effects = new EffectsManager(scene, q.particleScale);

    this.camera = new FreeCamera("cam", new Vector3(0, 26, -34), scene);
    this.camera.setTarget(new Vector3(0, 0, 0));
    this.camera.maxZ = 160;
    this.camera.fov = 0.85;

    // Build all 12 fighters up front.
    for (const slot of participants) {
      const rig = createCharacter(scene, slot.character, {
        withHat: slot.id === hatPlayerId,
        particleScale: q.particleScale,
        kit: this.kitOverrides?.[slot.slotIndex] ?? FIGHTER_KITS[slot.slotIndex % FIGHTER_KITS.length],
      });
      if (this.gs.shadows) for (const m of rig.meshes) this.gs.shadows.addShadowCaster(m);
      rig.setNameplate(slot.name, 1, slot.status === "ai");
      const spawn = DISASTER_DOME.spawnPoints[slot.slotIndex] ?? { x: 0, z: 0 };
      rig.root.position.set(spawn.x, 0, spawn.z);
      this.fighters.set(slot.id, { rig, slot, lastAnim: "idle", lastWeapon: null, prev: null, next: null, koLaunched: false });
    }

    connection.onSnapshot = (snap) => this.pushSnapshot(snap);
    connection.onEvents = (events) => this.pushEvents(events);

    scene.onBeforeRenderObservable.add(() => this.frame());
    this.gs.engine.runRenderLoop(() => scene.render());

    // 30 Hz input pump (players only)
    if (myId) {
      this.inputTimer = window.setInterval(() => this.pumpInput(), 33);
    }
    this.hudTimer = window.setInterval(() => this.emitHud(), 120);
  }

  // ---------------- public API ----------------

  setInput(patch: Partial<InputState>): void {
    Object.assign(this.input, patch);
  }

  onHud(fn: (h: HudState) => void): () => void {
    this.hudListeners.add(fn);
    return () => this.hudListeners.delete(fn);
  }

  onNotice(fn: (n: UiNotice) => void): () => void {
    this.noticeListeners.add(fn);
    return () => this.noticeListeners.delete(fn);
  }

  setSpectatorCam(cam: SpectatorCam, followId?: string): void {
    this.specCam = cam;
    if (followId) this.specFollowId = followId;
  }

  /** Mark which fighter is "you" for this viewer: follow cam + personal banners. */
  setFocus(id: string | null): void {
    this.focusId = id;
    if (id) {
      this.specCam = "follow";
      this.specFollowId = id;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.inputTimer !== null) clearInterval(this.inputTimer);
    if (this.hudTimer !== null) clearInterval(this.hudTimer);
    connection.onSnapshot = null;
    connection.onEvents = null;
    this.effects.dispose();
    this.gs.dispose();
  }

  // ---------------- input ----------------

  private pumpInput(): void {
    if (!this.myId || !this.latestSnap) return;
    const me = this.latestSnap.fighters.find((f) => f.id === this.myId);
    if (!me || me.eliminated) return;

    let yaw: number | undefined;
    const moving = Math.hypot(this.input.mx, this.input.mz) > 0.12;
    if (moving) {
      yaw = Math.atan2(this.input.mx, this.input.mz);
      this.myYaw = yaw;
    } else if (settings.autoFace && (this.input.atk || this.input.heavy) && this.myPos) {
      // Aim assist: face the nearest living opponent inside a generous cone.
      let best: FighterSnap | null = null;
      let bestD = 10 + settings.aimAssist * 8;
      for (const f of this.latestSnap.fighters) {
        if (f.id === this.myId || f.eliminated) continue;
        const d = Math.hypot(f.x - this.myPos.x, f.z - this.myPos.z);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) {
        yaw = Math.atan2(best.x - this.myPos.x, best.z - this.myPos.z);
        this.myYaw = yaw;
      }
    }

    connection.sendInput({
      mx: this.input.mx * settings.sensitivity > 1 ? 1 : this.input.mx,
      mz: this.input.mz,
      ...(yaw !== undefined ? { yaw } : {}),
      ...(this.input.atk ? { atk: true } : {}),
      ...(this.input.heavy ? { heavyHold: true } : {}),
      ...(this.input.dodge ? { dodge: true } : {}),
      ...(this.input.jump ? { jump: true } : {}),
      ...(this.input.pickup ? { pickup: true } : {}),
      ...(this.input.emote ? { emote: 1 } : {}),
    });
    // one-shot buttons reset after send
    this.input.dodge = false;
    this.input.jump = false;
    this.input.pickup = false;
    this.input.emote = false;
  }

  // ---------------- network ingestion ----------------

  private pushSnapshot(snap: Snapshot): void {
    this.snapA = this.snapB ?? snap;
    this.snapB = snap;
    this.snapBTime = performance.now();
    this.latestSnap = snap;
    for (const f of snap.fighters) {
      const e = this.fighters.get(f.id);
      if (e) {
        e.prev = e.next;
        e.next = f;
      }
    }
  }

  private nameOf(id: string | null | undefined): string {
    if (!id) return "";
    return this.participants.find((p) => p.id === id)?.name ?? "";
  }

  private notice(n: UiNotice): void {
    for (const fn of this.noticeListeners) fn(n);
  }

  private pushEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.e) {
        case "hit": {
          const pos = new Vector3(ev.x, ev.y, ev.z);
          this.effects.hit(pos, ev.heavy);
          this.effects.damageNumber(pos.add(new Vector3(0, 0.6, 0)), ev.damage, ev.heavy);
          const w = ev.weapon;
          audio.play(w && this.tryWeaponAudio(w) ? this.tryWeaponAudio(w)! : ev.heavy ? "heavyHit" : "hit");
          if (ev.target === this.myId) {
            this.camShake = Math.max(this.camShake, shakeAmount(ev.heavy ? 0.5 : 0.25));
            vibrate(ev.heavy ? [40, 30, 60] : 30);
            if (w === "glitter_grenade") this.blindUntil = performance.now() + 2400;
          } else if (ev.attacker === this.myId) {
            this.camShake = Math.max(this.camShake, shakeAmount(0.15));
            vibrate(15);
          }
          this.fighters.get(ev.target)?.rig.flash();
          break;
        }
        case "knockdown":
          audio.play("heavyHit");
          break;
        case "elimination": {
          const e = this.fighters.get(ev.record.playerId);
          if (e) {
            // Explode and disappear: big burst at the fighter, rig gone instantly.
            this.effects.ko(e.rig.root.position.add(new Vector3(0, 1, 0)));
            this.effects.confetti(e.rig.root.position.add(new Vector3(0, 1.5, 0)), false);
            e.koLaunched = false;
            e.rig.setVisibility(0);
          }
          this.elimOrder.push(ev.record.playerId);
          if (ev.record.byPlayerId) {
            this.elimsBy.set(ev.record.byPlayerId, (this.elimsBy.get(ev.record.byPlayerId) ?? 0) + 1);
          }
          audio.play("elimination");
          audio.play("partyBoom");
          this.camShake = Math.max(this.camShake, shakeAmount(0.35));
          const isFocusDeath = ev.record.playerId === (this.myId ?? this.focusId);
          this.notice({ kind: "splat", big: isFocusDeath });
          this.notice({ kind: "koWord", word: KO_WORDS[Math.floor(Math.random() * KO_WORDS.length)] ?? "BODIED!" });
          // Kill cam: the director cuts to the scene of the crime.
          if (e) {
            this.killCamPos = e.rig.root.position.clone();
            this.killCamUntil = this.t + 1.7;
            this.directorCut = true;
          }
          if (ev.record.playerId === this.focusId) {
            this.notice({ kind: "focusOut", pick: 12 - this.elimOrder.indexOf(ev.record.playerId) });
            // Give the personal banner a beat, then hand over to the director.
            const deadId = ev.record.playerId;
            setTimeout(() => {
              if (this.specCam === "follow" && (this.specFollowId ?? this.focusId) === deadId) {
                this.specCam = "director";
              }
            }, 2800);
          }
          this.notice({ kind: "feed", text: `❌ ${ev.record.playerName} eliminated${ev.record.byPlayerId ? ` by ${this.nameOf(ev.record.byPlayerId)}` : ""}` });
          if (ev.record.playerId === this.myId) {
            this.myPlacementPick = 12 - [...this.fighters.values()].filter((f) => f.next?.eliminated).length + 1;
            this.camShake = shakeAmount(0.8);
            vibrate([60, 40, 100]);
          }
          break;
        }
        case "drop":
          audio.play("dropIncoming");
          this.notice({ kind: "feed", text: `📦 Incoming delivery (${ev.rarity})` });
          break;
        case "pickupTaken":
          if (ev.playerId === this.myId) audio.play(ev.rarity === "legendary" ? "legendary" : "pickup");
          break;
        case "hazardTelegraph":
          audio.play("warning");
          break;
        case "hazardActive": {
          audio.play(this.tryHazardAudio(ev.kind) ?? "alarmBuzz");
          if (ev.kind === "trap_door") {
            const td = DISASTER_DOME.trapDoors.find((d) => Math.hypot(d.x - ev.x, d.z - ev.z) < 1);
            if (td) {
              this.arena.setTrapDoorOpen(td.id, true);
              setTimeout(() => this.arena.setTrapDoorOpen(td.id, false), 2000);
            }
          }
          break;
        }
        case "zoneStage":
          audio.play("zoneShrink");
          break;
        case "yippee": {
          const name = this.nameOf(ev.playerId);
          audio.speak("Yippee!", "yippee", ev.variant);
          this.notice({ kind: "yippee", playerName: name, variant: ev.variant });
          const e = this.fighters.get(ev.playerId);
          if (e) this.effects.sparkleTrail(e.rig.root.position.add(new Vector3(0, 2.2, 0)));
          break;
        }
        case "announce":
          audio.speak(ev.line, "announcer");
          this.notice({ kind: "caption", text: ev.line, mood: ev.mood });
          break;
        case "phase":
          this.notice({ kind: "phase", phase: ev.phase });
          if (ev.phase === "playing") {
            audio.play("matchStart");
            audio.setMusic("arena");
          } else if (ev.phase === "countdown") {
            audio.play("countdown");
          } else if (ev.phase === "finalTwo") {
            audio.setMusic("finalTwo");
            const alive = this.latestSnap?.fighters.filter((f) => !f.eliminated) ?? [];
            const [a, b] = alive;
            if (a && b) this.notice({ kind: "finalTwo", names: [this.nameOf(a.id), this.nameOf(b.id)] });
          } else if (ev.phase === "suddenDeath") {
            audio.play("alarmBuzz");
          }
          break;
        case "victory": {
          audio.setMusic("victory");
          audio.play("victory");
          this.notice({ kind: "victory", playerName: ev.playerName });
          if (ev.playerId === this.focusId) this.notice({ kind: "focusWin" });
          const e = this.fighters.get(ev.playerId);
          if (e) this.effects.confetti(e.rig.root.position.add(new Vector3(0, 3, 0)), true);
          break;
        }
        case "propHit":
          if (ev.kind.startsWith("explosion:")) {
            this.effects.explosion(new Vector3(ev.x, ev.y, ev.z), ev.kind);
            audio.play(ev.kind.includes("cake") ? "partyBoom" : ev.kind.includes("glitter") ? "sparklePop" : "explosion");
            this.camShake = Math.max(this.camShake, shakeAmount(0.3));
          } else if (ev.kind === "dropLand") {
            this.effects.dropLand(new Vector3(ev.x, ev.y, ev.z));
            audio.play("dropLand");
          } else if (ev.kind === "bouncePad") {
            audio.play("boing");
          }
          break;
        case "throw":
          audio.play("whoosh");
          break;
        default:
          break;
      }
    }
  }

  private tryWeaponAudio(id: string): string | null {
    try {
      return getWeapon(id).audio;
    } catch {
      return null;
    }
  }

  private tryHazardAudio(kind: string): string | null {
    const map: Record<string, string> = {
      falling_draft_board: "creakSlam", rolling_chairs: "wheelieClatter", flying_pizza: "splat",
      ceiling_fan_blades: "fanWhirr", mascot_stampede: "stampede", stage_collapse: "rumble",
      trap_door: "trapCreak", commissioner_rage: "rageHorn", confetti_misfire: "confettiBoom",
      soda_slip: "fizz", giant_football: "boing", waiver_wheel: "wheelTick",
      autodraft_flash: "alarmBuzz", camera_robot: "servoWhine", snack_cart: "cartRattle",
    };
    return map[kind] ?? null;
  }

  // ---------------- per-frame ----------------

  private frame(): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, this.gs.engine.getDeltaTime() / 1000);
    this.t += dt;
    this.arena.update(dt);
    this.effects.update(dt);

    const snapB = this.snapB;
    if (!snapB) {
      this.updateCamera(dt);
      return;
    }
    // Interpolate between the two most recent snapshots, rendered ~90ms behind.
    const snapInterval = 1000 / 15;
    const age = performance.now() - this.snapBTime;
    const alpha = Math.min(1.4, age / snapInterval); // slight extrapolation allowed

    for (const [id, e] of this.fighters) {
      const a = e.prev ?? e.next;
      const b = e.next;
      if (!a || !b) continue;
      const isMe = id === this.myId;
      const lerp = (x: number, y: number): number => x + (y - x) * Math.min(1, alpha);
      const tx = lerp(a.x, b.x);
      const ty = lerp(a.y, b.y);
      const tz = lerp(a.z, b.z);

      if (isMe && !b.eliminated) {
        // Prediction: advance locally from inputs, softly corrected to server.
        if (!this.myPos) this.myPos = new Vector3(tx, ty, tz);
        const speed = SIM.RUN_SPEED;
        const nx = this.myPos.x + this.input.mx * speed * dt;
        const nz = this.myPos.z + this.input.mz * speed * dt;
        if (!collidesBlocking(DISASTER_DOME, nx, this.myPos.z, this.myPos.y, SIM.PLAYER_RADIUS)) this.myPos.x = nx;
        if (!collidesBlocking(DISASTER_DOME, this.myPos.x, nz, this.myPos.y, SIM.PLAYER_RADIUS)) this.myPos.z = nz;
        this.myPos.y = supportHeight(DISASTER_DOME, this.myPos.x, this.myPos.z, this.myPos.y + 0.3, SIM.PLAYER_RADIUS * 0.7);
        // Soft server correction
        const errX = tx - this.myPos.x;
        const errY = ty - this.myPos.y;
        const errZ = tz - this.myPos.z;
        const errMag = Math.hypot(errX, errY, errZ);
        const corr = errMag > 2.5 ? 1 : Math.min(1, dt * (b.stunned ? 20 : 6));
        this.myPos.x += errX * corr;
        this.myPos.y += errY * corr;
        this.myPos.z += errZ * corr;
        e.rig.root.position.copyFrom(this.myPos);
        const moving = Math.hypot(this.input.mx, this.input.mz) > 0.12;
        const targetYaw = moving || b.stunned ? this.myYaw : lerpAngle(e.rig.root.rotation.y, b.yaw, 0.3);
        e.rig.root.rotation.y = lerpAngle(e.rig.root.rotation.y, b.stunned ? b.yaw : targetYaw, Math.min(1, dt * 14));
      } else {
        e.rig.root.position.set(tx, ty, tz);
        e.rig.root.rotation.y = lerpAngle(e.rig.root.rotation.y, b.yaw, Math.min(1, dt * 12));
      }

      // Animation state
      if (b.anim !== e.lastAnim) {
        e.lastAnim = b.anim;
        e.rig.setAnim(b.anim);
        if (isMe && b.anim === "dodge") audio.play("dodge");
      }
      const speedFrac = a === b ? 0 : Math.min(1, Math.hypot(b.x - a.x, b.z - a.z) / (snapInterval / 1000) / SIM.SPRINT_SPEED);
      e.rig.update(dt, speedFrac);

      // Weapon in hand
      if (b.weapon !== e.lastWeapon) {
        e.lastWeapon = b.weapon;
        e.rig.setWeapon(b.weapon, (wid) => buildWeaponMesh(this.gs.scene, wid));
      }

      // Powerup visuals
      const headScale = b.powerups.includes("giant_head") ? 2.1 : 1;
      const bodyScale = b.powerups.includes("tiny_body") ? 0.65 : b.powerups.includes("commissioner_mode") ? 1.3 : 1;
      e.rig.setHeadScale(headScale);
      e.rig.setBodyScale(bodyScale);
      const invisible = b.powerups.includes("invisibility");
      e.rig.setVisibility(b.eliminated ? (e.koLaunched ? 1 : 0) : invisible ? (isMe ? 0.35 : 0.06) : 1);

      // Eliminated fighters exploded at the elimination event — stay hidden.

      e.rig.setNameplate(e.slot.name, Math.max(0, b.hp) / (this.latestSnap ? Math.max(1, maxHpOf(this.latestSnap, b)) : 100), e.slot.status === "ai" || e.slot.connStatus === "ai-takeover");
    }

    // Projectiles
    const seen = new Set<number>();
    for (const p of snapB.projectiles) {
      seen.add(p.id);
      let ent = this.projectiles.get(p.id);
      if (!ent) {
        ent = { mesh: buildProjectileMesh(this.gs.scene, p.kind), prev: { x: p.x, y: p.y, z: p.z }, next: { x: p.x, y: p.y, z: p.z }, kind: p.kind };
        this.projectiles.set(p.id, ent);
      }
      if (ent.next.x !== p.x || ent.next.z !== p.z || ent.next.y !== p.y) {
        ent.prev = ent.next;
        ent.next = { x: p.x, y: p.y, z: p.z };
      }
      const l = Math.min(1, alpha);
      ent.mesh.position.set(
        ent.prev.x + (ent.next.x - ent.prev.x) * l,
        ent.prev.y + (ent.next.y - ent.prev.y) * l,
        ent.prev.z + (ent.next.z - ent.prev.z) * l,
      );
      ent.mesh.rotation.y = p.yaw;
      ent.mesh.rotation.x += dt * 8;
    }
    for (const [id, ent] of this.projectiles) {
      if (!seen.has(id)) {
        ent.mesh.dispose();
        this.projectiles.delete(id);
      }
    }

    // Pickups
    const seenPk = new Set<number>();
    for (const pk of snapB.pickups) {
      seenPk.add(pk.id);
      let vis = this.pickups.get(pk.id);
      if (!vis) {
        vis = buildPickupVisual(this.gs.scene, pk.itemId, pk.itemType, pk.rarity);
        this.pickups.set(pk.id, vis);
      }
      vis.node.position.set(pk.x, pk.y - 0.3, pk.z);
      vis.update(dt, this.t);
    }
    for (const [id, vis] of this.pickups) {
      if (!seenPk.has(id)) {
        vis.dispose();
        this.pickups.delete(id);
      }
    }

    // Hazards
    const seenHz = new Set<number>();
    for (const hz of snapB.hazards) {
      seenHz.add(hz.id);
      let vis = this.hazards.get(hz.id);
      if (!vis) {
        vis = buildHazardVisual(this.gs.scene, hz.kind, hz.radius);
        vis.node.position.set(hz.x, 0, hz.z);
        this.hazards.set(hz.id, vis);
      }
      vis.setActive(hz.state === "active");
      vis.update(dt, this.t);
    }
    for (const [id, vis] of this.hazards) {
      if (!seenHz.has(id)) {
        vis.dispose();
        this.hazards.delete(id);
      }
    }

    // Zone
    this.zoneRadiusVisual += (snapB.zone.radius - this.zoneRadiusVisual) * Math.min(1, dt * 3);
    this.arena.setZoneRadius(this.zoneRadiusVisual);

    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    let target: Vector3 | null = null;
    let camPos: Vector3 | null = null;

    const phase = this.latestSnap?.phase ?? "lobby";
    if (phase === "finalTwo" || phase === "victory") {
      const alive = [...this.fighters.values()].filter((f) => f.next && !f.next.eliminated);
      if (alive.length >= 1) {
        const center = alive
          .reduce((acc, f) => acc.addInPlace(f.rig.root.position), new Vector3(0, 0, 0))
          .scaleInPlace(1 / alive.length);
        target = center.add(new Vector3(0, 1, 0));
        const orbit = this.t * (phase === "victory" ? 0.5 : 0.3);
        const dist = phase === "victory" ? 7 : 10;
        camPos = center.add(new Vector3(Math.sin(orbit) * dist, phase === "victory" ? 3.5 : 5, Math.cos(orbit) * dist));
      }
    } else if (this.myId) {
      const me = this.fighters.get(this.myId);
      const alive = me?.next && !me.next.eliminated;
      if (me && alive) {
        target = me.rig.root.position.add(new Vector3(0, 1.2, 0));
        camPos = me.rig.root.position.add(new Vector3(0, 9, -8.2));
      } else {
        // Eliminated → drift to overhead spectate
        target = new Vector3(0, 0, 0);
        camPos = new Vector3(0, 34, -20);
      }
    } else {
      // Spectator modes
      switch (this.specCam) {
        case "overhead":
          target = new Vector3(0, 0, 0);
          camPos = new Vector3(0, 44, -6);
          break;
        case "arena":
          target = new Vector3(0, 1, 0);
          camPos = new Vector3(Math.sin(this.t * 0.1) * 34, 20, Math.cos(this.t * 0.1) * 34);
          break;
        case "follow": {
          const fid = this.specFollowId ?? this.focusId;
          const f = fid ? this.fighters.get(fid) : null;
          if (f && f.next && !f.next.eliminated) {
            // Personal chase cam: close, low, framed with the nearest threat,
            // shooting from the arena center so the crowd is the backdrop.
            const fpos = f.rig.root.position;
            let mate: Vector3 | null = null;
            let md = 14;
            for (const o of this.fighters.values()) {
              if (o === f || !o.next || o.next.eliminated) continue;
              const d = Vector3.Distance(o.rig.root.position, fpos);
              if (d < md) {
                md = d;
                mate = o.rig.root.position;
              }
            }
            const mid = mate ? Vector3.Lerp(fpos, mate, 0.25) : fpos.clone();
            target = mid.add(new Vector3(0, 1.3, 0));
            const dist = Math.min(10, 5 + (mate ? md * 0.5 : 2));
            const flat = new Vector3(fpos.x, 0, fpos.z);
            const outward = flat.length() > 2 ? flat.normalize() : new Vector3(Math.sin(this.t * 0.1), 0, Math.cos(this.t * 0.1));
            camPos = mid.subtract(outward.scale(dist * 0.9)).add(new Vector3(0, 3.6 + dist * 0.42, 0));
          } else if (f) {
            // Your fighter is out — drift up while the director takes over framing.
            target = new Vector3(0, 1, 0);
            camPos = new Vector3(0, 30, -18);
          }
          break;
        }
        case "free":
          this.updateCamShake(dt);
          return; // user-controlled; leave camera alone
        default: {
          // Kill cam: linger on the elimination site for a beat.
          if (this.killCamPos && this.t < this.killCamUntil) {
            const kp = this.killCamPos;
            target = kp.add(new Vector3(0, 1.2, 0));
            const flatK = new Vector3(kp.x, 0, kp.z);
            const outK = flatK.length() > 2 ? flatK.normalize() : new Vector3(0, 0, 1);
            camPos = kp.subtract(outK.scale(6)).add(new Vector3(0, 4.2, 0));
            if (this.directorCut) {
              this.directorCut = false;
              this.camera.position.copyFrom(camPos);
              this.camTarget.copyFrom(target);
            }
            break;
          }
          // Cinematic director: frame the most interesting fighter together
          // with their nearest opponent from a low broadcast angle, cutting
          // between subjects instead of drifting across the whole arena.
          const cur = this.directorTarget ? this.fighters.get(this.directorTarget) : null;
          if (this.t > this.directorSwitchAt || !cur || !cur.next || cur.next.eliminated) {
            this.directorSwitchAt = this.t + 6;
            const candidates = [...this.fighters.values()].filter((f) => f.next && !f.next.eliminated);
            candidates.sort((a, b) => scoreInterest(b, this.hatPlayerId) - scoreInterest(a, this.hatPlayerId));
            const next = candidates[0]?.slot.id ?? null;
            if (next !== this.directorTarget) this.directorCut = true;
            this.directorTarget = next;
          }
          const f = this.directorTarget ? this.fighters.get(this.directorTarget) : null;
          if (f) {
            const fpos = f.rig.root.position;
            // Nearest living opponent — frame the fight, not a lone jogger.
            let mate: Vector3 | null = null;
            let md = 16;
            for (const o of this.fighters.values()) {
              if (o === f || !o.next || o.next.eliminated) continue;
              const d = Vector3.Distance(o.rig.root.position, fpos);
              if (d < md) {
                md = d;
                mate = o.rig.root.position;
              }
            }
            const mid = mate ? Vector3.Lerp(fpos, mate, 0.4) : fpos.clone();
            target = mid.add(new Vector3(0, 1.3, 0));
            const sep = mate ? md : 7;
            const dist = Math.min(12, 5.5 + sep * 0.7);
            // Shoot from between the action and the arena center, looking
            // outward — keeps the crowd wall as backdrop and never clips it.
            const flat = new Vector3(mid.x, 0, mid.z);
            const outward = flat.length() > 2 ? flat.normalize() : new Vector3(Math.sin(this.t * 0.1), 0, Math.cos(this.t * 0.1));
            const perp = new Vector3(-outward.z, 0, outward.x).scaleInPlace(Math.sin(this.t * 0.22) * 0.45);
            camPos = mid
              .subtract(outward.scale(dist * 0.85))
              .add(perp.scale(dist))
              .add(new Vector3(0, 2.8 + dist * 0.38, 0));
            if (this.directorCut) {
              // Hard cut: broadcast cameras cut, they don't fly.
              this.directorCut = false;
              this.camera.position.copyFrom(camPos);
              this.camTarget.copyFrom(target);
            }
          }
        }
      }
    }

    if (target && camPos) {
      this.camTarget = Vector3.Lerp(this.camTarget, target, Math.min(1, dt * 5));
      this.camera.position = Vector3.Lerp(this.camera.position, camPos, Math.min(1, dt * 4));
      this.camera.setTarget(this.camTarget);
    }
    this.updateCamShake(dt);
  }

  private updateCamShake(dt: number): void {
    if (this.camShake > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.camShake;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake * 0.6;
      this.camShake *= Math.max(0, 1 - dt * 7);
    }
  }

  private emitHud(): void {
    const snap = this.latestSnap;
    if (!snap) return;
    const me = this.myId ? snap.fighters.find((f) => f.id === this.myId) : null;
    let nearPickup = false;
    if (me && this.myPos) {
      for (const pk of snap.pickups) {
        if (pk.state === "landed" && Math.hypot(pk.x - this.myPos.x, pk.z - this.myPos.z) < SIM.PICKUP_RADIUS + 0.4) {
          nearPickup = true;
          break;
        }
      }
    }
    const board: BoardRow[] = this.participants
      .map((p) => {
        const f = snap.fighters.find((x) => x.id === p.id);
        const elimIdx = this.elimOrder.indexOf(p.id);
        return {
          id: p.id,
          name: p.name,
          hp: f ? Math.max(0, f.hp) : 0,
          eliminated: f?.eliminated ?? false,
          pick: elimIdx >= 0 ? 12 - elimIdx : null,
          elims: this.elimsBy.get(p.id) ?? 0,
          hat: f?.hat ?? false,
          isMe: p.id === (this.myId ?? this.focusId),
        };
      })
      .sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        if (!a.eliminated) return b.hp - a.hp || b.elims - a.elims;
        return (a.pick ?? 99) - (b.pick ?? 99);
      });

    const h: HudState = {
      hp: me?.hp ?? 0,
      maxHp: 100,
      weapon: me?.weapon ?? null,
      weaponName: me?.weapon ? safeWeaponName(me.weapon) : null,
      ammo: me?.ammo ?? 0,
      charge: me?.charge ?? 0,
      aliveCount: snap.aliveCount,
      matchTimeSec: snap.matchTimeSec,
      phase: snap.phase,
      zoneShrinkIn: snap.zone.nextShrinkInSec,
      outsideZone: me && this.myPos ? Math.hypot(this.myPos.x, this.myPos.z) > snap.zone.radius : false,
      eliminated: me?.eliminated ?? false,
      myPlacementPick: this.myPlacementPick,
      nearPickup,
      powerups: me?.powerups ?? [],
      blind: performance.now() < this.blindUntil,
      fps: Math.round(this.gs.engine.getFps()),
      board,
    };
    for (const fn of this.hudListeners) fn(h);
  }
}

const KO_WORDS = [
  "BODIED!", "YEETED!", "WAIVED!", "AUTO-DRAFTED!", "SENT HOME!", "COOKED!",
  "BENCHED!", "DROPPED!", "OBLITERATED!", "GG NO RE!", "TO THE SHADOW REALM!", "DELETED!",
];

function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

function maxHpOf(snap: Snapshot, f: FighterSnap): number {
  void snap;
  void f;
  return 100;
}

function scoreInterest(f: FighterEntity, hatId: string | null): number {
  let s = Math.random() * 0.3;
  if (f.next) {
    s += (1 - f.next.hp / 100) * 0.8;
    if (f.next.weapon) s += 0.3;
    if (f.slot.id === hatId) s += 0.4;
    if (f.next.anim === "attack" || f.next.anim === "heavy") s += 0.5;
  }
  return s;
}

function safeWeaponName(id: string): string {
  try {
    return getWeapon(id).name;
  } catch {
    return id;
  }
}
