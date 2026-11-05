// Renders the CrazyGames cover images from the game's own SVG art.
// Rules (docs.crazygames.com/requirements/game-covers): 1920x1080, 800x1200, 800x800, consistent look,
// only the game title as text, no borders, no icons / store logos.
// Usage: npm run covers  ->  submission/covers/cover-1920x1080.png, cover-800x1200.png, cover-800x800.png
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { coverHtml } from './cover-html.mjs';

const OUT_DIR = 'submission/covers';
const SIZES = [
  { w: 1920, h: 1080, layout: 'landscape' },
  { w: 800, h: 1200, layout: 'portrait' },
  { w: 800, h: 800, layout: 'square' },
];

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
for (const { w, h, layout } of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(coverHtml(layout));
  await page.evaluate(() => document.fonts.ready);
  // freeze animations (steam, blinking, hearts) for a clean still image
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.screenshot({ path: `${OUT_DIR}/cover-${w}x${h}.png` });
  await page.close();
  console.info(`${OUT_DIR}/cover-${w}x${h}.png`);
}
await browser.close();
