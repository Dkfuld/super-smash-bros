import { describe, expect, it } from "vitest";
import { assignPlacements, computeDraftOrder, draftOrderAsCsv, draftOrderAsText } from "./draft.js";
import { defaultCharacter } from "./customization.js";
import type { EliminationRecord, ParticipantSlot } from "./types.js";

function participants(): ParticipantSlot[] {
  return Array.from({ length: 12 }, (_, i) => ({
    slotIndex: i,
    id: `p${i}`,
    name: `Player ${i}`,
    status: "human" as const,
    connStatus: "connected" as const,
    ready: true,
    isPreviousLoser: i === 3,
    character: defaultCharacter(i),
  }));
}

function elim(playerId: string, tick: number, extra: Partial<EliminationRecord> = {}): EliminationRecord {
  const slotIndex = Number(playerId.slice(1));
  return {
    playerId,
    playerName: `Player ${slotIndex}`,
    tick,
    timestamp: 1000 + tick,
    cause: "damage",
    byPlayerId: null,
    withWeapon: null,
    damageReceived: 100,
    slotIndex,
    placement: 0,
    ...extra,
  };
}

describe("computeDraftOrder", () => {
  it("winner receives pick 1 and first eliminated receives pick 12", () => {
    const ps = participants();
    // p0 out first, p1 second, ... p10 out last; p11 wins.
    const elims = Array.from({ length: 11 }, (_, i) => elim(`p${i}`, 100 + i * 10));
    const picks = computeDraftOrder(elims, ps);
    expect(picks.find((p) => p.pick === 1)?.playerId).toBe("p11");
    expect(picks.find((p) => p.pick === 12)?.playerId).toBe("p0");
    expect(picks.find((p) => p.pick === 11)?.playerId).toBe("p1");
    expect(picks.find((p) => p.pick === 2)?.playerId).toBe("p10");
  });

  it("produces 12 unique picks covering 1..12", () => {
    const ps = participants();
    const elims = Array.from({ length: 11 }, (_, i) => elim(`p${i}`, 50 + i));
    const picks = computeDraftOrder(elims, ps);
    expect(picks).toHaveLength(12);
    expect(new Set(picks.map((p) => p.pick))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(new Set(picks.map((p) => p.playerId)).size).toBe(12);
  });

  it("breaks same-tick ties by higher damageReceived eliminated first", () => {
    const ps = participants();
    const elims = [
      elim("p0", 500, { damageReceived: 120 }),
      elim("p1", 500, { damageReceived: 180 }), // more beaten up → out first → pick 12
      ...Array.from({ length: 9 }, (_, i) => elim(`p${i + 2}`, 600 + i)),
    ];
    const picks = computeDraftOrder(elims, ps);
    expect(picks.find((p) => p.pick === 12)?.playerId).toBe("p1");
    expect(picks.find((p) => p.pick === 11)?.playerId).toBe("p0");
  });

  it("breaks full ties by lower slot index eliminated first", () => {
    const ps = participants();
    const elims = [
      elim("p4", 500, { damageReceived: 100 }),
      elim("p2", 500, { damageReceived: 100 }), // lower slot → out first
      ...Array.from({ length: 9 }, (_, i) => elim(`p${[0, 1, 3, 5, 6, 7, 8, 9, 10][i]}`, 600 + i)),
    ];
    const picks = computeDraftOrder(elims, ps);
    expect(picks.find((p) => p.pick === 12)?.playerId).toBe("p2");
    expect(picks.find((p) => p.pick === 11)?.playerId).toBe("p4");
  });

  it("is deterministic regardless of input order", () => {
    const ps = participants();
    const elims = Array.from({ length: 11 }, (_, i) => elim(`p${i}`, 100 + (i % 3), { damageReceived: 50 + i }));
    const a = computeDraftOrder([...elims], ps);
    const b = computeDraftOrder([...elims].reverse(), ps);
    expect(a).toEqual(b);
  });

  it("rejects wrong participant counts", () => {
    expect(() => computeDraftOrder([], participants().slice(0, 5))).toThrow(/exactly 12/);
  });

  it("rejects duplicate eliminations and wrong survivor counts", () => {
    const ps = participants();
    const dup = [elim("p0", 1), elim("p0", 2), ...Array.from({ length: 9 }, (_, i) => elim(`p${i + 1}`, 10 + i))];
    expect(() => computeDraftOrder(dup, ps)).toThrow(/Duplicate/);
    const tooFew = Array.from({ length: 10 }, (_, i) => elim(`p${i}`, 10 + i));
    expect(() => computeDraftOrder(tooFew, ps)).toThrow(/survivor/);
  });
});

describe("assignPlacements", () => {
  it("assigns 12..2 in elimination order", () => {
    const records = Array.from({ length: 11 }, (_, i) => elim(`p${i}`, 100 + i));
    const placed = assignPlacements(records);
    expect(placed[0]?.placement).toBe(12);
    expect(placed[10]?.placement).toBe(2);
  });
});

describe("exports", () => {
  it("text and csv exports match the official order", () => {
    const ps = participants();
    const elims = Array.from({ length: 11 }, (_, i) => elim(`p${i}`, 100 + i));
    const picks = computeDraftOrder(elims, ps);
    const text = draftOrderAsText("Test League", picks);
    expect(text).toContain("1. Player 11");
    expect(text).toContain("12. Player 0");
    const csv = draftOrderAsCsv(picks);
    expect(csv.split("\n")).toHaveLength(13);
    expect(csv).toContain('1,"Player 11",1');
  });
});
