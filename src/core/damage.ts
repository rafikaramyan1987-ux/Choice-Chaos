import { clamp } from './math';
import type { WeaponDef } from './weapons';

export type Zone = 'head' | 'torso' | 'limb';

export const ZONE_MULT: Record<Zone, number> = { head: 1.8, torso: 1, limb: 0.65 };

/** Damage of a direct hit. Faster impacts hurt a bit more (±25%). */
export function hitDamage(w: WeaponDef, zone: Zone, impactSpeed: number): number {
  const ref = w.speedMax * 0.75;
  const speedFactor = clamp(impactSpeed / ref, 0.75, 1.25);
  return Math.max(1, Math.round(w.damage * ZONE_MULT[zone] * speedFactor));
}

/** Explosion damage falls off with distance; 0 outside the radius. */
export function blastDamage(w: WeaponDef, distance: number): number {
  if (!w.explode || distance >= w.explode.radius) return 0;
  const k = 1 - distance / w.explode.radius;
  return Math.max(1, Math.round(w.explode.damage * (0.35 + 0.65 * k)));
}

/** 1 star for winning, +1 for keeping half your HP, +1 for winning within par shots. */
export function starsFor(won: boolean, hpLeft: number, hpMax: number, shots: number, par: number): number {
  if (!won) return 0;
  return 1 + (hpLeft / hpMax >= 0.5 ? 1 : 0) + (shots <= par ? 1 : 0);
}

/** Coins for finishing a level. Replays of already-starred levels pay a third. */
export function coinsFor(world: number, level: number, stars: number, boss: boolean, replay: boolean): number {
  if (stars <= 0) return 3;
  const raw = 15 + world * 6 + level * 2 + stars * 8 + (boss ? 60 + world * 10 : 0);
  return replay ? Math.max(5, Math.round(raw / 3)) : raw;
}
