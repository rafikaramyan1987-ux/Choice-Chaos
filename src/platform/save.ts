import { readJSON, removeKey, writeJSON } from './storage';
import { newProgress, type Progress } from '../core/game';
import { EXPANSION_BY_ID, STICKERS, ACHIEVEMENTS, newMeta, type MetaState, type Mission } from '../core/meta';
import { DECOR_BY_ID, MACHINES, MAX_EQUIPMENT_LEVEL, RECIPE_BY_ID, STARTER_RECIPES } from '../core/recipes';

export const SAVE_KEY = 'cozy-cafe.save.v1';

export interface SaveData {
  version: 1;
  progress: Progress;
  stats: { customers: number; perfect: number; days: number; earned: number };
  settings: { lang: string | null; muted: boolean; vibration: boolean };
  /** Actions whose first-time hint (hand animation) was already shown. */
  hints: string[];
  /** Level, missions, achievements, daily rewards, expansions… */
  meta: MetaState;
}

export function emptySave(): SaveData {
  return {
    version: 1,
    progress: newProgress(),
    stats: { customers: 0, perfect: 0, days: 0, earned: 0 },
    settings: { lang: null, muted: false, vibration: true },
    hints: [],
    meta: newMeta(),
  };
}

const num = (v: unknown, fallback: number, min = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : fallback;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Turns anything read from storage into a valid save (unknown ids dropped, numbers clamped). */
export function sanitizeSave(raw: unknown): SaveData {
  const base = emptySave();
  const data = obj(raw);
  if (data.version !== 1) return base;
  const p = obj(data.progress);
  const recipes = Array.isArray(p.recipes) ? p.recipes.filter((id): id is string => typeof id === 'string' && !!RECIPE_BY_ID[id]) : [];
  const uniqueRecipes = [...new Set([...STARTER_RECIPES, ...recipes])];
  const eq = obj(p.equipment);
  const equipment = { ...base.progress.equipment };
  for (const m of MACHINES) equipment[m] = Math.min(MAX_EQUIPMENT_LEVEL, num(eq[m], 0));
  const decor = Array.isArray(p.decor) ? [...new Set(p.decor.filter((id): id is string => typeof id === 'string' && !!DECOR_BY_ID[id]))] : [];
  const st = obj(data.stats);
  const se = obj(data.settings);
  return {
    version: 1,
    progress: { day: num(p.day, 1, 1), coins: num(p.coins, 0), gems: num(p.gems, 0), recipes: uniqueRecipes, equipment, decor },
    stats: {
      customers: num(st.customers, 0),
      perfect: num(st.perfect, 0),
      days: num(st.days, 0),
      earned: num(st.earned, 0),
    },
    settings: {
      lang: typeof se.lang === 'string' ? se.lang : null,
      muted: se.muted === true,
      vibration: se.vibration !== false,
    },
    hints: Array.isArray(data.hints) ? [...new Set(data.hints.filter((h): h is string => typeof h === 'string'))] : [],
    meta: sanitizeMeta(data.meta),
  };
}

const MISSION_KINDS = ['serve', 'serve_recipe', 'perfect', 'perfect_streak', 'earn_today', 'vip', 'combo', 'stars', 'large'];
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function sanitizeMeta(raw: unknown): MetaState {
  const base = newMeta();
  const m = obj(raw);
  const st = obj(m.stats);
  const stats = { ...base.stats };
  for (const k of Object.keys(stats) as Array<keyof typeof stats>) stats[k] = num(st[k], 0);
  const missions: Mission[] = Array.isArray(m.missions)
    ? m.missions
        .map(obj)
        .filter((x) => typeof x.id === 'string' && MISSION_KINDS.includes(String(x.kind)) && num(x.target, 0) > 0)
        .slice(0, 3)
        .map((x) => {
          const r = obj(x.reward);
          const mission: Mission = {
            id: String(x.id),
            kind: x.kind as Mission['kind'],
            target: num(x.target, 1, 1),
            progress: num(x.progress, 0),
            reward: { coins: num(r.coins, 0), gems: num(r.gems, 0), xp: num(r.xp, 0) },
          };
          if (typeof x.recipe === 'string' && RECIPE_BY_ID[x.recipe]) mission.recipe = x.recipe;
          return mission;
        })
    : [];
  const stickers: Record<string, number> = {};
  const sk = obj(m.stickers);
  for (const k of STICKERS) if (num(sk[k], 0) > 0) stickers[k] = num(sk[k], 0);
  const built: Record<string, number> = {};
  const b = obj(m.built);
  for (const [k, v] of Object.entries(b)) if (EXPANSION_BY_ID[k] && typeof v === 'number' && Number.isFinite(v)) built[k] = v;
  const login = obj(m.login);
  const ads = obj(m.ads);
  return {
    level: num(m.level, 1, 1),
    xp: num(m.xp, 0),
    missions,
    missionSerial: num(m.missionSerial, 0),
    perfectStreak: num(m.perfectStreak, 0),
    dayCoins: num(m.dayCoins, 0),
    achievements: Array.isArray(m.achievements) ? [...new Set(m.achievements.filter((a): a is string => typeof a === 'string' && ACHIEVEMENTS.some((x) => x.id === a)))] : [],
    stickers,
    stats,
    login: { last: str(login.last), streak: num(login.streak, 0) },
    giftAt: num(m.giftAt, 0),
    challengeDate: str(m.challengeDate),
    built,
    announced: Array.isArray(m.announced) ? [...new Set(m.announced.filter((a): a is string => typeof a === 'string' && !!EXPANSION_BY_ID[a]))] : [],
    ads: { date: str(ads.date), redo: num(ads.redo, 0), vip: num(ads.vip, 0), unlock: num(ads.unlock, 0) },
  };
}

export function loadSave(): SaveData {
  return sanitizeSave(readJSON<unknown>(SAVE_KEY, null));
}

export function persist(save: SaveData): void {
  writeJSON(SAVE_KEY, save);
}

/** Wipes progress but keeps settings. */
export function resetProgress(save: SaveData): SaveData {
  removeKey(SAVE_KEY);
  const fresh = emptySave();
  fresh.settings = { ...save.settings };
  persist(fresh);
  return fresh;
}
