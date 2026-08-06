import { useEffect, useState } from "react";
import { ACCESSORIES, BODIES, COLORS, FACES, HAIRS, type CharacterConfig } from "@ddd/shared";
import { useConnection } from "../App";
import { audio } from "../audio/audio";
import { connection } from "../net/connection";
import { CharacterPreview } from "./CharacterPreview";
import { GameView } from "./GameView";
import { Lobby3D } from "./Lobby3D";
import { ResultsScreen } from "./Results";
import { SettingsPanel } from "./SettingsPanel";
import { vibrate } from "./settings";

/**
 * Full player journey: join room → claim league identity → customize fighter →
 * ready up → play → results.
 */
export function PlayerFlow({ roomCode }: { roomCode: string }): JSX.Element {
  const state = useConnection();
  const [nameEntered, setNameEntered] = useState(false);
  const [displayName, setDisplayName] = useState(localStorage.getItem("ddd.name") ?? "");

  useEffect(() => {
    connection.connect("player", roomCode);
    return () => connection.close();
  }, [roomCode]);

  useEffect(() => {
    if (nameEntered && state.status === "connected" && state.room && displayName) {
      connection.send({ t: "joinRoom", roomCode, displayName });
    }

  }, [nameEntered, state.status]);

  const room = state.room;
  const mySlot = state.slotIndex !== null ? room?.slots[state.slotIndex] : null;
  const inMatch = room && room.phase !== "lobby";

  // Results view once the match ends
  if (state.results && room) {
    return <ResultsScreen results={state.results} isHost={false} />;
  }

  // In-match: full game view
  if (inMatch && room) {
    return (
      <>
        <GameView participants={room.slots} myId={state.participantId} />
        <SettingsPanel />
        <ConnBadge status={state.status} rtt={state.rttMs} />
      </>
    );
  }

  if (!nameEntered) {
    return (
      <div className="screen">
        <SettingsPanel />
        <h1 className="title">JOIN THE DOME</h1>
        <p className="subtitle">Room {roomCode}</p>
        <div className="panel">
          <div className="field">
            <label>Your display name</label>
            <input
              value={displayName}
              maxLength={24}
              placeholder="e.g. Waiver Wire Wanda"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <button
            className="btn gold"
            style={{ width: "100%" }}
            disabled={displayName.trim().length === 0 || state.status !== "connected"}
            onClick={() => {
              audio.unlock();
              localStorage.setItem("ddd.name", displayName.trim());
              setNameEntered(true);
            }}
          >
            {state.status === "connected" ? "Enter the Dome →" : "Connecting…"}
          </button>
          {state.lastError && <p style={{ color: "var(--red)", marginTop: "0.5rem" }}>{state.lastError.message}</p>}
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="screen">
        <h2>Finding room {roomCode}…</h2>
        {state.lastError && <p style={{ color: "var(--red)" }}>{state.lastError.message}</p>}
      </div>
    );
  }

  // Claim a league identity
  if (!mySlot) {
    return (
      <div className="screen">
        <SettingsPanel />
        <h1 className="title" style={{ fontSize: "1.6rem" }}>{room.leagueName}</h1>
        <p className="subtitle">Which league member are you?</p>
        <div className="slot-pick">
          {room.slots.map((s) => (
            <button
              key={s.slotIndex}
              disabled={s.status !== "empty" || room.assignmentsLocked}
              onClick={() => {
                audio.play("click");
                connection.send({ t: "claimSlot", slotIndex: s.slotIndex });
              }}
            >
              {s.name}
              {s.isPreviousLoser ? " 🌈" : ""}
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                {s.status === "empty" ? "available" : s.status === "ai" ? "AI substitute" : "taken"}
              </div>
            </button>
          ))}
        </div>
        {state.lastError && <p style={{ color: "var(--red)" }}>{state.lastError.message}</p>}
      </div>
    );
  }

  // Ready → hang out in the 3D pregame lobby until the commissioner starts.
  if (mySlot.ready && room) {
    return (
      <>
        <Lobby3D slots={room.slots} mySlotIndex={mySlot.slotIndex} />
        <SettingsPanel />
        <ConnBadge status={state.status} rtt={state.rttMs} />
      </>
    );
  }

  return <Onboarding roomCode={roomCode} slotName={mySlot.name} isLoser={mySlot.isPreviousLoser} ready={mySlot.ready} initial={mySlot.character} />;
}

