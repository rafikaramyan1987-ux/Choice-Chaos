/**
 * Pure game rules (no DOM): step validation, payment & tips, day generation,
 * unlocks and the per-day state machine. Everything here is unit tested.
 */
import {
  DECOR_BY_ID,
  EQUIPMENT_COSTS,
  MACHINES,
  MAX_EQUIPMENT_LEVEL,
  RECIPES,
  RECIPE_BY_ID,
  STARTER_RECIPE,
  getRecipe,
  type Machine,
  type Recipe,
} from './recipes';
import type { Rng } from './rng';

// ---------------------------------------------------------------- validation

export type StepResult = 'next' | 'done' | 'oops';

/** Checks adding `ingredient` to an item that already has `done` steps. */
export function checkStep(recipe: Recipe, done: readonly string[], ingredient: string): StepResult {
  if (done.length >= recipe.steps.length) return 'oops';
  for (let i = 0; i < done.length; i++) if (done[i] !== recipe.steps[i]) return 'oops';
  if (recipe.steps[done.length] !== ingredient) return 'oops';
  return done.length + 1 === recipe.steps.length ? 'done' : 'next';
}

/** True when the prepared items are exactly the ordered ones (any order). */
export function matchesOrder(order: readonly string[], prepared: readonly string[]): boolean {
  if (order.length !== prepared.length) return false;
  const a = [...order].sort();
  const b = [...prepared].sort();
  return a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------- coins & tips

/** Time a relaxed but attentive player needs for one step. */
export const STEP_PAR_MS = 1600;
export const ORDER_PAR_BASE_MS = 3000;

export function parTimeMs(items: readonly string[]): number {
  const steps = items.reduce((n, id) => n + getRecipe(id).steps.length, 0);
  return ORDER_PAR_BASE_MS + steps * STEP_PAR_MS;
}

export interface Payment {
  base: number;
  tip: number;
  total: number;
  /** 1..3 hearts shown above the customer. */
  hearts: number;
  perfect: boolean;
}

/**
 * Customers always pay the full price. The tip grows with speed and accuracy
 * (there is never a penalty below the base price, and always at least 1 coin tip).
 */
export function computePayment(items: readonly string[], elapsedMs: number, mistakes: number): Payment {
  const base = items.reduce((n, id) => n + getRecipe(id).price, 0);
  const par = parTimeMs(items);
  const speed = Math.max(0, Math.min(1, (3 * par - Math.max(0, elapsedMs)) / (2 * par)));
  const accuracy = mistakes <= 0 ? 1 : mistakes === 1 ? 0.5 : mistakes === 2 ? 0.25 : 0;
  const rate = 0.1 + 0.3 * speed + 0.2 * accuracy;
  const tip = Math.max(1, Math.round(base * rate));
  const perfect = mistakes <= 0 && speed >= 0.999;
  const hearts = 1 + (speed >= 0.5 ? 1 : 0) + (mistakes <= 0 ? 1 : 0);
  return { base, tip, total: base + tip, hearts, perfect };
}

// ---------------------------------------------------------------- days & orders

export function customersForDay(day: number): number {
  return Math.min(10, 5 + Math.max(1, Math.floor(day)));
}

export function comboChance(day: number): number {
  return day <= 1 ? 0 : Math.min(0.45, 0.1 * (day - 1));
}

export function tripleChance(day: number): number {
  return day < 6 ? 0 : Math.min(0.2, 0.05 * (day - 5));
}

export interface Order {
  items: string[];
  /** Seed for the customer's look. */
  look: number;
}

/**
 * Generates the orders of one day. The first order is always a single item and
 * uses the most recently unlocked recipe, so new recipes are tried right away.
 */
export function generateDay(day: number, owned: readonly string[], rng: Rng): Order[] {
  const recipes = owned.filter((id) => RECIPE_BY_ID[id]);
  if (recipes.length === 0) recipes.push(STARTER_RECIPE);
  const newest = recipes[recipes.length - 1] as string;
  const count = customersForDay(day);
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const look = Math.floor(rng() * 0xffffffff);
    if (i === 0) {
      orders.push({ items: [newest], look });
      continue;
    }
    let size = 1;
    const roll = rng();
    if (recipes.length > 1 && i >= 2) {
      if (roll < tripleChance(day) && recipes.length > 2) size = 3;
      else if (roll < comboChance(day)) size = 2;
    }
    const pool = [...recipes];
    const items: string[] = [];
    for (let k = 0; k < size; k++) {
      const idx = Math.floor(rng() * pool.length);
      items.push(pool.splice(idx, 1)[0] as string);
    }
    // gently favour the newest recipe on single orders
    if (size === 1 && recipes.length > 1 && rng() < 0.25) items[0] = newest;
    orders.push({ items, look });
  }
  return orders;
}

// ---------------------------------------------------------------- progress & unlocks

export interface Progress {
  /** Next day to play (1-based). */
  day: number;
  coins: number;
  /** Owned recipes, in unlock order. */
  recipes: string[];
  equipment: Record<Machine, number>;
  decor: string[];
}

