/**
 * Game content: ingredients, recipes, equipment and decorations.
 * Names/texts live in src/i18n/*.json; pictures in src/ui/art.ts.
 */
/** Each station shows only its own ingredients (at most 8 buttons). */
export type Station = 'hot' | 'cold' | 'grill' | 'crepe' | 'pastry' | 'icecream';
export type Machine = 'coffee' | 'oven' | 'blender';
export type Size = 'S' | 'M' | 'L';

/**
 * How an ingredient is added:
 * - tap: instant (cup, bread, cheese slice…)
 * - pour: hold to pour, release in the green zone (liquids)
 * - topping: hold to add the right amount (sugar, ice, sprinkles…)
 * - timing: a machine runs, tap when the bar is in the green zone
 */
export type Action = 'tap' | 'pour' | 'topping' | 'timing';

export interface Ingredient {
  id: string;
  action: Action;
  /** Machine steps get faster with better equipment. */
  machine?: Machine;
}

const ing = (id: string, action: Action, machine?: Machine): Ingredient => (machine ? { id, action, machine } : { id, action });

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(
  [
    // drinks
    ing('cup', 'tap'),
    ing('glass', 'tap'),
    ing('coffee', 'pour', 'coffee'),
    ing('milk', 'pour'),
    ing('foam', 'topping'),
    ing('sugar', 'topping'),
    ing('cocoa', 'pour'),
    ing('marshmallow', 'topping'),
    ing('orange', 'pour'),
    ing('ice', 'topping'),
    ing('berries', 'tap'),
    ing('banana', 'tap'),
    ing('yogurt', 'pour'),
    ing('mango', 'tap'),
    ing('blend', 'timing', 'blender'),
    // grill & crepes
    ing('bread', 'tap'),
    ing('ham', 'tap'),
    ing('cheese', 'tap'),
    ing('tomato', 'tap'),
    ing('lettuce', 'tap'),
    ing('toast', 'timing', 'oven'),
    ing('batter', 'pour'),
    ing('cook', 'timing', 'oven'),
    ing('choco', 'pour'),
    // pastries & ice cream
    ing('plate', 'tap'),
    ing('croissant', 'tap'),
    ing('warm', 'timing', 'oven'),
    ing('cake', 'tap'),
    ing('cream', 'topping'),
    ing('cherry', 'tap'),
    ing('cone', 'tap'),
    ing('bowl', 'tap'),
    ing('vanilla', 'tap'),
    ing('strawberry', 'tap'),
    ing('sprinkles', 'topping'),
  ].map((i) => [i.id, i]),
);

export function actionOf(ingredient: string): Action {
  return INGREDIENTS[ingredient]?.action ?? 'tap';
}

export interface Recipe {
  id: string;
  station: Station;
  /** All possible steps in order (optional ones included). */
  steps: string[];
  /** Steps that an order may leave out ("with / without"). */
  optional: string[];
  /** Drinks come in S / M / L. */
  sized: boolean;
  /** Base price (size M). */
  price: number;
  /** 0 = on the menu from the start; otherwise coins to unlock this fancy recipe. */
  cost: number;
}

const r = (id: string, station: Station, steps: string[], optional: string[], price: number, cost = 0, sized = false): Recipe => ({
  id,
  station,
  steps,
  optional,
  sized,
  price,
  cost,
});

