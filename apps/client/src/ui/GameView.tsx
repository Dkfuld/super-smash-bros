import { useEffect, useRef, useState } from "react";
import type { ParticipantSlot } from "@ddd/shared";
import { GameWorld, type SpectatorCam } from "../game/world";
import { Controls } from "./Controls";
import { HUD } from "./HUD";
import { PortraitGate } from "./PortraitGate";

/**
 * Mounts the Babylon world for a match. With `myId` it renders the player HUD +
 * touch controls; without it, spectator camera controls.
 */
export function GameView({
  participants,
  myId,
  spectatorUi,
}: {
  participants: ParticipantSlot[];
  myId: string | null;
  spectatorUi?: boolean;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [nearPickup, setNearPickup] = useState(false);
  const [cam, setCam] = useState<SpectatorCam>("director");
  const [followIdx, setFollowIdx] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hatId = participants.find((p) => p.isPreviousLoser)?.id ?? null;
    const w = new GameWorld(canvas, participants, myId, hatId);
    setWorld(w);
    return () => w.dispose();
    // participants identity is stable for a given match

  }, [myId]);

  useEffect(() => {
    if (!world) return;
    return world.onHud((h) => setNearPickup(h.nearPickup));
  }, [world]);

  const switchCam = (c: SpectatorCam): void => {
    setCam(c);
    if (c === "follow") {
      const target = participants[followIdx % participants.length];
      world?.setSpectatorCam(c, target?.id);
    } else {
      world?.setSpectatorCam(c);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} className="game-canvas" />
      {world && <HUD world={world} isPlayer={myId !== null} />}
      {world && myId && <Controls world={world} nearPickup={nearPickup} />}
      {world && !myId && spectatorUi && (
        <div className="spec-controls">
          {(["director", "follow", "overhead", "arena"] as const).map((c) => (
            <button
              key={c}
              className={cam === c ? "active" : ""}
              onClick={() => {
                if (c === "follow" && cam === "follow") {
                  const next = followIdx + 1;
                  setFollowIdx(next);
                  world.setSpectatorCam("follow", participants[next % participants.length]?.id);
                } else {
                  switchCam(c);
                }
              }}
            >
              {c === "director" ? "🎬 Director" : c === "follow" ? `👤 ${participants[followIdx % participants.length]?.name ?? "Follow"}` : c === "overhead" ? "🗺 Overhead" : "🏟 Arena"}
            </button>
          ))}
        </div>
      )}
      {myId && <PortraitGate />}
    </div>
  );
}
