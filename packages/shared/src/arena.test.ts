import { describe, expect, it } from "vitest";
import { DISASTER_DOME } from "./arena";

/** Spawn quality guarantees: nobody starts inside (or hugging) furniture,
 *  and everybody starts far from everybody else. */
describe("spawn points", () => {
  const blocking = DISASTER_DOME.boxes.filter((b) => !b.walkable);

  const clearance = (x: number, z: number): number => {
    let best = Infinity;
    for (const b of blocking) {
      const dx = Math.max(b.x - b.w / 2 - x, 0, x - (b.x + b.w / 2));
      const dz = Math.max(b.z - b.d / 2 - z, 0, z - (b.z + b.d / 2));
      best = Math.min(best, Math.hypot(dx, dz));
    }
    return best;
  };

  it("has 12 spawns, all clear of blocking furniture", () => {
    expect(DISASTER_DOME.spawnPoints).toHaveLength(12);
    for (const p of DISASTER_DOME.spawnPoints) {
      expect(clearance(p.x, p.z), `spawn (${p.x},${p.z})`).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("keeps fighters spread out at kickoff (≥11.5 apart, inside the dome)", () => {
    const pts = DISASTER_DOME.spawnPoints;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      expect(Math.abs(a.x)).toBeLessThanOrEqual(30);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(30);
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z), `spawns ${i} vs ${j}`).toBeGreaterThanOrEqual(11.5);
      }
    }
  });
});
