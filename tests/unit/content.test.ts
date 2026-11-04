import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n';
import { DECOR, INGREDIENTS, MACHINES, RECIPES } from '../../src/core/recipes';

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
      // minimal text: short labels only
      for (const v of Object.values(l.recipes)) expect(v.length).toBeLessThanOrEqual(26);
    });
  }
});
