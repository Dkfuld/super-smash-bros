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
  // Spectators see standings by default on wide screens; on phones the panel
  // starts collapsed (the 🏆 button opens it) so the action isn't covered.
  const [boardOpen, setBoardOpen] = useState(!isPlayer && window.innerWidth > 700);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [caption, setCaption] = useState<{ text: string; mood: string } | null>(null);
  const [yippee, setYippee] = useState<{ id: number; name: string } | null>(null);
  const [banner, setBanner] = useState<{ h1: string; h2?: string } | null>(null);
  const [splats, setSplats] = useState<Array<{ id: number; big: boolean; blobs: Array<{ x: number; y: number; r: number }> }>>([]);
  const [koWord, setKoWord] = useState<{ id: number; word: string; rot: number } | null>(null);
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
            if (n.phase === "countdown") showBanner("GET READY!", "Kickoff imminent…");
            else if (n.phase === "playing") showBanner("KICKOFF!", undefined, 1500);
            else if (n.phase === "suddenDeath") showBanner("SUDDEN DEATH", "The Dome has lost its patience");
            break;
          case "finalTwo":
            showBanner("FINAL TWO", `${n.names[0]}  vs  ${n.names[1]}`, 3800);
            break;
          case "victory":
            showBanner("FIRST PICK!", `${n.playerName} survives the Smash Dome`, 8000);
            break;
          case "focusOut":
            showBanner("💥 YOU'RE OUT!", `Your draft pick: #${n.pick}. Time to spectate and heckle.`, 5000);
            break;
          case "focusWin":
            showBanner("👑 YOU WIN!", "FIRST OVERALL PICK IS YOURS!", 9000);
            break;
          case "splat": {
            // Flash reduction tones the splat down — it must never remove it
            // entirely, or deaths look like nothing happened.
            const calm = settings.flashReduction;
            const id = feedId.current++;
            const count = n.big ? (calm ? 6 : 14) : (calm ? 4 : 8);
            const blobs = Array.from({ length: count }, () => ({
              x: 4 + Math.random() * 92,
              y: 4 + Math.random() * 92,
              r: (n.big ? (calm ? 10 : 16) : (calm ? 7 : 10)) + Math.random() * (n.big ? (calm ? 10 : 22) : (calm ? 6 : 12)),
            }));
            setSplats((s) => [...s.slice(-2), { id, big: n.big && !calm, blobs }]);
            setTimeout(() => setSplats((s) => s.filter((x) => x.id !== id)), n.big ? 1700 : 1100);
            break;
          }
          case "koWord": {
            const id = feedId.current++;
            setKoWord({ id, word: n.word, rot: -14 + Math.random() * 28 });
            setTimeout(() => setKoWord((k) => (k?.id === id ? null : k)), 1100);
            break;
          }
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
    <div className={`hud ${isPlayer ? "" : "spectator"}`}>
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

      {!isPlayer && hud && hud.phase !== "lobby" && (() => {
        // Always-visible health for the fighter this viewer is watching.
        const me = hud.board.find((r) => r.isMe);
        if (!me || me.eliminated) return null;
        const c = me.hp > 50 ? "var(--green)" : me.hp > 25 ? "var(--gold)" : "var(--red)";
        return (
          <div className="focus-hp">
            <span className="fh-name">👤 {me.name}</span>
            <span className="fh-bar">
              <span className="fh-fill" style={{ width: `${Math.min(100, me.hp)}%`, background: c }} />
            </span>
            <span className="fh-num" style={{ color: c }}>{Math.max(0, Math.round(me.hp))}</span>
          </div>
        );
      })()}

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
                    {r.hat ? " 🧌" : ""}
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

      {yippee && <div className="yippee-pop">🧌 “Yippee!” — {yippee.name}</div>}

      {banner && (
        <div className="hud-banner">
          <h1>{banner.h1}</h1>
          {banner.h2 && <h2>{banner.h2}</h2>}
        </div>
      )}

      {splats.map((s) => (
        <div
          key={s.id}
          className={`splat ${s.big ? "big" : ""}`}
          style={{
            background: s.blobs
              .map((b) => `radial-gradient(circle ${b.r}vmin at ${b.x}% ${b.y}%, rgba(214,28,48,0.85) 0%, rgba(214,28,48,0.8) 55%, transparent 62%)`)
              .join(","),
          }}
        />
      ))}

      {koWord && (
        <div className="ko-word" style={{ transform: `translate(-50%, -50%) rotate(${koWord.rot}deg)` }}>
          {koWord.word}
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
