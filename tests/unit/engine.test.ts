import { describe, expect, it } from 'vitest';
import { Library, applyChoice, currentSituation, newRun, secondChance, undo, escalation } from '../../src/core/engine';
import { MAX_TURNS } from '../../src/core/endings';
import type { SituationDef } from '../../src/core/types';
import { SITUATIONS } from '../../src/data';

function sit(id: string, fx: SituationDef['choices'][number]['fx'], extra: Partial<SituationDef> = {}): SituationDef {
  return { id, topic: 't', serious: false, art: 'weird', requires: null, choices: [{ fx }, { fx: {} }], ...extra };
}

describe('meters', () => {
  it('start at 50 and apply scaled effects, clamped to 0..100', () => {
    const lib = new Library([sit('a', { money: 10, joy: -10 }), sit('b', {}), sit('c', {})]);
    const s0 = newRun(lib, 1);
    expect(s0.meters).toEqual({ money: 50, love: 50, joy: 50, rep: 50 });
    const first = currentSituation(lib, s0)!;
    const s1 = applyChoice(lib, s0, 0);
    const k = escalation(0);
    if (first.id === 'a') {
      expect(s1.meters.money).toBe(50 + Math.round(10 * k));
      expect(s1.meters.joy).toBe(50 - Math.round(10 * k));
    }
    expect(s1.turn).toBe(1);
    // state is immutable
    expect(s0.turn).toBe(0);
  });

  it('ends the run when a meter reaches 100 (and clamps)', () => {
    const big: SituationDef[] = Array.from({ length: 5 }, (_, i) => sit(`s${i}`, { money: 60 }));
    const lib = new Library(big);
    let s = newRun(lib, 3);
    s = applyChoice(lib, s, 0);
    expect(s.end).toBeNull();
    s = applyChoice(lib, s, 0);
    expect(s.meters.money).toBe(100);
    expect(s.end?.hit).toEqual({ meter: 'money', dir: 'high' });
    expect(() => applyChoice(lib, s, 0)).toThrow();
  });

  it('ends the run when a meter reaches 0', () => {
    const lib = new Library(Array.from({ length: 5 }, (_, i) => sit(`s${i}`, { rep: -70 })));
    const s = applyChoice(lib, newRun(lib, 9), 0);
    expect(s.meters.rep).toBe(0);
    expect(s.end?.hit).toEqual({ meter: 'rep', dir: 'low' });
  });

  it('ends with a survivor ending after MAX_TURNS', () => {
    const lib = new Library(Array.from({ length: 40 }, (_, i) => sit(`s${i}`, {})));
    let s = newRun(lib, 5);
    while (!s.end) s = applyChoice(lib, s, 1);
    expect(s.turn).toBe(MAX_TURNS);
    expect(s.end.hit).toBeUndefined();
    expect(s.end.ending).toBe('zen_master');
  });
});

describe('follow-up flags', () => {
  const lib = new Library([
    { id: 'trigger', topic: 't', serious: false, art: 'office', requires: null,
      choices: [{ fx: {}, sets: 'lied' }, { fx: {} }] },
    ...Array.from({ length: 10 }, (_, i) => sit(`f${i}`, {})),
    { id: 'follow', topic: 't', serious: false, art: 'office', requires: 'lied', choices: [{ fx: {} }, { fx: {} }] },
  ]);

  it('follow-up is never in the initial deck', () => {
    for (let seed = 0; seed < 50; seed++) expect(newRun(lib, seed).deck).not.toContain('follow');
  });

  it('setting the flag inserts the follow-up a few situations later', () => {
    for (let seed = 0; seed < 50; seed++) {
      let s = newRun(lib, seed);
      while (currentSituation(lib, s)?.id !== 'trigger') s = applyChoice(lib, s, 1);
      const pos = s.pos;
      s = applyChoice(lib, s, 0);
      expect(s.flags).toContain('lied');
      const idx = s.deck.indexOf('follow');
      expect(idx).toBeGreaterThan(pos);
      expect(idx).toBeLessThanOrEqual(pos + 5);
    }
  });

  it('not setting the flag never shows the follow-up', () => {
    let s = newRun(lib, 4);
    const seen: string[] = [];
    while (!s.end) {
      seen.push(currentSituation(lib, s)!.id);
      s = applyChoice(lib, s, 1);
    }
    expect(seen).not.toContain('follow');
  });
});

describe('undo and second chance', () => {
  const lib = new Library(Array.from({ length: 10 }, (_, i) => sit(`s${i}`, { joy: -60 })));

  it('undo restores the previous state once', () => {
    const s0 = applyChoice(lib, newRun(lib, 1), 1);
    const s1 = applyChoice(lib, s0, 0);
    const back = undo(s0, s1);
    expect(back.meters).toEqual(s0.meters);
    expect(back.pos).toBe(s0.pos);
    expect(back.usedUndo).toBe(true);
    const again = applyChoice(lib, back, 1);
    expect(() => undo(back, again)).toThrow();
  });

  it('second chance resets the broken meter and continues once', () => {
    let s = applyChoice(lib, newRun(lib, 2), 0);
    expect(s.end).toBeNull();
    s = applyChoice(lib, s, 0);
    expect(s.end?.hit?.meter).toBe('joy');
    const cont = secondChance(s);
    expect(cont.end).toBeNull();
    expect(cont.meters.joy).toBe(50);
    expect(cont.usedSecondChance).toBe(true);
    let s2 = applyChoice(lib, cont, 0);
    s2 = s2.end ? s2 : applyChoice(lib, s2, 0);
    expect(s2.end).not.toBeNull();
    expect(() => secondChance(s2)).toThrow();
  });
});

describe('real content', () => {
  it('every random full run ends within MAX_TURNS without repeating a situation', () => {
    const lib = new Library(SITUATIONS);
    for (let seed = 0; seed < 300; seed++) {
      let s = newRun(lib, seed);
      const seen = new Set<string>();
      while (!s.end) {
        const cur = currentSituation(lib, s)!;
        expect(seen.has(cur.id)).toBe(false);
        seen.add(cur.id);
        s = applyChoice(lib, s, (seed + s.turn) % cur.choices.length);
      }
      expect(s.turn).toBeLessThanOrEqual(MAX_TURNS);
    }
  });

  it('is deterministic for a given seed', () => {
    const lib = new Library(SITUATIONS);
    expect(newRun(lib, 42).deck).toEqual(newRun(lib, 42).deck);
    expect(newRun(lib, 42).deck).not.toEqual(newRun(lib, 43).deck);
  });
});
