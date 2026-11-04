import type { SituationDef } from './types';
import { randInt, shuffle, type Rng } from './rng';

export interface DeckOptions {
  /** Minimum number of light situations between two serious ones. */
  minSeriousGap?: number;
}

/**
 * Builds the run order: every situation that does not require a flag, shuffled,
 * with serious dilemmas spread out between the humorous ones.
 */
export function buildDeck(situations: readonly SituationDef[], rng: Rng, opts: DeckOptions = {}): string[] {
  const minGap = opts.minSeriousGap ?? 2;
  const pool = situations.filter((s) => !s.requires);
  const light = shuffle(pool.filter((s) => !s.serious), rng).map((s) => s.id);
  const serious = shuffle(pool.filter((s) => s.serious), rng).map((s) => s.id);
  if (serious.length === 0) return light;

  const out: string[] = [];
  const ratio = light.length / serious.length;
  let carry = 0;
  let li = 0;
  // Always open with at least `minGap` light situations so the run starts funny.
  for (let si = 0; si < serious.length; si++) {
    carry += ratio;
    let k = Math.floor(carry);
    carry -= k;
    // a little jitter so the rhythm is not too regular
    if (k > minGap + 1 && rng() < 0.5) k += randInt(rng, -1, 1);
    k = Math.max(k, minGap);
    // keep enough light situations for the gaps of the remaining serious ones
    const reserve = (serious.length - si - 1) * minGap;
    k = Math.max(Math.min(k, light.length - li - reserve), Math.min(minGap, light.length - li));
    for (let n = 0; n < k && li < light.length; n++) out.push(light[li++] as string);
    out.push(serious[si] as string);
  }
  while (li < light.length) out.push(light[li++] as string);
  return out;
}

/** Positions where a follow-up is inserted: a few situations after the trigger. */
export function followUpInsertIndex(deckLength: number, currentPos: number, rng: Rng): number {
  const idx = currentPos + 1 + randInt(rng, 2, 4);
  return Math.min(idx, deckLength);
}
