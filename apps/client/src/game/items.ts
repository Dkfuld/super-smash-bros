import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import { RARITY_COLORS, getWeapon } from "@ddd/shared";

/** Stylized meshes for weapons (in-hand), projectiles, and supply drops. */

function mat(scene: Scene, hex: string, emissive = 0, alpha = 1): StandardMaterial {
  const key = `im_${hex}_${emissive}_${alpha}`;
  const existing = scene.getMaterialByName(key);
  if (existing) return existing as StandardMaterial;
  const m = new StandardMaterial(key, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  if (emissive > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  if (alpha < 1) m.alpha = alpha;
  return m;
}

function merge(scene: Scene, name: string, parts: Mesh[]): Mesh {
  const m = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  if (m) {
    m.name = name;
    return m;
  }
  return parts[0] ?? MeshBuilder.CreateBox(name, { size: 0.1 }, scene);
}

/** In-hand weapon mesh, oriented to be gripped (handle at origin, pointing up). */
export function buildWeaponMesh(scene: Scene, weaponId: string): Mesh | null {
  const B = MeshBuilder;
  switch (weaponId) {
    case "inflatable_mallet": {
      const handle = B.CreateCylinder("h", { diameter: 0.07, height: 0.7 }, scene);
      handle.material = mat(scene, "#e8e4da");
      handle.position.y = 0.35;
      const head = B.CreateCylinder("m", { diameter: 0.42, height: 0.55 }, scene);
      head.material = mat(scene, "#ff5f9e", 0.15);
      head.rotation.z = Math.PI / 2;
      head.position.y = 0.75;
      return merge(scene, "wpn", [handle, head]);
    }
    case "pool_noodle": {
      const noodle = B.CreateCylinder("n", { diameter: 0.12, height: 1.1 }, scene);
      noodle.material = mat(scene, "#57e6ff", 0.2);
      noodle.position.y = 0.55;
      noodle.rotation.x = 0.15;
      return noodle;
    }
    case "folding_chair": {
      const seat = B.CreateBox("s", { width: 0.42, depth: 0.42, height: 0.04 }, scene);
      seat.material = mat(scene, "#9aa4b2");
      seat.position.y = 0.45;
      const back = B.CreateBox("b", { width: 0.42, depth: 0.04, height: 0.45 }, scene);
      back.material = mat(scene, "#9aa4b2");
      back.position.set(0, 0.68, -0.2);
      return merge(scene, "wpn", [seat, back]);
    }
    case "leaf_blower": {
      const body = B.CreateCylinder("b", { diameter: 0.22, height: 0.4 }, scene);
      body.material = mat(scene, "#f07f2d");
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.3;
      const nozzle = B.CreateCylinder("n", { diameterTop: 0.16, diameterBottom: 0.1, height: 0.5 }, scene);
      nozzle.material = mat(scene, "#20242c");
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0.3, 0.4);
      return merge(scene, "wpn", [body, nozzle]);
    }
    case "foam_finger_cannon": {
      const barrel = B.CreateCylinder("b", { diameter: 0.24, height: 0.55 }, scene);
      barrel.material = mat(scene, "#3d6de2");
      barrel.rotation.x = Math.PI / 2;
      barrel.position.y = 0.3;
      const finger = B.CreateBox("f", { width: 0.2, height: 0.3, depth: 0.09 }, scene);
      finger.material = mat(scene, "#ffd23f", 0.2);
      finger.position.set(0, 0.32, 0.4);
      return merge(scene, "wpn", [barrel, finger]);
    }
    case "support_brick": {
      const brick = B.CreateBox("b", { width: 0.22, depth: 0.11, height: 0.11 }, scene);
      brick.material = mat(scene, "#b0523a");
      brick.position.y = 0.3;
      return brick;
    }
    case "budget_laser_sword": {
      const hilt = B.CreateCylinder("h", { diameter: 0.08, height: 0.25 }, scene);
      hilt.material = mat(scene, "#5b636e");
      hilt.position.y = 0.15;
      const blade = B.CreateCylinder("bl", { diameter: 0.06, height: 0.9 }, scene);
      blade.material = mat(scene, "#57e6ff", 0.9);
      blade.position.y = 0.75;
      return merge(scene, "wpn", [hilt, blade]);
    }
    case "flying_croc": {
      const shoe = B.CreateSphere("c", { diameterX: 0.18, diameterY: 0.12, diameterZ: 0.34 }, scene);
      shoe.material = mat(scene, "#4ed24e");
      shoe.position.y = 0.3;
      return shoe;
    }
    case "karaoke_mic": {
      const handle = B.CreateCylinder("h", { diameter: 0.07, height: 0.3 }, scene);
      handle.material = mat(scene, "#20242c");
      handle.position.y = 0.2;
      const ball = B.CreateSphere("b", { diameter: 0.16 }, scene);
      ball.material = mat(scene, "#9aa4b2", 0.1);
      ball.position.y = 0.42;
      return merge(scene, "wpn", [handle, ball]);
    }
    case "commissioners_gavel": {
      const handle = B.CreateCylinder("h", { diameter: 0.07, height: 0.5 }, scene);
      handle.material = mat(scene, "#8a5a2e");
      handle.position.y = 0.3;
      const head = B.CreateCylinder("g", { diameter: 0.28, height: 0.4 }, scene);
      head.material = mat(scene, "#5f3d1d", 0.1);
      head.rotation.z = Math.PI / 2;
      head.position.y = 0.6;
      return merge(scene, "wpn", [handle, head]);
    }
    case "pizza_roll_bag": {
      const bag = B.CreateBox("b", { width: 0.28, depth: 0.12, height: 0.4 }, scene);
      bag.material = mat(scene, "#e23d3d", 0.1);
      bag.position.y = 0.35;
      return bag;
    }
    case "glitter_grenade": {
      const ball = B.CreateSphere("g", { diameter: 0.2 }, scene);
      ball.material = mat(scene, "#e05bff", 0.5);
      ball.position.y = 0.3;
      return ball;
    }
    case "passive_aggressive_email": {
      const env = B.CreateBox("e", { width: 0.3, depth: 0.02, height: 0.2 }, scene);
      env.material = mat(scene, "#f4f4ef", 0.2);
      env.position.y = 0.35;
      env.rotation.x = 0.4;
      return env;
    }
    case "tiny_shopping_cart": {
      const basket = B.CreateBox("b", { width: 0.34, depth: 0.44, height: 0.22 }, scene);
      basket.material = mat(scene, "#9aa4b2", 0.1);
      basket.position.y = 0.35;
      const w1 = B.CreateSphere("w1", { diameter: 0.1 }, scene);
      w1.material = mat(scene, "#20242c");
      w1.position.set(0.12, 0.18, 0.16);
      const w2 = w1.clone("w2");
      w2.position.set(-0.12, 0.18, 0.16);
      const w3 = w1.clone("w3");
      w3.position.set(0.12, 0.18, -0.16);
      const w4 = w1.clone("w4");
      w4.position.set(-0.12, 0.18, -0.16);
      return merge(scene, "wpn", [basket, w1, w2, w3, w4]);
    }
    case "gas_station_hot_dog": {
      const bun = B.CreateCapsule("b", { height: 0.32, radius: 0.07 }, scene);
      bun.material = mat(scene, "#d9a05f");
      bun.rotation.z = Math.PI / 2;
      bun.position.y = 0.3;
      const dog = B.CreateCapsule("d", { height: 0.4, radius: 0.045 }, scene);
      dog.material = mat(scene, "#b0523a");
      dog.rotation.z = Math.PI / 2;
      dog.position.y = 0.34;
      return merge(scene, "wpn", [bun, dog]);
    }
    case "plunger_launcher": {
      const barrel = B.CreateCylinder("b", { diameter: 0.2, height: 0.5 }, scene);
      barrel.material = mat(scene, "#e8b23a");
      barrel.rotation.x = Math.PI / 2;
      barrel.position.y = 0.3;
      const cup = B.CreateCylinder("c", { diameterTop: 0.22, diameterBottom: 0.12, height: 0.14 }, scene);
      cup.material = mat(scene, "#d43d3d");
      cup.rotation.x = -Math.PI / 2;
      cup.position.set(0, 0.3, 0.35);
      return merge(scene, "wpn", [barrel, cup]);
    }
    case "rubber_chicken_nunchucks": {
      const c1 = B.CreateCapsule("c1", { height: 0.35, radius: 0.08 }, scene);
      c1.material = mat(scene, "#ffd23f");
      c1.position.y = 0.25;
      c1.rotation.z = 0.4;
      const c2 = B.CreateCapsule("c2", { height: 0.35, radius: 0.08 }, scene);
      c2.material = mat(scene, "#ffd23f");
      c2.position.set(0.2, 0.5, 0);
      c2.rotation.z = -0.6;
      return merge(scene, "wpn", [c1, c2]);
    }
    case "birthday_cake_bomb": {
      const tier1 = B.CreateCylinder("t1", { diameter: 0.3, height: 0.12 }, scene);
      tier1.material = mat(scene, "#ef6fb2", 0.1);
      tier1.position.y = 0.3;
      const tier2 = B.CreateCylinder("t2", { diameter: 0.2, height: 0.1 }, scene);
      tier2.material = mat(scene, "#f4f4ef", 0.1);
      tier2.position.y = 0.4;
      const candle = B.CreateCylinder("c", { diameter: 0.03, height: 0.12 }, scene);
      candle.material = mat(scene, "#ffd23f", 0.9);
      candle.position.y = 0.5;
      return merge(scene, "wpn", [tier1, tier2, candle]);
    }
    case "hot_sauce_flamethrower": {
      const bottle = B.CreateCylinder("b", { diameter: 0.18, height: 0.4 }, scene);
      bottle.material = mat(scene, "#d43d3d", 0.2);
      bottle.position.y = 0.35;
      const nozzle = B.CreateCylinder("n", { diameterTop: 0.04, diameterBottom: 0.1, height: 0.2 }, scene);
      nozzle.material = mat(scene, "#e8b23a");
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0.45, 0.2);
      return merge(scene, "wpn", [bottle, nozzle]);
    }
    case "office_chair_launcher": {
      const tube = B.CreateCylinder("t", { diameter: 0.3, height: 0.7 }, scene);
      tube.material = mat(scene, "#5b636e");
      tube.rotation.x = Math.PI / 2;
      tube.position.y = 0.35;
      return tube;
    }
    default: {
      const box = MeshBuilder.CreateBox("wpn", { size: 0.2 }, scene);
      box.material = mat(scene, "#ffffff");
      box.position.y = 0.3;
      return box;
    }
  }
}

