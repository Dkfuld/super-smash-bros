import { FreeCamera, Vector3 } from "@babylonjs/core";
import { DISASTER_DOME, SIM, collidesBlocking, supportHeight, type ParticipantSlot } from "@ddd/shared";
import { audio } from "../audio/audio";
import { buildArena, type ArenaHandles } from "./arena";
import { FIGHTER_KITS, createCharacter, type CharacterRig } from "./character";
import { createGameScene, type GameScene } from "./engine";
import { qualityParams } from "./quality";
import type { InputState } from "./world";

/**
 * Walkable 3D pregame lobby: your fighter roams the actual Disaster Dome
 * (locally simulated — no server traffic), other ready league members hang out
 * at their spawn spots, and the attack/dodge/jump buttons work so players can
 * practice their controls while waiting for the commissioner.
 */
export class LobbyWorld {
  private gs: GameScene;
  private arena: ArenaHandles;
  private me: CharacterRig;
  private others = new Map<number, { rig: CharacterRig; slot: ParticipantSlot }>();
  private camera: FreeCamera;
  private input: Partial<InputState> = {};
  private pos = new Vector3(0, 0, -12);
  private vy = 0;
  private yaw = 0;
  private actionUntil = 0;
  private action: "attack" | "dodge" | null = null;
  private dodgeDir = { x: 0, z: 1 };
  private t = 0;
  private camTarget = new Vector3(0, 1, -12);

  constructor(
    canvas: HTMLCanvasElement,
    private mySlot: ParticipantSlot,
    otherSlots: ParticipantSlot[],
  ) {
    const q = qualityParams();
    this.gs = createGameScene(canvas, q);
    this.arena = buildArena(this.gs.scene, DISASTER_DOME, q);
    this.arena.setZoneRadius(DISASTER_DOME.initialZoneRadius);

    this.me = createCharacter(this.gs.scene, mySlot.character, {
      withHat: mySlot.isPreviousLoser,
      particleScale: q.particleScale,
      kit: FIGHTER_KITS[mySlot.slotIndex % FIGHTER_KITS.length],
    });
    this.me.setNameplate(mySlot.name, 1, false);
    this.me.root.position.copyFrom(this.pos);
    if (this.gs.shadows) for (const m of this.me.meshes) this.gs.shadows.addShadowCaster(m);

    this.updateRoster(otherSlots);

    this.camera = new FreeCamera("lobbyCam", new Vector3(0, 9, -21), this.gs.scene);
    this.camera.setTarget(this.camTarget);
    this.camera.maxZ = 160;

    this.gs.scene.onBeforeRenderObservable.add(() => this.frame());
    this.gs.engine.runRenderLoop(() => this.gs.scene.render());
  }

  /** Show/refresh the other league members who have joined (idle at their spawns). */
  updateRoster(slots: ParticipantSlot[]): void {
    for (const slot of slots) {
      if (slot.slotIndex === this.mySlot.slotIndex || slot.status === "empty") continue;
      const existing = this.others.get(slot.slotIndex);
      if (existing) {
        existing.rig.setNameplate(slot.name, 1, slot.status === "ai");
        continue;
      }
      const rig = createCharacter(this.gs.scene, slot.character, {
        withHat: slot.isPreviousLoser,
        kit: FIGHTER_KITS[slot.slotIndex % FIGHTER_KITS.length],
      });
      rig.setNameplate(slot.name, 1, slot.status === "ai");
      const sp = DISASTER_DOME.spawnPoints[slot.slotIndex] ?? { x: 0, z: 0 };
      rig.root.position.set(sp.x * 0.8, 0, sp.z * 0.8);
      rig.root.rotation.y = Math.atan2(-sp.x, -sp.z);
      this.others.set(slot.slotIndex, { rig, slot });
    }
    // Remove rigs for slots that emptied out
    for (const [idx, entry] of this.others) {
      const still = slots.find((s) => s.slotIndex === idx);
      if (!still || still.status === "empty") {
        entry.rig.dispose();
        this.others.delete(idx);
      }
    }
  }

