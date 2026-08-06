import { z } from "zod";
import type { GameEvent, MatchResults, RoomSummary, Snapshot } from "./types.js";

/**
 * Network protocol v1. Every client→server message is zod-validated on the
 * server before touching any game state; unknown/invalid messages are dropped
 * and count against the sender's rate limit.
 */
export const PROTOCOL_VERSION = 1;

const name = z.string().trim().min(1).max(24);
const id = z.string().min(1).max(64);

export const CharacterConfigSchema = z.object({
  bodyId: z.string().max(32),
  colorId: z.string().max(32),
  faceId: z.string().max(32),
  hairId: z.string().max(32),
  accessoryId: z.string().max(32),
});

export const MatchSettingsSchema = z.object({
  matchDurationTargetSec: z.number().min(120).max(1200),
  weaponDropRate: z.number().min(0).max(3),
  weaponRarityBoost: z.number().min(0).max(1),
  hazardFrequency: z.number().min(0).max(3),
  chaosLevel: z.number().min(0).max(3),
  zoneShrinkSpeed: z.number().min(0.25).max(3),
  startingHealth: z.number().min(25).max(400),
  knockbackScale: z.number().min(0.25).max(3),
  powerUpRate: z.number().min(0).max(3),
  aiDifficulty: z.number().min(0).max(2),
  friendlyVisualEffects: z.boolean(),
  announcerVolume: z.number().min(0).max(1),
  musicVolume: z.number().min(0).max(1),
  yippeeFrequency: z.number().min(0).max(3),
  makeLastPlaceSuffer: z.boolean(),
  suddenDeathAtSec: z.number().min(60).max(1800),
  spectatorDelaySec: z.number().min(0).max(60),
});

/** Movement + action input. Client sends at most 30/sec; server clamps everything. */
export const InputSchema = z.object({
  t: z.literal("input"),
  seq: z.number().int().min(0).max(1e9),
  mx: z.number().min(-1).max(1), // move x
  mz: z.number().min(-1).max(1), // move z
  yaw: z.number().min(-10).max(10).optional(), // desired facing (aim override)
  atk: z.boolean().optional(),
  heavyHold: z.boolean().optional(), // holding = charging, release fires
  dodge: z.boolean().optional(),
  jump: z.boolean().optional(),
  pickup: z.boolean().optional(),
  drop: z.boolean().optional(),
  interact: z.boolean().optional(),
  emote: z.number().int().min(0).max(8).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("t", [
  // -- lobby / identity --
  z.object({
    t: z.literal("hello"),
    v: z.number().int(),
    role: z.enum(["player", "host", "spectator"]),
    roomCode: z.string().length(6).optional(),
    reconnectToken: z.string().max(128).optional(),
  }),
  z.object({ t: z.literal("createRoom"), leagueName: name, participantNames: z.array(name).length(12) }),
  z.object({ t: z.literal("joinRoom"), roomCode: z.string().length(6), displayName: name }),
  z.object({ t: z.literal("claimSlot"), slotIndex: z.number().int().min(0).max(11) }),
  z.object({ t: z.literal("setCharacter"), character: CharacterConfigSchema }),
  z.object({ t: z.literal("setReady"), ready: z.boolean() }),
  z.object({ t: z.literal("controlTest"), action: z.enum(["move", "attack", "dodge"]) }),

  // -- host commands (require host token auth on the connection) --
  z.object({ t: z.literal("hostRenameParticipant"), slotIndex: z.number().int().min(0).max(11), name }),
  z.object({ t: z.literal("hostSetPreviousLoser"), slotIndex: z.number().int().min(0).max(11) }),
  z.object({ t: z.literal("hostAssignDevice"), slotIndex: z.number().int().min(0).max(11), sessionId: id.nullable() }),
  z.object({ t: z.literal("hostLockAssignments"), locked: z.boolean() }),
  z.object({ t: z.literal("hostFillAi"), slotIndex: z.number().int().min(0).max(11).nullable() }),
  z.object({ t: z.literal("hostSetSettings"), settings: MatchSettingsSchema.partial() }),
  z.object({ t: z.literal("hostSetArena"), arenaId: z.string().max(32) }),
  z.object({ t: z.literal("hostReadyCheck") }),
  z.object({ t: z.literal("hostStartMatch") }),
  z.object({ t: z.literal("hostPause"), paused: z.boolean() }),
  z.object({ t: z.literal("hostRestart") }),
  z.object({ t: z.literal("hostCancel") }),
  z.object({ t: z.literal("hostSkipIntro") }),
  z.object({ t: z.literal("hostYippee") }),
  z.object({ t: z.literal("hostCommentary"), kind: z.enum(["hype", "roast", "stats"]) }),
  z.object({ t: z.literal("hostTestSound") }),

  // -- gameplay --
  InputSchema,

  z.object({ t: z.literal("ping"), now: z.number() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type InputMessage = z.infer<typeof InputSchema>;

/** Server → client messages (typed, not validated client-side beyond try/catch). */
export type ServerMessage =
  | { t: "welcome"; sessionId: string; role: "player" | "host" | "spectator"; protocol: number }
  | { t: "roomCreated"; room: RoomSummary; hostToken: string; joinUrl: string }
  | { t: "joined"; room: RoomSummary; slotIndex: number | null; reconnectToken: string; participantId: string | null }
  | { t: "room"; room: RoomSummary }
  | { t: "snapshot"; snap: Snapshot }
  | { t: "events"; events: GameEvent[] }
  | { t: "matchEnd"; results: MatchResults }
  | { t: "pong"; now: number; serverTime: number }
  | { t: "error"; code: string; message: string }
  | { t: "kicked"; reason: string };

export function safeParseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = ClientMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