export function newProgress(): Progress {
  return { day: 1, coins: 0, recipes: [STARTER_RECIPE], equipment: { coffee: 0, oven: 0, blender: 0 }, decor: [] };
}

export type RecipeStatus = 'owned' | 'locked' | 'buyable' | 'short';

export function recipeStatus(p: Progress, id: string): RecipeStatus {
  const r = getRecipe(id);
  if (p.recipes.includes(id)) return 'owned';
  if (p.day < r.day) return 'locked';
  return p.coins >= r.cost ? 'buyable' : 'short';
}

export function buyRecipe(p: Progress, id: string): boolean {
  if (recipeStatus(p, id) !== 'buyable') return false;
  p.coins -= getRecipe(id).cost;
  p.recipes.push(id);
  return true;
}

/** Rewarded-ad unlock: only for recipes already available by day but not affordable yet. */
export function grantRecipe(p: Progress, id: string): boolean {
  const s = recipeStatus(p, id);
  if (s !== 'short' && s !== 'buyable') return false;
  p.recipes.push(id);
  return true;
}

/** Free recipes (cost 0) are gifted on their day. Returns the newly gifted ids. */
export function applyDayGifts(p: Progress): string[] {
  const gifted: string[] = [];
  for (const r of RECIPES) {
    if (r.cost === 0 && r.day <= p.day && !p.recipes.includes(r.id)) {
      p.recipes.push(r.id);
      gifted.push(r.id);
    }
  }
  return gifted;
}

export function equipmentCost(p: Progress, m: Machine): number | null {
  const lvl = p.equipment[m];
  if (lvl >= MAX_EQUIPMENT_LEVEL) return null;
  return EQUIPMENT_COSTS[m][lvl] ?? null;
}

/** A machine is only useful once a recipe needs it. */
export function machineNeeded(p: Progress, m: Machine): boolean {
  return p.recipes.some((id) => getRecipe(id).steps.some((s) => machineOf(s) === m));
}

const MACHINE_STEPS: Record<string, Machine> = { coffee: 'coffee', toast: 'oven', cook: 'oven', warm: 'oven', blend: 'blender' };
export function machineOf(ingredient: string): Machine | undefined {
  return MACHINE_STEPS[ingredient];
}

export function buyEquipment(p: Progress, m: Machine): boolean {
  const cost = equipmentCost(p, m);
  if (cost === null || p.coins < cost) return false;
  p.coins -= cost;
  p.equipment[m] += 1;
  return true;
}

export function buyDecor(p: Progress, id: string): boolean {
  const d = DECOR_BY_ID[id];
  if (!d || p.decor.includes(id) || p.coins < d.cost) return false;
  p.coins -= d.cost;
  p.decor.push(id);
  return true;
}

export function isMachine(m: string): m is Machine {
  return (MACHINES as string[]).includes(m);
}

// ---------------------------------------------------------------- one day of service

export interface DaySummary {
  day: number;
  served: number;
  base: number;
  tips: number;
  earned: number;
  perfect: number;
}

/** State of the current day: which customer, which item, prepared steps. */
export class DayRun {
  readonly orders: Order[];
  index = 0;
  /** Steps added to the item being prepared. */
  steps: string[] = [];
  /** Finished items waiting to be served. */
  tray: string[] = [];
  mistakes = 0;
  readonly summary: DaySummary;

  constructor(readonly day: number, owned: readonly string[], rng: Rng) {
    this.orders = generateDay(day, owned, rng);
    this.summary = { day, served: 0, base: 0, tips: 0, earned: 0, perfect: 0 };
  }

  get finished(): boolean {
    return this.index >= this.orders.length;
  }
  get order(): Order | null {
    return this.orders[this.index] ?? null;
  }
  /** Recipe currently being prepared (null when everything is on the tray). */
  get currentRecipe(): Recipe | null {
    const o = this.order;
    if (!o) return null;
    const id = o.items[this.tray.length];
    return id ? getRecipe(id) : null;
  }
  get nextIngredient(): string | null {
    return this.currentRecipe?.steps[this.steps.length] ?? null;
  }
  get canServe(): boolean {
    const o = this.order;
    return !!o && matchesOrder(o.items, this.tray);
  }

  add(ingredient: string): StepResult {
    const r = this.currentRecipe;
    if (!r) {
      this.mistakes += 1;
      return 'oops';
    }
    const res = checkStep(r, this.steps, ingredient);
    if (res === 'oops') {
      this.mistakes += 1;
      return res;
    }
    this.steps.push(ingredient);
    if (res === 'done') {
      this.tray.push(r.id);
      this.steps = [];
    }
    return res;
  }

  /** Throw away the item being prepared and start it again (no penalty). */
  redo(): void {
    this.steps = [];
  }

  serve(elapsedMs: number): Payment | null {
    const o = this.order;
    if (!o || !this.canServe) return null;
    const pay = computePayment(o.items, elapsedMs, this.mistakes);
    this.summary.served += 1;
    this.summary.base += pay.base;
    this.summary.tips += pay.tip;
    this.summary.earned += pay.total;
    if (pay.perfect) this.summary.perfect += 1;
    this.index += 1;
    this.tray = [];
    this.steps = [];
    this.mistakes = 0;
    return pay;
  }
}
