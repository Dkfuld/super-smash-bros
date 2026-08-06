import { SIM } from "@ddd/shared";
import { Room } from "./room.js";
import type { Store } from "./store.js";

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private readonly store: Store) {
    // Expire abandoned room codes.
    setInterval(() => {
      const now = Date.now();
      for (const [code, room] of this.rooms) {
        if (now - room.createdAt > SIM.ROOM_CODE_TTL_MS && !room.match) {
          room.destroy();
          this.rooms.delete(code);
        }
      }
    }, 60_000).unref();
  }

  create(leagueName: string, participantNames: string[]): Room {
    const room = new Room(leagueName, participantNames, this.store, (r) => {
      r.destroy();
      this.rooms.delete(r.code);
    });
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (room && Date.now() - room.createdAt > SIM.ROOM_CODE_TTL_MS && !room.match) {
      room.destroy();
      this.rooms.delete(room.code);
      return undefined;
    }
    return room;
  }

  count(): number {
    return this.rooms.size;
  }
}
