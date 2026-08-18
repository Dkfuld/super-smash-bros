import { settings } from "../ui/settings";

export interface QualityParams {
  tier: "low" | "medium" | "high";
  hardwareScaling: number; // 1 = native, higher = fewer pixels
  shadows: boolean;
  shadowMapSize: number;
  particleScale: number; // multiplier on particle counts
  animatedProps: boolean; // fans, TVs, banners animate
  glow: boolean;
  crowdDetail: boolean;
  maxDebris: number;
}

/**
 * Device capability probe → quality tier. Deliberately conservative: the game
 * must stay readable and cartoon-styled at every tier (we cut resolution,
 * shadows and particle counts — never the art direction).
 */
export function detectTier(): "low" | "medium" | "high" {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const pixels = screen.width * screen.height * (devicePixelRatio || 1);
  let score = 0;
  score += mem >= 8 ? 2 : mem >= 4 ? 1 : 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  score += pixels > 4_000_000 ? 0 : 1; // very dense screens cost fill rate
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return "low";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase() : "";
    if (/apple|adreno 7|adreno 6[5-9]|mali-g7|rtx|radeon|geforce/.test(renderer)) score += 2;
    if (/swiftshader|llvmpipe|software/.test(renderer)) return "low";
  } catch {
    /* keep score */
  }
  return score >= 5 ? "high" : score >= 3 ? "medium" : "low";
}

export function qualityParams(): QualityParams {
  const tier = settings.quality === "auto" ? detectTier() : settings.quality;
  switch (tier) {
    case "high":
      return { tier, hardwareScaling: Math.max(1, (devicePixelRatio || 1) / 2), shadows: true, shadowMapSize: 1024, particleScale: 1, animatedProps: true, glow: true, crowdDetail: true, maxDebris: 40 };
    case "medium":
      return { tier, hardwareScaling: Math.max(1.2, (devicePixelRatio || 1) / 1.6), shadows: true, shadowMapSize: 512, particleScale: 0.6, animatedProps: true, glow: true, crowdDetail: true, maxDebris: 20 };
    default:
      return { tier: "low", hardwareScaling: Math.max(1.5, devicePixelRatio || 1), shadows: false, shadowMapSize: 0, particleScale: 0.35, animatedProps: false, glow: false, crowdDetail: false, maxDebris: 8 };
  }
}
