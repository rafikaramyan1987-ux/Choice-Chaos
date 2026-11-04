// Renders the CrazyGames cover images from the game's own SVG art.
// Usage: npm run covers  ->  covers/cover-1920x1080.png, cover-800x1200.png, cover-800x800.png
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const SIZES = [
  { w: 1920, h: 1080, layout: 'landscape' },
  { w: 800, h: 1200, layout: 'portrait' },
  { w: 800, h: 800, layout: 'square' },
];

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const art = await vite.ssrLoadModule('/src/ui/art.ts');
await vite.close();

const decor = ['plant', 'lights', 'painting', 'clock', 'shelf', 'cat', 'flowers'];
const bg = art.cafeBackground(decor);
const counter = art.counter(decor);
const guest = art.customer(20, 'happy');
const guest2 = art.customer(7, 'smile');
const latte = art.drawItem({ steps: ['cup', 'coffee', 'milk', 'foam'], amounts: [1, 0.5, 0.45, 0.6], size: 'L' });
const croissant = art.drawItem({ steps: ['plate', 'croissant', 'warm'], amounts: [1, 1, 0.6] });
const smoothie = art.drawItem({ steps: ['glass', 'berries', 'banana', 'yogurt', 'blend'], amounts: [1, 1, 1, 0.55, 0.6], size: 'L' });
const star = art.icon.star();

const html = (layout) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fbe3c4}
  :root{--wall:#fbe3c4;--wall2:#f6cfa3;--sky:#bfe6ff;--sun:#ffd166}
  svg{display:block;width:100%;height:100%}
  .stage{position:relative;width:100%;height:100%;overflow:hidden;font-family:'Nunito','Baloo 2',ui-rounded,'DejaVu Sans',sans-serif}
  .k-bg{position:absolute;inset:0}
  .k-guest{position:absolute;aspect-ratio:120/140}
  .k-counter{position:absolute;left:0;right:0;bottom:0}
  .k-dish{position:absolute;aspect-ratio:1;filter:drop-shadow(0 6px 4px rgba(90,58,44,.25))}
  .k-logo{position:absolute;display:flex;align-items:center;gap:.25em;color:#8a4f2e;font-weight:900;letter-spacing:.01em;
    background:rgba(255,248,238,.92);border:.08em solid #e9b98c;border-radius:.6em;padding:.12em .45em .16em;box-shadow:0 .08em 0 #e9b98c}
  .k-logo .k-cup{display:block;flex:none;width:1.1em;height:1.1em}
  .k-stars{position:absolute;display:flex;gap:.1em}
  .k-stars span{width:1em;height:1em;display:block}
  .landscape .k-logo{left:4%;top:7%;font-size:118px}
  .landscape .k-counter{height:30%}
  .landscape .k-guest{left:45%;bottom:22%;height:60%}
  .landscape .k-guest2{left:9%;bottom:22%;height:46%}
  .landscape .k-i1{left:60%;bottom:17%;height:32%}
  .landscape .k-i2{left:77%;bottom:16%;height:24%}
  .landscape .k-i3{left:27%;bottom:17%;height:30%}
  .landscape .k-stars{left:74%;top:14%;font-size:96px}
  .portrait .k-logo{left:50%;transform:translateX(-50%);top:4%;font-size:92px;white-space:nowrap}
  .portrait .k-counter{height:30%}
  .portrait .k-guest{left:50%;transform:translateX(-50%);bottom:24%;height:52%}
  .portrait .k-i1{left:5%;bottom:13%;height:25%}
  .portrait .k-i2{left:58%;bottom:13%;height:20%}
  .portrait .k-stars{left:50%;transform:translateX(-50%);top:17%;font-size:72px}
  .portrait .k-guest2,.portrait .k-i3{display:none}
  .square .k-logo{left:50%;transform:translateX(-50%);top:5%;font-size:84px;white-space:nowrap}
  .square .k-counter{height:30%}
  .square .k-guest{left:50%;transform:translateX(-50%);bottom:23%;height:62%}
  .square .k-i1{left:4%;bottom:14%;height:30%}
  .square .k-i2{left:66%;bottom:14%;height:22%}
  .square .k-stars,.square .k-guest2,.square .k-i3{display:none}
</style></head><body><div class="stage ${layout}">
  <div class="k-bg">${bg}</div>
  <div class="k-guest k-guest2">${guest2}</div>
  <div class="k-guest">${guest}</div>
  <div class="k-counter">${counter.replace('<svg ', '<svg preserveAspectRatio="none" ')}</div>
  <div class="k-dish k-i1">${latte}</div>
  <div class="k-dish k-i2">${croissant}</div>
  <div class="k-dish k-i3">${smoothie}</div>
  <div class="k-stars"><span>${star}</span><span>${star}</span><span>${star}</span></div>
  <div class="k-logo"><span class="k-cup">${art.icon.recipes()}</span>Cozy Café</div>
</div></body></html>`;

mkdirSync('covers', { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
for (const { w, h, layout } of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html(layout));
  // freeze animations (steam, blinking) for a clean still image
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.screenshot({ path: `covers/cover-${w}x${h}.png` });
  await page.close();
  console.info(`covers/cover-${w}x${h}.png`);
}
await browser.close();
