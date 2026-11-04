/**
 * Long-term progression and reward loop (pure, no DOM, unit tested):
 * player level & XP, missions, achievements, daily login calendar, gift box,
 * daily challenge, café expansions & staff, special customers and the sticker book.
 * Rewards are coins, gems and XP — gems are only earned by playing (no purchases).
 */
import { BASE_KINDS, grantRecipe, type CustomerKind, type GuestOptions, type Progress, type Special } from './game';
import { RECIPES, getRecipe, type Station } from './recipes';
import type { Rng } from './rng';

// ---------------------------------------------------------------- state

export interface Mission {
  id: string;
  kind: MissionKind;
  target: number;
  progress: number;
  /** For serve_recipe. */
  recipe?: string;
  reward: Reward;
}

export interface MetaState {
  level: number;
  /** XP inside the current level. */
  xp: number;
  missions: Mission[];
  /** Serial used for mission ids and difficulty. */
  missionSerial: number;
  perfectStreak: number;
  /** Coins earned during the current day (for "earn today" missions). */
  dayCoins: number;
  achievements: string[];
  stickers: Record<string, number>;
  stats: {
    served: number;
    perfect: number;
    missions: number;
    vip: number;
    critic: number;
    celebrity: number;
    challenges: number;
    built: number;
    bestLoginStreak: number;
  };
  login: { last: string | null; streak: number };
  /** Timestamp (ms) when the next free gift box is ready. */
  giftAt: number;
  /** Date of the last completed daily challenge. */
  challengeDate: string | null;
  /** Expansion id → timestamp (ms) when its construction is finished. */
  built: Record<string, number>;
  /** Finished constructions already celebrated. */
  announced: string[];
  /** Per-day caps for rewarded ads: date + counters. */
  ads: { date: string | null; redo: number; vip: number; unlock: number };
}

export function newMeta(): MetaState {
  const meta: MetaState = {
    level: 1,
    xp: 0,
    missions: [],
    missionSerial: 0,
    perfectStreak: 0,
    dayCoins: 0,
    achievements: [],
    stickers: {},
    stats: { served: 0, perfect: 0, missions: 0, vip: 0, critic: 0, celebrity: 0, challenges: 0, built: 0, bestLoginStreak: 0 },
    login: { last: null, streak: 0 },
    giftAt: 0,
    challengeDate: null,
    built: {},
    announced: [],
    ads: { date: null, redo: 0, vip: 0, unlock: 0 },
  };
  return meta;
}

// ---------------------------------------------------------------- rewards

export interface Reward {
  coins?: number;
  gems?: number;
  xp?: number;
}

export type RewardSource = 'mission' | 'level' | 'achievement' | 'login' | 'gift' | 'challenge' | 'sticker' | 'day' | 'build';

/** Something to celebrate in the UI (and to count in the balance simulation). */
export interface RewardEvent {
  source: RewardSource;
  id: string;
  reward: Reward;
  /** Unlocks that came with a level-up. */
  unlocks?: Unlock[];
}

export type Unlock =
  | { type: 'recipe'; id: string }
  | { type: 'customer'; id: CustomerKind | Special }
  | { type: 'area'; id: string };

/** Adds coins/gems to the wallet and XP (which may level up). Returns level-up events. */
export function grant(meta: MetaState, p: Progress, r: Reward): RewardEvent[] {
  p.coins += r.coins ?? 0;
  p.gems += r.gems ?? 0;
  return r.xp ? addXp(meta, p, r.xp) : [];
}

// ---------------------------------------------------------------- level & XP

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  const l = Math.max(1, level) - 1;
  return 40 + 25 * l + 2 * l * l;
}

export function orderXp(stars: number, items: number, special: Special | null): number {
  return 6 + 2 * stars + 2 * Math.max(0, items - 1) + (special ? 10 : 0);
}

/** Level of the first appearance of each customer type and special guest. */
export const CUSTOMER_LEVEL: Record<CustomerKind | Special, number> = {
  bear: 1,
  cat: 1,
  bunny: 1,
  buddy: 1,
  mouse: 1,
  vip: 3,
  fox: 3,
  critic: 5,
  panda: 5,
  frog: 8,
  celebrity: 9,
};

