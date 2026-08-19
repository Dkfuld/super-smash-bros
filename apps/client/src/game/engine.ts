import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import type { QualityParams } from "./quality";

export interface GameScene {
  engine: Engine;
  scene: Scene;
  shadows: ShadowGenerator | null;
  glow: GlowLayer | null;
  dispose: () => void;
}

/** Engine + scene + core lighting shared by arena, lobby, and preview scenes. */
export function createGameScene(canvas: HTMLCanvasElement, q: QualityParams): GameScene {
  const engine = new Engine(canvas, true, {
    powerPreference: "high-performance",
    stencil: false,
    antialias: q.tier !== "low",
    adaptToDeviceRatio: false,
  });
  engine.setHardwareScalingLevel(q.hardwareScaling);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.03, 0.13, 1); // deep arena night purple
  scene.ambientColor = new Color3(0.35, 0.32, 0.42);
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;

  // Broadcast-grade grade: tone mapping, punchier contrast, purple vignette.
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true;
  ipc.contrast = 1.3;
  ipc.exposure = 1.12;
  ipc.vignetteEnabled = true;
  ipc.vignetteWeight = 2.4;
  ipc.vignetteColor = new Color4(0.04, 0.01, 0.1, 0);
  ipc.vignetteCameraFov = 1.0;

  // Moody stadium lighting: dimmer cool fill, hotter warm key.
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new Color3(0.95, 0.9, 1);
  hemi.groundColor = new Color3(0.24, 0.15, 0.38);

  const sun = new DirectionalLight("key", new Vector3(-0.35, -1, 0.25), scene);
  sun.position = new Vector3(18, 42, -14);
  sun.intensity = 1.5;
  sun.diffuse = new Color3(1, 0.9, 0.74);

  let shadows: ShadowGenerator | null = null;
  if (q.shadows) {
    shadows = new ShadowGenerator(q.shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = q.tier === "high";
    shadows.useBlurExponentialShadowMap = q.tier !== "high";
    shadows.blurKernel = 8;
    shadows.darkness = 0.35;
  }

  let glow: GlowLayer | null = null;
  if (q.glow) {
    glow = new GlowLayer("glow", scene, { mainTextureRatio: 0.4 });
    glow.intensity = 0.55;
  }

  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    engine,
    scene,
    shadows,
    glow,
    dispose: () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      engine.dispose();
    },
  };
}
