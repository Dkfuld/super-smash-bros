import { useEffect, useRef, useState } from "react";
import type { ParticipantSlot } from "@ddd/shared";
import { LobbyWorld } from "../game/lobby";
import { connection } from "../net/connection";
import { Controls } from "./Controls";
import { PortraitGate } from "./PortraitGate";
import { audio } from "../audio/audio";

/**
 * 3D pregame lobby: walk the Disaster Dome with the other ready fighters while
 * waiting for the commissioner. Attack/dodge/jump work for control practice.
 */
export function Lobby3D({ slots, mySlotIndex }: { slots: ParticipantSlot[]; mySlotIndex: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [world, setWorld] = useState<LobbyWorld | null>(null);
  const mySlot = slots[mySlotIndex];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mySlot) return;
    const w = new LobbyWorld(canvas, mySlot, slots);
    setWorld(w);
    audio.setMusic("menu");
    return () => {
      audio.setMusic("none");
      w.dispose();
    };
    // recreate only if our identity changes; roster updates flow via updateRoster
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySlotIndex]);

  useEffect(() => {
    world?.updateRoster(slots);
  }, [world, slots]);

  const joinedCount = slots.filter((s) => s.status !== "empty").length;
  const readyCount = slots.filter((s) => s.ready || s.status === "ai").length;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} className="game-canvas" />
      {world && <Controls world={world} nearPickup={false} />}
      <div className="hud" style={{ pointerEvents: "none" }}>
        <div className="hud-top">
          <span className="alive">✅ {readyCount}/12 ready</span>
          <span className="timer">{joinedCount}/12 joined</span>
        </div>
        <div className="hud-caption" style={{ bottom: "auto", top: "3.6rem" }}>
          Warm up! The match starts when the commissioner is ready.
        </div>
      </div>
      <button
        className="btn small secondary"
        style={{ position: "absolute", top: "max(0.5rem, env(safe-area-inset-top))", left: "max(0.5rem, env(safe-area-inset-left))", zIndex: 40 }}
        onClick={() => {
          audio.play("click");
          connection.send({ t: "setReady", ready: false });
        }}
      >
        ← Edit fighter
      </button>
      <PortraitGate />
    </div>
  );
}
