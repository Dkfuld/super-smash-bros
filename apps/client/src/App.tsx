import { useEffect, useSyncExternalStore } from "react";
import { connection } from "./net/connection";
import { audio } from "./audio/audio";
import { settings, subscribeSettings } from "./ui/settings";
import { Landing } from "./ui/Landing";
import { HostDashboard } from "./ui/HostDashboard";
import { PlayerFlow } from "./ui/PlayerFlow";
import { Spectator } from "./ui/Spectator";
import { ResultsStandalone } from "./ui/Results";
import { Solo } from "./ui/Solo";

export type AppMode =
  | { kind: "landing" }
  | { kind: "host"; demo?: boolean }
  | { kind: "play"; roomCode: string }
  | { kind: "spectate"; roomCode: string }
  | { kind: "results"; matchId: string }
  | { kind: "solo"; blob: string | null };

let mode: AppMode = initMode();
const modeListeners = new Set<() => void>();

function initMode(): AppMode {
  const p = new URLSearchParams(location.search);
  const sim = p.get("sim");
  if (sim !== null) return { kind: "solo", blob: sim || null };
  // Static/serverless build (GitHub Pages, artifact): simulator only.
  if (import.meta.env.VITE_SOLO_ONLY) return { kind: "solo", blob: null };
  const room = p.get("room");
  if (room) return { kind: "play", roomCode: room.toUpperCase() };
  const spectate = p.get("spectate");
  if (spectate) return { kind: "spectate", roomCode: spectate.toUpperCase() };
  const results = p.get("results");
  if (results) return { kind: "results", matchId: results };
  return { kind: "landing" };
}

export function setMode(m: AppMode): void {
  mode = m;
  for (const fn of modeListeners) fn();
}

export function App(): JSX.Element {
  const m = useSyncExternalStore(
    (fn) => {
      modeListeners.add(fn);
      return () => modeListeners.delete(fn);
    },
    () => mode,
  );
  useSyncExternalStore(subscribeSettings, () => settings);

  // Unlock audio on the first user gesture (mobile autoplay policy).
  useEffect(() => {
    const unlock = (): void => {
      audio.unlock();
      audio.applyVolumes();
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(settings.uiScale));
    document.body.classList.toggle("high-contrast", settings.highContrast);
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  });

  switch (m.kind) {
    case "solo":
      return <Solo blob={m.blob} />;
    case "host":
      return <HostDashboard demo={m.demo} />;
    case "play":
      return <PlayerFlow roomCode={m.roomCode} />;
    case "spectate":
      return <Spectator roomCode={m.roomCode} />;
    case "results":
      return <ResultsStandalone matchId={m.matchId} />;
    default:
      return <Landing />;
  }
}

export function useConnection(): typeof connection.state {
  return useSyncExternalStore(connection.subscribe, () => connection.state);
}
