import { describe, expect, it } from 'vitest';
import { STARTER_RECIPES } from '../../src/core/recipes';
import { SAVE_KEY, emptySave, loadSave, persist, resetProgress, sanitizeSave } from '../../src/platform/save';
import { readJSON } from '../../src/platform/storage';

describe('save / load', () => {
  it('round-trips through storage (memory fallback when localStorage is unavailable)', () => {
    const s = emptySave();
    s.progress.coins = 123;
    s.progress.day = 4;
    s.progress.recipes.push('cake');
    s.hints.push('hold');
    s.progress.equipment.oven = 1;
    s.progress.decor.push('plant');
    s.settings.muted = true;
    persist(s);
    const back = loadSave();
    expect(back).toEqual(s);
    expect(readJSON(SAVE_KEY, null)).not.toBeNull();
  });
  it('returns a fresh save for garbage', () => {
    expect(sanitizeSave(null)).toEqual(emptySave());
    expect(sanitizeSave('x')).toEqual(emptySave());
    expect(sanitizeSave({ version: 99 })).toEqual(emptySave());
  });
  it('drops unknown ids, clamps numbers and always keeps the basic menu', () => {
    const s = sanitizeSave({
      version: 1,
      progress: { day: -3, coins: 'lots', recipes: ['juice', 'pizza', 'cake', 'cake'], equipment: { coffee: 9, oven: -1 }, decor: ['cat', 'ufo'] },
      settings: { lang: 'fr', muted: 'yes', vibration: false },
    });
    expect(s.progress.day).toBe(1);
    expect(s.progress.coins).toBe(0);
    expect(s.progress.recipes).toEqual([...STARTER_RECIPES, 'cake']);
    expect(s.progress.equipment).toEqual({ coffee: 2, oven: 0, blender: 0 });
    expect(s.progress.decor).toEqual(['cat']);
    expect(s.settings).toEqual({ lang: 'fr', muted: false, vibration: false });
  });
  it('reset keeps settings but wipes progress', () => {
    const s = emptySave();
    s.progress.coins = 50;
    s.settings.lang = 'fr';
    const fresh = resetProgress(s);
    expect(fresh.progress.coins).toBe(0);
    expect(fresh.settings.lang).toBe('fr');
    expect(loadSave().progress.coins).toBe(0);
  });
});
