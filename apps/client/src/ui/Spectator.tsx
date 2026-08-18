import { useEffect } from "react";
import { useConnection } from "../App";
import { connection } from "../net/connection";
import { GameView } from "./GameView";
import { ResultsScreen } from "./Results";
import { SettingsPanel } from "./SettingsPanel";

/** TV / laptop spectator experience with cinematic camera modes. */
export function Spectator({ roomCode }: { roomCode: string }): JSX.Element {
  const state = useConnection();

  useEffect(() => {
    connection.connect("spectator", roomCode);
    return () => connection.close();
  }, [roomCode]);

  if (state.results && state.room) {
    return <ResultsScreen results={state.results} isHost={false} />;
  }

  const room = state.room;
  if (!room) {
    return (
      <div className="screen">
        <h2>Connecting to room {roomCode}…</h2>
        {state.lastError && <p style={{ color: "var(--red)" }}>{state.lastError.message}</p>}
      </div>
    );
  }

  if (room.phase === "lobby") {
    const readyCount = room.slots.filter((s) => s.ready || s.status === "ai").length;
    return (
      <div className="screen">
        <SettingsPanel />
        <h1 className="title">{room.leagueName}</h1>
        <p className="subtitle">Waiting for the commissioner to start the match — {readyCount}/12 ready</p>
        <div className="slot-pick">
          {room.slots.map((s) => (
            <button key={s.slotIndex} disabled style={{ opacity: 1 }}>
              {s.name}
              {s.isPreviousLoser ? " 🧌" : ""}
              <div style={{ fontSize: "0.7rem", color: s.ready || s.status === "ai" ? "var(--green)" : "var(--text-dim)" }}>
                {s.status === "ai" ? "AI ready" : s.ready ? "ready ✓" : s.status === "human" ? "customizing…" : "not joined"}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <GameView participants={room.slots} myId={null} spectatorUi />
      <SettingsPanel />
    </>
  );
}
