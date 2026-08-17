import { useEffect, useRef, useState } from "react";
import type { GameWorld, HudState, UiNotice } from "../game/world";
import { settings } from "./settings";

interface FeedItem {
  id: number;
  text: string;
}

/** In-match HUD: health, timers, kill feed, captions, big-moment banners. */
export function HUD({ world, isPlayer }: { world: GameWorld; isPlayer: boolean }): JSX.Element {
  const [hud, setHud] = useState<HudState | null>(null);
  const [boardOpen, setBoardOpen] = useState(!isPlayer); // spectators see standings by default
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [caption, setCaption] = useState<{ text: string; mood: string } | null>(null);
  const [yippee, setYippee] = useState<{ id: number; name: string } | null>(null);
  const [banner, setBanner] = useState<{ h1: string; h2?: string } | null>(null);
  const feedId = useRef(1);
  const captionTimer = useRef<number | null>(null);
  const bannerTimer = useRef<number | null>(null);

  useEffect(() => world.onHud(setHud), [world]);

  useEffect(
    () =>
      world.onNotice((n: UiNotice) => {
        switch (n.kind) {
          case "feed": {
            const item = { id: feedId.current++, text: n.text };
            setFeed((f) => [...f.slice(-4), item]);
            setTimeout(() => setFeed((f) => f.filter((x) => x.id !== item.id)), 6000);
            break;
          }
          case "caption":
            if (!settings.subtitles && n.mood !== "victory") break;
            setCaption({ text: n.text, mood: n.mood });
            if (captionTimer.current) clearTimeout(captionTimer.current);
            captionTimer.current = window.setTimeout(() => setCaption(null), 4500);
            break;
          case "yippee": {
            const id = feedId.current++;
            setYippee({ id, name: n.playerName });
            setTimeout(() => setYippee((y) => (y?.id === id ? null : y)), 1600);
            break;
          }
          case "phase":
            if (n.phase === "countdown") showBanner("GET READY!", "Match starting…");
            else if (n.phase === "playing") showBanner("GO!", undefined, 1500);
            else if (n.phase === "suddenDeath") showBanner("SUDDEN DEATH", "The Dome has lost its patience");
            break;
          case "finalTwo":
            showBanner("FINAL TWO", `${n.names[0]}  vs  ${n.names[1]}`, 3800);
            break;
          case "victory":
            showBanner("FIRST PICK!", `${n.playerName} survives the Disaster Dome`, 8000);
            break;
        }
      }),
    [world],
  );

  const showBanner = (h1: string, h2?: string, ms = 2600): void => {
    setBanner({ h1, ...(h2 !== undefined ? { h2 } : {}) });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), ms);
  };

  const hpFrac = hud ? Math.max(0, hud.hp) / hud.maxHp : 1;
  const mins = hud ? Math.floor(hud.matchTimeSec / 60) : 0;
  const secs = hud ? Math.floor(hud.matchTimeSec % 60) : 0;

  return (
    <div className="hud">
      {hud && (
        <div className="hud-top">
          <span className="alive">👥 {hud.aliveCount}</span>
          <span className="timer">
            {mins}:{String(secs).padStart(2, "0")}
          </span>
          {hud.zoneShrinkIn >= 0 && hud.zoneShrinkIn < 30 && <span className="zone-timer">⚠️ {Math.ceil(hud.zoneShrinkIn)}s</span>}
        </div>
      )}

      {hud && isPlayer && !hud.eliminated && (
        <div className="hud-hp">
          <div className="hp-bar">
            <div
              className={`hp-fill ${hpFrac <= 0.25 ? "low" : hpFrac <= 0.5 ? "mid" : ""}`}
              style={{ width: `${hpFrac * 100}%` }}
            />
          </div>
          <div className="hud-weapon">
            {hud.weaponName ? `🗡 ${hud.weaponName}${hud.ammo < 999 ? ` ×${hud.ammo}` : ""}` : "👊 Fists of Mild Fury"}
            {hud.powerups.length > 0 && ` · ⚡${hud.powerups.length}`}
          </div>
        </div>
      )}

      <div className="hud-feed">
        {feed.map((f) => (
          <div key={f.id} className="feed-item">
            {f.text}
          </div>
        ))}
      </div>

      {hud && hud.phase !== "lobby" && (
        <>
          <button
            className="board-toggle"
            style={{ pointerEvents: "auto" }}
            onClick={() => setBoardOpen((o) => !o)}
            aria-label="Toggle leaderboard"
          >
            🏆
          </button>
          {boardOpen && (
            <div className="leaderboard">
              <div className="lb-title">LIVE STANDINGS</div>
              {hud.board.map((r, i) => (
                <div key={r.id} className={`lb-row ${r.eliminated ? "out" : ""} ${r.isMe ? "me" : ""}`}>
                  <span className="lb-rank">{r.eliminated ? `#${r.pick}` : i + 1}</span>
                  <span className="lb-name">
                    {r.name}
                    {r.hat ? " 🌈" : ""}
                  </span>
                  {r.eliminated ? (
                    <span className="lb-out">💥 pick {r.pick}</span>
                  ) : (
                    <>
                      {r.elims > 0 && <span className="lb-elims">⚔{r.elims}</span>}
                      <span className="lb-hpbar">
                        <span
                          className="lb-hpfill"
                          style={{ width: `${Math.min(100, r.hp)}%`, background: r.hp > 50 ? "var(--green)" : r.hp > 25 ? "var(--gold)" : "var(--red)" }}
                        />
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {caption && (
        <div className="hud-caption">
          <span className="who">🎙</span> {caption.text}
        </div>
      )}

      {yippee && <div className="yippee-pop">🌈 “Yippee!” — {yippee.name}</div>}

      {banner && (
        <div className="hud-banner">
          <h1>{banner.h1}</h1>
          {banner.h2 && <h2>{banner.h2}</h2>}
        </div>
      )}

      {hud?.outsideZone && !hud.eliminated && !settings.flashReduction && <div className="hud-vignette" />}
      {hud?.blind && <div className="hud-blind" />}

      {isPlayer && hud?.eliminated && hud.phase !== "victory" && hud.phase !== "ended" && (
        <div className="hud-banner">
          <h1 style={{ color: "var(--red)" }}>ELIMINATED</h1>
          <h2>{hud.myPlacementPick ? `You get draft pick ${hud.myPlacementPick}. Enjoy spectating!` : "Enjoy spectating!"}</h2>
        </div>
      )}

      {settings.showPerf && hud && <div className="perf-monitor">{hud.fps} fps</div>}
    </div>
  );
}
