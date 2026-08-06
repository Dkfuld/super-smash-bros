/** Deterministic seeded RNG (mulberry32). Used by the server sim so a match is replayable from its seed. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(arr: readonly T[]): T {
    const v = arr[this.int(0, arr.length - 1)];
    if (v === undefined) throw new Error("Rng.pick on empty array");
    return v;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Weighted pick from a { key: weight } table. */
  weighted(table: Record<string, number>): string {
    const entries = Object.entries(table);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [k, w] of entries) {
      roll -= w;
      if (roll <= 0) return k;
    }
    const last = entries[entries.length - 1];
    if (!last) throw new Error("Rng.weighted on empty table");
    return last[0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = a;
    }
    return arr;
  }
}
