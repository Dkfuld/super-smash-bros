import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Room, type Session } from "./room.js";
import { Store } from "./store.js";

function fakeWs(): WebSocket & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    readyState: 1,
    send: (data: string) => sent.push(JSON.parse(data)),
    close: () => {},
    sent,
  } as unknown as WebSocket & { sent: unknown[] };
}

const NAMES = Array.from({ length: 12 }, (_, i) => `Member ${i}`);

function makeRoom(): { room: Room; store: Store } {
  const store = new Store(":memory:");
  const room = new Room("Test League", NAMES, store, () => {});
  return { room, store };
}

function join(room: Room, slotIndex: number | null = null): { ws: ReturnType<typeof fakeWs>; session: Session } {
  const ws = fakeWs();
  const session = room.addSession(ws, "player");
  if (slotIndex !== null) room.handleMessage(session, { t: "claimSlot", slotIndex });
  return { ws, session };
}

function hostSession(room: Room): { ws: ReturnType<typeof fakeWs>; session: Session } {
  const ws = fakeWs();
  const session = room.addSession(ws, "host");
  return { ws, session };
}

describe("room slots & assignment", () => {
  it("a room has exactly 12 participant slots — a 13th player cannot claim one", () => {
    const { room } = makeRoom();
    expect(room.slots).toHaveLength(12);
    for (let i = 0; i < 12; i++) join(room, i);
    const extra = join(room);
    room.handleMessage(extra.session, { t: "claimSlot", slotIndex: 0 });
    expect(extra.session.slotIndex).toBeNull();
    const err = extra.ws.sent.find((m) => (m as { t: string }).t === "error");
    expect(err).toBeTruthy();
  });

  it("two devices cannot claim the same participant", () => {
    const { room } = makeRoom();
    const a = join(room, 4);
    const b = join(room);
    room.handleMessage(b.session, { t: "claimSlot", slotIndex: 4 });
    expect(a.session.slotIndex).toBe(4);
    expect(b.session.slotIndex).toBeNull();
  });

  it("the match cannot start with unfilled slots and starts once AI fills them", () => {
    const { room } = makeRoom();
    const host = hostSession(room);
    join(room, 0);
    room.handleMessage(host.session, { t: "hostStartMatch" });
    expect(room.match).toBeNull();
    expect(host.ws.sent.some((m) => (m as { code?: string }).code === "notFull")).toBe(true);

    room.handleMessage(host.session, { t: "hostFillAi", slotIndex: null });
    room.handleMessage(host.session, { t: "hostStartMatch" });
    expect(room.match).not.toBeNull();
    room.stopMatch();
  });
});

describe("host authorization", () => {
  it("rejects host commands from non-host sessions", () => {
    const { room } = makeRoom();
    const player = join(room, 0);
    for (const msg of [
      { t: "hostStartMatch" } as const,
      { t: "hostSetPreviousLoser", slotIndex: 1 } as const,
      { t: "hostRenameParticipant", slotIndex: 1, name: "Hacked" } as const,
      { t: "hostYippee" } as const,
      { t: "hostCancel" } as const,
    ]) {
      room.handleMessage(player.session, msg);
    }
    expect(room.match).toBeNull();
    expect(room.slots[1]!.name).toBe("Member 1");
    const errors = player.ws.sent.filter((m) => (m as { code?: string }).code === "unauthorized");
    expect(errors.length).toBe(5);
  });

  it("honors host commands from the host session", () => {
    const { room } = makeRoom();
    const host = hostSession(room);
    room.handleMessage(host.session, { t: "hostRenameParticipant", slotIndex: 1, name: "Renamed" });
    room.handleMessage(host.session, { t: "hostSetPreviousLoser", slotIndex: 2 });
    expect(room.slots[1]!.name).toBe("Renamed");
    expect(room.slots[2]!.isPreviousLoser).toBe(true);
    expect(room.slots.filter((s) => s.isPreviousLoser)).toHaveLength(1);
  });
});

