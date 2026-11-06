// QA: plays level 1 and the boss (level 10) of every world automatically with a
// perfect-aim bot, checks the player wins, and saves screenshots of each duel.
// Usage: npm run build && node scripts/qa-playthrough.mjs <out-dir> [speed]
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'qa';
const SPEED = Number(process.argv[3] ?? 3);
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 4192, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4192/');
await page.waitForSelector('#play');
const results = [];
for (let w = 1; w <= 6; w++) {
  for (const l of [1, 10]) {
    await page.evaluate(([w, l, sp]) => {
      const app = window.__stickDuel;
      app.speed = sp;
      app.intro(w, l);
    }, [w, l, SPEED]);
    await page.locator('#fight').click();
    const t0 = Date.now();
    let shot = 0;
    let midShot = false;
    while (Date.now() - t0 < 240_000) {
      const st = await page.evaluate(() => {
        const app = window.__stickDuel;
        const d = app.duel;
        return { aiming: d.humanAiming, phase: d.phase, result: !!document.querySelector('.card.result'), flying: d.projectiles.length };
      });
      if (st.result) break;
      if (st.aiming) {
        shot++;
        await page.evaluate((head) => window.__stickDuel.autoFire(head), shot % 2 === 0);
        midShot = false;
      } else if (st.flying && !midShot && shot === 2) {
        midShot = true;
        await page.waitForTimeout(120);
        await page.screenshot({ path: `${OUT}/world${w}-level${l}-duel.png` });
      }
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(900);
    const won = await page.evaluate(() => !!document.querySelector('.card.result.won'));
    const info = await page.evaluate(() => {
      const d = window.__stickDuel.duel;
      return { turns: d.turnNumber, hp: d.fighters.map((f) => f.hp), shots: d.fighters[0].shots, head: d.fighters[0].headshots, secs: d.time };
    });
    await page.screenshot({ path: `${OUT}/world${w}-level${l}-result.png` });
    results.push({ world: w, level: l, won, ...info });
    console.info(JSON.stringify(results.at(-1)));
  }
}
await browser.close();
await server.close();
if (errors.length) console.error('console errors:', errors);
const lost = results.filter((r) => !r.won);
if (lost.length || errors.length) process.exit(1);
console.info('all levels won');
