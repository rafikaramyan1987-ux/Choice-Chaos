import { describe, expect, it } from 'vitest';
import { newProgress } from '../../src/core/game';
import {
  ACHIEVEMENTS,
  AD_CAPS,
  CHALLENGE_STARS,
  EXPANSIONS,
  GIFT_MS,
  LOGIN_REWARDS,
  addXp,
  cafeEffects,
  canUseAd,
  challengeAvailable,
  checkAchievements,
  claimGift,
  claimLogin,
  expansionStatus,
  fillMissions,
  finishBuild,
  finishChallenge,
  giftReady,
  guestOptions,
  levelUnlocks,
  loginDayIndex,
  newMeta,
  onServed,
  previousDate,
  rerollMission,
  settleBuilds,
  skipCost,
  startBuild,
  startDayMeta,
  useAd,
  xpToNext,
  type ServedInfo,
} from '../../src/core/meta';
import { RECIPES } from '../../src/core/recipes';
import { mulberry32 } from '../../src/core/rng';
import { emptySave, loadSave, persist } from '../../src/platform/save';

const served = (over: Partial<ServedInfo> = {}): ServedInfo => ({ recipes: ['latte'], sizes: ['M'], stars: 3, coins: 10, special: null, kind: 'bear', ...over });

describe('missions', () => {
  it('there are always exactly 3 active missions, all different, at most one hard one', () => {
    const meta = newMeta();
    const p = newProgress();
    const rng = mulberry32(1);
    fillMissions(meta, p, rng);
    expect(meta.missions).toHaveLength(3);
    for (let i = 0; i < 300; i++) {
      const r = p.recipes[i % p.recipes.length]!;
      onServed(meta, p, served({ stars: i % 5 ? 3 : 2, recipes: i % 4 ? [r] : [r, 'latte'], special: i % 6 ? null : 'vip', sizes: ['L'] }), rng);
      expect(meta.missions).toHaveLength(3);
      expect(new Set(meta.missions.map((m) => m.kind)).size).toBe(3);
      expect(meta.missions.filter((m) => ['perfect_streak', 'earn_today', 'vip'].includes(m.kind)).length).toBeLessThanOrEqual(1);
    }
    expect(meta.stats.missions).toBeGreaterThan(20);
  });
  it('completing a mission pays its reward and a new one appears', () => {
    const meta = newMeta();
    const p = newProgress();
    meta.missions = [{ id: 'x', kind: 'serve', target: 1, progress: 0, reward: { coins: 50, gems: 2, xp: 5 } }];
    const coins = p.coins;
    const events = onServed(meta, p, served(), mulberry32(2));
    expect(events.some((e) => e.source === 'mission' && e.id === 'x')).toBe(true);
    expect(p.coins).toBeGreaterThanOrEqual(coins + 50); // + new sticker coins; order coins are paid by the caller
    expect(p.gems).toBeGreaterThanOrEqual(2);
    expect(meta.missions.map((m) => m.id)).not.toContain('x');
    expect(meta.missions).toHaveLength(3);
  });
  it('tracks streaks, coins today, specials, large drinks', () => {
    const meta = newMeta();
    const p = newProgress();
    meta.missions = [
      { id: 'a', kind: 'perfect_streak', target: 3, progress: 0, reward: {} },
      { id: 'b', kind: 'earn_today', target: 1000, progress: 0, reward: {} },
      { id: 'c', kind: 'large', target: 9, progress: 0, reward: {} },
    ];
    const rng = mulberry32(3);
    onServed(meta, p, served({ coins: 30, sizes: ['L'] }), rng);
    onServed(meta, p, served({ coins: 20, stars: 2, sizes: ['L', 'S'] }), rng);
    const get = (id: string) => meta.missions.find((m) => m.id === id)!;
    expect(get('a').progress).toBe(1); // streak broken at 2★
    expect(get('b').progress).toBe(50);
    expect(get('c').progress).toBe(2);
    startDayMeta(meta);
    expect(get('b').progress).toBe(0);
  });
  it('reroll costs a gem', () => {
    const meta = newMeta();
    const p = newProgress();
    const rng = mulberry32(4);
    fillMissions(meta, p, rng);
    const id = meta.missions[0]!.id;
    expect(rerollMission(meta, p, id, rng)).toBe(false);
    p.gems = 1;
    expect(rerollMission(meta, p, id, rng)).toBe(true);
    expect(p.gems).toBe(0);
    expect(meta.missions.map((m) => m.id)).not.toContain(id);
  });
});

