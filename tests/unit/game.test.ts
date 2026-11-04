import { describe, expect, it } from 'vitest';
import {
  DayRun,
  applyDayGifts,
  buyDecor,
  buyEquipment,
  buyRecipe,
  checkStep,
  comboChance,
  computePayment,
  customersForDay,
  equipmentCost,
  generateDay,
  grantRecipe,
  matchesOrder,
  newProgress,
  parTimeMs,
  recipeStatus,
} from '../../src/core/game';
import { DECOR, INGREDIENTS, MACHINE_MS, RECIPES, getRecipe, machineDuration, stationIngredients } from '../../src/core/recipes';
import { mulberry32 } from '../../src/core/rng';

describe('recipe validation', () => {
  const latte = getRecipe('latte');
  it('accepts the steps in the right order', () => {
    expect(checkStep(latte, [], 'cup')).toBe('next');
    expect(checkStep(latte, ['cup'], 'coffee')).toBe('next');
    expect(checkStep(latte, ['cup', 'coffee', 'milk'], 'foam')).toBe('done');
  });
  it('rejects a wrong or out-of-order ingredient', () => {
    expect(checkStep(latte, [], 'coffee')).toBe('oops');
    expect(checkStep(latte, ['cup'], 'milk')).toBe('oops');
    expect(checkStep(latte, ['glass'], 'coffee')).toBe('oops');
    expect(checkStep(latte, ['cup', 'coffee', 'milk', 'foam'], 'foam')).toBe('oops');
  });
  it('matches orders regardless of item order', () => {
    expect(matchesOrder(['latte', 'croissant'], ['croissant', 'latte'])).toBe(true);
    expect(matchesOrder(['latte', 'latte'], ['latte'])).toBe(false);
    expect(matchesOrder(['latte'], ['cocoa'])).toBe(false);
  });
  it('every recipe uses known ingredients and has a unique first vessel per station', () => {
    for (const r of RECIPES) {
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
      for (const s of r.steps) expect(INGREDIENTS[s], `${r.id}:${s}`).toBeDefined();
    }
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  it('a station never shows more than 8 ingredient buttons', () => {
    const all = RECIPES.map((r) => r.id);
    for (const st of new Set(RECIPES.map((r) => r.station))) {
      expect(stationIngredients(st, all).length).toBeLessThanOrEqual(8);
    }
    expect(stationIngredients('hot', ['latte'])).toEqual(['cup', 'coffee', 'milk', 'foam']);
  });
});

describe('coins & tips', () => {
  it('always pays the full price plus at least 1 coin tip', () => {
    const slow = computePayment(['latte'], 10 * 60_000, 9);
    expect(slow.base).toBe(6);
    expect(slow.tip).toBeGreaterThanOrEqual(1);
    expect(slow.total).toBe(slow.base + slow.tip);
    expect(slow.hearts).toBe(1);
  });
  it('gives a bigger tip for correct and quick service', () => {
    const quick = computePayment(['latte', 'croissant'], 1000, 0);
    const slowWrong = computePayment(['latte', 'croissant'], parTimeMs(['latte', 'croissant']) * 3, 3);
    const quickWrong = computePayment(['latte', 'croissant'], 1000, 2);
    expect(quick.tip).toBeGreaterThan(quickWrong.tip);
    expect(quickWrong.tip).toBeGreaterThan(slowWrong.tip);
    expect(quick.perfect).toBe(true);
    expect(quick.hearts).toBe(3);
    expect(quickWrong.perfect).toBe(false);
  });
  it('tip never decreases as service gets faster', () => {
    let last = -1;
    for (let t = 60_000; t >= 0; t -= 2_000) {
      const tip = computePayment(['cake'], t, 0).tip;
      expect(tip).toBeGreaterThanOrEqual(last);
      last = tip;
    }
  });
});

describe('days', () => {
  it('a day has 6 to 10 customers', () => {
    expect(customersForDay(1)).toBe(6);
    for (let d = 1; d < 50; d++) {
      expect(customersForDay(d)).toBeGreaterThanOrEqual(6);
      expect(customersForDay(d)).toBeLessThanOrEqual(10);
      expect(customersForDay(d + 1)).toBeGreaterThanOrEqual(customersForDay(d));
      expect(comboChance(d + 1)).toBeGreaterThanOrEqual(comboChance(d));
    }
  });
  it('day 1 only asks for the single starter recipe', () => {
    const orders = generateDay(1, ['latte'], mulberry32(1));
    expect(orders).toHaveLength(6);
    for (const o of orders) expect(o.items).toEqual(['latte']);
  });
  it('first order of a day uses the newest recipe, and only owned recipes appear', () => {
    const owned = ['latte', 'croissant', 'toastie', 'juice'];
    for (let seed = 1; seed < 30; seed++) {
      const orders = generateDay(8, owned, mulberry32(seed));
      expect(orders[0]?.items).toEqual(['juice']);
      for (const o of orders) {
        expect(o.items.length).toBeLessThanOrEqual(3);
        for (const id of o.items) expect(owned).toContain(id);
      }
    }
  });
  it('DayRun: wrong ingredient = gentle oops, can redo, serving pays and advances', () => {
    const run = new DayRun(1, ['latte'], mulberry32(3));
    expect(run.add('milk')).toBe('oops');
    expect(run.steps).toEqual([]);
    expect(run.add('cup')).toBe('next');
    run.redo();
    expect(run.steps).toEqual([]);
    expect(run.serve(1000)).toBeNull(); // nothing ready yet
    for (const s of ['cup', 'coffee', 'milk']) expect(run.add(s)).toBe('next');
    expect(run.add('foam')).toBe('done');
    expect(run.canServe).toBe(true);
    const pay = run.serve(4000);
    expect(pay?.base).toBe(6);
    expect(pay?.perfect).toBe(false); // there was one mistake
    expect(run.index).toBe(1);
    expect(run.mistakes).toBe(0);
    expect(run.summary.served).toBe(1);
    expect(run.summary.earned).toBe(pay?.total);
  });
  it('a full day can always be completed (no losing)', () => {
    const run = new DayRun(9, RECIPES.map((r) => r.id), mulberry32(42));
    let guard = 0;
    while (!run.finished && guard++ < 500) {
      const next = run.nextIngredient;
      if (next) run.add(next);
      else expect(run.serve(60_000)).not.toBeNull();
    }
    expect(run.finished).toBe(true);
    expect(run.summary.served).toBe(customersForDay(9));
  });
});

describe('unlocks', () => {
  it('starts with only the starter recipe', () => {
    const p = newProgress();
    expect(p.recipes).toEqual(['latte']);
    expect(recipeStatus(p, 'latte')).toBe('owned');
    expect(recipeStatus(p, 'juice')).toBe('locked');
  });
  it('gifts free recipes on their day', () => {
    const p = newProgress();
    expect(applyDayGifts(p)).toEqual([]);
    p.day = 2;
    expect(applyDayGifts(p)).toEqual(['croissant']);
    expect(applyDayGifts(p)).toEqual([]);
  });
  it('buys a recipe only when available by day and affordable', () => {
    const p = newProgress();
    p.coins = 1000;
    expect(buyRecipe(p, 'juice')).toBe(false); // day 2 recipe
    p.day = 2;
    p.coins = 10;
    expect(recipeStatus(p, 'juice')).toBe('short');
    expect(buyRecipe(p, 'juice')).toBe(false);
    p.coins = 35;
    expect(buyRecipe(p, 'juice')).toBe(true);
    expect(p.coins).toBe(5);
    expect(buyRecipe(p, 'juice')).toBe(false); // already owned
  });
  it('rewarded unlock works without coins but not before the recipe day', () => {
    const p = newProgress();
    expect(grantRecipe(p, 'toastie')).toBe(false);
    p.day = 2;
    expect(grantRecipe(p, 'toastie')).toBe(true);
    expect(p.coins).toBe(0);
    expect(grantRecipe(p, 'toastie')).toBe(false);
  });
  it('equipment upgrades make machines faster, up to a max level', () => {
    const p = newProgress();
    p.coins = 10_000;
    const before = machineDuration(p.equipment.coffee);
    expect(buyEquipment(p, 'coffee')).toBe(true);
    expect(machineDuration(p.equipment.coffee)).toBeLessThan(before);
    expect(buyEquipment(p, 'coffee')).toBe(true);
    expect(equipmentCost(p, 'coffee')).toBeNull();
    expect(buyEquipment(p, 'coffee')).toBe(false);
    expect(machineDuration(99)).toBe(MACHINE_MS[2]);
  });
  it('decorations are bought once', () => {
    const p = newProgress();
    const d = DECOR[0];
    if (!d) throw new Error('no decor');
    p.coins = d.cost;
    expect(buyDecor(p, d.id)).toBe(true);
    expect(p.coins).toBe(0);
    p.coins = 1000;
    expect(buyDecor(p, d.id)).toBe(false);
    expect(buyDecor(p, 'nope')).toBe(false);
  });
});
