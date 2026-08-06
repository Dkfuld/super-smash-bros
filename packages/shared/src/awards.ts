import type { EliminationRecord, MatchAward, ParticipantSlot, PlayerStats } from "./types.js";

interface AwardCtx {
  stats: PlayerStats[];
  eliminations: EliminationRecord[];
  participants: ParticipantSlot[];
  rainbowHatPlayerId: string | null;
  winnerId: string;
}

function nameOf(ctx: AwardCtx, id: string): string {
  return ctx.participants.find((p) => p.id === id)?.name ?? "Unknown";
}

function maxBy(stats: PlayerStats[], f: (s: PlayerStats) => number): PlayerStats | null {
  let best: PlayerStats | null = null;
  let bestV = -Infinity;
  for (const s of stats) {
    const v = f(s);
    if (v > bestV) {
      bestV = v;
      best = s;
    }
  }
  return bestV > 0 ? best : null;
}

/** End-of-match comedy awards, computed purely from the authoritative stat log. */
export function computeAwards(ctx: AwardCtx): MatchAward[] {
  const awards: MatchAward[] = [];
  const add = (id: string, title: string, description: string, playerId: string | null | undefined) => {
    if (!playerId) return;
    awards.push({ id, title, description, playerId, playerName: nameOf(ctx, playerId) });
  };

  const firstOut = [...ctx.eliminations].sort((a, b) => a.placement - b.placement).pop();
  add("first_one_out", "First One Out", "Set the tone. The wrong tone.", firstOut?.playerId);

  add("draft_day_menace", "Draft-Day Menace", "Most eliminations.", maxBy(ctx.stats, (s) => s.eliminations)?.playerId);
  add("damage_sponge", "Damage Sponge", "Absorbed the most damage.", maxBy(ctx.stats, (s) => s.damageReceived)?.playerId);
  add("weapon_hoarder", "Weapon Hoarder", "Picked up the most weapons.", maxBy(ctx.stats, (s) => s.weaponsPickedUp)?.playerId);
  add("bush_camper", "Bush Camper", "Spent the most time hiding.", maxBy(ctx.stats, (s) => s.timeHidingMs)?.playerId);
  add("environmental_hazard", "Environmental Hazard", "Most eliminations via arena chaos.", maxBy(ctx.stats, (s) => s.environmentalEliminations)?.playerId);
  add("most_aggressive", "Most Aggressive", "Dealt the most damage.", maxBy(ctx.stats, (s) => s.damageDealt)?.playerId);
  add("marathoner", "Cardio Champion", "Traveled the farthest.", maxBy(ctx.stats, (s) => s.distanceTraveled)?.playerId);
  add("legendary_collector", "Legendary Collector", "Most legendary pickups.", maxBy(ctx.stats, (s) => s.legendaryPickups)?.playerId);
  add("knockdown_artist", "Knockdown Artist", "Most knockdowns dealt.", maxBy(ctx.stats, (s) => s.knockdownsDealt)?.playerId);

  const secondPlace = ctx.eliminations.find((e) => e.placement === 2);
  add("almost_had_it", "Almost Had It", "Second place. Forever.", secondPlace?.playerId);

  const hatStats = ctx.stats.find((s) => s.playerId === ctx.rainbowHatPlayerId);
  if (hatStats) {
    add("yippee_enthusiast", "Yippee Enthusiast", `Said "Yippee!" ${hatStats.yippees} times.`, hatStats.playerId);
    if (ctx.rainbowHatPlayerId === ctx.winnerId) {
      add("rainbow_redemption", "Rainbow Redemption", "Wore the hat. Won the whole thing.", ctx.rainbowHatPlayerId);
    }
  }

  // Accidental Genius: won or placed top-3 with the fewest weapon pickups.
  const top3Ids = new Set([ctx.winnerId, ...ctx.eliminations.filter((e) => e.placement <= 3).map((e) => e.playerId)]);
  const genius = ctx.stats
    .filter((s) => top3Ids.has(s.playerId))
    .sort((a, b) => a.weaponsPickedUp - b.weaponsPickedUp)[0];
  if (genius && genius.weaponsPickedUp <= 1) {
    add("accidental_genius", "Accidental Genius", "Top three, barely touched a weapon.", genius.playerId);
  }

  // Deduplicate: keep at most 2 awards per player so cards stay funny, not repetitive.
  const perPlayer = new Map<string, number>();
  return awards.filter((a) => {
    const n = perPlayer.get(a.playerId) ?? 0;
    if (n >= 2) return false;
    perPlayer.set(a.playerId, n + 1);
    return true;
  });
}