describe('level & XP', () => {
  it('every order gives XP; level-ups give a chest and unlocks', () => {
    const meta = newMeta();
    const p = newProgress();
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
    const events = addXp(meta, p, xpToNext(1) + xpToNext(2));
    expect(meta.level).toBe(3);
    expect(events.map((e) => e.id)).toEqual(['2', '3']);
    expect(p.coins).toBeGreaterThan(0);
    expect(p.gems).toBeGreaterThan(0);
    expect(p.recipes).toContain('cake'); // level 2 recipe granted
    expect(events[1]!.unlocks!.some((u) => u.type === 'customer' && u.id === 'vip')).toBe(true);
  });
  it('every level up to 13 unlocks something new', () => {
    for (let l = 2; l <= 13; l++) expect(levelUnlocks(l).length, `level ${l}`).toBeGreaterThan(0);
    for (const r of RECIPES) if (r.level > 1) expect(levelUnlocks(r.level).some((u) => u.type === 'recipe' && u.id === r.id)).toBe(true);
  });
  it('special guests and new customer types come with levels', () => {
    const meta = newMeta();
    expect(guestOptions(meta).vip).toBe(0);
    expect(guestOptions(meta).kinds).not.toContain('fox');
    meta.level = 9;
    const g = guestOptions(meta, 'vip');
    expect(g.vip).toBeGreaterThan(0);
    expect(g.critic).toBeGreaterThan(0);
    expect(g.celebrity).toBeGreaterThan(0);
    expect(g.celebrity).toBeLessThan(0.05); // rare
    expect(g.kinds).toEqual(expect.arrayContaining(['fox', 'panda', 'frog']));
    expect(g.first).toBe('vip');
  });
});

describe('stickers & achievements', () => {
  it('first guest of a kind gives a sticker', () => {
    const meta = newMeta();
    const p = newProgress();
    const rng = mulberry32(5);
    const e1 = onServed(meta, p, served({ kind: 'fox', special: 'vip' }), rng);
    expect(e1.filter((e) => e.source === 'sticker').map((e) => e.id).sort()).toEqual(['fox', 'vip']);
    const e2 = onServed(meta, p, served({ kind: 'fox' }), rng);
    expect(e2.some((e) => e.source === 'sticker')).toBe(false);
    expect(meta.stickers.fox).toBe(2);
  });
  it('achievements give gems once', () => {
    const meta = newMeta();
    const p = newProgress();
    meta.stats.perfect = 100;
    const ev = checkAchievements(meta, p);
    expect(ev.map((e) => e.id)).toEqual(expect.arrayContaining(['perfect_25', 'perfect_100']));
    expect(p.gems).toBe(ACHIEVEMENTS.filter((a) => ev.some((e) => e.id === a.id)).reduce((n, a) => n + a.gems, 0));
    expect(checkAchievements(meta, p)).toEqual([]);
  });
});

