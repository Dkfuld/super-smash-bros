import { Rng, SIM, collidesBlocking, getWeapon, type InputMessage } from "../index.js";
import type { Fighter, Match } from "./match.js";

type Mode = "wander" | "seekWeapon" | "hunt" | "flee" | "zoneReturn" | "avoidHazard";

export interface AiTraits {
  aggression: number;
  caution: number;
  weaponLust: number;
  hazardFear: number;
  revenge: number;
  showboat: number;
  camper: number;
}

const TRAIT_ARCHETYPES: Array<Partial<AiTraits> & { name: string }> = [
  { name: "Aggressive", aggression: 0.95, caution: 0.15 },
  { name: "Defensive", caution: 0.9, aggression: 0.35 },
  { name: "Cowardly", caution: 0.95, aggression: 0.1, camper: 0.6 },
  { name: "Opportunistic", aggression: 0.6, revenge: 0.3 },
  { name: "Weapon Hoarder", weaponLust: 0.98 },
  { name: "Revenge Focused", revenge: 0.95 },
  { name: "Hazard Avoider", hazardFear: 0.98 },
  { name: "Reckless", hazardFear: 0.05, aggression: 0.85 },
  { name: "Bush Camper", camper: 0.95, caution: 0.7 },
  { name: "Showboat", showboat: 0.9 },
  { name: "Frontrunner", aggression: 0.75, caution: 0.3 },
  { name: "Legendary-Weapon Obsessed", weaponLust: 0.9, aggression: 0.5 },
];

/**
 * Utility-scoring AI with randomized personality traits. Deliberately
 * imperfect: reaction delays, aim error, occasional bad decisions — competent
 * enough to win, silly enough to be funny.
 */
export class AiController {
  readonly traits: AiTraits;
  readonly archetype: string;
  private rng: Rng;
  private mode: Mode = "wander";
  private targetId: string | null = null;
  private waypoint: { x: number; z: number } | null = null;
  private nextThinkAt = 0;
  private seq = 1;
  private atkHoldTicks = 0;
  private heavyHoldTicks = 0;
  private avoidYawOffset = 0;
  private grudge: string | null = null;

  constructor(
    readonly playerId: string,
    seed: number,
    private readonly difficulty: number,
  ) {
    this.rng = new Rng(seed);
    const arch = TRAIT_ARCHETYPES[this.rng.int(0, TRAIT_ARCHETYPES.length - 1)]!;
    this.archetype = arch.name;
    const r = () => this.rng.range(0.15, 0.6);
    this.traits = {
      aggression: arch.aggression ?? r(),
      caution: arch.caution ?? r(),
      weaponLust: arch.weaponLust ?? r(),
      hazardFear: arch.hazardFear ?? this.rng.range(0.4, 0.9),
      revenge: arch.revenge ?? r(),
      showboat: arch.showboat ?? r(),
      camper: arch.camper ?? r(),
    };
  }

  compute(match: Match, me: Fighter): InputMessage {
    const w = match.aiWorld();
    if (me.lastDamagedBy) this.grudge = me.lastDamagedBy;

    // Reaction delay: rethink every 6-14 ticks depending on difficulty.
    if (w.tick >= this.nextThinkAt) {
      this.think(match, me);
      const base = 14 - this.difficulty * 4;
      this.nextThinkAt = w.tick + this.rng.int(base, base + 8);
    }

    const input: InputMessage = { t: "input", seq: this.seq++, mx: 0, mz: 0 };

    // Steering toward waypoint with obstacle avoidance
    const wp = this.waypoint;
    if (wp) {
      let dx = wp.x - me.x;
      let dz = wp.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        dx /= d; dz /= d;
        // probe ahead; deflect if a wall is coming
        const px = me.x + dx * 1.4, pz = me.z + dz * 1.4;
        if (collidesBlocking(w.layout, px, pz, me.y, SIM.PLAYER_RADIUS)) {
          if (this.avoidYawOffset === 0) this.avoidYawOffset = this.rng.chance(0.5) ? 0.9 : -0.9;
          const ang = Math.atan2(dx, dz) + this.avoidYawOffset;
          dx = Math.sin(ang); dz = Math.cos(ang);
        } else {
          this.avoidYawOffset = 0;
        }
        input.mx = dx;
        input.mz = dz;
      }
    }