export function levelUnlocks(level: number): Unlock[] {
  const out: Unlock[] = [];
  for (const r of RECIPES) if (r.level === level && level > 1) out.push({ type: 'recipe', id: r.id });
  for (const [id, l] of Object.entries(CUSTOMER_LEVEL)) if (l === level && level > 1) out.push({ type: 'customer', id: id as CustomerKind | Special });
  for (const e of EXPANSIONS) if (e.level === level) out.push({ type: 'area', id: e.id });
  return out;
}

/** Reward chest of a level-up. */
export function levelChest(level: number): Reward {
  return { coins: 30 + level * 15, gems: 2 + (level % 5 === 0 ? 5 : 0) };
}

export function addXp(meta: MetaState, p: Progress, xp: number): RewardEvent[] {
  const events: RewardEvent[] = [];
  meta.xp += Math.max(0, Math.round(xp));
  while (meta.xp >= xpToNext(meta.level)) {
    meta.xp -= xpToNext(meta.level);
    meta.level += 1;
    const chest = levelChest(meta.level);
    p.coins += chest.coins ?? 0;
    p.gems += chest.gems ?? 0;
    const unlocks = levelUnlocks(meta.level);
    for (const u of unlocks) if (u.type === 'recipe') grantRecipe(p, u.id);
    events.push({ source: 'level', id: String(meta.level), reward: chest, unlocks });
  }
  return events;
}

/** Customer types and special-guest chances for the current level. */
export function guestOptions(meta: MetaState, first: Special | null = null): GuestOptions {
  const has = (id: CustomerKind | Special) => meta.level >= CUSTOMER_LEVEL[id];
  const kinds = [...BASE_KINDS, ...(['fox', 'panda', 'frog'] as CustomerKind[]).filter(has)];
  return {
    kinds,
    vip: has('vip') ? 0.09 : 0,
    critic: has('critic') ? 0.06 : 0,
    celebrity: has('celebrity') ? 0.025 : 0,
    first,
  };
}

// ---------------------------------------------------------------- stickers

/** Reward for a new sticker (first guest of a kind served). */
export const STICKER_REWARD: Reward = { coins: 15 };

export const STICKERS: Array<CustomerKind | Special> = ['bear', 'cat', 'bunny', 'buddy', 'mouse', 'fox', 'panda', 'frog', 'vip', 'critic', 'celebrity'];

// ---------------------------------------------------------------- missions

export type MissionKind = 'serve' | 'serve_recipe' | 'perfect' | 'perfect_streak' | 'earn_today' | 'vip' | 'combo' | 'stars' | 'large';

export interface ServedInfo {
  recipes: string[];
  sizes: Array<string | null>;
  stars: number;
  coins: number;
  special: Special | null;
  kind: CustomerKind;
}

function missionTarget(kind: MissionKind, tier: number, level: number): number {
  const t = Math.min(tier, 12);
  switch (kind) {
    case 'serve':
      return 3 + 2 * Math.min(t, 4);
    case 'serve_recipe':
      return 1 + Math.min(4, Math.floor(t / 2));
    case 'perfect':
      return 2 + Math.min(5, t);
    case 'perfect_streak':
      return 2 + Math.min(4, Math.floor(t / 2));
    case 'earn_today':
      return 30 + 10 * Math.min(t, 5) + 5 * level;
    case 'vip':
      return 1 + Math.min(2, Math.floor(t / 4));
    case 'combo':
      return 1 + Math.min(4, Math.floor(t / 2));
    case 'stars':
      return 8 + 3 * Math.min(t, 5);
    case 'large':
      return 1 + Math.min(3, Math.floor(t / 3));
  }
}

function missionReward(kind: MissionKind, target: number, tier: number): Reward {
  const hard = kind === 'perfect_streak' || kind === 'vip' || kind === 'earn_today';
  const size = kind === 'earn_today' ? 8 : Math.min(target, 12);
  return {
    coins: 15 + 4 * size + 4 * tier + (hard ? 15 : 0),
    xp: 12 + 2 * tier + (hard ? 8 : 0),
    gems: hard || tier % 3 === 2 ? 1 : 0,
  };
}