/** Projectile visual by weapon kind. */
export function buildProjectileMesh(scene: Scene, kind: string): Mesh {
  const B = MeshBuilder;
  switch (kind) {
    case "foam_finger_cannon": {
      const finger = B.CreateBox("proj", { width: 0.35, height: 0.5, depth: 0.16 }, scene);
      finger.material = mat(scene, "#ffd23f", 0.3);
      return finger;
    }
    case "support_brick": {
      const brick = B.CreateBox("proj", { width: 0.3, depth: 0.16, height: 0.16 }, scene);
      brick.material = mat(scene, "#b0523a");
      return brick;
    }
    case "flying_croc": {
      const shoe = B.CreateSphere("proj", { diameterX: 0.24, diameterY: 0.16, diameterZ: 0.44 }, scene);
      shoe.material = mat(scene, "#4ed24e", 0.15);
      return shoe;
    }
    case "pizza_roll_bag": {
      const roll = B.CreateCapsule("proj", { height: 0.22, radius: 0.08 }, scene);
      roll.material = mat(scene, "#d9a05f", 0.2);
      roll.rotation.z = Math.PI / 2;
      return roll;
    }
    case "glitter_grenade": {
      const g = B.CreateSphere("proj", { diameter: 0.26 }, scene);
      g.material = mat(scene, "#e05bff", 0.7);
      return g;
    }
    case "passive_aggressive_email": {
      const env = B.CreateBox("proj", { width: 0.4, depth: 0.04, height: 0.26 }, scene);
      env.material = mat(scene, "#f4f4ef", 0.4);
      return env;
    }
    case "gas_station_hot_dog": {
      const dog = B.CreateCapsule("proj", { height: 0.44, radius: 0.09 }, scene);
      dog.material = mat(scene, "#b0523a", 0.15);
      dog.rotation.z = Math.PI / 2;
      return dog;
    }
    case "plunger_launcher": {
      const cup = B.CreateCylinder("proj", { diameterTop: 0.3, diameterBottom: 0.14, height: 0.2 }, scene);
      cup.material = mat(scene, "#d43d3d", 0.2);
      cup.rotation.x = Math.PI / 2;
      return cup;
    }
    case "birthday_cake_bomb": {
      const cake = B.CreateCylinder("proj", { diameter: 0.4, height: 0.24 }, scene);
      cake.material = mat(scene, "#ef6fb2", 0.4);
      return cake;
    }
    case "office_chair_launcher": {
      const seat = B.CreateBox("proj", { width: 0.5, depth: 0.5, height: 0.08 }, scene);
      seat.material = mat(scene, "#2b2f38");
      const back = B.CreateBox("pb", { width: 0.5, depth: 0.08, height: 0.5 }, scene);
      back.material = mat(scene, "#2b2f38");
      back.position.set(0, 0.28, -0.24);
      return merge(scene, "proj", [seat, back]);
    }
    default: {
      const ball = B.CreateSphere("proj", { diameter: 0.24 }, scene);
      ball.material = mat(scene, "#ffffff", 0.4);
      return ball;
    }
  }
}

