import { describe, expect, it } from 'vitest';
import { applyError, chooseWeapon, errorSigma, evaluate, solveAim } from '../../src/core/ai';
import { Rng } from '../../src/core/rng';
import { WEAPONS } from '../../src/core/weapons';

const from = { x: 12, y: -1.4 };
const target = { x: 0, y: -1.2 };

describe('AI aiming', () => {
  it('finds a shot that hits a target on flat ground', () => {
    const sol = solveAim({ from, target, weapon: WEAPONS.bow, wind: 0 });
    expect(sol.miss).toBeLessThan(0.2);
    expect(Math.cos(sol.angle)).toBeLessThan(0); // shoots to the left
  });

  it('compensates for wind and height differences', () => {
    for (const wind of [-3, 2.5]) {
      const sol = solveAim({ from: { x: 15, y: -6 }, target, weapon: WEAPONS.bow, wind });
      expect(sol.miss).toBeLessThan(0.25);
    }
  });

  it('works for every weapon', () => {
    for (const w of Object.values(WEAPONS)) {
      const sol = solveAim({ from, target, weapon: w, wind: 0 });
      expect(sol.miss, w.id).toBeLessThan(0.4);
    }
  });

  it('goes around obstacles', () => {
    // a wall between the fighters, up to y = -4
    const wallX = 6;
    const blocked = (ax: number, _ay: number, bx: number, by: number) => (ax - wallX) * (bx - wallX) <= 0 && by > -4;
    const sol = solveAim({ from, target, weapon: WEAPONS.bow, wind: 0, blocked });
    expect(sol.miss).toBeLessThan(0.3);
    expect(evaluate({ from, target, weapon: WEAPONS.bow, wind: 0, blocked }, sol.angle, sol.speed)).toBeLessThan(0.3);
  });

  it('is less accurate at low skill, and never perfect', () => {
    const sol = solveAim({ from, target, weapon: WEAPONS.bow, wind: 0 });
    const meanMiss = (skill: number) => {
      const rng = new Rng(42);
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const s = applyError(sol, WEAPONS.bow, skill, rng);
        sum += evaluate({ from, target, weapon: WEAPONS.bow, wind: 0 }, s.angle, s.speed);
      }
      return sum / 200;
    };
    const easy = meanMiss(0.1);
    const mid = meanMiss(0.5);
    const hard = meanMiss(0.92);
    expect(easy).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(0.05);
    expect(errorSigma(1).angle).toBeGreaterThan(0);
    const s = applyError(sol, WEAPONS.bow, 1, new Rng(1));
    expect(s.angle).not.toBe(sol.angle);
  });

  it('sometimes switches weapon, prefers bombs against cover', () => {
    const rng = new Rng(3);
    const picks = new Set<string>();
    for (let i = 0; i < 100; i++) picks.add(chooseWeapon(['bow', 'axe', 'bomb'], 'bow', 0.5, rng, false));
    expect(picks.size).toBeGreaterThan(1);
    let bombs = 0;
    for (let i = 0; i < 100; i++) if (chooseWeapon(['bow', 'bomb'], 'bow', 0.9, rng, true) === 'bomb') bombs++;
    expect(bombs).toBeGreaterThan(60);
    expect(chooseWeapon(['bow'], 'axe', 0.5, rng, false)).toBe('bow');
  });
});
