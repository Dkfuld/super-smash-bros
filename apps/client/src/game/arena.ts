import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import { type ArenaBox, type ArenaLayout } from "@ddd/shared";
import type { QualityParams } from "./quality";

/**
 * Builds the Fantasy Draft Disaster Dome from the shared collision layout plus
 * decorative, non-colliding dressing. Every box `kind` gets themed geometry;
 * repeated props are instanced; static meshes are frozen for mobile perf.
 */

export interface ArenaHandles {
  root: TransformNode;
  update(dt: number): void;
  setZoneRadius(r: number): void;
  setTrapDoorOpen(id: number, open: boolean): void;
  shadowCasters: Mesh[];
}

function mat(scene: Scene, name: string, hex: string, opts: { emissive?: number; alpha?: number; unlit?: boolean } = {}): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  if (opts.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(opts.emissive);
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  if (opts.unlit) m.disableLighting = true;
  return m;
}

function textTexture(scene: Scene, text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}): DynamicTexture {
  const w = opts.w ?? 512, h = opts.h ?? 256;
  const tex = new DynamicTexture(`txt_${text.slice(0, 8)}`, { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = opts.bg ?? "#1a1030";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.fg ?? "#ffd23f";
  ctx.font = opts.font ?? `bold ${Math.floor(h * 0.3)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * h * 0.32, w * 0.94));
  tex.update();
  return tex;
}

export function buildArena(scene: Scene, layout: ArenaLayout, q: QualityParams): ArenaHandles {
  const root = new TransformNode("arena", scene);
  const animated: Array<(dt: number, t: number) => void> = [];
  const shadowCasters: Mesh[] = [];
  const staticMeshes: Mesh[] = [];

  // ---------- floor with painted zones ----------
  const floorTex = new DynamicTexture("floor", { width: 1024, height: 1024 }, scene, true);
  {
    const ctx = floorTex.getContext() as unknown as CanvasRenderingContext2D;
    const toPx = (x: number, z: number): [number, number] => [((x + 32) / 64) * 1024, ((32 - z) / 64) * 1024];
    // hardwood court base
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, "#c89a5f");
    grad.addColorStop(1, "#b0824a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    // planks
    ctx.strokeStyle = "rgba(90,60,30,0.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 26);
      ctx.lineTo(1024, i * 26);
      ctx.stroke();
    }
    // zone tints
    const zones: Array<[string, number, number, number]> = [
      ["rgba(64,110,220,0.20)", 0, 21, 200],   // stage
      ["rgba(220,120,40,0.18)", 22, 0, 190],   // bar
      ["rgba(120,200,90,0.16)", 0, -21, 200],  // war room
      ["rgba(180,80,200,0.16)", -22, 0, 190],  // lockers
      ["rgba(240,80,120,0.2)", 22, 21, 150],   // game show
    ];
    for (const [color, zx, zz, r] of zones) {
      const [px, pz] = toPx(zx, zz);
      const g = ctx.createRadialGradient(px, pz, 10, px, pz, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 1024);
    }
    // subtle wear: scuff marks so the court doesn't read as flat plastic
    ctx.strokeStyle = "rgba(40,25,12,0.12)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 70; i++) {
      const sx = Math.random() * 1024, sy = Math.random() * 1024;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 60, sx + (Math.random() - 0.5) * 90, sy + (Math.random() - 0.5) * 90);
      ctx.stroke();
    }
    // edge vignette: darken toward the dome wall so the floor has depth
    const vg = ctx.createRadialGradient(512, 512, 330, 512, 512, 730);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(12,6,28,0.6)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 1024, 1024);
    // court lines
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(512, 512, 130, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(512, 512, 440, 0, Math.PI * 2);
    ctx.stroke();
    // center logo
    ctx.fillStyle = "rgba(30,18,60,0.85)";
    ctx.beginPath();
    ctx.arc(512, 512, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SMASH", 512, 500);
    ctx.fillText("DOME", 512, 548);
    floorTex.update();
  }
  const floorMat = new StandardMaterial("floorMat", scene);
  floorMat.diffuseTexture = floorTex;
  floorMat.specularColor = new Color3(0.12, 0.1, 0.08);
  const floor = MeshBuilder.CreateGround("floor", { width: 64, height: 64 }, scene);
  floor.material = floorMat;
  floor.receiveShadows = true;
  floor.parent = root;
  staticMeshes.push(floor);

  // ---------- dome wall + crowd ----------
  const crowdTex = new DynamicTexture("crowd", { width: 1024, height: 256 }, scene, true);
  {
    const ctx = crowdTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "#180d33";
    ctx.fillRect(0, 0, 1024, 256);
    // tiered crowd silhouettes
    for (let row = 0; row < 4; row++) {
      const y = 210 - row * 46;
      ctx.fillStyle = `rgba(${40 + row * 18},${30 + row * 14},${80 + row * 20},0.9)`;
      for (let x = 0; x < 1024; x += 18) {
        const h = 16 + Math.random() * 10;
        ctx.beginPath();
        ctx.arc(x + 9, y, 8, Math.PI, 0);
        ctx.rect(x + 1, y, 16, h);
        ctx.fill();
      }
    }
    // scattered phone lights
    if (q.crowdDetail) {
      ctx.fillStyle = "#ffe9a3";
      for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * 1024, 40 + Math.random() * 160, 3, 3);
    }
    crowdTex.update();
  }
  const wallMat = new StandardMaterial("wallMat", scene);
  wallMat.diffuseTexture = crowdTex;
  wallMat.emissiveColor = new Color3(0.35, 0.3, 0.5);
  wallMat.backFaceCulling = false;
  const wall = MeshBuilder.CreateCylinder("domeWall", { diameter: 78, height: 14, tessellation: 40, cap: Mesh.NO_CAP }, scene);
  wall.material = wallMat;
  wall.position.y = 7;
  wall.parent = root;
  staticMeshes.push(wall);

  // dome ring lights
  const ringMat = mat(scene, "ringMat", "#ff5f9e", { emissive: 0.9, unlit: true });
  const ring = MeshBuilder.CreateTorus("domeRing", { diameter: 74, thickness: 0.35, tessellation: 48 }, scene);
  ring.material = ringMat;
  ring.position.y = 13.5;
  ring.parent = root;

  // ---------- night-sky dome backdrop ----------
  // Wide shots used to fall off into flat clear-color; this puts a starfield
  // and horizon glow behind everything instead.
  const skyTex = new DynamicTexture("skyTex", { width: 512, height: 512 }, scene, true);
  {
    const ctx = skyTex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#05020e");
    grad.addColorStop(0.55, "#140a30");
    grad.addColorStop(0.8, "#2c1257");
    grad.addColorStop(1, "#4d1f6e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 240; i++) {
      const y = Math.random() * 400;
      const s = Math.random() < 0.12 ? 2.4 : 1.3;
      ctx.fillStyle = `rgba(255,255,${Math.random() < 0.3 ? 210 : 255},${0.35 + Math.random() * 0.6})`;
      ctx.fillRect(Math.random() * 512, y, s, s);
    }
    skyTex.update();
  }
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.emissiveTexture = skyTex;
  skyMat.diffuseColor = Color3.Black();
  skyMat.specularColor = Color3.Black();
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = false;
  const sky = MeshBuilder.CreateSphere("skyDome", { diameter: 150, segments: 12, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.material = skyMat;
  sky.position.y = 0;
  sky.isPickable = false;
  sky.parent = root;
  sky.freezeWorldMatrix();

  // ---------- prop builders by kind ----------
  const wood = mat(scene, "wood", "#8a5a2e");
  const woodDark = mat(scene, "woodDark", "#5f3d1d");
  const metal = mat(scene, "metal", "#9aa4b2");
  const metalDark = mat(scene, "metalDark", "#5b636e");
  const plasticWhite = mat(scene, "plasticW", "#e8e4da");
  const red = mat(scene, "redMat", "#d43d3d");
  const stageMat = mat(scene, "stageMat", "#3a2a6e");
  const stageTrim = mat(scene, "stageTrim", "#ffd23f", { emissive: 0.5 });
  const screenMats: StandardMaterial[] = [];

  const simpleBox = (b: ArenaBox, material: StandardMaterial): Mesh => {
    const m = MeshBuilder.CreateBox(`box_${b.kind}`, { width: b.w, depth: b.d, height: b.h }, scene);
    m.material = material;
    m.position.set(b.x, (b.y ?? 0) + b.h / 2, b.z);
    m.parent = root;
    m.receiveShadows = true;
    shadowCasters.push(m);
    staticMeshes.push(m);
    return m;
  };

  const makeTv = (w: number, h: number): { mesh: Mesh; mat: StandardMaterial } => {
    const tvMat = new StandardMaterial("tv", scene);
    const tvTex = new DynamicTexture("tvTex", { width: 128, height: 72 }, scene, false);
    tvMat.emissiveTexture = tvTex;
    tvMat.diffuseColor = Color3.Black();
    tvMat.disableLighting = true;
    const redraw = (): void => {
      const ctx = tvTex.getContext() as unknown as CanvasRenderingContext2D;
      const hue = Math.floor(Math.random() * 360);
      ctx.fillStyle = `hsl(${hue},60%,25%)`;
      ctx.fillRect(0, 0, 128, 72);
      ctx.fillStyle = `hsl(${(hue + 120) % 360},80%,60%)`;
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.random() * 118, Math.random() * 62, 12 + Math.random() * 30, 5 + Math.random() * 8);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(["DRAFT DAY", "LIVE", "CHAOS 99%", "TRADE?", "BREAKING"][Math.floor(Math.random() * 5)] ?? "LIVE", 8, 18);
      tvTex.update();
    };
    redraw();
    let acc = Math.random();
    if (q.animatedProps) {
      animated.push((dt) => {
        acc += dt;
        if (acc > 0.9) {
          acc = 0;
          redraw();
        }
      });
    }
    const mesh = MeshBuilder.CreatePlane("tvScreen", { width: w, height: h }, scene);
    mesh.material = tvMat;
    screenMats.push(tvMat);
    return { mesh, mat: tvMat };
  };

  for (const b of layout.boxes) {
    switch (b.kind) {
      case "stageFloor": {
        const m = simpleBox(b, stageMat);
        void m;
        // LED edge strips around the stage rim
        const trimY = (b.y ?? 0) + b.h + 0.02;
        for (const [tw, td, tx, tz] of [
          [b.w + 0.1, 0.18, 0, -b.d / 2],
          [b.w + 0.1, 0.18, 0, b.d / 2],
          [0.18, b.d + 0.1, -b.w / 2, 0],
          [0.18, b.d + 0.1, b.w / 2, 0],
        ] as const) {
          const trim = MeshBuilder.CreateBox("stageLed", { width: tw, depth: td, height: 0.1 }, scene);
          trim.material = stageTrim;
          trim.position.set(b.x + tx, trimY, b.z + tz);
          trim.parent = root;
        }
        break;
      }
      case "stageStep":
      case "stageRamp":
        simpleBox(b, stageMat);
        break;
      case "draftBoard": {
        simpleBox(b, woodDark);
        const boardTex = textTexture(scene, "ROUND 1 — THE DRAFT BOARD", { w: 1024, h: 512, bg: "#101a3a", fg: "#ffe9a3" });
        {
          const ctx = boardTex.getContext() as unknown as CanvasRenderingContext2D;
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 3;
          for (let c = 0; c < 6; c++)
            for (let r = 0; r < 2; r++) {
              ctx.strokeRect(30 + c * 162, 180 + r * 140, 150, 120);
              ctx.fillStyle = ["#e23d3d", "#3d6de2", "#4ed24e", "#e8b23a", "#9b4fe0", "#f07f2d"][c] ?? "#888";
              ctx.fillRect(36 + c * 162, 186 + r * 140, 138, 30);
            }
          boardTex.update();
        }
        const boardMat = new StandardMaterial("draftBoardMat", scene);
        boardMat.emissiveTexture = boardTex;
        boardMat.diffuseColor = Color3.Black();
        boardMat.disableLighting = true;
        const face = MeshBuilder.CreatePlane("draftBoardFace", { width: b.w * 0.94, height: b.h * 0.85 }, scene);
        face.material = boardMat;
        face.position.set(b.x, (b.y ?? 0) + b.h / 2 + 0.2, b.z - b.d / 2 - 0.03);
        face.rotation.y = Math.PI;
        face.parent = root;
        break;
      }
      case "podium": case "hostPodium": {
        const base = MeshBuilder.CreateCylinder("podium", { diameterTop: b.w * 0.9, diameterBottom: b.w * 0.6, height: b.h }, scene);
        base.material = woodDark;
        base.position.set(b.x, (b.y ?? 0) + b.h / 2, b.z);
        base.parent = root;
        shadowCasters.push(base);
        const micro = MeshBuilder.CreateSphere("mic", { diameter: 0.12 }, scene);
        micro.material = metalDark;
        micro.position.set(b.x, (b.y ?? 0) + b.h + 0.25, b.z);
        micro.parent = root;
        break;
      }
      case "speaker": {
        const sp = simpleBox(b, metalDark);
        void sp;
        for (let i = 0; i < 2; i++) {
          const cone = MeshBuilder.CreateCylinder("spkCone", { diameter: 0.7 - i * 0.25, height: 0.05 }, scene);
          cone.material = metal;
          cone.rotation.x = Math.PI / 2;
          cone.position.set(b.x, (b.y ?? 0) + 0.7 + i * 1.0, b.z - b.d / 2 - 0.03);
          cone.parent = root;
        }
        break;
      }
      case "barCounter": {
        simpleBox(b, wood);
        const top = MeshBuilder.CreateBox("barTop", { width: b.w + 0.3, depth: b.d + 0.3, height: 0.08 }, scene);
        top.material = woodDark;
        top.position.set(b.x, b.h + 0.04, b.z);
        top.parent = root;
        // cups on the bar (breakable-looking dressing)
        for (let i = 0; i < 5; i++) {
          const cup = MeshBuilder.CreateCylinder(`cup${i}`, { diameterTop: 0.14, diameterBottom: 0.1, height: 0.18 }, scene);
          cup.material = i % 2 ? red : plasticWhite;
          cup.position.set(b.x + (Math.random() - 0.5) * 0.8, b.h + 0.17, b.z + (i - 2) * 2.4);
          cup.parent = root;
        }
        break;
      }
      case "backBar": {
        simpleBox(b, woodDark);
        // neon sign
        const neonTex = textTexture(scene, "THE WAIVER\nWIRE BAR", { bg: "#0c0620", fg: "#57e6ff" });
        const neonMat = new StandardMaterial("neon", scene);
        neonMat.emissiveTexture = neonTex;
        neonMat.disableLighting = true;
        neonMat.diffuseColor = Color3.Black();
        const neon = MeshBuilder.CreatePlane("neonSign", { width: 4, height: 2 }, scene);
        neon.material = neonMat;
        neon.position.set(b.x - b.w / 2 - 0.05, b.h - 0.6, b.z);
        neon.rotation.y = Math.PI / 2;
        neon.parent = root;
        if (q.animatedProps) {
          let flick = 0;
          animated.push((dt) => {
            flick += dt;
            neonMat.alpha = flick % 3 > 2.82 ? 0.35 : 1;
          });
        }
        // bottles
        for (let i = 0; i < 8; i++) {
          const bottle = MeshBuilder.CreateCylinder(`bottle${i}`, { diameter: 0.14, height: 0.45 }, scene);
          bottle.material = [red, metal, stageTrim][i % 3] ?? metal;
          bottle.position.set(b.x, b.h + 0.22, b.z - b.d / 2 + 0.8 + i * 1.6);
          bottle.parent = root;
        }
        // TVs above
        for (let i = 0; i < 3; i++) {
          const { mesh } = makeTv(2.2, 1.3);
          mesh.position.set(b.x - b.w / 2 - 0.06, b.h + 1.6, b.z - 4 + i * 4);
          mesh.rotation.y = Math.PI / 2;
          mesh.parent = root;
        }
        break;
      }
      case "stool": {
        const seat = MeshBuilder.CreateCylinder("stool", { diameter: b.w, height: 0.1 }, scene);
        seat.material = red;
        seat.position.set(b.x, b.h, b.z);
        seat.parent = root;
        const leg = MeshBuilder.CreateCylinder("stoolLeg", { diameter: 0.08, height: b.h }, scene);
        leg.material = metalDark;
        leg.position.set(b.x, b.h / 2, b.z);
        leg.parent = root;
        shadowCasters.push(seat);
        break;
      }
      case "kitchenPass": {
        simpleBox(b, plasticWhite);
        // steam
        break;
      }
      case "foldingTable": {
        const top = MeshBuilder.CreateBox("tableTop", { width: b.w, depth: b.d, height: 0.08 }, scene);
        top.material = plasticWhite;
        top.position.set(b.x, b.h - 0.04, b.z);
        top.parent = root;
        shadowCasters.push(top);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const leg = MeshBuilder.CreateCylinder("tblLeg", { diameter: 0.07, height: b.h - 0.08 }, scene);
          leg.material = metalDark;
          leg.position.set(b.x + (sx ?? 1) * (b.w / 2 - 0.15), (b.h - 0.08) / 2, b.z + (sz ?? 1) * (b.d / 2 - 0.15));
          leg.parent = root;
        }
        // laptop + pizza box on top
        const laptop = MeshBuilder.CreateBox("laptop", { width: 0.5, depth: 0.35, height: 0.04 }, scene);
        laptop.material = metalDark;
        laptop.position.set(b.x - b.w * 0.2, b.h + 0.02, b.z);
        laptop.parent = root;
        const lid = MeshBuilder.CreateBox("laptopLid", { width: 0.5, depth: 0.02, height: 0.32 }, scene);
        lid.material = metalDark;
        lid.position.set(b.x - b.w * 0.2, b.h + 0.16, b.z - 0.18);
        lid.rotation.x = -0.3;
        lid.parent = root;
        const pizza = MeshBuilder.CreateBox("pizzaBox", { width: 0.55, depth: 0.55, height: 0.07 }, scene);
        pizza.material = mat(scene, "pizzaBox", "#d9b98c");
        pizza.position.set(b.x + b.w * 0.25, b.h + 0.04, b.z + 0.1);
        pizza.rotation.y = 0.4;
        pizza.parent = root;
        break;
      }
      case "beanbag": {
        const bag = MeshBuilder.CreateSphere("beanbag", { diameterX: b.w, diameterY: b.h * 2, diameterZ: b.d }, scene);
        bag.material = [red, stageMat, mat(scene, "bb", "#4ed24e")][Math.floor(Math.random() * 3)] ?? red;
        bag.position.set(b.x, b.h * 0.6, b.z);
        bag.scaling.y = 0.6;
        bag.parent = root;
        shadowCasters.push(bag);
        break;
      }
      case "whiteboard": {
        simpleBox(b, metalDark);
        const wbTex = new DynamicTexture("wb", { width: 512, height: 256 }, scene, true);
        const ctx = wbTex.getContext() as unknown as CanvasRenderingContext2D;
        ctx.fillStyle = "#f4f4ef";
        ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = "#d43d3d";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(40, 200);
        ctx.lineTo(180, 60);
        ctx.lineTo(300, 160);
        ctx.lineTo(470, 40);
        ctx.stroke();
        ctx.fillStyle = "#2b3a8f";
        ctx.font = "bold 34px system-ui";
        ctx.fillText("DO NOT DRAFT A KICKER", 30, 40);
        ctx.font = "26px system-ui";
        ctx.fillText("(seriously, Kevin)", 150, 230);
        wbTex.update();
        const wbMat = new StandardMaterial("wbMat", scene);
        wbMat.diffuseTexture = wbTex;
        wbMat.emissiveColor = new Color3(0.4, 0.4, 0.4);
        const face = MeshBuilder.CreatePlane("wbFace", { width: b.w * 0.9, height: b.h * 0.6 }, scene);
        face.material = wbMat;
        face.position.set(b.x, b.h * 0.55, b.z + b.d / 2 + 0.03);
        face.parent = root;
        break;
      }
      case "trophyShelf": {
        simpleBox(b, woodDark);
        for (let i = 0; i < 4; i++) {
          const base = MeshBuilder.CreateBox("trBase", { width: 0.16, depth: 0.16, height: 0.1 }, scene);
          base.material = woodDark;
          base.position.set(b.x - b.w / 2 + 0.6 + i * 1.2, b.h + 0.05, b.z);
          base.parent = root;
          const cupMesh = MeshBuilder.CreateCylinder("trCup", { diameterTop: 0.2, diameterBottom: 0.08, height: 0.24 }, scene);
          cupMesh.material = stageTrim;
          cupMesh.position.set(base.position.x, b.h + 0.25, b.z);
          cupMesh.parent = root;
        }
        break;
      }
      case "pizzaStack": {
        for (let i = 0; i < 4; i++) {
          const box = MeshBuilder.CreateBox(`pz${i}`, { width: b.w, depth: b.d, height: 0.16 }, scene);
          box.material = mat(scene, "pzc", "#d9b98c");
          box.position.set(b.x + (Math.random() - 0.5) * 0.15, 0.1 + i * 0.18, b.z + (Math.random() - 0.5) * 0.15);
          box.rotation.y = Math.random() * 0.5;
          box.parent = root;
          shadowCasters.push(box);
        }
        break;
      }
      case "lockers": {
        simpleBox(b, metal);
        // vents/doors detail via texture lines
        for (let i = 0; i < 8; i++) {
          const door = MeshBuilder.CreatePlane(`locker${i}`, { width: 0.02, height: b.h * 0.9 }, scene);
          void door;
        }
        const lineTex = new DynamicTexture("lockerTex", { width: 128, height: 512 }, scene, true);
        const lctx = lineTex.getContext() as unknown as CanvasRenderingContext2D;
        lctx.fillStyle = "#7f8b99";
        lctx.fillRect(0, 0, 128, 512);
        lctx.strokeStyle = "#57616c";
        lctx.lineWidth = 4;
        for (let i = 0; i < 9; i++) {
          lctx.strokeRect(4, 4 + i * 56, 120, 52);
          lctx.fillStyle = "#3f4750";
          lctx.fillRect(96, 22 + i * 56, 18, 8);
          lctx.fillStyle = "#7f8b99";
        }
        lineTex.update();
        const lockerFaceMat = new StandardMaterial("lockerFace", scene);
        lockerFaceMat.diffuseTexture = lineTex;
        const face = MeshBuilder.CreatePlane("lockerFacePlane", { width: b.d, height: b.h }, scene);
        face.material = lockerFaceMat;
        face.position.set(b.x + b.w / 2 + 0.02, b.h / 2, b.z);
        face.rotation.y = -Math.PI / 2;
        face.parent = root;
        break;
      }
      case "bench": simpleBox(b, wood); break;
      case "laundryCart": {
        simpleBox(b, plasticWhite);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const wheel = MeshBuilder.CreateSphere("wheel", { diameter: 0.16 }, scene);
          wheel.material = metalDark;
          wheel.position.set(b.x + (sx ?? 1) * b.w * 0.4, 0.08, b.z + (sz ?? 1) * b.d * 0.4);
          wheel.parent = root;
        }
        break;
      }
      case "waterCooler": {
        const baseMesh = MeshBuilder.CreateBox("cooler", { width: b.w, depth: b.d, height: b.h * 0.7 }, scene);
        baseMesh.material = plasticWhite;
        baseMesh.position.set(b.x, b.h * 0.35, b.z);
        baseMesh.parent = root;
        const jug = MeshBuilder.CreateCylinder("jug", { diameter: b.w * 0.7, height: b.h * 0.35 }, scene);
        jug.material = mat(scene, "jugMat", "#57c8e6", { alpha: 0.7 });
        jug.position.set(b.x, b.h * 0.85, b.z);
        jug.parent = root;
        shadowCasters.push(baseMesh);
        break;
      }
      case "gearBag": simpleBox(b, stageMat); break;
      case "waiverWheel": {
        const pole = MeshBuilder.CreateCylinder("wheelPole", { diameter: 0.2, height: b.h }, scene);
        pole.material = metalDark;
        pole.position.set(b.x, b.h / 2, b.z);
        pole.parent = root;
        const wheelTex = new DynamicTexture("wheelTex", { width: 256, height: 256 }, scene, true);
        const wctx = wheelTex.getContext() as unknown as CanvasRenderingContext2D;
        const segs = ["#e23d3d", "#e8b23a", "#4ed24e", "#3d6de2", "#9b4fe0", "#f07f2d", "#54c8e8", "#ef6fb2"];
        segs.forEach((c, i) => {
          wctx.fillStyle = c;
          wctx.beginPath();
          wctx.moveTo(128, 128);
          wctx.arc(128, 128, 126, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
          wctx.fill();
        });
        wheelTex.update();
        const wheelMat = new StandardMaterial("wheelMat", scene);
        wheelMat.diffuseTexture = wheelTex;
        wheelMat.emissiveColor = new Color3(0.35, 0.35, 0.35);
        const wheel = MeshBuilder.CreateCylinder("bigWheel", { diameter: 2.6, height: 0.15 }, scene);
        wheel.material = wheelMat;
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(b.x, b.h * 0.75, b.z);
        wheel.parent = root;
        shadowCasters.push(wheel);
        if (q.animatedProps) animated.push((dt) => (wheel.rotation.y += dt * 1.4));
        break;
      }
      case "prizeDisplay": {
        simpleBox(b, stageMat);
        const glowBox = MeshBuilder.CreateBox("prizeGlow", { width: b.w * 0.6, depth: b.d * 0.5, height: 0.7 }, scene);
        glowBox.material = mat(scene, "prizeMat", "#ffd23f", { emissive: 0.8 });
        glowBox.position.set(b.x, b.h + 0.35, b.z);
        glowBox.parent = root;
        if (q.animatedProps) animated.push((dt, t) => (glowBox.rotation.y = t * 0.8));
        break;
      }
      case "buzzer": {
        const base = MeshBuilder.CreateCylinder("buzzBase", { diameter: b.w, height: b.h * 0.6 }, scene);
        base.material = metalDark;
        base.position.set(b.x, b.h * 0.3, b.z);
        base.parent = root;
        const dome = MeshBuilder.CreateSphere("buzzDome", { diameter: b.w * 0.8, slice: 0.5 }, scene);
        dome.material = mat(scene, "buzzMat", "#e23d3d", { emissive: 0.5 });
        dome.position.set(b.x, b.h * 0.6, b.z);
        dome.parent = root;
        break;
      }
      case "pillar": {
        const p = MeshBuilder.CreateCylinder("pillar", { diameter: b.w, height: b.h }, scene);
        p.material = stageMat;
        p.position.set(b.x, b.h / 2, b.z);
        p.parent = root;
        p.receiveShadows = true;
        shadowCasters.push(p);
        const pl = MeshBuilder.CreateTorus("pillarLight", { diameter: b.w + 0.15, thickness: 0.08 }, scene);
        pl.material = stageTrim;
        pl.position.set(b.x, b.h - 0.6, b.z);
        pl.parent = root;
        break;
      }
      case "bouncePad": {
        const pad = MeshBuilder.CreateCylinder("bouncePad", { diameter: b.w, height: b.h }, scene);
        const padMat = mat(scene, "padMat", "#57e6ff", { emissive: 0.6 });
        pad.material = padMat;
        pad.position.set(b.x, b.h / 2, b.z);
        pad.parent = root;
        if (q.animatedProps) animated.push((dt, t) => (padMat.emissiveColor = Color3.FromHexString("#57e6ff").scale(0.4 + Math.sin(t * 4 + b.x) * 0.25)));
        break;
      }
      case "centerLogo": break; // painted on the floor texture
      case "crate": simpleBox(b, wood); break;
      case "railing": {
        const rail = MeshBuilder.CreateBox("rail", { width: b.w, depth: b.d, height: 0.08 }, scene);
        rail.material = metal;
        rail.position.set(b.x, b.h, b.z);
        rail.parent = root;
        const count = Math.floor(Math.max(b.w, b.d) / 2);
        for (let i = 0; i <= count; i++) {
          const post = MeshBuilder.CreateCylinder("post", { diameter: 0.07, height: b.h }, scene);
          post.material = metal;
          const along = i / count - 0.5;
          post.position.set(b.x + (b.w > b.d ? along * b.w : 0), b.h / 2, b.z + (b.d > b.w ? along * b.d : 0));
          post.parent = root;
        }
        break;
      }
      case "servingTray": simpleBox(b, metal); break;
      default:
        simpleBox(b, wood);
    }
  }

  // ---------- ceiling: trusses, fans, spotlights, banners ----------
  const trussMat = mat(scene, "truss", "#3c4250");
  for (const z of [-14, 0, 14]) {
    const truss = MeshBuilder.CreateBox("truss", { width: 58, height: 0.5, depth: 0.5 }, scene);
    truss.material = trussMat;
    truss.position.set(0, 12.5, z);
    truss.parent = root;
  }
  // spotlight cones (emissive, no real light cost)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cone = MeshBuilder.CreateCylinder("spotCone", { diameterTop: 0.5, diameterBottom: 3.2, height: 9 }, scene);
    const coneMat = mat(scene, "spotConeMat", i % 2 ? "#ffe9a3" : "#c4e3ff", { alpha: 0.07, emissive: 0.8, unlit: true });
    cone.material = coneMat;
    cone.position.set(Math.cos(a) * 16, 8, Math.sin(a) * 16);
    cone.rotation.x = 0.25 * Math.sin(a);
    cone.rotation.z = 0.25 * Math.cos(a);
    cone.parent = root;
    if (q.animatedProps) {
      animated.push((dt, t) => {
        cone.rotation.x = 0.3 * Math.sin(t * 0.5 + i);
        cone.rotation.z = 0.3 * Math.cos(t * 0.4 + i * 2);
      });
    }
  }
  // ceiling fans over the war room
  for (const [fx, fz] of [[-6, -19], [8, -16]]) {
    const hub = MeshBuilder.CreateCylinder("fanHub", { diameter: 0.3, height: 0.3 }, scene);
    hub.material = metalDark;
    hub.position.set(fx ?? 0, 11.5, fz ?? 0);
    hub.parent = root;
    const bladeRoot = new TransformNode("fanBlades", scene);
    bladeRoot.parent = root;
    bladeRoot.position.set(fx ?? 0, 11.4, fz ?? 0);
    for (let i = 0; i < 4; i++) {
      const blade = MeshBuilder.CreateBox("fanBlade", { width: 1.6, height: 0.04, depth: 0.3 }, scene);
      blade.material = woodDark;
      blade.parent = bladeRoot;
      const a = (i / 4) * Math.PI * 2;
      blade.rotation.y = a;
      blade.position.set(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8);
    }
    if (q.animatedProps) animated.push((dt) => (bladeRoot.rotation.y += dt * 5));
  }
  // hanging banners
  const bannerTexts = ["SMASH DOME", "DRAFT NIGHT LIVE", "12 ENTER · 1 PICKS FIRST", "NO REFUNDS"];
  bannerTexts.forEach((txt, i) => {
    const tex = textTexture(scene, txt, { w: 512, h: 170, bg: ["#3a2a6e", "#8f1f4b", "#1d5c46", "#7a3b12"][i] ?? "#333", fg: "#ffe9a3" });
    const bMat = new StandardMaterial(`banner${i}`, scene);
    bMat.diffuseTexture = tex;
    bMat.emissiveColor = new Color3(0.45, 0.45, 0.45);
    bMat.backFaceCulling = false;
    const banner = MeshBuilder.CreatePlane(`bannerP${i}`, { width: 7, height: 2.4 }, scene);
    banner.material = bMat;
    const a = (i / bannerTexts.length) * Math.PI * 2 + 0.5;
    banner.position.set(Math.cos(a) * 26, 9.5, Math.sin(a) * 26);
    banner.rotation.y = -a - Math.PI / 2;
    banner.parent = root;
    if (q.animatedProps) animated.push((dt, t) => (banner.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.05));
  });

  // ---------- trap doors ----------
  const trapDoorMeshes = new Map<number, Mesh>();
  for (const td of layout.trapDoors) {
    const door = MeshBuilder.CreateCylinder(`trap${td.id}`, { diameter: td.radius * 2, height: 0.06 }, scene);
    const tdMat = mat(scene, "trapMat", "#4a2c14");
    door.material = tdMat;
    door.position.set(td.x, 0.03, td.z);
    door.parent = root;
    const rim = MeshBuilder.CreateTorus(`trapRim${td.id}`, { diameter: td.radius * 2 + 0.15, thickness: 0.09 }, scene);
    rim.material = mat(scene, "trapRim", "#e8b23a", { emissive: 0.35 });
    rim.position.set(td.x, 0.05, td.z);
    rim.parent = root;
    trapDoorMeshes.set(td.id, door);
  }

  // ---------- Auto-Draft zone wall ----------
  const zoneTex = textTexture(scene, "AUTO-DRAFT  ·  AUTO-DRAFT  ·  AUTO-DRAFT", { w: 1024, h: 128, bg: "#33060a", fg: "#ff4c4c" });
  const zoneMat = new StandardMaterial("zoneMat", scene);
  zoneMat.emissiveTexture = zoneTex;
  zoneMat.diffuseColor = Color3.Black();
  zoneMat.alpha = 0.4;
  zoneMat.disableLighting = true;
  zoneMat.backFaceCulling = false;
  const zoneWall = MeshBuilder.CreateCylinder("zoneWall", { diameter: 2, height: 16, tessellation: 48, cap: Mesh.NO_CAP }, scene);
  zoneWall.material = zoneMat;
  zoneWall.position.y = 8;
  zoneWall.parent = root;
  zoneWall.isPickable = false;
  if (q.animatedProps) {
    animated.push((dt, t) => {
      zoneTex.uOffset = t * 0.05;
      zoneMat.alpha = 0.32 + Math.sin(t * 3) * 0.08;
    });
  }

  // Freeze static meshes for perf
  for (const m of staticMeshes) {
    m.freezeWorldMatrix();
    if (m.material) m.material.freeze();
  }

  let t = 0;
  return {
    root,
    shadowCasters,
    update: (dt) => {
      t += dt;
      for (const fn of animated) fn(dt, t);
    },
    setZoneRadius: (r) => {
      const d = Math.max(0.5, r * 2);
      zoneWall.scaling.x = d / 2;
      zoneWall.scaling.z = d / 2;
    },
    setTrapDoorOpen: (id, open) => {
      const door = trapDoorMeshes.get(id);
      if (door) {
        door.setEnabled(!open);
      }
    },
  };
}
