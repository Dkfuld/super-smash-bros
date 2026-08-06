-- PostgreSQL schema — production mirror of the embedded SQLite store
-- (apps/server/src/store.ts). Apply with psql or Supabase migrations.

CREATE TABLE IF NOT EXISTS matches (
  id                  text PRIMARY KEY,
  room_code           text NOT NULL,
  league_name         text NOT NULL,
  arena_id            text NOT NULL,
  started_at          bigint NOT NULL,          -- epoch ms
  ended_at            bigint,
  rainbow_hat_player  text,
  settings_json       jsonb NOT NULL,
  results_json        jsonb
);

CREATE TABLE IF NOT EXISTS match_events (
  match_id   text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  tick       integer NOT NULL,
  event_json jsonb NOT NULL,
  PRIMARY KEY (match_id, seq)
);

CREATE TABLE IF NOT EXISTS draft_picks (
  match_id    text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  pick        integer NOT NULL CHECK (pick BETWEEN 1 AND 12),
  player_id   text NOT NULL,
  player_name text NOT NULL,
  placement   integer NOT NULL CHECK (placement BETWEEN 1 AND 12),
  PRIMARY KEY (match_id, pick),
  UNIQUE (match_id, player_id),
  UNIQUE (match_id, placement)
);

CREATE INDEX IF NOT EXISTS matches_started_idx ON matches (started_at DESC);
CREATE INDEX IF NOT EXISTS events_match_idx ON match_events (match_id, seq);

-- Row-level security (Supabase): the game server writes with the service
-- role; anonymous/browser clients may only read finished results.
ALTER TABLE matches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks  ENABLE ROW LEVEL SECURITY;

CREATE POLICY matches_public_read ON matches
  FOR SELECT USING (ended_at IS NOT NULL);
CREATE POLICY picks_public_read ON draft_picks
  FOR SELECT USING (true);
-- match_events: no public policy — audit log is host/service-only.