/** A new mission different from the active ones (by kind). */
export function newMission(meta: MetaState, p: Progress, rng: Rng): Mission {
  const active = new Set(meta.missions.map((m) => m.kind));
  const pool: MissionKind[] = ['serve', 'serve_recipe', 'perfect', 'stars', 'large'];
  if (meta.missionSerial >= 2) pool.push('perfect_streak', 'earn_today');
  if (meta.level >= 2) pool.push('combo');
  if (meta.level >= CUSTOMER_LEVEL.vip) pool.push('vip');
  // at most one "hard" mission at a time, so there is always something close to done
  const HARD: MissionKind[] = ['perfect_streak', 'earn_today', 'vip'];
  const hardActive = meta.missions.some((m) => HARD.includes(m.kind));
  const choices = pool.filter((k) => !active.has(k) && !(hardActive && HARD.includes(k)));
  const kind = (choices.length ? choices : pool)[Math.floor(rng() * (choices.length || pool.length))] as MissionKind;
  const tier = Math.min(5, Math.floor(meta.missionSerial / 5));
  const target = missionTarget(kind, tier, meta.level);
  meta.missionSerial += 1;
  const m: Mission = { id: `m${meta.missionSerial}`, kind, target, progress: 0, reward: missionReward(kind, target, tier) };
  if (kind === 'serve_recipe') {
    const owned = p.recipes.filter((id) => getRecipe(id));
    m.recipe = owned[Math.floor(rng() * owned.length)] ?? 'latte';
  }
  return m;
}

/** Keeps exactly 3 active missions. */
export function fillMissions(meta: MetaState, p: Progress, rng: Rng): void {
  while (meta.missions.length < 3) meta.missions.push(newMission(meta, p, rng));
}

/** Rerolls a mission for 1 gem. */
export const REROLL_GEMS = 1;
export function rerollMission(meta: MetaState, p: Progress, id: string, rng: Rng): boolean {
  const i = meta.missions.findIndex((m) => m.id === id);
  if (i < 0 || p.gems < REROLL_GEMS) return false;
  p.gems -= REROLL_GEMS;
  meta.missions.splice(i, 1);
  meta.missions.splice(i, 0, newMission(meta, p, rng));
  return true;
}

function missionStep(m: Mission, info: ServedInfo, meta: MetaState): number {
  switch (m.kind) {
    case 'serve':
      return m.progress + 1;
    case 'serve_recipe':
      return m.progress + info.recipes.filter((r) => r === m.recipe).length;
    case 'perfect':
      return m.progress + (info.stars === 3 ? 1 : 0);
    case 'perfect_streak':
      return Math.max(m.progress, meta.perfectStreak);
    case 'earn_today':
      return meta.dayCoins;
    case 'vip':
      return m.progress + (info.special ? 1 : 0);
    case 'combo':
      return m.progress + (info.recipes.length >= 2 ? 1 : 0);
    case 'stars':
      return m.progress + info.stars;
    case 'large':
      return m.progress + info.sizes.filter((s) => s === 'L').length;
  }
}

// ---------------------------------------------------------------- achievements

export interface Achievement {
  id: string;
  gems: number;
  /** Current value and goal. */
  value: (meta: MetaState, p: Progress) => number;
  goal: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'serve_10', gems: 2, goal: 10, value: (m) => m.stats.served },
  { id: 'serve_100', gems: 5, goal: 100, value: (m) => m.stats.served },
  { id: 'serve_500', gems: 15, goal: 500, value: (m) => m.stats.served },
  { id: 'perfect_25', gems: 3, goal: 25, value: (m) => m.stats.perfect },
  { id: 'perfect_100', gems: 10, goal: 100, value: (m) => m.stats.perfect },
  { id: 'missions_10', gems: 3, goal: 10, value: (m) => m.stats.missions },
  { id: 'missions_100', gems: 10, goal: 100, value: (m) => m.stats.missions },
  { id: 'level_5', gems: 3, goal: 5, value: (m) => m.level },
  { id: 'level_10', gems: 8, goal: 10, value: (m) => m.level },
  { id: 'all_recipes', gems: 10, goal: RECIPES.length, value: (_m, p) => p.recipes.length },
  { id: 'streak_7', gems: 10, goal: 7, value: (m) => m.stats.bestLoginStreak },
  { id: 'vip_5', gems: 3, goal: 5, value: (m) => m.stats.vip },
  { id: 'critic_3', gems: 4, goal: 3, value: (m) => m.stats.critic },
  { id: 'celebrity_1', gems: 5, goal: 1, value: (m) => m.stats.celebrity },
  { id: 'stickers_all', gems: 10, goal: STICKERS.length, value: (m) => STICKERS.filter((s) => (m.stickers[s] ?? 0) > 0).length },
  { id: 'build_1', gems: 3, goal: 1, value: (m) => m.stats.built },
  { id: 'build_6', gems: 10, goal: 6, value: (m) => m.stats.built },
  { id: 'challenge_1', gems: 3, goal: 1, value: (m) => m.stats.challenges },
  { id: 'challenge_7', gems: 8, goal: 7, value: (m) => m.stats.challenges },
];

