import { readJSON, removeKey, writeJSON } from './storage';

const KEY = 'choice-chaos.save.v1';

export interface SaveData {
  version: 1;
  endings: Record<string, { count: number; first: string }>;
  stats: {
    runs: number;
    bestTurns: number;
    bestTimeMs: number;
    totalChoices: number;
  };
  daily: { lastDate: string | null; streak: number; lastChoice: number | null };
  settings: { lang: string | null; muted: boolean };
}

export function emptySave(): SaveData {
  return {
    version: 1,
    endings: {},
    stats: { runs: 0, bestTurns: 0, bestTimeMs: 0, totalChoices: 0 },
    daily: { lastDate: null, streak: 0, lastChoice: null },
    settings: { lang: null, muted: false },
  };
}

export function loadSave(): SaveData {
  const base = emptySave();
  const data = readJSON<Partial<SaveData>>(KEY, {});
  if (!data || typeof data !== 'object') return base;
  return {
    version: 1,
    endings: { ...base.endings, ...(data.endings ?? {}) },
    stats: { ...base.stats, ...(data.stats ?? {}) },
    daily: { ...base.daily, ...(data.daily ?? {}) },
    settings: { ...base.settings, ...(data.settings ?? {}) },
  };
}

export function persist(save: SaveData): void {
  writeJSON(KEY, save);
}

export function resetProgress(save: SaveData): SaveData {
  removeKey(KEY);
  const fresh = emptySave();
  fresh.settings = save.settings;
  persist(fresh);
  return fresh;
}

/** Records a finished run. Returns true when the ending is new. */
export function recordRun(save: SaveData, ending: string, turns: number, timeMs: number, today: string): boolean {
  const isNew = !save.endings[ending];
  const entry = save.endings[ending] ?? { count: 0, first: today };
  entry.count += 1;
  save.endings[ending] = entry;
  save.stats.runs += 1;
  save.stats.totalChoices += turns;
  save.stats.bestTurns = Math.max(save.stats.bestTurns, turns);
  save.stats.bestTimeMs = Math.max(save.stats.bestTimeMs, timeMs);
  persist(save);
  return isNew;
}

/** Daily streak: +1 if the previous answer was yesterday (UTC), else reset to 1. */
export function recordDaily(save: SaveData, today: string, choice: number): void {
  if (save.daily.lastDate === today) return;
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const y = yesterday.toISOString().slice(0, 10);
  save.daily.streak = save.daily.lastDate === y ? save.daily.streak + 1 : 1;
  save.daily.lastDate = today;
  save.daily.lastChoice = choice;
  persist(save);
}
