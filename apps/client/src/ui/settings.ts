/** Local device settings (accessibility, audio, graphics). Persisted to localStorage. */

export interface DeviceSettings {
  quality: "auto" | "low" | "medium" | "high";
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  announcerVolume: number;
  muted: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  subtitles: boolean;
  screenShake: number; // 0..1
  flashReduction: boolean;
  haptics: boolean;
  leftHanded: boolean;
  uiScale: number; // 0.85..1.3
  sensitivity: number; // 0.6..1.6
  autoFace: boolean; // aim assist: auto-face nearest opponent
  aimAssist: number; // 0..1
  showPerf: boolean;
}

const DEFAULTS: DeviceSettings = {
  quality: "auto",
  masterVolume: 0.9,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  voiceVolume: 1,
  announcerVolume: 0.9,
  muted: false,
  reducedMotion: typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast: false,
  subtitles: true,
  screenShake: 1,
  flashReduction: false,
  haptics: true,
  leftHanded: false,
  uiScale: 1,
  sensitivity: 1,
  autoFace: true,
  aimAssist: 0.6,
  showPerf: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function load(): DeviceSettings {
  try {
    const raw = localStorage.getItem("ddd.settings");
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DeviceSettings>) };
  } catch {
    /* corrupted -> defaults */
  }
  return { ...DEFAULTS };
}

export let settings: DeviceSettings = load();

export function updateSettings(patch: Partial<DeviceSettings>): void {
  settings = { ...settings, ...patch };
  localStorage.setItem("ddd.settings", JSON.stringify(settings));
  for (const fn of listeners) fn();
}

export function subscribeSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function vibrate(pattern: number | number[]): void {
  if (settings.haptics && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* unsupported */
    }
  }
}