/** Unlocks every achievement whose goal is reached (gems are added). */
export function checkAchievements(meta: MetaState, p: Progress): RewardEvent[] {
  const out: RewardEvent[] = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements.includes(a.id) || a.value(meta, p) < a.goal) continue;
    meta.achievements.push(a.id);
    p.gems += a.gems;
    out.push({ source: 'achievement', id: a.id, reward: { gems: a.gems } });
  }
  return out;
}

// ---------------------------------------------------------------- events

export function startDayMeta(meta: MetaState): void {
  meta.dayCoins = 0;
  for (const m of meta.missions) if (m.kind === 'earn_today') m.progress = 0;
}

/**
 * Everything that happens when an order is served: XP, missions (auto-completed and
 * replaced), stickers, stats and achievements. Coins of the order itself are already paid.
 */
export function onServed(meta: MetaState, p: Progress, info: ServedInfo, rng: Rng): RewardEvent[] {
  const events: RewardEvent[] = [];
  meta.dayCoins += info.coins;
  meta.stats.served += 1;
  if (info.stars === 3) {
    meta.stats.perfect += 1;
    meta.perfectStreak += 1;
  } else meta.perfectStreak = 0;
  if (info.special) meta.stats[info.special] += 1;
  for (const id of [info.kind, info.special]) {
    if (!id) continue;
    if (!meta.stickers[id]) {
      // first time this kind of guest is served: a new sticker for the book
      events.push({ source: 'sticker', id, reward: STICKER_REWARD });
      grant(meta, p, { coins: STICKER_REWARD.coins });
    }
    meta.stickers[id] = (meta.stickers[id] ?? 0) + 1;
  }

  events.push(...addXp(meta, p, orderXp(info.stars, info.recipes.length, info.special)));
  fillMissions(meta, p, rng);
  for (const m of [...meta.missions]) {
    m.progress = Math.min(m.target, missionStep(m, info, meta));
    if (m.progress >= m.target) {
      meta.missions.splice(meta.missions.indexOf(m), 1);
      meta.stats.missions += 1;
      events.push({ source: 'mission', id: m.id, reward: m.reward });
      events.push(...grant(meta, p, m.reward));
    }
  }
  fillMissions(meta, p, rng);
  events.push(...checkAchievements(meta, p));
  return events;
}

// ---------------------------------------------------------------- end of day

/** Small chest on the end-of-day summary: more for 3★ orders, a gem for a flawless day. */
export function dayChest(served: number, perfect: number): Reward {
  return { coins: 10 + 3 * perfect, gems: served > 0 && perfect === served ? 1 : 0, xp: 10 };
}

export function claimDayChest(meta: MetaState, p: Progress, day: number, served: number, perfect: number): RewardEvent[] {
  const reward = dayChest(served, perfect);
  return [{ source: 'day', id: String(day), reward }, ...grant(meta, p, reward)];
}

// ---------------------------------------------------------------- daily login

export const LOGIN_REWARDS: Reward[] = [
  { coins: 30 },
  { coins: 50 },
  { gems: 2 },
  { coins: 80 },
  { gems: 3 },
  { coins: 120 },
  { coins: 200, gems: 8 },
];

export function previousDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Local calendar date "YYYY-MM-DD". */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loginAvailable(meta: MetaState, today: string): boolean {
  return meta.login.last !== today;
}

/** Day (1..7) of the calendar that would be claimed today. */
export function loginDayIndex(meta: MetaState, today: string): number {
  const streak = meta.login.last === previousDate(today) ? meta.login.streak + 1 : meta.login.last === today ? meta.login.streak : 1;
  return ((streak - 1) % 7) + 1;
}

/** Claims today's login reward (× `multiplier` with the rewarded video). */
export function claimLogin(meta: MetaState, p: Progress, today: string, multiplier = 1): RewardEvent | null {
  if (!loginAvailable(meta, today)) return null;
  meta.login.streak = meta.login.last === previousDate(today) ? meta.login.streak + 1 : 1;
  meta.login.last = today;
  meta.stats.bestLoginStreak = Math.max(meta.stats.bestLoginStreak, meta.login.streak);
  const base = LOGIN_REWARDS[(meta.login.streak - 1) % 7] as Reward;
  const reward = { coins: (base.coins ?? 0) * multiplier, gems: (base.gems ?? 0) * multiplier };
  grant(meta, p, reward);
  return { source: 'login', id: String(((meta.login.streak - 1) % 7) + 1), reward };
}

