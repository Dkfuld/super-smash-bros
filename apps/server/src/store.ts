import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { GameEvent, MatchResults } from "@ddd/shared";

// Loaded via getBuiltinModule so bundler/test transforms never try to resolve
// the (very new) node:sqlite specifier statically.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;

/**
 * Embedded persistence via Node's built-in sqlite (zero native deps).
 * database/migrations/ contains the equivalent PostgreSQL DDL for a
 * Supabase/Postgres production deployment; this class is the only module that
 * touches storage, so swapping drivers is a one-file change.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path = process.env.DDD_DB_PATH ?? "data/ddd.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        league_name TEXT NOT NULL,
        arena_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        rainbow_hat_player TEXT,
        settings_json TEXT NOT NULL,
        results_json TEXT
      );
      CREATE TABLE IF NOT EXISTS match_events (
        match_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        tick INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY (match_id, seq)
      );
      CREATE TABLE IF NOT EXISTS draft_picks (
        match_id TEXT NOT NULL,
        pick INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        placement INTEGER NOT NULL,
        PRIMARY KEY (match_id, pick)
      );
    `);
  }

  matchStarted(m: { id: string; roomCode: string; leagueName: string; arenaId: string; startedAt: number; hatPlayerId: string | null; settings: unknown }): void {
    this.db
      .prepare("INSERT OR REPLACE INTO matches (id, room_code, league_name, arena_id, started_at, rainbow_hat_player, settings_json) VALUES (?,?,?,?,?,?,?)")
      .run(m.id, m.roomCode, m.leagueName, m.arenaId, m.startedAt, m.hatPlayerId, JSON.stringify(m.settings));
  }

  appendEvents(matchId: string, startSeq: number, events: GameEvent[]): void {
    const stmt = this.db.prepare("INSERT OR IGNORE INTO match_events (match_id, seq, tick, event_json) VALUES (?,?,?,?)");
    events.forEach((e, i) => stmt.run(matchId, startSeq + i, e.tick, JSON.stringify(e)));
  }

  matchEnded(results: MatchResults): void {
    this.db
      .prepare("UPDATE matches SET ended_at = ?, results_json = ? WHERE id = ?")
      .run(results.endedAt, JSON.stringify(results), results.matchId);
    const stmt = this.db.prepare("INSERT OR REPLACE INTO draft_picks (match_id, pick, player_id, player_name, placement) VALUES (?,?,?,?,?)");
    for (const p of results.draftOrder) stmt.run(results.matchId, p.pick, p.playerId, p.playerName, p.placement);
  }

  getResults(matchId: string): MatchResults | null {
    const row = this.db.prepare("SELECT results_json FROM matches WHERE id = ?").get(matchId) as { results_json?: string } | undefined;
    if (!row?.results_json) return null;
    return JSON.parse(row.results_json) as MatchResults;
  }

  listRecentMatches(limit = 20): Array<{ id: string; leagueName: string; startedAt: number; endedAt: number | null }> {
    const rows = this.db
      .prepare("SELECT id, league_name, started_at, ended_at FROM matches ORDER BY started_at DESC LIMIT ?")
      .all(limit) as Array<{ id: string; league_name: string; started_at: number; ended_at: number | null }>;
    return rows.map((r) => ({ id: r.id, leagueName: r.league_name, startedAt: r.started_at, endedAt: r.ended_at }));
  }

  getEvents(matchId: string): GameEvent[] {
    const rows = this.db.prepare("SELECT event_json FROM match_events WHERE match_id = ? ORDER BY seq").all(matchId) as Array<{ event_json: string }>;
    return rows.map((r) => JSON.parse(r.event_json) as GameEvent);
  }

  close(): void {
    this.db.close();
  }
}
