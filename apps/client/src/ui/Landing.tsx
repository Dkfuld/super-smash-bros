import { useState } from "react";
import { setMode } from "../App";
import { audio } from "../audio/audio";
import { SettingsPanel } from "./SettingsPanel";

export function Landing(): JSX.Element {
  const [joinCode, setJoinCode] = useState("");

  return (
    <div className="screen">
      <SettingsPanel />
      <div style={{ fontSize: "3rem" }}>🏟️</div>
      <h1 className="title">DRAFT DAY:<br />DISASTER DOME</h1>
      <p className="subtitle">
        Twelve league members. One chaotic 3D arena. The order you get eliminated is your fantasy draft order. First one
        out picks last. Last one standing picks first. No takebacks.
      </p>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        <button className="btn gold" onClick={() => { audio.unlock(); setMode({ kind: "host" }); }}>
          🎪 Host a Draft Night
        </button>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.08)", border: "1px solid var(--panel-border)", borderRadius: 10, padding: "0.7rem", color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 800, textAlign: "center" }}
            placeholder="ROOM CODE"
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
          <button className="btn" disabled={joinCode.length !== 6} onClick={() => { audio.unlock(); setMode({ kind: "play", roomCode: joinCode }); }}>
            Join
          </button>
        </div>
        <button className="btn secondary" disabled={joinCode.length !== 6} onClick={() => { audio.unlock(); setMode({ kind: "spectate", roomCode: joinCode }); }}>
          📺 Spectate that room
        </button>
        <button className="btn secondary" onClick={() => { audio.unlock(); setMode({ kind: "host", demo: true }); }}>
          🤖 Watch a full AI demo match
        </button>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
        Works in your phone browser · Best in landscape · Add to Home Screen for full-screen chaos
      </p>
    </div>
  );
}
