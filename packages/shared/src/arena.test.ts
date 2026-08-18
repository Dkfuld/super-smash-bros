import { describe, expect, it } from "vitest";
import { DISASTER_DOME, STEP_UP, collidesBlocking } from "./arena";
import { SIM } from "./balance";

/** Spawn quality guarantees: nobody starts inside (or hugging) furniture that
 *  actually blocks movement at ground level, and everybody starts far apart.
 *  Uses the sim's own collision predicate — the `walkable` flag alone lies
 *  (a 1.2-high "walkable" stage still blocks a fighter standing at y=0). */
describe("spawn points", () => {
  // Boxes that block a ground-level fighter, per the sim's STEP_UP rule.
  const blocking = DISASTER_DOME.boxes.filter((b) => (b.y ?? 0) + b.h - 0 > STEP_UP);

  const clearance = (x: number, z: number): number => {
    let best = Infinity;
    for (const b of blocking) {
      const dx = Math.max(b.x - b.w / 2 - x, 0, x - (b.x + b.w / 2));
      const dz = Math.max(b.z - b.d / 2 - z, 0, z - (b.z + b.d / 2));
      best = Math.min(best, Math.hypot(dx, dz));
    }
    return best;
  };

  it("has 12 spawns, none colliding per the sim's own predicate", () => {
    expect(DISASTER_DOME.spawnPoints).toHaveLength(12);
    for (const p of DISASTER_DOME.spawnPoints) {
      expect(collidesBlocking(DISASTER_DOME, p.x, p.z, 0, SIM.PLAYER_RADIUS), `spawn (${p.x},${p.z}) collides`).toBe(false);
      expect(clearance(p.x, p.z), `spawn (${p.x},${p.z}) clearance`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("keeps fighters spread out at kickoff (≥10.5 apart, inside the dome)", () => {
    const pts = DISASTER_DOME.spawnPoints;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      expect(Math.abs(a.x)).toBeLessThanOrEqual(30);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(30);
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z), `spawns ${i} vs ${j}`).toBeGreaterThanOrEqual(10.5);
      }
    }
  });
});
