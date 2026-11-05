// Records the CrazyGames preview videos by playing the real game automatically.
// Requirements (docs.crazygames.com/requirements/game-covers): 15–20 s, ≤ 50 MB, 1080p landscape 16:9 and
// 1080p portrait 2:3, no sound, no fast-forward, static cover as first frame, no mouse cursor,
// no black frames / bars, no promotional text.
//
// How: the built game (dist/) is served locally, a seeded save shows a well-decorated café, a bot plays
// with good timing (holds released in the green zone). Frames come from the DevTools screencast with their
// real timestamps (so nothing is sped up), then ffmpeg opens on the cover and encodes H.264 without audio.
//
// Usage: npm run build && npm run videos   (needs ffmpeg on the PATH)
//        VIDEO_SEED=3 npm run videos       (other orders)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { coverHtml } from './cover-html.mjs';

const OUT_DIR = 'submission/videos';
const FPS = 30;
const COVER_S = 0.8; // static cover (first frame)
const FADE_S = 0.4; // soft transition into gameplay
const TOTAL_S = 19; // CrazyGames: 15–20 s
const SEED = Number(process.env.VIDEO_SEED ?? 50); // VIP latte, then a food critic with a smoothie

const FORMATS = [
  // CSS viewport × deviceScaleFactor = output size
  { name: 'cozy-cafe-landscape-1920x1080', w: 960, h: 540, dsf: 2, cover: 'landscape', coverCss: [1920, 1080], coverDsf: 1 },
  { name: 'cozy-cafe-portrait-1080x1620', w: 400, h: 600, dsf: 2.7, cover: 'portrait', coverCss: [800, 1200], coverDsf: 1.35 },
];

const ALL_RECIPES = ['coffee', 'latte', 'cocoa', 'juice', 'croissant', 'toastie', 'crepe_choco', 'cake', 'cone', 'veggie', 'smoothie_berry', 'crepe_berry', 'sundae', 'smoothie_mango'];
const STICKERS = ['bear', 'cat', 'bunny', 'buddy', 'mouse', 'fox', 'panda', 'frog', 'vip', 'critic', 'celebrity'];

/** A café in mid game: decorated, expanded, every recipe, no first-time hints or popups. */
function videoSave() {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const built = ['tables1', 'tables2', 'terrace', 'bakery', 'icebar'];
  return {
    version: 1,
    progress: {
      day: 9,
      coins: 2480,
      gems: 40,
      recipes: ALL_RECIPES,
      equipment: { coffee: 2, oven: 1, blender: 1 },
      decor: ['plant', 'flowers', 'lights', 'painting', 'clock', 'chandelier', 'cat'],
    },
    stats: { customers: 140, perfect: 90, days: 8, earned: 4000 },
    settings: { lang: 'en', muted: true, vibration: false },
    hints: ['tap', 'hold', 'timing'],
    meta: {
      level: 11,
      xp: 0,
      stats: { served: 140, perfect: 90, missions: 30, vip: 6, critic: 3, celebrity: 1, challenges: 2, built: 5, bestLoginStreak: 3 },
      stickers: Object.fromEntries(STICKERS.map((s) => [s, 3])),
      achievements: ['serve_10', 'serve_100', 'perfect_25', 'missions_10', 'level_5', 'level_10', 'vip_5', 'critic_3', 'celebrity_1', 'stickers_all', 'build_1', 'challenge_1'],
      login: { last: today, streak: 3 },
      giftAt: Date.now() + 3_600_000,
      challengeDate: today,
      built: Object.fromEntries(built.map((b) => [b, 0])),
      announced: built,
    },
  };
}

/** Plays like a calm, skilled player: taps, holds released in the middle of the green zone. */
async function play(page, untilMs) {
  const inZone = () => {
    const g = document.querySelector('#gauge');
    if (!g) return false;
    const l = Number(g.dataset.level);
    return l >= (Number(g.dataset.lo) + Number(g.dataset.hi)) / 2;
  };
  while (Date.now() < untilMs) {
    const serve = page.locator('#serve.ready:not([disabled])');
    if (await serve.count()) {
      await page.waitForTimeout(250);
      await serve.click();
      await page.waitForTimeout(400);
      continue;
    }
    const step = page.locator('.step.current');
    if (!(await step.count())) {
      await page.waitForTimeout(80);
      continue;
    }
    const id = await step.getAttribute('data-step');
    const action = await step.getAttribute('data-action');
    const btn = page.locator(`.ing[data-ing="${id}"]:not([disabled])`);
    if (!(await btn.count())) {
      await page.waitForTimeout(80);
      continue;
    }
    await page.waitForTimeout(220); // a human-like pause
    if (action === 'tap') await btn.click();
    else if (action === 'timing') {
      await btn.click();
      await page.waitForFunction(inZone);
      await page.locator('#work').click({ force: true });
    } else {
      const box = await btn.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForFunction(inZone);
      await page.mouse.up();
    }
    await page.waitForTimeout(150);
  }
}

