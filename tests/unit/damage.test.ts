import { describe, expect, it } from 'vitest';
import { blastDamage, coinsFor, hitDamage, starsFor } from '../../src/core/damage';
import { WEAPONS } from '../../src/core/weapons';

describe('damage', () => {
  it('headshots hurt more than body shots, limbs less', () => {
    const v = WEAPONS.bow.speedMax * 0.75;
    const head = hitDamage(WEAPONS.bow, 'head', v);
    const torso = hitDamage(WEAPONS.bow, 'torso', v);
    const limb = hitDamage(WEAPONS.bow, 'limb', v);
    expect(torso).toBe(WEAPONS.bow.damage);
    expect(head).toBeGreaterThan(torso * 1.5);
    expect(limb).toBeLessThan(torso);
  });
  it('impact speed scales damage within limits', () => {
    const slow = hitDamage(WEAPONS.spear, 'torso', 1);
    const fast = hitDamage(WEAPONS.spear, 'torso', 999);
    expect(slow).toBe(Math.round(WEAPONS.spear.damage * 0.75));
    expect(fast).toBe(Math.round(WEAPONS.spear.damage * 1.25));
  });
  it('explosions fall off with distance', () => {
    const near = blastDamage(WEAPONS.bomb, 0);
    const mid = blastDamage(WEAPONS.bomb, 1.2);
    expect(near).toBe(WEAPONS.bomb.explode!.damage);
    expect(mid).toBeLessThan(near);
    expect(mid).toBeGreaterThan(0);
    expect(blastDamage(WEAPONS.bomb, 5)).toBe(0);
    expect(blastDamage(WEAPONS.bow, 0)).toBe(0);
  });
  it('stars: win, half HP, par shots', () => {
    expect(starsFor(false, 100, 100, 1, 4)).toBe(0);
    expect(starsFor(true, 10, 100, 9, 4)).toBe(1);
    expect(starsFor(true, 60, 100, 9, 4)).toBe(2);
    expect(starsFor(true, 60, 100, 4, 4)).toBe(3);
    expect(starsFor(true, 10, 100, 3, 4)).toBe(2);
  });
  it('coins reward stars and bosses; replays pay less', () => {
    expect(coinsFor(1, 1, 3, false, false)).toBeGreaterThan(coinsFor(1, 1, 1, false, false));
    expect(coinsFor(1, 10, 1, true, false)).toBeGreaterThan(coinsFor(1, 9, 3, false, false));
    expect(coinsFor(2, 3, 3, false, true)).toBeLessThan(coinsFor(2, 3, 3, false, false));
    expect(coinsFor(1, 1, 0, false, false)).toBeGreaterThan(0);
  });
});
