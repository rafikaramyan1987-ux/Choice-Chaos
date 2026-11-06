import { readJSON, writeJSON } from '../platform/storage';
import { SAVE_KEY, sanitize, type SaveData } from './progress';

/** Loads the save from the active storage (CrazyGames data module or localStorage). */
export function loadSave(): SaveData {
  return sanitize(readJSON<unknown>(SAVE_KEY, null));
}

export function writeSave(s: SaveData): void {
  writeJSON(SAVE_KEY, s);
}
