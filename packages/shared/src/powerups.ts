import type { PowerUpDef } from "./types.js";

export const POWERUPS: PowerUpDef[] = [
  { id: "double_speed", name: "Double Speed", description: "Zoom.", durationMs: 8000, rarity: "common", effects: { speedMult: 1.8 } },
  { id: "giant_head", name: "Giant Head Mode", description: "Your head grows. Your hitbox feelings do too.", durationMs: 10000, rarity: "common", effects: { headScale: 2.2 } },
  { id: "tiny_body", name: "Tiny Body Mode", description: "Smaller target, same ego.", durationMs: 10000, rarity: "uncommon", effects: { bodyScale: 0.65, speedMult: 1.15 } },
  { id: "temp_shield", name: "Temporary Shield", description: "A shimmering bubble of plausible deniability.", durationMs: 6000, rarity: "rare", effects: { shield: true } },
  { id: "triple_knockback", name: "Triple Knockback", description: "Your hits send people to next season.", durationMs: 7000, rarity: "rare", effects: { knockbackDealtMult: 3 } },
  { id: "invisibility", name: "Invisibility", description: "Mostly invisible. Your nameplate is shy too.", durationMs: 6000, rarity: "rare", effects: { invisible: true } },
  { id: "regen", name: "Health Regeneration", description: "Slowly un-ruins your day.", durationMs: 8000, rarity: "uncommon", effects: { regenPerSec: 4 } },
  { id: "reverse_aura", name: "Reverse Controls Aura", description: "Nearby enemies steer backwards. You're the problem now.", durationMs: 6000, rarity: "questionable", effects: { reverseControls: true } },
  { id: "dance_break", name: "Sudden Dance Break", description: "You must dance. It's in the rules.", durationMs: 3000, rarity: "questionable", effects: { forceDance: true } },
  { id: "commissioner_mode", name: "Angry Commissioner Mode", description: "Bigger, angrier, official.", durationMs: 8000, rarity: "legendary", effects: { bodyScale: 1.35, knockbackDealtMult: 1.6, knockbackReceivedMult: 0.5 } },
  { id: "lucky_socks", name: "Lucky Draft Socks", description: "Immunity to Auto-Draft zone damage.", durationMs: 10000, rarity: "rare", effects: { zoneImmunity: true } },
  { id: "unnecessary_confidence", name: "Unnecessary Confidence", description: "+speed, +knockback, +absolutely nothing to back it up.", durationMs: 8000, rarity: "uncommon", effects: { speedMult: 1.3, knockbackDealtMult: 1.3 } },
  { id: "pizza_grease_slide", name: "Pizza Grease Slide", description: "Frictionless. Delicious. Dangerous.", durationMs: 7000, rarity: "questionable", effects: { speedMult: 1.5 } },
  { id: "yippee_overdrive", name: "Yippee Overdrive", description: "The hat wearer's spirit possesses you.", durationMs: 8000, rarity: "questionable", effects: { yippeeOverdrive: true, speedMult: 1.2 } },
];

export const POWERUPS_BY_ID: ReadonlyMap<string, PowerUpDef> = new Map(POWERUPS.map((p) => [p.id, p]));

export function getPowerUp(id: string): PowerUpDef {
  const p = POWERUPS_BY_ID.get(id);
  if (!p) throw new Error(`Unknown powerup: ${id}`);
  return p;
}
