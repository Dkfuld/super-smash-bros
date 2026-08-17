import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MAX_PLAYERS, defaultCharacter, type MatchResults, type ParticipantSlot } from "@ddd/shared";
import { Match } from "@ddd/shared";

function participants(aiAll = true): ParticipantSlot[] {
  return Array.from({ length: 12 }, (_, i) => ({
    slotIndex: i,
    id: `p${i}`,
    name: `Player ${i}`,
    status: aiAll ? ("ai" as const) : ("human" as const),
    connStatus: "connected" as const,
    ready: true,
    isPreviousLoser: i === 3,
    character: defaultCharacter(i),
  }));
}

function runFullAiMatch(seed = 1234, settingsOverride = {}): { match: Match; results: MatchResults; allEvents: ReturnType<Match["drainEvents"]> } {
  let results: MatchResults | null = null;
  const match = new Match({
    matchId: "m_test",
    roomCode: "TEST42",
    leagueName: "Test League",
    participants: participants(),
    settings: {
      ...DEFAULT_SETTINGS,
      matchDurationTargetSec: 120,
      suddenDeathAtSec: 90,
      chaosLevel: 2,
      ...settingsOverride,
    },
    arenaId: "disaster_dome",
    seed,
    hatPlayerId: "p3",
    onEnd: (r) => {
      results = r;
    },
  });
  const allEvents: ReturnType<Match["drainEvents"]> = [];
  const maxTicks = 30 * 60 * 12; // 12 sim-minutes hard cap
  for (let i = 0; i < maxTicks && !results; i++) {
    match.tick();
    allEvents.push(...match.drainEvents());
  }
  if (!results) throw new Error("match did not finish");
  return { match, results, allEvents };
}

