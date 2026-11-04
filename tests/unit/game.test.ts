import { describe, expect, it } from 'vitest';
import {
  DayRun,
  OK_MARGIN,
  STAR_PAY,
  buyDecor,
  buyEquipment,
  buyRecipeWithGems,
  checkStep,
  computePayment,
  customersForDay,
  equipmentCost,
  fancyRecipes,
  generateDay,
  generateOrder,
  grantRecipe,
  itemPrice,
  judge,
  makeItem,
  newProgress,
  orderSignature,
  recipeStatus,
  starsFor,
  zoneWidth,
  type OrderItem,
} from '../../src/core/game';
import { DECOR, INGREDIENTS, MACHINE_MS, RECIPES, STARTER_RECIPES, actionOf, getRecipe, machineDuration, recipeGemCost, stationIngredients } from '../../src/core/recipes';
import { mulberry32 } from '../../src/core/rng';
import { actionLevel } from '../../src/ui/app';

const item = (recipe: string, steps: string[], size: OrderItem['size'] = null): OrderItem => ({ recipe, size, steps, targets: steps.map(() => 0.5) });

describe('menu', () => {
  it('several recipes are on the menu from the start', () => {
    expect(STARTER_RECIPES.length).toBeGreaterThanOrEqual(6);
    for (const id of ['coffee', 'latte', 'cocoa', 'juice', 'croissant', 'toastie', 'crepe_choco']) expect(STARTER_RECIPES).toContain(id);
    expect(newProgress().recipes).toEqual(STARTER_RECIPES);
  });
  it('recipes are valid', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      for (const s of r.steps) expect(INGREDIENTS[s], `${r.id}:${s}`).toBeDefined();
      for (const o of r.optional) expect(r.steps).toContain(o);
      expect(r.optional).not.toContain(r.steps[0]); // the vessel is never optional
      expect(r.steps.length - r.optional.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('a station never shows more than 8 ingredient buttons', () => {
    const all = RECIPES.map((r) => r.id);
    for (const st of new Set(RECIPES.map((r) => r.station))) expect(stationIngredients(st, all).length).toBeLessThanOrEqual(8);
  });
});

describe('order generator', () => {
  it('never the same order twice in a row', () => {
    for (let seed = 1; seed < 60; seed++) {
      const orders = generateDay(1 + (seed % 9), STARTER_RECIPES, mulberry32(seed));
      for (let i = 1; i < orders.length; i++) expect(orderSignature(orders[i]!)).not.toBe(orderSignature(orders[i - 1]!));
    }
  });
  it('avoids the previous order even with a tiny menu', () => {
    const rng = mulberry32(5);
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      const o = generateOrder(1, ['juice'], rng, prev);
      const sig = orderSignature(o);
      expect(sig).not.toBe(prev);
      prev = sig;
    }
  });
  it('orders are varied from the first day: recipes, sizes and extras', () => {
    const rng = mulberry32(11);
    const recipes = new Set<string>();
    const sizes = new Set<string>();
    const coffeeVariants = new Set<string>();
    for (let d = 0; d < 20; d++) {
      for (const o of generateDay(1, STARTER_RECIPES, rng)) {
        for (const it of o.items) {
          recipes.add(it.recipe);
          if (it.size) sizes.add(it.size);
          if (it.recipe === 'coffee') coffeeVariants.add(it.steps.join(','));
        }
      }
    }
    expect(recipes.size).toBe(STARTER_RECIPES.length);
    expect([...sizes].sort()).toEqual(['L', 'M', 'S']);
    expect(coffeeVariants.size).toBe(4); // with/without milk × with/without sugar
  });
  it('day 1 has 6 guests, the first ones order a single item', () => {
    const orders = generateDay(1, STARTER_RECIPES, mulberry32(2));
    expect(orders).toHaveLength(6);
    expect(orders[0]!.items).toHaveLength(1);
    expect(orders[1]!.items).toHaveLength(1);
    for (let d = 1; d < 30; d++) {
      expect(customersForDay(d)).toBeGreaterThanOrEqual(6);
      expect(customersForDay(d)).toBeLessThanOrEqual(10);
    }
  });
  it('items keep required steps, in order, and only owned recipes are ordered', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const o of generateDay(6, STARTER_RECIPES, mulberry32(seed))) {
        for (const it of o.items) {
          const r = getRecipe(it.recipe);
          expect(STARTER_RECIPES).toContain(it.recipe);
          for (const s of r.steps) if (!r.optional.includes(s)) expect(it.steps).toContain(s);
          expect(r.steps.filter((s) => it.steps.includes(s))).toEqual(it.steps);
          expect(it.size !== null).toBe(r.sized);
          it.targets.forEach((t, i) => {
            if (actionOf(it.steps[i]!) === 'tap') expect(t).toBe(0);
            else {
              expect(t).toBeGreaterThan(0.25);
              expect(t).toBeLessThan(0.85);
            }
          });
        }
      }
    }
  });
  it('a freshly unlocked fancy recipe is asked for by the first guest', () => {
    const orders = generateDay(3, [...STARTER_RECIPES, 'cake'], mulberry32(9), 'cake');
    expect(orders[0]!.items[0]!.recipe).toBe('cake');
  });
  it('bigger cups cost more and aim higher on the gauge', () => {
    const s = { ...makeItem('latte', mulberry32(1)), size: 'S' as const };
    const l = { ...s, size: 'L' as const };
    expect(itemPrice(l)).toBeGreaterThan(itemPrice(s));
  });
});

