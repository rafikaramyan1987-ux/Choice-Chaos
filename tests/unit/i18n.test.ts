import { describe, expect, it } from 'vitest';
import { DICTS, detectLang, setLang, t } from '../../src/i18n';

describe('i18n', () => {
  it('French has every English key, none empty', () => {
    const en = Object.keys(DICTS.en).sort();
    expect(Object.keys(DICTS.fr).sort()).toEqual(en);
    for (const v of [...Object.values(DICTS.en), ...Object.values(DICTS.fr)]) expect(v.trim().length).toBeGreaterThan(0);
  });
  it('detects the browser / platform language', () => {
    expect(detectLang('fr-CA')).toBe('fr');
    expect(detectLang(null, 'en-US')).toBe('en');
    expect(detectLang('de-DE', 'es')).toBe('en');
    expect(detectLang(undefined, 'FR')).toBe('fr');
  });
  it('interpolates', () => {
    setLang('fr');
    expect(t('intro.level', { n: 3 })).toBe('Niveau 3');
    setLang('en');
    expect(t('result.shots', { n: 4, p: 5 })).toBe('Shots: 4 (par 5)');
  });
});