// ---------------------------------------------------------------- gift box

export const GIFT_MS = 15 * 60 * 1000;

export function giftReady(meta: MetaState, now: number): boolean {
  return now >= meta.giftAt;
}

export function giftReward(level: number, rng: Rng): Reward {
  return { coins: 20 + level * 6, gems: rng() < 0.3 ? 1 : 0 };
}

export function claimGift(meta: MetaState, p: Progress, now: number, rng: Rng, multiplier = 1): RewardEvent | null {
  if (!giftReady(meta, now)) return null;
  const r = giftReward(meta.level, rng);
  const reward = { coins: (r.coins ?? 0) * multiplier, gems: (r.gems ?? 0) * multiplier };
  meta.giftAt = now + GIFT_MS;
  grant(meta, p, reward);
  return { source: 'gift', id: 'box', reward };
}

// ---------------------------------------------------------------- daily challenge

export const CHALLENGE_GUESTS = 8;
/** Stars needed (out of 24) to win the daily challenge. */
export const CHALLENGE_STARS = 18;
export const CHALLENGE_REWARD: Reward = { coins: 120, gems: 4, xp: 40 };

export function challengeAvailable(meta: MetaState, today: string): boolean {
  return meta.challengeDate !== today;
}

/** Same seed for everyone on the same date. */
export function challengeSeed(today: string): number {
  return Number(today.replace(/-/g, '')) * 7919;
}

export function finishChallenge(meta: MetaState, p: Progress, today: string, stars: number): RewardEvent[] {
  if (!challengeAvailable(meta, today) || stars < CHALLENGE_STARS) return [];
  meta.challengeDate = today;
  meta.stats.challenges += 1;
  const events: RewardEvent[] = [{ source: 'challenge', id: today, reward: CHALLENGE_REWARD }];
  events.push(...grant(meta, p, CHALLENGE_REWARD));
  events.push(...checkAchievements(meta, p));
  return events;
}

// ---------------------------------------------------------------- café expansion

export interface Expansion {
  id: string;
  /** Player level that makes it available. */
  level: number;
  coins: number;
  gems: number;
  /** Construction time in minutes (real time, also while the game is closed). */
  minutes: number;
  requires?: string;
  /** Extra guests per day. */
  guests?: number;
  /** Extra share of tips. */
  tip?: number;
  /** +1 coin per item of these stations. */
  stations?: Station[];
  /** Staff helper: auto-makes these simple recipes. */
  staff?: string[];
  theme?: 'winter';
}

export const EXPANSIONS: Expansion[] = [
  { id: 'tables1', level: 4, coins: 150, gems: 0, minutes: 2, guests: 1 },
  { id: 'terrace', level: 6, coins: 450, gems: 0, minutes: 5, tip: 0.15 },
  { id: 'tables2', level: 6, coins: 350, gems: 0, minutes: 4, guests: 1, requires: 'tables1' },
  { id: 'bakery', level: 7, coins: 600, gems: 0, minutes: 8, stations: ['pastry', 'grill'] },
  { id: 'counter2', level: 8, coins: 900, gems: 0, minutes: 10 },
  { id: 'barista', level: 8, coins: 400, gems: 6, minutes: 0, requires: 'counter2', staff: ['coffee', 'juice'] },
  { id: 'baker', level: 9, coins: 500, gems: 8, minutes: 0, requires: 'counter2', staff: ['croissant', 'toastie'] },
  { id: 'icebar', level: 10, coins: 1400, gems: 0, minutes: 15, stations: ['icecream', 'cold'] },
  { id: 'tables3', level: 10, coins: 1200, gems: 0, minutes: 12, guests: 1, requires: 'tables2' },
  { id: 'winter', level: 11, coins: 0, gems: 25, minutes: 0, theme: 'winter' },
  { id: 'lounge', level: 13, coins: 3500, gems: 10, minutes: 30, guests: 1, tip: 0.1 },
];
export const EXPANSION_BY_ID: Record<string, Expansion> = Object.fromEntries(EXPANSIONS.map((e) => [e.id, e]));