describe('daily login & gift box & challenge', () => {
  it('7-day calendar, bigger on day 7, resets after a missed day', () => {
    const meta = newMeta();
    const p = newProgress();
    let day = '2026-11-01';
    const next = (d: string) => {
      const x = new Date(`${d}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + 1);
      return x.toISOString().slice(0, 10);
    };
    for (let i = 1; i <= 8; i++) {
      expect(loginDayIndex(meta, day)).toBe(((i - 1) % 7) + 1);
      const ev = claimLogin(meta, p, day)!;
      expect(ev.reward).toEqual({ coins: LOGIN_REWARDS[(i - 1) % 7]!.coins ?? 0, gems: LOGIN_REWARDS[(i - 1) % 7]!.gems ?? 0 });
      expect(claimLogin(meta, p, day)).toBeNull(); // once a day
      day = next(day);
    }
    expect(meta.stats.bestLoginStreak).toBe(8);
    expect((LOGIN_REWARDS[6]!.gems ?? 0)).toBeGreaterThan(LOGIN_REWARDS.slice(0, 6).reduce((n, r) => Math.max(n, r.gems ?? 0), 0));
    day = next(day); // missed one day
    claimLogin(meta, p, day);
    expect(meta.login.streak).toBe(1);
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
  });
  it('x2 login with the rewarded video', () => {
    const meta = newMeta();
    const p = newProgress();
    expect(claimLogin(meta, p, '2026-11-01', 2)!.reward.coins).toBe((LOGIN_REWARDS[0]!.coins ?? 0) * 2);
  });
  it('gift box every 15 minutes, ×2 possible', () => {
    const meta = newMeta();
    const p = newProgress();
    const rng = mulberry32(1);
    expect(giftReady(meta, 0)).toBe(true);
    const a = claimGift(meta, p, 1000, rng, 2)!;
    expect(a.reward.coins).toBeGreaterThan(0);
    expect(claimGift(meta, p, 1000 + GIFT_MS - 1, rng)).toBeNull();
    expect(claimGift(meta, p, 1000 + GIFT_MS, rng)).not.toBeNull();
  });
  it('daily challenge pays once a day when the star goal is reached', () => {
    const meta = newMeta();
    const p = newProgress();
    expect(finishChallenge(meta, p, '2026-11-01', CHALLENGE_STARS - 1)).toEqual([]);
    expect(challengeAvailable(meta, '2026-11-01')).toBe(true);
    const ev = finishChallenge(meta, p, '2026-11-01', CHALLENGE_STARS);
    expect(ev[0]!.source).toBe('challenge');
    expect(p.gems).toBeGreaterThan(0);
    expect(challengeAvailable(meta, '2026-11-01')).toBe(false);
    expect(finishChallenge(meta, p, '2026-11-01', 24)).toEqual([]);
  });
});

describe('café expansion', () => {
  it('needs the level, costs coins/gems, takes time, can be finished early', () => {
    const meta = newMeta();
    const p = newProgress();
    const t0 = 1_000_000;
    expect(expansionStatus(meta, p, 'tables1', t0)).toBe('locked');
    meta.level = 4;
    expect(expansionStatus(meta, p, 'tables1', t0)).toBe('short');
    p.coins = 1000;
    expect(startBuild(meta, p, 'tables1', t0)).toBe(true);
    expect(p.coins).toBe(1000 - EXPANSIONS[0]!.coins);
    expect(expansionStatus(meta, p, 'tables1', t0 + 1000)).toBe('building');
    expect(cafeEffects(meta, t0 + 1000).extraGuests).toBe(0);
    expect(skipCost(meta, 'tables1', t0)).toBeGreaterThan(0);
    expect(finishBuild(meta, p, 'tables1', t0 + 1000, true)).toBe(false); // no gems
    expect(finishBuild(meta, p, 'tables1', t0 + 1000, false)).toBe(true); // rewarded video
    expect(cafeEffects(meta, t0 + 1000).extraGuests).toBe(1);
    const ev = settleBuilds(meta, p, t0 + 1000);
    expect(ev.some((e) => e.source === 'build' && e.id === 'tables1')).toBe(true);
    expect(settleBuilds(meta, p, t0 + 2000).some((e) => e.source === 'build')).toBe(false);
  });
  it('staff needs the second counter; winter theme costs gems', () => {
    const meta = newMeta();
    const p = newProgress();
    meta.level = 20;
    p.coins = 100_000;
    p.gems = 0;
    expect(expansionStatus(meta, p, 'barista', 0)).toBe('locked');
    expect(expansionStatus(meta, p, 'winter', 0)).toBe('short');
    p.gems = 100;
    expect(startBuild(meta, p, 'counter2', 0)).toBe(true);
    expect(startBuild(meta, p, 'barista', 10 * 60_000)).toBe(true);
    expect(startBuild(meta, p, 'winter', 10 * 60_000)).toBe(true);
    const fx = cafeEffects(meta, 10 * 60_000);
    expect(fx.staff).toEqual(expect.arrayContaining(['coffee', 'juice']));
    expect(fx.winter).toBe(true);
  });
});

describe('rewarded ad caps', () => {
  it('per-day caps reset the next day', () => {
    const meta = newMeta();
    for (let i = 0; i < AD_CAPS.redo; i++) {
      expect(canUseAd(meta, 'redo', 'd1')).toBe(true);
      useAd(meta, 'redo', 'd1');
    }
    expect(canUseAd(meta, 'redo', 'd1')).toBe(false);
    expect(canUseAd(meta, 'redo', 'd2')).toBe(true);
  });
});

describe('meta save', () => {
  it('round-trips and sanitizes', () => {
    const s = emptySave();
    const rng = mulberry32(9);
    fillMissions(s.meta, s.progress, rng);
    onServed(s.meta, s.progress, served({ kind: 'panda' }), rng);
    s.meta.built.tables1 = 123;
    s.meta.built['nope'] = 5;
    s.progress.gems = 7;
    persist(s);
    const back = loadSave();
    expect(back.meta.missions).toEqual(s.meta.missions);
    expect(back.meta.stickers.panda).toBe(1);
    expect(back.meta.built).toEqual({ tables1: 123 });
    expect(back.progress.gems).toBe(7);
  });
});

describe('daily challenge run', () => {
  it('always has the full number of guests', async () => {
    const { DayRun } = await import('../../src/core/game');
    const { CHALLENGE_GUESTS, challengeSeed } = await import('../../src/core/meta');
    const run = new DayRun(1, ['latte', 'juice'], mulberry32(challengeSeed('2026-11-05')), undefined, undefined, 0, CHALLENGE_GUESTS);
    expect(run.orders).toHaveLength(CHALLENGE_GUESTS);
  });
});
