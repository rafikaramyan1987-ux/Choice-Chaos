/**
 * All pictures are drawn here as inline SVG (no image files, no fonts).
 * Items are built layer by layer from the steps already added, so the player
 * sees the drink or dish grow while preparing it.
 */
import { hashString, mulberry32 } from '../core/rng';
import type { Size } from '../core/recipes';

let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;

export function svg(inner: string, cls = '', viewBox = '0 0 100 100'): string {
  return `<svg class="${cls}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
}

const OUT = '#6b4433'; // warm outline
const ST = `stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;

const COLORS: Record<string, string> = {
  coffee: '#6b3e26',
  milk: '#ead2b0',
  cocoa: '#5a3420',
  orange: '#ffa630',
  berries: '#e0457b',
  banana: '#ffe08a',
  yogurt: '#fff6ea',
  mango: '#ffb84d',
};

function mix(colors: string[]): string {
  if (colors.length === 0) return '#f4d9b8';
  const rgb: [number, number, number] = [0, 0, 0];
  for (const c of colors) {
    const n = parseInt(c.slice(1), 16);
    rgb[0] += (n >> 16) & 255;
    rgb[1] += (n >> 8) & 255;
    rgb[2] += n & 255;
  }
  return `#${rgb.map((v) => Math.round(v / colors.length).toString(16).padStart(2, '0')).join('')}`;
}

const NICE_DEFAULT = 0.58;

// ------------------------------------------------------------------ shared parts

const steam = (x: number, y: number) =>
  `<g class="steam" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85">` +
  [-10, 0, 10]
    .map((dx, i) => `<path style="animation-delay:${i * 0.3}s" d="M${x + dx} ${y} q-5 -6 0 -12 q5 -6 0 -12"/>`)
    .join('') +
  `</g>`;

const cherry = (x: number, y: number) =>
  `<path d="M${x} ${y - 5} q2 -9 9 -11" fill="none" stroke="#4f8a3a" stroke-width="2.5" stroke-linecap="round"/>` +
  `<circle cx="${x}" cy="${y}" r="6.5" fill="#e23a4c" ${ST}/><circle cx="${x - 2}" cy="${y - 2}" r="1.8" fill="#fff" opacity=".7"/>`;

const creamDollop = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 4 q-4 -9 5 -10 q1 -9 9 -8 q8 -1 9 8 q9 1 5 10 z" fill="#fffdf8" ${ST}/></g>`;

const plate = (y = 82) =>
  `<ellipse cx="50" cy="${y}" rx="40" ry="8" fill="#fff" ${ST}/><ellipse cx="50" cy="${y - 1}" rx="28" ry="4.5" fill="none" stroke="#e7d7c9" stroke-width="2"/>`;

const croissantShape = (cx: number, cy: number, s = 1) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})" fill="#eaa43f" ${ST}>` +
  `<ellipse cx="-24" cy="8" rx="7" ry="6"/><ellipse cx="24" cy="8" rx="7" ry="6"/>` +
  `<ellipse cx="-14" cy="3" rx="10" ry="9"/><ellipse cx="14" cy="3" rx="10" ry="9"/>` +
  `<ellipse cx="0" cy="-1" rx="12" ry="12"/></g>`;

const cakeSlice = (y: number) =>
  `<g ${ST}><path d="M28 ${y + 6} h44 v24 h-44 z" fill="#f7d9a8"/>` +
  `<rect x="28" y="${y + 16}" width="44" height="4" fill="#e85d75" stroke="none"/>` +
  `<path d="M26 ${y + 7} q0 -7 8 -7 h32 q8 0 8 7 q-6 4 -12 0 q-6 4 -12 0 q-6 4 -12 0 q-6 4 -12 0 z" fill="#fff0f3"/></g>`;

const scoop = (x: number, y: number, color: string, r = 15) =>
  `<g ${ST}><path d="M${x - r} ${y} a${r} ${r} 0 0 1 ${2 * r} 0 q-3 6 -7 2 q-4 6 -8 1 q-4 6 -8 0 q-4 5 -${r - 8} -3 z" fill="${color}"/></g>` +
  `<circle cx="${x - r / 3}" cy="${y - r / 2}" r="3" fill="#fff" opacity=".6"/>`;

const SPRINKLE_COLORS = ['#ff6f91', '#5cc8ff', '#ffd23f', '#8be07a', '#b98cff'];
const sprinkles = (x: number, y: number, spread = 12, count = 9) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * 137) % 360;
    const dx = Math.cos(a) * spread * ((i % 3) / 3 + 0.4);
    const dy = Math.sin(a) * spread * 0.5 - 2;
    return `<rect x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" width="5" height="2" rx="1" fill="${SPRINKLE_COLORS[i % 5]}" transform="rotate(${a} ${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)})"/>`;
  }).join('');

const chocoDrizzle = (x1: number, x2: number, y: number, amount = NICE_DEFAULT) => {
  let d = `M${x1} ${y}`;
  const n = 5;
  const w = (x2 - x1) / n;
  for (let i = 0; i < n; i++) d += ` q${w / 2} ${i % 2 ? -7 : 7} ${w} 0`;
  return `<path d="${d}" fill="none" stroke="#5a3420" stroke-width="${(1.5 + amount * 7).toFixed(1)}" stroke-linecap="round"/>`;
};

const bananaSlice = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="5" fill="#fff1a8" stroke="#d8b84a" stroke-width="2"/><circle cx="${x}" cy="${y}" r="1.4" fill="#d8b84a"/>`;

const berry = (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y}" r="4" fill="${c}" stroke="${OUT}" stroke-width="1.5"/>`;

const iceCube = (x: number, y: number, rot: number, size = 13) =>
  `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 4}" fill="#e8f7ff" fill-opacity=".85" stroke="#8fc6e6" stroke-width="2.5" transform="rotate(${rot} ${x + size / 2} ${y + size / 2})"/>`;

// ------------------------------------------------------------------ items

export interface ItemView {
  steps: readonly string[];
  /** Amount 0..1 of each step (pour level, topping amount, cooking time). Missing = a nice default. */
  amounts?: readonly number[];
  size?: Size | null;
  /** Step to animate in. */
  fresh?: string | null;
}

type Amt = (step: string) => number;
const NICE = 0.58;
const SIZE_SCALE: Record<Size, number> = { S: 0.82, M: 0.92, L: 1 };

/** Cooking colour: pale → golden (in the zone) → dark when left too long. */
function cooked(a: number, raw: string, gold: string, dark: string): string {
  if (a < 0.42) return raw;
  if (a <= 0.8) return gold;
  return dark;
}