export const RECIPES: Recipe[] = [
  // basic menu (available from the first customer)
  r('coffee', 'hot', ['cup', 'coffee', 'milk', 'sugar'], ['milk', 'sugar'], 4, 0, true),
  r('latte', 'hot', ['cup', 'coffee', 'milk', 'foam', 'sugar'], ['sugar'], 6, 0, true),
  r('cocoa', 'hot', ['cup', 'cocoa', 'milk', 'marshmallow', 'cream'], ['marshmallow', 'cream'], 6, 0, true),
  r('juice', 'cold', ['glass', 'orange', 'ice'], ['ice'], 4, 0, true),
  r('croissant', 'pastry', ['plate', 'croissant', 'warm', 'choco'], ['choco'], 4),
  r('toastie', 'grill', ['bread', 'ham', 'cheese', 'tomato', 'toast'], ['ham', 'tomato'], 6),
  r('crepe_choco', 'crepe', ['batter', 'cook', 'choco', 'banana', 'cream'], ['banana', 'cream'], 6),
  // fancy recipes (unlocked with coins)
  r('cake', 'pastry', ['plate', 'cake', 'cream', 'cherry'], ['cream'], 8, 60),
  r('cone', 'icecream', ['cone', 'vanilla', 'sprinkles', 'choco'], ['sprinkles', 'choco'], 6, 80),
  r('veggie', 'grill', ['bread', 'lettuce', 'tomato', 'cheese', 'toast'], ['cheese'], 8, 90),
  r('smoothie_berry', 'cold', ['glass', 'berries', 'banana', 'yogurt', 'blend', 'ice'], ['ice'], 9, 110, true),
  r('crepe_berry', 'crepe', ['batter', 'cook', 'berries', 'cream'], ['cream'], 8, 130),
  r('sundae', 'icecream', ['bowl', 'strawberry', 'vanilla', 'choco', 'sprinkles', 'cherry'], ['choco', 'sprinkles'], 10, 150),
  r('smoothie_mango', 'cold', ['glass', 'mango', 'orange', 'yogurt', 'blend'], [], 10, 170, true),
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((x) => [x.id, x]));

export function getRecipe(id: string): Recipe {
  const x = RECIPE_BY_ID[id];
  if (!x) throw new Error(`Unknown recipe ${id}`);
  return x;
}

/** Recipes on the menu from the very first customer. */
export const STARTER_RECIPES = RECIPES.filter((x) => x.cost === 0).map((x) => x.id);

export const SIZES: Size[] = ['S', 'M', 'L'];
export const SIZE_PRICE: Record<Size, number> = { S: 0.8, M: 1, L: 1.3 };
/** Where the green zone sits on the pour gauge for each cup size. */
export const SIZE_TARGET: Record<Size, number> = { S: 0.38, M: 0.56, L: 0.74 };

export const MACHINES: Machine[] = ['coffee', 'oven', 'blender'];
/** Cost of upgrade level 1 and 2 for each machine. */
export const EQUIPMENT_COSTS: Record<Machine, number[]> = {
  coffee: [60, 150],
  oven: [70, 160],
  blender: [90, 180],
};
export const MAX_EQUIPMENT_LEVEL = 2;
/** Machine warm-up time per level (ms) before the bar reaches the green zone. */
export const MACHINE_MS = [1500, 950, 500];

export function machineDuration(level: number): number {
  const l = Math.max(0, Math.min(MAX_EQUIPMENT_LEVEL, Math.floor(level)));
  return MACHINE_MS[l] as number;
}

export interface Decor {
  id: string;
  cost: number;
}
export const DECOR: Decor[] = [
  { id: 'plant', cost: 40 },
  { id: 'flowers', cost: 50 },
  { id: 'lights', cost: 70 },
  { id: 'painting', cost: 90 },
  { id: 'clock', cost: 110 },
  { id: 'shelf', cost: 140 },
  { id: 'cat', cost: 200 },
];
export const DECOR_BY_ID: Record<string, Decor> = Object.fromEntries(DECOR.map((d) => [d.id, d]));

/** Ingredient buttons shown at a station: every ingredient of the owned recipes of that station. */
export function stationIngredients(station: Station, owned: readonly string[]): string[] {
  const set = new Set<string>();
  for (const x of RECIPES) {
    if (x.station === station && owned.includes(x.id)) for (const s of x.steps) set.add(s);
  }
  return Object.keys(INGREDIENTS).filter((id) => set.has(id));
}
