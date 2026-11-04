import './style.css';
import { App } from './ui/app';
import { SITUATIONS } from './data';
import { NoopPlatform, type Platform } from './platform/ads';
import { CrazyGamesPlatform } from './platform/crazygames';
import { Sound } from './platform/audio';
import { NullChoiceStats } from './platform/stats';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const sound = new Sound(false);
  const platform: Platform =
    import.meta.env.MODE === 'crazygames'
      ? new CrazyGamesPlatform({ onAdStart: () => sound.pauseForAd(), onAdEnd: () => sound.resumeAfterAd() })
      : new NoopPlatform();
  await platform.init();
  platform.loadingStart();

  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const seed = seedParam && /^\d+$/.test(seedParam) ? Number(seedParam) : undefined;

  const app = new App({ root, situations: SITUATIONS, platform, sound, stats: new NullChoiceStats(), seed });
  app.start();
  platform.loadingStop();
}

void boot();
