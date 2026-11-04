/**
 * Game content: ingredients, recipes, equipment and decorations.
 * Names/texts live in src/i18n/*.json; pictures in src/ui/art.ts.
 */
/** Each station shows only its own ingredients (at most 8 buttons). */
export type Station = 'hot' | 'cold' | 'grill' | 'crepe' | 'pastry' | 'icecream';
export type Machine = 'coffee' | 'oven' | 'blender';
export type Category = 'drink' | 'sandwich' | 'crepe' | 'dessert' | 'icecream' | 'smoothie';

export interface Ingredient {
  id: string;
  /** Steps done by a machine take time (shorter with better equipment). */
  machine?: Machine;
  /** Visual effect while it is added. */
  fx?: 'pour' | 'sizzle' | 'blend' | 'drop';
}

const ing = (id: string, extra: Omit<Ingredient, 'id'> = {}): Ingredient => ({ id, ...extra });

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(
  [
    // drinks
    ing('cup', { fx: 'drop' }),
    ing('glass', { fx: 'drop' }),
    ing('coffee', { machine: 'coffee', fx: 'pour' }),
    ing('milk', { fx: 'pour' }),
    ing('foam', { fx: 'pour' }),
    ing('cocoa', { fx: 'pour' }),
    ing('marshmallow', { fx: 'drop' }),
    ing('orange', { fx: 'pour' }),
    ing('ice', { fx: 'drop' }),
    ing('berries', { fx: 'drop' }),
    ing('banana', { fx: 'drop' }),
    ing('yogurt', { fx: 'pour' }),
    ing('mango', { fx: 'drop' }),
    ing('blend', { machine: 'blender', fx: 'blend' }),
    // grill & crepes
    ing('bread', { fx: 'drop' }),
    ing('ham', { fx: 'drop' }),
    ing('cheese', { fx: 'drop' }),
    ing('tomato', { fx: 'drop' }),
    ing('lettuce', { fx: 'drop' }),
    ing('toast', { machine: 'oven', fx: 'sizzle' }),
    ing('batter', { fx: 'pour' }),
    ing('cook', { machine: 'oven', fx: 'sizzle' }),
    ing('choco', { fx: 'pour' }),
    // pastries & ice cream
    ing('plate', { fx: 'drop' }),
    ing('croissant', { fx: 'drop' }),
    ing('warm', { machine: 'oven', fx: 'sizzle' }),
    ing('cake', { fx: 'drop' }),
    ing('cream', { fx: 'drop' }),
    ing('cherry', { fx: 'drop' }),
    ing('cone', { fx: 'drop' }),
    ing('bowl', { fx: 'drop' }),
    ing('vanilla', { fx: 'drop' }),
    ing('strawberry', { fx: 'drop' }),
    ing('sprinkles', { fx: 'drop' }),
  ].map((i) => [i.id, i]),
);

export interface Recipe {
  id: string;
  category: Category;
  station: Station;
  /** Ingredients in the exact order they must be added. */
  steps: string[];
  /** Base price paid by the customer. */
  price: number;
  /** Coins to unlock it in the shop (0 = given for free on `day`). */
  cost: number;
  /** First day it can be unlocked. */
  day: number;
}

export const RECIPES: Recipe[] = [
  { id: 'latte', category: 'drink', station: 'hot', steps: ['cup', 'coffee', 'milk', 'foam'], price: 6, cost: 0, day: 1 },
  { id: 'croissant', category: 'dessert', station: 'pastry', steps: ['plate', 'croissant', 'warm'], price: 4, cost: 0, day: 2 },
  { id: 'juice', category: 'drink', station: 'cold', steps: ['glass', 'orange', 'ice'], price: 5, cost: 30, day: 2 },
  { id: 'toastie', category: 'sandwich', station: 'grill', steps: ['bread', 'ham', 'cheese', 'toast'], price: 8, cost: 45, day: 2 },
  { id: 'cocoa', category: 'drink', station: 'hot', steps: ['cup', 'cocoa', 'milk', 'marshmallow'], price: 7, cost: 60, day: 3 },
  { id: 'crepe_choco', category: 'crepe', station: 'crepe', steps: ['batter', 'cook', 'choco', 'banana'], price: 8, cost: 70, day: 3 },
  { id: 'cone', category: 'icecream', station: 'icecream', steps: ['cone', 'vanilla', 'sprinkles'], price: 6, cost: 80, day: 4 },
  { id: 'veggie', category: 'sandwich', station: 'grill', steps: ['bread', 'lettuce', 'tomato', 'cheese', 'toast'], price: 9, cost: 100, day: 4 },
  { id: 'cake', category: 'dessert', station: 'pastry', steps: ['plate', 'cake', 'cream', 'cherry'], price: 9, cost: 120, day: 5 },
  { id: 'smoothie_berry', category: 'smoothie', station: 'cold', steps: ['glass', 'berries', 'banana', 'yogurt', 'blend'], price: 10, cost: 140, day: 5 },
  { id: 'crepe_berry', category: 'crepe', station: 'crepe', steps: ['batter', 'cook', 'berries', 'cream'], price: 9, cost: 150, day: 6 },
  { id: 'sundae', category: 'icecream', station: 'icecream', steps: ['bowl', 'strawberry', 'vanilla', 'choco', 'cherry'], price: 11, cost: 180, day: 6 },
  { id: 'smoothie_mango', category: 'smoothie', station: 'cold', steps: ['glass', 'mango', 'orange', 'yogurt', 'blend'], price: 11, cost: 200, day: 7 },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): Recipe {
  const r = RECIPE_BY_ID[id];
  if (!r) throw new Error(`Unknown recipe ${id}`);
  return r;
}

export const STARTER_RECIPE = 'latte';

export const MACHINES: Machine[] = ['coffee', 'oven', 'blender'];
/** Cost of upgrade level 1 and 2 for each machine. */
export const EQUIPMENT_COSTS: Record<Machine, number[]> = {
  coffee: [60, 150],
  oven: [70, 160],
  blender: [90, 180],
};
export const MAX_EQUIPMENT_LEVEL = 2;
/** Machine time per level (ms). */
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
  for (const r of RECIPES) {
    if (r.station === station && owned.includes(r.id)) for (const s of r.steps) set.add(s);
  }
  // stable order: order of declaration in INGREDIENTS
  return Object.keys(INGREDIENTS).filter((id) => set.has(id));
}
