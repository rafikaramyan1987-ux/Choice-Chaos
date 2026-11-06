import { describe, expect, it } from 'vitest';
import { segShape } from '../../src/core/geometry';
import { difficulty, generateLevel, playable } from '../../src/game/levels';
import { LEVELS_PER_WORLD, WORLDS } from '../../src/game/worlds';

const all = WORLDS.flatMap((w) => Array.from({ length: LEVELS_PER_WORLD }, (_, i) => generateLevel(w.index, i + 1)));

describe('levels', () => {
  it('60 levels, the 10th of each world is a boss', () => {
    expect(all).toHaveLength(60);
    for (const L of all) expect(L.boss).toBe(L.level === 10);
    for (const L of all.filter((l) => l.boss)) {
      expect(L.enemy.hp).toBeGreaterThan(120);
      expect(L.enemy.scale).toBeGreaterThan(1.2);
      expect(L.enemy.weapons).toEqual([L.world.boss.weapon]);
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(3, 4))).toBe(JSON.stringify(generateLevel(3, 4)));
  });

  it('both fighters stand on solid ground', () => {
    for (const L of all) {
      for (const spot of [L.playerSpot, L.enemySpot]) {
        const under = L.solids.some((s) => s.role === 'platform' && segShape(spot.x, spot.y - 0.2, spot.x, spot.y + 0.3, s.shape));
        expect(under, `${L.key} ${JSON.stringify(spot)}`).toBe(true);
      }
    }
  });

  it('every level has a clear shot lane for both sides', () => {
    for (const L of all) expect(playable(L), L.key).toBe(true);
  });

  it('difficulty rises smoothly: distance, AI skill, enemy HP', () => {
    expect(difficulty(1, 1)).toBe(0);
    expect(difficulty(6, 10)).toBe(1);
    const avg = (w: number, f: (L: (typeof all)[number]) => number) => {
      const ls = all.filter((l) => l.world.index === w && !l.boss);
      return ls.reduce((a, l) => a + f(l), 0) / ls.length;
    };
    for (let w = 2; w <= 6; w++) {
      expect(avg(w, (l) => l.enemySpot.x)).toBeGreaterThan(avg(w - 1, (l) => l.enemySpot.x) - 0.5);
      expect(avg(w, (l) => l.skill)).toBeGreaterThan(avg(w - 1, (l) => l.skill));
      expect(avg(w, (l) => l.enemy.hp)).toBeGreaterThan(avg(w - 1, (l) => l.enemy.hp));
    }
    for (const L of all) expect(L.skill).toBeLessThan(0.85);
  });

  it('wind: calm forest, gusty mountains and desert', () => {
    expect(all.filter((l) => l.world.id === 'forest' && l.level <= 3).every((l) => l.wind.base === 0)).toBe(true);
    for (const id of ['mountains', 'desert'] as const) expect(all.filter((l) => l.world.id === id).every((l) => l.wind.gust > 0.5)).toBe(true);
  });

  it('ice is slippery and volcano platforms crumble', () => {
    expect(all.filter((l) => l.world.id === 'snow').every((l) => l.friction < 0.1)).toBe(true);
    expect(all.filter((l) => l.world.id === 'volcano').every((l) => l.solids.some((s) => s.crumble))).toBe(true);
  });
});
