import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DEFAULT_SETTINGS, type MatchSettings } from "@ddd/shared";
import { useConnection } from "../App";
import { audio } from "../audio/audio";
import { connection } from "../net/connection";
import { GameView } from "./GameView";
import { ResultsScreen } from "./Results";
import { ConnBadge } from "./PlayerFlow";

const DEMO_NAMES = [
  "Captain Autodraft", "Waiver Wire Wanda", "Sleeper Pick Sam", "Mock Draft Mike",
  "Trade Machine Tina", "Bye Week Bob", "Handcuff Hank", "Vulture TD Vince",
  "Garbage Time Gary", "Injury Report Irene", "Boom Bust Barry", "Kicker First Kevin",
];

/** Commissioner console: room creation, lobby management, live match controls, results. */
export function HostDashboard({ demo }: { demo?: boolean }): JSX.Element {
  const state = useConnection();
  const [leagueName, setLeagueName] = useState(localStorage.getItem("ddd.league") ?? "");
  const [namesText, setNamesText] = useState(localStorage.getItem("ddd.names") ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const demoStarted = useRef(false);

  useEffect(() => {
    connection.connect("host");
    return () => connection.close();
  }, []);

  // Demo mode: create → AI fill → pick a loser → start, automatically.
  useEffect(() => {
    if (!demo || demoStarted.current) return;
    if (state.status === "connected" && !state.room) {
      demoStarted.current = true;
      connection.send({ t: "createRoom", leagueName: "AI Demo League", participantNames: DEMO_NAMES });
      setTimeout(() => {
        connection.send({ t: "hostSetPreviousLoser", slotIndex: 11 });
        connection.send({ t: "hostFillAi", slotIndex: null });
        connection.send({ t: "hostSetSettings", settings: { matchDurationTargetSec: 240, chaosLevel: 2 } });
        connection.send({ t: "hostStartMatch" });
      }, 400);
    }
  }, [demo, state.status, state.room]);

  useEffect(() => {
    if (state.joinUrl) void QRCode.toDataURL(state.joinUrl, { width: 512, margin: 1 }).then(setQr);
  }, [state.joinUrl]);

  const room = state.room;

  if (state.results && room) {
    return (
      <ResultsScreen
        results={state.results}
        isHost
        onRestart={() => {
          connection.state.results = null;
          connection.send({ t: "hostRestart" });
        }}
      />
    );
  }

  if (!room) {
    const names = namesText.split("\n").map((n) => n.trim()).filter(Boolean);
    return (
      <div className="screen">
        <h1 className="title" style={{ fontSize: "2rem" }}>COMMISSIONER SETUP</h1>
        <div className="panel">
          <div className="field">
            <label>League name</label>
            <input value={leagueName} maxLength={24} placeholder="e.g. The Basement Legends" onChange={(e) => setLeagueName(e.target.value)} />
          </div>
          <div className="field">
            <label>The 12 participants (one per line) — {names.length}/12</label>
            <textarea
              value={namesText}
              placeholder={"Dan\nMike\nSarah\n…"}
              onChange={(e) => setNamesText(e.target.value)}
            />
          </div>
          <div className="row">
            <button
              className="btn gold"
              disabled={names.length !== 12 || leagueName.trim().length === 0 || state.status !== "connected"}
              onClick={() => {
                audio.unlock();
                localStorage.setItem("ddd.league", leagueName);
                localStorage.setItem("ddd.names", namesText);
                connection.send({ t: "createRoom", leagueName: leagueName.trim(), participantNames: names.slice(0, 12) });
              }}
            >
              Create the Dome →
            </button>
            <button className="btn small secondary" onClick={() => setNamesText(DEMO_NAMES.join("\n"))}>
              Fill sample names
            </button>
          </div>
          {names.length !== 12 && <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.4rem" }}>Exactly 12 names required — that's the league, no exceptions.</p>}
        </div>
      </div>
    );
  }

  const inMatch = room.phase !== "lobby";
  const readyCount = room.slots.filter((s) => s.ready || s.status === "ai").length;
  const filled = room.slots.filter((s) => s.status !== "empty").length;
  const loserPicked = room.slots.some((s) => s.isPreviousLoser);

  return (
    <div className="host-layout">
      <div className="host-side">
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "center" }}>{room.leagueName} — ROOM CODE</div>
          <div className="room-code">{room.code}</div>
        </div>

        {!inMatch && (
          <>
            {qr && state.joinUrl && (
              <div className="qr-box">
                <img src={qr} alt="Join QR code" />
                <button
                  className="btn small secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(state.joinUrl ?? "");
                    audio.play("click");
                  }}
                >
                  📋 Copy join link
                </button>
              </div>
            )}
            <div className="slot-grid">
              {room.slots.map((s) => (
                <div className="slot-row" key={s.slotIndex}>
                  <span className="num">{s.slotIndex + 1}</span>
                  <input
                    className="name"
                    defaultValue={s.name}
                    key={`${s.slotIndex}_${s.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.name) connection.send({ t: "hostRenameParticipant", slotIndex: s.slotIndex, name: v });
                    }}
                  />
                  <button
                    className={`loser-btn ${s.isPreviousLoser ? "selected" : ""}`}
                    title="Mark as last season's last place (wears the Rainbow Fan-Spin Hat)"
                    onClick={() => connection.send({ t: "hostSetPreviousLoser", slotIndex: s.slotIndex })}
                  >
                    🌈
                  </button>
                  <span className={`status ${s.status === "human" ? (s.connStatus === "connected" ? "human" : "disconnected") : s.status}`}>
                    {s.status === "human" ? (s.connStatus === "connected" ? (s.ready ? "ready ✓" : "joined") : "offline") : s.status === "ai" ? "AI" : "open"}
                  </span>
                  <button
                    className="btn small secondary"
                    title={s.status === "ai" ? "Remove AI" : s.status === "human" ? "Unassign device" : "Fill with AI"}
                    onClick={() =>
                      s.status === "human"
                        ? connection.send({ t: "hostAssignDevice", slotIndex: s.slotIndex, sessionId: null })
                        : connection.send({ t: "hostFillAi", slotIndex: s.slotIndex })
                    }
                  >
                    {s.status === "ai" ? "✕" : s.status === "human" ? "⏏" : "🤖"}
                  </button>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostFillAi", slotIndex: null })}>
                🤖 Fill empty with AI
              </button>
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostLockAssignments", locked: !room.assignmentsLocked })}>
                {room.assignmentsLocked ? "🔓 Unlock claims" : "🔒 Lock claims"}
              </button>
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostReadyCheck" })}>
                ✅ Ready check
              </button>
              <button className="btn small secondary" onClick={() => { audio.play("gavel"); connection.send({ t: "hostTestSound" }); }}>
                🔊 Test sound
              </button>
            </div>
            <HostSettings settings={room.settings} />
            {!loserPicked && <p style={{ fontSize: "0.78rem", color: "var(--gold)" }}>💡 Tap 🌈 next to last season's last-place finisher — they must wear the Hat.</p>}
            <button
              className="btn gold"
              disabled={filled < 12}
              onClick={() => {
                audio.play("matchStart");
                connection.send({ t: "hostStartMatch" });
              }}
            >
              🚀 START THE MATCH ({readyCount}/12 ready)
            </button>
            {filled < 12 && <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{12 - filled} spots need a device or an AI substitute.</p>}
          </>
        )}

        {inMatch && (
          <>
            <div className="row">
              <button className="btn small" onClick={() => { audio.play("sparklePop"); connection.send({ t: "hostYippee" }); }}>
                🌈 YIPPEE!
              </button>
              <button
                className="btn small secondary"
                onClick={() => {
                  const next = !paused;
                  setPaused(next);
                  connection.send({ t: "hostPause", paused: next });
                }}
              >
                {paused ? "▶ Resume" : "⏸ Pause"}
              </button>
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostSkipIntro" })}>
                ⏭ Skip intro
              </button>
            </div>
            <div className="row">
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostCommentary", kind: "hype" })}>🎙 Hype</button>
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostCommentary", kind: "roast" })}>🔥 Roast</button>
              <button className="btn small secondary" onClick={() => connection.send({ t: "hostCommentary", kind: "stats" })}>📊 Stats</button>
            </div>
            <div className="slot-grid">
              {room.slots.map((s) => (
                <div className="slot-row" key={s.slotIndex}>
                  <span className="num">{s.slotIndex + 1}</span>
                  <span className="name">{s.name}{s.isPreviousLoser ? " 🌈" : ""}</span>
                  <span className={`status ${s.connStatus === "connected" ? (s.status === "ai" ? "ai" : "human") : s.connStatus === "ai-takeover" ? "ai" : "disconnected"}`}>
                    {s.status === "ai" ? "AI" : s.connStatus === "connected" ? "live" : s.connStatus === "ai-takeover" ? "AI takeover" : "offline"}
                  </span>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn small danger" onClick={() => { if (confirm("Restart the match? Current progress is lost.")) connection.send({ t: "hostRestart" }); }}>
                🔄 Restart
              </button>
              <button className="btn small danger" onClick={() => { if (confirm("Cancel the match and return to the lobby?")) connection.send({ t: "hostCancel" }); }}>
                🛑 Cancel
              </button>
            </div>
          </>
        )}
      </div>
      <div className="host-main">
        {inMatch ? (
          <GameView participants={room.slots} myId={null} spectatorUi />
        ) : (
          <div className="screen" style={{ position: "absolute" }}>
            <div style={{ fontSize: "4rem" }}>🏟️</div>
            <h2 style={{ fontWeight: 900 }}>Waiting for fighters…</h2>
            <p className="subtitle">
              Players scan the QR code or open the link and pick their league identity. Fill missing members with AI, pick
              last season's loser (🌈), then start the match.
            </p>
          </div>
        )}
      </div>
      <ConnBadge status={state.status} rtt={state.rttMs} />
    </div>
  );
}

function HostSettings({ settings: s }: { settings: MatchSettings }): JSX.Element {
  const [open, setOpen] = useState(false);
  const send = (patch: Partial<MatchSettings>): void => connection.send({ t: "hostSetSettings", settings: patch });

  if (!open) {
    return (
      <button className="btn small secondary" onClick={() => setOpen(true)}>
        ⚙️ Match settings
      </button>
    );
  }
  const slider = (label: string, key: keyof MatchSettings, min: number, max: number, step: number): JSX.Element => (
    <div className="setting-row" key={String(key)}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} defaultValue={s[key] as number} onChange={(e) => send({ [key]: Number(e.target.value) } as Partial<MatchSettings>)} />
    </div>
  );
  const toggle = (label: string, key: keyof MatchSettings): JSX.Element => (
    <div className="setting-row" key={String(key)}>
      <span>{label}</span>
      <input type="checkbox" defaultChecked={s[key] as boolean} onChange={(e) => send({ [key]: e.target.checked } as Partial<MatchSettings>)} style={{ width: 20, height: 20 }} />
    </div>
  );

  return (
    <div className="panel" style={{ maxWidth: "none" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong style={{ fontSize: "0.9rem" }}>Match settings</strong>
        <div className="row">
          <button className="btn small secondary" onClick={() => send(DEFAULT_SETTINGS)}>Reset</button>
          <button className="btn small secondary" onClick={() => setOpen(false)}>✕</button>
        </div>
      </div>
      {slider("Match length (sec)", "matchDurationTargetSec", 180, 720, 30)}
      {slider("Weapon drop rate", "weaponDropRate", 0, 3, 0.25)}
      {slider("Weapon rarity boost", "weaponRarityBoost", 0, 1, 0.05)}
      {slider("Hazard frequency", "hazardFrequency", 0, 3, 0.25)}
      {slider("Chaos level", "chaosLevel", 0, 3, 1)}
      {slider("Zone shrink speed", "zoneShrinkSpeed", 0.5, 2, 0.1)}
      {slider("Starting health", "startingHealth", 50, 200, 10)}
      {slider("Knockback strength", "knockbackScale", 0.5, 2, 0.1)}
      {slider("Power-up rate", "powerUpRate", 0, 2, 0.25)}
      {slider("AI difficulty", "aiDifficulty", 0, 2, 0.5)}
      {slider("Yippee frequency", "yippeeFrequency", 0, 3, 0.25)}
      {slider("Sudden death at (sec)", "suddenDeathAtSec", 120, 900, 30)}
      {slider("Spectator delay (sec)", "spectatorDelaySec", 0, 30, 1)}
      {toggle("Make Last Place Suffer 🌈", "makeLastPlaceSuffer")}
      {toggle("Friendly visual effects", "friendlyVisualEffects")}
    </div>
  );
}
