import { clamp, len, type Vec } from './math';
import type { WeaponDef } from './weapons';

export const GRAVITY = 10;

export interface Flight {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  /** Horizontal sign at launch (boomerangs come back against it). */
  dir: number;
}

export interface FlightEnv {
  /** Wind acceleration, m/s² (positive = to the right). */
  wind: number;
}

/** Drag pull (screen px) → aim angle, power 0..1 and launch speed. Pulling back fires the other way. */
export function pullToAim(dx: number, dy: number, maxPull: number, w: WeaponDef): { angle: number; power: number; speed: number } {
  const l = len(dx, dy);
  const power = clamp(l / maxPull, 0, 1);
  const angle = Math.atan2(-dy, -dx);
  return { angle, power, speed: speedFor(power, w) };
}

export const speedFor = (power: number, w: WeaponDef): number => w.speedMin + (w.speedMax - w.speedMin) * clamp(power, 0, 1);
export const powerFor = (speed: number, w: WeaponDef): number => clamp((speed - w.speedMin) / (w.speedMax - w.speedMin), 0, 1);

export function launch(from: Vec, angle: number, speed: number): Flight {
  const vx = Math.cos(angle) * speed;
  return { x: from.x, y: from.y, vx, vy: Math.sin(angle) * speed, t: 0, dir: vx >= 0 ? 1 : -1 };
}

/** Advances a projectile by dt (semi-implicit Euler, the same maths for preview, AI and the real shot). */
export function step(f: Flight, w: WeaponDef, env: FlightEnv, dt: number): void {
  let ax = env.wind * w.windScale - f.vx * w.drag;
  const ay = GRAVITY * w.gravity - f.vy * w.drag;
  if (w.boomerang > 0) ax -= f.dir * w.boomerang;
  f.vx += ax * dt;
  f.vy += ay * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.t += dt;
}

export const SIM_DT = 1 / 240;

export interface SimOptions {
  maxTime?: number;
  dt?: number;
  /** Return true to stop the simulation (e.g. hit something) for the segment a→b. */
  stop?: (ax: number, ay: number, bx: number, by: number, t: number) => boolean;
  /** Record every n-th step (default 4). */
  every?: number;
}

/** Simulates a full flight and returns the sampled path. */
export function simulate(start: Flight, w: WeaponDef, env: FlightEnv, opt: SimOptions = {}): { points: Vec[]; end: Flight; stopped: boolean } {
  const f = { ...start };
  const dt = opt.dt ?? SIM_DT;
  const maxT = opt.maxTime ?? 6;
  const every = opt.every ?? 4;
  const points: Vec[] = [{ x: f.x, y: f.y }];
  let i = 0;
  while (f.t < maxT) {
    const ax = f.x;
    const ay = f.y;
    step(f, w, env, dt);
    i++;
    if (i % every === 0) points.push({ x: f.x, y: f.y });
    if (opt.stop?.(ax, ay, f.x, f.y, f.t)) {
      points.push({ x: f.x, y: f.y });
      return { points, end: f, stopped: true };
    }
  }
  return { points, end: f, stopped: false };
}

/** Points of the dotted aim preview (no wind, as the player sees it), every `gap` seconds up to `seconds`. */
export function previewDots(from: Vec, angle: number, speed: number, w: WeaponDef, seconds: number, gap = 0.05): Vec[] {
  const f = launch(from, angle, speed);
  const out: Vec[] = [];
  let next = gap;
  while (f.t < seconds) {
    step(f, w, { wind: 0 }, SIM_DT);
    if (f.t >= next) {
      out.push({ x: f.x, y: f.y });
      next += gap;
    }
  }
  return out;
}