function drawCupItem(steps: readonly string[], vessel: 'cup' | 'glass', amt: Amt, fresh: string | null): string {
  const clip = nextId('c');
  const isCup = vessel === 'cup';
  const shape = isCup
    ? 'M24 30 h48 l-3 50 a7 7 0 0 1 -7 7 h-28 a7 7 0 0 1 -7 -7 z'
    : 'M28 18 h44 l-5 66 a5 5 0 0 1 -5 5 h-24 a5 5 0 0 1 -5 -5 z';
  const bottom = isCup ? 87 : 89;
  const top = isCup ? 30 : 18;
  const pourH = isCup ? 34 : 48;
  const parts: string[] = [];
  let y = bottom;
  const liquids = steps.filter((x) => COLORS[x]);
  const blended = steps.includes('blend');
  const bandOf = (x: string) => (x === 'berries' || x === 'banana' || x === 'mango' ? 12 : Math.max(2, pourH * amt(x)));
  if (blended) {
    const h = Math.min(bottom - top - 2, liquids.reduce((n, l) => n + bandOf(l), 0));
    y = bottom - h;
    parts.push(`<rect class="${fresh === 'blend' ? 'pop' : ''}" x="0" y="${y}" width="100" height="${h}" fill="${mix(liquids.map((l) => COLORS[l] as string))}"/>`);
    parts.push(`<g fill="#fff" opacity=".55"><circle cx="40" cy="${y + 4}" r="2.5"/><circle cx="55" cy="${y + 7}" r="2"/><circle cx="62" cy="${y + 3}" r="1.6"/></g>`);
  } else {
    for (const x of steps) {
      const c = COLORS[x];
      if (!c) continue;
      let color = c;
      // milk poured on a hot drink blends into it
      if (x === 'milk' && isCup) {
        const under = liquids[liquids.indexOf(x) - 1];
        color = under === 'cocoa' ? '#b98463' : '#d9b48a';
      }
      const h = bandOf(x);
      y -= h;
      parts.push(`<rect class="${fresh === x ? 'grow' : ''}" x="0" y="${y.toFixed(1)}" width="100" height="${(h + 1).toFixed(1)}" fill="${color}"/>`);
      if (x === 'berries' || x === 'mango' || x === 'banana') {
        const dot = x === 'berries' ? '#a8204f' : x === 'mango' ? '#f08a1c' : '#e8c44a';
        parts.push(`<g fill="${dot}" opacity=".8"><circle cx="38" cy="${y + 5}" r="2.4"/><circle cx="52" cy="${y + 9}" r="2.4"/><circle cx="63" cy="${y + 5}" r="2.4"/></g>`);
      }
    }
  }
  y = Math.max(y, top + 2);
  const inner = `<clipPath id="${clip}"><path d="${shape}"/></clipPath><g clip-path="url(#${clip})">${parts.join('')}</g>`;
  const handle = isCup ? `<path d="M71 40 h5 a11 11 0 0 1 0 22 h-6" fill="none" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/>` : '';
  const saucer = isCup ? `<ellipse cx="48" cy="89" rx="34" ry="5" fill="#f3dccb" ${ST}/>` : '';
  let topping = '';
  if (steps.includes('foam')) {
    const k = 0.55 + amt('foam') * 0.8;
    topping += `<g class="${fresh === 'foam' ? 'pop' : ''}" transform="translate(48 ${y}) scale(${k.toFixed(2)})"><path d="M-22 4 q-6 -10 6 -12 q4 -10 16 -6 q12 -6 16 6 q12 2 6 12 z" fill="#fffaf2" ${ST}/>` +
      `<path d="M0 -6 c-3 -4 -8 0 0 5 c8 -5 3 -9 0 -5z" fill="#c98c5a"/></g>`;
  }
  if (steps.includes('marshmallow')) {
    const n = Math.max(1, Math.min(4, Math.round(amt('marshmallow') * 5)));
    topping += `<g class="${fresh === 'marshmallow' ? 'pop' : ''}" ${ST}>${Array.from({ length: n }, (_, i) => `<rect x="${30 + i * 10}" y="${y - 9 - (i % 2) * 3}" width="12" height="10" rx="3" fill="${i % 2 ? '#fff' : '#ffd1e0'}" transform="rotate(${i % 2 ? 10 : -12} ${36 + i * 10} ${y - 4})"/>`).join('')}</g>`;
  }
  if (steps.includes('cream')) {
    topping += `<g class="${fresh === 'cream' ? 'pop' : ''}">${creamDollop(48, y - 4, 0.6 + amt('cream') * 0.9)}</g>`;
  }
  if (steps.includes('ice')) {
    const n = Math.max(1, Math.min(4, Math.round(amt('ice') * 5)));
    topping += `<g class="${fresh === 'ice' ? 'pop' : ''}">${Array.from({ length: n }, (_, i) => iceCube(32 + i * 9, y - 4 + (i % 2) * 5, i % 2 ? 15 : -12)).join('')}</g>`;
  }
  if (steps.includes('sugar')) {
    const n = Math.max(1, Math.min(4, Math.round(amt('sugar') * 5)));
    topping += `<g class="${fresh === 'sugar' ? 'pop' : ''}">${Array.from({ length: n }, (_, i) => `<rect x="${isCup ? 4 + (i % 2) * 9 : 6 + (i % 2) * 9}" y="${80 - Math.floor(i / 2) * 8}" width="8" height="8" rx="1.5" fill="#fff" stroke="#c9b6a6" stroke-width="1.5"/>`).join('')}</g>`;
  }
  if (blended) {
    topping += `<path d="M58 ${y + 10} L70 6" stroke="#ff7aa2" stroke-width="5" stroke-linecap="round"/><path d="M70 6 h8" stroke="#ff7aa2" stroke-width="5" stroke-linecap="round"/>`;
  }
  const glassFill = isCup ? 'rgba(255,255,255,.35)' : 'rgba(230,246,255,.35)';
  const shine = `<path d="M${isCup ? 30 : 34} ${top + 8} v${isCup ? 36 : 50}" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`;
  return saucer + handle + `<path d="${shape}" fill="${glassFill}"/>` + inner + `<path d="${shape}" fill="none" ${ST}/>` + shine + topping;
}

function drawSandwich(steps: readonly string[], amt: Amt, fresh: string | null): string {
  const toasted = steps.includes('toast');
  const bread = toasted ? cooked(amt('toast'), '#f5cd8c', '#e09a45', '#a8622a') : '#f5cd8c';
  let y = 70;
  let out = plate(84) + `<rect x="20" y="${y}" width="60" height="11" rx="5" fill="${bread}" ${ST}/>`;
  for (const x of steps.slice(1)) {
    const cls = fresh === x ? 'pop' : '';
    if (x === 'ham') {
      y -= 6;
      out += `<path class="${cls}" d="M17 ${y + 6} q4 -7 10 -3 q6 -5 12 0 q6 -5 12 0 q6 -5 12 0 q6 -5 12 0 q5 -4 8 3 z" fill="#f49aa6" stroke="#cf6878" stroke-width="2"/>`;
    } else if (x === 'cheese') {
      y -= 5;
      out += `<path class="${cls}" d="M18 ${y} h64 v5 h-12 l-5 7 l-5 -7 h-24 l-5 7 l-5 -7 h-8 z" fill="#ffd34d" stroke="#d9a520" stroke-width="2"/>`;
    } else if (x === 'tomato') {
      y -= 7;
      out += `<g class="${cls}">${[33, 50, 67].map((cx) => `<ellipse cx="${cx}" cy="${y + 4}" rx="9" ry="4.5" fill="#ee4b3b" stroke="#b9302a" stroke-width="2"/>`).join('')}</g>`;
    } else if (x === 'lettuce') {
      y -= 6;
      out += `<path class="${cls}" d="M16 ${y + 7} q5 -10 10 -3 q5 -8 10 -1 q5 -8 10 -1 q5 -8 10 -1 q5 -8 10 -1 q5 -8 10 -1 q4 -4 6 6 z" fill="#7cc35a" stroke="#4f9238" stroke-width="2"/>`;
    } else if (x === 'toast') {
      const lines = amt('toast') >= 0.42 ? [34, 46, 58].map((lx) => `<path d="M${lx} ${y - 13} l8 10" stroke="#8a4f1f" stroke-width="3" stroke-linecap="round"/>`).join('') : '';
      out += `<g class="${cls}"><path d="M20 ${y} v-6 q0 -12 14 -12 h32 q14 0 14 12 v6 z" fill="${bread}" ${ST}/>${lines}</g>` + steam(50, y - 20);
    }
  }
  return out;
}

function drawPlate(steps: readonly string[], amt: Amt, fresh: string | null): string {
  let out = plate(82);
  let top = 78;
  for (const x of steps.slice(1)) {
    const cls = fresh === x ? 'pop' : '';
    if (x === 'croissant') {
      const warmA = steps.includes('warm') ? amt('warm') : 0.3;
      const fill = cooked(warmA, '#eaa43f', '#e39331', '#b8682a');
      out += `<g class="${cls}">${croissantShape(50, 66, 1.15).replace('fill="#eaa43f"', `fill="${fill}"`)}</g>`;
      top = 50;
    } else if (x === 'cake') {
      out += `<g class="${cls}">${cakeSlice(48)}</g>`;
      top = 48;
    } else if (x === 'cream') {
      const k = 0.6 + amt('cream') * 0.8;
      out += `<g class="${cls}">${creamDollop(50, top - 2, k)}</g>`;
      top -= 10 * k;
    } else if (x === 'cherry') {
      out += `<g class="${cls}">${cherry(50, top - 2)}</g>`;
    } else if (x === 'choco') {
      out += `<g class="${cls}">${chocoDrizzle(28, 72, 58, amt('choco'))}</g>`;
    } else if (x === 'warm') {
      out += steam(50, top);
    }
  }
  return out;
}

