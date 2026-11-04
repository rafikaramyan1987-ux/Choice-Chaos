import { describe, expect, it } from 'vitest';
import { SITUATIONS } from '../../src/data';
import { LOCALES, detectLanguage } from '../../src/i18n';
import { METERS } from '../../src/core/types';

const MAX_TEXT = 180;
const MAX_CHOICE = 40;
const ARTS = ['office', 'money', 'home', 'neighbor', 'friends', 'heart', 'family', 'travel', 'weird', 'food', 'phone', 'party', 'shop', 'park', 'pet', 'storm'];

describe('content data', () => {
  it('has 100 unique situations with 2–3 choices', () => {
    expect(SITUATIONS).toHaveLength(100);
    expect(new Set(SITUATIONS.map((s) => s.id)).size).toBe(100);
    for (const s of SITUATIONS) {
      expect(s.choices.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.choices.length, s.id).toBeLessThanOrEqual(3);
      expect(ARTS, s.id).toContain(s.art);
      for (const c of s.choices) for (const k of Object.keys(c.fx)) expect(METERS as readonly string[]).toContain(k);
    }
  });

  it('is about 30% serious', () => {
    const serious = SITUATIONS.filter((s) => s.serious).length;
    expect(serious).toBeGreaterThanOrEqual(25);
    expect(serious).toBeLessThanOrEqual(35);
  });

  it('every follow-up flag can be set by some choice', () => {
    const flags = new Set(SITUATIONS.flatMap((s) => s.choices.map((c) => c.sets).filter(Boolean)));
    for (const s of SITUATIONS.filter((x) => x.requires)) expect(flags.has(s.requires as string), s.id).toBe(true);
    expect(flags.has('has_cat')).toBe(true);
  });

  for (const [code, loc] of Object.entries(LOCALES)) {
    it(`${code}: every situation is translated and within length limits`, () => {
      for (const s of SITUATIONS) {
        const tx = loc.situations[s.id];
        expect(tx, `${code}:${s.id}`).toBeTruthy();
        expect(tx!.text.length, `${code}:${s.id} text`).toBeLessThanOrEqual(MAX_TEXT);
        expect(tx!.choices.length, `${code}:${s.id} choices`).toBe(s.choices.length);
        for (const c of tx!.choices) expect(c.length, `${code}:${s.id} "${c}"`).toBeLessThanOrEqual(MAX_CHOICE);
      }
    });
    it(`${code}: has every UI key of English`, () => {
      for (const key of Object.keys(LOCALES.en!.ui)) expect(loc.ui[key], `${code}:${key}`).toBeTruthy();
    });
  }

  it('detects language from browser preferences', () => {
    expect(detectLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'en-US'])).toBe('en');
    expect(detectLanguage(['ja'])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });
});
