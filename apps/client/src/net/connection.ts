import type { ClientMessage, GameEvent, MatchResults, RoomSummary, ServerMessage, Snapshot } from "@ddd/shared";

export interface ConnectionState {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "closed";
  sessionId: string | null;
  role: "player" | "host" | "spectator";
  room: RoomSummary | null;
  slotIndex: number | null;
  participantId: string | null;
  reconnectToken: string | null;
  hostToken: string | null;
  joinUrl: string | null;
  results: MatchResults | null;
  lastError: { code: string; message: string } | null;
  rttMs: number;
}

type Listener = () => void;

const wsUrl = (): string => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
};

/**
 * WebSocket connection with auto-reconnect. Snapshots and events are delivered
 * via subscription (consumed by the Babylon world), room/lobby state via a
 * React-friendly store.
 */
export class GameConnection {
  state: ConnectionState = {
    status: "idle",
    sessionId: null,
    role: "player",
    room: null,
    slotIndex: null,
    participantId: null,
    reconnectToken: sessionStorage.getItem("ddd.reconnectToken"),
    hostToken: sessionStorage.getItem("ddd.hostToken"),
    joinUrl: null,
    results: null,
    lastError: null,
    rttMs: 0,
  };

  onSnapshot: ((snap: Snapshot) => void) | null = null;
  onEvents: ((events: GameEvent[]) => void) | null = null;

  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private roomCode: string | null = sessionStorage.getItem("ddd.roomCode");
  private reconnectAttempts = 0;
  private pingTimer: number | null = null;
  private inputSeq = 1;
  private closedByUser = false;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private notify(): void {
    this.state = { ...this.state };
    for (const fn of this.listeners) fn();
  }

  connect(role: "player" | "host" | "spectator", roomCode?: string): void {
    this.closedByUser = false;
    this.state.role = role;
    if (roomCode) this.roomCode = roomCode.toUpperCase();
    this.state.status = this.reconnectAttempts > 0 ? "reconnecting" : "connecting";
    this.notify();

    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.state.status = "connected";
      const token = this.state.role === "host" ? this.state.hostToken : this.state.reconnectToken;
      this.sendRaw({
        t: "hello",
        v: 1,
        role,
        ...(this.roomCode ? { roomCode: this.roomCode } : {}),
        ...(token ? { reconnectToken: token } : {}),
      });
      this.startPing();
      this.notify();
    };
    ws.onmessage = (ev) => this.handleMessage(JSON.parse(ev.data as string) as ServerMessage);
    ws.onclose = () => {
      this.stopPing();
      if (this.closedByUser) return;
      this.state.status = "reconnecting";
      this.notify();
      const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempts++);
      setTimeout(() => this.connect(this.state.role, this.roomCode ?? undefined), delay);
    };
    ws.onerror = () => ws.close();
  }

  close(): void {
    this.closedByUser = true;
    this.stopPing();
    this.ws?.close();
    this.state.status = "closed";
    this.notify();
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => this.sendRaw({ t: "ping", now: Date.now() }), 5000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case "welcome":
        this.state.sessionId = msg.sessionId;
        this.state.role = msg.role;
        this.notify();
        break;
      case "roomCreated":
        this.state.room = msg.room;
        this.state.hostToken = msg.hostToken;
        this.state.joinUrl = msg.joinUrl;
        this.state.role = "host";
        this.roomCode = msg.room.code;
        sessionStorage.setItem("ddd.hostToken", msg.hostToken);
        sessionStorage.setItem("ddd.roomCode", msg.room.code);
        this.notify();
        break;
      case "joined":
        this.state.room = msg.room;
        this.state.slotIndex = msg.slotIndex;
        this.state.participantId = msg.participantId;
        this.state.reconnectToken = msg.reconnectToken;
        sessionStorage.setItem("ddd.reconnectToken", msg.reconnectToken);
        if (this.roomCode) sessionStorage.setItem("ddd.roomCode", this.roomCode);
        this.notify();
        break;
      case "room":
        this.state.room = msg.room;
        this.notify();
        break;
      case "snapshot":
        this.onSnapshot?.(msg.snap);
        break;
      case "events":
        this.onEvents?.(msg.events);
        break;
      case "matchEnd":
        this.state.results = msg.results;
        this.notify();
        break;
      case "pong":
        this.state.rttMs = Date.now() - msg.now;
        break;
      case "error":
        this.state.lastError = { code: msg.code, message: msg.message };
        this.notify();
        break;
      case "kicked":
        this.close();
        break;
    }
  }

  sendRaw(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  send(msg: ClientMessage): void {
    this.sendRaw(msg);
  }

  /** Send a gameplay input frame; returns the sequence number used. */
  sendInput(input: Omit<Extract<ClientMessage, { t: "input" }>, "t" | "seq">): number {
    const seq = this.inputSeq++;
    this.sendRaw({ t: "input", seq, ...input });
    return seq;
  }

  clearError(): void {
    this.state.lastError = null;
    this.notify();
  }

  clearSession(): void {
    sessionStorage.removeItem("ddd.reconnectToken");
    sessionStorage.removeItem("ddd.roomCode");
    sessionStorage.removeItem("ddd.hostToken");
    this.roomCode = null;
    this.state.reconnectToken = null;
    this.state.hostToken = null;
  }
}

export const connection = new GameConnection();
