/**
 * Platform adapter. The game only talks to this interface; the CrazyGames
 * implementation lives in crazygames.ts and NoopPlatform is used everywhere else
 * (GitHub Pages, local dev): no network, no ads.
 */
export interface Platform {
  readonly name: string;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Shows a midgame ad; resolves when the game can continue (always resolves). */
  midgame(): Promise<void>;
  /** Shows a rewarded ad; resolves true if the reward must be granted. */
  rewarded(): Promise<boolean>;
  /** Celebration moment (e.g. a new recipe unlocked). */
  happytime(): void;
}

export interface AdHooks {
  /** Called right before an ad starts (mute audio, pause). */
  onAdStart(): void;
  /** Called when the ad is over (finished, skipped or errored). */
  onAdEnd(): void;
}

export class NoopPlatform implements Platform {
  readonly name = 'none';
  async init(): Promise<void> {}
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  async midgame(): Promise<void> {}
  /** No ads outside CrazyGames: the reward is granted directly so the feature can be tested. */
  async rewarded(): Promise<boolean> {
    return true;
  }
  happytime(): void {}
}

export const MIDGAME_INTERVAL_MS = 3 * 60 * 1000;

/** Enforces "at most one midgame ad every 3 minutes". */
export class MidgameThrottle {
  private last: number;
  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly interval = MIDGAME_INTERVAL_MS,
  ) {
    // Count from session start so the first days never start with an ad.
    this.last = now();
  }
  canShow(): boolean {
    return this.now() - this.last >= this.interval;
  }
  markShown(): void {
    this.last = this.now();
  }
}

/** Keeps gameplayStart/gameplayStop balanced (CrazyGames requires no duplicates). */
export class GameplayTracker {
  private playing = false;
  constructor(private readonly platform: Platform) {}
  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.platform.gameplayStart();
  }
  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.platform.gameplayStop();
  }
  get isPlaying(): boolean {
    return this.playing;
  }
}

/** Midgame ads are only shown between days, never before day 3 is completed. */
export const MIDGAME_FIRST_DAY = 3;

export function midgameAllowed(completedDay: number, throttle: MidgameThrottle): boolean {
  return completedDay >= MIDGAME_FIRST_DAY && throttle.canShow();
}