export type ExpansionStatus = 'built' | 'building' | 'buyable' | 'short' | 'locked';

export function isBuilt(meta: MetaState, id: string, now: number): boolean {
  const at = meta.built[id];
  return at !== undefined && now >= at;
}

export function expansionStatus(meta: MetaState, p: Progress, id: string, now: number): ExpansionStatus {
  const e = EXPANSION_BY_ID[id];
  if (!e) return 'locked';
  if (meta.built[id] !== undefined) return isBuilt(meta, id, now) ? 'built' : 'building';
  if (meta.level < e.level || (e.requires && !isBuilt(meta, e.requires, now))) return 'locked';
  return p.coins >= e.coins && p.gems >= e.gems ? 'buyable' : 'short';
}

export function startBuild(meta: MetaState, p: Progress, id: string, now: number): boolean {
  const e = EXPANSION_BY_ID[id];
  if (!e || expansionStatus(meta, p, id, now) !== 'buyable') return false;
  p.coins -= e.coins;
  p.gems -= e.gems;
  meta.built[id] = now + e.minutes * 60_000;
  return true;
}

/** Gems to finish a construction now: 1 gem per 3 minutes left. */
export function skipCost(meta: MetaState, id: string, now: number): number {
  const at = meta.built[id];
  if (at === undefined || now >= at) return 0;
  return Math.max(1, Math.ceil((at - now) / 180_000));
}

/** Finishes a construction now (rewarded video, or gems when `payGems`). */
export function finishBuild(meta: MetaState, p: Progress, id: string, now: number, payGems: boolean): boolean {
  const at = meta.built[id];
  if (at === undefined || now >= at) return false;
  if (payGems) {
    const cost = skipCost(meta, id, now);
    if (p.gems < cost) return false;
    p.gems -= cost;
  }
  meta.built[id] = now;
  return true;
}

/** Announces constructions that just finished (+ achievements). Call on the hub and after each order. */
export function settleBuilds(meta: MetaState, p: Progress, now: number): RewardEvent[] {
  const events: RewardEvent[] = [];
  for (const e of EXPANSIONS) {
    if (isBuilt(meta, e.id, now) && !meta.announced.includes(e.id)) {
      meta.announced.push(e.id);
      meta.stats.built = meta.announced.length;
      events.push({ source: 'build', id: e.id, reward: { xp: BUILD_XP } }, ...addXp(meta, p, BUILD_XP));
    }
  }
  return [...events, ...checkAchievements(meta, p)];
}

export const BUILD_XP = 20;

export interface CafeEffects {
  extraGuests: number;
  tipBonus: number;
  bonusStations: Station[];
  staff: string[];
  winter: boolean;
  built: string[];
}

export function cafeEffects(meta: MetaState, now: number): CafeEffects {
  const fx: CafeEffects = { extraGuests: 0, tipBonus: 0, bonusStations: [], staff: [], winter: false, built: [] };
  for (const e of EXPANSIONS) {
    if (!isBuilt(meta, e.id, now)) continue;
    fx.built.push(e.id);
    fx.extraGuests += e.guests ?? 0;
    fx.tipBonus += e.tip ?? 0;
    fx.bonusStations.push(...(e.stations ?? []));
    fx.staff.push(...(e.staff ?? []));
    if (e.theme === 'winter') fx.winter = true;
  }
  return fx;
}

// ---------------------------------------------------------------- rewarded ad caps

export const AD_CAPS = { redo: 3, vip: 1, unlock: 1 } as const;

/** Uses one rewarded ad of `kind` today; false when the daily cap is reached. */
export function canUseAd(meta: MetaState, kind: keyof typeof AD_CAPS, today: string): boolean {
  if (meta.ads.date !== today) meta.ads = { date: today, redo: 0, vip: 0, unlock: 0 };
  return meta.ads[kind] < AD_CAPS[kind];
}

export function useAd(meta: MetaState, kind: keyof typeof AD_CAPS, today: string): void {
  if (canUseAd(meta, kind, today)) meta.ads[kind] += 1;
}

/** The next fancy recipe (lowest level) not owned yet. */
export function nextLockedRecipe(p: Progress): string | null {
  const r = RECIPES.filter((x) => x.level > 1 && !p.recipes.includes(x.id)).sort((a, b) => a.level - b.level)[0];
  return r?.id ?? null;
}
