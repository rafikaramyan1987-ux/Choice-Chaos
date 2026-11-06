import type { WeaponLook } from '../core/weapons';
import { OUTLINE } from './theme';

type Ctx = CanvasRenderingContext2D;

/**
 * Draws a projectile in world units (metres) at the origin, pointing along +x.
 * `lw` is the outline width in world units. Arrows/spears have their tip at +x.
 */
export function drawItem(ctx: Ctx, look: WeaponLook, size: number, lw: number, time = 0): void {
  ctx.save();
  ctx.scale(size, size);
  lw /= size;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  switch (look) {
    case 'arrow': {
      // shaft
      ctx.lineWidth = lw + 0.05;
      line(ctx, -0.62, 0, 0.0, 0);
      ctx.strokeStyle = '#c98b4a';
      ctx.lineWidth = 0.05;
      line(ctx, -0.62, 0, 0.0, 0);
      // fletching
      ctx.fillStyle = '#ff5a5a';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-0.62, 0);
      ctx.lineTo(-0.72, -0.09);
      ctx.lineTo(-0.5, -0.02);
      ctx.lineTo(-0.5, 0.02);
      ctx.lineTo(-0.72, 0.09);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // head
      ctx.fillStyle = '#dfe6ee';
      ctx.beginPath();
      ctx.moveTo(0.12, 0);
      ctx.lineTo(-0.02, -0.06);
      ctx.lineTo(0.01, 0);
      ctx.lineTo(-0.02, 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'spear': {
      ctx.lineWidth = lw + 0.065;
      line(ctx, -1.05, 0, 0.2, 0);
      ctx.strokeStyle = '#a8703c';
      ctx.lineWidth = 0.065;
      line(ctx, -1.05, 0, 0.2, 0);
      ctx.strokeStyle = '#e8d3a6';
      ctx.lineWidth = 0.03;
      line(ctx, -0.25, 0, -0.1, 0);
      ctx.fillStyle = '#e6edf5';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0.42, 0);
      ctx.quadraticCurveTo(0.24, -0.11, 0.14, 0);
      ctx.quadraticCurveTo(0.24, 0.11, 0.42, 0);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'axe': {
      ctx.lineWidth = lw + 0.07;
      line(ctx, -0.3, 0, 0.28, 0);
      ctx.strokeStyle = '#a8703c';
      ctx.lineWidth = 0.07;
      line(ctx, -0.3, 0, 0.28, 0);
      ctx.fillStyle = '#dfe6ee';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0.14, -0.04);
      ctx.lineTo(0.3, -0.04);
      ctx.quadraticCurveTo(0.42, -0.15, 0.38, -0.3);
      ctx.quadraticCurveTo(0.2, -0.24, 0.14, -0.04);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0.33, -0.08);
      ctx.quadraticCurveTo(0.39, -0.16, 0.36, -0.24);
      ctx.lineTo(0.33, -0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#2f2d3a';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, 0, 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(-0.05, -0.06, 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b6878';
      ctx.fillRect(-0.05, -0.23, 0.1, 0.07);
      ctx.strokeRect(-0.05, -0.23, 0.1, 0.07);
      ctx.strokeStyle = '#c9a36a';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(0, -0.23);
      ctx.quadraticCurveTo(0.06, -0.3, 0.1, -0.29);
      ctx.stroke();
      const f = 0.04 + Math.sin(time * 40) * 0.015;
      ctx.fillStyle = '#ffd23d';
      star(ctx, 0.11, -0.3, f * 1.6, f * 0.6, 5);
      ctx.fill();
      break;
    }
    case 'boomerang': {
      ctx.lineWidth = lw + 0.11;
      ctx.beginPath();
      ctx.moveTo(-0.28, 0.14);
      ctx.quadraticCurveTo(0, -0.16, 0.28, 0.14);
      ctx.stroke();
      ctx.strokeStyle = '#d98b3a';
      ctx.lineWidth = 0.11;
      ctx.stroke();
      ctx.strokeStyle = '#fff1d6';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-0.2, 0.07);
      ctx.quadraticCurveTo(0, -0.11, 0.2, 0.07);
      ctx.stroke();
      break;
    }
    case 'bolt': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.3);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(200,140,255,0.95)');
      g.addColorStop(1, 'rgba(140,60,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      star(ctx, 0, 0, 0.13, 0.05, 4, time * 6);
      ctx.fill();
      break;
    }
    case 'snowball': {
      ctx.fillStyle = '#f7fbff';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, 0, 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#bfe0f5';
      ctx.beginPath();
      ctx.arc(0.04, 0.05, 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'meteor': {
      const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.34);
      g.addColorStop(0, 'rgba(255,230,120,0.95)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a32';
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = 0.15 + (i % 2) * 0.03;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 0.025;
      line(ctx, -0.07, -0.03, 0.05, 0.04);
      break;
    }
  }
  ctx.restore();
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function star(ctx: Ctx, x: number, y: number, r1: number, r0: number, n: number, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r0;
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** The bow held by a fighter (world units), centred on the grip, string side towards -x. */
export function drawBow(ctx: Ctx, lw: number, pull: number, scale: number): { top: { x: number; y: number }; bottom: { x: number; y: number } } {
  const h = 0.55 * scale;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.07 * scale + lw;
  ctx.beginPath();
  ctx.moveTo(-0.08 * scale, -h);
  ctx.quadraticCurveTo(0.28 * scale, 0, -0.08 * scale, h);
  ctx.stroke();
  ctx.strokeStyle = '#a0632f';
  ctx.lineWidth = 0.07 * scale;
  ctx.stroke();
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 0.02 * scale;
  ctx.beginPath();
  ctx.moveTo(0.06 * scale, -0.06 * scale);
  ctx.lineTo(0.06 * scale, 0.06 * scale);
  ctx.stroke();
  void pull;
  return { top: { x: -0.08 * scale, y: -h }, bottom: { x: -0.08 * scale, y: h } };
}

/** Magic staff (world units) from the hand along +x. */
export function drawStaff(ctx: Ctx, lw: number, scale: number, time: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.06 * scale + lw;
  line(ctx, -0.5 * scale, 0, 0.55 * scale, 0);
  ctx.strokeStyle = '#7a4a2a';
  ctx.lineWidth = 0.06 * scale;
  line(ctx, -0.5 * scale, 0, 0.55 * scale, 0);
  ctx.save();
  ctx.translate(0.62 * scale, 0);
  drawItem(ctx, 'bolt', 0.8 * scale, lw, time);
  ctx.restore();
}

/** Renders an icon canvas for a weapon (used in the HUD and shop). */
export function weaponIcon(look: WeaponLook, px: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(px * dpr);
  const ctx = c.getContext('2d') as Ctx;
  const s = c.width;
  ctx.translate(s / 2, s / 2);
  const span: Record<WeaponLook, number> = { arrow: 0.95, spear: 1.55, axe: 0.75, bomb: 0.55, boomerang: 0.7, bolt: 0.6, snowball: 0.4, meteor: 0.6 };
  const k = (s * 0.8) / span[look];
  ctx.scale(k, k);
  if (look === 'arrow' || look === 'spear') {
    ctx.rotate(-Math.PI / 4);
    ctx.translate(look === 'arrow' ? 0.28 : 0.3, 0);
  }
  if (look === 'axe') {
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-0.02, 0.1);
  }
  if (look === 'bomb') ctx.translate(0, 0.05);
  if (look === 'boomerang') ctx.translate(0, -0.02);
  drawItem(ctx, look, 1, 2.4 / k);
  return c;
}
