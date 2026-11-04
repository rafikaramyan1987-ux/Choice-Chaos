/**
 * Pure game rules (no DOM): order generation, step validation, quality → stars →
 * coins, unlocks and the per-day state machine. Everything here is unit tested.
 */
import {
  DECOR_BY_ID,
  EQUIPMENT_COSTS,
  MACHINES,
  MAX_EQUIPMENT_LEVEL,
  RECIPES,
  RECIPE_BY_ID,
  recipeGemCost,
  SIZES,
  SIZE_PRICE,
  SIZE_TARGET,
  STARTER_RECIPES,
  actionOf,
  getRecipe,
  type Machine,
  type Size,
} from './recipes';
import type { Rng } from './rng';

// ---------------------------------------------------------------- orders

export interface OrderItem {
  recipe: string;
  size: Size | null;
  /** Exact steps for this item (optional steps already chosen). */
  steps: string[];
  /** Centre of the green zone (0..1) for each step; 0 for tap steps. */
  targets: number[];
}

export type CustomerKind = 'bear' | 'cat' | 'bunny' | 'buddy' | 'mouse' | 'fox' | 'panda' | 'frog';
export type Special = 'vip' | 'critic' | 'celebrity';
export const BASE_KINDS: CustomerKind[] = ['bear', 'cat', 'bunny', 'buddy', 'mouse'];

export interface Order {
  items: OrderItem[];
  /** Seed for the customer's colours and accessories. */
  look: number;
  kind: CustomerKind;
  special: Special | null;
}

/** Who may come in today (depends on the player level). */
export interface GuestOptions {
  kinds: CustomerKind[];
  /** Chance (0..1) per guest of each special customer. */
  vip: number;
  critic: number;
  celebrity: number;
  /** Force the first guest of the day to be this special customer ("Call a VIP" reward). */
  first?: Special | null;
}

export const DEFAULT_GUESTS: GuestOptions = { kinds: BASE_KINDS, vip: 0, critic: 0, celebrity: 0 };

function pickGuest(rng: Rng, g: GuestOptions, forced: Special | null | undefined): { kind: CustomerKind; special: Special | null } {
  const kind = g.kinds[Math.floor(rng() * g.kinds.length)] ?? 'bear';
  if (forced) return { kind, special: forced };
  const roll = rng();
  if (roll < g.celebrity) return { kind, special: 'celebrity' };
  if (roll < g.celebrity + g.critic) return { kind, special: 'critic' };
  if (roll < g.celebrity + g.critic + g.vip) return { kind, special: 'vip' };
  return { kind, special: null };
}

const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Builds one item with random variations (size, with/without extras, target amounts). */
export function makeItem(recipeId: string, rng: Rng): OrderItem {
  const rec = getRecipe(recipeId);
  const size = rec.sized ? (SIZES[Math.floor(rng() * SIZES.length)] as Size) : null;
  const steps = rec.steps.filter((s) => !rec.optional.includes(s) || rng() < 0.5);
  const targets = steps.map((s) => {
    const a = actionOf(s);
    if (a === 'tap') return 0;
    if (a === 'pour' && size) return round2(SIZE_TARGET[size] + between(rng, -0.03, 0.03));
    if (a === 'pour') return round2(between(rng, 0.45, 0.68));
    if (a === 'topping') return round2(between(rng, 0.38, 0.68));
    return round2(between(rng, 0.55, 0.68)); // timing
  });
  return { recipe: recipeId, size, steps, targets };
}

/** Two orders are "the same" when they ask for the same items (targets ignored). */
export function orderSignature(o: Pick<Order, 'items'>): string {
  return o.items
    .map((i) => `${i.recipe}|${i.size ?? '-'}|${i.steps.join(',')}`)
    .sort()
    .join(' + ');
}

/** 6 guests on day 1, up to 10; café tables add more. */
export function customersForDay(day: number, extra = 0): number {
  return Math.min(10, 5 + Math.max(1, Math.floor(day))) + Math.max(0, extra);
}