function drawIceCream(steps: readonly string[], vessel: 'cone' | 'bowl', amt: Amt, fresh: string | null): string {
  const scoops = steps.filter((x) => x === 'vanilla' || x === 'strawberry');
  const pos = vessel === 'cone' ? [[50, 50], [50, 30]] : [[39, 60], [61, 60]];
  let out = '';
  if (vessel === 'cone') {
    out += `<g ${ST}><path d="M34 54 L66 54 L50 95 Z" fill="#e8b06a"/></g>` +
      `<g stroke="#b97a3a" stroke-width="1.6" opacity=".8"><path d="M40 60 L57 80"/><path d="M48 58 L61 72"/><path d="M60 60 L43 80"/><path d="M52 58 L39 70"/></g>`;
  }
  let topY = vessel === 'cone' ? 54 : 66;
  scoops.forEach((x, i) => {
    const [px, py] = (pos[i] ?? pos[0]) as number[];
    out += `<g class="${fresh === x && i === scoops.length - 1 ? 'pop' : ''}">${scoop(px as number, py as number, x === 'vanilla' ? '#fff3d6' : '#ffb3c6')}</g>`;
    topY = Math.min(topY, (py as number) - 15);
  });
  if (vessel === 'bowl') {
    out += `<path d="M18 62 h64 a32 24 0 0 1 -64 0 z" fill="#bfe3ff" ${ST}/><path d="M40 85 h20 l4 8 h-28 z" fill="#9fd0f5" ${ST}/>` +
      `<path d="M26 68 q6 10 16 13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
  }
  if (steps.includes('choco')) out += `<g class="${fresh === 'choco' ? 'pop' : ''}">${chocoDrizzle(vessel === 'cone' ? 37 : 26, vessel === 'cone' ? 63 : 74, topY + 9, amt('choco'))}</g>`;
  if (steps.includes('sprinkles')) out += `<g class="${fresh === 'sprinkles' ? 'pop' : ''}">${sprinkles(50, topY + 8, 12, Math.round(3 + amt('sprinkles') * 14))}</g>`;
  if (steps.includes('cherry')) out += `<g class="${fresh === 'cherry' ? 'pop' : ''}">${cherry(50, topY + 1)}</g>`;
  return out;
}

function drawCrepe(steps: readonly string[], amt: Amt, fresh: string | null): string {
  const isCooked = steps.includes('cook');
  const r = 14 + amt('batter') * 30;
  const fill = isCooked ? cooked(amt('cook'), '#f8e8b8', '#e9b45f', '#b9742f') : '#f8e8b8';
  let out = `<rect x="44" y="88" width="12" height="11" rx="3" fill="#2f2d38"/><circle cx="50" cy="54" r="40" fill="#3f3d4a" ${ST}/><circle cx="50" cy="54" r="35" fill="#56536a"/>`;
  out += `<g class="${fresh === 'batter' ? 'grow' : ''}"><circle cx="50" cy="54" r="${Math.min(34, r).toFixed(1)}" fill="${fill}" stroke="${isCooked ? '#c98b3c' : '#e6cf8f'}" stroke-width="2"/></g>`;
  if (isCooked && amt('cook') >= 0.42) out += `<g fill="#c98b3c" opacity=".55"><ellipse cx="38" cy="44" rx="4" ry="2.5"/><ellipse cx="62" cy="62" rx="5" ry="3"/><ellipse cx="58" cy="40" rx="3" ry="2"/><ellipse cx="40" cy="66" rx="3" ry="2"/></g>`;
  for (const x of steps.slice(2)) {
    const cls = fresh === x ? 'pop' : '';
    if (x === 'choco') out += `<g class="${cls}">${chocoDrizzle(28, 72, 54, amt('choco'))}</g>`;
    if (x === 'banana') out += `<g class="${cls}">${[[38, 46], [56, 44], [46, 62], [64, 58]].map(([bx, by]) => bananaSlice(bx as number, by as number)).join('')}</g>`;
    if (x === 'berries') out += `<g class="${cls}">${[[38, 48, '#d6336c'], [50, 42, '#7b3fa0'], [62, 50, '#d6336c'], [44, 62, '#7b3fa0'], [58, 64, '#d6336c']].map(([bx, by, c]) => berry(bx as number, by as number, c as string)).join('')}</g>`;
    if (x === 'cream') out += `<g class="${cls}">${creamDollop(50, 56, 0.5 + amt('cream') * 0.8)}</g>`;
  }
  return out;
}

/** Picture of an item made of `steps` (possibly incomplete). */
export function drawItem(view: ItemView | readonly string[]): string {
  const v: ItemView = Array.isArray(view) ? { steps: view as readonly string[] } : (view as ItemView);
  const steps = v.steps;
  const fresh = v.fresh ?? null;
  const amt: Amt = (x) => {
    const i = steps.indexOf(x);
    const a = i >= 0 ? v.amounts?.[i] : undefined;
    return a === undefined ? NICE : Math.max(0.02, Math.min(1, a));
  };
  const vessel = steps[0];
  let inner: string;
  switch (vessel) {
    case 'cup':
    case 'glass':
      inner = drawCupItem(steps, vessel, amt, fresh);
      break;
    case 'bread':
      inner = drawSandwich(steps, amt, fresh);
      break;
    case 'plate':
      inner = drawPlate(steps, amt, fresh);
      break;
    case 'cone':
    case 'bowl':
      inner = drawIceCream(steps, vessel, amt, fresh);
      break;
    case 'batter':
      inner = drawCrepe(steps, amt, fresh);
      break;
    default:
      inner = `<ellipse cx="50" cy="80" rx="36" ry="9" fill="#000" opacity=".08"/><circle cx="50" cy="52" r="30" fill="none" stroke="#c9a88f" stroke-width="3" stroke-dasharray="6 7"/>`;
  }
  const k = v.size ? SIZE_SCALE[v.size] : 1;
  const tf = k !== 1 ? ` transform="translate(${50 - 50 * k} ${92 - 92 * k}) scale(${k})"` : '';
  return svg(`<g class="${fresh && steps.length === 1 ? 'pop' : ''}"${tf}>${inner}</g>`, 'item');
}

// ------------------------------------------------------------------ ingredient buttons

const ICONS: Record<string, () => string> = {
  cup: () => drawCupItem(['cup'], 'cup', () => NICE, null),
  glass: () => drawCupItem(['glass'], 'glass', () => NICE, null),
  plate: () => plate(60),
  cone: () => drawIceCream(['cone'], 'cone', () => NICE, null),
  bowl: () => drawIceCream(['bowl'], 'bowl', () => NICE, null),
  coffee: () =>
    `<rect x="20" y="14" width="60" height="22" rx="8" fill="#d9614c" ${ST}/><rect x="24" y="36" width="10" height="52" fill="#c4503d" ${ST}/>` +
    `<rect x="66" y="36" width="10" height="52" fill="#c4503d" ${ST}/><rect x="18" y="86" width="64" height="8" rx="3" fill="#8a5a44" ${ST}/>` +
    `<rect x="42" y="36" width="16" height="9" rx="2" fill="#555" ${ST}/><path d="M50 46 v12" stroke="#6b3e26" stroke-width="4" stroke-linecap="round" class="drip"/>` +
    `<path d="M38 64 h24 l-3 18 h-18 z" fill="#fff" ${ST}/><circle cx="64" cy="25" r="4" fill="#ffe17a" ${ST}/>`,
  milk: () =>
    `<path d="M36 26 h28 v8 l8 12 v42 a4 4 0 0 1 -4 4 h-36 a4 4 0 0 1 -4 -4 v-42 l8 -12 z" fill="#fff" ${ST}/>` +
    `<rect x="36" y="14" width="28" height="12" rx="3" fill="#5cb5ff" ${ST}/><rect x="28" y="54" width="44" height="18" fill="#cfe9ff"/><path d="M40 63 h20" stroke="#5cb5ff" stroke-width="4" stroke-linecap="round"/>`,
  foam: () =>
    `<path d="M30 46 h40 l-4 42 h-32 z" fill="#d7dde4" ${ST}/><path d="M70 54 q12 2 8 16 l-8 4" fill="none" stroke="${OUT}" stroke-width="4"/>` +
    `<path d="M24 48 q-6 -12 8 -14 q4 -14 18 -8 q14 -8 18 8 q14 2 8 14 z" fill="#fffaf2" ${ST}/>`,
  cocoa: () =>
    `<rect x="26" y="22" width="48" height="66" rx="6" fill="#8a4f2e" ${ST}/><rect x="24" y="16" width="52" height="12" rx="4" fill="#b8693c" ${ST}/>` +
    `<circle cx="50" cy="56" r="15" fill="#f5d8b4" ${ST}/><ellipse cx="50" cy="56" rx="6" ry="9" fill="#6b3e26"/><path d="M50 48 v16" stroke="#f5d8b4" stroke-width="1.5"/>`,
  sugar: () =>
    `<path d="M22 50 h56 l-6 36 a6 6 0 0 1 -6 5 h-32 a6 6 0 0 1 -6 -5 z" fill="#cfe9ff" ${ST}/>` +
    `<g stroke="#c9b6a6" stroke-width="2"><rect x="30" y="34" width="18" height="18" rx="3" fill="#fff" transform="rotate(-10 39 43)"/><rect x="50" y="30" width="18" height="18" rx="3" fill="#fff" transform="rotate(8 59 39)"/><rect x="40" y="16" width="18" height="18" rx="3" fill="#fff"/></g>`,
  marshmallow: () =>
    `<g ${ST}><rect x="20" y="40" width="30" height="28" rx="7" fill="#ffd1e0" transform="rotate(-10 35 54)"/><rect x="48" y="36" width="30" height="28" rx="7" fill="#fff" transform="rotate(8 63 50)"/>` +
    `<rect x="34" y="60" width="30" height="26" rx="7" fill="#e9f3ff"/></g>`,
  orange: () =>
    `<circle cx="50" cy="56" r="30" fill="#ffa630" ${ST}/><circle cx="50" cy="56" r="22" fill="#ffd27a"/>` +
    `<g stroke="#ffa630" stroke-width="2.5">${[0, 60, 120].map((a) => `<path d="M${50 - 22 * Math.cos((a * Math.PI) / 180)} ${56 - 22 * Math.sin((a * Math.PI) / 180)} L${50 + 22 * Math.cos((a * Math.PI) / 180)} ${56 + 22 * Math.sin((a * Math.PI) / 180)}"/>`).join('')}</g>` +
    `<path d="M52 26 q10 -12 20 -6 q-8 10 -20 6z" fill="#6cc04a" ${ST}/>`,
  ice: () => `${iceCube(18, 44, -14, 30)}${iceCube(50, 30, 12, 30)}${iceCube(40, 58, 4, 26)}`,
  berries: () =>
    `<path d="M50 88 q-30 -18 -26 -42 q4 -14 26 -10 q22 -4 26 10 q4 24 -26 42z" fill="#e8344e" ${ST}/>` +
    `<path d="M36 36 l6 -14 l8 10 l8 -10 l6 14 z" fill="#5cb94a" ${ST}/><g fill="#ffe59a">${[[40, 52], [56, 50], [48, 64], [62, 64], [38, 66], [50, 76]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.4"/>`).join('')}</g>`,
  banana: () =>
    `<path d="M22 34 q4 44 50 46 q10 0 8 -6 q-36 -4 -46 -42 z" fill="#ffe06a" ${ST}/><path d="M22 34 l-2 -8 l6 -1 z" fill="#8a6a2a" ${ST}/>`,
  yogurt: () =>
    `<path d="M26 34 h48 l-6 52 h-36 z" fill="#fff" ${ST}/><rect x="22" y="26" width="56" height="10" rx="3" fill="#ff8fb1" ${ST}/>` +
    `<circle cx="50" cy="62" r="10" fill="#ffd1e0"/><circle cx="47" cy="60" r="3" fill="#e0457b"/>`,
  mango: () =>
    `<path d="M50 88 q-30 -6 -28 -34 q4 -28 34 -28 q22 4 20 30 q-2 28 -26 32z" fill="#ffb84d" ${ST}/>` +
    `<path d="M56 30 q8 -14 22 -12 q-6 14 -22 12z" fill="#6cc04a" ${ST}/><path d="M36 50 q4 -12 14 -14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`,
  blend: () =>
    `<path d="M30 16 h40 l-6 50 h-28 z" fill="rgba(230,246,255,.7)" ${ST}/><path d="M33 40 h34 l-3 26 h-28 z" fill="#ff9fbf"/>` +
    `<rect x="28" y="66" width="44" height="24" rx="6" fill="#7aa7d9" ${ST}/><circle cx="50" cy="78" r="5" fill="#fff" ${ST}/><rect x="28" y="10" width="44" height="8" rx="3" fill="#7aa7d9" ${ST}/>`,
  bread: () =>
    `<path d="M24 86 v-40 q-8 -2 -8 -12 q0 -14 34 -14 q34 0 34 14 q0 10 -8 12 v40 z" fill="#f5cd8c" ${ST}/>` +
    `<path d="M30 80 v-36 q-6 -2 -6 -9 q2 -8 26 -8 q24 0 26 8 q0 7 -6 9 v36 z" fill="#fde7bf"/>`,
  ham: () => `<circle cx="50" cy="54" r="32" fill="#f49aa6" stroke="#cf6878" stroke-width="3"/><circle cx="50" cy="54" r="24" fill="none" stroke="#fde3e7" stroke-width="5"/><circle cx="50" cy="54" r="18" fill="#f7b0ba"/>`,
  cheese: () =>
    `<path d="M14 70 L78 36 L88 54 L88 80 L14 80 Z" fill="#ffd34d" stroke="#d9a520" stroke-width="3" stroke-linejoin="round"/>` +
    `<g fill="#f0b82a"><circle cx="40" cy="70" r="5"/><circle cx="64" cy="60" r="4"/><circle cx="74" cy="72" r="3.5"/></g>`,
  tomato: () =>
    `<circle cx="50" cy="56" r="30" fill="#ee4b3b" ${ST}/><path d="M38 30 l12 6 l12 -6 l-4 10 h-16 z" fill="#5cb94a" ${ST}/><circle cx="40" cy="48" r="5" fill="#fff" opacity=".5"/>`,
  lettuce: () =>
    `<path d="M50 90 q-38 -10 -32 -46 q10 -20 32 -26 q22 6 32 26 q6 36 -32 46z" fill="#86cf63" stroke="#4f9238" stroke-width="3"/>` +
    `<path d="M50 88 v-62 M50 60 l-16 -12 M50 70 l16 -14 M50 46 l12 -10" stroke="#4f9238" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  toast: () =>
    `<rect x="16" y="30" width="68" height="18" rx="6" fill="#b9c2cc" ${ST}/><rect x="16" y="54" width="68" height="18" rx="6" fill="#9aa5b1" ${ST}/>` +
    `<path d="M84 39 h10" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/><rect x="22" y="72" width="8" height="12" fill="#6b7480"/><rect x="70" y="72" width="8" height="12" fill="#6b7480"/>` +
    `<circle cx="28" cy="63" r="3.5" fill="#ff5b5b"/><path d="M26 48 h48" stroke="#e09a45" stroke-width="5"/>`,
  batter: () =>
    `<path d="M22 44 h52 l-6 40 a6 6 0 0 1 -6 4 h-28 a6 6 0 0 1 -6 -4 z" fill="#f2f2f2" ${ST}/><ellipse cx="48" cy="44" rx="26" ry="6" fill="#f8e8b8" ${ST}/>` +
    `<path d="M60 40 L82 14" stroke="#aab3bd" stroke-width="4" stroke-linecap="round"/><ellipse cx="57" cy="44" rx="6" ry="9" fill="none" stroke="#aab3bd" stroke-width="3" transform="rotate(40 57 44)"/>`,
  cook: () =>
    `<circle cx="46" cy="50" r="30" fill="#3f3d4a" ${ST}/><circle cx="46" cy="50" r="24" fill="#56536a"/><path d="M74 58 l18 12" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>` +
    `<g class="flame"><path d="M30 92 q-4 -10 4 -14 q0 6 4 6 q-2 -10 6 -14 q2 10 8 12 q4 -4 2 -8 q10 6 4 18 z" fill="#ff8a3d" stroke="#e8562a" stroke-width="2"/></g>`,
  warm: () =>
    `<rect x="16" y="20" width="68" height="64" rx="8" fill="#e8e1d9" ${ST}/><rect x="24" y="34" width="52" height="40" rx="5" fill="#ffb74d" ${ST} class="glow"/>` +
    `<rect x="24" y="24" width="52" height="6" rx="2" fill="#bfb4a8"/><circle cx="30" cy="27" r="2.5" fill="${OUT}"/><circle cx="40" cy="27" r="2.5" fill="${OUT}"/>` +
    `<path d="M30 42 q20 -6 40 0" stroke="#fff" stroke-width="3" fill="none" opacity=".6"/>`,
  choco: () =>
    `<path d="M36 34 h28 v50 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6 z" fill="#6b3e26" ${ST}/><path d="M42 34 l4 -16 h8 l4 16 z" fill="#c98c5a" ${ST}/>` +
    `<rect x="36" y="50" width="28" height="18" fill="#f5d8b4"/><path d="M42 59 q8 -8 16 0" stroke="#6b3e26" stroke-width="3" fill="none"/>`,
  croissant: () => croissantShape(50, 54, 1.3),
  cake: () => cakeSlice(30),
  cream: () =>
    `<path d="M38 88 h24 l4 -40 h-32 z" fill="#5cb5ff" ${ST}/><rect x="40" y="36" width="20" height="12" rx="3" fill="#dfe7ef" ${ST}/>` +
    `${creamDollop(50, 30, 1.1)}`,
  cherry: () => `<g transform="translate(-30 -40) scale(1.6)">${cherry(50, 70)}</g>`,
  vanilla: () => `${scoop(50, 56, '#fff3d6', 24)}<path d="M30 60 h40 l-6 26 h-28 z" fill="#ffe7a8" ${ST}/>`,
  strawberry: () => `${scoop(50, 56, '#ffb3c6', 24)}<path d="M30 60 h40 l-6 26 h-28 z" fill="#ffe7a8" ${ST}/>`,
  sprinkles: () =>
    `<path d="M30 36 h40 v46 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 z" fill="rgba(255,255,255,.8)" ${ST}/><rect x="28" y="24" width="44" height="14" rx="4" fill="#ff8fb1" ${ST}/>` +
    `<g fill="#ff8fb1"><circle cx="40" cy="31" r="2"/><circle cx="50" cy="31" r="2"/><circle cx="60" cy="31" r="2"/></g>${sprinkles(50, 64, 16)}`,
};

export function ingredientIcon(id: string): string {
  const draw = ICONS[id];
  return svg(draw ? draw() : `<circle cx="50" cy="50" r="30" fill="#ddd"/>`, 'ing-icon');
}

/** Finished recipe picture (for orders, tray and shop). */
export function recipeIcon(steps: readonly string[], size: Size | null = null, amounts?: readonly number[]): string {
  return drawItem({ steps, size, amounts });
}

// ------------------------------------------------------------------ customers

/** Guests are never angry or sad: 3★ happy, 2★ smile, 1★ "meh" (neutral). */
export type Mood = 'wait' | 'happy' | 'smile' | 'meh' | 'oops';

const FUR = ['#f6c89f', '#d99a6c', '#a8794f', '#f1e4d4', '#c4c9d4', '#ffd8a8', '#e8b4b8', '#b9d7c1', '#c9b6e4'];
const SHIRTS = ['#7fb8e8', '#f28e8e', '#8fd19e', '#ffd166', '#c39bd3', '#f7a072', '#6fc3c3'];

/** Friendly round characters built from simple shapes, varied by seed. */
export type GuestKind = 'bear' | 'cat' | 'bunny' | 'buddy' | 'mouse' | 'fox' | 'panda' | 'frog';
export type GuestSpecial = 'vip' | 'critic' | 'celebrity';
const KIND_ORDER: GuestKind[] = ['bear', 'cat', 'bunny', 'buddy', 'mouse'];
const KIND_FUR: Partial<Record<GuestKind, string>> = { fox: '#f2a65a', panda: '#f7f4ee', frog: '#9ad27a' };

/** Friendly round characters built from simple shapes. `kind` and `special` change the look. */
export function customer(look: number, mood: Mood, kindIn?: GuestKind | null, special: GuestSpecial | null = null): string {
  const rng = mulberry32(look || hashString('guest'));
  const furRnd = FUR[Math.floor(rng() * FUR.length)] as string;
  const shirt = special === 'vip' ? '#7c5cc4' : special === 'celebrity' ? '#2f2d38' : (SHIRTS[Math.floor(rng() * SHIRTS.length)] as string);
  const kind: GuestKind = kindIn ?? (KIND_ORDER[Math.floor(rng() * 5)] as GuestKind);
  const fur = KIND_FUR[kind] ?? furRnd;
  const acc = special ? 0 : Math.floor(rng() * 5); // 0 none, 1 glasses, 2 beret, 3 bow, 4 scarf
  const inner = '#ffe3e8';
  let ears = '';
  if (kind === 'bear') ears = `<circle cx="34" cy="34" r="11" fill="${fur}" ${ST}/><circle cx="86" cy="34" r="11" fill="${fur}" ${ST}/><circle cx="34" cy="34" r="5" fill="${inner}"/><circle cx="86" cy="34" r="5" fill="${inner}"/>`;
  if (kind === 'cat') ears = `<path d="M28 46 L32 18 L52 34 Z" fill="${fur}" ${ST}/><path d="M92 46 L88 18 L68 34 Z" fill="${fur}" ${ST}/><path d="M34 38 L35 26 L44 34Z" fill="${inner}"/><path d="M86 38 L85 26 L76 34Z" fill="${inner}"/>`;
  if (kind === 'bunny') ears = `<ellipse cx="44" cy="16" rx="8" ry="22" fill="${fur}" ${ST} transform="rotate(-8 44 30)"/><ellipse cx="76" cy="16" rx="8" ry="22" fill="${fur}" ${ST} transform="rotate(8 76 30)"/><ellipse cx="44" cy="17" rx="3.5" ry="15" fill="${inner}" transform="rotate(-8 44 30)"/><ellipse cx="76" cy="17" rx="3.5" ry="15" fill="${inner}" transform="rotate(8 76 30)"/>`;
  if (kind === 'mouse') ears = `<circle cx="30" cy="38" r="15" fill="${fur}" ${ST}/><circle cx="90" cy="38" r="15" fill="${fur}" ${ST}/><circle cx="30" cy="38" r="8" fill="${inner}"/><circle cx="90" cy="38" r="8" fill="${inner}"/>`;
  if (kind === 'fox') ears = `<path d="M26 50 L28 12 L54 32 Z" fill="${fur}" ${ST}/><path d="M94 50 L92 12 L66 32 Z" fill="${fur}" ${ST}/><path d="M29 22 L28 12 L38 20Z M91 22 L92 12 L82 20Z" fill="#6b4433"/>`;
  if (kind === 'panda') ears = `<circle cx="34" cy="34" r="11" fill="#3a3640" ${ST}/><circle cx="86" cy="34" r="11" fill="#3a3640" ${ST}/>`;
  if (kind === 'frog') ears = `<circle cx="45" cy="36" r="12" fill="${fur}" ${ST}/><circle cx="75" cy="36" r="12" fill="${fur}" ${ST}/>`;
  const tuft = kind === 'buddy' ? `<path d="M50 28 q4 -14 12 -6 q6 -8 8 4" fill="${fur}" ${ST}/>` : '';
  const patches =
    kind === 'panda'
      ? `<ellipse cx="48" cy="61" rx="9" ry="11" fill="#3a3640" transform="rotate(20 48 61)"/><ellipse cx="72" cy="61" rx="9" ry="11" fill="#3a3640" transform="rotate(-20 72 61)"/>`
      : kind === 'fox'
        ? `<path d="M30 70 q12 -4 22 6 q-8 14 -22 -6z M90 70 q-12 -4 -22 6 q8 14 22 -6z" fill="#fff6ea"/>`
        : '';
  const dots = `<circle cx="49" cy="61" r="4.5" fill="${OUT}"/><circle cx="71" cy="61" r="4.5" fill="${OUT}"/><circle cx="50.5" cy="59.5" r="1.5" fill="#fff"/><circle cx="72.5" cy="59.5" r="1.5" fill="#fff"/>`;
  const EYES: Record<Mood, string> = {
    happy: `<path d="M44 62 q5 -7 10 0 M66 62 q5 -7 10 0" fill="none" stroke="${OUT}" stroke-width="3.5" stroke-linecap="round"/>`,
    smile: dots,
    meh: `<circle cx="49" cy="62" r="4" fill="${OUT}"/><circle cx="71" cy="62" r="4" fill="${OUT}"/><path d="M43 59 h12 M65 59 h12" stroke="${fur}" stroke-width="5"/><path d="M43 58 h12 M65 58 h12" stroke="${OUT}" stroke-width="2.5" stroke-linecap="round"/>`,
    oops: `<circle cx="49" cy="61" r="5.5" fill="#fff" stroke="${OUT}" stroke-width="2"/><circle cx="71" cy="61" r="5.5" fill="#fff" stroke="${OUT}" stroke-width="2"/><circle cx="49" cy="62" r="2.6" fill="${OUT}"/><circle cx="71" cy="62" r="2.6" fill="${OUT}"/><path d="M43 50 q6 -5 12 -1 M65 49 q6 -4 12 1" fill="none" stroke="${OUT}" stroke-width="2.5" stroke-linecap="round"/>`,
    wait: `<g class="blink">${dots}</g>`,
  };
  const MOUTH: Record<Mood, string> = {
    happy: `<path d="M52 72 q8 10 16 0 z" fill="#e25d6f" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>`,
    smile: `<path d="M52 72 q8 8 16 0" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`,
    meh: `<path d="M54 75 q6 1.5 12 0" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`,
    oops: `<ellipse cx="60" cy="75" rx="3.5" ry="4" fill="#e25d6f" stroke="${OUT}" stroke-width="2"/>`,
    wait: `<path d="M54 72 q6 6 12 0" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`,
  };
  const happy = mood === 'happy';
  const eyes = EYES[mood];
  const mouth = MOUTH[mood];
  const snout = kind === 'bear' || kind === 'mouse' || kind === 'panda' ? `<ellipse cx="60" cy="71" rx="11" ry="8" fill="#fff3e6" opacity=".9"/><ellipse cx="60" cy="67" rx="3.5" ry="2.5" fill="${OUT}"/>` : kind === 'cat' || kind === 'fox' ? `<path d="M56 67 h8 l-4 4 z" fill="${kind === 'fox' ? OUT : '#e88a9a'}"/>` : '';
  let accessory = '';
  if (acc === 1) accessory = `<g fill="rgba(255,255,255,.25)" stroke="${OUT}" stroke-width="2.5"><circle cx="49" cy="61" r="9"/><circle cx="71" cy="61" r="9"/><path d="M58 61 h4"/></g>`;
  if (acc === 2) accessory = `<path d="M30 40 q30 -26 60 0 q-30 -8 -60 0z" fill="#d9534f" ${ST}/><circle cx="60" cy="24" r="3" fill="#d9534f" ${ST}/>`;
  if (acc === 3) accessory = `<g transform="translate(84 36)"><path d="M0 0 l-10 -7 v14 z M0 0 l10 -7 v14 z" fill="#ff7aa2" ${ST}/><circle r="3.5" fill="#ff7aa2" ${ST}/></g>`;
  const scarf = acc === 4 ? `<path d="M34 96 q26 10 52 0 v10 q-26 10 -52 0z" fill="#ffd166" ${ST}/><path d="M70 104 l4 18 h8 l-4 -20z" fill="#ffd166" ${ST}/>` : '';
  let crown = '';
  if (special === 'vip')
    crown = `<path d="M40 30 l4 -16 l9 10 l7 -14 l7 14 l9 -10 l4 16 z" fill="#ffd23f" ${ST}/><circle cx="60" cy="24" r="2.5" fill="#e25d6f"/>`;
  if (special === 'critic')
    crown = `<path d="M30 38 q30 -24 60 0 q-30 -8 -60 0z" fill="#3a3640" ${ST}/><circle cx="60" cy="22" r="3" fill="#3a3640"/>` +
      `<circle cx="71" cy="61" r="9" fill="rgba(255,255,255,.25)" stroke="#c98f1a" stroke-width="2.5"/><path d="M80 63 q6 8 2 18" fill="none" stroke="#c98f1a" stroke-width="1.5"/>`;
  if (special === 'celebrity')
    crown = `<g fill="#2f2d38" stroke="${OUT}" stroke-width="2"><rect x="38" y="54" width="19" height="13" rx="5"/><rect x="63" y="54" width="19" height="13" rx="5"/></g><path d="M57 59 h6" stroke="${OUT}" stroke-width="2.5"/>` +
      `<g class="sparkle" fill="#ffd23f"><path d="M14 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z"/><path d="M104 64 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2z"/></g>`;
  const badge =
    special === 'critic'
      ? `<g transform="translate(78 104)"><rect width="22" height="26" rx="3" fill="#fff" ${ST}/><path d="M5 8 h12 M5 14 h12 M5 20 h8" stroke="#c9b6a6" stroke-width="2"/></g>`
      : special === 'vip'
        ? `<path d="M48 98 l12 10 l12 -10" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>`
        : '';
  const hearts = happy
    ? `<g class="hearts">${[[20, 30], [100, 24], [96, 54]].map(([x, y], i) => `<path style="animation-delay:${i * 0.15}s" d="M${x} ${y} c-3 -5 -10 -1 0 7 c10 -8 3 -12 0 -7z" fill="#ff6f91"/>`).join('')}</g>`
    : '';
  return svg(
    `<g class="guest-body"><path d="M22 140 q0 -44 38 -44 q38 0 38 44z" fill="${shirt}" ${ST}/>${scarf}${badge}` +
      `<g class="guest-head">${ears}<circle cx="60" cy="62" r="34" fill="${fur}" ${ST}/>${tuft}${patches}` +
      `<ellipse cx="40" cy="72" rx="6" ry="4" fill="#ff9aa8" opacity=".55"/><ellipse cx="80" cy="72" rx="6" ry="4" fill="#ff9aa8" opacity=".55"/>` +
      `${snout}${kind === 'panda' ? eyes.replace(/fill="#6b4433"/g, 'fill="#fff"').replace(/stroke="#6b4433"/g, 'stroke="#fff"') : eyes}${mouth}${accessory}${crown}</g></g>${hearts}`,
    `guest mood-${mood} kind-${kind}${special ? ` special-${special}` : ''}`,
    '0 0 120 140',
  );
}

// ------------------------------------------------------------------ café background

/**
 * The café room. `features` holds bought decorations and finished expansions
 * (tables, terrace, bakery corner, second counter, staff, ice-cream bar, lounge, winter theme).
 */
export function cafeBackground(features: readonly string[]): string {
  const has = (id: string) => features.includes(id);
  const winter = has('winter');
  let out =
    `<rect width="360" height="220" fill="${winter ? '#e6edf8' : 'var(--wall)'}"/>` +
    `<g opacity=".35">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 32}" y="0" width="14" height="220" fill="${winter ? '#c4d4ec' : 'var(--wall2)'}"/>`).join('')}</g>` +
    `<rect x="0" y="150" width="360" height="70" fill="#c98e62"/>` +
    // window with sky
    `<g><rect x="22" y="26" width="92" height="84" rx="10" fill="${winter ? '#cfe0f2' : 'var(--sky)'}" stroke="#8a5a44" stroke-width="5"/>` +
    `<circle cx="92" cy="50" r="10" fill="var(--sun)" class="sun"/>` +
    `<path d="M30 92 q12 -10 24 0 q12 -14 28 0 q10 -8 24 0 v14 h-76z" fill="${winter ? '#fff' : '#a9d98a'}" opacity=".9"/>` +
    (winter ? `<g fill="#fff" class="snow">${[[34, 40], [52, 56], [80, 36], [100, 70], [44, 76], [70, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4"/>`).join('')}</g>` : '') +
    (has('terrace')
      ? `<g><path d="M48 66 v32" stroke="#8a5a44" stroke-width="2.5"/><path d="M28 68 q20 -22 40 0 z" fill="#f28e8e" stroke="#8a5a44" stroke-width="2"/><path d="M38 68 q10 -20 20 0" fill="#fff" opacity=".8"/>` +
        `<rect x="38" y="96" width="20" height="3" fill="#8a5a44"/><circle cx="86" cy="92" r="6" fill="#ffd166" stroke="#8a5a44" stroke-width="2"/><path d="M86 98 v8" stroke="#8a5a44" stroke-width="2"/></g>`
      : '') +
    `<path d="M68 26 v84 M22 68 h92" stroke="#8a5a44" stroke-width="4"/>` +
    `<path d="M18 22 h100 l-8 14 h-84z" fill="#f28e8e" stroke="#8a5a44" stroke-width="3"/>` +
    `<path d="M30 22 l-3 14 M46 22 l-1 14 M62 22 v14 M78 22 l1 14 M94 22 l3 14" stroke="#fff" stroke-width="5" opacity=".7"/></g>` +
    // menu board (pictures only)
    `<g><rect x="250" y="28" width="86" height="62" rx="6" fill="#4b5d4f" stroke="#8a5a44" stroke-width="5"/>` +
    `<path d="M262 46 h20 M262 58 h28 M262 70 h16 M300 46 h22 M300 58 h14 M300 70 h24" stroke="#f3efe2" stroke-width="3" stroke-linecap="round" opacity=".8"/></g>`;
  if (has('lights')) {
    out += `<path d="M0 12 q90 26 180 0 q90 26 180 0" fill="none" stroke="#6b4433" stroke-width="2"/>` +
      Array.from({ length: 11 }, (_, i) => {
        const x = 16 + i * 33;
        const y = 12 + Math.sin(((x % 180) / 180) * Math.PI) * 13;
        const c = ['#ffd166', '#ff8fab', '#8fd3ff', '#b6f09c'][i % 4];
        return `<circle class="bulb" style="animation-delay:${(i % 4) * 0.4}s" cx="${x}" cy="${y + 5}" r="5" fill="${c}"/>`;
      }).join('');
  }
  if (has('painting')) {
    out += `<g><rect x="140" y="34" width="56" height="44" rx="4" fill="#fff6e0" stroke="#c9963b" stroke-width="5"/>` +
      `<circle cx="158" cy="52" r="7" fill="#ffb84d"/><path d="M144 74 l18 -16 l12 10 l10 -8 l10 14z" fill="#7cc35a"/></g>`;
  }
  if (has('clock')) {
    out += `<g transform="translate(220 54)"><circle r="15" fill="#fffaf0" stroke="#8a5a44" stroke-width="4"/><path d="M0 0 v-9 M0 0 l7 4" stroke="#6b4433" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  if (has('shelf')) {
    out += `<g><rect x="250" y="104" width="90" height="6" fill="#8a5a44"/>` +
      `<rect x="256" y="84" width="14" height="20" rx="3" fill="#ffd1e0" stroke="#8a5a44" stroke-width="2"/><rect x="274" y="80" width="14" height="24" rx="3" fill="#cfe9ff" stroke="#8a5a44" stroke-width="2"/>` +
      `<rect x="294" y="86" width="8" height="18" fill="#f28e8e"/><rect x="302" y="82" width="8" height="22" fill="#7fb8e8"/><rect x="310" y="88" width="8" height="16" fill="#ffd166"/>` +
      `<path d="M326 104 q-4 -16 6 -20 q8 6 2 20z" fill="#7cc35a"/></g>`;
  }
  // ---- expansions (back of the room)
  const table = (x: number) =>
    `<g><rect x="${x - 15}" y="134" width="8" height="14" rx="3" fill="#e07a5f" stroke="#8a5a44" stroke-width="2"/><rect x="${x + 7}" y="134" width="8" height="14" rx="3" fill="#e07a5f" stroke="#8a5a44" stroke-width="2"/>` +
    `<path d="M${x} 128 v20" stroke="#8a5a44" stroke-width="3"/><ellipse cx="${x}" cy="128" rx="13" ry="4" fill="#f3d2a6" stroke="#8a5a44" stroke-width="2"/><circle cx="${x - 4}" cy="124" r="2.5" fill="#fff" stroke="#8a5a44" stroke-width="1.2"/></g>`;
  if (has('bakery')) {
    out += `<g><rect x="118" y="100" width="56" height="5" fill="#8a5a44"/><path d="M118 84 h56" stroke="#8a5a44" stroke-width="2"/>` +
      `<ellipse cx="130" cy="96" rx="9" ry="5" fill="#e3a050" stroke="#8a5a44" stroke-width="1.5"/><ellipse cx="148" cy="96" rx="9" ry="5" fill="#d48b3b" stroke="#8a5a44" stroke-width="1.5"/><ellipse cx="164" cy="95" rx="7" ry="6" fill="#eab060" stroke="#8a5a44" stroke-width="1.5"/>` +
      `<path d="M120 80 h52 l-4 -8 h-44z" fill="#ffd1e0" stroke="#8a5a44" stroke-width="1.5"/></g>`;
  }
  if (has('aquarium')) {
    out += `<g><rect x="202" y="74" width="40" height="24" rx="3" fill="#bfe6ff" stroke="#8a5a44" stroke-width="2.5"/><path d="M204 92 q10 -4 18 0 t18 0 v4 h-36z" fill="#e8d7a8"/>` +
      `<path d="M212 84 q5 -4 10 0 q-5 4 -10 0z M222 84 l4 -3 v6z" fill="#ff9b4a" class="fish"/><path d="M228 90 q-4 -8 0 -12" stroke="#5cb94a" stroke-width="2" fill="none"/></g>`;
  }
  if (has('counter2')) {
    out += `<g><rect x="190" y="116" width="60" height="34" fill="#b5764a" stroke="#8a5a44" stroke-width="2"/><rect x="188" y="112" width="64" height="6" rx="2" fill="#e4a873"/>` +
      `<rect x="226" y="96" width="18" height="16" rx="3" fill="#d9614c" stroke="#8a5a44" stroke-width="2"/><rect x="231" y="104" width="8" height="6" fill="#fff"/></g>`;
  }
  const helper = (x: number, hat: string) =>
    `<g><circle cx="${x}" cy="106" r="9" fill="#f6c89f" stroke="#6b4433" stroke-width="2"/><circle cx="${x - 3}" cy="105" r="1.5" fill="#6b4433"/><circle cx="${x + 3}" cy="105" r="1.5" fill="#6b4433"/><path d="M${x - 3} 109 q3 3 6 0" stroke="#6b4433" stroke-width="1.5" fill="none"/>${hat}</g>`;
  if (has('barista')) out += helper(206, `<rect x="198" y="93" width="16" height="5" rx="2" fill="#2f2d38"/>`);
  if (has('baker')) out += helper(146, `<path d="M137 99 q-2 -10 9 -9 q11 -1 9 9z" fill="#fff" stroke="#6b4433" stroke-width="1.5"/>`);
  if (has('tables1')) out += table(140);
  if (has('tables2')) out += table(268);
  if (has('tables3')) out += table(298);
  if (has('icebar')) {
    out += `<g><rect x="316" y="112" width="42" height="38" rx="4" fill="#cfeaff" stroke="#8a5a44" stroke-width="2"/><rect x="320" y="118" width="34" height="12" fill="#fff" opacity=".7"/>` +
      `<g stroke="#8a5a44" stroke-width="1"><rect x="322" y="120" width="9" height="8" fill="#ffb3c6"/><rect x="333" y="120" width="9" height="8" fill="#fff3d6"/><rect x="344" y="120" width="9" height="8" fill="#a9e3b5"/></g>` +
      `<path d="M322 112 q15 -14 30 0" fill="#ff8fab" stroke="#8a5a44" stroke-width="1.5"/></g>`;
  }
  if (has('fireplace')) {
    out += `<g><rect x="52" y="104" width="56" height="46" fill="#c96a4a" stroke="#8a5a44" stroke-width="2.5"/><rect x="48" y="100" width="64" height="7" rx="2" fill="#8a5a44"/>` +
      `<path d="M64 150 v-22 a16 16 0 0 1 32 0 v22z" fill="#3a2a2a"/><g class="flame"><path d="M72 150 q-4 -12 6 -18 q-1 8 4 8 q0 -10 6 -14 q4 12 0 24z" fill="#ff9b3d"/></g></g>`;
  }
  if (has('plant')) {
    out += `<g><path d="M4 150 l6 -30 h28 l6 30z" fill="#e07a5f" stroke="#8a5a44" stroke-width="3"/>` +
      `<path d="M24 120 q-26 -20 -18 -50 q16 12 18 50 M24 120 q4 -40 24 -54 q6 32 -24 54 M24 120 q-6 -30 -2 -66 q14 26 2 66" fill="#6cbf5a" stroke="#3f8a3a" stroke-width="2.5"/></g>`;
  }
  if (has('cat')) {
    out += `<g class="cat" transform="translate(52 104)"><path d="M-22 6 q0 -16 22 -16 q22 0 22 16z" fill="#f2a65a" stroke="#6b4433" stroke-width="2.5"/>` +
      `<circle cx="-16" cy="-4" r="9" fill="#f2a65a" stroke="#6b4433" stroke-width="2.5"/><path d="M-23 -9 l1 -9 l6 5z M-11 -10 l3 -8 l3 8z" fill="#f2a65a" stroke="#6b4433" stroke-width="2"/>` +
      `<path d="M-20 -4 q2 2 4 0 M-14 -4 q2 2 4 0" stroke="#6b4433" stroke-width="1.8" fill="none"/><path d="M22 4 q12 0 10 -12" fill="none" stroke="#f2a65a" stroke-width="5" stroke-linecap="round" class="tail"/></g>`;
  }
  if (has('lounge')) {
    out += `<g><path d="M6 150 v-22 q0 -10 10 -10 h30 q10 0 10 10 v22z" fill="#8fbcd4" stroke="#8a5a44" stroke-width="2.5"/><rect x="2" y="128" width="10" height="22" rx="4" fill="#7aa8c0" stroke="#8a5a44" stroke-width="2"/><rect x="50" y="128" width="10" height="22" rx="4" fill="#7aa8c0" stroke="#8a5a44" stroke-width="2"/><circle cx="31" cy="132" r="5" fill="#ffd166"/></g>`;
  }
  if (has('chandelier')) {
    out += `<g><path d="M180 0 v14" stroke="#8a5a44" stroke-width="2"/><path d="M160 22 q20 12 40 0" fill="none" stroke="#c9963b" stroke-width="3"/>` +
      `${[160, 180, 200].map((x) => `<circle class="bulb" cx="${x}" cy="${x === 180 ? 30 : 24}" r="5" fill="#ffe17a"/>`).join('')}<circle cx="180" cy="16" r="4" fill="#c9963b"/></g>`;
  }
  if (winter) {
    out += `<path d="M0 6 q45 14 90 0 q45 14 90 0 q45 14 90 0 q45 14 90 0" fill="none" stroke="#3f8a3a" stroke-width="6"/>` +
      `${[45, 135, 225, 315].map((x) => `<circle cx="${x}" cy="13" r="4" fill="#e23a4c"/>`).join('')}`;
  }
  return svg(out, 'cafe-bg', '0 0 360 220').replace('<svg ', '<svg preserveAspectRatio="xMidYMax slice" ');
}

/** Counter top with optional flowers (drawn in front of the customer). */
export function counter(decor: readonly string[]): string {
  let out = `<rect x="0" y="10" width="360" height="40" fill="#b5764a"/><rect x="0" y="0" width="360" height="14" rx="4" fill="#e4a873"/>` +
    `<path d="M0 30 h360" stroke="#9b6038" stroke-width="2" opacity=".6"/>`;
  if (decor.includes('flowers')) {
    out += `<g transform="translate(316 -2)"><path d="M-8 2 h16 l-3 -18 h-10z" fill="#8fd3ff" stroke="#6b4433" stroke-width="2"/>` +
      `<g stroke="#6b4433" stroke-width="1.5"><circle cx="-6" cy="-24" r="6" fill="#ff8fab"/><circle cx="6" cy="-26" r="6" fill="#ffd166"/><circle cx="0" cy="-34" r="6" fill="#b98cff"/></g></g>`;
  }
  return svg(out, 'counter', '0 0 360 50').replace('<svg ', '<svg style="overflow:visible" ');
}

// ------------------------------------------------------------------ UI icons

export const icon = {
  coin: (cls = 'coin') =>
    svg(`<circle cx="50" cy="50" r="40" fill="#ffd23f" stroke="#c98f1a" stroke-width="7"/><circle cx="50" cy="50" r="26" fill="none" stroke="#f0b52a" stroke-width="5"/><path d="M40 34 q10 -6 20 0" stroke="#fff6c4" stroke-width="6" fill="none" stroke-linecap="round"/>`, cls),
  soundOn: () => svg(`<path d="M18 40 h14 l20 -16 v52 l-20 -16 h-14z" fill="currentColor"/><path d="M64 36 q10 14 0 28 M74 26 q18 24 0 48" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`),
  soundOff: () => svg(`<path d="M18 40 h14 l20 -16 v52 l-20 -16 h-14z" fill="currentColor"/><path d="M64 38 l20 24 M84 38 l-20 24" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`),
  vibrate: () => svg(`<rect x="34" y="18" width="32" height="64" rx="7" fill="none" stroke="currentColor" stroke-width="7"/><path d="M20 36 v28 M80 36 v28 M10 42 v16 M90 42 v16" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`),
  shop: () => svg(`<path d="M20 38 h60 l-6 46 h-48z" fill="currentColor"/><path d="M36 38 v-8 a14 14 0 0 1 28 0 v8" fill="none" stroke="currentColor" stroke-width="7"/>`),
  play: () => svg(`<path d="M32 20 L80 50 L32 80 Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>`),
  bell: () => svg(`<path d="M22 72 q8 -6 8 -24 a20 20 0 0 1 40 0 q0 18 8 24z" fill="currentColor"/><rect x="16" y="72" width="68" height="8" rx="4" fill="currentColor"/><circle cx="50" cy="22" r="6" fill="currentColor"/>`),
  redo: () => svg(`<path d="M74 52 a26 26 0 1 1 -10 -22" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><path d="M70 14 v20 h-20" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`),
  lock: () => svg(`<rect x="24" y="44" width="52" height="40" rx="8" fill="currentColor"/><path d="M34 44 v-10 a16 16 0 0 1 32 0 v10" fill="none" stroke="currentColor" stroke-width="8"/>`),
  video: () => svg(`<rect x="10" y="22" width="80" height="56" rx="12" fill="currentColor"/><path d="M42 36 L64 50 L42 64Z" fill="#4f9a7b"/>`),
  heart: (cls = '') => svg(`<path d="M50 84 C10 58 14 22 36 20 C46 19 50 28 50 30 C50 28 54 19 64 20 C86 22 90 58 50 84Z" fill="#ff6f91" stroke="#c94a6a" stroke-width="5"/>`, cls),
  check: () => svg(`<path d="M22 52 L42 72 L80 30" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`),
  back: () => svg(`<path d="M60 20 L30 50 L60 80" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`),
  next: () => svg(`<path d="M40 20 L70 50 L40 80" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`),
  gear: () => svg(`<circle cx="50" cy="50" r="16" fill="none" stroke="currentColor" stroke-width="9"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="45" y="12" width="10" height="16" rx="3" fill="currentColor" transform="rotate(${a} 50 50)"/>`).join('')}`),
  gem: (cls = 'gem') =>
    svg(`<path d="M28 18 h44 l18 22 l-40 46 l-40 -46z" fill="#7fd8f0" stroke="#3a8fb7" stroke-width="6" stroke-linejoin="round"/><path d="M10 40 h80 M28 18 l12 22 l10 46 M72 18 l-12 22 l-10 46 M40 40 l10 -22 l10 22" fill="none" stroke="#3a8fb7" stroke-width="3.5" stroke-linejoin="round"/><path d="M30 30 l6 -8" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`, cls),
  gift: () =>
    svg(`<rect x="14" y="40" width="72" height="48" rx="6" fill="#ff8fab" stroke="${OUT}" stroke-width="5"/><rect x="8" y="28" width="84" height="16" rx="5" fill="#ffb3c6" stroke="${OUT}" stroke-width="5"/><rect x="44" y="28" width="12" height="60" fill="#ffd23f"/><path d="M50 28 q-22 -22 -26 -4 q2 8 26 4 q24 4 26 -4 q-4 -18 -26 4z" fill="#ffd23f" stroke="${OUT}" stroke-width="4"/>`),
  calendar: () =>
    svg(`<rect x="12" y="20" width="76" height="68" rx="10" fill="#fff" stroke="${OUT}" stroke-width="5"/><rect x="12" y="20" width="76" height="20" rx="8" fill="#f28e8e" stroke="${OUT}" stroke-width="5"/><path d="M32 12 v16 M68 12 v16" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/><path d="M50 50 l5 10 l11 1 l-8 7 l3 11 l-11 -6 l-11 6 l3 -11 l-8 -7 l11 -1z" fill="#ffd23f" stroke="#c98f1a" stroke-width="2"/>`),
  book: () =>
    svg(`<path d="M50 24 q-18 -10 -38 -4 v62 q20 -6 38 4 q18 -10 38 -4 v-62 q-20 -6 -38 4z" fill="#fff" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M50 24 v62" stroke="${OUT}" stroke-width="4"/><circle cx="30" cy="46" r="7" fill="#ffb3c6"/><circle cx="70" cy="46" r="7" fill="#9ad27a"/><circle cx="30" cy="66" r="7" fill="#7fb8e8"/><circle cx="70" cy="66" r="7" fill="#ffd23f"/>`),
  trophy: () =>
    svg(`<path d="M30 14 h40 v22 a20 20 0 0 1 -40 0z" fill="#ffd23f" stroke="#c98f1a" stroke-width="5"/><path d="M30 22 h-14 q0 18 16 18 M70 22 h14 q0 18 -16 18" fill="none" stroke="#c98f1a" stroke-width="5"/><path d="M50 56 v14 M34 86 h32 l-4 -16 h-24z" stroke="#c98f1a" stroke-width="5" fill="#ffd23f"/>`),
  hammer: () =>
    svg(`<path d="M24 30 l26 -14 l14 10 l-8 8 l-8 -4 l-20 12z" fill="#aab3bd" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/><path d="M48 36 l34 44" stroke="#b5764a" stroke-width="11" stroke-linecap="round"/><path d="M48 36 l34 44" stroke="${OUT}" stroke-width="2" stroke-linecap="round" opacity=".3"/>`),
  crown: () =>
    svg(`<path d="M14 74 l-4 -46 l22 18 l18 -30 l18 30 l22 -18 l-4 46z" fill="#ffd23f" stroke="#c98f1a" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="58" r="6" fill="#e25d6f"/>`),
  timer: () =>
    svg(`<circle cx="50" cy="54" r="32" fill="#fff" stroke="${OUT}" stroke-width="6"/><path d="M50 54 v-18 M50 54 l12 8" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/><rect x="42" y="10" width="16" height="10" rx="3" fill="${OUT}"/>`),
  missions: () =>
    svg(`<rect x="16" y="12" width="68" height="78" rx="8" fill="#fff" stroke="${OUT}" stroke-width="5"/><path d="M28 34 l5 5 l9 -10 M28 54 l5 5 l9 -10 M28 74 l5 5 l9 -10" fill="none" stroke="#5ccf72" stroke-width="5" stroke-linecap="round"/><path d="M52 34 h20 M52 54 h20 M52 74 h20" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/>`),
  star: (cls = '') => svg(`<path d="M50 8 L62 36 L92 38 L69 58 L76 88 L50 72 L24 88 L31 58 L8 38 L38 36 Z" fill="#ffd23f" stroke="#c98f1a" stroke-width="5" stroke-linejoin="round"/>`, cls),
  hand: () =>
    svg(`<path d="M38 56 V20 a7 7 0 0 1 14 0 v26 l2 -10 a7 7 0 0 1 13 3 l-1 9 l2 -6 a7 7 0 0 1 12 4 l-2 14 q-2 24 -22 30 h-10 q-14 -2 -22 -20 l-10 -18 a7 7 0 0 1 11 -8 z" fill="#fff" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>`, 'hand'),
  guest: () => svg(`<circle cx="50" cy="36" r="18" fill="currentColor"/><path d="M18 88 q0 -32 32 -32 q32 0 32 32z" fill="currentColor"/>`),
  jar: () => svg(`<path d="M28 30 h44 v46 a10 10 0 0 1 -10 10 h-24 a10 10 0 0 1 -10 -10z" fill="rgba(255,255,255,.6)" stroke="#6b4433" stroke-width="5"/><rect x="24" y="20" width="52" height="12" rx="4" fill="#8a5a44"/><circle cx="42" cy="68" r="9" fill="#ffd23f" stroke="#c98f1a" stroke-width="3"/><circle cx="58" cy="60" r="9" fill="#ffd23f" stroke="#c98f1a" stroke-width="3"/>`),
  sun: () => svg(`<circle cx="50" cy="50" r="18" fill="#ffc94d"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="47" y="10" width="6" height="14" rx="3" fill="#ffc94d" transform="rotate(${a} 50 50)"/>`).join('')}`),
  recipes: () => drawItem(['cup', 'coffee', 'milk', 'foam']),
  equipment: () => ingredientIcon('coffee'),
  decor: () => svg(`<path d="M30 92 l4 -22 h32 l4 22z" fill="#e07a5f" stroke="${OUT}" stroke-width="3"/><path d="M50 70 q-30 -20 -20 -50 q18 14 20 50 M50 70 q4 -40 26 -52 q4 32 -26 52" fill="#6cbf5a" stroke="#3f8a3a" stroke-width="3"/>`),
};

export function machineIcon(m: string): string {
  return ingredientIcon(m === 'coffee' ? 'coffee' : m === 'oven' ? 'warm' : 'blend');
}

/** Shop picture of an expansion: the matching part of the café. */
export function expansionIcon(id: string): string {
  const boxes: Record<string, string> = {
    tables1: '116 112 50 42',
    tables2: '244 112 50 42',
    tables3: '274 112 50 42',
    terrace: '18 22 100 92',
    bakery: '112 66 68 46',
    counter2: '184 90 72 64',
    barista: '186 86 46 34',
    baker: '128 84 40 34',
    icebar: '308 98 54 56',
    winter: '0 0 180 120',
    lounge: '0 112 64 42',
  };
  const features = id === 'barista' || id === 'baker' ? [id, 'counter2', 'bakery'] : [id];
  return cafeBackground(features).replace('preserveAspectRatio="xMidYMax slice" ', '').replace('viewBox="0 0 360 220"', `viewBox="${boxes[id] ?? '0 0 360 220'}"`);
}

export function decorIcon(id: string): string {
  const big = cafeBackground([id]).replace('preserveAspectRatio="xMidYMax slice" ', '');
  // crop the relevant area of the background for the shop card
  const boxes: Record<string, string> = {
    plant: '-20 60 90 95',
    lights: '0 0 180 40',
    painting: '120 22 96 64',
    clock: '180 28 80 52',
    shelf: '246 72 98 44',
    cat: '18 80 70 36',
    chandelier: '140 -6 80 50',
    aquarium: '192 60 60 46',
    fireplace: '40 94 80 60',
  };
  if (id === 'flowers') return counter(['flowers']).replace('viewBox="0 0 360 50"', 'viewBox="290 -40 50 92"');
  return big.replace('viewBox="0 0 360 220"', `viewBox="${boxes[id] ?? '0 0 360 220'}"`);
}
