// Renders the CrazyGames covers from a real duel scene (castle boss, the hero's
// arrow about to hit). Title only, top-left corner kept clear.
// Usage: npm run build && node scripts/covers.mjs [world] [level]
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const OUT = process.env.COVER_OUT ?? 'submission/covers';
const WORLD = Number(process.argv[2] ?? 2);
const LEVEL = Number(process.argv[3] ?? 10);
export const COVERS = [
  { name: 'cover-1920x1080', css: [960, 540], dsf: 2, title: 'landscape' },
  { name: 'cover-800x1200', css: [400, 600], dsf: 2, title: 'portrait' },
  { name: 'cover-800x800', css: [400, 400], dsf: 2, title: 'square' },
];

/** Opens the game at the given size and freezes on the cover frame. */
export async function renderCover(browser, base, { css, dsf, title }, path, world = WORLD, level = LEVEL) {
  const ctx = await browser.newContext({ viewport: { width: css[0], height: css[1] }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('#play');
  await page.evaluate(([w, l, t]) => window.__stickDuel.coverShot(w, l, t), [world, level, title]);
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await ctx.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  const server = await preview({ preview: { port: 4193, strictPort: true }, logLevel: 'error' });
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  try {
    for (const c of COVERS) {
      await renderCover(browser, 'http://localhost:4193/', c, `${OUT}/${c.name}.png`);
      console.info(`${OUT}/${c.name}.png`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}
