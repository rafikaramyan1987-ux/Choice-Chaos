import { describe, expect, it } from 'vitest';
import { launch, previewDots, pullToAim, simulate, step, GRAVITY } from '../../src/core/trajectory';
import { WEAPONS } from '../../src/core/weapons';

describe('trajectory', () => {
  it('pulling back fires the opposite way with power from the pull length', () => {
    const a = pullToAim(-100, 100, 200, WEAPONS.bow);
    expect(a.angle).toBeCloseTo(-Math.PI / 4, 5); // up and to the right (y down)
    expect(a.power).toBeCloseTo(Math.hypot(100, 100) / 200, 5);
    expect(pullToAim(-500, 0, 200, WEAPONS.bow).power).toBe(1);
    expect(pullToAim(-500, 0, 200, WEAPONS.bow).speed).toBe(WEAPONS.bow.speedMax);
  });

  it('matches the analytic range of a drag-free projectile', () => {
    const w = { ...WEAPONS.bow, drag: 0 };
    const v0 = 15;
    const f = launch({ x: 0, y: 0 }, -Math.PI / 4, v0);
    const r = simulate(f, w, { wind: 0 }, { stop: (_ax, _ay, _bx, by, t) => t > 0.1 && by >= 0 });
    expect(r.end.x).toBeCloseTo((v0 * v0) / GRAVITY, 0);
  });

  it('wind pushes the projectile sideways', () => {
    const f1 = launch({ x: 0, y: 0 }, -0.6, 15);
    const f2 = { ...f1 };
    for (let i = 0; i < 240; i++) {
      step(f1, WEAPONS.bow, { wind: 0 }, 1 / 240);
      step(f2, WEAPONS.bow, { wind: 3 }, 1 / 240);
    }
    expect(f2.x - f1.x).toBeGreaterThan(1.2);
    // the spear is heavy: wind barely moves it
    const s1 = launch({ x: 0, y: 0 }, -0.6, 15);
    const s2 = { ...s1 };
    for (let i = 0; i < 240; i++) {
      step(s1, WEAPONS.spear, { wind: 0 }, 1 / 240);
      step(s2, WEAPONS.spear, { wind: 3 }, 1 / 240);
    }
    expect(s2.x - s1.x).toBeLessThan((f2.x - f1.x) / 2);
  });

  it('boomerangs come back', () => {
    const f = launch({ x: 0, y: 0 }, -0.2, 18);
    let maxX = 0;
    for (let i = 0; i < 240 * 5; i++) {
      step(f, WEAPONS.boomerang, { wind: 0 }, 1 / 240);
      maxX = Math.max(maxX, f.x);
    }
    expect(maxX).toBeGreaterThan(15);
    expect(f.x).toBeLessThan(maxX - 8);
  });

  it('preview dots follow the real flight', () => {
    const dots = previewDots({ x: 0, y: 0 }, -0.5, 16, WEAPONS.bow, 0.5);
    expect(dots.length).toBe(10);
    const f = launch({ x: 0, y: 0 }, -0.5, 16);
    while (f.t < 0.5 - 1e-9) step(f, WEAPONS.bow, { wind: 0 }, 1 / 240);
    const last = dots[dots.length - 1]!;
    expect(Math.hypot(last.x - f.x, last.y - f.y)).toBeLessThan(0.2);
  });
});

describe('makeBlocker', () => {
  it('matches the exact shape test', async () => {
    const { makeBlocker, segShape, rect } = await import('../../src/core/geometry');
    const shapes = [
      { kind: 'poly' as const, pts: rect(2, -3, 3, 1) },
      { kind: 'circle' as const, c: { x: 6, y: -1 }, r: 0.5 },
    ];
    const blocked = makeBlocker(shapes);
    const segs: Array<[number, number, number, number]> = [
      [0, 0, 5, 0], [0, -4, 5, -4], [5, -1, 7, -1], [5, -2, 7, -2], [2.5, -5, 2.5, 5], [10, 0, 11, 0],
    ];
    for (const [ax, ay, bx, by] of segs) {
      expect(blocked(ax, ay, bx, by)).toBe(shapes.some((s) => !!segShape(ax, ay, bx, by, s)));
    }
  });
});
