import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  SIM,
  defaultCharacter,
  type CharacterConfig,
  type ClientMessage,
  type MatchResults,
  type MatchSettings,
  type ParticipantSlot,
  type RoomSummary,
  type ServerMessage,
} from "@ddd/shared";
import type { WebSocket } from "ws";
import { RateLimiter, roomCode, token } from "./auth.js";
import { Match } from "@ddd/shared";
import type { Store } from "./store.js";

export interface Session {
  id: string;
  ws: WebSocket | null;
  role: "player" | "host" | "spectator";
  slotIndex: number | null;
  reconnectToken: string;
  displayName: string;
  lastSeen: number;
  msgLimiter: RateLimiter;
  inputLimiter: RateLimiter;
  strikes: number;
  aiTakeoverTimer: NodeJS.Timeout | null;
}

/**
 * One league room: lobby management, host authority, session lifecycle,
 * reconnection, and the authoritative match loop.
 */
export class Room {
  readonly code = roomCode();
  readonly hostToken = token();
  readonly createdAt = Date.now();
  leagueName: string;
  arenaId = "disaster_dome";
  settings: MatchSettings = { ...DEFAULT_SETTINGS };
  slots: ParticipantSlot[];
  assignmentsLocked = false;
  readonly sessions = new Map<string, Session>();
  match: Match | null = null;
  lastResults: MatchResults | null = null;
  private loop: NodeJS.Timeout | null = null;
  private tickCounter = 0;
  private persistedEventSeq = 0;
  private matchId: string | null = null;
  private spectatorQueue: Array<{ sendAt: number; json: string }> = [];

  constructor(
    leagueName: string,
    participantNames: string[],
    private readonly store: Store,
    private readonly onEmpty: (room: Room) => void,
  ) {
    this.leagueName = leagueName;
    this.slots = participantNames.slice(0, MAX_PLAYERS).map((name, i) => ({
      slotIndex: i,
      id: `pl_${i}_${token(6)}`,
      name,
      status: "empty",
      connStatus: "disconnected",
      ready: false,
      isPreviousLoser: false,
      character: defaultCharacter(i),
    }));
  }

