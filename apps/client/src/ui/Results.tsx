import { useEffect, useState } from "react";
import { COLORS, draftOrderAsCsv, draftOrderAsText, type MatchResults } from "@ddd/shared";
import { audio } from "../audio/audio";
import { drawIcon } from "../game/character";
import { setMode } from "../App";

/** Final draft order, stats, awards, and all export paths (text/CSV/JSON/PNG/link). */
export function ResultsScreen({
  results,
  isHost,
  onRestart,
}: {
  results: MatchResults;
  isHost: boolean;
  onRestart?: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    audio.setMusic("victory");
    return () => audio.setMusic("none");
  }, []);

  const flash = (what: string): void => {
    setCopied(what);
    audio.play("ready");
    setTimeout(() => setCopied(null), 1600);
  };

  const download = (filename: string, content: string | Blob, type = "text/plain"): void => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colorOf = (colorId: string): { primary: string; icon: string } => {
    const c = COLORS.find((x) => x.id === colorId);
    return { primary: c?.primary ?? "#888", icon: c?.icon ?? "circle" };
  };

  const shareUrl = `${location.origin}/?results=${results.matchId}`;

  return (
    <div className="screen" style={{ justifyContent: "flex-start", paddingTop: "max(1.2rem, env(safe-area-inset-top))", paddingBottom: "2rem" }}>
      <h1 className="title" style={{ fontSize: "1.9rem" }}>OFFICIAL DRAFT ORDER</h1>
      <p className="subtitle">
        {results.leagueName} · {new Date(results.endedAt).toLocaleDateString()} · match {results.matchId}
      </p>

      <div className="results-list">
        {results.draftOrder.map((p, i) => {
          const c = colorOf(p.colorId);
          return (
            <div key={p.pick} className={`result-row ${p.pick === 1 ? "first" : ""}`} style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="pick">{p.pick === 1 ? "🏆" : `#${p.pick}`}</span>
              <Avatar color={c.primary} icon={c.icon} />
              <span style={{ flex: 1, fontWeight: 800 }}>
                {p.playerName}
                {results.rainbowHatPlayerId === p.playerId ? " 🌈" : ""}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                {p.pick === 1 ? "WINNER — FIRST PICK" : `eliminated ${ordinal(13 - p.placement)}`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn small secondary" onClick={() => { void navigator.clipboard?.writeText(draftOrderAsText(results.leagueName, results.draftOrder)); flash("text"); }}>
          {copied === "text" ? "✓ Copied" : "📋 Copy as text"}
        </button>
        <button className="btn small secondary" onClick={() => download(`draft-order-${results.matchId}.csv`, draftOrderAsCsv(results.draftOrder), "text/csv")}>
          ⬇ CSV
        </button>
        <button className="btn small secondary" onClick={() => download(`match-${results.matchId}.json`, JSON.stringify(results, null, 2), "application/json")}>
          ⬇ JSON
        </button>
        <button className="btn small secondary" onClick={() => { void renderResultsCard(results).then((blob) => download(`draft-night-${results.matchId}.png`, blob)); flash("png"); }}>
          🖼 Results card (PNG)
        </button>
        <button className="btn small secondary" onClick={() => { void navigator.clipboard?.writeText(shareUrl); flash("link"); }}>
          {copied === "link" ? "✓ Copied" : "🔗 Share link"}
        </button>
      </div>

      <h2 style={{ fontWeight: 900, marginTop: "0.6rem" }}>🏅 Awards</h2>
      <div className="awards-grid">
        {results.awards.map((a) => (
          <div key={a.id} className="award-card">
            <div className="aw-title">{a.title}</div>
            <div style={{ fontWeight: 700 }}>{a.playerName}</div>
            <div style={{ color: "var(--text-dim)" }}>{a.description}</div>
          </div>
        ))}
      </div>

      <button className="btn small secondary" onClick={() => setStatsOpen(!statsOpen)}>
        {statsOpen ? "Hide" : "Show"} full match statistics
      </button>
      {statsOpen && (
        <div style={{ overflowX: "auto", maxWidth: "94vw" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                {["Player", "Elims", "Dmg dealt", "Dmg taken", "Weapons", "Legendary", "Survival", "Distance", "Knockdowns", "Hiding", "Yippees"].map((h) => (
                  <th key={h} style={{ padding: "0.3rem 0.6rem", borderBottom: "1px solid var(--panel-border)", textAlign: "left", color: "var(--text-dim)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.stats
                .slice()
                .sort((a, b) => (pickOf(results, a.playerId) ?? 99) - (pickOf(results, b.playerId) ?? 99))
                .map((s) => (
                  <tr key={s.playerId}>
                    <td style={{ padding: "0.3rem 0.6rem", fontWeight: 700 }}>{nameOf(results, s.playerId)}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{s.eliminations}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{Math.round(s.damageDealt)}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{Math.round(s.damageReceived)}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{s.weaponsPickedUp}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{s.legendaryPickups}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{Math.round(s.survivalMs / 1000)}s</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{s.distanceTraveled}m</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{s.knockdownsDealt}</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{Math.round(s.timeHidingMs / 1000)}s</td>
                    <td style={{ padding: "0.3rem 0.6rem" }}>{s.yippees}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ justifyContent: "center", paddingBottom: "1rem" }}>
        {isHost && onRestart && (
          <button className="btn" onClick={onRestart}>
            🔄 Run it back (unofficial!)
          </button>
        )}
        <button className="btn secondary" onClick={() => { location.href = "/"; }}>
          🏠 Home
        </button>
      </div>
    </div>
  );
}

/** Standalone shareable results page (loads by match id from the server). */
export function ResultsStandalone({ matchId }: { matchId: string }): JSX.Element {
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/results/${matchId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Match not found"))))
      .then((r: MatchResults) => setResults(r))
      .catch((e: Error) => setError(e.message));
  }, [matchId]);
  if (error) {
    return (
      <div className="screen">
        <h2>😵 {error}</h2>
        <button className="btn secondary" onClick={() => setMode({ kind: "landing" })}>Home</button>
      </div>
    );
  }
  if (!results) return <div className="screen"><h2>Loading results…</h2></div>;
  return <ResultsScreen results={results} isHost={false} />;
}

function Avatar({ color, icon }: { color: string; icon: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    drawIcon(ctx, icon, 32, 32, 13);
    setUrl(c.toDataURL());
  }, [color, icon]);
  return url ? <img className="avatar" src={url} alt="" /> : <span className="avatar" style={{ background: color }} />;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? "th"}`;
}

function nameOf(r: MatchResults, id: string): string {
  return r.draftOrder.find((p) => p.playerId === id)?.playerName ?? id;
}

function pickOf(r: MatchResults, id: string): number | undefined {
  return r.draftOrder.find((p) => p.playerId === id)?.pick;
}

/** Polished league-night PNG card rendered on a canvas. */
async function renderResultsCard(results: MatchResults): Promise<Blob> {
  const W = 1080;
  const H = 1500;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#2a1856");
  bg.addColorStop(0.5, "#12082b");
  bg.addColorStop(1, "#1d1040");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // confetti dots
  const confettiColors = ["#ff3b3b", "#ff9f2e", "#ffe83b", "#43d94e", "#3b8bff", "#a04ef2", "#ff5f9e"];
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = confettiColors[i % confettiColors.length] ?? "#fff";
    ctx.globalAlpha = 0.25 + Math.random() * 0.4;
    ctx.save();
    ctx.translate(Math.random() * W, Math.random() * H);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillRect(0, 0, 10, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd23f";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.fillText("DRAFT DAY: DISASTER DOME", W / 2, 100);
  ctx.fillStyle = "#f4f0ff";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText(results.leagueName, W / 2, 160);
  ctx.fillStyle = "#b9aede";
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.fillText(`Official draft order · ${new Date(results.endedAt).toLocaleDateString()} · Match ${results.matchId}`, W / 2, 202);

  // champion banner
  const champ = results.draftOrder.find((p) => p.pick === 1);
  ctx.fillStyle = "rgba(255,210,63,0.15)";
  roundRect(ctx, 60, 232, W - 120, 86, 20);
  ctx.fill();
  ctx.strokeStyle = "#ffd23f";
  ctx.lineWidth = 3;
  roundRect(ctx, 60, 232, W - 120, 86, 20);
  ctx.stroke();
  ctx.fillStyle = "#ffd23f";
  ctx.font = "900 44px system-ui, sans-serif";
  ctx.fillText(`🏆 ${champ?.playerName ?? "?"} — FIRST OVERALL PICK`, W / 2, 290);

  // picks
  ctx.textAlign = "left";
  const startY = 370;
  const rowH = 66;
  results.draftOrder.forEach((p, i) => {
    const y = startY + i * rowH;
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)";
    roundRect(ctx, 60, y - 42, W - 120, 56, 12);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.font = "900 36px system-ui, sans-serif";
    ctx.fillText(`${p.pick}.`, 84, y);
    const color = COLORS.find((x) => x.id === p.colorId)?.primary ?? "#888";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(180, y - 13, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f0ff";
    ctx.font = "800 34px system-ui, sans-serif";
    const hat = results.rainbowHatPlayerId === p.playerId ? " 🌈" : "";
    ctx.fillText(`${p.playerName}${hat}`, 220, y);
    ctx.fillStyle = "#b9aede";
    ctx.font = "500 24px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(p.pick === 1 ? "champion" : `out ${ordinal(13 - p.placement)}`, W - 90, y - 2);
    ctx.textAlign = "left";
  });

  // awards footer
  const awardsY = startY + 12 * rowH + 30;
  ctx.fillStyle = "#ffd23f";
  ctx.font = "900 30px system-ui, sans-serif";
  ctx.fillText("🏅 Night's honors:", 60, awardsY);
  ctx.fillStyle = "#ded4ff";
  ctx.font = "500 24px system-ui, sans-serif";
  results.awards.slice(0, 4).forEach((a, i) => {
    ctx.fillText(`${a.title}: ${a.playerName}`, 60, awardsY + 36 + i * 32);
  });
  const hatName = results.draftOrder.find((p) => p.playerId === results.rainbowHatPlayerId)?.playerName;
  if (hatName) {
    ctx.fillStyle = "#ff5f9e";
    ctx.fillText(`🌈 Rainbow Fan-Spin Hat proudly worn by ${hatName}. Yippee!`, 60, awardsY + 36 + 4 * 32);
  }

  return await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
