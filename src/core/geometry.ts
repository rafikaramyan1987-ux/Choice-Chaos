import type { Vec } from './math';

export type Shape = { kind: 'poly'; pts: Vec[] } | { kind: 'circle'; c: Vec; r: number };

export interface SegHit {
  t: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** First intersection of segment a→b with a convex polygon (edges, either winding), or null. */
export function segPoly(ax: number, ay: number, bx: number, by: number, pts: Vec[]): SegHit | null {
  let best: SegHit | null = null;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i] as Vec;
    const q = pts[(i + 1) % n] as Vec;
    const h = segSeg(ax, ay, bx, by, p.x, p.y, q.x, q.y);
    if (h !== null && (!best || h < best.t)) {
      let nx = q.y - p.y;
      let ny = -(q.x - p.x);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      // normal facing the incoming segment
      if (nx * (bx - ax) + ny * (by - ay) > 0) {
        nx = -nx;
        ny = -ny;
      }
      best = { t: h, x: ax + (bx - ax) * h, y: ay + (by - ay) * h, nx, ny };
    }
  }
  if (!best && pointInPoly(ax, ay, pts)) return { t: 0, x: ax, y: ay, nx: 0, ny: -1 };
  return best;
}

/** Parameter t on a→b where it crosses c→d, or null. */
export function segSeg(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number | null {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

export function pointInPoly(x: number, y: number, pts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as Vec;
    const b = pts[j] as Vec;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** First intersection of segment a→b with a circle (radius grown by pad). */
export function segCircle(ax: number, ay: number, bx: number, by: number, c: Vec, r: number): SegHit | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - c.x;
  const fy = ay - c.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  if (C <= 0) return { t: 0, x: ax, y: ay, nx: fx / (Math.hypot(fx, fy) || 1), ny: fy / (Math.hypot(fx, fy) || 1) };
  if (A < 1e-12) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { t, x, y, nx: (x - c.x) / r, ny: (y - c.y) / r };
}

export function segShape(ax: number, ay: number, bx: number, by: number, s: Shape, pad = 0): SegHit | null {
  return s.kind === 'circle' ? segCircle(ax, ay, bx, by, s.c, s.r + pad) : segPoly(ax, ay, bx, by, s.pts);
}

/** Squared distance from point p to segment a→b. */
export function distToSegSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l > 0 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px;
  const y = ay + dy * t - py;
  return x * x + y * y;
}

export function bounds(pts: Vec[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Thin rotated box from a to b with the given half thickness. */
export function beam(a: Vec, b: Vec, half: number): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * half;
  const ny = (dx / l) * half;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/**
 * A fast "does segment a→b hit any of these shapes?" test: each shape's bounding
 * box is computed once and checked before the exact intersection.
 */
export function makeBlocker(shapes: Shape[]): (ax: number, ay: number, bx: number, by: number) => boolean {
  const boxes = shapes.map((s) => {
    if (s.kind === 'circle') return { s, minX: s.c.x - s.r, maxX: s.c.x + s.r, minY: s.c.y - s.r, maxY: s.c.y + s.r };
    return { s, ...bounds(s.pts) };
  });
  return (ax, ay, bx, by) => {
    const x0 = ax < bx ? ax : bx;
    const x1 = ax < bx ? bx : ax;
    const y0 = ay < by ? ay : by;
    const y1 = ay < by ? by : ay;
    for (const b of boxes) {
      if (x1 < b.minX || x0 > b.maxX || y1 < b.minY || y0 > b.maxY) continue;
      if (segShape(ax, ay, bx, by, b.s)) return true;
    }
    return false;
  };
}