describe("player identity & input authority", () => {
  it("a session's inputs only ever drive its own fighter", () => {
    const { room } = makeRoom();
    const host = hostSession(room);
    const a = join(room, 0);
    room.handleMessage(host.session, { t: "hostFillAi", slotIndex: null });
    room.handleMessage(host.session, { t: "hostStartMatch" });
    const match = room.match!;
    const myId = room.slots[0]!.id;
    const otherId = room.slots[1]!.id;

    room.handleMessage(a.session, { t: "input", seq: 1, mx: 1, mz: 0 });
    expect(match.fighters.get(myId)!.lastInputSeq).toBe(1);
    expect(match.fighters.get(otherId)!.lastInputSeq).toBe(0); // untouched — no way to address another fighter
    room.stopMatch();
  });
});

describe("previous loser & rainbow hat", () => {
  it("the selected previous-year loser gets the hat when the match starts", () => {
    const { room } = makeRoom();
    const host = hostSession(room);
    room.handleMessage(host.session, { t: "hostSetPreviousLoser", slotIndex: 7 });
    room.handleMessage(host.session, { t: "hostFillAi", slotIndex: null });
    room.handleMessage(host.session, { t: "hostStartMatch" });
    const hatId = room.slots[7]!.id;
    expect(room.match!.fighters.get(hatId)!.hat).toBe(true);
    expect([...room.match!.fighters.values()].filter((f) => f.hat)).toHaveLength(1);
    room.stopMatch();
  });
});

describe("reconnection", () => {
  it("a disconnected player reconnects via token, keeping slot and state; no duplicate character", () => {
    vi.useFakeTimers();
    const { room } = makeRoom();
    const host = hostSession(room);
    const a = join(room, 0);
    const token = a.session.reconnectToken;
    room.handleMessage(host.session, { t: "hostFillAi", slotIndex: null });
    room.handleMessage(host.session, { t: "hostStartMatch" });
    const fighterId = room.slots[0]!.id;

    room.handleDisconnect(a.session);
    expect(room.slots[0]!.connStatus).toBe("disconnected");

    // grace elapses → AI takeover
    vi.advanceTimersByTime(25_000);
    expect(room.slots[0]!.connStatus).toBe("ai-takeover");
    expect(room.match!.fighters.get(fighterId)!.aiControlled).toBe(true);

    // reconnect with token → same session, control returned
    const ws2 = fakeWs();
    const s2 = room.addSession(ws2 as unknown as WebSocket, "player", token);
    expect(s2.id).toBe(a.session.id);
    expect(s2.slotIndex).toBe(0);
    expect(room.slots[0]!.connStatus).toBe("connected");
    expect(room.match!.fighters.get(fighterId)!.aiControlled).toBe(false);
    expect(room.match!.fighters.size).toBe(12); // no duplicates
    room.stopMatch();
    vi.useRealTimers();
  });

  it("an unknown reconnect token creates a fresh session instead", () => {
    const { room } = makeRoom();
    const ws = fakeWs();
    const s = room.addSession(ws as unknown as WebSocket, "player", "bogus-token");
    expect(s.slotIndex).toBeNull();
  });
});

describe("results persistence & export consistency", () => {
  it("saves results and the exported order matches the official one", async () => {
    const { room, store } = makeRoom();
    const host = hostSession(room);
    room.handleMessage(host.session, { t: "hostSetPreviousLoser", slotIndex: 3 });
    room.handleMessage(host.session, {
      t: "hostSetSettings",
      settings: { matchDurationTargetSec: 120, suddenDeathAtSec: 70, chaosLevel: 2 },
    });
    room.handleMessage(host.session, { t: "hostFillAi", slotIndex: null });
    room.handleMessage(host.session, { t: "hostStartMatch" });
    const match = room.match!;

    // Run the match to completion synchronously (bypasses the realtime loop).
    for (let i = 0; i < 30 * 60 * 12 && !match.results; i++) {
      match.tick();
      match.drainEvents();
    }
    expect(match.results).not.toBeNull();
    const results = match.results!;
    store.matchEnded(results);

    const loaded = store.getResults(results.matchId);
    expect(loaded).not.toBeNull();
    expect(loaded!.draftOrder).toEqual(results.draftOrder);
    expect(loaded!.draftOrder.find((p) => p.pick === 1)!.playerId).toBe(
      results.draftOrder.find((p) => p.pick === 1)!.playerId,
    );
    expect(store.listRecentMatches().some((m) => m.id === results.matchId)).toBe(true);
    room.stopMatch();
  });
});

describe("room code expiry", () => {
  it("codes are 6 chars from the unambiguous alphabet", () => {
    const { room } = makeRoom();
    expect(room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });
});
