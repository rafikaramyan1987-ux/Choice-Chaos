/**
 * Tiny synthesized sound effects (WebAudio, no files). The AudioContext is
 * only created after the first user gesture, as browsers require.
 */
export type Sfx = 'tap' | 'flip' | 'up' | 'down' | 'end' | 'unlock';

export class Sound {
  private ctx: AudioContext | null = null;
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

  play(kind: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.suspendedByAd) return;
    const notes: Record<Sfx, Array<[number, number, OscillatorType]>> = {
      tap: [[520, 0.05, 'triangle']],
      flip: [[300, 0.06, 'sine'], [450, 0.06, 'sine']],
      up: [[523, 0.08, 'triangle'], [784, 0.12, 'triangle']],
      down: [[392, 0.08, 'triangle'], [262, 0.14, 'triangle']],
      end: [[392, 0.12, 'square'], [330, 0.12, 'square'], [262, 0.3, 'square']],
      unlock: [[523, 0.09, 'triangle'], [659, 0.09, 'triangle'], [784, 0.09, 'triangle'], [1046, 0.25, 'triangle']],
    };
    let at = ctx.currentTime;
    for (const [freq, dur, type] of notes[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
      at += dur * 0.85;
    }
  }
}