describe('validation', () => {
  const steps = ['cup', 'coffee', 'milk'];
  it('accepts steps in order and rejects others with a gentle oops', () => {
    expect(checkStep(steps, [], 'cup')).toBe('next');
    expect(checkStep(steps, ['cup', 'coffee'], 'milk')).toBe('done');
    expect(checkStep(steps, [], 'coffee')).toBe('oops');
    expect(checkStep(steps, ['cup'], 'sugar')).toBe('oops');
    expect(checkStep(steps, ['cup', 'coffee', 'milk'], 'milk')).toBe('oops');
  });
});

describe('quality → stars → coins', () => {
  it('judges the release point against the green zone', () => {
    expect(judge(0.5, 0.5, 0.3)).toBe(3);
    expect(judge(0.64, 0.5, 0.3)).toBe(3);
    expect(judge(0.5 + 0.15 + OK_MARGIN / 2, 0.5, 0.3)).toBe(2);
    expect(judge(0.95, 0.5, 0.3)).toBe(1);
    expect(judge(0.02, 0.5, 0.3)).toBe(1);
  });
  it('the green zone starts wide and only slowly gets a bit smaller', () => {
    expect(zoneWidth(1)).toBeGreaterThanOrEqual(0.3);
    for (let d = 1; d < 100; d++) {
      expect(zoneWidth(d + 1)).toBeLessThanOrEqual(zoneWidth(d));
      expect(zoneWidth(d) - zoneWidth(d + 1)).toBeLessThanOrEqual(0.011);
      expect(zoneWidth(d)).toBeGreaterThanOrEqual(0.2);
    }
  });
  it('combines step qualities into 1–3 stars', () => {
    expect(starsFor([])).toBe(3);
    expect(starsFor([3, 3, 3])).toBe(3);
    expect(starsFor([3, 3, 2])).toBe(3);
    expect(starsFor([3, 2, 2])).toBe(2);
    expect(starsFor([2, 2])).toBe(2);
    expect(starsFor([1, 2])).toBe(1);
    expect(starsFor([1, 1, 1])).toBe(1);
  });
  it('pays base × quality: 3★ 100% + tip, 2★ 70%, 1★ 40%', () => {
    const items = [item('cake', ['plate', 'cake', 'cherry'])]; // price 8
    const p3 = computePayment(items, [3], 1000, 0);
    const p2 = computePayment(items, [2], 1000, 0);
    const p1 = computePayment(items, [1], 1000, 0);
    expect(STAR_PAY).toEqual({ 3: 1, 2: 0.7, 1: 0.4 });
    expect([p3.stars, p2.stars, p1.stars]).toEqual([3, 2, 1]);
    expect(p3.paid).toBe(8);
    expect(p3.tip).toBeGreaterThan(0);
    expect(p2.paid).toBe(6); // round(5.6)
    expect(p2.tip).toBe(0);
    expect(p1.paid).toBe(3); // round(3.2)
    expect(p1.total).toBeGreaterThanOrEqual(1);
    expect(p3.total).toBeGreaterThan(p2.total);
    expect(p2.total).toBeGreaterThan(p1.total);
  });
  it('3★ tip is bigger when quick and without mistakes', () => {
    const items = [item('latte', ['cup', 'coffee', 'milk', 'foam'], 'L')];
    const quick = computePayment(items, [3, 3, 3], 2000, 0);
    const slow = computePayment(items, [3, 3, 3], 10 * 60_000, 0);
    const oops = computePayment(items, [3, 3, 3], 2000, 2);
    expect(quick.tip).toBeGreaterThan(slow.tip);
    expect(quick.tip).toBeGreaterThan(oops.tip);
    expect(slow.tip).toBeGreaterThanOrEqual(1);
    expect(quick.perfect).toBe(true);
    expect(oops.perfect).toBe(false);
  });
  it('gauge timing: holding reaches the zone, better machines only shorten the warm-up', () => {
    expect(actionLevel('pour', 0, 0.5, 0.3, 0)).toBe(0);
    expect(actionLevel('pour', 100_000, 0.5, 0.3, 0)).toBe(1);
    // the time spent inside the green zone is the same for every machine level
    const inZone = (warm: number) => {
      let n = 0;
      for (let t = 0; t < 10_000; t += 10) {
        const l = actionLevel('timing', t, 0.6, 0.3, warm);
        if (l >= 0.45 && l <= 0.75) n++;
      }
      return n;
    };
    expect(Math.abs(inZone(MACHINE_MS[0]!) - inZone(MACHINE_MS[2]!))).toBeLessThanOrEqual(2);
  });
});

