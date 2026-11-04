import { describe, expect, it } from 'vitest';
import {
  ALL_ENDINGS, METER_ENDINGS, SPECIAL_ENDINGS, detectHit, resolveEnding, type EndingContext,
} from '../../src/core/endings';
import { computeArchetype, ARCHETYPES } from '../../src/core/archetype';
import { LOCALES } from '../../src/i18n';

const base = (over: Partial<EndingContext> = {}): EndingContext => ({
  meters: { money: 50, love: 50, joy: 50, rep: 50 },
  turn: 15, flags: [], tagCounts: {}, ...over,
});

describe('detectHit', () => {
  it('finds low and high hits', () => {
    expect(detectHit({ money: 50, love: 50, joy: 50, rep: 50 })).toBeUndefined();
    expect(detectHit({ money: -3, love: 50, joy: 50, rep: 50 })).toEqual({ meter: 'money', dir: 'low' });
    expect(detectHit({ money: 50, love: 104, joy: 50, rep: 50 })).toEqual({ meter: 'love', dir: 'high' });
  });
  it('picks the biggest overflow when several meters break', () => {
    expect(detectHit({ money: -2, love: 50, joy: 112, rep: 50 })).toEqual({ meter: 'joy', dir: 'high' });
  });
});

describe('resolveEnding', () => {
  it('has 8 meter endings and 12 special endings (20 total)', () => {
    expect(METER_ENDINGS).toHaveLength(8);
    expect(SPECIAL_ENDINGS).toHaveLength(12);
    expect(new Set(ALL_ENDINGS).size).toBe(20);
  });

  it('maps each meter/direction to its ending', () => {
    for (const meter of ['money', 'love', 'joy', 'rep'] as const) {
      for (const dir of ['low', 'high'] as const) {
        expect(resolveEnding(base({ hit: { meter, dir } }))).toBe(`${meter}_${dir}`);
      }
    }
  });

  it('survivor endings', () => {
    expect(resolveEnding(base())).toBe('zen_master');
    expect(resolveEnding(base({ meters: { money: 90, love: 50, joy: 50, rep: 50 } }))).toBe('marathon');
  });

  it('special combinations', () => {
    const m = (money: number, love: number, joy: number, rep: number) => ({ money, love, joy, rep });
    expect(resolveEnding(base({ hit: { meter: 'money', dir: 'high' }, meters: m(100, 20, 50, 50) }))).toBe('lonely_tycoon');
    expect(resolveEnding(base({ hit: { meter: 'money', dir: 'low' }, meters: m(0, 50, 75, 50) }))).toBe('happy_pauper');
    expect(resolveEnding(base({ hit: { meter: 'love', dir: 'high' }, meters: m(10, 100, 50, 50) }))).toBe('broke_beloved');
    expect(resolveEnding(base({ hit: { meter: 'rep', dir: 'high' }, meters: m(50, 50, 20, 100) }))).toBe('famous_miserable');
    expect(resolveEnding(base({ hit: { meter: 'rep', dir: 'low' }, meters: m(50, 50, 80, 0) }))).toBe('shameless_legend');
    expect(resolveEnding(base({ hit: { meter: 'joy', dir: 'high' }, meters: m(50, 50, 100, 10) }))).toBe('carefree_chaos');
    expect(resolveEnding(base({ hit: { meter: 'love', dir: 'low' }, meters: m(50, 0, 50, 90) }))).toBe('respected_loner');
  });

  it('speedrun, pinocchio and cat take priority', () => {
    const hit = { meter: 'joy', dir: 'high' } as const;
    expect(resolveEnding(base({ hit, turn: 4 }))).toBe('speedrun');
    expect(resolveEnding(base({ hit, tagCounts: { lie: 6 } }))).toBe('pinocchio');
    expect(resolveEnding(base({ hit, flags: ['has_cat'] }))).toBe('cat_royalty');
    expect(resolveEnding(base({ hit: { meter: 'joy', dir: 'low' }, flags: ['has_cat'] }))).toBe('joy_low');
  });

  it('every ending and archetype has text in every language', () => {
    for (const loc of Object.values(LOCALES)) {
      for (const id of ALL_ENDINGS) {
        expect(loc.endings[id]?.title, `${loc.meta.code}:${id}`).toBeTruthy();
        expect(loc.endings_hint[id], `${loc.meta.code}:${id} hint`).toBeTruthy();
      }
      for (const id of ARCHETYPES) expect(loc.archetypes[id]?.name).toBeTruthy();
    }
  });
});

describe('computeArchetype', () => {
  const tendency = { money: 0, love: 0, joy: 0, rep: 0 };
  it('picks the strongest meter', () => {
    expect(computeArchetype({ tendency: { ...tendency, money: 40 }, tagCounts: {}, avgSwing: 10, choices: 10 })).toBe('strategist');
    expect(computeArchetype({ tendency: { ...tendency, love: 40 }, tagCounts: {}, avgSwing: 10, choices: 10 })).toBe('big_heart');
  });
  it('detects tightrope, chaos, honesty and lies', () => {
    expect(computeArchetype({ tendency, tagCounts: {}, avgSwing: 10, choices: 10 })).toBe('tightrope');
    expect(computeArchetype({ tendency: { ...tendency, joy: 50 }, tagCounts: {}, avgSwing: 45, choices: 10 })).toBe('chaos_agent');
    expect(computeArchetype({ tendency, tagCounts: { honest: 7 }, avgSwing: 10, choices: 10 })).toBe('honest_soul');
    expect(computeArchetype({ tendency, tagCounts: { lie: 5 }, avgSwing: 10, choices: 10 })).toBe('smooth_talker');
  });
});
