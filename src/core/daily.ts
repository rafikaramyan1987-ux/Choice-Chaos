import type { SituationDef } from './types';
import { hashString } from './rng';

/** UTC date key, so every player in the world gets the same situation the same day. */
export function dateKeyUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailySeed(dateKey: string): number {
  return hashString(`choice-chaos:daily:${dateKey}`);
}

/**
 * Picks the "situation of the day". Pool is sorted by id so the result does not
 * depend on file order; follow-ups are excluded (they need context).
 */
export function dailySituationId(situations: readonly SituationDef[], dateKey: string): string {
  const pool = situations
    .filter((s) => !s.requires)
    .map((s) => s.id)
    .sort();
  if (pool.length === 0) throw new Error('No situations available');
  return pool[dailySeed(dateKey) % pool.length] as string;
}
