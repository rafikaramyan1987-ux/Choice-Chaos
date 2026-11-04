import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n';
import { DECOR, INGREDIENTS, MACHINES, RECIPES } from '../../src/core/recipes';
import { ACHIEVEMENTS, EXPANSIONS, STICKERS } from '../../src/core/meta';

const keys = (o: Record<string, unknown>) => Object.keys(o).sort();

describe('translations', () => {
  const en = LOCALES.en;
  if (!en) throw new Error('en missing');
  for (const [code, l] of Object.entries(LOCALES)) {
    it(`${code} has every UI key and every name`, () => {
      expect(keys(l.ui)).toEqual(keys(en.ui));
      for (const r of RECIPES) expect(l.recipes[r.id], r.id).toBeTruthy();
      for (const id of Object.keys(INGREDIENTS)) expect(l.ingredients[id], id).toBeTruthy();
      for (const m of MACHINES) expect(l.machines[m], m).toBeTruthy();
      for (const d of DECOR) expect(l.decor[d.id], d.id).toBeTruthy();
      for (const a of ACHIEVEMENTS) expect(l.achievements[a.id], a.id).toBeTruthy();
      for (const e of EXPANSIONS) expect(l.expansions[e.id], e.id).toBeTruthy();
      for (const g of STICKERS) expect(l.guests[g], g).toBeTruthy();
      expect(keys(l.expansionInfo)).toEqual(keys(en.expansionInfo));
      for (const k of ['serve', 'serve_recipe', 'perfect', 'perfect_streak', 'earn_today', 'vip', 'combo', 'stars', 'large']) expect(l.ui[`mission_${k}`], k).toBeTruthy();
      // minimal text: short labels only
      for (const v of Object.values(l.recipes)) expect(v.length).toBeLessThanOrEqual(26);
    });
  }
});
