import { chromium } from '@playwright/test';
import { preview } from 'vite';
const OUT = process.argv[2];
const worlds = (process.argv[3] ?? '1,2,3,4,5,6').split(',').map(Number);
const server = await preview({ root: '/home/user/Stick-Duel', preview: { port: 4190, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://localhost:4190/');
await page.waitForSelector('#play');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/title.png` });
await page.click('#play');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/map.png` });
for (const w of worlds) {
  for (const l of [1, 10]) {
    await page.evaluate(([w, l]) => window.__stickDuel.intro(w, l), [w, l]);
    await page.waitForTimeout(500);
    if (l === 10) await page.screenshot({ path: `${OUT}/intro-${w}-${l}.png` });
    await page.click('#fight');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__stickDuel.autoFire());
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/duel-${w}-${l}.png` });
  }
}
console.info('errors:', errs.join('\n') || 'none');
await browser.close();
await server.close();
