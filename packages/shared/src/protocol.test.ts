import { describe, expect, it } from "vitest";
import { safeParseClientMessage } from "./protocol.js";
import { WEAPONS } from "./weapons.js";
import { RARITY_WEIGHTS } from "./balance.js";

describe("protocol validation", () => {
  it("accepts a valid input message", () => {
    const msg = safeParseClientMessage(JSON.stringify({ t: "input", seq: 1, mx: 0.5, mz: -1, atk: true }));
    expect(msg?.t).toBe("input");
  });

  it("rejects out-of-range movement (no speed hacking via input)", () => {
    expect(safeParseClientMessage(JSON.stringify({ t: "input", seq: 1, mx: 99, mz: 0 }))).toBeNull();
  });

  it("rejects messages that try to set health/damage/placement — no such message exists", () => {
    for (const evil of [
      { t: "setHealth", hp: 9999 },
      { t: "setDamage", damage: 0 },
      { t: "setPlacement", placement: 1 },
      { t: "eliminate", target: "p3" },
    ]) {
      expect(safeParseClientMessage(JSON.stringify(evil))).toBeNull();
    }
  });

  it("rejects oversized and malformed payloads", () => {
    expect(safeParseClientMessage("{not json")).toBeNull();
    expect(safeParseClientMessage(JSON.stringify({ t: "joinRoom", roomCode: "ABC123", displayName: "x".repeat(500) }))).toBeNull();
    expect(safeParseClientMessage("x".repeat(5000))).toBeNull();
  });

  it("requires exactly 12 participant names to create a room", () => {
    const mk = (n: number) =>
      JSON.stringify({ t: "createRoom", leagueName: "L", participantNames: Array.from({ length: n }, (_, i) => `P${i}`) });
    expect(safeParseClientMessage(mk(12))?.t).toBe("createRoom");
    expect(safeParseClientMessage(mk(11))).toBeNull();
    expect(safeParseClientMessage(mk(13))).toBeNull();
  });
});

describe("weapon configs", () => {
  it("has at least 20 fully-defined weapons with unique ids", () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(WEAPONS.length);
    for (const w of WEAPONS) {
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.description.length).toBeGreaterThan(0);
      expect(RARITY_WEIGHTS[w.rarity]).toBeDefined();
      expect(w.damage).toBeGreaterThanOrEqual(0);
      expect(w.attackIntervalMs).toBeGreaterThan(0);
      expect(["auto", "direction"]).toContain(w.aim);
      if (w.class === "projectile" || w.class === "thrown" || w.class === "spread") {
        expect(w.projectileSpeed).toBeGreaterThan(0);
      }
    }
  });
});
