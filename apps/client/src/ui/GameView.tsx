import { useEffect, useRef, useState } from "react";
import type { ParticipantSlot } from "@ddd/shared";
import { GameWorld, type SpectatorCam } from "../game/world";
import type { FighterKit } from "../game/character";
import { Controls } from "./Controls";
import { HUD } from "./HUD";
import { PortraitGate } from "./PortraitGate";

/**
 * Mounts the Babylon world for a match. With `myId` it renders the player HUD +
 * touch controls; without it, spectator camera controls with a follow roster so
 * every viewer can lock onto their own fighter.
 */
export function GameView({
  participants,
  myId,
  spectatorUi,
  initialFocusId,
  kits,
  onWorld,
}: {
  participants: ParticipantSlot[];
  myId: string | null;
  spectatorUi?: boolean;
  initialFocusId?: string | null;
  kits?: Array<FighterKit | undefined>;
  onWorld?: (w: GameWorld | null) => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [nearPickup, setNearPickup] = useState(false);
  const [cam, setCam] = useState<SpectatorCam>(initialFocusId ? "follow" : "director");
  const [followId, setFollowId] = useState<string | null>(initialFocusId ?? null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hatId = participants.find((p) => p.isPreviousLoser)?.id ?? null;
    const w = new GameWorld(canvas, participants, myId, hatId, kits);
    if (initialFocusId) w.setFocus(initialFocusId);
    setWorld(w);
    onWorld?.(w);
    return () => {
      onWorld?.(null);
      w.dispose();
    };
    // participants identity is stable for a given match
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  useEffect(() => {
    if (!world) return;
    return world.onHud((h) => setNearPickup(h.nearPickup));
  }, [world]);

  // "My guy" stays pinned to the fighter this viewer picked at the start —
  // browsing other fighters must not re-target it.
  const myGuyId = initialFocusId ?? null;

  const pickCam = (c: SpectatorCam): void => {
    setCam(c);
    world?.setSpectatorCam(c);
  };
  const followPlayer = (id: string): void => {
    setFollowId(id);
    setCam("follow");
    // Personal devices (viewer picked a fighter) adopt whoever they follow —
    // big splat + personal banners. Shared TVs (no pick) just move the camera.
    if (myGuyId) world?.setFocus(id);
    else world?.setSpectatorCam("follow", id);
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} className="game-canvas" />
      {world && <HUD world={world} isPlayer={myId !== null} />}
      {world && myId && <Controls world={world} nearPickup={nearPickup} />}
      {world && !myId && spectatorUi && (
        <>
          <div className="spec-controls">
            {myGuyId && (
              <button className={cam === "follow" && followId === myGuyId ? "active" : ""} onClick={() => followPlayer(myGuyId)}>
                <span className="ico">👤</span>
                <span className="lbl"> My guy</span>
              </button>
            )}
            {(["director", "overhead", "arena"] as const).map((c) => (
              <button key={c} className={cam === c ? "active" : ""} onClick={() => pickCam(c)}>
                <span className="ico">{c === "director" ? "🎬" : c === "overhead" ? "🗺" : "🏟"}</span>
                <span className="lbl"> {c === "director" ? "Director" : c === "overhead" ? "Overhead" : "Arena"}</span>
              </button>
            ))}
          </div>
          <div className="spec-roster">
            {participants.map((p) => (
              <button
                key={p.id}
                className={`roster-chip ${cam === "follow" && followId === p.id ? "active" : ""}`}
                onClick={() => followPlayer(p.id)}
              >
                {p.name}
                {p.isPreviousLoser ? " 🧌" : ""}
              </button>
            ))}
          </div>
        </>
      )}
      {myId && <PortraitGate />}
    </div>
  );
}