    // Combat behavior against current target
    const target = this.targetId ? w.fighters.get(this.targetId) : null;
    if (this.mode === "hunt" && target && !target.eliminated && !w.hidden.has(target.id)) {
      const dx = target.x - me.x, dz = target.z - me.z;
      const dist = Math.hypot(dx, dz);
      const weapon = me.weapon ? getWeapon(me.weapon) : null;
      const range = weapon
        ? weapon.class === "projectile" || weapon.class === "spread" || weapon.class === "thrown"
          ? Math.min(weapon.range * 0.8, 12)
          : weapon.class === "cone"
            ? weapon.range * 0.85
            : weapon.range
        : SIM.PUNCH_RANGE;

      // face target with difficulty-scaled aim error
      const err = (0.35 - this.difficulty * 0.14) * this.rng.range(-1, 1);
      input.yaw = Math.atan2(dx, dz) + err;

      if (dist < range + 0.3) {
        if (this.heavyHoldTicks > 0) {
          this.heavyHoldTicks--;
          input.heavyHold = true;
        } else if (this.atkHoldTicks > 0) {
          this.atkHoldTicks--;
          input.atk = this.atkHoldTicks % 6 < 3; // rhythmic presses → edge triggers
        } else if (this.rng.chance(0.25 + this.traits.aggression * 0.3)) {
          if (this.rng.chance(0.18) && !weapon) this.heavyHoldTicks = this.rng.int(10, 28);
          else this.atkHoldTicks = this.rng.int(8, 20);
        }
        // stop crowding
        if (dist < 1.0) { input.mx *= 0.2; input.mz *= 0.2; }
      }
      // dodge if the target is mid-attack near us
      if ((target.anim === "attack" || target.anim === "heavy") && dist < 3 && this.rng.chance(0.1 + this.difficulty * 0.2)) {
        input.dodge = true;
      }
    }

    // pick things up whenever standing near them (weaponless bots grab anything)
    for (const pk of w.pickups) {
      if (Math.hypot(pk.x - me.x, pk.z - me.z) < SIM.PICKUP_RADIUS * 0.9) {
        if (pk.itemType === "powerup" || !me.weapon || this.traits.weaponLust > 0.7) input.pickup = true;
      }
    }

    // showboats emote when nobody is near
    if (this.traits.showboat > 0.8 && this.rng.chance(0.002)) input.emote = 1;

