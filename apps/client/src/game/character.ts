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

export function createCharacter(
  scene: Scene,
  cfg: CharacterConfig,
  opts: { withHat?: boolean; particleScale?: number } = {},
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
  buildHair();

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