export interface PickupVisual {
  node: TransformNode;
  update(dt: number, t: number): void;
  dispose(): void;
}

/** Supply drop: crate + parachute while falling, rarity beam + bobbing item once landed. */
export function buildPickupVisual(scene: Scene, itemId: string, itemType: "weapon" | "powerup", rarity: string): PickupVisual {
  const node = new TransformNode("pickup", scene);
  const rarityHex = RARITY_COLORS[rarity] ?? "#ffffff";

  const crate = MeshBuilder.CreateBox("crate", { size: 0.7 }, scene);
  crate.material = mat(scene, "#c89a5f");
  crate.parent = node;
  crate.position.y = 0.35;
  const band = MeshBuilder.CreateBox("band", { width: 0.74, height: 0.72, depth: 0.2 }, scene);
  band.material = mat(scene, rarityHex, 0.5);
  band.parent = node;
  band.position.y = 0.35;

  const chute = MeshBuilder.CreateSphere("chute", { diameter: 1.6, slice: 0.5 }, scene);
  chute.material = mat(scene, "#ff5f9e", 0.15, 0.9);
  chute.parent = node;
  chute.position.y = 1.6;

  const beam = MeshBuilder.CreateCylinder("beam", { diameter: 0.5, height: 9 }, scene);
  beam.material = mat(scene, rarityHex, 0.9, 0.22);
  beam.parent = node;
  beam.position.y = 4.5;
  beam.setEnabled(false);

  let item: Mesh | null = null;
  let landed = false;

  return {
    node,
    update: (dt, t) => {
      void dt;
      if (node.position.y <= 0.62 && !landed) {
        landed = true;
        chute.setEnabled(false);
        beam.setEnabled(true);
        crate.scaling.y = 0.6;
        band.scaling.y = 0.6;
        item = itemType === "weapon" ? buildWeaponMesh(scene, itemId) : MeshBuilder.CreateSphere("pu", { diameter: 0.3 }, scene);
        if (item) {
          if (itemType === "powerup") item.material = mat(scene, "#57e6ff", 0.8);
          item.parent = node;
        }
      }
      if (item) {
        item.position.y = 0.75 + Math.sin(t * 3) * 0.08;
        item.rotation.y = t * 1.8;
      }
      if (!landed) chute.rotation.y = t * 0.8;
    },
    dispose: () => node.dispose(false, true),
  };
}

