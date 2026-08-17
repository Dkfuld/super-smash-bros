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
import { copyText, isEmbedded } from "./clipboard";
import { GameView } from "./GameView";
import { ResultsScreen } from "./Results";
import { SettingsPanel } from "./SettingsPanel";

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
}

export function encodeSoloConfig(cfg: SoloConfig): string {
  const json = JSON.stringify([cfg.league, cfg.names, cfg.loser, cfg.seed, cfg.pace]);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSoloConfig(blob: string): SoloConfig | null {
  try {
    const json = decodeURIComponent(escape(atob(blob.replace(/-/g, "+").replace(/_/g, "/"))));
    const [league, names, loser, seed, pace] = JSON.parse(json) as [string, string[], number, number, string];
    if (!Array.isArray(names) || names.length !== 12) return null;
    return {
      league: String(league).slice(0, 24),
      names: names.map((n) => String(n).slice(0, 24)),
      loser: Math.min(11, Math.max(0, Number(loser) || 0)),
      seed: Number(seed) >>> 0,
      pace: pace === "full" ? "full" : "quick",
    };
  } catch {
    return null;
  }
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
  const [cameFromLink] = useState(fromLink !== null);
  const [invalidLink] = useState(blob !== null && fromLink === null);

  if (!cfg) {
    return <SoloSetup onStart={setCfg} invalidLink={invalidLink} />;
  }
  // Fresh setups pass through the share gate; shared links auto-play so the
  // whole league just taps and watches.
  return <SoloMatch cfg={cfg} autoStart={cameFromLink} onExit={() => setCfg(null)} />;
}

function SoloSetup({ onStart, invalidLink }: { onStart: (c: SoloConfig) => void; invalidLink: boolean }): JSX.Element {
  const [league, setLeague] = useState(localStorage.getItem("ddd.league") ?? "");
  const [namesText, setNamesText] = useState(localStorage.getItem("ddd.names") ?? "");
  const [loser, setLoser] = useState(-1);
  const [pace, setPace] = useState<"quick" | "full">("quick");
  const [matchCode, setMatchCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const names = namesText.split("\n").map((n) => n.trim()).filter(Boolean);
  const ready = names.length === 12 && league.trim().length > 0 && loser >= 0;

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
            <label>Who finished LAST place last season? (wears the 🌈 Rainbow Fan-Spin Hat)</label>
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
        <button
          className="btn gold"
          style={{ width: "100%" }}
          disabled={!ready}
          onClick={() => {
            audio.unlock();
            localStorage.setItem("ddd.league", league);
            localStorage.setItem("ddd.names", namesText);
            const seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()) >>> 0;
            onStart({ league: league.trim(), names: names.slice(0, 12), loser, seed, pace });
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

function SoloMatch({ cfg, autoStart, onExit }: { cfg: SoloConfig; autoStart: boolean; onExit: () => void }): JSX.Element {
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
  const [started, setStarted] = useState(autoStart);
  const matchRef = useRef<Match | null>(null);

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

  useEffect(() => {
    if (!started) return;
    const match = new Match({
      matchId: `solo_${cfg.seed.toString(36)}`,
      roomCode: "SOLO",
      leagueName: cfg.league,
      participants,
      settings: paceSettings(cfg.pace),
      arenaId: "disaster_dome",
      seed: cfg.seed,
      hatPlayerId: cfg.loser >= 0 ? `p${cfg.loser}` : null,
      onEnd: (r) => {
        setResults(r);
        setTimeout(() => setShowResults(true), 7000); // let the victory scene breathe
      },
    });
    matchRef.current = match;

    // Local loopback: GameView's world registers its snapshot/event handlers on
    // the connection singleton; we feed it directly from the in-browser sim.
    let tickCount = 0;
    const timer = window.setInterval(() => {
      if (!matchRef.current) return;
      match.tick();
      tickCount++;
      if (tickCount % SIM.SNAPSHOT_EVERY_N_TICKS === 0) {
        const events = match.drainEvents();
        if (events.length > 0) connection.onEvents?.(events);
        connection.onSnapshot?.(match.buildSnapshot());
      }
      if (match.phase === "victory" && tickCount % 300 === 0) {
        // keep a light snapshot cadence during the victory scene
      }
    }, SIM.TICK_MS);

    audio.setMusic("arena");
    return () => {
      clearInterval(timer);
      matchRef.current = null;
      audio.setMusic("none");
    };
    // The match must never restart mid-run: cfg is immutable for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Share gate: lock the match in and blast the link to the league first.
  if (!started) {
    return (
      <div className="screen">
        <div style={{ fontSize: "2.6rem" }}>📲</div>
        <h1 className="title" style={{ fontSize: "1.7rem" }}>MATCH LOCKED IN</h1>
        <p className="subtitle">
          Send this link to the league <strong>before</strong> you hit start — everyone who opens it watches the{" "}
          <em>exact same battle</em> and the <em>exact same draft order</em> on their own phone. No arguments possible.
        </p>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <button className="btn gold" style={{ fontSize: "1.15rem" }} onClick={() => doShare(setCopied)}>
            {copied ? "✓ Copied — paste it in the group chat" : "📲 SHARE WITH THE LEAGUE"}
          </button>
          <button className="btn secondary" onClick={() => { void copyText(shareText).then((ok) => ok && flagCopied(setCopied)); }}>
            📋 Just copy the {isEmbedded() ? "match code" : "link"}
          </button>
          <button className="btn" style={{ fontSize: "1.15rem" }} onClick={() => { audio.unlock(); setStarted(true); }}>
            ▶ START THE SHOW
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", maxWidth: "26rem", textAlign: "center" }}>
          Anyone opening the link later sees the same match from the beginning — start whenever you're ready.
        </p>
      </div>
    );
  }

  if (showResults && results) {
    return (
      <>
        <ResultsScreen results={results} isHost={false} />
        <div className="row" style={{ position: "fixed", bottom: "0.6rem", right: "0.6rem", zIndex: 300 }}>
          <button className="btn small secondary" onClick={() => doShare(setCopied)}>
            {copied ? "✓ Copied" : isEmbedded() ? "🔗 Copy match code" : "🔗 Share this exact match"}
          </button>
          <button className="btn small secondary" onClick={onExit}>
            🎲 New simulation
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <GameView participants={participants} myId={null} spectatorUi />
      <SettingsPanel />
      <div className="row" style={{ position: "fixed", bottom: "0.6rem", left: "0.6rem", zIndex: 300 }}>
        <button className="btn small secondary" onClick={() => doShare(setCopied)}>
          {copied ? "✓ Copied" : isEmbedded() ? "🔗 Copy match code" : "🔗 Copy match link"}
        </button>
        <button className="btn small secondary" onClick={() => matchRef.current?.hostSkipIntro()}>
          ⏭
        </button>
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
