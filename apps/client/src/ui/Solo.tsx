import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  Match,
  SIM,
  defaultCharacter,
  type MatchResults,
  type MatchSettings,
  type ParticipantSlot,
} from "@ddd/shared";
import { audio } from "../audio/audio";
import { connection } from "../net/connection";
import { FIGHTER_KITS, KIT_INFO } from "../game/character";
import { copyText, isEmbedded } from "./clipboard";
import { GameView } from "./GameView";
import { IntroOverlay } from "./IntroOverlay";
import { ResultsScreen } from "./Results";
import { SettingsPanel } from "./SettingsPanel";
import type { GameWorld } from "../game/world";

/**
 * Solo Draft Simulator — the whole battle royale runs *in this browser*, no
 * server involved. The simulation is fully deterministic from its seed, so a
 * shared link replays the exact same match (same fights, same eliminations,
 * same draft order) on every phone that opens it.
 */

export interface SoloConfig {
  league: string;
  names: string[]; // exactly 12
  loser: number; // slot index of last season's last place
  seed: number;
  pace: "quick" | "full";
  /** Fighter avatar (index into FIGHTER_KITS) per slot — part of the shared link. */
  kits: number[];
  /** Best-of-3 series (plus a tiebreaker death match when the math ties). */
  series: boolean;
}