export function comboChance(day: number): number {
  return day <= 1 ? 0.1 : Math.min(0.45, 0.1 * day);
}

export function tripleChance(day: number): number {
  return day < 5 ? 0 : Math.min(0.2, 0.05 * (day - 4));
}

/**
 * One random order from the owned menu. Never identical to `previous`
 * (signature), and a freshly bought fancy recipe can be requested via `prefer`.
 */
export function generateOrder(
  day: number,
  owned: readonly string[],
  rng: Rng,
  previous: string | null = null,
  opts: { single?: boolean; prefer?: string; guests?: GuestOptions; forced?: Special | null } = {},
): Order {
  const menu = owned.filter((id) => RECIPE_BY_ID[id]);
  if (menu.length === 0) menu.push(...STARTER_RECIPES);
  const look = Math.floor(rng() * 0xffffffff);
  const guest = pickGuest(rng, opts.guests ?? DEFAULT_GUESTS, opts.forced);
  for (let attempt = 0; attempt < 30; attempt++) {
    let size = 1;
    if (!opts.single && menu.length > 1) {
      const roll = rng();
      if (roll < tripleChance(day) && menu.length > 2) size = 3;
      else if (roll < comboChance(day)) size = 2;
    }
    const pool = [...menu];
    const ids: string[] = [];
    if (opts.prefer && pool.includes(opts.prefer)) {
      ids.push(opts.prefer);
      pool.splice(pool.indexOf(opts.prefer), 1);
    }
    while (ids.length < size && pool.length) ids.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as string);
    const order: Order = { items: ids.map((id) => makeItem(id, rng)), look, ...guest };
    if (orderSignature(order) !== previous) return order;
  }
  // practically unreachable: change the first item's recipe or size to make it different
  const fallback: Order = { items: [makeItem(menu[0] as string, rng)], look, ...guest };
  const first = fallback.items[0] as OrderItem;
  if (orderSignature(fallback) === previous) {
    const other = menu.find((id) => id !== first.recipe);
    if (other) fallback.items[0] = makeItem(other, rng);
    else if (first.size) first.size = first.size === 'S' ? 'L' : 'S';
  }
  return fallback;
}

/** Generates the orders of one day; never the same order twice in a row. */
export function generateDay(day: number, owned: readonly string[], rng: Rng, prefer?: string, guests: GuestOptions = DEFAULT_GUESTS, extra = 0): Order[] {
  const orders: Order[] = [];
  let prev: string | null = null;
  for (let i = 0; i < customersForDay(day, extra); i++) {
    const o = generateOrder(day, owned, rng, prev, { single: i < 2, prefer: i === 0 ? prefer : undefined, guests, forced: i === 0 ? guests.first : null });
    orders.push(o);
    prev = orderSignature(o);
  }
  return orders;
}

export function itemPrice(item: OrderItem): number {
  const base = getRecipe(item.recipe).price;
  return Math.max(1, Math.round(base * (item.size ? SIZE_PRICE[item.size] : 1)));
}

// ---------------------------------------------------------------- validation

export type StepResult = 'next' | 'done' | 'oops';

/** Checks adding `ingredient` to an item whose steps are `steps`, `done` already added. */
export function checkStep(steps: readonly string[], done: readonly string[], ingredient: string): StepResult {
  if (done.length >= steps.length) return 'oops';
  for (let i = 0; i < done.length; i++) if (done[i] !== steps[i]) return 'oops';
  if (steps[done.length] !== ingredient) return 'oops';
  return done.length + 1 === steps.length ? 'done' : 'next';
}

// ---------------------------------------------------------------- quality

export type Quality = 1 | 2 | 3;

/** Distance outside the green zone that still counts as "OK". */
export const OK_MARGIN = 0.12;

