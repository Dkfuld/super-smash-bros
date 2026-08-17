import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { BODIES, COLORS, type AnimState, type CharacterConfig } from "@ddd/shared";

/**
 * Procedural stylized-cartoon character rig. Big heads, stubby limbs,
 * hand-drawn faces, squash & stretch, and fully procedural animation.
 * Built entirely from composed geometry + DynamicTextures so every fighter is
 * original art; the rig interface is stable so commissioned GLB characters can
 * replace construction without touching gameplay code.
 */

const SKIN_TONES = ["#f2c79b", "#e8b184", "#c98d5f", "#a06a42", "#7c4f2f", "#f7d7b0"];

export interface CharacterRig {
  root: TransformNode;
  visual: TransformNode;
  headPivot: TransformNode;
  weaponHolder: TransformNode;
  meshes: Mesh[];
  setAnim(anim: AnimState): void;
  update(dt: number, speedFrac: number): void;
  setNameplate(name: string, hpFrac: number, isAi: boolean): void;
  setWeapon(weaponId: string | null, buildWeapon: (id: string) => Mesh | null): void;
  setVisibility(v: number): void;
  setHeadScale(s: number): void;
  setBodyScale(s: number): void;
  flash(): void;
  hat: { node: TransformNode; update: (dt: number, moving: boolean) => void } | null;
  dispose(): void;
}