  setInput(patch: Partial<InputState>): void {
    const now = performance.now();
    if (patch.atk && !this.input.atk && now > this.actionUntil) {
      this.action = "attack";
      this.actionUntil = now + 320;
      this.me.setAnim("attack");
      audio.play("thwip");
    }
    if (patch.dodge && now > this.actionUntil) {
      this.action = "dodge";
      this.actionUntil = now + 280;
      const mag = Math.hypot(this.input.mx ?? 0, this.input.mz ?? 0);
      this.dodgeDir = mag > 0.1 ? { x: (this.input.mx ?? 0) / mag, z: (this.input.mz ?? 0) / mag } : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      this.me.setAnim("dodge");
      audio.play("dodge");
    }
    if (patch.jump && this.pos.y <= supportHeight(DISASTER_DOME, this.pos.x, this.pos.z, this.pos.y, 0.4) + 0.01) {
      this.vy = SIM.JUMP_VELOCITY;
      audio.play("jump");
    }
    Object.assign(this.input, patch);
  }

  private frame(): void {
    const dt = Math.min(0.1, this.gs.engine.getDeltaTime() / 1000);
    this.t += dt;
    this.arena.update(dt);

    const now = performance.now();
    const dodging = this.action === "dodge" && now < this.actionUntil;
    let mx = this.input.mx ?? 0;
    let mz = this.input.mz ?? 0;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    let vx: number, vz: number;
    if (dodging) {
      vx = this.dodgeDir.x * SIM.DODGE_SPEED;
      vz = this.dodgeDir.z * SIM.DODGE_SPEED;
    } else {
      vx = mx * SIM.RUN_SPEED;
      vz = mz * SIM.RUN_SPEED;
      if (mag > 0.1) this.yaw = Math.atan2(mx, mz);
    }
    const nx = this.pos.x + vx * dt;
    if (!collidesBlocking(DISASTER_DOME, nx, this.pos.z, this.pos.y, SIM.PLAYER_RADIUS)) this.pos.x = nx;
    const nz = this.pos.z + vz * dt;
    if (!collidesBlocking(DISASTER_DOME, this.pos.x, nz, this.pos.y, SIM.PLAYER_RADIUS)) this.pos.z = nz;
    // keep inside the dome
    const b = DISASTER_DOME.bounds;
    this.pos.x = Math.max(b.minX + 1, Math.min(b.maxX - 1, this.pos.x));
    this.pos.z = Math.max(b.minZ + 1, Math.min(b.maxZ - 1, this.pos.z));

    const support = supportHeight(DISASTER_DOME, this.pos.x, this.pos.z, this.pos.y + 0.3, SIM.PLAYER_RADIUS * 0.7);
    if (this.pos.y > support + 0.001 || this.vy > 0) {
      this.vy += SIM.GRAVITY * dt;
      this.pos.y = Math.max(support, this.pos.y + this.vy * dt);
      if (this.pos.y <= support) this.vy = 0;
    } else {
      this.pos.y = support;
    }

    this.me.root.position.copyFrom(this.pos);
    const targetYaw = this.yaw;
    let dy = targetYaw - this.me.root.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.me.root.rotation.y += dy * Math.min(1, dt * 14);

    if (now >= this.actionUntil) {
      this.action = null;
      const speedFrac = Math.hypot(vx, vz) / SIM.SPRINT_SPEED;
      this.me.setAnim(speedFrac > 0.6 ? "run" : speedFrac > 0.08 ? "walk" : "idle");
    }
    this.me.update(dt, Math.hypot(vx, vz) / SIM.SPRINT_SPEED);

    for (const { rig } of this.others.values()) {
      rig.update(dt, 0);
    }

    // camera follow
    const target = this.pos.add(new Vector3(0, 1.2, 0));
    const camPos = this.pos.add(new Vector3(0, 9, -8.2));
    this.camTarget = Vector3.Lerp(this.camTarget, target, Math.min(1, dt * 5));
    this.camera.position = Vector3.Lerp(this.camera.position, camPos, Math.min(1, dt * 4));
    this.camera.setTarget(this.camTarget);
  }

  dispose(): void {
    this.me.dispose();
    for (const { rig } of this.others.values()) rig.dispose();
    this.gs.dispose();
  }
}