/** Hazard warning + active prop by kind. */
export function buildHazardVisual(scene: Scene, kind: string, radius: number): {
  node: TransformNode;
  setActive(active: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
} {
  const node = new TransformNode("hazard", scene);
  const ringMat = mat(scene, "#ff4c4c", 0.8, 0.55);
  const ring = MeshBuilder.CreateTorus("warnRing", { diameter: radius * 2, thickness: 0.14, tessellation: 32 }, scene);
  ring.material = ringMat;
  ring.parent = node;
  ring.position.y = 0.1;
  const disc = MeshBuilder.CreateDisc("warnDisc", { radius }, scene);
  disc.material = mat(scene, "#ff4c4c", 0.5, 0.14);
  disc.rotation.x = Math.PI / 2;
  disc.parent = node;
  disc.position.y = 0.06;

  let prop: Mesh | null = null;
  let active = false;

  const buildProp = (): Mesh | null => {
    const B = MeshBuilder;
    switch (kind) {
      case "falling_draft_board": {
        const board = B.CreateBox("hz", { width: radius * 1.4, depth: radius * 1.4, height: 0.3 }, scene);
        board.material = mat(scene, "#101a3a", 0.3);
        board.position.y = 8;
        return board;
      }
      case "rolling_chairs": case "snack_cart": {
        const body = B.CreateBox("hz", { width: 0.7, depth: 1, height: 0.8 }, scene);
        body.material = mat(scene, kind === "snack_cart" ? "#e8b23a" : "#2b2f38", 0.2);
        body.position.y = 0.5;
        return body;
      }
      case "flying_pizza": {
        const pie = B.CreateCylinder("hz", { diameter: 1.1, height: 0.08 }, scene);
        pie.material = mat(scene, "#e8b23a", 0.3);
        pie.position.y = 1.6;
        return pie;
      }
      case "giant_football": {
        const ball = B.CreateSphere("hz", { diameterX: 1.4, diameterY: 0.9, diameterZ: 0.9 }, scene);
        ball.material = mat(scene, "#8a5a2e", 0.15);
        ball.position.y = 1;
        return ball;
      }
      case "mascot_stampede": {
        const mascot = B.CreateSphere("hz", { diameter: 1.2 }, scene);
        mascot.material = mat(scene, "#9b4fe0", 0.3);
        mascot.position.y = 0.8;
        return mascot;
      }
      case "commissioner_rage": {
        const wave = B.CreateTorus("hz", { diameter: 1, thickness: 0.3 }, scene);
        wave.material = mat(scene, "#ff4c4c", 0.8, 0.6);
        wave.position.y = 0.5;
        return wave;
      }
      case "camera_robot": {
        const bot = B.CreateBox("hz", { width: 0.6, depth: 0.8, height: 1.2 }, scene);
        bot.material = mat(scene, "#5b636e", 0.2);
        bot.position.y = 0.7;
        return bot;
      }
      case "soda_slip": {
        const puddle = B.CreateDisc("hz", { radius: radius * 0.9 }, scene);
        puddle.material = mat(scene, "#7a4a12", 0.3, 0.5);
        puddle.rotation.x = Math.PI / 2;
        puddle.position.y = 0.08;
        return puddle;
      }
      default:
        return null;
    }
  };

  return {
    node,
    setActive: (a) => {
      if (a && !active) {
        active = true;
        ringMat.alpha = 0.85;
        prop = buildProp();
        if (prop) prop.parent = node;
      }
    },
    update: (dt, t) => {
      if (!active) {
        ringMat.alpha = 0.35 + Math.sin(t * 8) * 0.25;
        ring.scaling.setAll(1 + Math.sin(t * 8) * 0.04);
      } else if (prop) {
        switch (kind) {
          case "falling_draft_board":
            prop.position.y = Math.max(0.2, prop.position.y - dt * 22);
            break;
          case "rolling_chairs": case "snack_cart": case "mascot_stampede": case "camera_robot":
            prop.position.x = Math.sin(t * 3) * radius * 0.7;
            prop.rotation.y = t * 3;
            break;
          case "flying_pizza":
            prop.rotation.y = t * 10;
            prop.position.x = Math.cos(t * 5) * radius * 0.5;
            prop.position.z = Math.sin(t * 5) * radius * 0.5;
            break;
          case "giant_football":
            prop.position.y = 0.5 + Math.abs(Math.sin(t * 6)) * 1.4;
            prop.rotation.z = t * 4;
            break;
          case "commissioner_rage":
            prop.scaling.setAll(1 + (t % 0.7) * radius * 1.6);
            (prop.material as StandardMaterial).alpha = Math.max(0, 0.6 - (t % 0.7));
            break;
          default:
            break;
        }
      }
    },
    dispose: () => node.dispose(false, true),
  };
}

export function weaponDisplayName(id: string): string {
  try {
    return getWeapon(id).name;
  } catch {
    return id;
  }
}
