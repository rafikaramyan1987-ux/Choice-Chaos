import { readJSON, removeKey, writeJSON } from './storage';
import { newProgress, type Progress } from '../core/game';
import { DECOR_BY_ID, MACHINES, MAX_EQUIPMENT_LEVEL, RECIPE_BY_ID, STARTER_RECIPES } from '../core/recipes';

export const SAVE_KEY = 'cozy-cafe.save.v1';

export interface SaveData {
  version: 1;
  progress: Progress;
  stats: { customers: number; perfect: number; days: number; earned: number };
  settings: { lang: string | null; muted: boolean; vibration: boolean };
  /** Day on which the rewarded "unlock now" was last used (once per day). */
  rewardUnlockDay: number;
  /** Actions whose first-time hint (hand animation) was already shown. */
  hints: string[];
}

export function emptySave(): SaveData {
  return {
    version: 1,
    progress: newProgress(),
    stats: { customers: 0, perfect: 0, days: 0, earned: 0 },
    settings: { lang: null, muted: false, vibration: true },
    rewardUnlockDay: 0,
    hints: [],
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
    progress: { day: num(p.day, 1, 1), coins: num(p.coins, 0), recipes: uniqueRecipes, equipment, decor },
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
    rewardUnlockDay: num(data.rewardUnlockDay, 0),
    hints: Array.isArray(data.hints) ? [...new Set(data.hints.filter((h): h is string => typeof h === 'string'))] : [],
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
