export interface Vec {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec => ({ x, y });
export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const dist = (a: Vec, b: Vec): number => len(a.x - b.x, a.y - b.y);
export const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Wraps an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export function rotate(p: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Exponential approach factor for frame-rate independent smoothing. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
