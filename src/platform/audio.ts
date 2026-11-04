/**
 * Soft synthesized sounds (WebAudio, no files). The AudioContext is only
 * created after the first user gesture, as browsers require.
 */
export type Sfx = 'tap' | 'drop' | 'pour' | 'sizzle' | 'blend' | 'oops' | 'done' | 'bell' | 'coin' | 'happy' | 'unlock' | 'door' | 'day' | 'perfect' | 'good' | 'soft';

type Note = [freq: number, dur: number, type: OscillatorType, gain?: number];

const NOTES: Partial<Record<Sfx, Note[]>> = {
  tap: [[660, 0.05, 'sine', 0.06]],
  drop: [[520, 0.06, 'sine', 0.08], [390, 0.08, 'sine', 0.06]],
  oops: [[440, 0.12, 'sine', 0.07], [370, 0.18, 'sine', 0.06]],
  done: [[660, 0.08, 'triangle'], [880, 0.14, 'triangle']],
  bell: [[1320, 0.5, 'sine', 0.07], [1760, 0.4, 'sine', 0.04]],
  coin: [[988, 0.07, 'square', 0.04], [1319, 0.18, 'square', 0.04]],
  happy: [[523, 0.09, 'triangle'], [659, 0.09, 'triangle'], [784, 0.16, 'triangle']],
  unlock: [[523, 0.09, 'triangle'], [659, 0.09, 'triangle'], [784, 0.09, 'triangle'], [1046, 0.28, 'triangle']],
  door: [[1175, 0.18, 'sine', 0.05], [880, 0.3, 'sine', 0.05]],
  perfect: [[784, 0.08, 'triangle'], [988, 0.08, 'triangle'], [1319, 0.2, 'triangle']],
  good: [[659, 0.1, 'triangle'], [784, 0.16, 'triangle']],
  soft: [[523, 0.14, 'sine', 0.06]],
  day: [[392, 0.18, 'triangle'], [523, 0.18, 'triangle'], [659, 0.18, 'triangle'], [784, 0.4, 'triangle']],
};

export class Sound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private suspendedByAd = false;
  constructor(public muted: boolean) {}

  /** Call from a user gesture handler. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.suspendedByAd) void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  /** Ads must not play over game audio. */
  pauseForAd(): void {
    this.suspendedByAd = true;
    void this.ctx?.suspend();
  }
  resumeAfterAd(): void {
    this.suspendedByAd = false;
    void this.ctx?.resume();
  }

  private ready(): AudioContext | null {
    if (!this.ctx || this.muted || this.suspendedByAd) return null;
    return this.ctx;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  /** Filtered noise: pouring (low, smooth), sizzling (high, crackly), blending (buzzy). */
  private texture(ctx: AudioContext, kind: 'pour' | 'sizzle' | 'blend', seconds: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const at = ctx.currentTime;
    const level = kind === 'pour' ? 0.05 : kind === 'sizzle' ? 0.025 : 0.03;
    if (kind === 'pour') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, at);
      filter.frequency.linearRampToValueAtTime(900, at + seconds);
      filter.Q.value = 1.2;
    } else if (kind === 'sizzle') {
      filter.type = 'highpass';
      filter.frequency.value = 3500;
    } else {
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 18;
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(at);
      lfo.stop(at + seconds + 0.1);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.06);
    gain.gain.setValueAtTime(level, at + Math.max(0.07, seconds - 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(at);
    src.stop(at + seconds + 0.05);
  }

  /** Starts a continuous texture (pouring, sizzling…) and returns a function that stops it. */
  loop(kind: 'pour' | 'sizzle' | 'blend', volume = 1): () => void {
    const ctx = this.ready();
    if (!ctx) return () => {};
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const at = ctx.currentTime;
      const level = (kind === 'pour' ? 0.05 : kind === 'sizzle' ? 0.025 : 0.03) * volume;
      if (kind === 'pour') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, at);
        filter.frequency.linearRampToValueAtTime(1000, at + 2.6);
        filter.Q.value = 1.2;
      } else if (kind === 'sizzle') {
        filter.type = 'highpass';
        filter.frequency.value = 3500;
      } else {
        filter.type = 'lowpass';
        filter.frequency.value = 700;
      }
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.06);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(at);
      return () => {
        try {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
          src.stop(now + 0.15);
        } catch {
          /* already stopped */
        }
      };
    } catch {
      return () => {};
    }
  }

  play(kind: Sfx, seconds = 0.4): void {
    const ctx = this.ready();
    if (!ctx) return;
    try {
      if (kind === 'pour' || kind === 'sizzle' || kind === 'blend') {
        this.texture(ctx, kind, Math.max(0.2, seconds));
        return;
      }
      let at = ctx.currentTime;
      for (const [freq, dur, type, g = 0.09] of NOTES[kind] ?? []) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(g, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.02);
        at += dur * 0.8;
      }
    } catch {
      /* audio is optional */
    }
  }
}

/** Short haptic feedback when allowed and supported. */
export function vibrate(enabled: boolean, pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