export function encodeSoloConfig(cfg: SoloConfig): string {
  const json = JSON.stringify([cfg.league, cfg.names, cfg.loser, cfg.seed, cfg.pace, cfg.kits, cfg.series ? 1 : 0]);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSoloConfig(blob: string): SoloConfig | null {
  try {
    const json = decodeURIComponent(escape(atob(blob.replace(/-/g, "+").replace(/_/g, "/"))));
    const [league, names, loser, seed, pace, kits, series] = JSON.parse(json) as [string, string[], number, number, string, number[]?, number?];
    if (!Array.isArray(names) || names.length !== 12) return null;
    return {
      league: String(league).slice(0, 24),
      names: names.map((n) => String(n).slice(0, 24)),
      loser: Math.min(11, Math.max(0, Number(loser) || 0)),
      seed: Number(seed) >>> 0,
      pace: pace === "full" ? "full" : "quick",
      kits: Array.isArray(kits) && kits.length === 12
        ? kits.map((k) => Math.min(FIGHTER_KITS.length - 1, Math.max(0, Number(k) || 0)))
        : Array.from({ length: 12 }, (_, i) => i % FIGHTER_KITS.length),
      series: series === 1,
    };
  } catch {
    return null;
  }
}

/** Deterministic per-game seed: game 0 IS the link seed (old links unchanged). */
export function seriesGameSeed(seed: number, game: number): number {
  return (seed + game * 0x9e3779b9) >>> 0;
}

interface SeriesRow {
  id: string;
  name: string;
  picks: number[]; // pick earned in each game (1..12)
  total: number;
  tbPick: number | null;
  finalPick: number;
}

/**
 * Combine 3 games into a final draft order: lowest total pick number drafts
 * first. Ties are broken by the tiebreaker death match (relative pick order
 * among the tied players); before it runs, ties are just flagged.
 */
function aggregateSeries(games: MatchResults[], tiebreak: MatchResults | null): { rows: SeriesRow[]; tiedIds: string[] } {
  const byId = new Map<string, SeriesRow>();
  for (const g of games) {
    for (const p of g.draftOrder) {
      const row = byId.get(p.playerId) ?? { id: p.playerId, name: p.playerName, picks: [], total: 0, tbPick: null, finalPick: 0 };
      row.picks.push(p.pick);
      row.total += p.pick;
      byId.set(p.playerId, row);
    }
  }
  if (tiebreak) {
    for (const p of tiebreak.draftOrder) {
      const row = byId.get(p.playerId);
      if (row) row.tbPick = p.pick;
    }
  }
  const rows = [...byId.values()];
  const totals = new Map<number, number>();
  for (const r of rows) totals.set(r.total, (totals.get(r.total) ?? 0) + 1);
  const tiedIds = tiebreak ? [] : rows.filter((r) => (totals.get(r.total) ?? 0) > 1).map((r) => r.id);
  rows.sort((a, b) => a.total - b.total || (a.tbPick ?? 99) - (b.tbPick ?? 99) || a.id.localeCompare(b.id));
  rows.forEach((r, i) => (r.finalPick = i + 1));
  return { rows, tiedIds };
}

const DEMO_NAMES = [
  "Captain Autodraft", "Waiver Wire Wanda", "Sleeper Pick Sam", "Mock Draft Mike",
  "Trade Machine Tina", "Bye Week Bob", "Handcuff Hank", "Vulture TD Vince",
  "Garbage Time Gary", "Injury Report Irene", "Boom Bust Barry", "Kicker First Kevin",
];

function paceSettings(pace: "quick" | "full"): MatchSettings {
  // Tuned so eliminations come from fights, not zone attrition: gentler
  // shrink, fewer hazards, more weapons in play.
  return pace === "quick"
    ? { ...DEFAULT_SETTINGS, matchDurationTargetSec: 180, suddenDeathAtSec: 190, chaosLevel: 1, weaponDropRate: 1.8, hazardFrequency: 0.9, zoneShrinkSpeed: 0.9 }
    : { ...DEFAULT_SETTINGS, matchDurationTargetSec: 300, suddenDeathAtSec: 330, chaosLevel: 1, weaponDropRate: 1.5, hazardFrequency: 1, zoneShrinkSpeed: 0.9 };
}

export function Solo({ blob }: { blob: string | null }): JSX.Element {
  const fromLink = blob ? decodeSoloConfig(blob) : null;
  const [cfg, setCfg] = useState<SoloConfig | null>(fromLink);
  const [cameFromLink, setCameFromLink] = useState(fromLink !== null);
  const [invalidLink] = useState(blob !== null && fromLink === null);
  const [runId, setRunId] = useState(0); // remount counter — seed alone could collide

  if (!cfg) {
    return <SoloSetup onStart={setCfg} invalidLink={invalidLink} />;
  }
  // Fresh setups pass through the share gate; shared links auto-play so the
  // whole league just taps and watches. A rematch mints a new seed, so it goes
  // back through the gate — the new link is a new match to blast to the chat.
  return (
    <SoloMatch
      key={`${cfg.seed}:${runId}`}
      cfg={cfg}
      autoStart={cameFromLink}
      onExit={() => setCfg(null)}
      onRematch={(next) => {
        setCameFromLink(false);
        setRunId((r) => r + 1);
        setCfg(next);
      }}
    />
  );
}

function SoloSetup({ onStart, invalidLink }: { onStart: (c: SoloConfig) => void; invalidLink: boolean }): JSX.Element {
  const [league, setLeague] = useState(localStorage.getItem("ddd.league") ?? "");
  const [namesText, setNamesText] = useState(localStorage.getItem("ddd.names") ?? "");
  const [loser, setLoser] = useState(-1);
  const [pace, setPace] = useState<"quick" | "full">("quick");
  const [series, setSeries] = useState(false);
  const [matchCode, setMatchCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [kits, setKits] = useState<number[]>(() => Array.from({ length: 12 }, (_, i) => i % FIGHTER_KITS.length));
  const names = namesText.split("\n").map((n) => n.trim()).filter(Boolean);
  const ready = names.length === 12 && league.trim().length > 0 && loser >= 0;

  const cycleKit = (i: number, dir: number): void => {
    audio.play("click");
    setKits((k) => k.map((v, idx) => (idx === i ? (v + dir + FIGHTER_KITS.length) % FIGHTER_KITS.length : v)));
  };

  return (
    <div className="screen" style={{ justifyContent: "flex-start", paddingTop: "max(1.2rem, env(safe-area-inset-top))" }}>
      <SettingsPanel />
      <div style={{ fontSize: "2.6rem" }}>🎲</div>
      <h1 className="title" style={{ fontSize: "1.8rem" }}>SMASH DOME</h1>
      <p className="subtitle">
        Enter your 12 league members, pick last season's loser, and watch an epic (rigged-by-fate) 3D battle decide the
        draft order. Share the link and everyone's phone replays the <em>exact same match</em>.
      </p>
      {invalidLink && <p style={{ color: "var(--red)" }}>That match link was invalid — set up a fresh one below.</p>}
      <div className="panel">
        <div className="field">
          <label>League name</label>
          <input value={league} maxLength={24} placeholder="e.g. The Basement Legends" onChange={(e) => setLeague(e.target.value)} />
        </div>
        <div className="field">
          <label>The 12 participants (one per line) — {names.length}/12</label>
          <textarea value={namesText} placeholder={"Dan\nMike\nSarah\n…"} onChange={(e) => setNamesText(e.target.value)} />
        </div>
        <button className="btn small secondary" onClick={() => setNamesText(DEMO_NAMES.join("\n"))} style={{ marginBottom: "0.8rem" }}>
          Fill sample names
        </button>
        {names.length === 12 && (
          <div className="field">
            <label>Pick each fighter's avatar (tap to cycle)</label>
            <div className="kit-grid">
              {names.map((n, i) => {
                const isLoser = i === loser;
                const kit = isLoser ? "troll" : FIGHTER_KITS[kits[i] ?? 0] ?? "knight";
                return (
                  <button key={i} className="kit-row" onClick={() => !isLoser && cycleKit(i, 1)}>
                    <span className="kit-name">{n}</span>
                    <span className="kit-pick">
                      {KIT_INFO[kit].emoji} {isLoser ? "Shame Troll (mandatory)" : KIT_INFO[kit].label}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              className="btn small secondary"
              style={{ marginTop: "0.4rem" }}
              onClick={() => {
                audio.play("click");
                setKits(Array.from({ length: 12 }, () => Math.floor(Math.random() * FIGHTER_KITS.length)));
              }}
            >
              🎲 Randomize avatars
            </button>
          </div>
        )}
        {names.length === 12 && (
          <div className="field">
            <label>Who finished LAST place last season? (wears the 🧌 Dunce Beanie of Shame)</label>
            <select value={loser} onChange={(e) => setLoser(Number(e.target.value))}>
              <option value={-1}>— choose the shame —</option>
              {names.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Match length</label>
          <div className="row">
            <button className={`chip ${pace === "quick" ? "selected" : ""}`} onClick={() => setPace("quick")}>⚡ Quick (~2–3 min)</button>
            <button className={`chip ${pace === "full" ? "selected" : ""}`} onClick={() => setPace("full")}>🍿 Full show (~5 min)</button>
          </div>
        </div>
        <div className="field">
          <label>Format — a series builds trust in the chaos</label>
          <div className="row">
            <button className={`chip ${!series ? "selected" : ""}`} onClick={() => setSeries(false)}>🥊 Single match</button>
            <button className={`chip ${series ? "selected" : ""}`} onClick={() => setSeries(true)}>🏆 Best of 3 (+ tiebreaker death match)</button>
          </div>
        </div>
        <button
          className="btn gold"
          style={{ width: "100%" }}
          disabled={!ready}
          onClick={() => {
            audio.unlock();
            localStorage.setItem("ddd.league", league);
            localStorage.setItem("ddd.names", namesText);
            const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()) >>> 0;
            onStart({ league: league.trim(), names: names.slice(0, 12), loser, seed, pace, kits, series });
          }}
        >
          🥊 LET FATE DECIDE →
        </button>
        {!ready && (
          <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.4rem" }}>
            Need a league name, exactly 12 names, and last season's loser.
          </p>
        )}
      </div>
      <div className="panel">
        <div className="field">
          <label>Got a match code from your commissioner? Paste it to watch the exact same match.</label>
          <input
            value={matchCode}
            placeholder="e.g. WyJUaGUgQmFzZW1lbnQi…"
            onChange={(e) => {
              setMatchCode(e.target.value.trim());
              setCodeError(false);
            }}
          />
        </div>
        <button
          className="btn secondary"
          style={{ width: "100%" }}
          disabled={matchCode.length === 0}
          onClick={() => {
            const decoded = decodeSoloConfig(matchCode.replace(/^.*[?&]sim=/, ""));
            if (decoded) {
              audio.unlock();
              onStart(decoded);
            } else {
              setCodeError(true);
            }
          }}
        >
          📺 Replay shared match
        </button>
        {codeError && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: "0.4rem" }}>That code didn't decode — check you copied the whole thing.</p>}
      </div>
    </div>
  );
}

function SoloMatch({ cfg, autoStart, onExit, onRematch }: { cfg: SoloConfig; autoStart: boolean; onExit: () => void; onRematch: (next: SoloConfig) => void }): JSX.Element {
  const [participants] = useState<ParticipantSlot[]>(() =>
    cfg.names.map((name, i) => ({
      slotIndex: i,
      id: `p${i}`,
      name,
      status: "ai" as const,
      connStatus: "connected" as const,
      ready: true,
      isPreviousLoser: i === cfg.loser,
      character: defaultCharacter(i),
    })),
  );
  const [results, setResults] = useState<MatchResults | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gateDone, setGateDone] = useState(autoStart);
  const [started, setStarted] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [speed, setSpeed] = useState(0.8);
  // Best-of-3 series state: gameIdx 0-2 are the regular games, 3 = tiebreaker.
  const [gameIdx, setGameIdx] = useState(0);
  const [interlude, setInterlude] = useState<{ title: string; sub: string } | null>(null);
  const [seriesRows, setSeriesRows] = useState<SeriesRow[] | null>(null);
  const gamesRef = useRef<MatchResults[]>([]);
  const matchRef = useRef<Match | null>(null);
  const worldRef = useRef<GameWorld | null>(null);

  // Embedded viewers can't carry URL params, so share the raw match code there;
  // normal hosting shares a click-to-open link.
  const code = encodeSoloConfig(cfg);
  const shareText = isEmbedded() ? code : `${location.origin}${location.pathname}?sim=${code}`;
  const doShare = (setFlag: (b: boolean) => void): void => {
    // Native share sheet on phones (texts/WhatsApp/etc.), clipboard elsewhere.
    const message = `🏟️ ${cfg.league} DRAFT ORDER BATTLE — watch the match that decides our picks:`;
    if (navigator.share && !isEmbedded()) {
      navigator
        .share({ title: "Draft Day: Disaster Dome", text: message, url: shareText })
        .catch(() => void copyText(shareText).then((ok) => ok && flagCopied(setFlag)));
    } else {
      void copyText(isEmbedded() ? shareText : `${message} ${shareText}`).then((ok) => ok && flagCopied(setFlag));
    }
  };
  const flagCopied = (setFlag: (b: boolean) => void): void => {
    setFlag(true);
    setTimeout(() => setFlag(false), 1600);
  };

  const handleGameEnd = (game: number, r: MatchResults): void => {
    gamesRef.current = [...gamesRef.current, r];
    if (!cfg.series) {
      setResults(r);
      setTimeout(() => setShowResults(true), 13000); // victory beat + podium ceremony
      return;
    }
    const played = gamesRef.current.length;
    if (game < 2) {
      // Games 1-2 done → short victory beat, then the next game card.
      const jokes = [
        "The Dome demands a second opinion",
        "Double or nothing. Mostly nothing.",
      ];
      setTimeout(() => {
        setInterlude({ title: `GAME ${played + 1} OF 3`, sub: jokes[played - 1] ?? "" });
        audio.speak(`Game ${played + 1}!`, "announcer", "excited");
        setTimeout(() => {
          setInterlude(null);
          setGameIdx(played);
        }, 4200);
      }, 5000);
      return;
    }
    if (game === 2) {
      const { rows, tiedIds } = aggregateSeries(gamesRef.current.slice(0, 3), null);
      if (tiedIds.length > 0) {
        const tiedNames = rows.filter((x) => tiedIds.includes(x.id)).map((x) => x.name).slice(0, 4).join(", ");
        setTimeout(() => {
          setInterlude({ title: "💀 TIEBREAKER DEATH MATCH", sub: `${tiedNames} tied on points — the Dome demands blood` });
          audio.speak("We have a tie. You know what that means. DEATH MATCH!", "announcer", "excited");
          setTimeout(() => {
            setInterlude(null);
            setGameIdx(3);
          }, 4600);
        }, 5000);
      } else {
        setTimeout(() => setSeriesRows(rows), 12000);
      }
      return;
    }
    // Tiebreaker done — final combined order.
    const { rows } = aggregateSeries(gamesRef.current.slice(0, 3), r);
    setTimeout(() => setSeriesRows(rows), 12000);
  };

  useEffect(() => {
    if (!started) return;
    const game = gameIdx;
    const match = new Match({
      matchId: `solo_${cfg.seed.toString(36)}_g${game + 1}`,
      roomCode: "SOLO",
      leagueName: cfg.league,
      participants,
      settings: paceSettings(cfg.pace),
      arenaId: "disaster_dome",
      seed: seriesGameSeed(cfg.seed, game),
      hatPlayerId: cfg.loser >= 0 ? `p${cfg.loser}` : null,
      onEnd: (r) => handleGameEnd(game, r),
    });
    matchRef.current = match;
    // Only game 1 gets the full pre-show; later games skip the sim's built-in
    // intro so the next kickoff comes fast.
    if (game > 0) {
      match.drainEvents();
      match.hostSkipIntro();
    }
    return () => {
      matchRef.current = null;
      audio.setMusic("none");
    };
    // The match must never restart mid-run: cfg is immutable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameIdx]);

  // Playback pacing: outcomes are tick-based and deterministic, so slowing the
  // wall-clock tick rate keeps every phone on the identical match — it just
  // makes the show easier to follow. 0.8× is the broadcast default.
  useEffect(() => {
    // The sim does not tick until the intro show finishes — wall-clock delay
    // never changes outcomes (ticks are what advance the deterministic state).
    // Interludes and the final series screen also pause the ticker.
    if (!started || !introDone || interlude !== null || seriesRows !== null) return;
    // Local loopback: GameView's world registers its snapshot/event handlers on
    // the connection singleton; we feed it directly from the in-browser sim.
    // The beat waits for kickoff — the intro belongs to the announcer alone.
    audio.setMusic("arena");
    let tickCount = 0;
    const timer = window.setInterval(() => {
      const match = matchRef.current;
      if (!match) return;
      match.tick();
      tickCount++;
      if (tickCount % SIM.SNAPSHOT_EVERY_N_TICKS === 0) {
        const events = match.drainEvents();
        if (events.length > 0) connection.onEvents?.(events);
        connection.onSnapshot?.(match.buildSnapshot());
      }
    }, SIM.TICK_MS / speed);
    return () => clearInterval(timer);
  }, [started, introDone, speed, gameIdx, interlude, seriesRows]);

  // Share gate: lock the match in and blast the link to the league first.
  if (!gateDone) {
    return (
      <div className="screen">
        <div style={{ fontSize: "2.6rem" }}>📲</div>
        <h1 className="title" style={{ fontSize: "1.7rem" }}>MATCH LOCKED IN</h1>
        <p className="subtitle">
          Send this link to the league <strong>before</strong> you hit start — everyone who opens it watches the{" "}
          <em>exact same {cfg.series ? "best-of-3 series" : "battle"}</em> and the <em>exact same draft order</em> on their
          own phone. No arguments possible.
        </p>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <button className="btn gold" style={{ fontSize: "1.15rem" }} onClick={() => doShare(setCopied)}>
            {copied ? "✓ Copied — paste it in the group chat" : "📲 SHARE WITH THE LEAGUE"}
          </button>
          <button className="btn secondary" onClick={() => { void copyText(shareText).then((ok) => ok && flagCopied(setCopied)); }}>
            📋 Just copy the {isEmbedded() ? "match code" : "link"}
          </button>
          <button className="btn" style={{ fontSize: "1.15rem" }} onClick={() => { audio.unlock(); setGateDone(true); }}>
            ▶ START THE SHOW
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", maxWidth: "26rem", textAlign: "center" }}>
          Anyone opening the link later sees the same match from the beginning — start whenever you're ready.
        </p>
      </div>
    );
  }

  // Who are you? Every viewer locks the camera onto their own fighter.
  if (!started) {
    return (
      <div className="screen">
        <div style={{ fontSize: "2.4rem" }}>👀</div>
        <h1 className="title" style={{ fontSize: "1.6rem" }}>WHICH ONE ARE YOU?</h1>
        <p className="subtitle">The camera follows your fighter. Your fate, live and personal.</p>
        <div className="slot-pick">
          {cfg.names.map((n, i) => {
            const kit = FIGHTER_KITS[cfg.kits[i] ?? 0] ?? "knight";
            return (
              <button
                key={i}
                onClick={() => {
                  audio.unlock();
                  audio.play("ready");
                  setFocus(`p${i}`);
                  setStarted(true);
                }}
              >
                {KIT_INFO[kit].emoji} {n}
                {i === cfg.loser ? " 🧌" : ""}
                <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>{KIT_INFO[kit].label}</div>
              </button>
            );
          })}
        </div>
        <button className="btn secondary" onClick={() => { audio.unlock(); setStarted(true); }}>
          🎬 Just show me everything (director mode)
        </button>
      </div>
    );
  }

  if (showResults && results) {
    return (
      <>
        <ResultsScreen results={results} isHost={false} />
        <div className="row results-actions">
          <button
            className="btn small gold"
            onClick={() => {
              // Same league, same fighters — brand-new fate. New seed = new
              // link = completely different match for everyone who gets it.
              const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()) >>> 0;
              audio.play("ready");
              onRematch({ ...cfg, seed });
            }}
          >
            🎲 RUN IT BACK — new outcome
          </button>
          <button className="btn small secondary" onClick={() => doShare(setCopied)}>
            {copied ? "✓ Copied" : isEmbedded() ? "🔗 Copy match code" : "🔗 Share this match"}
          </button>
          <button className="btn small secondary" onClick={onExit}>
            ✏️ Edit league
          </button>
        </div>
      </>
    );
  }

  // Final combined standings for a best-of-3 (+ tiebreaker) series.
  if (seriesRows) {
    const hadTb = seriesRows.some((r) => r.tbPick !== null);
    return (
      <div className="screen" style={{ justifyContent: "flex-start", paddingTop: "max(1.2rem, env(safe-area-inset-top))" }}>
        <div style={{ fontSize: "2.4rem" }}>🏆</div>
        <h1 className="title" style={{ fontSize: "1.6rem" }}>FINAL DRAFT ORDER — BEST OF 3</h1>
        <p className="subtitle">Lowest total across three battles drafts first{hadTb ? " · ties settled by DEATH MATCH" : ""}.</p>
        <div className="panel series-table">
          <div className="series-row series-head">
            <span>PICK</span>
            <span style={{ textAlign: "left" }}>MANAGER</span>
            <span>G1</span>
            <span>G2</span>
            <span>G3</span>
            {hadTb && <span>TB</span>}
            <span>TOTAL</span>
          </div>
          {seriesRows.map((r) => (
            <div key={r.id} className={`series-row ${r.finalPick === 1 ? "first" : ""}`}>
              <span className="series-pick">#{r.finalPick}</span>
              <span style={{ textAlign: "left", fontWeight: 800 }}>
                {r.name}
                {participants.find((p) => p.id === r.id)?.isPreviousLoser ? " 🧌" : ""}
              </span>
              <span>{r.picks[0] ?? "–"}</span>
              <span>{r.picks[1] ?? "–"}</span>
              <span>{r.picks[2] ?? "–"}</span>
              {hadTb && <span>{r.tbPick ?? "–"}</span>}
              <span style={{ fontWeight: 900, color: "var(--gold)" }}>{r.total}</span>
            </div>
          ))}
        </div>
        <div className="row results-actions">
          <button
            className="btn small gold"
            onClick={() => {
              const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()) >>> 0;
              audio.play("ready");
              onRematch({ ...cfg, seed });
            }}
          >
            🎲 RUN IT BACK — new outcome
          </button>
          <button className="btn small secondary" onClick={() => doShare(setCopied)}>
            {copied ? "✓ Copied" : isEmbedded() ? "🔗 Copy match code" : "🔗 Share this series"}
          </button>
          <button className="btn small secondary" onClick={onExit}>
            ✏️ Edit league
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <GameView
        key={gameIdx}
        participants={participants}
        myId={null}
        spectatorUi
        initialFocusId={focus}
        kits={cfg.kits.map((k) => FIGHTER_KITS[k])}
        onWorld={(w) => {
          worldRef.current = w;
        }}
      />
      {interlude && (
        <div className="intro-overlay">
          <div className="intro-card roast">
            <h1>{interlude.title}</h1>
            <h2>{interlude.sub}</h2>
          </div>
        </div>
      )}
      {!introDone && (
        <IntroOverlay
          league={cfg.league}
          names={cfg.names}
          loserName={cfg.loser >= 0 ? cfg.names[cfg.loser] ?? "" : ""}
          loserId={cfg.loser >= 0 ? `p${cfg.loser}` : null}
          getWorld={() => worldRef.current}
          onDone={() => {
            // The Match constructor pre-queued its own loser roast + yippee —
            // our overlay already did that show, so drop the stale events,
            // THEN collapse the sim's built-in intro phase (its countdown
            // phase event stays queued for the HUD).
            matchRef.current?.drainEvents();
            matchRef.current?.hostSkipIntro();
            setIntroDone(true);
          }}
        />
      )}
      <SettingsPanel />
      <div className="row top-actions" style={{ position: "fixed", top: "max(0.5rem, env(safe-area-inset-top))", left: "max(0.5rem, env(safe-area-inset-left))", zIndex: 300 }}>
        <button className="btn small secondary" onClick={() => doShare(setCopied)}>
          {copied ? "✓" : "🔗"}
          <span className="lbl">{copied ? " Copied" : " Share"}</span>
        </button>
        {!introDone && (
          <button
            className="btn small secondary"
            title="Skip intro"
            onClick={() => {
              audio.stopSpeech();
              matchRef.current?.drainEvents();
              matchRef.current?.hostSkipIntro();
              setIntroDone(true);
            }}
          >
            ⏭
          </button>
        )}
        <button
          className="btn small secondary"
          title="Playback speed"
          onClick={() => {
            audio.play("click");
            setSpeed(speed === 0.5 ? 0.8 : speed === 0.8 ? 1 : 0.5);
          }}
        >
          {speed === 0.5 ? "🐢 0.5×" : speed === 0.8 ? "▶ 0.8×" : "⏩ 1×"}
        </button>
        {cfg.series && (
          <span className="chip selected" style={{ pointerEvents: "none" }}>
            {gameIdx === 3 ? "💀 TB" : `G${gameIdx + 1}/3`}
          </span>
        )}
      </div>
      {results && !showResults && (
        <button
          className="btn gold"
          style={{ position: "fixed", bottom: "0.6rem", right: "0.6rem", zIndex: 300 }}
          onClick={() => setShowResults(true)}
        >
          📋 Show draft order →
        </button>
      )}
    </>
  );
}
