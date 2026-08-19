import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultCharacter, type MatchResults, type ParticipantSlot } from "@ddd/shared";
import { Match } from "@ddd/shared";

/**
 * Fairness guarantee: the dunce cap is a ROAST, not a handicap. Across many
 * seeded matches the hat player's average finish must be statistically
 * indistinguishable from the middle of the pack (expected placement 6.5 of
 * 12). This test exists because an AI "hat hunter" targeting bias once made
 * the previous season's loser finish last nearly every match.
 */

function participants(): ParticipantSlot[] {
  return Array.from({ length: 12 }, (_, i) => ({
    slotIndex: i,
    id: `p${i}`,
    name: `Player ${i}`,
    status: "ai" as const,
    connStatus: "connected" as const,
    ready: true,
    isPreviousLoser: i === 5,
    character: defaultCharacter(i),
  }));
}

function hatPlacement(seed: number): number {
  let results: MatchResults | null = null;
  const match = new Match({
    matchId: `fair_${seed}`,
    roomCode: "FAIR01",
    leagueName: "Fairness League",
    participants: participants(),
    settings: { ...DEFAULT_SETTINGS, matchDurationTargetSec: 90, suddenDeathAtSec: 70, chaosLevel: 2 },
    arenaId: "disaster_dome",
    seed,
    hatPlayerId: "p5",
    onEnd: (r) => {
      results = r;
    },
  });
  match.hostSkipIntro();
  for (let i = 0; i < 30 * 60 * 12 && !results; i++) {
    match.tick();
    match.drainEvents();
  }
  if (!results) throw new Error("match did not finish");
  const pick = (results as MatchResults).draftOrder.find((p) => p.playerId === "p5")?.pick;
  if (!pick) throw new Error("hat player missing from draft order");
  return pick;
}

describe("dunce cap fairness", () => {
  it("hat player's average placement over 30 seeded matches is mid-pack, and they win sometimes", () => {
    const picks: number[] = [];
    for (let s = 0; s < 30; s++) picks.push(hatPlacement(1000 + s * 7919));
    const mean = picks.reduce((a, b) => a + b, 0) / picks.length;
    // Uniform expectation is 6.5; std of the mean over 30 matches ≈ 0.63.
    // Allow ±2.0 — catches systematic bias, tolerates seed luck.
    expect(mean).toBeGreaterThan(4.5);
    expect(mean).toBeLessThan(8.5);
    // A rigged hat player never finishes top-3 — a fair one does regularly.
    expect(picks.some((p) => p <= 3)).toBe(true);
    // ...and shouldn't finish dead last more than half the time.
    expect(picks.filter((p) => p === 12).length).toBeLessThan(15);
  }, 120_000);
});
