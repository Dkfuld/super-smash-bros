import { useEffect, useRef } from "react";
import type { InputState } from "../game/world";
import { settings, vibrate } from "./settings";
import { audio } from "../audio/audio";

/** Anything that accepts gameplay input (the networked match world or the local lobby). */
export interface ControlTarget {
  setInput(patch: Partial<InputState>): void;
}

/**
 * Mobile touch controls: left virtual joystick + right action cluster, plus
 * keyboard (WASD/arrows, J/K/L/Space) and gamepad support for desktop play.
 */
export function Controls({ world, nearPickup }: { world: ControlTarget; nearPickup: boolean }): JSX.Element {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  // ---------- virtual joystick ----------
  useEffect(() => {
    const zone = zoneRef.current;
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!zone || !base || !knob) return;
    let pointerId: number | null = null;
    let cx = 0;
    let cy = 0;
    const R = 52;

    const setKnob = (dx: number, dy: number): void => {
      knob.style.left = `${cx + dx}px`;
      knob.style.top = `${cy + dy}px`;
    };
    const down = (e: PointerEvent): void => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const rect = zone.getBoundingClientRect();
      cx = e.clientX - rect.left;
      cy = e.clientY - rect.top;
      base.style.display = "block";
      base.style.left = `${cx}px`;
      base.style.top = `${cy}px`;
      knob.style.display = "block";
      setKnob(0, 0);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      const rect = zone.getBoundingClientRect();
      let dx = e.clientX - rect.left - cx;
      let dy = e.clientY - rect.top - cy;
      const mag = Math.hypot(dx, dy);
      if (mag > R) {
        dx = (dx / mag) * R;
        dy = (dy / mag) * R;
      }
      setKnob(dx, dy);
      const s = settings.sensitivity;
      world.setInput({ mx: Math.max(-1, Math.min(1, (dx / R) * s)), mz: Math.max(-1, Math.min(1, (-dy / R) * s)) });
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      base.style.display = "none";
      knob.style.display = "none";
      world.setInput({ mx: 0, mz: 0 });
    };
    zone.addEventListener("pointerdown", down);
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
    return () => {
      zone.removeEventListener("pointerdown", down);
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerup", up);
      zone.removeEventListener("pointercancel", up);
    };
  }, [world]);

  // ---------- keyboard ----------
  useEffect(() => {
    const keys = new Set<string>();
    const apply = (): void => {
      const mx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const mz = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      world.setInput({ mx, mz });
    };
    const downK = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      keys.add(k);
      if (k === "j") world.setInput({ atk: true });
      if (k === "k") world.setInput({ heavy: true });
      if (k === "l" || k === "shift") world.setInput({ dodge: true });
      if (k === " ") world.setInput({ jump: true });
      if (k === "e") world.setInput({ pickup: true });
      if (k === "q") world.setInput({ emote: true });
      apply();
    };
    const upK = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === "j") world.setInput({ atk: false });
      if (k === "k") world.setInput({ heavy: false });
      apply();
    };
    window.addEventListener("keydown", downK);
    window.addEventListener("keyup", upK);
    return () => {
      window.removeEventListener("keydown", downK);
      window.removeEventListener("keyup", upK);
    };
  }, [world]);

  // ---------- gamepad polling ----------
  useEffect(() => {
    let raf = 0;
    let prevButtons: boolean[] = [];
    const poll = (): void => {
      const gp = navigator.getGamepads?.()[0];
      if (gp) {
        const dz = (v: number): number => (Math.abs(v) < 0.15 ? 0 : v);
        const mx = dz(gp.axes[0] ?? 0);
        const mz = dz(-(gp.axes[1] ?? 0));
        if (mx !== 0 || mz !== 0) world.setInput({ mx, mz });
        const b = gp.buttons.map((x) => x.pressed);
        world.setInput({ atk: b[0] ?? false, heavy: b[2] ?? false });
        if (b[1] && !prevButtons[1]) world.setInput({ dodge: true });
        if (b[3] && !prevButtons[3]) world.setInput({ jump: true });
        if (b[5] && !prevButtons[5]) world.setInput({ pickup: true });
        prevButtons = b;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  const press = (patch: Partial<InputState>, haptic = 12): ((e: React.PointerEvent) => void) =>
    (e) => {
      e.preventDefault();
      audio.unlock();
      vibrate(haptic);
      world.setInput(patch);
    };
  const release = (patch: Partial<InputState>): ((e: React.PointerEvent) => void) =>
    (e) => {
      e.preventDefault();
      world.setInput(patch);
    };

  return (
    <div className={`controls ${settings.leftHanded ? "left-handed" : ""}`}>
      <div className="joystick-zone" ref={zoneRef}>
        <div className="joystick-base" ref={baseRef} style={{ display: "none" }} />
        <div className="joystick-knob" ref={knobRef} style={{ display: "none" }} />
      </div>
      <div className="action-cluster">
        <button className="abtn attack" onPointerDown={press({ atk: true }, 18)} onPointerUp={release({ atk: false })} onPointerLeave={release({ atk: false })}>
          <span className="icon">👊</span>
          <span className="label">ATTACK</span>
        </button>
        <button className="abtn heavy" onPointerDown={press({ heavy: true }, 24)} onPointerUp={release({ heavy: false })} onPointerLeave={release({ heavy: false })}>
          <span className="icon">💥</span>
          <span className="label">HOLD</span>
        </button>
        <button className="abtn dodge" onPointerDown={press({ dodge: true }, 14)}>
          <span className="icon">💨</span>
          <span className="label">DODGE</span>
        </button>
        <button className="abtn jump" onPointerDown={press({ jump: true }, 10)}>
          <span className="icon">⬆️</span>
          <span className="label">JUMP</span>
        </button>
        <button className={`abtn pickup ${nearPickup ? "available" : ""}`} onPointerDown={press({ pickup: true }, 16)}>
          <span className="icon">🖐️</span>
          <span className="label">GRAB</span>
        </button>
      </div>
    </div>
  );
}
