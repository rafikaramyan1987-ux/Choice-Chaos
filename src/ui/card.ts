import type { Meters } from '../core/types';

export interface CardData {
  archetypeName: string;
  archetypeDesc: string;
  archetypeEmoji: string;
  endingTitle: string;
  endingEmoji: string;
  summary: string;
  meters: Meters;
  meterLabels: Record<keyof Meters, string>;
  footer: string;
}

const W = 1080;
const H = 1350;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const METER_COLORS: Record<keyof Meters, string> = {
  money: '#2fbf71', love: '#ff5c7a', joy: '#ffb627', rep: '#7f8cf0',
};
const METER_ICONS: Record<keyof Meters, string> = { money: '💰', love: '❤️', joy: '😊', rep: '⭐' };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the shareable archetype card (1080×1350, Instagram-portrait ratio). */
export function drawCard(canvas: HTMLCanvasElement, d: CardData): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2b2340');
  g.addColorStop(1, '#4b2f6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // confetti
  const colors = ['#ff5c7a', '#ffd166', '#7be08f', '#7f8cf0'];
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = colors[i % 4] as string;
    ctx.globalAlpha = 0.35;
    const x = (i * 197) % W;
    const y = (i * 331) % H;
    ctx.fillRect(x, y, 14, 14);
  }
  ctx.globalAlpha = 1;

  // white card
  roundRect(ctx, 70, 70, W - 140, H - 140, 48);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#2b2340';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(d.footer.toUpperCase(), W / 2, 160);

  ctx.font = `160px ${FONT}`;
  ctx.fillText(d.archetypeEmoji, W / 2, 360);

  ctx.font = `900 76px ${FONT}`;
  let y = 480;
  for (const line of wrap(ctx, d.archetypeName, W - 240)) {
    ctx.fillText(line, W / 2, y);
    y += 84;
  }
  ctx.font = `500 40px ${FONT}`;
  ctx.fillStyle = '#4a4160';
  y += 10;
  for (const line of wrap(ctx, d.archetypeDesc, W - 260)) {
    ctx.fillText(line, W / 2, y);
    y += 52;
  }

  // ending pill
  y += 30;
  ctx.font = `800 42px ${FONT}`;
  const pill = `${d.endingEmoji}  ${d.endingTitle}`;
  const pw = Math.min(W - 220, ctx.measureText(pill).width + 80);
  roundRect(ctx, (W - pw) / 2, y - 50, pw, 76, 38);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.fillStyle = '#2b2340';
  ctx.fillText(pill, W / 2, y + 2, W - 260);

  // meters
  y += 90;
  const keys = Object.keys(d.meters) as Array<keyof Meters>;
  for (const k of keys) {
    const v = d.meters[k];
    ctx.textAlign = 'left';
    ctx.font = `700 36px ${FONT}`;
    ctx.fillStyle = '#2b2340';
    ctx.fillText(`${METER_ICONS[k]} ${d.meterLabels[k]}`, 150, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(v), W - 150, y);
    roundRect(ctx, 150, y + 16, W - 300, 26, 13);
    ctx.fillStyle = '#e8e2d6';
    ctx.fill();
    roundRect(ctx, 150, y + 16, Math.max(26, ((W - 300) * v) / 100), 26, 13);
    ctx.fillStyle = METER_COLORS[k];
    ctx.fill();
    y += 96;
  }

  ctx.textAlign = 'center';
  ctx.font = `600 36px ${FONT}`;
  ctx.fillStyle = '#4a4160';
  ctx.fillText(d.summary, W / 2, H - 120);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