describe('a day of service', () => {
  it('records qualities, serves, pays and never fails', () => {
    const run = new DayRun(1, STARTER_RECIPES, mulberry32(3));
    expect(run.add('nope')).toBe('oops');
    let guard = 0;
    while (!run.finished && guard++ < 1000) {
      const next = run.nextIngredient;
      if (next) expect(run.add(next, 2, 0.5)).not.toBe('oops');
      else {
        const pay = run.serve(5000);
        expect(pay).not.toBeNull();
        expect(pay!.stars).toBeGreaterThanOrEqual(1);
      }
    }
    expect(run.finished).toBe(true);
    expect(run.summary.served).toBe(6);
    expect(run.summary.earned).toBeGreaterThan(0);
  });
  it('redo removes the qualities of the thrown-away item', () => {
    const run = new DayRun(1, ['cocoa'], mulberry32(1));
    const steps = run.currentItem!.steps;
    run.add(steps[0]!);
    run.add(steps[1]!, 1, 0.1);
    expect(run.qualities).toEqual([1]);
    run.redo();
    expect(run.qualities).toEqual([]);
    expect(run.steps).toEqual([]);
  });
});

describe('unlocks', () => {
  it('fancy recipes unlock by level, or early with gems', () => {
    const p = newProgress();
    expect(fancyRecipes().length).toBeGreaterThanOrEqual(5);
    expect(recipeStatus(p, 'latte')).toBe('owned');
    expect(recipeStatus(p, 'cake')).toBe('locked');
    p.coins = 10_000;
    expect(buyRecipeWithGems(p, 'cake')).toBe(false); // coins don't buy recipes
    p.gems = recipeGemCost('cake') + 1;
    expect(buyRecipeWithGems(p, 'cake')).toBe(true);
    expect(p.gems).toBe(1);
    expect(p.recipes.at(-1)).toBe('cake');
    expect(buyRecipeWithGems(p, 'cake')).toBe(false);
  });
  it('special guests pay more: VIP double tip, critic gem on 3★, celebrity double + gems', () => {
    const items = [item('cake', ['plate', 'cake', 'cherry'])];
    const normal = computePayment(items, [3], 1000, 0);
    const vip = computePayment(items, [3], 1000, 0, { special: 'vip' });
    const vip2 = computePayment(items, [2], 1000, 0, { special: 'vip' });
    const critic = computePayment(items, [3], 1000, 0, { special: 'critic' });
    const critic2 = computePayment(items, [2], 1000, 0, { special: 'critic' });
    const celeb = computePayment(items, [2], 1000, 0, { special: 'celebrity' });
    expect(vip.tip).toBe(normal.tip * 2);
    expect(vip2.tip).toBeGreaterThan(0);
    expect(critic.gems).toBe(1);
    expect(critic.tip).toBe(normal.tip * 3);
    expect(critic2.gems).toBe(0);
    expect(celeb.gems).toBe(2);
    expect(celeb.paid).toBe(computePayment(items, [2], 1000, 0).paid * 2);
  });
  it('café bonuses: terrace tips and station bonus coins', () => {
    const items = [item('cake', ['plate', 'cake', 'cherry'])];
    const base = computePayment(items, [3], 1000, 0);
    const bonus = computePayment(items, [3], 1000, 0, { tipBonus: 0.5, bonusStations: ['pastry'] });
    expect(bonus.paid).toBe(base.paid + 1);
    expect(bonus.tip).toBe(Math.round(base.tip * 1.5));
  });
  it('redo-for-3★ pays exactly the difference', () => {
    const items = [item('cake', ['plate', 'cake', 'cherry'])];
    const one = computePayment(items, [1], 1000, 0);
    const extra = DayRun.upgradeTo3(one, items);
    const best = computePayment(items, [3], 0, 0);
    expect(one.total + extra.total).toBe(best.total);
  });
  it('a staff helper completes an item perfectly', () => {
    const run = new DayRun(1, ['juice'], mulberry32(4));
    expect(run.autoComplete()).toBe(true);
    expect(run.canServe).toBe(true);
    expect(run.serve(1000)!.stars).toBe(3);
  });
  it('special guests and new kinds appear only when allowed', () => {
    const orders = generateDay(5, STARTER_RECIPES, mulberry32(3), undefined, { kinds: ['fox'], vip: 1, critic: 0, celebrity: 0 }, 2);
    expect(orders).toHaveLength(customersForDay(5, 2));
    for (const o of orders) {
      expect(o.kind).toBe('fox');
      expect(o.special).toBe('vip');
    }
    const plain = generateDay(5, STARTER_RECIPES, mulberry32(3));
    expect(plain.every((o) => o.special === null)).toBe(true);
    const first = generateDay(5, STARTER_RECIPES, mulberry32(3), undefined, { kinds: ['cat'], vip: 0, critic: 0, celebrity: 0, first: 'vip' });
    expect(first[0]!.special).toBe('vip');
    expect(first.slice(1).every((o) => o.special === null)).toBe(true);
  });
  it('rewarded unlock needs no coins', () => {
    const p = newProgress();
    expect(grantRecipe(p, 'sundae')).toBe(true);
    expect(grantRecipe(p, 'sundae')).toBe(false);
    expect(grantRecipe(p, 'latte')).toBe(false);
  });
  it('equipment upgrades shorten machine warm-up, up to a max level', () => {
    const p = newProgress();
    p.coins = 10_000;
    const before = machineDuration(p.equipment.oven);
    expect(buyEquipment(p, 'oven')).toBe(true);
    expect(machineDuration(p.equipment.oven)).toBeLessThan(before);
    expect(buyEquipment(p, 'oven')).toBe(true);
    expect(equipmentCost(p, 'oven')).toBeNull();
    expect(buyEquipment(p, 'oven')).toBe(false);
  });
  it('decorations are bought once', () => {
    const p = newProgress();
    const d = DECOR[0]!;
    p.coins = d.cost;
    expect(buyDecor(p, d.id)).toBe(true);
    expect(buyDecor(p, d.id)).toBe(false);
    const premium = DECOR.find((x) => x.gems)!;
    p.coins = 10_000;
    expect(buyDecor(p, premium.id)).toBe(false); // gems needed
    p.gems = premium.gems!;
    expect(buyDecor(p, premium.id)).toBe(true);
    expect(p.gems).toBe(0);
  });
});
