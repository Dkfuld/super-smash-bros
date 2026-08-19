import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector4,
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
  /** The SMASH AIR blimp, for scripted intro flybys. */
  blimp: TransformNode;
  /** false = the arena's idle orbit stops driving the blimp (caller owns it). */
  setBlimpAuto(auto: boolean): void;
  /** Show (or hide with null) a towed banner behind the blimp. */
  setBlimpBanner(text: string | null): void;
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

  // ---------- floor: pro football field under the party dome ----------
  // Field runs east-west: goal lines at x=±24, end lines at x=±30,
  // sidelines at z=±18. Purely painted — collision layout is untouched.
  const floorTex = new DynamicTexture("floor", { width: 1024, height: 1024 }, scene, true);
  {
    const ctx = floorTex.getContext() as unknown as CanvasRenderingContext2D;
    const toPx = (x: number, z: number): [number, number] => [((x + 32) / 64) * 1024, ((32 - z) / 64) * 1024];
    // stadium apron outside the field
    ctx.fillStyle = "#20351b";
    ctx.fillRect(0, 0, 1024, 1024);
    const [exW, syN] = toPx(-30, 18);
    const [exE, syS] = toPx(30, -18);
    const [gW] = toPx(-24, 0);
    const [gE] = toPx(24, 0);
    // mowing stripes between the goal lines
    const stripe = (gE - gW) / 10;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "#3a7a2e" : "#448a36";
      ctx.fillRect(gW + stripe * i, syN, stripe + 1, syS - syN);
    }
    // end zones in dome purple
    ctx.fillStyle = "#33196b";
    ctx.fillRect(exW, syN, gW - exW, syS - syN);
    ctx.fillRect(gE, syN, exE - gE, syS - syN);
    // turf noise
    for (let i = 0; i < 900; i++) {
      const x = exW + Math.random() * (exE - exW), y = syN + Math.random() * (syS - syN);
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(15,35,12,0.20)" : "rgba(130,160,90,0.10)";
      ctx.fillRect(x, y, 2, 2);
    }
    // yard lines every "5 yards"
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 4;
    for (let i = 1; i < 10; i++) {
      const x = gW + stripe * i;
      ctx.beginPath();
      ctx.moveTo(x, syN);
      ctx.lineTo(x, syS);
      ctx.stroke();
    }
    // hash marks
    ctx.lineWidth = 2;
    for (const hz of [-5.5, 5.5]) {
      const hy = toPx(0, hz)[1];
      for (let x = gW + 15; x < gE; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, hy - 5);
        ctx.lineTo(x, hy + 5);
        ctx.stroke();
      }
    }
    // yard numbers (flipped on the far side, like a broadcast field)
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ["10", "20", "30", "40", "50", "40", "30", "20", "10"].forEach((n, i) => {
      const x = gW + stripe * (i + 1);
      for (const [zz, rot] of [[-13, 0], [13, Math.PI]] as const) {
        const y = toPx(0, zz)[1];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillText(n, 0, 0);
        ctx.restore();
      }
    });
    // goal lines + boundary
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.strokeRect(exW, syN, exE - exW, syS - syN);
    for (const gx of [gW, gE]) {
      ctx.beginPath();
      ctx.moveTo(gx, syN);
      ctx.lineTo(gx, syS);
      ctx.stroke();
    }
    // end zone wordmarks, rotated to run along each end zone
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 72px system-ui, sans-serif";
    ctx.save();
    ctx.translate(toPx(-27, 0)[0], 512);
    ctx.rotate(Math.PI / 2);
    ctx.fillText("SMASH", 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(toPx(27, 0)[0], 512);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("DOME", 0, 0);
    ctx.restore();
    // sideline paint on the aprons
    ctx.fillStyle = "rgba(255,210,63,0.55)";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText("DRAFT NIGHT LIVE", 512, toPx(0, -20.5)[1]);
    ctx.save();
    ctx.translate(512, toPx(0, 20.5)[1]);
    ctx.rotate(Math.PI);
    ctx.fillText("WELCOME TO THE DOME", 0, 0);
    ctx.restore();
    // midfield crest: gold ring + football
    ctx.beginPath();
    ctx.arc(512, 512, 92, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30,18,60,0.92)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#ffd23f";
    ctx.stroke();
    ctx.save();
    ctx.translate(512, 498);
    ctx.fillStyle = "#8a4b23";
    ctx.beginPath();
    ctx.ellipse(0, 0, 52, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f4ead8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    for (let i = -12; i <= 12; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, -5);
      ctx.lineTo(i, 5);
      ctx.stroke();
    }
    ctx.restore();
    // "SMASH DOME ★" written around the crest ring — arc text reads fine
    // from every camera angle, unlike a straight line (which looks like
    // mirror-writing from the far sideline).
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 30px system-ui, sans-serif";
    {
      const ring = "SMASH ★ DOME ★ ";
      const rr = 74;
      for (let i = 0; i < ring.length; i++) {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.translate(512 + Math.cos(a) * rr, 512 + Math.sin(a) * rr);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(ring[i] ?? "", 0, 0);
        ctx.restore();
      }
    }
    // cleat scuffs and big-play skid marks
    ctx.strokeStyle = "rgba(12,28,10,0.28)";
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
    floorTex.update();
  }
  // Anisotropic filtering keeps the yard lines crisp at broadcast angles
  // instead of smearing into mush toward the horizon.
  floorTex.anisotropicFilteringLevel = 8;
  const floorMat = new StandardMaterial("floorMat", scene);
  floorMat.diffuseTexture = floorTex;
  floorMat.specularColor = new Color3(0.05, 0.07, 0.04); // turf, not gym varnish
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
      // D-FENSE letter cards held up in the stands
      ctx.font = "bold 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      for (let s = 0; s < 3; s++) {
        const baseX = 40 + Math.random() * 780;
        "DEFENSE".split("").forEach((ch, i) => {
          ctx.fillStyle = "#f4f4ef";
          ctx.fillRect(baseX + i * 26 - 10, 92, 21, 27);
          ctx.fillStyle = "#b3122e";
          ctx.fillText(ch, baseX + i * 26, 112);
        });
      }
      // gold rally towels
      ctx.fillStyle = "#ffd23f";
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 1024, 60 + Math.random() * 150, 8, 4);
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

  // ---------- goal posts on both end lines ----------
  const postMat = mat(scene, "goalPostMat", "#ffe14a", { emissive: 0.35 });
  const postPadMat = mat(scene, "goalPadMat", "#2c62d4");
  for (const sx of [-1, 1]) {
    const gp = new TransformNode("goalPost", scene);
    gp.parent = root;
    gp.position.set(sx * 30.5, 0, 0);
    const pad = MeshBuilder.CreateCylinder("gpPad", { diameter: 0.95, height: 1.7 }, scene);
    pad.material = postPadMat;
    pad.position.y = 0.85;
    pad.parent = gp;
    const pole = MeshBuilder.CreateCylinder("gpPole", { diameter: 0.4, height: 2.8 }, scene);
    pole.material = postMat;
    pole.position.y = 2.6;
    pole.parent = gp;
    const cross = MeshBuilder.CreateCylinder("gpCross", { diameter: 0.28, height: 6.8 }, scene);
    cross.material = postMat;
    cross.rotation.x = Math.PI / 2;
    cross.position.y = 4.0;
    cross.parent = gp;
    for (const sz of [-1, 1]) {
      const up = MeshBuilder.CreateCylinder("gpUpright", { diameter: 0.24, height: 5.6 }, scene);
      up.material = postMat;
      up.position.set(0, 6.8, sz * 3.3);
      up.parent = gp;
    }
    for (const m of gp.getChildMeshes(false)) {
      shadowCasters.push(m as Mesh);
      staticMeshes.push(m as Mesh);
    }
  }

  // ---------- end zone pylons ----------
  const pylonMat = mat(scene, "pylonMat", "#ff7a1a", { emissive: 0.45 });
  for (const px of [-30, -24, 24, 30]) {
    for (const pz of [-18, 18]) {
      const py = MeshBuilder.CreateBox("pylon", { width: 0.26, depth: 0.26, height: 0.5 }, scene);
      py.material = pylonMat;
      py.position.set(px, 0.25, pz);
      py.parent = root;
      staticMeshes.push(py);
    }
  }

  // ---------- chain gang + down marker on the north sideline ----------
  const chainMat = mat(scene, "chainStickMat", "#ff7a1a", { emissive: 0.3 });
  for (const cx of [-15, -11]) {
    const stick = MeshBuilder.CreateCylinder("chainPole", { diameter: 0.09, height: 2.3 }, scene);
    stick.material = chainMat;
    stick.position.set(cx, 1.15, 19.6);
    stick.parent = root;
    const top = MeshBuilder.CreateCylinder("chainTop", { diameter: 0.5, height: 0.12 }, scene);
    top.material = chainMat;
    top.rotation.x = Math.PI / 2;
    top.position.set(cx, 2.4, 19.6);
    top.parent = root;
  }
  {
    const dmPole = MeshBuilder.CreateCylinder("downPole", { diameter: 0.09, height: 2.5 }, scene);
    dmPole.material = chainMat;
    dmPole.position.set(-13, 1.25, 19.6);
    dmPole.parent = root;
    const dmTex = textTexture(scene, "4TH\n& ∞", { w: 128, h: 128, bg: "#0c0620", fg: "#ff7a1a", font: "bold 40px system-ui, sans-serif" });
    const dmMat = new StandardMaterial("downMarkerMat", scene);
    dmMat.emissiveTexture = dmTex;
    dmMat.diffuseColor = Color3.Black();
    dmMat.disableLighting = true;
    dmMat.backFaceCulling = false;
    const sign = MeshBuilder.CreatePlane("downSign", { width: 0.7, height: 0.7, sideOrientation: Mesh.DOUBLESIDE, backUVs: new Vector4(1, 0, 0, 1) }, scene);
    sign.material = dmMat;
    sign.position.set(-13, 2.7, 19.6);
    sign.rotation.y = Math.PI; // face the field, not the wall
    sign.parent = root;
  }

  // ---------- league blimp circling the rafters ----------
  let blimpAuto = true;
  let towBanner: Mesh | null = null;
  let towTex: DynamicTexture | null = null;
  const blimpRoot = new TransformNode("blimp", scene);
  {
    blimpRoot.parent = root;
    blimpRoot.position.set(23, 12.2, 0);
    const body = MeshBuilder.CreateSphere("blimpBody", { diameterX: 5.2, diameterY: 1.7, diameterZ: 1.7 }, scene);
    body.material = mat(scene, "blimpMat", "#d7dde8", { emissive: 0.18 });
    body.parent = blimpRoot;
    const gondola = MeshBuilder.CreateBox("blimpGondola", { width: 1.1, height: 0.42, depth: 0.5 }, scene);
    gondola.material = mat(scene, "gondolaMat", "#3a2a6e");
    gondola.position.y = -0.95;
    gondola.parent = blimpRoot;
    const finMat = mat(scene, "blimpFinMat", "#8f1f4b");
    const finV = MeshBuilder.CreateBox("blimpFinV", { width: 0.9, height: 1.5, depth: 0.07 }, scene);
    finV.material = finMat;
    finV.position.set(-2.2, 0, 0);
    finV.parent = blimpRoot;
    const finH = MeshBuilder.CreateBox("blimpFinH", { width: 0.9, height: 0.07, depth: 1.5 }, scene);
    finH.material = finMat;
    finH.position.set(-2.2, 0, 0);
    finH.parent = blimpRoot;
    const adTex = textTexture(scene, "SMASH AIR", { w: 512, h: 128, bg: "#d7dde8", fg: "#3a2a6e" });
    for (const s of [-1, 1]) {
      const adMat = new StandardMaterial("blimpAdMat", scene);
      adMat.emissiveTexture = adTex;
      adMat.diffuseColor = Color3.Black();
      adMat.disableLighting = true;
      const ad = MeshBuilder.CreatePlane("blimpAd", { width: 2.7, height: 0.68 }, scene);
      ad.material = adMat;
      ad.position.set(0.2, 0.05, s * 0.88);
      ad.rotation.y = s > 0 ? 0 : Math.PI;
      ad.parent = blimpRoot;
    }
    // Towed roast banner (hidden until the intro asks for it)
    towTex = new DynamicTexture("towBannerTex", { width: 1024, height: 128 }, scene, true);
    const towMat = new StandardMaterial("towBannerMat", scene);
    towMat.emissiveTexture = towTex;
    towMat.diffuseColor = Color3.Black();
    towMat.disableLighting = true;
    towMat.backFaceCulling = false;
    towBanner = MeshBuilder.CreatePlane("towBanner", { width: 7.5, height: 0.95, sideOrientation: Mesh.DOUBLESIDE, backUVs: new Vector4(1, 0, 0, 1) }, scene);
    towBanner.material = towMat;
    towBanner.position.set(-6.6, -0.2, 0);
    towBanner.parent = blimpRoot;
    towBanner.setEnabled(false);
    if (q.animatedProps) {
      animated.push((dt, tt) => {
        if (!blimpAuto) return;
        const a = tt * 0.07;
        blimpRoot.position.set(Math.cos(a) * 23, 12.2 + Math.sin(tt * 0.5) * 0.3, Math.sin(a) * 23);
        blimpRoot.rotation.y = a + Math.PI / 2;
      });
    }
  }

  // ---------- 360° LED ribbon board with league "sponsors" ----------
  {
    const ADS = "  BIG SLICE PIZZA  ★  DRAFT JUICE ZERO  ★  UNCLE RICO'S DEEP BALL ACADEMY  ★  WAIVER WIRE INSURANCE  ★  GRIDIRON GRAVY  ★  KEVIN'S KICKER EMPORIUM  ★  THE COMMISH LAW FIRM: TRUST US  ★  SMASH DOME SEASON TICKETS (SOLD OUT)";
    const ribbonTex = new DynamicTexture("ribbonTex", { width: 2048, height: 64 }, scene, true);
    const c = ribbonTex.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#0b0620";
    c.fillRect(0, 0, 2048, 64);
    c.fillStyle = "#ffd23f";
    c.font = "bold 34px system-ui, sans-serif";
    c.textBaseline = "middle";
    c.fillText(ADS, 8, 34);
    ribbonTex.update();
    ribbonTex.uScale = 2;
    const ribbonMat = new StandardMaterial("ribbonMat", scene);
    ribbonMat.emissiveTexture = ribbonTex;
    ribbonMat.diffuseColor = Color3.Black();
    ribbonMat.disableLighting = true;
    ribbonMat.backFaceCulling = false;
    const ribbon = MeshBuilder.CreateCylinder("adRibbon", { diameter: 75, height: 1.15, tessellation: 48, cap: Mesh.NO_CAP }, scene);
    ribbon.material = ribbonMat;
    ribbon.position.y = 2.35;
    ribbon.parent = root;
    ribbon.isPickable = false;
    if (q.animatedProps) animated.push((dt, tt) => (ribbonTex.uOffset = tt * 0.018));
  }

  // ---------- stadium light masts on the diagonals ----------
  {
    const bankTex = new DynamicTexture("lightBankTex", { width: 128, height: 64 }, scene, true);
    const c = bankTex.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#20242e";
    c.fillRect(0, 0, 128, 64);
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#fff6d0";
        c.beginPath();
        c.arc(20 + i * 30, 18 + r * 28, 10, 0, Math.PI * 2);
        c.fill();
      }
    }
    bankTex.update();
    const bankMat = new StandardMaterial("lightBankMat", scene);
    bankMat.emissiveTexture = bankTex;
    bankMat.diffuseColor = Color3.Black();
    bankMat.disableLighting = true;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const mx = Math.cos(a) * 33.5, mz = Math.sin(a) * 33.5;
      const pole = MeshBuilder.CreateCylinder("lightMast", { diameterTop: 0.32, diameterBottom: 0.55, height: 17 }, scene);
      pole.material = mat(scene, "lightMastMat", "#5b636e");
      pole.position.set(mx, 8.5, mz);
      pole.parent = root;
      staticMeshes.push(pole);
      const bank = MeshBuilder.CreatePlane("lightBank", { width: 2.7, height: 1.3 }, scene);
      bank.material = bankMat;
      bank.position.set(mx * 0.965, 15.9, mz * 0.965);
      // face the arena center, tipped down at the field
      bank.rotation.y = Math.atan2(-mx, -mz) + Math.PI;
      bank.rotation.x = 0.42;
      bank.parent = root;
    }
  }

  // ---------- inflatable helmet team tunnel (south-west arc) ----------
  {
    const tunnelDir = Math.atan2(-24, -24);
    const tx = -24.6, tz = -24.6;
    const shellMat = mat(scene, "tunnelShell", "#b3122e", { emissive: 0.12 });
    const shell = MeshBuilder.CreateSphere("tunnelHelmet", { diameter: 7.4, slice: 0.62, segments: 12 }, scene);
    shell.material = shellMat;
    shell.position.set(tx, 0, tz);
    shell.parent = root;
    shadowCasters.push(shell);
    staticMeshes.push(shell);
    // dark tunnel mouth facing the field
    const mouth = MeshBuilder.CreateDisc("tunnelMouth", { radius: 1.55, tessellation: 24 }, scene);
    mouth.material = mat(scene, "tunnelMouthMat", "#05030c", { unlit: true });
    const mdx = Math.cos(tunnelDir + Math.PI), mdz = Math.sin(tunnelDir + Math.PI);
    mouth.position.set(tx + mdx * 3.35, 1.55, tz + mdz * 3.35);
    mouth.rotation.y = Math.atan2(mdx, mdz);
    mouth.parent = root;
    // facemask bars over the mouth
    const barMat = mat(scene, "tunnelBar", "#e8e4da");
    for (let i = 0; i < 3; i++) {
      const bar = MeshBuilder.CreateCylinder("tunnelFacemask", { diameter: 0.16, height: 4.2 }, scene);
      bar.material = barMat;
      bar.rotation.z = Math.PI / 2;
      bar.rotation.y = Math.atan2(mdx, mdz) + Math.PI / 2;
      bar.position.set(tx + mdx * 3.75, 1.0 + i * 0.75, tz + mdz * 3.75);
      bar.parent = root;
      staticMeshes.push(bar);
    }
    // stripe over the crown
    const stripe = MeshBuilder.CreateTorus("tunnelStripe", { diameter: 7.0, thickness: 0.35, tessellation: 32 }, scene);
    stripe.material = mat(scene, "tunnelStripeMat", "#ffd23f", { emissive: 0.2 });
    stripe.rotation.z = Math.PI / 2;
    stripe.rotation.y = tunnelDir;
    stripe.position.set(tx, 0.4, tz);
    stripe.parent = root;
  }

  // ---------- nets behind both goal posts ----------
  {
    const netTex = new DynamicTexture("netTex", { width: 128, height: 128 }, scene, true);
    const c = netTex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 128, 128);
    c.strokeStyle = "rgba(240,240,255,0.55)";
    c.lineWidth = 2;
    for (let i = 0; i <= 128; i += 12) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 128); c.stroke();
      c.beginPath(); c.moveTo(0, i); c.lineTo(128, i); c.stroke();
    }
    netTex.update();
    netTex.hasAlpha = true;
    const netMat = new StandardMaterial("netMat", scene);
    netMat.diffuseTexture = netTex;
    netMat.opacityTexture = netTex;
    netMat.emissiveColor = new Color3(0.5, 0.5, 0.6);
    netMat.backFaceCulling = false;
    for (const sx of [-1, 1]) {
      const net = MeshBuilder.CreatePlane("goalNet", { width: 7.5, height: 5 }, scene);
      net.material = netMat;
      net.position.set(sx * 33.4, 6.6, 0);
      net.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      net.parent = root;
      net.isPickable = false;
    }
  }

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

  // Football dressing helpers: team helmets and sideline cooler jugs.
  const facemaskMat = mat(scene, "facemaskMat", "#e8e4da");
  const makeHelmet = (color: string, x: number, y: number, z: number): void => {
    const h = new TransformNode("helmet", scene);
    h.parent = root;
    h.position.set(x, y, z);
    h.rotation.y = Math.random() * Math.PI * 2;
    const shell = MeshBuilder.CreateSphere("helmetShell", { diameterX: 0.4, diameterY: 0.36, diameterZ: 0.44 }, scene);
    shell.material = mat(scene, `helmetMat_${color}`, color, { emissive: 0.08 });
    shell.position.y = 0.02;
    shell.parent = h;
    const mask = MeshBuilder.CreateTorus("facemask", { diameter: 0.3, thickness: 0.035, tessellation: 12 }, scene);
    mask.material = facemaskMat;
    mask.position.set(0, -0.06, 0.16);
    mask.rotation.x = 0.5;
    mask.parent = h;
  };
  const makeJug = (color: string, x: number, y: number, z: number): void => {
    const jug = MeshBuilder.CreateCylinder("coolerJug", { diameter: 0.5, height: 0.62 }, scene);
    jug.material = mat(scene, `jugBody_${color}`, color, { emissive: 0.12 });
    jug.position.set(x, y + 0.31, z);
    jug.parent = root;
    const lid = MeshBuilder.CreateCylinder("coolerLid", { diameter: 0.34, height: 0.14 }, scene);
    lid.material = plasticWhite;
    lid.position.set(x, y + 0.68, z);
    lid.parent = root;
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
        // hand-drawn play: X's vs O's with a trick-play scribble
        ctx.fillStyle = "#2b3a8f";
        ctx.font = "bold 30px system-ui";
        ctx.fillText("THE MASTER PLAN", 30, 40);
        ctx.font = "bold 28px system-ui";
        for (let i = 0; i < 5; i++) ctx.fillText("O", 90 + i * 70, 190);
        ctx.fillStyle = "#d43d3d";
        for (let i = 0; i < 5; i++) ctx.fillText("X", 90 + i * 70, 110);
        ctx.strokeStyle = "#d43d3d";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(240, 180);
        ctx.quadraticCurveTo(300, 140, 250, 100);
        ctx.quadraticCurveTo(200, 70, 440, 60);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(440, 60);
        ctx.lineTo(424, 52);
        ctx.moveTo(440, 60);
        ctx.lineTo(430, 76);
        ctx.stroke();
        ctx.fillStyle = "#2b3a8f";
        ctx.font = "24px system-ui";
        ctx.fillText("no kickers (seriously, Kevin)", 110, 236);
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
        // spare helmets stored on top of the lockers
        for (let i = 0; i < 4; i++) {
          makeHelmet(["#d43d3d", "#2c62d4", "#ffd23f", "#4ed24e"][i] ?? "#d43d3d", b.x, b.h + 0.18, b.z - b.d / 2 + 2 + i * 4.5);
        }
        break;
      }
      case "bench": {
        simpleBox(b, wood);
        // game-day bench: helmets resting on it, cooler jug at the end
        const alongZ = b.d > b.w;
        const half = (alongZ ? b.d : b.w) / 2;
        const helmetColors = ["#d43d3d", "#2c62d4", "#ffd23f"];
        for (let i = 0; i < 2; i++) {
          const off = (i === 0 ? -1 : 1) * (half - 1);
          makeHelmet(helmetColors[Math.floor(Math.random() * helmetColors.length)] ?? "#d43d3d", b.x + (alongZ ? 0 : off), b.h + 0.18, b.z + (alongZ ? off : 0));
        }
        if (alongZ) makeJug("#ff7a1a", b.x + 0.9, 0, b.z + half + 0.5);
        else makeJug("#ff7a1a", b.x + half + 0.5, 0, b.z + 0.9);
        break;
      }
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
        // the grand prize: a giant golden football on a pedestal
        const trophy = new TransformNode("trophy", scene);
        trophy.parent = root;
        trophy.position.set(b.x, b.h, b.z);
        const gold = mat(scene, "trophyGold", "#ffd23f", { emissive: 0.55 });
        const ped = MeshBuilder.CreateCylinder("trophyPed", { diameterTop: 0.55, diameterBottom: 0.9, height: 0.45 }, scene);
        ped.material = gold;
        ped.position.y = 0.22;
        ped.parent = trophy;
        const stem = MeshBuilder.CreateCylinder("trophyStem", { diameter: 0.16, height: 0.5 }, scene);
        stem.material = gold;
        stem.position.y = 0.65;
        stem.parent = trophy;
        const ball = MeshBuilder.CreateSphere("trophyBall", { diameterX: 0.6, diameterY: 1.05, diameterZ: 0.6 }, scene);
        ball.material = gold;
        ball.position.y = 1.35;
        ball.parent = trophy;
        if (q.animatedProps) animated.push((dt, t) => (trophy.rotation.y = t * 0.8));
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

  // ---------- stadium videoboards over each end of the bowl ----------
  const jumboLines = [
    "BREAKING: KEVIN EYES KICKER IN RD 1",
    "TRADE RUMOR: NOBODY TRUSTS THE COMMISH",
    "WEATHER: 100% CHANCE OF VIOLENCE",
    "INJURY REPORT: FEELINGS — QUESTIONABLE",
    "VEGAS LINE: DOME FAVORED BY 12",
    "TONIGHT: LAST PLACE PICKS LAST",
  ];
  for (const sz of [-1, 1]) {
    const jTex = new DynamicTexture("jumboTex", { width: 512, height: 224 }, scene, false);
    const jMat = new StandardMaterial("jumboMat", scene);
    jMat.emissiveTexture = jTex;
    jMat.diffuseColor = Color3.Black();
    jMat.disableLighting = true;
    let line = Math.floor(Math.random() * jumboLines.length);
    const drawJumbo = (): void => {
      const c = jTex.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = "#0a0518";
      c.fillRect(0, 0, 512, 224);
      c.fillStyle = "#ffd23f";
      c.font = "bold 46px system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText("SMASH DOME", 256, 58);
      c.fillStyle = "#ff4c6a";
      c.fillRect(20, 84, 472, 4);
      c.fillStyle = "#ffffff";
      c.font = "bold 24px system-ui, sans-serif";
      c.fillText(jumboLines[line % jumboLines.length] ?? "LIVE", 256, 136, 480);
      c.fillStyle = "#ff2d2d";
      c.fillRect(24, 176, 14, 14);
      c.fillStyle = "#c9d4ff";
      c.font = "bold 20px system-ui, sans-serif";
      c.textAlign = "left";
      c.fillText("LIVE — DRAFT NIGHT", 46, 189);
      jTex.update();
    };
    drawJumbo();
    if (q.animatedProps) {
      let acc = 0;
      animated.push((dt) => {
        acc += dt;
        if (acc > 3.2) {
          acc = 0;
          line++;
          drawJumbo();
        }
      });
    }
    const frame = MeshBuilder.CreateBox("jumboFrame", { width: 11.6, height: 5.2, depth: 0.5 }, scene);
    frame.material = metalDark;
    frame.position.set(0, 10.2, sz * 36.5);
    frame.parent = root;
    const screen = MeshBuilder.CreatePlane("jumboScreen", { width: 11, height: 4.6 }, scene);
    screen.material = jMat;
    screen.position.set(0, 10.2, sz * 36.5 - sz * 0.32);
    screen.rotation.y = sz > 0 ? Math.PI : 0;
    screen.parent = root;
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
  const bannerTexts = ["SMASH DOME", "DRAFT NIGHT LIVE", "4TH & FOREVER", "D-FENSE! D-FENSE!", "12 ENTER · 1 PICKS FIRST", "COMMISH IS CORRUPT"];
  bannerTexts.forEach((txt, i) => {
    const tex = textTexture(scene, txt, { w: 512, h: 170, bg: ["#3a2a6e", "#8f1f4b", "#1d5c46", "#7a3b12", "#14406b", "#5c1030"][i] ?? "#333", fg: "#ffe9a3" });
    const bMat = new StandardMaterial(`banner${i}`, scene);
    bMat.diffuseTexture = tex;
    bMat.emissiveColor = new Color3(0.45, 0.45, 0.45);
    // Double-sided with mirrored back UVs so the text reads correctly from
    // BOTH sides — a plain backFaceCulling=false plane shows mirror writing.
    const banner = MeshBuilder.CreatePlane(`bannerP${i}`, { width: 7, height: 2.4, sideOrientation: Mesh.DOUBLESIDE, backUVs: new Vector4(1, 0, 0, 1) }, scene);
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
    blimp: blimpRoot,
    setBlimpAuto: (auto) => {
      blimpAuto = auto;
    },
    setBlimpBanner: (text) => {
      if (!towBanner || !towTex) return;
      if (text === null) {
        towBanner.setEnabled(false);
        return;
      }
      const c = towTex.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = "#f4ead8";
      c.fillRect(0, 0, 1024, 128);
      c.fillStyle = "#b3122e";
      c.fillRect(0, 0, 14, 128);
      c.fillRect(1010, 0, 14, 128);
      c.fillStyle = "#1d1236";
      c.font = "bold 58px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, 512, 68, 960);
      towTex.update();
      towBanner.setEnabled(true);
    },
  };
}
