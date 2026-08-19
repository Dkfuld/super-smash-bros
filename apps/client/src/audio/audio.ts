import { settings } from "../ui/settings";

/**
 * All audio is original and synthesized at runtime: WebAudio recipes for SFX,
 * a tiny procedural sequencer for music, and the Speech Synthesis API for the
 * announcer + Yippee voice (with a synth chirp fallback). Nothing plays until
 * the first user gesture (mobile autoplay policy).
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private unlocked = false;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicTrack: "none" | "menu" | "arena" | "finalTwo" | "victory" = "none";
  private lastVoiceAt = 0;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.unlocked && this.ctx?.state === "running") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
    }
    void this.ctx.resume();
    this.unlocked = true;
    this.applyVolumes();
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  applyVolumes(): void {
    if (!this.master || !this.musicGain || !this.sfxGain) return;
    this.master.gain.value = settings.muted ? 0 : settings.masterVolume;
    this.musicGain.gain.value = settings.musicVolume * 0.5;
    this.sfxGain.gain.value = settings.sfxVolume;
  }

  // ---------------- SFX synthesis ----------------

  private tone(opts: {
    freq: number; freqEnd?: number; dur: number; type?: OscillatorType;
    vol?: number; delay?: number; slideType?: "exp" | "lin";
  }): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd !== undefined) {
      if (opts.slideType === "lin") osc.frequency.linearRampToValueAtTime(opts.freqEnd, t0 + opts.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur);
    }
    g.gain.setValueAtTime(opts.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  private noise(opts: { dur: number; vol?: number; filterFreq?: number; filterEnd?: number; delay?: number; hp?: boolean }): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const len = Math.ceil(this.ctx.sampleRate * opts.dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.hp ? "highpass" : "lowpass";
    filter.frequency.setValueAtTime(opts.filterFreq ?? 1200, t0);
    if (opts.filterEnd) filter.frequency.exponentialRampToValueAtTime(opts.filterEnd, t0 + opts.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
  }

  /** Play a named SFX. Names map from weapon/hazard `audio` keys + UI events. */
  play(name: string): void {
    if (!this.ctx) return;
    switch (name) {
      case "squeak": this.tone({ freq: 900, freqEnd: 1400, dur: 0.12, type: "square", vol: 0.15 }); this.tone({ freq: 500, freqEnd: 300, dur: 0.2, delay: 0.1, type: "sine", vol: 0.2 }); break;
      case "thwip": this.noise({ dur: 0.08, vol: 0.18, filterFreq: 3000, hp: true }); break;
      case "clang": this.tone({ freq: 320, freqEnd: 180, dur: 0.3, type: "sawtooth", vol: 0.25 }); this.noise({ dur: 0.15, vol: 0.2, filterFreq: 4000 }); break;
      case "blower": this.noise({ dur: 0.3, vol: 0.15, filterFreq: 800, filterEnd: 1600 }); break;
      case "foomp": this.tone({ freq: 160, freqEnd: 60, dur: 0.18, type: "triangle", vol: 0.35 }); break;
      case "whiff": case "whoosh": this.noise({ dur: 0.15, vol: 0.12, filterFreq: 2200, filterEnd: 600 }); break;
      case "laserMaybe": this.tone({ freq: 700, freqEnd: Math.random() > 0.3 ? 200 : 1800, dur: 0.25, type: "sawtooth", vol: 0.15 }); break;
      case "feedback": this.tone({ freq: 1200, freqEnd: 2400, dur: 0.35, type: "square", vol: 0.08 }); this.tone({ freq: 1207, freqEnd: 2413, dur: 0.35, type: "square", vol: 0.08 }); break;
      case "gavel": this.tone({ freq: 90, freqEnd: 40, dur: 0.4, type: "sine", vol: 0.5 }); this.noise({ dur: 0.2, vol: 0.3, filterFreq: 900 }); break;
      case "sizzle": this.noise({ dur: 0.4, vol: 0.12, filterFreq: 5000, hp: true }); break;
      case "sparklePop": this.tone({ freq: 1800, freqEnd: 3600, dur: 0.2, type: "sine", vol: 0.15 }); this.tone({ freq: 2400, freqEnd: 4200, dur: 0.25, delay: 0.05, type: "sine", vol: 0.12 }); break;
      case "sendWoosh": this.tone({ freq: 500, freqEnd: 900, dur: 0.2, type: "sine", vol: 0.12 }); break;
      case "rattle": case "wheelieClatter": case "cartRattle": for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, vol: 0.12, delay: i * 0.07, filterFreq: 2500 }); break;
      case "splat": this.tone({ freq: 250, freqEnd: 80, dur: 0.15, type: "triangle", vol: 0.3 }); this.noise({ dur: 0.1, vol: 0.15, filterFreq: 1000 }); break;
      case "plunk": this.tone({ freq: 220, freqEnd: 440, dur: 0.15, type: "square", vol: 0.2 }); break;
      case "bwok": this.tone({ freq: 600, freqEnd: 350, dur: 0.1, type: "square", vol: 0.15 }); this.tone({ freq: 350, freqEnd: 700, dur: 0.12, delay: 0.1, type: "square", vol: 0.15 }); break;
      case "partyBoom": case "explosion": this.tone({ freq: 100, freqEnd: 30, dur: 0.5, type: "sine", vol: 0.5 }); this.noise({ dur: 0.5, vol: 0.35, filterFreq: 2000, filterEnd: 200 }); break;
      case "spicy": this.noise({ dur: 0.25, vol: 0.14, filterFreq: 3000, filterEnd: 5000, hp: true }); break;
      case "hit": this.tone({ freq: 200, freqEnd: 100, dur: 0.1, type: "square", vol: 0.25 }); this.noise({ dur: 0.06, vol: 0.2, filterFreq: 2000 }); break;
      case "heavyHit": this.tone({ freq: 150, freqEnd: 50, dur: 0.25, type: "square", vol: 0.4 }); this.noise({ dur: 0.15, vol: 0.3, filterFreq: 1200 }); break;
      case "ko": this.tone({ freq: 800, freqEnd: 100, dur: 0.6, type: "sawtooth", vol: 0.3 }); break;
      case "dodge": this.noise({ dur: 0.12, vol: 0.1, filterFreq: 1800, filterEnd: 3600, hp: true }); break;
      case "jump": this.tone({ freq: 300, freqEnd: 600, dur: 0.15, type: "sine", vol: 0.15 }); break;
      case "pickup": this.tone({ freq: 500, dur: 0.08, type: "triangle", vol: 0.2 }); this.tone({ freq: 750, dur: 0.1, delay: 0.08, type: "triangle", vol: 0.2 }); break;
      case "legendary": [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.3, delay: i * 0.1, type: "triangle", vol: 0.2 })); break;
      case "dropIncoming": this.tone({ freq: 1000, freqEnd: 400, dur: 0.7, type: "sine", vol: 0.12 }); break;
      case "dropLand": this.tone({ freq: 120, freqEnd: 60, dur: 0.25, type: "sine", vol: 0.35 }); this.noise({ dur: 0.2, vol: 0.2, filterFreq: 800 }); break;
      case "warning": this.tone({ freq: 660, dur: 0.15, type: "square", vol: 0.15 }); this.tone({ freq: 660, dur: 0.15, delay: 0.25, type: "square", vol: 0.15 }); break;
      case "alarmBuzz": this.tone({ freq: 220, freqEnd: 180, dur: 0.4, type: "sawtooth", vol: 0.12 }); break;
      case "zoneShrink": this.tone({ freq: 440, freqEnd: 220, dur: 0.8, type: "sawtooth", vol: 0.12 }); break;
      case "countdown": this.tone({ freq: 880, dur: 0.15, type: "square", vol: 0.25 }); break;
      case "matchStart": this.tone({ freq: 523, dur: 0.15, type: "square", vol: 0.25 }); this.tone({ freq: 784, dur: 0.4, delay: 0.15, type: "square", vol: 0.25 }); break;
      case "elimination": this.tone({ freq: 400, freqEnd: 100, dur: 0.5, type: "sawtooth", vol: 0.25 }); this.noise({ dur: 0.3, vol: 0.2, filterFreq: 1500, filterEnd: 300 }); break;
      case "victory": [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.5, delay: i * 0.12, type: "triangle", vol: 0.25 })); break;
      case "confetti": for (let i = 0; i < 4; i++) this.tone({ freq: 1200 + Math.random() * 1200, dur: 0.15, delay: i * 0.05, type: "sine", vol: 0.1 }); break;
      case "click": this.tone({ freq: 600, dur: 0.05, type: "sine", vol: 0.15 }); break;
      case "ready": this.tone({ freq: 660, dur: 0.1, type: "triangle", vol: 0.2 }); this.tone({ freq: 990, dur: 0.15, delay: 0.1, type: "triangle", vol: 0.2 }); break;
      case "hatMotor": this.tone({ freq: 80, freqEnd: 95, dur: 0.3, type: "sawtooth", vol: 0.05 }); break;
      case "recordScratch": this.noise({ dur: 0.25, vol: 0.25, filterFreq: 2500, filterEnd: 500 }); this.tone({ freq: 900, freqEnd: 200, dur: 0.25, type: "sawtooth", vol: 0.1 }); break;
      case "boing": this.tone({ freq: 150, freqEnd: 500, dur: 0.3, type: "sine", vol: 0.25, slideType: "lin" }); break;
      case "fizz": this.noise({ dur: 0.5, vol: 0.08, filterFreq: 6000, hp: true }); break;
      case "stampede": for (let i = 0; i < 6; i++) this.tone({ freq: 90, freqEnd: 50, dur: 0.12, delay: i * 0.12, type: "sine", vol: 0.3 }); break;
      case "rumble": case "creakSlam": this.tone({ freq: 60, freqEnd: 35, dur: 0.8, type: "sine", vol: 0.4 }); this.noise({ dur: 0.6, vol: 0.2, filterFreq: 500 }); break;
      case "rageHorn": this.tone({ freq: 180, freqEnd: 140, dur: 0.7, type: "sawtooth", vol: 0.25 }); break;
      case "confettiBoom": this.tone({ freq: 200, freqEnd: 80, dur: 0.3, type: "triangle", vol: 0.3 }); this.play("confetti"); break;
      case "wheelTick": for (let i = 0; i < 8; i++) this.tone({ freq: 1000, dur: 0.03, delay: i * 0.09, type: "square", vol: 0.08 }); break;
      case "servoWhine": this.tone({ freq: 400, freqEnd: 800, dur: 0.5, type: "sawtooth", vol: 0.06 }); break;
      case "trapCreak": this.tone({ freq: 180, freqEnd: 90, dur: 0.5, type: "sawtooth", vol: 0.12 }); break;
      case "fanWhirr": this.noise({ dur: 0.5, vol: 0.1, filterFreq: 900, filterEnd: 1400 }); break;
      default: this.tone({ freq: 400, dur: 0.08, type: "sine", vol: 0.1 });
    }
  }

  // ---------------- voice (announcer + yippee) ----------------

  speak(text: string, kind: "announcer" | "yippee", variant = "excited"): void {
    if (settings.muted) return;
    const vol = kind === "announcer" ? settings.announcerVolume : settings.voiceVolume;
    if (vol <= 0.01) return;
    if (!("speechSynthesis" in window)) {
      if (kind === "yippee") this.play("sparklePop");
      return;
    }
    // Avoid announcer pile-ups
    const now = Date.now();
    if (kind === "announcer" && now - this.lastVoiceAt < 1200) return;
    this.lastVoiceAt = now;

    const u = new SpeechSynthesisUtterance(text);
    u.volume = vol * settings.masterVolume;
    if (kind === "announcer") {
      // Sultry ring-announcer read: a warm female voice where the device has
      // one, pitched low and taken slow.
      const v = this.pickAnnouncerVoice();
      if (v) u.voice = v;
      u.pitch = 0.8;
      u.rate = 0.97;
    } else {
      const styles: Record<string, [number, number]> = {
        excited: [1.9, 1.4], nervous: [1.7, 1.7], exhausted: [1.2, 0.7],
        overconfident: [1.5, 1.0], whispered: [1.9, 1.1], dramatic: [1.0, 0.6],
        robotic: [0.4, 1.0], echoing: [1.6, 0.8],
      };
      const [pitch, rate] = styles[variant] ?? [1.9, 1.4];
      u.pitch = pitch;
      u.rate = rate;
      if (variant === "whispered") u.volume *= 0.4;
    }
    speechSynthesis.speak(u);
    if (kind === "yippee" && variant === "echoing") {
      setTimeout(() => {
        const echo = new SpeechSynthesisUtterance(text);
        echo.pitch = 1.4;
        echo.rate = 0.9;
        echo.volume = vol * settings.masterVolume * 0.3;
        speechSynthesis.speak(echo);
      }, 350);
    }
  }

  /** Cut off any queued/playing speech immediately (e.g. intro skipped). */
  stopSpeech(): void {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  /** Stadium boo: a ragged cluster of low descending saws + crowd noise. */
  boo(): void {
    if (!this.ctx || !this.sfxGain || settings.muted) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      const f = 92 + Math.random() * 40;
      osc.frequency.setValueAtTime(f, t0 + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(f * 0.82, t0 + i * 0.05 + 0.9);
      g.gain.setValueAtTime(0.0001, t0 + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + i * 0.05 + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.05 + 1.0);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t0 + i * 0.05);
      osc.stop(t0 + i * 0.05 + 1.05);
    }
    this.noise({ dur: 1.1, vol: 0.04, filterFreq: 600 });
  }

  /** Womp womp womp woooomp. */
  sadTrombone(): void {
    if (!this.ctx || !this.sfxGain || settings.muted) return;
    const t0 = this.ctx.currentTime;
    const notes: Array<[number, number, number]> = [
      [293.7, 0, 0.4], [277.2, 0.45, 0.4], [261.6, 0.9, 0.4], [233.1, 1.35, 1.3],
    ];
    for (const [freq, at, dur] of notes) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq * 0.97, t0 + at);
      osc.frequency.exponentialRampToValueAtTime(freq, t0 + at + 0.08);
      if (dur > 1) {
        // wobble the long last note
        const lfo = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.frequency.value = 5.5;
        lfoG.gain.value = 6;
        lfo.connect(lfoG);
        lfoG.connect(osc.frequency);
        lfo.start(t0 + at + 0.25);
        lfo.stop(t0 + at + dur);
      }
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.09, t0 + at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + at + dur);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.sfxGain);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.05);
    }
  }

  private announcerVoice: SpeechSynthesisVoice | null | undefined;

  private pickAnnouncerVoice(): SpeechSynthesisVoice | null {
    if (this.announcerVoice !== undefined) return this.announcerVoice;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null; // list not loaded yet — try again next line
    const prefs = [/samantha/i, /victoria/i, /serena/i, /moira/i, /tessa/i, /karen/i, /zira/i, /female/i, /google uk english female/i];
    for (const p of prefs) {
      const v = voices.find((x) => p.test(x.name) && x.lang.toLowerCase().startsWith("en"));
      if (v) {
        this.announcerVoice = v;
        return v;
      }
    }
    this.announcerVoice = voices.find((x) => x.lang.toLowerCase().startsWith("en")) ?? null;
    return this.announcerVoice;
  }

  // ---------------- procedural music ----------------

  setMusic(track: "none" | "menu" | "arena" | "finalTwo" | "victory"): void {
    if (track === this.musicTrack) return;
    this.musicTrack = track;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (track === "none" || !this.ctx) return;
    this.musicStep = 0;
    // Arena runs a boom-bap hip-hop groove in 16th notes; other tracks keep
    // the original 8th-note chiptune pulse.
    const tempo = track === "finalTwo" ? 105 : track === "victory" ? 130 : track === "arena" ? 90 : 96;
    const stepMs = track === "arena" ? ((60 / tempo) * 1000) / 4 : ((60 / tempo) * 1000) / 2;
    this.musicTimer = window.setInterval(() => this.musicTick(), stepMs);
  }

  /** 808-style kick: a sine that drops from thump to sub. */
  private kick808(): void {
    if (!this.ctx || !this.musicGain) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(46, t0 + 0.16);
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  }

  private snare(): void {
    this.noise({ dur: 0.14, vol: 0.075, filterFreq: 2400 });
    this.musicNote(196, 0.06, "triangle", 0.05);
  }

  /** Two-bar boom-bap loop: swung hats, lazy snare, subby bass riff. */
  private hipHopTick(s: number): void {
    const st = s % 32;
    if ([0, 7, 10, 16, 20, 23].includes(st)) this.kick808();
    if (st % 16 === 4 || st % 16 === 12) this.snare();
    // hats: straight 8ths with accents + ghost 16ths for swing
    if (st % 2 === 0) this.noise({ dur: 0.03, vol: st % 8 === 0 ? 0.034 : 0.02, filterFreq: 9000, hp: true });
    else if ((st * 7) % 5 === 0) this.noise({ dur: 0.02, vol: 0.011, filterFreq: 9500, hp: true });
    if (st === 14 || st === 30) this.noise({ dur: 0.12, vol: 0.028, filterFreq: 7500, hp: true }); // open hat
    // bass riff riding the kicks (A minor pentatonic-ish)
    const riff: Record<number, number> = { 0: 0, 7: 3, 10: 5, 16: 0, 20: 10, 23: 7 };
    const deg = riff[st];
    if (deg !== undefined) this.musicNote(55 * 2 ** (deg / 12), 0.32, "triangle", 0.24);
    // sparse silly stabs answering the snare
    if (st === 6) this.musicNote(440 * 2 ** (3 / 12), 0.09, "square", 0.028);
    if (st === 22) this.musicNote(440 * 2 ** (5 / 12), 0.09, "square", 0.028);
    if (st === 28) this.musicNote(440 * 2 ** (10 / 12), 0.12, "square", 0.024);
  }

  private musicNote(freq: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private musicTick(): void {
    if (!this.ctx || settings.muted || settings.musicVolume <= 0.01) {
      this.musicStep++;
      return;
    }
    const s = this.musicStep++;
    if (this.musicTrack === "arena") {
      this.hipHopTick(s);
      return;
    }
    const minor = [0, 2, 3, 5, 7, 8, 10];
    const major = [0, 2, 4, 5, 7, 9, 11];
    const scale = this.musicTrack === "finalTwo" ? minor : major;
    const root = this.musicTrack === "finalTwo" ? 98 : this.musicTrack === "victory" ? 131 : 110;
    // Bass on quarter notes
    if (s % 2 === 0) {
      const prog = [0, 0, 5, 3, 0, 0, 4, 5];
      const deg = prog[(s / 2) % 8 | 0] ?? 0;
      this.musicNote(root * 2 ** ((scale[deg % 7] ?? 0) / 12), 0.22, "triangle", 0.25);
    }
    // Melody with a deterministic-but-lively pattern
    const melodyPattern = [0, 4, 2, 4, 7, 4, 2, 4, 0, 4, 5, 4, 9, 7, 5, 4];
    if (s % 1 === 0 && (this.musicTrack !== "menu" || s % 2 === 0)) {
      const deg = melodyPattern[s % 16] ?? 0;
      const octave = this.musicTrack === "victory" ? 4 : 3;
      this.musicNote(root * 2 ** (((scale[deg % 7] ?? 0) + 12 * (octave - 1) + (deg >= 7 ? 12 : 0)) / 12), 0.15, "square", 0.05);
    }
    // Hat-ish tick (arena has its own hip-hop hats and returns early above)
    if (this.musicTrack === "finalTwo") {
      this.noise({ dur: 0.03, vol: 0.02, filterFreq: 8000, hp: true });
    }
  }
}

export const audio = new AudioEngine();
