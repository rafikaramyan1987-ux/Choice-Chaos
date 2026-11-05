import './style.css';
import { App } from './ui/app';
import { fitToScreen } from './ui/fit';
import { NoopPlatform, type Platform } from './platform/ads';
import { CrazyGamesPlatform } from './platform/crazygames';
import { Sound } from './platform/audio';
import { setStorageBackend } from './platform/storage';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  fitToScreen(root);
  const sound = new Sound(false);
  const platform: Platform =
    import.meta.env.MODE === 'crazygames'
      ? new CrazyGamesPlatform({ onAdStart: () => sound.pauseForAd(), onAdEnd: () => sound.resumeAfterAd() })
      : new NoopPlatform();
  await platform.init();
  platform.loadingStart();
  // on CrazyGames, progress is saved through the SDK data module (synced to the player's account)
  setStorageBackend(platform.storage());

  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const seed = seedParam && /^\d+$/.test(seedParam) ? Number(seedParam) : undefined;

  const app = new App({ root, platform, sound, seed });
  app.start();
  platform.loadingStop();
}

void boot();
