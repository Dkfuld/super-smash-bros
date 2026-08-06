import type { DraftPick, EliminationRecord, ParticipantSlot } from "./types.js";
import { MAX_PLAYERS } from "./balance.js";

/**
 * Deterministic tie-breaking for eliminations committed on the same server tick.
 *
 * Order of elimination (earlier = worse draft pick):
 *  1. Lower tick is eliminated first.
 *  2. Same tick: the player with MORE total damage received is eliminated first
 *     (they were "more beaten up" and lose the coin flip).
 *  3. Still tied: lower participant slot index is eliminated first.
 *
 * These rules are pure, documented, and unit-tested — the server applies them
 * once when committing eliminations, and placements are stored immutably.
 */
export function compareEliminations(a: EliminationRecord, b: EliminationRecord): number {
  if (a.tick !== b.tick) return a.tick - b.tick;
  if (a.damageReceived !== b.damageReceived) return b.damageReceived - a.damageReceived;
  return a.slotIndex - b.slotIndex;
}

/**
 * Compute the final draft order.
 * First eliminated → pick 12, ..., winner → pick 1.
 * `eliminations` may arrive unsorted; ties are resolved by compareEliminations.
 * The winner is the single participant with no elimination record.
 */
export function computeDraftOrder(
  eliminations: EliminationRecord[],
  participants: ParticipantSlot[],
): DraftPick[] {
  if (participants.length !== MAX_PLAYERS) {
    throw new Error(`Draft order requires exactly ${MAX_PLAYERS} participants, got ${participants.length}`);
  }
  const sorted = [...eliminations].sort(compareEliminations);
  const eliminatedIds = new Set(sorted.map((e) => e.playerId));
  if (eliminatedIds.size !== sorted.length) {
    throw new Error("Duplicate elimination records for the same player");
  }
  const survivors = participants.filter((p) => !eliminatedIds.has(p.id));
  if (survivors.length !== 1) {
    throw new Error(`Expected exactly 1 survivor, found ${survivors.length}`);
  }
  const winner = survivors[0]!;

  const byId = new Map(participants.map((p) => [p.id, p]));
  const picks: DraftPick[] = [];

  // Winner gets pick 1.
  picks.push({
    pick: 1,
    playerId: winner.id,
    playerName: winner.name,
    placement: 1,
    characterId: winner.character.bodyId,
    colorId: winner.character.colorId,
  });

  // sorted[0] was eliminated first → placement 12, pick 12.
  sorted.forEach((elim, i) => {
    const p = byId.get(elim.playerId);
    if (!p) throw new Error(`Elimination for unknown participant ${elim.playerId}`);
    const placement = MAX_PLAYERS - i; // first out = 12
    picks.push({
      pick: placement,
      playerId: p.id,
      playerName: p.name,
      placement,
      characterId: p.character.bodyId,
      colorId: p.character.colorId,
    });
  });

  picks.sort((a, b) => a.pick - b.pick);

  // Sanity: all 12 picks unique and complete.
  const pickNums = new Set(picks.map((p) => p.pick));
  if (picks.length !== MAX_PLAYERS || pickNums.size !== MAX_PLAYERS) {
    throw new Error("Draft order is incomplete or contains duplicate picks");
  }
  return picks;
}

/** Assign placements onto elimination records (mutating copies), returns sorted records. */
export function assignPlacements(eliminations: EliminationRecord[]): EliminationRecord[] {
  const sorted = [...eliminations].sort(compareEliminations);
  return sorted.map((e, i) => ({ ...e, placement: MAX_PLAYERS - i }));
}

export function draftOrderAsText(leagueName: string, picks: DraftPick[]): string {
  const lines = [`${leagueName} — Official Draft Order`, ""];
  for (const p of picks) lines.push(`${String(p.pick).padStart(2)}. ${p.playerName}`);
  return lines.join("\n");
}

export function draftOrderAsCsv(picks: DraftPick[]): string {
  const lines = ["pick,player,placement"];
  for (const p of picks) lines.push(`${p.pick},${JSON.stringify(p.playerName)},${p.placement}`);
  return lines.join("\n");
}