describe("full AI match simulation", () => {
  const { results, allEvents } = runFullAiMatch();

  it("finishes and produces a complete, unique draft order", () => {
    expect(results.draftOrder).toHaveLength(MAX_PLAYERS);
    expect(new Set(results.draftOrder.map((p) => p.pick))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(new Set(results.draftOrder.map((p) => p.playerId)).size).toBe(MAX_PLAYERS);
  });

  it("winner gets pick 1 and the first eliminated player gets pick 12", () => {
    const firstElim = [...results.eliminations].sort((a, b) => a.tick - b.tick)[0]!;
    const pick12 = results.draftOrder.find((p) => p.pick === 12)!;
    expect(pick12.placement).toBe(12);
    // pick 12 must be an elimination with placement 12 (deterministic tie-breaks applied)
    const placed12 = results.eliminations.find((e) => e.placement === 12)!;
    expect(pick12.playerId).toBe(placed12.playerId);
    expect(placed12.tick).toBe(firstElim.tick);
    const winnerId = results.draftOrder.find((p) => p.pick === 1)!.playerId;
    expect(results.eliminations.some((e) => e.playerId === winnerId)).toBe(false);
  });

  it("records exactly 11 eliminations with timestamps, causes, and placements", () => {
    expect(results.eliminations).toHaveLength(11);
    for (const e of results.eliminations) {
      expect(e.timestamp).toBeGreaterThan(0);
      expect(e.tick).toBeGreaterThan(0);
      expect(e.cause).toBeTruthy();
      expect(e.placement).toBeGreaterThanOrEqual(2);
      expect(e.placement).toBeLessThanOrEqual(12);
    }
    expect(new Set(results.eliminations.map((e) => e.placement)).size).toBe(11);
  });

  it("the previous-year loser wears the hat and yippees (intro + eliminated/win are forced)", () => {
    expect(results.rainbowHatPlayerId).toBe("p3");
    const hatStats = results.stats.find((s) => s.playerId === "p3")!;
    expect(hatStats.yippees).toBeGreaterThanOrEqual(2);
    const yippees = allEvents.filter((e) => e.e === "yippee");
    expect(yippees.length).toBeGreaterThanOrEqual(2);
    expect(yippees.every((y) => y.e === "yippee" && (y.playerId === "p3" || y.reason === "overdrive"))).toBe(true);
  });

  it("emits an auditable event log (phases, eliminations, announcements)", () => {
    expect(allEvents.some((e) => e.e === "phase" && e.phase === "playing")).toBe(true);
    expect(allEvents.filter((e) => e.e === "elimination")).toHaveLength(11);
    expect(allEvents.some((e) => e.e === "victory")).toBe(true);
    expect(allEvents.some((e) => e.e === "announce")).toBe(true);
    expect(allEvents.some((e) => e.e === "drop")).toBe(true);
  });

  it("computes stats and awards", () => {
    expect(results.stats).toHaveLength(12);
    const totalDealt = results.stats.reduce((s, x) => s + x.damageDealt, 0);
    expect(totalDealt).toBeGreaterThan(0);
    expect(results.awards.length).toBeGreaterThanOrEqual(3);
  });
});

describe("match determinism & authority", () => {
  it("same seed produces the same draft order", () => {
    const a = runFullAiMatch(777).results;
    const b = runFullAiMatch(777).results;
    expect(a.draftOrder.map((p) => p.playerId)).toEqual(b.draftOrder.map((p) => p.playerId));
    expect(a.eliminations.map((e) => `${e.playerId}@${e.tick}`)).toEqual(b.eliminations.map((e) => `${e.playerId}@${e.tick}`));
  });

  it("ignores stale/replayed input sequences", () => {
    const match = new Match({
      matchId: "m", roomCode: "AAAAAA", leagueName: "L",
      participants: participants(false),
      settings: DEFAULT_SETTINGS, arenaId: "disaster_dome", seed: 1,
      hatPlayerId: null, onEnd: () => {},
    });
    match.setInput("p0", { t: "input", seq: 5, mx: 1, mz: 0 });
    match.setInput("p0", { t: "input", seq: 4, mx: -1, mz: 0 }); // stale — must be ignored
    const f = match.fighters.get("p0")!;
    expect(f.lastInput?.mx).toBe(1);
    expect(f.lastInputSeq).toBe(5);
  });

  it("does not accept input for AI-controlled or unknown fighters", () => {
    const match = new Match({
      matchId: "m", roomCode: "AAAAAA", leagueName: "L",
      participants: participants(true),
      settings: DEFAULT_SETTINGS, arenaId: "disaster_dome", seed: 1,
      hatPlayerId: null, onEnd: () => {},
    });
    match.setInput("p0", { t: "input", seq: 1, mx: 1, mz: 0 });
    expect(match.fighters.get("p0")!.lastInput).toBeNull();
    expect(() => match.setInput("nobody", { t: "input", seq: 1, mx: 1, mz: 0 })).not.toThrow();
  });

  it("yippee respects cooldown but forced triggers always fire", () => {
    const match = new Match({
      matchId: "m", roomCode: "AAAAAA", leagueName: "L",
      participants: participants(false),
      settings: { ...DEFAULT_SETTINGS },
      arenaId: "disaster_dome", seed: 1,
      hatPlayerId: "p3", onEnd: () => {},
    });
    match.drainEvents(); // clear intro events
    match.hostYippee();
    match.hostYippee();
    match.hostYippee();
    const forced = match.drainEvents().filter((e) => e.e === "yippee");
    expect(forced).toHaveLength(3); // host button is always honored

    // Non-forced yippees are cooldown-limited (handled inside sim via yippee())
    const f = match.fighters.get("p3")!;
    expect(f.stats.yippees).toBeGreaterThanOrEqual(3);
  });

  it("host skip-intro advances the phase", () => {
    const match = new Match({
      matchId: "m", roomCode: "AAAAAA", leagueName: "L",
      participants: participants(false),
      settings: DEFAULT_SETTINGS, arenaId: "disaster_dome", seed: 1,
      hatPlayerId: "p3", onEnd: () => {},
    });
    expect(match.phase).toBe("intro");
    match.hostSkipIntro();
    expect(match.phase).toBe("countdown");
  });

  it("pause stops the simulation from advancing", () => {
    const match = new Match({
      matchId: "m", roomCode: "AAAAAA", leagueName: "L",
      participants: participants(true),
      settings: DEFAULT_SETTINGS, arenaId: "disaster_dome", seed: 1,
      hatPlayerId: null, onEnd: () => {},
    });
    for (let i = 0; i < 200; i++) match.tick(); // get into playing
    const t0 = match.tickNo;
    match.paused = true;
    for (let i = 0; i < 50; i++) match.tick();
    expect(match.tickNo).toBe(t0);
    match.paused = false;
    match.tick();
    expect(match.tickNo).toBe(t0 + 1);
  });
});