function Onboarding({
  slotName,
  isLoser,
  ready,
  initial,
}: {
  roomCode: string;
  slotName: string;
  isLoser: boolean;
  ready: boolean;
  initial: CharacterConfig;
}): JSX.Element {
  const [cfg, setCfg] = useState<CharacterConfig>(initial);
  const [testedControls, setTestedControls] = useState(0);

  const upd = (patch: Partial<CharacterConfig>): void => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    audio.play("click");
    connection.send({ t: "setCharacter", character: next });
  };

  const controlTest = (action: "move" | "attack" | "dodge"): void => {
    audio.play(action === "attack" ? "hit" : action === "dodge" ? "dodge" : "jump");
    vibrate(20);
    connection.send({ t: "controlTest", action });
    setTestedControls((n) => n + 1);
  };

  const chipRow = <T extends { id: string; name: string }>(
    label: string,
    items: readonly T[],
    selected: string,
    key: keyof CharacterConfig,
  ): JSX.Element => (
    <div key={label}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontWeight: 700, marginBottom: "0.25rem" }}>{label}</div>
      <div className="choice-row">
        {items.map((it) => (
          <button key={it.id} className={`chip ${selected === it.id ? "selected" : ""}`} onClick={() => upd({ [key]: it.id } as Partial<CharacterConfig>)}>
            {it.name}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="screen" style={{ justifyContent: "flex-start", paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <SettingsPanel />
      <h1 className="title" style={{ fontSize: "1.5rem" }}>
        You are {slotName} {isLoser && "🌈"}
      </h1>
      {isLoser && (
        <p className="subtitle" style={{ color: "var(--pink)" }}>
          Last season's last place. The Rainbow Fan-Spin Hat awaits you. Yippee!
        </p>
      )}
      <div className="onboard">
        <CharacterPreview config={cfg} withHat={isLoser} />
        <div className="panel" style={{ maxWidth: "26rem" }}>
          {chipRow("Body", BODIES, cfg.bodyId, "bodyId")}
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontWeight: 700, marginBottom: "0.25rem" }}>Team color</div>
          <div className="choice-row">
            {COLORS.map((c) => (
              <button
                key={c.id}
                className={`swatch ${cfg.colorId === c.id ? "selected" : ""}`}
                style={{ background: c.primary }}
                title={c.name}
                onClick={() => upd({ colorId: c.id })}
              />
            ))}
          </div>
          {chipRow("Face", FACES, cfg.faceId, "faceId")}
          {chipRow("Hair", HAIRS, cfg.hairId, "hairId")}
          {chipRow("Accessory", ACCESSORIES, cfg.accessoryId, "accessoryId")}
        </div>
      </div>
      <div className="panel" style={{ maxWidth: "26rem" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontWeight: 700, marginBottom: "0.4rem" }}>
          Control check {testedControls >= 3 ? "✅" : `(${Math.min(3, testedControls)}/3)`}
        </div>
        <div className="row">
          <button className="btn small secondary" onClick={() => controlTest("move")}>🕹 Move</button>
          <button className="btn small secondary" onClick={() => controlTest("attack")}>👊 Attack</button>
          <button className="btn small secondary" onClick={() => controlTest("dodge")}>💨 Dodge</button>
        </div>
      </div>
      <button
        className={`btn ${ready ? "secondary" : "gold"}`}
        onClick={() => {
          audio.play("ready");
          connection.send({ t: "setReady", ready: !ready });
        }}
      >
        {ready ? "✅ Ready — waiting for the host… (tap to unready)" : "I'M READY"}
      </button>
      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", paddingBottom: "1rem" }}>
        Keep this page open — the match starts automatically. Rotate to landscape when it does!
      </p>
    </div>
  );
}

export function ConnBadge({ status, rtt }: { status: string; rtt: number }): JSX.Element | null {
  if (status === "connected") {
    return rtt > 200 ? (
      <div style={{ position: "fixed", top: 4, left: 4, zIndex: 300, fontSize: "0.7rem", color: "var(--gold)", pointerEvents: "none" }}>⚠ {rtt}ms</div>
    ) : null;
  }
  return (
    <div className="error-toast" style={{ pointerEvents: "none" }}>
      {status === "reconnecting" ? "Reconnecting… (your fighter is safe)" : status}
    </div>
  );
}