function mat(scene: Scene, name: string, hex: string, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  if (emissive > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  return m;
}

function drawFace(scene: Scene, faceId: string, skin: string): DynamicTexture {
  const tex = new DynamicTexture(`face_${faceId}`, { width: 256, height: 256 }, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);
  ctx.lineCap = "round";

  const eye = (x: number, y: number, r: number, pupilDx = 0): void => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#221a10";
    ctx.beginPath();
    ctx.arc(x + pupilDx, y + r * 0.15, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  };
  const brow = (x: number, y: number, w: number, tilt: number): void => {
    ctx.strokeStyle = "#2b1d0e";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y + tilt);
    ctx.lineTo(x + w / 2, y - tilt);
    ctx.stroke();
  };
  const mouth = (kind: "grin" | "flat" | "o" | "frown" | "smirk" | "open"): void => {
    ctx.strokeStyle = "#5a2a1a";
    ctx.lineWidth = 9;
    ctx.fillStyle = "#7a3b28";
    ctx.beginPath();
    switch (kind) {
      case "grin":
        ctx.arc(128, 150, 46, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        break;
      case "open":
        ctx.ellipse(128, 172, 30, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "o":
        ctx.ellipse(128, 172, 16, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "flat":
        ctx.moveTo(96, 172);
        ctx.lineTo(160, 172);
        ctx.stroke();
        break;
      case "frown":
        ctx.arc(128, 200, 40, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
        break;
      case "smirk":
        ctx.moveTo(100, 176);
        ctx.quadraticCurveTo(140, 186, 168, 158);
        ctx.stroke();
        break;
    }
  };

  switch (faceId) {
    case "gamer": eye(88, 106, 26); eye(168, 106, 26); brow(88, 66, 48, 6); brow(168, 66, 48, -6); mouth("grin"); break;
    case "smug": eye(88, 106, 20, 6); eye(168, 106, 20, 6); brow(88, 74, 44, -8); brow(168, 74, 44, 8); mouth("smirk"); break;
    case "panic": eye(84, 102, 30); eye(172, 102, 30); brow(84, 54, 46, -10); brow(172, 54, 46, 10); mouth("open"); break;
    case "sleepy": {
      ctx.strokeStyle = "#221a10"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(88, 106, 22, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(168, 106, 22, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      mouth("o");
      break;
    }
    case "rage": eye(88, 110, 22); eye(168, 110, 22); brow(88, 76, 50, 14); brow(168, 76, 50, -14); mouth("frown"); break;
    case "grin": eye(88, 104, 24); eye(168, 104, 24); brow(88, 62, 44, 0); brow(168, 62, 44, 0); mouth("open"); break;
    case "shades": {
      ctx.fillStyle = "#15181f";
      ctx.beginPath(); ctx.roundRect(52, 84, 66, 42, 10); ctx.fill();
      ctx.beginPath(); ctx.roundRect(138, 84, 66, 42, 10); ctx.fill();
      ctx.fillRect(114, 96, 28, 10);
      mouth("smirk");
      break;
    }
    case "mustache": {
      eye(88, 100, 22); eye(168, 100, 22); brow(88, 62, 44, 0); brow(168, 62, 44, 0);
      ctx.fillStyle = "#3a2a17";
      ctx.beginPath();
      ctx.ellipse(100, 156, 34, 14, -0.25, 0, Math.PI * 2);
      ctx.ellipse(156, 156, 34, 14, 0.25, 0, Math.PI * 2);
      ctx.fill();
      mouth("flat");
      break;
    }
    default: eye(88, 106, 24); eye(168, 106, 24); mouth("grin");
  }
  // blush
  ctx.fillStyle = "rgba(240,120,110,0.35)";
  ctx.beginPath();
  ctx.ellipse(56, 148, 16, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(200, 148, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  void skin;
  tex.update();
  return tex;
}

export function createRainbowHat(scene: Scene, parent: TransformNode, particleScale: number): { node: TransformNode; update: (dt: number, moving: boolean) => void } {
  const node = new TransformNode("rainbowHat", scene);
  node.parent = parent;
  node.position.y = 0.52;

  const capMat = mat(scene, "hatCap", "#ffd23f", 0.25);
  const cap = MeshBuilder.CreateSphere("hatDome", { diameter: 0.72, slice: 0.55 }, scene);
  cap.material = capMat;
  cap.parent = node;
  const brim = MeshBuilder.CreateCylinder("hatBrim", { diameter: 0.86, height: 0.05 }, scene);
  brim.material = mat(scene, "hatBrim", "#ff5f9e", 0.3);
  brim.parent = node;
  brim.position.y = -0.02;

  const mast = MeshBuilder.CreateCylinder("hatMast", { diameter: 0.06, height: 0.3 }, scene);
  mast.material = mat(scene, "hatMast", "#cccccc");
  mast.parent = node;
  mast.position.y = 0.4;

  const fan = new TransformNode("hatFan", scene);
  fan.parent = node;
  fan.position.y = 0.55;
  const rainbow = ["#ff3b3b", "#ff9f2e", "#ffe83b", "#43d94e", "#3b8bff", "#a04ef2"];
  rainbow.forEach((hex, i) => {
    const blade = MeshBuilder.CreateBox(`blade${i}`, { width: 0.5, height: 0.02, depth: 0.14 }, scene);
    blade.material = mat(scene, `blade${i}`, hex, 0.5);
    blade.parent = fan;
    blade.rotation.y = (i / rainbow.length) * Math.PI * 2;
    blade.position.x = Math.sin(blade.rotation.y) * 0.26;
    blade.position.z = Math.cos(blade.rotation.y) * 0.26;
    blade.rotation.x = 0.18;
    blade.setPivotPoint(new Vector3(-0.25, 0, 0));
  });
  const hub = MeshBuilder.CreateSphere("hatHub", { diameter: 0.12 }, scene);
  hub.material = mat(scene, "hatHub", "#ffffff", 0.6);
  hub.parent = fan;

  // trailing ribbons
  const ribbons: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = MeshBuilder.CreatePlane(`ribbon${i}`, { width: 0.07, height: 0.5 }, scene);
    r.material = mat(scene, `ribbon${i}`, rainbow[(i * 2) % 6] ?? "#fff", 0.4);
    (r.material as StandardMaterial).backFaceCulling = false;
    r.parent = node;
    r.position.set(Math.sin((i / 3) * Math.PI * 2) * 0.4, -0.05, Math.cos((i / 3) * Math.PI * 2) * 0.4);
    r.rotation.x = 0.4;
    ribbons.push(r);
  }

  let t = Math.random() * 10;
  const update = (dt: number, moving: boolean): void => {
    t += dt;
    fan.rotation.y += dt * 9; // aggressive continuous spin
    node.rotation.z = Math.sin(t * (moving ? 7 : 2.4)) * (moving ? 0.09 : 0.035); // wobble
    ribbons.forEach((r, i) => {
      r.rotation.x = 0.4 + Math.sin(t * 4 + i * 2) * 0.3;
      r.rotation.z = Math.sin(t * 3 + i) * 0.25;
    });
  };
  void particleScale;
  return { node, update };
}

/**
 * Original platform-fighter archetypes — one per roster slot, giving the
 * character-select-screen energy of a mascot brawler without copying any
 * existing game's characters. Each kit adds signature headgear + a prop.
 */
export const FIGHTER_KITS = [
  "knight", "ninja", "wizard", "robot", "viking", "boxer",
  "archer", "pirate", "luchador", "samurai", "scientist", "hero",
  "royal", "ape", "dragon", "hunter",
] as const;
export type FighterKit = (typeof FIGHTER_KITS)[number];

export const KIT_INFO: Record<FighterKit, { label: string; emoji: string }> = {
  knight: { label: "Sword Knight", emoji: "🗡" },
  ninja: { label: "Shadow Ninja", emoji: "🥷" },
  wizard: { label: "Battle Wizard", emoji: "🧙" },
  robot: { label: "Combat Bot", emoji: "🤖" },
  viking: { label: "Viking", emoji: "🪓" },
  boxer: { label: "Champ Boxer", emoji: "🥊" },
  archer: { label: "Hooded Archer", emoji: "🏹" },
  pirate: { label: "Pirate Captain", emoji: "🏴‍☠️" },
  luchador: { label: "Luchador", emoji: "🎭" },
  samurai: { label: "Samurai", emoji: "⚔️" },
  scientist: { label: "Mad Scientist", emoji: "🧪" },
  hero: { label: "Caped Hero", emoji: "🦸" },
  royal: { label: "Royal Highness", emoji: "👑" },
  ape: { label: "Jungle Bruiser", emoji: "🦍" },
  dragon: { label: "Dragon Tyrant", emoji: "🐉" },
  hunter: { label: "Space Hunter", emoji: "🛰" },
};

/** Kits that cover the head (procedural hair is skipped for these). */
const KIT_HEADGEAR = new Set<FighterKit>(["knight", "ninja", "wizard", "viking", "archer", "pirate", "luchador", "samurai", "scientist", "royal", "ape", "dragon", "hunter"]);

export function createCharacter(
  scene: Scene,
  cfg: CharacterConfig,
  opts: { withHat?: boolean; particleScale?: number; kit?: FighterKit } = {},
): CharacterRig {
  const body = BODIES.find((b) => b.id === cfg.bodyId) ?? BODIES[0]!;
  const color = COLORS.find((c) => c.id === cfg.colorId) ?? COLORS[0]!;
  const skin = SKIN_TONES[(cfg.faceId.length * 7 + cfg.colorId.length * 3) % SKIN_TONES.length]!;

  const root = new TransformNode("charRoot", scene);
  const visual = new TransformNode("charVisual", scene);
  visual.parent = root;
  const meshes: Mesh[] = [];

  const jerseyMat = mat(scene, `jersey_${color.id}`, color.primary);
  const trimMat = mat(scene, `trim_${color.id}`, color.secondary);
  const skinMat = mat(scene, `skin`, skin);

  // Torso: squashed sphere belly + jersey
  const torso = MeshBuilder.CreateSphere("torso", { diameterX: 0.78 * body.width, diameterY: 0.85, diameterZ: 0.62 * body.width * body.bellyScale }, scene);
  torso.material = jerseyMat;
  torso.parent = visual;
  torso.position.y = 0.72;
  meshes.push(torso);

  const shorts = MeshBuilder.CreateCylinder("shorts", { diameterTop: 0.62 * body.width, diameterBottom: 0.68 * body.width, height: 0.3 }, scene);
  shorts.material = trimMat;
  shorts.parent = visual;
  shorts.position.y = 0.38;
  meshes.push(shorts);

  // Head (oversized)
  const headPivot = new TransformNode("headPivot", scene);
  headPivot.parent = visual;
  headPivot.position.y = 1.18;
  const headScaleNode = new TransformNode("headScale", scene);
  headScaleNode.parent = headPivot;
  const head = MeshBuilder.CreateSphere("head", { diameterX: 0.62 * body.headScale, diameterY: 0.58 * body.headScale, diameterZ: 0.6 * body.headScale }, scene);
  head.material = skinMat;
  head.parent = headScaleNode;
  head.position.y = 0.22 * body.headScale;
  meshes.push(head);

  // Face plane
  const faceTex = drawFace(scene, cfg.faceId, skin);
  const faceMat = new StandardMaterial("faceMat", scene);
  faceMat.diffuseTexture = faceTex;
  faceMat.emissiveColor = new Color3(0.25, 0.25, 0.25);
  faceMat.specularColor = Color3.Black();
  faceMat.useAlphaFromDiffuseTexture = true;
  faceMat.backFaceCulling = true;
  const face = MeshBuilder.CreatePlane("face", { size: 0.52 * body.headScale, sideOrientation: Mesh.DOUBLESIDE }, scene);
  face.material = faceMat;
  face.parent = headScaleNode;
  face.position.set(0, 0.2 * body.headScale, 0.325 * body.headScale);

  // Hair
  const hairMatDark = mat(scene, "hair", "#3a2a17");
  const buildHair = (): void => {
    const hy = 0.42 * body.headScale;
    switch (cfg.hairId) {
      case "cap": {
        const capDome = MeshBuilder.CreateSphere("cap", { diameter: 0.56 * body.headScale, slice: 0.5 }, scene);
        capDome.material = trimMat;
        capDome.parent = headScaleNode;
        capDome.position.y = hy;
        const bill = MeshBuilder.CreateBox("bill", { width: 0.3 * body.headScale, height: 0.04, depth: 0.24 * body.headScale }, scene);
        bill.material = trimMat;
        bill.parent = headScaleNode;
        bill.position.set(0, hy, -0.3 * body.headScale); // backwards cap
        break;
      }
      case "spikes":
        for (let i = 0; i < 5; i++) {
          const spike = MeshBuilder.CreateCylinder(`spike${i}`, { diameterTop: 0, diameterBottom: 0.1 * body.headScale, height: 0.2 * body.headScale }, scene);
          spike.material = hairMatDark;
          spike.parent = headScaleNode;
          spike.position.set((i - 2) * 0.09 * body.headScale, hy + 0.06 * body.headScale, 0);
          spike.rotation.z = (i - 2) * 0.25;
        }
        break;
      case "fro": {
        const fro = MeshBuilder.CreateSphere("fro", { diameter: 0.58 * body.headScale }, scene);
        fro.material = hairMatDark;
        fro.parent = headScaleNode;
        fro.position.y = hy + 0.05 * body.headScale;
        break;
      }
      case "visor": {
        const visor = MeshBuilder.CreateCylinder("visor", { diameter: 0.6 * body.headScale, height: 0.07, arc: 0.6 }, scene);
        visor.material = mat(scene, "visorMat", "#e8e8e8");
        visor.parent = headScaleNode;
        visor.position.y = hy - 0.05;
        visor.rotation.y = Math.PI * 0.7;
        break;
      }
      case "bedhead":
        for (let i = 0; i < 7; i++) {
          const tuft = MeshBuilder.CreateSphere(`tuft${i}`, { diameter: 0.16 * body.headScale }, scene);
          tuft.material = hairMatDark;
          tuft.parent = headScaleNode;
          const a = (i / 7) * Math.PI * 2;
          tuft.position.set(Math.sin(a) * 0.2 * body.headScale, hy + Math.cos(i * 3) * 0.05, Math.cos(a) * 0.18 * body.headScale);
        }
        break;
      default:
        break; // bald = aerodynamic
    }
  };
  if (!opts.kit || !KIT_HEADGEAR.has(opts.kit)) buildHair();

  // Limbs
  const mkLimb = (name: string, len: number, dia: number, material: StandardMaterial): { pivot: TransformNode; mesh: Mesh } => {
    const pivot = new TransformNode(`${name}Pivot`, scene);
    pivot.parent = visual;
    const m = MeshBuilder.CreateCapsule(name, { height: len, radius: dia / 2 }, scene);
    m.material = material;
    m.parent = pivot;
    m.position.y = -len / 2;
    meshes.push(m);
    return { pivot, mesh: m };
  };
  const armLen = 0.52 * body.limbLength;
  const legLen = 0.42 * body.limbLength;
  const armL = mkLimb("armL", armLen, 0.16, skinMat);
  armL.pivot.position.set(-0.42 * body.width, 1.0, 0);
  const armR = mkLimb("armR", armLen, 0.16, skinMat);
  armR.pivot.position.set(0.42 * body.width, 1.0, 0);
  const legL = mkLimb("legL", legLen, 0.2, skinMat);
  legL.pivot.position.set(-0.16 * body.width, 0.42, 0);
  const legR = mkLimb("legR", legLen, 0.2, skinMat);
  legR.pivot.position.set(0.16 * body.width, 0.42, 0);

  // Shoes
  for (const [leg, side] of [[legL, -1], [legR, 1]] as const) {
    const shoe = MeshBuilder.CreateSphere("shoe", { diameterX: 0.24, diameterY: 0.14, diameterZ: 0.34 }, scene);
    shoe.material = trimMat;
    shoe.parent = leg.pivot;
    shoe.position.set(0, -legLen, 0.05);
    meshes.push(shoe);
    void side;
  }

  // Weapon holder in right hand
  const weaponHolder = new TransformNode("weaponHolder", scene);
  weaponHolder.parent = armR.pivot;
  weaponHolder.position.set(0.02, -armLen, 0.08);

  // Accessory
  switch (cfg.accessoryId) {
    case "headband": {
      const band = MeshBuilder.CreateTorus("band", { diameter: 0.56 * body.headScale, thickness: 0.06 }, scene);
      band.material = trimMat;
      band.parent = headScaleNode;
      band.position.y = 0.32 * body.headScale;
      break;
    }
    case "cape": {
      const cape = MeshBuilder.CreatePlane("cape", { width: 0.7 * body.width, height: 0.85 }, scene);
      const cm = mat(scene, "capeMat", color.secondary);
      cm.backFaceCulling = false;
      cape.material = cm;
      cape.parent = visual;
      cape.position.set(0, 1.05, -0.3 * body.width * body.bellyScale);
      cape.rotation.x = -0.25;
      break;
    }
    case "glasses": {
      const rim = MeshBuilder.CreateBox("glasses", { width: 0.44 * body.headScale, height: 0.1, depth: 0.02 }, scene);
      rim.material = mat(scene, "glassesMat", "#20242c");
      rim.parent = headScaleNode;
      rim.position.set(0, 0.22 * body.headScale, 0.3 * body.headScale);
      break;
    }
    case "medal": {
      const medal = MeshBuilder.CreateCylinder("medal", { diameter: 0.18, height: 0.03 }, scene);
      medal.material = mat(scene, "medalMat", "#e8b23a", 0.4);
      medal.parent = visual;
      medal.rotation.x = Math.PI / 2;
      medal.position.set(0, 0.85, 0.34 * body.width * body.bellyScale);
      break;
    }
    case "foamfinger": {
      const finger = MeshBuilder.CreateBox("foamfinger", { width: 0.2, height: 0.28, depth: 0.08 }, scene);
      finger.material = mat(scene, "foamMat", "#ffd23f", 0.2);
      finger.parent = armL.pivot;
      finger.position.set(0, -armLen - 0.1, 0);
      break;
    }
    default:
      break;
  }

  // ---------------- fighter archetype kit ----------------
  if (opts.kit) {
    const hs = body.headScale;
    const hy = 0.42 * hs;
    const back = -0.3 * body.width * body.bellyScale;
    switch (opts.kit) {
      case "knight": {
        const helm = MeshBuilder.CreateSphere("helm", { diameter: 0.66 * hs, slice: 0.62 }, scene);
        helm.material = mat(scene, "helmM", "#aeb6c2", 0.1);
        helm.parent = headScaleNode;
        helm.position.y = hy - 0.06;
        const plume = MeshBuilder.CreateCylinder("plume", { diameterTop: 0.02, diameterBottom: 0.1 * hs, height: 0.3 * hs }, scene);
        plume.material = mat(scene, "plumeM", color.primary, 0.2);
        plume.parent = headScaleNode;
        plume.position.y = hy + 0.2 * hs;
        plume.rotation.x = -0.3;
        const sword = MeshBuilder.CreateBox("sword", { width: 0.08, height: 0.85, depth: 0.03 }, scene);
        sword.material = mat(scene, "swordM", "#d7dde6", 0.25);
        sword.parent = visual;
        sword.position.set(0.2, 1.15, back - 0.05);
        sword.rotation.z = 0.5;
        break;
      }
      case "ninja": {
        const maskBand = MeshBuilder.CreateCylinder("mask", { diameter: 0.63 * hs, height: 0.16 * hs }, scene);
        maskBand.material = mat(scene, "ninjaM", "#23263a");
        maskBand.parent = headScaleNode;
        maskBand.position.y = 0.33 * hs;
        for (let i = 0; i < 2; i++) {
          const tail = MeshBuilder.CreatePlane(`bandTail${i}`, { width: 0.09, height: 0.4 }, scene);
          const tm = mat(scene, "bandTailM", color.primary, 0.15);
          tm.backFaceCulling = false;
          tail.material = tm;
          tail.parent = headScaleNode;
          tail.position.set(0.08 - i * 0.16, 0.28 * hs, -0.3 * hs);
          tail.rotation.x = 0.5 + i * 0.25;
        }
        const katana = MeshBuilder.CreateBox("katana", { width: 0.05, height: 0.8, depth: 0.02 }, scene);
        katana.material = mat(scene, "katanaM", "#c8cfd9", 0.2);
        katana.parent = visual;
        katana.position.set(-0.2, 1.15, back - 0.05);
        katana.rotation.z = -0.6;
        break;
      }
      case "wizard": {
        const hat = MeshBuilder.CreateCylinder("wizHat", { diameterTop: 0, diameterBottom: 0.55 * hs, height: 0.6 * hs }, scene);
        hat.material = mat(scene, "wizHatM", color.secondary, 0.15);
        hat.parent = headScaleNode;
        hat.position.y = hy + 0.2 * hs;
        hat.rotation.z = 0.15;
        const brim = MeshBuilder.CreateCylinder("wizBrim", { diameter: 0.7 * hs, height: 0.04 }, scene);
        brim.material = hat.material;
        brim.parent = headScaleNode;
        brim.position.y = hy - 0.02;
        const orb = MeshBuilder.CreateSphere("orb", { diameter: 0.14 }, scene);
        orb.material = mat(scene, "orbM", "#57e6ff", 0.9);
        orb.parent = visual;
        orb.position.set(-0.5 * body.width, 0.9, 0.15);
        break;
      }
      case "robot": {
        const antenna = MeshBuilder.CreateCylinder("ant", { diameter: 0.03, height: 0.3 * hs }, scene);
        antenna.material = mat(scene, "antM", "#8d939e");
        antenna.parent = headScaleNode;
        antenna.position.y = hy + 0.15 * hs;
        const bulb = MeshBuilder.CreateSphere("bulb", { diameter: 0.09 }, scene);
        bulb.material = mat(scene, "bulbM", "#ff4c4c", 0.9);
        bulb.parent = headScaleNode;
        bulb.position.y = hy + 0.32 * hs;
        const visor = MeshBuilder.CreateBox("roboVisor", { width: 0.5 * hs, height: 0.1 * hs, depth: 0.04 }, scene);
        visor.material = mat(scene, "roboVisorM", "#57e6ff", 0.7);
        visor.parent = headScaleNode;
        visor.position.set(0, 0.3 * hs, 0.28 * hs);
        const chest = MeshBuilder.CreateBox("chestPanel", { width: 0.3, height: 0.24, depth: 0.05 }, scene);
        chest.material = mat(scene, "chestM", "#8d939e", 0.1);
        chest.parent = visual;
        chest.position.set(0, 0.8, -back);
        break;
      }
      case "viking": {
        const helm = MeshBuilder.CreateSphere("vhelm", { diameter: 0.62 * hs, slice: 0.55 }, scene);
        helm.material = mat(scene, "vhelmM", "#7a6a52", 0.1);
        helm.parent = headScaleNode;
        helm.position.y = hy - 0.03;
        for (const side of [-1, 1]) {
          const horn = MeshBuilder.CreateCylinder("horn", { diameterTop: 0, diameterBottom: 0.1 * hs, height: 0.3 * hs }, scene);
          horn.material = mat(scene, "hornM", "#f2ead8");
          horn.parent = headScaleNode;
          horn.position.set(side * 0.3 * hs, hy + 0.08 * hs, 0);
          horn.rotation.z = -side * 0.7;
        }
        const shield = MeshBuilder.CreateCylinder("shield", { diameter: 0.5, height: 0.05 }, scene);
        shield.material = mat(scene, "shieldM", color.primary, 0.1);
        shield.parent = visual;
        shield.rotation.x = Math.PI / 2 - 0.2;
        shield.position.set(0, 1.0, back - 0.08);
        break;
      }
      case "boxer": {
        for (const [leg] of [[armL], [armR]] as const) {
          const glove = MeshBuilder.CreateSphere("glove", { diameter: 0.26 }, scene);
          glove.material = mat(scene, "gloveM", "#e23d3d", 0.1);
          glove.parent = leg.pivot;
          glove.position.y = -armLen - 0.05;
        }
        const belt = MeshBuilder.CreateCylinder("belt", { diameter: 0.75 * body.width, height: 0.12 }, scene);
        belt.material = mat(scene, "beltM", "#ffd23f", 0.4);
        belt.parent = visual;
        belt.position.y = 0.5;
        break;
      }
      case "archer": {
        const hood = MeshBuilder.CreateSphere("hood", { diameter: 0.68 * hs, slice: 0.6 }, scene);
        hood.material = mat(scene, "hoodM", "#3e5c3a");
        hood.parent = headScaleNode;
        hood.position.y = hy - 0.08;
        const quiver = MeshBuilder.CreateCylinder("quiver", { diameter: 0.14, height: 0.5 }, scene);
        quiver.material = mat(scene, "quiverM", "#6b4a2b");
        quiver.parent = visual;
        quiver.position.set(0.15, 1.1, back - 0.05);
        quiver.rotation.z = 0.4;
        for (let i = 0; i < 3; i++) {
          const fl = MeshBuilder.CreateBox(`fletch${i}`, { width: 0.06, height: 0.1, depth: 0.02 }, scene);
          fl.material = mat(scene, "fletchM", color.primary, 0.2);
          fl.parent = quiver;
          fl.position.set((i - 1) * 0.05, 0.3, 0);
        }
        break;
      }
      case "pirate": {
        const tricorn = MeshBuilder.CreateCylinder("tricorn", { diameterTop: 0.2 * hs, diameterBottom: 0.72 * hs, height: 0.22 * hs, tessellation: 3 }, scene);
        tricorn.material = mat(scene, "tricornM", "#2b2320");
        tricorn.parent = headScaleNode;
        tricorn.position.y = hy + 0.02;
        tricorn.rotation.y = Math.PI;
        const patch = MeshBuilder.CreateBox("patch", { width: 0.14 * hs, height: 0.12 * hs, depth: 0.02 }, scene);
        patch.material = mat(scene, "patchM", "#15181f");
        patch.parent = headScaleNode;
        patch.position.set(0.12 * hs, 0.24 * hs, 0.3 * hs);
        break;
      }
      case "luchador": {
        const maskTop = MeshBuilder.CreateSphere("lmask", { diameter: 0.64 * hs, slice: 0.68 }, scene);
        maskTop.material = mat(scene, "lmaskM", color.primary, 0.15);
        maskTop.parent = headScaleNode;
        maskTop.position.y = hy - 0.12;
        const emblem = MeshBuilder.CreateCylinder("emblem", { diameter: 0.16 * hs, height: 0.02, tessellation: 4 }, scene);
        emblem.material = mat(scene, "emblemM", "#ffd23f", 0.5);
        emblem.parent = headScaleNode;
        emblem.rotation.x = Math.PI / 2;
        emblem.position.set(0, 0.44 * hs, 0.24 * hs);
        break;
      }
      case "samurai": {
        const knot = MeshBuilder.CreateSphere("topknot", { diameter: 0.16 * hs }, scene);
        knot.material = mat(scene, "knotM", "#2b1d0e");
        knot.parent = headScaleNode;
        knot.position.y = hy + 0.12 * hs;
        for (const side of [-1, 1]) {
          const pad = MeshBuilder.CreateBox("pad", { width: 0.22, height: 0.1, depth: 0.3 }, scene);
          pad.material = mat(scene, "padKitM", color.secondary, 0.1);
          pad.parent = visual;
          pad.position.set(side * 0.45 * body.width, 1.08, 0);
          pad.rotation.z = -side * 0.3;
        }
        break;
      }
      case "scientist": {
        for (let i = 0; i < 6; i++) {
          const tuft = MeshBuilder.CreateSphere(`wtuft${i}`, { diameter: 0.17 * hs }, scene);
          tuft.material = mat(scene, "wtuftM", "#e8e8e8");
          tuft.parent = headScaleNode;
          const a = (i / 6) * Math.PI * 2;
          tuft.position.set(Math.sin(a) * 0.24 * hs, hy + Math.cos(i * 2) * 0.06, Math.cos(a) * 0.2 * hs);
        }
        const goggles = MeshBuilder.CreateTorus("goggles", { diameter: 0.5 * hs, thickness: 0.05 * hs }, scene);
        goggles.material = mat(scene, "gogM", "#e8b23a", 0.3);
        goggles.parent = headScaleNode;
        goggles.position.y = hy - 0.02;
        goggles.rotation.x = 0.35;
        break;
      }
      case "royal": {
        // Original royalty class: spiked golden crown, flowing gown, scepter.
        const crownBase = MeshBuilder.CreateCylinder("crown", { diameter: 0.4 * hs, height: 0.12 * hs }, scene);
        crownBase.material = mat(scene, "crownM", "#ffd23f", 0.5);
        crownBase.parent = headScaleNode;
        crownBase.position.y = hy + 0.06 * hs;
        for (let i = 0; i < 5; i++) {
          const spike = MeshBuilder.CreateCylinder(`crSpike${i}`, { diameterTop: 0, diameterBottom: 0.07 * hs, height: 0.14 * hs }, scene);
          spike.material = crownBase.material;
          spike.parent = headScaleNode;
          const a = (i / 5) * Math.PI * 2;
          spike.position.set(Math.sin(a) * 0.17 * hs, hy + 0.17 * hs, Math.cos(a) * 0.17 * hs);
        }
        const gown = MeshBuilder.CreateCylinder("gown", { diameterTop: 0.5 * body.width, diameterBottom: 1.0 * body.width, height: 0.55 }, scene);
        gown.material = mat(scene, "gownM", color.primary, 0.08);
        gown.parent = visual;
        gown.position.y = 0.32;
        const scepter = MeshBuilder.CreateCylinder("scepter", { diameter: 0.05, height: 0.55 }, scene);
        scepter.material = mat(scene, "scepM", "#ffd23f", 0.3);
        scepter.parent = armL.pivot;
        scepter.position.y = -armLen - 0.05;
        const gem = MeshBuilder.CreateSphere("gem", { diameter: 0.13 }, scene);
        gem.material = mat(scene, "gemM", "#ff5f9e", 0.8);
        gem.parent = armL.pivot;
        gem.position.y = -armLen - 0.35;
        break;
      }
      case "ape": {
        // Original big-friendly-bruiser class: fur, huge arms, mighty muzzle.
        const fur = mat(scene, "furM", "#6b4a2b");
        const furCap = MeshBuilder.CreateSphere("furCap", { diameter: 0.66 * hs, slice: 0.6 }, scene);
        furCap.material = fur;
        furCap.parent = headScaleNode;
        furCap.position.y = hy - 0.08;
        const muzzle = MeshBuilder.CreateSphere("muzzle", { diameterX: 0.34 * hs, diameterY: 0.22 * hs, diameterZ: 0.18 * hs }, scene);
        muzzle.material = mat(scene, "muzzleM", "#d9b98c");
        muzzle.parent = headScaleNode;
        muzzle.position.set(0, 0.12 * hs, 0.28 * hs);
        const chestFur = MeshBuilder.CreateSphere("chestFur", { diameterX: 0.9 * body.width, diameterY: 0.8, diameterZ: 0.6 * body.width * body.bellyScale }, scene);
        chestFur.material = fur;
        chestFur.parent = visual;
        chestFur.position.y = 0.72;
        chestFur.position.z = -0.04;
        for (const arm of [armL, armR]) {
          const bigArm = MeshBuilder.CreateSphere("bigArm", { diameter: 0.3 }, scene);
          bigArm.material = fur;
          bigArm.parent = arm.pivot;
          bigArm.position.y = -armLen * 0.5;
          const fist = MeshBuilder.CreateSphere("fist", { diameter: 0.26 }, scene);
          fist.material = fur;
          fist.parent = arm.pivot;
          fist.position.y = -armLen - 0.04;
        }
        break;
      }
      case "dragon": {
        // Original dragon-monster class: horns, snout, tail, stubby wings.
        const scale = mat(scene, "scaleM", "#3f8f4e");
        for (const side of [-1, 1]) {
          const horn = MeshBuilder.CreateCylinder("dHorn", { diameterTop: 0, diameterBottom: 0.09 * hs, height: 0.26 * hs }, scene);
          horn.material = mat(scene, "dHornM", "#f2ead8");
          horn.parent = headScaleNode;
          horn.position.set(side * 0.2 * hs, hy + 0.1 * hs, -0.05);
          horn.rotation.z = -side * 0.4;
        }
        const crest = MeshBuilder.CreateSphere("dCrest", { diameter: 0.62 * hs, slice: 0.55 }, scene);
        crest.material = scale;
        crest.parent = headScaleNode;
        crest.position.y = hy - 0.05;
        const snout = MeshBuilder.CreateBox("snout", { width: 0.26 * hs, height: 0.14 * hs, depth: 0.24 * hs }, scene);
        snout.material = scale;
        snout.parent = headScaleNode;
        snout.position.set(0, 0.1 * hs, 0.32 * hs);
        const tail = MeshBuilder.CreateCylinder("tail", { diameterTop: 0.03, diameterBottom: 0.16, height: 0.7 }, scene);
        tail.material = scale;
        tail.parent = visual;
        tail.position.set(0, 0.45, back - 0.15);
        tail.rotation.x = 1.1;
        for (const side of [-1, 1]) {
          const wing = MeshBuilder.CreatePlane("wing", { width: 0.4, height: 0.32 }, scene);
          const wm = mat(scene, "wingM", color.secondary, 0.12);
          wm.backFaceCulling = false;
          wing.material = wm;
          wing.parent = visual;
          wing.position.set(side * 0.3 * body.width, 1.05, back - 0.04);
          wing.rotation.z = side * 0.7;
          wing.rotation.y = side * 0.5;
        }
        break;
      }
      case "hunter": {
        // Original armored bounty-hunter class: full helm, glowing visor, arm cannon.
        const helm = MeshBuilder.CreateSphere("hHelm", { diameter: 0.68 * hs, slice: 0.72 }, scene);
        helm.material = mat(scene, "hHelmM", color.secondary, 0.12);
        helm.parent = headScaleNode;
        helm.position.y = hy - 0.14;
        const visorSlit = MeshBuilder.CreateBox("hVisor", { width: 0.42 * hs, height: 0.09 * hs, depth: 0.04 }, scene);
        visorSlit.material = mat(scene, "hVisorM", "#4ed24e", 0.9);
        visorSlit.parent = headScaleNode;
        visorSlit.position.set(0, 0.26 * hs, 0.3 * hs);
        const pauldron = MeshBuilder.CreateSphere("pauldron", { diameter: 0.3 }, scene);
        pauldron.material = mat(scene, "pauldM", color.primary, 0.15);
        pauldron.parent = visual;
        pauldron.position.set(0.45 * body.width, 1.1, 0);
        const cannon = MeshBuilder.CreateCylinder("cannon", { diameter: 0.2, height: 0.42 }, scene);
        cannon.material = mat(scene, "cannonM", "#5b636e", 0.2);
        cannon.parent = armL.pivot;
        cannon.rotation.x = Math.PI / 2;
        cannon.position.y = -armLen * 0.7;
        break;
      }
      case "hero": {
        const eyeMask = MeshBuilder.CreateBox("heroMask", { width: 0.5 * hs, height: 0.11 * hs, depth: 0.05 }, scene);
        eyeMask.material = mat(scene, "heroMaskM", color.secondary, 0.2);
        eyeMask.parent = headScaleNode;
        eyeMask.position.set(0, 0.28 * hs, 0.29 * hs);
        const cape = MeshBuilder.CreatePlane("heroCape", { width: 0.72 * body.width, height: 0.9 }, scene);
        const cm = mat(scene, "heroCapeM", color.primary, 0.1);
        cm.backFaceCulling = false;
        cape.material = cm;
        cape.parent = visual;
        cape.position.set(0, 1.08, back - 0.02);
        cape.rotation.x = -0.22;
        const crest = MeshBuilder.CreateCylinder("crest", { diameter: 0.18, height: 0.02, tessellation: 5 }, scene);
        crest.material = mat(scene, "crestM", "#ffd23f", 0.6);
        crest.parent = visual;
        crest.rotation.x = Math.PI / 2;
        crest.position.set(0, 0.88, -back + 0.02);
        break;
      }
    }
  }


  // Nameplate + HP bar (single DynamicTexture billboard)
  const plateTex = new DynamicTexture("plate", { width: 512, height: 128 }, scene, false);
  plateTex.hasAlpha = true;
  const plateMat = new StandardMaterial("plateMat", scene);
  plateMat.diffuseTexture = plateTex;
  plateMat.emissiveColor = new Color3(1, 1, 1);
  plateMat.useAlphaFromDiffuseTexture = true;
  plateMat.disableLighting = true;
  plateMat.backFaceCulling = false;
  const plate = MeshBuilder.CreatePlane("plate", { width: 1.9, height: 0.475 }, scene);
  plate.material = plateMat;
  plate.parent = root;
  plate.position.y = 2.3 * Math.max(1, body.headScale * 0.82);
  plate.billboardMode = Mesh.BILLBOARDMODE_ALL;

  let lastPlate = "";
  const setNameplate = (name: string, hpFrac: number, isAi: boolean): void => {
    const key = `${name}|${Math.round(hpFrac * 50)}|${isAi}`;
    if (key === lastPlate) return;
    lastPlate = key;
    const ctx = plateTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 128);
    // name pill
    ctx.fillStyle = "rgba(10,8,24,0.72)";
    ctx.beginPath();
    ctx.roundRect(56, 4, 400, 62, 18);
    ctx.fill();
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${name}${isAi ? " 🤖" : ""}`, 256, 48, 380);
    // colorblind-safe icon
    ctx.fillStyle = color.primary;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    drawIcon(ctx, color.icon, 84, 35, 20);
    // hp bar
    ctx.fillStyle = "rgba(10,8,24,0.72)";
    ctx.beginPath();
    ctx.roundRect(96, 76, 320, 30, 15);
    ctx.fill();
    const hpColor = hpFrac > 0.5 ? "#4ed24e" : hpFrac > 0.25 ? "#e8b23a" : "#e23d3d";
    ctx.fillStyle = hpColor;
    ctx.beginPath();
    ctx.roundRect(102, 82, Math.max(6, 308 * hpFrac), 18, 9);
    ctx.fill();
    plateTex.update();
  };

  // Hat
  const hat = opts.withHat ? createRainbowHat(scene, headScaleNode, opts.particleScale ?? 1) : null;

  // ---------------- animation ----------------
  let anim: AnimState = "idle";
  let animT = 0;
  let t = Math.random() * 100;
  let currentWeaponMesh: Mesh | null = null;
  let flashT = 0;

  const setAnim = (a: AnimState): void => {
    if (a !== anim) {
      anim = a;
      animT = 0;
    }
  };

  const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

  const update = (dt: number, speedFrac: number): void => {
    t += dt;
    animT += dt;
    const f = Math.min(1, dt * 14);

    // Targets
    let armLx = 0, armRx = 0, armLz = 0.12, armRz = -0.12;
    let legLx = 0, legRx = 0;
    let bodyRx = 0, bodyRz = 0, bodyY = 0, scaleY = 1;
    let headRx = 0;

    const stride = Math.sin(t * 11) * Math.min(1, speedFrac + 0.05);
    switch (anim) {
      case "walk":
      case "run": {
        const amp = 0.5 + speedFrac * 0.55;
        legLx = stride * amp;
        legRx = -stride * amp;
        armLx = -stride * amp * 0.85;
        armRx = stride * amp * 0.85;
        bodyRx = 0.12 * speedFrac;
        bodyY = Math.abs(Math.sin(t * 11)) * 0.05 * speedFrac;
        break;
      }
      case "idle":
        bodyY = Math.sin(t * 2.2) * 0.02;
        scaleY = 1 + Math.sin(t * 2.2) * 0.012;
        armLz = 0.15 + Math.sin(t * 2.2) * 0.02;
        armRz = -0.15 - Math.sin(t * 2.2) * 0.02;
        headRx = Math.sin(t * 0.7) * 0.05;
        break;
      case "attack": {
        const p = Math.min(1, animT / 0.28);
        armRx = p < 0.4 ? lerp(0, -2.2, p / 0.4) : lerp(-2.2, 0.9, (p - 0.4) / 0.6);
        bodyRx = 0.12;
        break;
      }
      case "heavy": {
        const p = Math.min(1, animT / 0.4);
        armRx = p < 0.3 ? -2.4 : lerp(-2.4, 1.4, (p - 0.3) / 0.7);
        armLx = armRx * 0.7;
        bodyRx = p < 0.3 ? -0.15 : 0.3;
        scaleY = p < 0.3 ? 0.92 : 1.05;
        break;
      }
      case "charge":
        armRx = -2.3 + Math.sin(t * 25) * 0.06;
        armLx = -1.8;
        scaleY = 0.9 + Math.sin(t * 18) * 0.015;
        bodyRx = -0.12;
        break;
      case "dodge":
        bodyRz = Math.sin(Math.min(1, animT / 0.26) * Math.PI) * 1.2;
        bodyY = 0.1;
        legLx = 0.8;
        legRx = -0.4;
        break;
      case "hit":
        bodyRx = -0.35;
        headRx = -0.3;
        armLx = -0.8;
        armRx = -0.8;
        scaleY = 0.94;
        break;
      case "down":
        bodyRx = -1.45;
        bodyY = -0.28;
        armLx = -0.4;
        armRx = -0.4;
        break;
      case "launched":
      case "ko":
        bodyRx = visual.rotation.x - dt * (anim === "ko" ? 11 : 7); // tumble
        armLx = -2.6;
        armRx = -2.6;
        legLx = 0.7;
        legRx = -0.7;
        break;
      case "victory": {
        const hop = Math.abs(Math.sin(t * 6));
        bodyY = hop * 0.22;
        armLx = -2.9 + Math.sin(t * 12) * 0.2;
        armRx = -2.9 - Math.sin(t * 12) * 0.2;
        scaleY = 1 + hop * 0.05;
        break;
      }
      case "emote":
        armLx = -2.9;
        armRx = Math.sin(t * 14) * 1.4 - 1;
        bodyRz = Math.sin(t * 7) * 0.15;
        break;
      case "pickup":
        bodyRx = 0.5;
        scaleY = 0.85;
        armRx = 0.9;
        break;
    }

    armL.pivot.rotation.x = lerp(armL.pivot.rotation.x, armLx, f);
    armR.pivot.rotation.x = lerp(armR.pivot.rotation.x, armRx, f);
    armL.pivot.rotation.z = lerp(armL.pivot.rotation.z, armLz, f);
    armR.pivot.rotation.z = lerp(armR.pivot.rotation.z, armRz, f);
    legL.pivot.rotation.x = lerp(legL.pivot.rotation.x, legLx, f);
    legR.pivot.rotation.x = lerp(legR.pivot.rotation.x, legRx, f);
    if (anim === "launched" || anim === "ko") visual.rotation.x = bodyRx;
    else visual.rotation.x = lerp(visual.rotation.x, bodyRx, f);
    visual.rotation.z = lerp(visual.rotation.z, bodyRz, f);
    visual.position.y = lerp(visual.position.y, bodyY, f);
    visual.scaling.y = lerp(visual.scaling.y, scaleY, f);
    visual.scaling.x = lerp(visual.scaling.x, 1 / Math.sqrt(scaleY), f);
    visual.scaling.z = visual.scaling.x;
    headPivot.rotation.x = lerp(headPivot.rotation.x, headRx, f);

    hat?.update(dt, speedFrac > 0.15);

    if (flashT > 0) {
      flashT -= dt;
      const on = flashT % 0.1 > 0.05;
      jerseyMat.emissiveColor = on ? new Color3(0.9, 0.9, 0.9) : Color3.Black();
      if (flashT <= 0) jerseyMat.emissiveColor = Color3.Black();
    }
  };

  return {
    root,
    visual,
    headPivot,
    weaponHolder,
    meshes,
    setAnim,
    update,
    setNameplate,
    setWeapon: (weaponId, buildWeapon) => {
      currentWeaponMesh?.dispose();
      currentWeaponMesh = null;
      if (weaponId) {
        currentWeaponMesh = buildWeapon(weaponId);
        if (currentWeaponMesh) currentWeaponMesh.parent = weaponHolder;
      }
    },
    setVisibility: (v) => {
      for (const m of meshes) m.visibility = v;
      face.visibility = v;
      plate.visibility = v < 0.5 ? 0 : 1;
    },
    setHeadScale: (s) => {
      headScaleNode.scaling.setAll(s);
    },
    setBodyScale: (s) => {
      root.scaling.setAll(s);
    },
    flash: () => {
      flashT = 0.3;
    },
    hat,
    dispose: () => {
      currentWeaponMesh?.dispose();
      root.dispose(false, true);
    },
  };
}

export function drawIcon(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, r: number): void {
  ctx.beginPath();
  switch (icon) {
    case "circle": ctx.arc(x, y, r, 0, Math.PI * 2); break;
    case "square": ctx.rect(x - r, y - r, r * 2, r * 2); break;
    case "triangle": ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); break;
    case "diamond": ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.45;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      ctx.closePath();
      break;
    case "hex":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case "bolt": ctx.moveTo(x + r * 0.3, y - r); ctx.lineTo(x - r * 0.5, y + r * 0.2); ctx.lineTo(x, y + r * 0.2); ctx.lineTo(x - r * 0.3, y + r); ctx.lineTo(x + r * 0.5, y - r * 0.2); ctx.lineTo(x, y - r * 0.2); ctx.closePath(); break;
    case "heart": ctx.moveTo(x, y + r * 0.8); ctx.bezierCurveTo(x - r * 1.4, y - r * 0.3, x - r * 0.5, y - r * 1.1, x, y - r * 0.3); ctx.bezierCurveTo(x + r * 0.5, y - r * 1.1, x + r * 1.4, y - r * 0.3, x, y + r * 0.8); break;
    case "moon": ctx.arc(x, y, r, 0.3, Math.PI * 2 - 0.3); ctx.arc(x + r * 0.6, y, r * 0.75, Math.PI * 1.9 - 0.4, Math.PI * 1.05, true); break;
    case "cross": ctx.rect(x - r * 0.3, y - r, r * 0.6, r * 2); ctx.rect(x - r, y - r * 0.3, r * 2, r * 0.6); break;
    case "wave": ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x - r * 0.5, y - r, x, y); ctx.quadraticCurveTo(x + r * 0.5, y + r, x + r, y); ctx.lineWidth = 6; break;
    default: ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x + r * 0.5, y); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}