    return input;
  }

  private think(match: Match, me: Fighter): void {
    const w = match.aiWorld();

    // 1) hazard escape has top priority (scaled by fear)
    for (const hz of w.hazards) {
      const d = Math.hypot(me.x - hz.x, me.z - hz.z);
      if (d < hz.radius + 1.2 && this.rng.chance(this.traits.hazardFear)) {
        const away = Math.atan2(me.x - hz.x, me.z - hz.z);
        this.mode = "avoidHazard";
        this.waypoint = { x: me.x + Math.sin(away) * (hz.radius + 3), z: me.z + Math.cos(away) * (hz.radius + 3) };
        return;
      }
    }

    // 2) get back inside the zone — with a generous margin, and head deep
    // inside rather than hugging the edge (edge-huggers died "to nobody",
    // which made eliminations feel random instead of earned in fights).
    const myR = Math.hypot(me.x, me.z);
    const margin = Math.max(3.5, w.zoneRadius * 0.2);
    if (myR > w.zoneRadius - margin) {
      const inner = Math.max(2, w.zoneRadius * 0.5);
      const a = myR > 0.01 ? Math.atan2(me.x, me.z) : this.rng.range(0, Math.PI * 2);
      this.mode = "zoneReturn";
      this.waypoint = { x: Math.sin(a) * inner, z: Math.cos(a) * inner };
      return;
    }

    // 3) utility scoring over candidate behaviors
    const hpFrac = me.hp / me.maxHp;
    const enemies = [...w.fighters.values()].filter((f) => f.id !== me.id && !f.eliminated && !w.hidden.has(f.id));

    let bestScore = 0.15; // wander baseline
    let bestMode: Mode = "wander";
    let bestTarget: Fighter | null = null;
    let bestPickup: { x: number; z: number } | null = null;

    // flee when hurt
    if (hpFrac < 0.35) {
      const s = this.traits.caution * (1 - hpFrac) * 1.6;
      if (s > bestScore) { bestScore = s; bestMode = "flee"; }
    }

    // seek weapon
    if (!me.weapon || this.traits.weaponLust > 0.75) {
      let nearest: { x: number; z: number } | null = null;
      let nd = 28;
      for (const pk of w.pickups) {
        if (pk.itemType !== "weapon" && me.weapon) continue;
        const d = Math.hypot(pk.x - me.x, pk.z - me.z);
        const rarityBonus = pk.rarity === "legendary" ? 10 : pk.rarity === "rare" ? 4 : 0;
        if (d - rarityBonus < nd) { nd = d - rarityBonus; nearest = { x: pk.x, z: pk.z }; }
      }
      if (nearest) {
        const s = (me.weapon ? 0.3 : 0.8) * this.traits.weaponLust * (1.4 - Math.min(1, nd / 28));
        if (s > bestScore) { bestScore = s; bestMode = "seekWeapon"; bestPickup = nearest; }
      }
    }

    // hunt — dampened during the opening loot phase so matches don't start
    // with instant spawn mobbing (the first ~30s is for exploration/weapons)
    const lootPhase = w.tick < 30 * 30;
    // Boredom: a fighter that hasn't traded a hit in ~12s goes looking for
    // one. Nobody hides in this league — hiding is not content.
    const bored = w.playTick - me.lastCombatTick > 30 * 12 && !lootPhase;
    for (const e of enemies) {
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      // After looting, everyone wants a fight — combat kills should decide
      // the draft order, not attrition.
      let s = this.traits.aggression * (1.35 - Math.min(1, d / 40)) * (lootPhase ? 0.3 : 1.25);
      if (bored) s += 0.8;
      s += (1 - e.hp / e.maxHp) * 0.2; // mild finisher instinct — no dogpiling one victim
      if (e.id === this.grudge) s += this.traits.revenge * 0.7;
      // NOTE: no hat-player targeting bias — wearing the dunce cap is a
      // cosmetic roast, never a gameplay handicap. Fairness is the product.
      if (me.weapon) s += 0.25;
      if (s > bestScore) { bestScore = s; bestMode = "hunt"; bestTarget = e; }
    }

    this.mode = bestMode;
    switch (bestMode) {
      case "hunt":
        this.targetId = bestTarget?.id ?? null;
        this.waypoint = bestTarget ? { x: bestTarget.x, z: bestTarget.z } : null;
        break;
      case "seekWeapon":
        this.targetId = null;
        this.waypoint = bestPickup;
        break;
      case "flee": {
        const threat = enemies.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        const away = threat ? Math.atan2(me.x - threat.x, me.z - threat.z) : this.rng.range(0, Math.PI * 2);
        const r = Math.min(w.zoneRadius - 4, 24);
        this.targetId = null;
        this.waypoint = { x: Math.sin(away) * r * 0.7, z: Math.cos(away) * r * 0.7 };
        break;
      }
      default: {
        // Wander toward the action, never away from it: drift to a point near
        // a random other fighter so the arena naturally clumps into brawls.
        this.targetId = null;
        if (enemies.length > 0 && this.rng.chance(0.7)) {
          const near = enemies[this.rng.int(0, enemies.length - 1)]!;
          this.waypoint = { x: near.x + this.rng.range(-4, 4), z: near.z + this.rng.range(-4, 4) };
        } else {
          const a = this.rng.range(0, Math.PI * 2);
          const r = this.rng.range(3, Math.max(4, w.zoneRadius * 0.55));
          this.waypoint = { x: Math.sin(a) * r, z: Math.cos(a) * r };
        }
      }
    }
  }
}