async function record(browser, base, f, work) {
  const context = await browser.newContext({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: f.dsf, locale: 'en-US' });
  const save = videoSave();
  await context.addInitScript((s) => localStorage.setItem('cozy-cafe.save.v1', JSON.stringify(s)), save);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/?seed=${SEED}`);
  // call a VIP with gems so the first guest wears a crown, then open the café
  await page.locator('#vip').click();
  await page.locator('[data-a="gems"]').click();
  await page.locator('#play').click();
  await page.locator('.day-banner').waitFor({ state: 'detached' });

  const W = Math.round(f.w * f.dsf);
  const H = Math.round(f.h * f.dsf);
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* page closing */
    }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const gameplayS = TOTAL_S - COVER_S + FADE_S + 0.5;
  await play(page, Date.now() + gameplayS * 1000);
  await cdp.send('Page.stopScreencast');
  await context.close();
  if (errors.length) throw new Error(`console errors while recording: ${errors.join(' | ')}`);
  if (frames.length < 60) throw new Error(`only ${frames.length} frames captured`);

  // frames + their real durations → ffconcat (constant 30 fps output, real-time speed)
  const dir = join(work, f.name);
  mkdirSync(dir, { recursive: true });
  let list = 'ffconcat version 1.0\n';
  frames.forEach((fr, i) => {
    const file = join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(fr.data, 'base64'));
    const next = frames[i + 1]?.t ?? fr.t + 1 / FPS;
    list += `file '${file}'\nduration ${Math.max(0.001, next - fr.t).toFixed(4)}\n`;
  });
  list += `file '${join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'\n`;
  writeFileSync(join(dir, 'frames.ffconcat'), list);

  // the static cover, rendered at the video size (same composition as the uploaded cover)
  const coverCtx = await browser.newContext({ viewport: { width: f.coverCss[0], height: f.coverCss[1] }, deviceScaleFactor: f.coverDsf });
  const coverPage = await coverCtx.newPage();
  await coverPage.setContent(coverHtml(f.cover));
  await coverPage.evaluate(() => document.fonts.ready);
  await coverPage.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  const coverPng = join(dir, 'cover.png');
  await coverPage.screenshot({ path: coverPng });
  await coverCtx.close();

  const out = join(OUT_DIR, `${f.name}.mp4`);
  const scale = `scale=${W}:${H}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p`;
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-t', String(COVER_S + FADE_S), '-i', coverPng,
      '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.ffconcat'),
      '-filter_complex', `[0:v]${scale}[c];[1:v]${scale}[g];[c][g]xfade=transition=fade:duration=${FADE_S}:offset=${COVER_S},trim=duration=${TOTAL_S}[v]`,
      '-map', '[v]', '-an',
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      out,
    ],
    { stdio: 'inherit' },
  );
  const mb = statSync(out).size / 1024 / 1024;
  console.info(`${out}: ${W}x${H}, ${TOTAL_S}s, ${frames.length} captured frames, ${mb.toFixed(1)} MB`);
  if (mb > 50) throw new Error(`${out} is over 50 MB`);
}

mkdirSync(OUT_DIR, { recursive: true });
// frames are written to VIDEO_WORK (or a temp folder) and deleted at the end
const work = mkdtempSync(join(process.env.VIDEO_WORK ?? tmpdir(), 'cozy-videos-'));
const server = await preview({ preview: { port: 4180, strictPort: true }, logLevel: 'error' });
const base = 'http://localhost:4180';
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
try {
  for (const f of FORMATS) await record(browser, base, f, work);
} finally {
  await browser.close();
  await server.close();
  rmSync(work, { recursive: true, force: true });
}