/** Green zone width: wide at the start, slowly a bit smaller (never tiny). */
export function zoneWidth(day: number): number {
  return round2(Math.max(0.2, 0.34 - 0.01 * (Math.max(1, day) - 1)));
}

/** 3 = released inside the green zone, 2 = a bit outside, 1 = far outside. */
export function judge(level: number, center: number, width: number): Quality {
  const d = Math.abs(level - center);
  if (d <= width / 2 + 1e-9) return 3;
  if (d <= width / 2 + OK_MARGIN) return 2;
  return 1;
}

/** Stars of an order from the qualities of its pour/topping/timing steps. */
export function starsFor(qualities: readonly number[]): Quality {
  if (qualities.length === 0) return 3;
  const avg = qualities.reduce((a, b) => a + b, 0) / qualities.length;
  if (avg >= 2.5) return 3;
  if (avg >= 1.75) return 2;
  return 1;
}

/** Share of the price paid for each star rating. */
export const STAR_PAY: Record<Quality, number> = { 3: 1, 2: 0.7, 1: 0.4 };

// ---------------------------------------------------------------- coins & tips

export const STEP_PAR_MS = 2200;
export const ORDER_PAR_BASE_MS = 3000;

export function parTimeMs(items: readonly OrderItem[]): number {
  return ORDER_PAR_BASE_MS + items.reduce((n, i) => n + i.steps.length, 0) * STEP_PAR_MS;
}

export interface Payment {
  /** Full menu price. */
  base: number;
  /** Paid for the food (base × star share, + café bonuses). */
  paid: number;
  /** Tip (3★ orders; VIPs also tip on 2★). */
  tip: number;
  total: number;
  /** Gems from critics and celebrities. */
  gems: number;
  stars: Quality;
  perfect: boolean;
}

/** Café bonuses and the kind of guest that changes the payment. */
export interface PayMods {
  special?: Special | null;
  /** Extra share of the tip (terrace…), e.g. 0.15. */
  tipBonus?: number;
  /** +1 coin for items of these stations (bakery corner, ice-cream bar). */
  bonusStations?: readonly string[];
}

export const SPECIAL_RULES = {
  /** VIP: double tip, and a tip even on 2★. */
  vip: { tip: 2 },
  /** Critic: triple tip and a gem for a 3★ order. */
  critic: { tip: 3, gems: 1 },
  /** Celebrity: everything doubled + 2 gems. */
  celebrity: { total: 2, gems: 2 },
} as const;

export function computePayment(items: readonly OrderItem[], qualities: readonly number[], elapsedMs: number, mistakes: number, mods: PayMods = {}): Payment {
  const base = items.reduce((n, i) => n + itemPrice(i), 0);
  const stars = starsFor(qualities);
  const bonus = items.filter((i) => mods.bonusStations?.includes(getRecipe(i.recipe).station)).length;
  let paid = Math.max(1, Math.round(base * STAR_PAY[stars])) + bonus;
  let tip = 0;
  let gems = 0;
  const special = mods.special ?? null;
  const tipRate = (speed: number, accuracy: number) => 0.1 + 0.25 * speed + 0.15 * accuracy;
  if (stars === 3 || (stars === 2 && special === 'vip')) {
    const par = parTimeMs(items);
    const speed = Math.max(0, Math.min(1, (3 * par - Math.max(0, elapsedMs)) / (2 * par)));
    const accuracy = mistakes <= 0 ? 1 : mistakes === 1 ? 0.5 : 0;
    tip = Math.max(1, Math.round(base * tipRate(speed, accuracy) * (stars === 3 ? 1 : 0.5)));
    if (special === 'vip') tip *= SPECIAL_RULES.vip.tip;
    if (special === 'critic' && stars === 3) {
      tip *= SPECIAL_RULES.critic.tip;
      gems += SPECIAL_RULES.critic.gems;
    }
    tip = Math.round(tip * (1 + (mods.tipBonus ?? 0)));
  }
  if (special === 'celebrity') {
    paid *= SPECIAL_RULES.celebrity.total;
    tip *= SPECIAL_RULES.celebrity.total;
    gems += SPECIAL_RULES.celebrity.gems;
  }
  return { base, paid, tip, total: paid + tip, gems, stars, perfect: stars === 3 && mistakes <= 0 && qualities.every((q) => q === 3) };
}

