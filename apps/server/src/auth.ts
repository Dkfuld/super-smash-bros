import { randomBytes } from "node:crypto";

/** URL-safe cryptographically random token. */
export function token(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** 6-char room code avoiding ambiguous characters. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function roomCode(): string {
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[(buf[i] as number) % CODE_ALPHABET.length];
  return out;
}

/** Simple token bucket rate limiter. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly perSec: number,
    private readonly burst = perSec * 2,
  ) {
    this.tokens = this.burst;
  }
  allow(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
