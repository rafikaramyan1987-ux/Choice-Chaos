import { describe, expect, it } from 'vitest';
import { buildDeck } from '../../src/core/deck';
import { mulberry32, shuffle } from '../../src/core/rng';
import type { SituationDef } from '../../src/core/types';
import { SITUATIONS } from '../../src/data';

describe('buildDeck', () => {
  it('contains every non-follow-up situation exactly once', () => {
    const expected = SITUATIONS.filter((s) => !s.requires).map((s) => s.id).sort();
    for (let seed = 0; seed < 100; seed++) {
      const deck = buildDeck(SITUATIONS, mulberry32(seed));
      expect(new Set(deck).size).toBe(deck.length);
      expect([...deck].sort()).toEqual(expected);
    }
  });

  it('spreads serious situations out (at least 2 light ones between them)', () => {
    const serious = new Set(SITUATIONS.filter((s) => s.serious).map((s) => s.id));
    for (let seed = 0; seed < 200; seed++) {
      const deck = buildDeck(SITUATIONS, mulberry32(seed));
      expect(serious.has(deck[0] as string)).toBe(false);
      let last = -10;
      // A run lasts at most 30 choices; check well beyond that.
      deck.slice(0, 60).forEach((id, i) => {
        if (serious.has(id)) {
          expect(i - last).toBeGreaterThanOrEqual(3);
          last = i;
        }
      });
    }
  });

  it('produces different orders for different seeds', () => {
    const a = buildDeck(SITUATIONS, mulberry32(1));
    const b = buildDeck(SITUATIONS, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('works with no serious situations', () => {
    const s: SituationDef[] = [1, 2, 3].map((n) => ({ id: `x${n}`, topic: 't', serious: false, art: 'weird', choices: [] }));
    expect(buildDeck(s, mulberry32(1))).toHaveLength(3);
  });
});

describe('shuffle', () => {
  it('keeps all items', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(items, mulberry32(7)).sort((a, b) => a - b)).toEqual(items);
  });
});
