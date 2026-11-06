import { describe, expect, it } from 'vitest';
import { Duel, type DuelEvent, type FighterSetup } from '../../src/game/duel';
import { generateLevel } from '../../src/game/levels';

const hero = (ai: boolean): FighterSetup => ({ look: 'hero', hat: 'none', color: 'blue', weapons: ['bow'], weapon: 'bow', hp: 100, ai });

function play(duel: Duel, maxSeconds: number, events: DuelEvent[]) {
  duel.on((e) => events.push(e));
  duel.start();
  for (let t = 0; t < maxSeconds && duel.phase !== 'over'; t += 1 / 60) {
    if (duel.humanAiming) {
      const s = duel.autoShot();
      if (s) {
        duel.setAim(s.angle, s.power);
        duel.fire();
      }
    }
    duel.update(1 / 60);
  }
}

describe('duel', () => {
  it('a perfect first shot hits the enemy on level 1', () => {
    const L = generateLevel(1, 1);
    const duel = new Duel(L, { mode: 'adventure', left: hero(false), right: { ...hero(true), look: 'ranger', hp: L.enemy.hp } });
    const events: DuelEvent[] = [];
    duel.on((e) => events.push(e));
    duel.start();
    const s = duel.autoShot()!;
    duel.setAim(s.angle, s.power);
    expect(duel.fire()).toBe(true);
    for (let i = 0; i < 400 && duel.phase === 'flight'; i++) duel.update(1 / 60);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit, JSON.stringify(events.map((e) => e.type))).toBeTruthy();
    expect(duel.fighters[1].hp).toBeLessThan(L.enemy.hp);
  });

  for (const w of [1, 2, 3, 4, 5, 6]) {
    for (const lvl of [1, 10]) {
      it(`world ${w} level ${lvl}: a duel ends with a winner`, { timeout: 30000 }, () => {
        const L = generateLevel(w, lvl);
        const duel = new Duel(L, {
          mode: 'adventure',
          left: { ...hero(false), weapons: ['bow', 'spear'], weapon: 'spear' },
          right: { ...hero(true), look: L.world.enemy, hp: L.enemy.hp, weapons: L.enemy.weapons, weapon: L.enemy.weapons[0]!, scale: L.enemy.scale },
        });
        const events: DuelEvent[] = [];
        play(duel, 400, events);
        console.info(w, lvl, duel.turnNumber, duel.fighters.map((f) => `${f.hp} ${f.shots}/${f.hits}`).join(" | "));
        expect(duel.phase, `turns ${duel.turnNumber} hp ${duel.fighters.map((f) => f.hp)}`).toBe('over');
        expect(duel.winner).not.toBeNull();
        expect(events.some((e) => e.type === 'hit')).toBe(true);
      });
    }
  }
});

describe('gentle first levels', () => {
  it('the AI misses its first shot and never headshots on levels 1-1 to 1-3', { timeout: 60_000 }, () => {
    for (const lvl of [1, 2, 3]) {
      for (let seed = 1; seed <= 6; seed++) {
        const L = generateLevel(1, lvl);
        const duel = new Duel(L, { mode: 'adventure', left: { ...hero(false), hp: 999 }, right: { ...hero(true), look: 'ranger', hp: 999 }, seed });
        const hits: DuelEvent[] = [];
        let aiShots = 0;
        let firstHit = false;
        duel.on((e) => {
          if (e.type === 'fire' && e.side === 1) aiShots++;
          if (e.type === 'hit' && e.side === 0) {
            hits.push(e);
            if (aiShots === 1) firstHit = true;
          }
        });
        duel.start();
        // the player fires harmless shots straight up so the AI keeps getting turns
        for (let t = 0; t < 90 && aiShots < 6; t += 1 / 60) {
          if (duel.humanAiming) {
            duel.setAim(-Math.PI / 2 + 0.3, 0.1);
            duel.fire();
          }
          duel.update(1 / 60);
        }
        expect(aiShots).toBeGreaterThanOrEqual(3);
        expect(firstHit, `1-${lvl} seed ${seed}`).toBe(false);
        expect(hits.filter((e) => e.type === 'hit' && e.zone === 'head')).toEqual([]);
      }
    }
  });
});
