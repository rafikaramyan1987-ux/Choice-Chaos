import { Rng } from '../core/rng';
import { star } from './items';
import { OUTLINE } from './theme';

type Ctx = CanvasRenderingContext2D;

export type PKind = 'spark' | 'star' | 'leaf' | 'dust' | 'puff' | 'snow' | 'ember' | 'ring' | 'text' | 'shard' | 'ash' | 'streak' | 'bubble' | 'magic';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  g: number;
  drag: number;
  text?: string;
  /** For text: big comic style. */
  big?: boolean;
}

const rng = new Rng(12345);

/** World-space particle system (metres). */
export class Fx {
  list: Particle[] = [];
  private cap = 700;

  add(p: Partial<Particle> & { kind: PKind; x: number; y: number }): void {
    if (this.list.length >= this.cap) this.list.shift();
    const life = p.life ?? 1;
    this.list.push({ vx: 0, vy: 0, size: 0.1, color: '#fff', rot: rng.range(0, 6.28), vr: 0, g: 0, drag: 0, max: life, ...p, life });
  }

  burst(kind: PKind, x: number, y: number, n: number, o: { speed?: number; size?: number; color?: string | string[]; life?: number; g?: number; up?: number; spread?: number; dir?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      const a = (o.dir ?? -Math.PI / 2) + (rng.next() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 3) * rng.range(0.4, 1);
      const col = Array.isArray(o.color) ? rng.pick(o.color) : (o.color ?? '#fff');
      this.add({
        kind,
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.up ?? 0),
        size: (o.size ?? 0.1) * rng.range(0.6, 1.3),
        color: col,
        life: (o.life ?? 0.8) * rng.range(0.7, 1.2),
        g: o.g ?? 6,
        drag: 1.5,
        vr: rng.range(-8, 8),
      });
    }
  }

  text(x: number, y: number, text: string, color: string, big = false): void {
    this.add({ kind: 'text', x, y, vy: -1.4, life: big ? 1.4 : 1.1, text, color, big, size: big ? 0.75 : 0.55 });
  }

  /** Comic hit: sparks + spinning stars + puff. Never blood. */
  hit(x: number, y: number, head: boolean): void {
    this.burst('spark', x, y, head ? 16 : 10, { speed: 7, size: 0.09, color: ['#fff6a8', '#ffd23d', '#ffffff'], life: 0.35, g: 0 });
    this.burst('star', x, y, head ? 6 : 3, { speed: 3.5, size: 0.16, color: ['#ffd23d', '#ffe98a'], life: 0.8, g: 3, up: 1.5 });
    this.add({ kind: 'ring', x, y, size: head ? 0.9 : 0.6, life: 0.3, color: '#ffffff' });
  }

  blast(x: number, y: number, r: number, fire = false): void {
    this.add({ kind: 'ring', x, y, size: r * 1.2, life: 0.4, color: '#fff3b0' });
    this.burst('puff', x, y, 14, { speed: r * 2.2, size: r * 0.32, color: fire ? ['#ff9a3d', '#ffcf5a', '#7a5a52'] : ['#ffffff', '#f2eee6', '#ffd98a'], life: 0.9, g: -1 });
    this.burst('spark', x, y, 18, { speed: 11, size: 0.1, color: ['#fff6a8', '#ffb23d'], life: 0.45, g: 4 });
    this.burst('star', x, y, 5, { speed: 5, size: 0.2, color: ['#ffd23d'], life: 0.9, g: 4 });
    this.add({ kind: 'text', x, y: y - r * 0.6, vy: -1, life: 1, text: 'BOOM!', color: '#ffd23d', big: true, size: 0.9 });
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'leaf') p.vx += Math.sin(p.life * 4 + p.rot) * dt * 3;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  /** Draws all particles; ctx is in world units, `px` is one device pixel in metres. */
  draw(ctx: Ctx, px: number): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 2.5);
      switch (p.kind) {
        case 'spark':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(p.size * 0.6, px * 2);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case 'star':
          ctx.fillStyle = p.color;
          star(ctx, p.x, p.y, p.size, p.size * 0.45, 5, p.rot);
          ctx.fill();
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = px * 1.5;
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(px * 2, p.size * 0.12 * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.7), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'puff':
        case 'dust':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.4 - t * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'leaf':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
          break;
        case 'snow':
        case 'ash':
        case 'ember':
        case 'bubble':
        case 'magic':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (p.kind === 'ember' || p.kind === 'magic' ? t : 1), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'streak':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(px * 1.5, p.size * 0.15);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.12, p.y - p.vy * 0.12);
          ctx.stroke();
          break;
        case 'text':
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Comic texts are drawn in screen space so they stay crisp. */
  drawTexts(ctx: Ctx, toScreen: (x: number, y: number) => [number, number], zoom: number, dpr: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.list) {
      if (p.kind !== 'text' || !p.text) continue;
      const t = p.life / p.max;
      const [sx, sy] = toScreen(p.x, p.y);
      const pop = t > 0.85 ? 1 + (t - 0.85) * 4 : 1;
      const size = Math.max(16 * dpr, Math.min(64 * dpr, p.size * zoom)) * pop;
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText(p.text, sx, sy);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}
