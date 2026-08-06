import { useState } from "react";
import { audio } from "../audio/audio";
import { settings, updateSettings } from "./settings";

/** Device settings drawer: graphics, audio, accessibility, controls. */
export function SettingsPanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const upd = (patch: Parameters<typeof updateSettings>[0]): void => {
    updateSettings(patch);
    audio.applyVolumes();
    force((n) => n + 1);
  };

  if (!open) {
    return (
      <button
        className="btn small secondary"
        style={{ position: "fixed", top: "max(0.5rem, env(safe-area-inset-top))", right: "max(0.5rem, env(safe-area-inset-right))", zIndex: 400, pointerEvents: "auto" }}
        onClick={() => setOpen(true)}
        aria-label="Settings"
      >
        ⚙️
      </button>
    );
  }

  const slider = (label: string, key: keyof typeof settings, min = 0, max = 1, step = 0.05): JSX.Element => (
    <div className="setting-row" key={String(key)}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key] as number}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as Parameters<typeof updateSettings>[0])}
      />
    </div>
  );
  const toggle = (label: string, key: keyof typeof settings): JSX.Element => (
    <div className="setting-row" key={String(key)}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={settings[key] as boolean}
        onChange={(e) => upd({ [key]: e.target.checked } as Parameters<typeof updateSettings>[0])}
        style={{ width: 22, height: 22 }}
      />
    </div>
  );

  return (
    <div
      style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(92vw, 21rem)", zIndex: 400, background: "var(--panel)", borderLeft: "1px solid var(--panel-border)", padding: "1rem", overflowY: "auto", touchAction: "pan-y", pointerEvents: "auto" }}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.6rem" }}>
        <strong>Settings</strong>
        <button className="btn small secondary" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div className="setting-row">
        <span>Graphics</span>
        <select value={settings.quality} onChange={(e) => upd({ quality: e.target.value as typeof settings.quality })}>
          <option value="auto">Auto</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", margin: "0.2rem 0 0.6rem" }}>Graphics changes apply next time a match view loads.</p>
      {toggle("Mute all", "muted")}
      {slider("Master volume", "masterVolume")}
      {slider("Music", "musicVolume")}
      {slider("Sound effects", "sfxVolume")}
      {slider("Voice (Yippee)", "voiceVolume")}
      {slider("Announcer", "announcerVolume")}
      <hr style={{ margin: "0.7rem 0", borderColor: "var(--panel-border)" }} />
      {toggle("Subtitles / captions", "subtitles")}
      {toggle("Reduced motion", "reducedMotion")}
      {toggle("High contrast UI", "highContrast")}
      {toggle("Flash reduction", "flashReduction")}
      {slider("Screen shake", "screenShake")}
      {slider("UI scale", "uiScale", 0.85, 1.3, 0.05)}
      <hr style={{ margin: "0.7rem 0", borderColor: "var(--panel-border)" }} />
      {toggle("Haptics", "haptics")}
      {toggle("Left-handed layout", "leftHanded")}
      {slider("Control sensitivity", "sensitivity", 0.6, 1.6, 0.05)}
      {toggle("Auto-face opponents", "autoFace")}
      {slider("Aim assist", "aimAssist")}
      {toggle("Performance monitor", "showPerf")}
    </div>
  );
}
