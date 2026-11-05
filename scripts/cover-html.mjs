// Shared cover composition (used by covers.mjs and videos.mjs): the game's own SVG art + the title only.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
// Fredoka (SIL Open Font License 1.1) — only used to render the covers, not shipped with the game.
const font = readFileSync(require.resolve('@fontsource/fredoka/files/fredoka-latin-700-normal.woff2')).toString('base64');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const art = await vite.ssrLoadModule('/src/ui/art.ts');
await vite.close();

const features = ['plant', 'lights', 'painting', 'clock', 'cat', 'flowers', 'terrace', 'bakery', 'chandelier'];
const bg = art.cafeBackground(features);
const counter = art.counter(features);
const hero = art.customer(20, 'happy', 'bunny', null);
const friend = art.customer(7, 'happy', 'bear', null);
const vip = art.customer(31, 'happy', 'fox', 'vip');
const latte = art.drawItem({ steps: ['cup', 'coffee', 'milk', 'foam'], amounts: [1, 0.5, 0.45, 0.6], size: 'L' });
const croissant = art.drawItem({ steps: ['plate', 'croissant', 'warm'], amounts: [1, 1, 0.6] });
const smoothie = art.drawItem({ steps: ['glass', 'berries', 'banana', 'yogurt', 'blend'], amounts: [1, 1, 1, 0.55, 0.6], size: 'L' });
const cake = art.drawItem({ steps: ['plate', 'cake', 'cream', 'cherry'], amounts: [1, 1, 0.6, 1] });

/** Full HTML page of the cover for a layout: 'landscape' | 'portrait' | 'square'. */
export const coverHtml = (layout) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:'Fredoka';font-weight:700;src:url(data:font/woff2;base64,${font}) format('woff2')}
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fbe3c4}
  :root{--wall:#fbe3c4;--wall2:#f6cfa3;--sky:#bfe6ff;--sun:#ffd166}
  svg{display:block;width:100%;height:100%}
  .stage{position:relative;width:100%;height:100%;overflow:hidden}
  .k-bg{position:absolute;inset:0}
  .k-guest{position:absolute;aspect-ratio:120/140}
  .k-counter{position:absolute;left:0;right:0;bottom:0}
  .k-dish{position:absolute;aspect-ratio:1;filter:drop-shadow(0 6px 4px rgba(90,58,44,.25))}
  .k-title{position:absolute;font-family:'Fredoka',sans-serif;font-weight:700;color:#fff6e8;line-height:.95;white-space:nowrap;
    -webkit-text-stroke:.14em #7a3f22;paint-order:stroke fill;text-shadow:0 .07em 0 #5a2c16,0 .12em .18em rgba(90,44,22,.35);letter-spacing:.01em}
  .k-title .cafe{color:#ffc56b}
  .landscape .k-title{left:5%;top:9%;font-size:190px}
  .landscape .k-counter{height:30%}
  .landscape .k-hero{left:46%;bottom:22%;height:62%}
  .landscape .k-friend{left:11%;bottom:22%;height:44%}
  .landscape .k-vip{left:72%;bottom:22%;height:40%}
  .landscape .k-i1{left:58%;bottom:15%;height:31%}
  .landscape .k-i2{left:80%;bottom:14%;height:22%}
  .landscape .k-i3{left:30%;bottom:16%;height:30%}
  .landscape .k-i4{display:none}
  .portrait .k-title{left:50%;transform:translateX(-50%);top:5%;font-size:128px;text-align:center;white-space:normal;width:100%}
  .portrait .k-counter{height:28%}
  .portrait .k-hero{left:50%;transform:translateX(-50%);bottom:22%;height:46%}
  .portrait .k-i1{left:4%;bottom:12%;height:24%}
  .portrait .k-i2{left:62%;bottom:12%;height:19%}
  .portrait .k-friend,.portrait .k-vip,.portrait .k-i3,.portrait .k-i4{display:none}
  .square .k-title{left:50%;transform:translateX(-50%);top:5%;font-size:118px}
  .square .k-counter{height:29%}
  .square .k-hero{left:50%;transform:translateX(-50%);bottom:22%;height:56%}
  .square .k-i1{left:3%;bottom:13%;height:29%}
  .square .k-i2{left:67%;bottom:13%;height:21%}
  .square .k-friend,.square .k-vip,.square .k-i3,.square .k-i4{display:none}
</style></head><body><div class="stage ${layout}">
  <div class="k-bg">${bg}</div>
  <div class="k-guest k-friend">${friend}</div>
  <div class="k-guest k-vip">${vip}</div>
  <div class="k-guest k-hero">${hero}</div>
  <div class="k-counter">${counter.replace('<svg ', '<svg preserveAspectRatio="none" ')}</div>
  <div class="k-dish k-i1">${latte}</div>
  <div class="k-dish k-i2">${croissant}</div>
  <div class="k-dish k-i3">${smoothie}</div>
  <div class="k-dish k-i4">${cake}</div>
  <div class="k-title">Cozy ${layout === 'portrait' ? '<br>' : ''}<span class="cafe">Café</span></div>
</div></body></html>`;

