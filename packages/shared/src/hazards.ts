import type { HazardDef } from "./types.js";

/** Arena hazards. All are telegraphed (warning lights + floor ring + audio) before activating. */
export const HAZARDS: HazardDef[] = [
  { id: "falling_draft_board", name: "Falling Draft Board", telegraphMs: 2200, activeMs: 500, damage: 18, knockback: 14, radius: 3.0, zones: ["stage"], audio: "creakSlam", minChaos: 0 },
  { id: "rolling_chairs", name: "Rolling Office Chair Stampede", telegraphMs: 2000, activeMs: 2500, damage: 8, knockback: 10, radius: 2.2, zones: ["warroom", "center"], audio: "wheelieClatter", minChaos: 0 },
  { id: "flying_pizza", name: "Flying Pizza Barrage", telegraphMs: 1800, activeMs: 1200, damage: 6, knockback: 7, radius: 2.5, zones: ["bar", "warroom"], audio: "splat", minChaos: 0 },
  { id: "ceiling_fan_blades", name: "Loose Ceiling-Fan Blades", telegraphMs: 2400, activeMs: 900, damage: 12, knockback: 12, radius: 2.8, zones: ["warroom", "center"], audio: "fanWhirr", minChaos: 1 },
  { id: "mascot_stampede", name: "Mascot Stampede", telegraphMs: 2600, activeMs: 3000, damage: 10, knockback: 16, radius: 3.2, zones: ["center", "lockers"], audio: "stampede", minChaos: 1 },
  { id: "stage_collapse", name: "Collapsing Stage Section", telegraphMs: 2800, activeMs: 1500, damage: 15, knockback: 8, radius: 3.5, zones: ["stage"], audio: "rumble", minChaos: 1 },
  { id: "trap_door", name: "Trap Door", telegraphMs: 2000, activeMs: 1800, damage: 0, knockback: 0, radius: 1.6, zones: ["gameshow", "center"], audio: "trapCreak", minChaos: 0 },
  { id: "commissioner_rage", name: "Commissioner Rage Wave", telegraphMs: 3000, activeMs: 700, damage: 10, knockback: 18, radius: 6.0, zones: ["stage", "center"], audio: "rageHorn", minChaos: 2 },
  { id: "confetti_misfire", name: "Malfunctioning Confetti Cannon", telegraphMs: 1500, activeMs: 800, damage: 5, knockback: 13, radius: 2.4, zones: ["gameshow", "stage"], audio: "confettiBoom", minChaos: 0 },
  { id: "soda_slip", name: "Spilled-Soda Slip Zone", telegraphMs: 1200, activeMs: 6000, damage: 0, knockback: 0, radius: 2.6, zones: ["bar", "lockers"], audio: "fizz", minChaos: 0 },
  { id: "giant_football", name: "Giant Bouncing Football", telegraphMs: 2200, activeMs: 2800, damage: 11, knockback: 15, radius: 2.0, zones: ["center", "lockers"], audio: "boing", minChaos: 1 },
  { id: "waiver_wheel", name: "Spinning Waiver-Wire Wheel", telegraphMs: 2500, activeMs: 2400, damage: 9, knockback: 14, radius: 3.0, zones: ["gameshow"], audio: "wheelTick", minChaos: 1 },
  { id: "autodraft_flash", name: "AUTO-DRAFT Danger Zone", telegraphMs: 2000, activeMs: 1400, damage: 14, knockback: 6, radius: 3.4, zones: ["center", "warroom", "bar"], audio: "alarmBuzz", minChaos: 2 },
  { id: "camera_robot", name: "Roaming Camera Robot", telegraphMs: 1800, activeMs: 3200, damage: 7, knockback: 9, radius: 1.8, zones: ["stage", "center"], audio: "servoWhine", minChaos: 1 },
  { id: "snack_cart", name: "Runaway Snack Cart", telegraphMs: 2000, activeMs: 2600, damage: 12, knockback: 17, radius: 2.2, zones: ["bar", "center", "lockers"], audio: "cartRattle", minChaos: 0 },
];

export const HAZARDS_BY_ID: ReadonlyMap<string, HazardDef> = new Map(HAZARDS.map((h) => [h.id, h]));