// ---------------------------------------------------------------- progress & unlocks

export interface Progress {
  /** Next day to play (1-based). */
  day: number;
  coins: number;
  /** Second currency: premium decor, themes, staff, skips. Earned only by playing (no purchases). */
  gems: number;
  /** Owned recipes; fancy ones appended in unlock order. */
  recipes: string[];
  equipment: Record<Machine, number>;
  decor: string[];
}

export function newProgress(): Progress {
  return { day: 1, coins: 0, gems: 0, recipes: [...STARTER_RECIPES], equipment: { coffee: 0, oven: 0, blender: 0 }, decor: [] };
}

export type RecipeStatus = 'owned' | 'locked';

export function recipeStatus(p: Progress, id: string): RecipeStatus {
  return p.recipes.includes(id) ? 'owned' : 'locked';
}

/** Unlock a fancy recipe before its level with gems. */
export function buyRecipeWithGems(p: Progress, id: string): boolean {
  if (!RECIPE_BY_ID[id] || p.recipes.includes(id)) return false;
  const cost = recipeGemCost(id);
  if (p.gems < cost) return false;
  p.gems -= cost;
  p.recipes.push(id);
  return true;
}

/** Level-up or rewarded-ad unlock of a fancy recipe (free). */
export function grantRecipe(p: Progress, id: string): boolean {
  if (!RECIPE_BY_ID[id] || p.recipes.includes(id)) return false;
  p.recipes.push(id);
  return true;
}

export function equipmentCost(p: Progress, m: Machine): number | null {
  const lvl = p.equipment[m];
  if (lvl >= MAX_EQUIPMENT_LEVEL) return null;
  return EQUIPMENT_COSTS[m][lvl] ?? null;
}

const MACHINE_STEPS: Record<string, Machine> = { coffee: 'coffee', toast: 'oven', cook: 'oven', warm: 'oven', blend: 'blender' };
export function machineOf(ingredient: string): Machine | undefined {
  return MACHINE_STEPS[ingredient];
}

/** A machine is only useful once a recipe needs it. */
export function machineNeeded(p: Progress, m: Machine): boolean {
  return p.recipes.some((id) => getRecipe(id).steps.some((s) => machineOf(s) === m));
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
  if (!d || p.decor.includes(id) || p.coins < d.cost || p.gems < (d.gems ?? 0)) return false;
  p.coins -= d.cost;
  p.gems -= d.gems ?? 0;
  p.decor.push(id);
  return true;
}

export function isMachine(m: string): m is Machine {
  return (MACHINES as string[]).includes(m);
}

export function fancyRecipes(): string[] {
  return RECIPES.filter((x) => x.level > 1).map((x) => x.id);
}

// ---------------------------------------------------------------- one day of service

export interface DaySummary {
  day: number;
  served: number;
  base: number;
  tips: number;
  earned: number;
  /** Orders with 3 stars. */
  perfect: number;
  stars: number;
  gems: number;
}

export interface Prepared {
  item: OrderItem;
  /** Amount (0..1) of every step, for drawing. */
  amounts: number[];
}

/** State of the current day: which customer, which item, prepared steps. */
export class DayRun {
  readonly orders: Order[];
  index = 0;
  /** Steps added to the item being prepared. */
  steps: string[] = [];
  amounts: number[] = [];
  /** Finished items waiting to be served. */
  tray: Prepared[] = [];
  /** Quality of every scored step of the current order. */
  qualities: Quality[] = [];
  mistakes = 0;
  readonly summary: DaySummary;

