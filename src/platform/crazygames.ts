import type { AdHooks, Platform } from './ads';

/**
 * CrazyGames HTML5 SDK v3 adapter.
 * Docs: https://docs.crazygames.com/sdk/html5-v3/intro/
 * The SDK script (https://sdk.crazygames.com/crazygames-sdk-v3.js) is only
 * injected into index.html for the `crazygames` build mode (see vite.config.ts).
 */
interface CGAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}
interface CGSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: CGAdCallbacks): void;
  };
}
declare global {
  interface Window {
    CrazyGames?: { SDK: CGSDK };
  }
}

export class CrazyGamesPlatform implements Platform {
  readonly name = 'crazygames';
  private sdk: CGSDK | null = null;
  constructor(private readonly hooks: AdHooks) {}

  async init(): Promise<void> {
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return; // script blocked or not loaded: behave as no-op
    try {
      await sdk.init();
      if (sdk.environment === 'disabled') return;
      this.sdk = sdk;
    } catch (err) {
      console.warn('[CrazyGames] init failed', err);
    }
  }

  private safe(fn: (sdk: CGSDK) => void): void {
    if (!this.sdk) return;
    try {
      fn(this.sdk);
    } catch (err) {
      console.warn('[CrazyGames] call failed', err);
    }
  }

  loadingStart(): void { this.safe((s) => s.game.loadingStart()); }
  loadingStop(): void { this.safe((s) => s.game.loadingStop()); }
  gameplayStart(): void { this.safe((s) => s.game.gameplayStart()); }
  gameplayStop(): void { this.safe((s) => s.game.gameplayStop()); }

  private request(type: 'midgame' | 'rewarded'): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(type === 'midgame');
    return new Promise((resolve) => {
      let started = false;
      let done = false;
      const end = (ok: boolean) => {
        if (done) return;
        done = true;
        if (started) this.hooks.onAdEnd();
        resolve(ok);
      };
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            this.hooks.onAdStart();
          },
          adFinished: () => end(true),
          adError: (error) => {
            console.info('[CrazyGames] ad error', error);
            end(false);
          },
        });
      } catch (err) {
        console.warn('[CrazyGames] requestAd failed', err);
        end(false);
      }
    });
  }

  async midgame(): Promise<void> {
    await this.request('midgame');
  }

  rewarded(): Promise<boolean> {
    return this.request('rewarded');
  }
}
