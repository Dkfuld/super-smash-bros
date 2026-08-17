import {
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";
import { settings } from "../ui/settings";

/**
 * Pooled VFX: hit bursts, confetti, glitter, explosions, floating damage
 * numbers. Particle counts scale with the quality tier; flash-heavy effects
 * respect the flash-reduction accessibility setting.
 */
export class EffectsManager {
  private flareTex: Texture;
  private numberPool: Array<{ mesh: Mesh; tex: DynamicTexture; mat: StandardMaterial; life: number; vy: number }> = [];

  constructor(
    private scene: Scene,
    private particleScale: number,
  ) {
    // Soft round flare drawn once
    const dt = new DynamicTexture("flare", { width: 64, height: 64 }, scene, false);
    const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    dt.update();
    dt.hasAlpha = true;
    this.flareTex = dt;
  }

  private burst(pos: Vector3, opts: {
    count: number; c1: Color4; c2: Color4; speed?: number; size?: number; life?: number; gravity?: number; up?: boolean;
  }): void {
    const count = Math.max(3, Math.round(opts.count * this.particleScale));
    const ps = new ParticleSystem("burst", count, this.scene);
    ps.particleTexture = this.flareTex;
    ps.emitter = pos.clone();
    ps.color1 = opts.c1;
    ps.color2 = opts.c2;
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.minSize = (opts.size ?? 0.2) * 0.6;
    ps.maxSize = (opts.size ?? 0.2) * 1.5;
    ps.minLifeTime = (opts.life ?? 0.4) * 0.6;
    ps.maxLifeTime = opts.life ?? 0.4;
    ps.emitRate = 0;
    ps.manualEmitCount = count;
    ps.minEmitPower = (opts.speed ?? 4) * 0.5;
    ps.maxEmitPower = opts.speed ?? 4;
    ps.direction1 = opts.up ? new Vector3(-1, 1.5, -1) : new Vector3(-1, -0.4, -1);
    ps.direction2 = opts.up ? new Vector3(1, 3, 1) : new Vector3(1, 1.4, 1);
    ps.gravity = new Vector3(0, opts.gravity ?? -9, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.disposeOnStop = true; // self-cleans once all particles die
    ps.start();
    ps.targetStopDuration = 0.05;
  }

  hit(pos: Vector3, heavy: boolean): void {
    this.burst(pos, {
      count: heavy ? 26 : 12,
      c1: new Color4(1, 0.9, 0.3, 1),
      c2: new Color4(1, 0.4, 0.2, 1),
      speed: heavy ? 7 : 4,
      size: heavy ? 0.3 : 0.2,
    });
  }

  /** Elimination blast: the fighter pops in a big multi-ring burst. */
  ko(pos: Vector3): void {
    this.burst(pos, { count: 46, c1: new Color4(1, 0.85, 0.2, 1), c2: new Color4(1, 0.25, 0.15, 1), speed: 11, size: 0.42, life: 0.7, up: true });
    this.burst(pos, { count: 24, c1: new Color4(1, 1, 1, 1), c2: new Color4(0.6, 0.85, 1, 1), speed: 6, size: 0.3, life: 0.45 });
    this.burst(pos, { count: 16, c1: new Color4(1, 0.5, 0.9, 1), c2: new Color4(0.7, 0.4, 1, 1), speed: 14, size: 0.25, life: 0.9, gravity: -3, up: true });
  }

  explosion(pos: Vector3, kind: string): void {
    const glitter = kind.includes("glitter");
    const cake = kind.includes("cake");
    this.burst(pos, {
      count: 50,
      c1: glitter ? new Color4(1, 0.5, 1, 1) : cake ? new Color4(1, 0.6, 0.8, 1) : new Color4(1, 0.7, 0.2, 1),
      c2: glitter ? new Color4(0.5, 0.8, 1, 1) : new Color4(1, 0.3, 0.1, 1),
      speed: 10,
      size: 0.4,
      life: glitter ? 1.1 : 0.6,
      up: true,
    });
  }

  confetti(pos: Vector3, big: boolean): void {
    const colors: Array<[Color4, Color4]> = [
      [new Color4(1, 0.3, 0.4, 1), new Color4(1, 0.8, 0.2, 1)],
      [new Color4(0.3, 0.8, 1, 1), new Color4(0.5, 1, 0.4, 1)],
      [new Color4(0.8, 0.4, 1, 1), new Color4(1, 0.5, 0.8, 1)],
    ];
    for (const [c1, c2] of colors) {
      this.burst(pos, { count: big ? 40 : 14, c1, c2, speed: big ? 11 : 6, size: 0.22, life: big ? 1.6 : 0.9, gravity: -4, up: true });
    }
  }

  sparkleTrail(pos: Vector3): void {
    this.burst(pos, { count: 4, c1: new Color4(1, 0.9, 0.5, 1), c2: new Color4(0.6, 0.9, 1, 1), speed: 1.2, size: 0.12, life: 0.5, gravity: -1 });
  }

  dropLand(pos: Vector3): void {
    this.burst(pos, { count: 18, c1: new Color4(0.9, 0.8, 0.6, 1), c2: new Color4(0.7, 0.6, 0.4, 1), speed: 5, size: 0.25, gravity: -6 });
  }

  /** Floating damage number. */
  damageNumber(pos: Vector3, amount: number, heavy: boolean): void {
    if (amount < 1) return;
    let entry = this.numberPool.find((e) => e.life <= 0);
    if (!entry) {
      if (this.numberPool.length >= 14) return;
      const tex = new DynamicTexture("dmg", { width: 128, height: 64 }, this.scene, false);
      tex.hasAlpha = true;
      const material = new StandardMaterial("dmgMat", this.scene);
      material.diffuseTexture = tex;
      material.emissiveColor.set(1, 1, 1);
      material.useAlphaFromDiffuseTexture = true;
      material.disableLighting = true;
      material.backFaceCulling = false;
      const mesh = MeshBuilder.CreatePlane("dmgPlane", { width: 0.9, height: 0.45 }, this.scene);
      mesh.material = material;
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.setEnabled(false);
      entry = { mesh, tex, mat: material, life: 0, vy: 0 };
      this.numberPool.push(entry);
    }
    const ctx = entry.tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = `bold ${heavy ? 44 : 34}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "#1a0a2a";
    ctx.lineWidth = 7;
    ctx.strokeText(String(Math.round(amount)), 64, 46);
    ctx.fillStyle = heavy ? "#ffcf3d" : "#ffffff";
    ctx.fillText(String(Math.round(amount)), 64, 46);
    entry.tex.update();
    entry.mesh.position.copyFrom(pos);
    entry.mesh.position.x += (Math.random() - 0.5) * 0.5;
    entry.mesh.setEnabled(true);
    entry.mat.alpha = 1;
    entry.life = 0.8;
    entry.vy = 2.2;
  }

  update(dt: number): void {
    for (const e of this.numberPool) {
      if (e.life > 0) {
        e.life -= dt;
        e.mesh.position.y += e.vy * dt;
        e.vy *= 0.94;
        e.mat.alpha = Math.min(1, e.life / 0.3);
        if (e.life <= 0) e.mesh.setEnabled(false);
      }
    }
  }

  dispose(): void {
    for (const e of this.numberPool) {
      e.mesh.dispose();
      e.tex.dispose();
    }
  }
}

/** Screen-space camera shake amount, respecting accessibility settings. */
export function shakeAmount(base: number): number {
  if (settings.reducedMotion) return 0;
  return base * settings.screenShake;
}