  get phase() {
    return this.match?.phase ?? "lobby";
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      leagueName: this.leagueName,
      phase: this.phase,
      slots: this.slots,
      settings: this.settings,
      arenaId: this.arenaId,
      assignmentsLocked: this.assignmentsLocked,
    };
  }

  // ---------------- session lifecycle ----------------

  addSession(ws: WebSocket, role: "player" | "host" | "spectator", reconnectToken?: string): Session {
    // Reconnect path: token matches an existing session → reattach.
    if (reconnectToken) {
      if (reconnectToken === this.hostToken) {
        for (const s of this.sessions.values()) {
          if (s.role === "host") {
            s.ws = ws;
            s.lastSeen = Date.now();
            return s;
          }
        }
      }
      for (const s of this.sessions.values()) {
        if (s.reconnectToken === reconnectToken) {
          s.ws = ws;
          s.lastSeen = Date.now();
          if (s.aiTakeoverTimer) {
            clearTimeout(s.aiTakeoverTimer);
            s.aiTakeoverTimer = null;
          }
          if (s.slotIndex !== null) {
            const slot = this.slots[s.slotIndex];
            if (slot) {
              slot.connStatus = "connected";
              // Return control from AI to the human (state, inventory, position preserved server-side).
              if (slot.status === "human") this.match?.setAiControlled(slot.id, false);
            }
          }
          this.broadcastRoom();
          return s;
        }
      }
    }
    const s: Session = {
      id: `s_${token(8)}`,
      ws,
      role,
      slotIndex: null,
      reconnectToken: token(),
      displayName: "",
      lastSeen: Date.now(),
      msgLimiter: new RateLimiter(SIM.MSG_RATE_LIMIT_PER_SEC),
      inputLimiter: new RateLimiter(SIM.INPUT_RATE_LIMIT_PER_SEC),
      strikes: 0,
      aiTakeoverTimer: null,
    };
    this.sessions.set(s.id, s);
    return s;
  }

  handleDisconnect(session: Session): void {
    session.ws = null;
    session.lastSeen = Date.now();
    if (session.slotIndex !== null) {
      const slot = this.slots[session.slotIndex];
      if (slot && slot.status === "human") {
        slot.connStatus = "disconnected";
        // Keep the character active briefly; AI takes over after the grace period.
        if (this.match && this.match.phase !== "ended" && this.match.phase !== "victory") {
          session.aiTakeoverTimer = setTimeout(() => {
            if (slot.connStatus === "disconnected") {
              slot.connStatus = "ai-takeover";
              this.match?.setAiControlled(slot.id, true);
              this.broadcastRoom();
            }
          }, SIM.RECONNECT_GRACE_MS);
        }
        this.broadcastRoom();
      }
    }
    // Drop fully-idle lobby rooms.
    const anyConnected = [...this.sessions.values()].some((s) => s.ws);
    if (!anyConnected && !this.match) {
      setTimeout(() => {
        const stillEmpty = ![...this.sessions.values()].some((s) => s.ws);
        if (stillEmpty && !this.match) this.onEmpty(this);
      }, 60_000);
    }
  }

  // ---------------- messaging ----------------

  send(session: Session, msg: ServerMessage): void {
    if (session.ws && session.ws.readyState === 1) {
      session.ws.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: ServerMessage, opts: { skipSpectators?: boolean } = {}): void {
    const json = JSON.stringify(msg);
    const delayMs = this.settings.spectatorDelaySec * 1000;
    for (const s of this.sessions.values()) {
      if (!s.ws || s.ws.readyState !== 1) continue;
      if (s.role === "spectator") {
        if (opts.skipSpectators) continue;
        if (delayMs > 0 && (msg.t === "snapshot" || msg.t === "events")) {
          this.spectatorQueue.push({ sendAt: Date.now() + delayMs, json });
          continue;
        }
      }
      s.ws.send(json);
    }
  }

  broadcastRoom(): void {
    this.broadcast({ t: "room", room: this.summary() });
  }

  private flushSpectatorQueue(): void {
    if (this.spectatorQueue.length === 0) return;
    const now = Date.now();
    while (this.spectatorQueue.length > 0 && (this.spectatorQueue[0]?.sendAt ?? Infinity) <= now) {
      const item = this.spectatorQueue.shift()!;
      for (const s of this.sessions.values()) {
        if (s.role === "spectator" && s.ws && s.ws.readyState === 1) s.ws.send(item.json);
      }
    }
  }

  // ---------------- client message handling ----------------

  handleMessage(session: Session, msg: ClientMessage): void {
    session.lastSeen = Date.now();

    if (msg.t === "input") {
      if (!session.inputLimiter.allow()) return;
      if (session.slotIndex === null || !this.match) return;
      const slot = this.slots[session.slotIndex];
      if (!slot) return;
      // Sessions can only ever drive the fighter bound to their own slot.
      this.match.setInput(slot.id, msg);
      return;
    }

    const isHost = session.role === "host";
    switch (msg.t) {
      case "joinRoom": {
        session.displayName = msg.displayName;
        this.send(session, {
          t: "joined",
          room: this.summary(),
          slotIndex: session.slotIndex,
          reconnectToken: session.reconnectToken,
          participantId: session.slotIndex !== null ? this.slots[session.slotIndex]?.id ?? null : null,
        });
        this.broadcastRoom();
        break;
      }
      case "claimSlot": {
        if (this.assignmentsLocked && !isHost) return this.err(session, "locked", "Assignments are locked");
        const slot = this.slots[msg.slotIndex];
        if (!slot) return;
        if (slot.status !== "empty" && slot.slotIndex !== session.slotIndex) {
          return this.err(session, "taken", "That league member is already claimed");
        }
        // Release previous claim
        if (session.slotIndex !== null) {
          const prev = this.slots[session.slotIndex];
          if (prev) {
            prev.status = "empty";
            prev.connStatus = "disconnected";
            prev.ready = false;
          }
        }
        slot.status = "human";
        slot.connStatus = "connected";
        session.slotIndex = slot.slotIndex;
        this.send(session, {
          t: "joined",
          room: this.summary(),
          slotIndex: slot.slotIndex,
          reconnectToken: session.reconnectToken,
          participantId: slot.id,
        });
        this.broadcastRoom();
        break;
      }
      case "setCharacter": {
        if (session.slotIndex === null) return;
        const slot = this.slots[session.slotIndex];
        if (slot) {
          slot.character = msg.character as CharacterConfig;
          this.broadcastRoom();
        }
        break;
      }
      case "setReady": {
        if (session.slotIndex === null) return;
        const slot = this.slots[session.slotIndex];
        if (slot) {
          slot.ready = msg.ready;
          this.broadcastRoom();
        }
        break;
      }
      case "controlTest":
        break; // client-local; accepted for latency measurement only
      case "ping":
        this.send(session, { t: "pong", now: msg.now, serverTime: Date.now() });
        break;

      // ---- host commands ----
      case "hostRenameParticipant":
        if (!isHost) return this.unauthorized(session);
        if (this.match) return this.err(session, "inMatch", "Cannot rename mid-match");
        {
          const slot = this.slots[msg.slotIndex];
          if (slot) {
            slot.name = msg.name;
            this.broadcastRoom();
          }
        }
        break;
      case "hostSetPreviousLoser":
        if (!isHost) return this.unauthorized(session);
        if (this.match) return this.err(session, "inMatch", "Cannot change mid-match");
        this.slots.forEach((s) => (s.isPreviousLoser = s.slotIndex === msg.slotIndex));
        this.broadcastRoom();
        break;
      case "hostAssignDevice": {
        if (!isHost) return this.unauthorized(session);
        const slot = this.slots[msg.slotIndex];
        if (!slot) return;
        if (msg.sessionId === null) {
          for (const s of this.sessions.values()) if (s.slotIndex === msg.slotIndex) s.slotIndex = null;
          if (slot.status === "human") {
            slot.status = "empty";
            slot.connStatus = "disconnected";
            slot.ready = false;
          }
        } else {
          const target = this.sessions.get(msg.sessionId);
          if (!target || target.role !== "player") return this.err(session, "noSession", "Unknown device");
          if (target.slotIndex !== null) {
            const prev = this.slots[target.slotIndex];
            if (prev) {
              prev.status = "empty";
              prev.connStatus = "disconnected";
            }
          }
          target.slotIndex = msg.slotIndex;
          slot.status = "human";
          slot.connStatus = target.ws ? "connected" : "disconnected";
          this.send(target, {
            t: "joined",
            room: this.summary(),
            slotIndex: msg.slotIndex,
            reconnectToken: target.reconnectToken,
            participantId: slot.id,
          });
        }
        this.broadcastRoom();
        break;
      }
      case "hostLockAssignments":
        if (!isHost) return this.unauthorized(session);
        this.assignmentsLocked = msg.locked;
        this.broadcastRoom();
        break;
      case "hostFillAi": {
        if (!isHost) return this.unauthorized(session);
        const fill = (slot: ParticipantSlot) => {
          if (slot.status === "empty") {
            slot.status = "ai";
            slot.connStatus = "connected";
            slot.ready = true;
          }
        };
        if (msg.slotIndex === null) this.slots.forEach(fill);
        else {
          const slot = this.slots[msg.slotIndex];
          if (slot) {
            if (slot.status === "ai") {
              slot.status = "empty";
              slot.connStatus = "disconnected";
              slot.ready = false;
            } else fill(slot);
          }
        }
        this.broadcastRoom();
        break;
      }
      case "hostSetSettings":
        if (!isHost) return this.unauthorized(session);
        this.settings = { ...this.settings, ...msg.settings };
        this.broadcastRoom();
        break;
      case "hostSetArena":
        if (!isHost) return this.unauthorized(session);
        this.arenaId = msg.arenaId;
        this.broadcastRoom();
        break;
      case "hostReadyCheck":
        if (!isHost) return this.unauthorized(session);
        this.slots.forEach((s) => {
          if (s.status === "human") s.ready = false;
        });
        this.broadcastRoom();
        break;
      case "hostStartMatch":
        if (!isHost) return this.unauthorized(session);
        this.startMatch(session);
        break;
      case "hostPause":
        if (!isHost) return this.unauthorized(session);
        if (this.match) {
          this.match.paused = msg.paused;
          this.broadcastRoom();
        }
        break;
      case "hostRestart":
        if (!isHost) return this.unauthorized(session);
        this.stopMatch();
        this.startMatch(session);
        break;
      case "hostCancel":
        if (!isHost) return this.unauthorized(session);
        this.stopMatch();
        this.broadcastRoom();
        break;
      case "hostSkipIntro":
        if (!isHost) return this.unauthorized(session);
        this.match?.hostSkipIntro();
        break;
      case "hostYippee":
        if (!isHost) return this.unauthorized(session);
        this.match?.hostYippee();
        break;
      case "hostCommentary":
        if (!isHost) return this.unauthorized(session);
        this.match?.hostCommentary(msg.kind);
        break;
      case "hostTestSound":
        if (!isHost) return this.unauthorized(session);
        this.broadcast({ t: "events", events: [{ e: "announce", tick: 0, line: "Sound check! One, two, is this thing absurd?", mood: "test" }] });
        break;
      default:
        break;
    }
  }

  private err(session: Session, code: string, message: string): void {
    this.send(session, { t: "error", code, message });
  }

  private unauthorized(session: Session): void {
    session.strikes++;
    this.err(session, "unauthorized", "Host authorization required");
  }

  // ---------------- match lifecycle ----------------

  startMatch(hostSession: Session): void {
    if (this.match && this.match.phase !== "ended") {
      return this.err(hostSession, "inMatch", "A match is already running");
    }
    const unfilled = this.slots.filter((s) => s.status === "empty");
    if (unfilled.length > 0) {
      return this.err(
        hostSession,
        "notFull",
        `All 12 participants need a device or AI substitute (${unfilled.length} unfilled). Use "Fill with AI".`,
      );
    }
    // Duplicate-assignment guard: one session per slot.
    const seen = new Set<number>();
    for (const s of this.sessions.values()) {
      if (s.slotIndex === null) continue;
      if (seen.has(s.slotIndex)) return this.err(hostSession, "dupAssign", "Two devices are assigned to the same participant");
      seen.add(s.slotIndex);
    }

    const hatSlot = this.slots.find((s) => s.isPreviousLoser);
    this.matchId = `m_${Date.now().toString(36)}_${token(4)}`;
    this.persistedEventSeq = 0;
    this.tickCounter = 0;
    this.match = new Match({
      matchId: this.matchId,
      roomCode: this.code,
      leagueName: this.leagueName,
      participants: this.slots,
      settings: this.settings,
      arenaId: this.arenaId,
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
      hatPlayerId: hatSlot?.id ?? null,
      onEnd: (results) => {
        this.lastResults = results;
        this.store.matchEnded(results);
        this.broadcast({ t: "matchEnd", results });
        // Keep the loop alive briefly for the victory scene, then stop.
        setTimeout(() => this.stopLoop(), 20_000);
      },
    });
    this.store.matchStarted({
      id: this.matchId,
      roomCode: this.code,
      leagueName: this.leagueName,
      arenaId: this.arenaId,
      startedAt: Date.now(),
      hatPlayerId: hatSlot?.id ?? null,
      settings: this.settings,
    });
    // Disconnected human slots start under AI control immediately.
    for (const slot of this.slots) {
      if (slot.status === "human" && slot.connStatus !== "connected") {
        slot.connStatus = "ai-takeover";
        this.match.setAiControlled(slot.id, true);
      }
    }
    this.broadcastRoom();
    this.loop = setInterval(() => this.tick(), SIM.TICK_MS);
  }

  private tick(): void {
    const match = this.match;
    if (!match) return;
    match.tick();
    this.tickCounter++;
    this.flushSpectatorQueue();

    if (this.tickCounter % SIM.SNAPSHOT_EVERY_N_TICKS === 0) {
      const events = match.drainEvents();
      if (events.length > 0 && this.matchId) {
        this.store.appendEvents(this.matchId, this.persistedEventSeq, events);
        this.persistedEventSeq += events.length;
        this.broadcast({ t: "events", events });
      }
      const snap = match.buildSnapshot();
      const acks = match.inputAcks();
      // Per-player snapshots carry that player's input ack for reconciliation.
      for (const s of this.sessions.values()) {
        if (!s.ws || s.ws.readyState !== 1) continue;
        if (s.role === "spectator" && this.settings.spectatorDelaySec > 0) {
          this.spectatorQueue.push({
            sendAt: Date.now() + this.settings.spectatorDelaySec * 1000,
            json: JSON.stringify({ t: "snapshot", snap }),
          });
          continue;
        }
        const slotId = s.slotIndex !== null ? this.slots[s.slotIndex]?.id : undefined;
        const withAck = slotId !== undefined ? { ...snap, lastProcessedInput: acks[slotId] } : snap;
        s.ws.send(JSON.stringify({ t: "snapshot", snap: withAck }));
      }
    }
  }

  private stopLoop(): void {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  stopMatch(): void {
    this.stopLoop();
    this.match = null;
    this.matchId = null;
    this.slots.forEach((s) => {
      s.ready = false;
      if (s.status === "human" && s.connStatus === "ai-takeover") s.connStatus = "disconnected";
    });
  }

  destroy(): void {
    this.stopLoop();
    for (const s of this.sessions.values()) {
      if (s.aiTakeoverTimer) clearTimeout(s.aiTakeoverTimer);
      s.ws?.close();
    }
    this.sessions.clear();
  }
}