  constructor(
    readonly day: number,
    owned: readonly string[],
    rng: Rng,
    prefer?: string,
    guests: GuestOptions = DEFAULT_GUESTS,
    extraGuests = 0,
    count?: number,
  ) {
    const extra = count ? Math.max(extraGuests, count - customersForDay(day)) : extraGuests;
    const all = generateDay(day, owned, rng, prefer, guests, extra);
    this.orders = count ? all.slice(0, count) : all;
    this.summary = { day, served: 0, base: 0, tips: 0, earned: 0, perfect: 0, stars: 0, gems: 0 };
  }

  /** A staff helper prepares the current item perfectly. */
  autoComplete(): boolean {
    const item = this.currentItem;
    if (!item) return false;
    for (const s of item.steps.slice(this.steps.length)) this.add(s, 3, item.targets[item.steps.indexOf(s)] || 1);
    return true;
  }

  get finished(): boolean {
    return this.index >= this.orders.length;
  }
  get order(): Order | null {
    return this.orders[this.index] ?? null;
  }
  /** Item currently being prepared (null when everything is on the tray). */
  get currentItem(): OrderItem | null {
    return this.order?.items[this.tray.length] ?? null;
  }
  get nextIngredient(): string | null {
    return this.currentItem?.steps[this.steps.length] ?? null;
  }
  /** Green zone centre for the next step. */
  get nextTarget(): number {
    return this.currentItem?.targets[this.steps.length] ?? 0.5;
  }
  get canServe(): boolean {
    const o = this.order;
    return !!o && this.tray.length === o.items.length;
  }

  /** Adds an ingredient. `quality` is used for pour/topping/timing steps. */
  add(ingredient: string, quality: Quality = 3, amount = 1): StepResult {
    const item = this.currentItem;
    if (!item) {
      this.mistakes += 1;
      return 'oops';
    }
    const res = checkStep(item.steps, this.steps, ingredient);
    if (res === 'oops') {
      this.mistakes += 1;
      return res;
    }
    this.steps.push(ingredient);
    this.amounts.push(amount);
    if (actionOf(ingredient) !== 'tap') this.qualities.push(quality);
    if (res === 'done') {
      this.tray.push({ item, amounts: this.amounts });
      this.steps = [];
      this.amounts = [];
    }
    return res;
  }

  /** Rewarded "redo for 3 stars": upgrades the last served order's payment. Returns the extra coins/gems. */
  static upgradeTo3(pay: Payment, items: readonly OrderItem[], mods: PayMods = {}): Payment {
    const best = computePayment(items, items.flatMap(() => [3]), 0, 0, mods);
    return { ...best, paid: Math.max(0, best.paid - pay.paid), tip: Math.max(0, best.tip - pay.tip), total: Math.max(0, best.total - pay.total), gems: Math.max(0, best.gems - pay.gems) };
  }

  /** Throw away the item being prepared and start it again (no penalty). */
  redo(): void {
    if (this.steps.length === 0) return;
    const scored = this.steps.filter((s) => actionOf(s) !== 'tap').length;
    this.qualities.splice(this.qualities.length - scored, scored);
    this.steps = [];
    this.amounts = [];
  }

  serve(elapsedMs: number, mods: PayMods = {}): Payment | null {
    const o = this.order;
    if (!o || !this.canServe) return null;
    const pay = computePayment(o.items, this.qualities, elapsedMs, this.mistakes, { ...mods, special: o.special });
    this.summary.served += 1;
    this.summary.base += pay.paid;
    this.summary.tips += pay.tip;
    this.summary.earned += pay.total;
    this.summary.stars += pay.stars;
    this.summary.gems += pay.gems;
    if (pay.stars === 3) this.summary.perfect += 1;
    this.index += 1;
    this.tray = [];
    this.steps = [];
    this.amounts = [];
    this.qualities = [];
    this.mistakes = 0;
    return pay;
  }
}
